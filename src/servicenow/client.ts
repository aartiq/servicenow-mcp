import type {
  AuthMode,
  ServiceNowConfig,
  QueryRecordsParams,
  QueryRecordsResponse,
  OAuthTokenResponse,
  ServiceNowApiResponse,
  ServiceNowRecord,
} from './types.js';
import { ServiceNowError } from '../utils/errors.js';
import { logger } from '../utils/logging.js';
import { missingRequiredFields } from './mandatory-fields.js';

/**
 * Actionable checklist appended to a 401 on Basic auth. A raw "User is not
 * authenticated" sends people down a multi-hour rabbit hole; these are the real
 * causes, in likelihood order, distilled from field debugging + ServiceNow's own
 * Basic Auth guidance.
 */
export function basicAuthDiagnostic(): string {
  return [
    'Basic auth was rejected by the instance (HTTP 401). Common causes, in order:',
    '  1. Username must be the login user_name, not the email or display name.',
    '  2. The account needs a valid LOCAL password. If it is SSO/SAML-federated, browser login works',
    '     but Basic REST does not (no local password). Use a dedicated local integration user.',
    '  3. ServiceNow\'s "Basic Auth Restriction" may be blocking Basic auth. The account needs the',
    '     snc_basic_auth_api_access role, or must be a Web Service Access Only (WSAO) account.',
    '  4. A corporate proxy may be stripping the Authorization header (the request then arrives as',
    '     "guest"). Test the same call from a different network / phone hotspot.',
    '  5. Confirm the account is active, not locked out, and not flagged password-reset-required.',
    '  6. If the instance restricts Basic auth, switch this connection to OAuth (the recommended path).',
    '  Docs: https://www.servicenow.com/community/itsm-articles/review-basic-authentication-account-security/ta-p/3555125',
  ].join('\n');
}

/**
 * Actionable checklist appended to a 403. The request authenticated but was not
 * authorized — for OAuth this is almost always a missing scope/role on the token.
 */
export function forbiddenDiagnostic(authMethod: 'basic' | 'oauth'): string {
  const lines = [
    'Authenticated, but not authorized (HTTP 403). If ServiceNow returned a specific reason above',
    '(e.g. a "Data Policy Exception" or an ACL detail), that IS the actual cause — read it first.',
    'Otherwise, common causes are:',
    '  1. A data policy or field-level ACL is rejecting a field in the request (e.g. a conditionally',
    '     mandatory or read-only field). This can fail some requests and succeed on others depending on',
    '     the exact fields sent, even for the same user.',
    '  2. The account is missing a role this needs (e.g. itil for ITSM, admin for config tables).',
  ];
  if (authMethod === 'oauth') {
    lines.push(
      '  3. Your OAuth app/token is missing API scope. In the OAuth application registry, grant the',
      '     required scope (e.g. "useraccount"), and make sure the token\'s user actually holds the roles.',
    );
  }
  lines.push(
    '  4. Writes need WRITE_ENABLED=true AND the user\'s write roles; some tools also need scripting/CMDB/ATF flags.',
  );
  return lines.join('\n');
}

// ─── Input validation helpers ────────────────────────────────────────────────

/** Best-effort MIME type from a file extension, for attachments fetched without a content type. */
function guessContentType(fileName: string): string {
  const ext = (fileName.split('.').pop() || '').toLowerCase();
  const map: Record<string, string> = {
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ppt: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    csv: 'text/csv',
    txt: 'text/plain',
    json: 'application/json',
    xml: 'application/xml',
    html: 'text/html',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    zip: 'application/zip',
  };
  return map[ext] || 'application/octet-stream';
}

/** Validate and sanitize ServiceNow table names (alphanumeric + underscores only) */
function validateTableName(table: string): string {
  if (!table || !/^[a-zA-Z][a-zA-Z0-9_]*$/.test(table)) {
    throw new ServiceNowError(`Invalid table name: "${table}". Must contain only letters, numbers, and underscores.`, 'VALIDATION_ERROR');
  }
  return table;
}

/** Validate ServiceNow sys_id format (32-char hex string) */
function validateSysId(sysId: string): string {
  if (!sysId || !/^[0-9a-f]{32}$/i.test(sysId)) {
    throw new ServiceNowError(`Invalid sys_id: "${sysId}". Must be a 32-character hex string.`, 'VALIDATION_ERROR');
  }
  return sysId;
}

/** Allowlist of safe GlideSystem functions permitted in javascript: query expressions */
const SAFE_GS_PATTERN = /^javascript:gs\.(getUserID|beginningOfToday|endOfToday|beginningOfYesterday|endOfYesterday|beginningOfLastMonth|endOfLastMonth|beginningOfThisMonth|endOfThisMonth|beginningOfThisQuarter|endOfThisQuarter|beginningOfThisYear|endOfThisYear|beginningOfNextMonth|endOfNextMonth|beginningOfLast7Days|endOfLast7Days|beginningOfLastYear|endOfLastYear|daysAgo|hoursAgo|minutesAgo|monthsAgo|quartersAgo|yearsAgo|now|dateGenerate)\([\d,\s'":-]*\)$/i;

/** Validate and sanitize ServiceNow encoded query strings */
export function validateQuery(query: string): string {
  if (!query) return query;
  // Validate javascript: expressions against safe GlideSystem function allowlist
  const jsMatches = query.match(/javascript:[^@^]*/gi);
  if (jsMatches) {
    for (const match of jsMatches) {
      if (!SAFE_GS_PATTERN.test(match.trim())) {
        throw new ServiceNowError(
          `Query contains unsafe JavaScript expression: "${match.substring(0, 60)}…". Only standard GlideSystem date/user functions are allowed.`,
          'VALIDATION_ERROR'
        );
      }
    }
  }
  // Enforce max query length
  if (query.length > 4096) {
    throw new ServiceNowError('Query string exceeds maximum length of 4096 characters.', 'VALIDATION_ERROR');
  }
  return query;
}

export class ServiceNowClient {
  private baseUrl: string;
  private authMethod: 'oauth' | 'basic';
  private authMode: AuthMode;
  private oauthConfig?: ServiceNowConfig['oauth'];
  private basicConfig?: ServiceNowConfig['basic'];
  private maxRetries: number;
  private retryDelayMs: number;
  private requestTimeoutMs: number;

  /** For impersonation mode: user sys_id to pass in X-Sn-Impersonate */
  private impersonateUserSysId?: string;
  /** For per-user mode: pre-loaded token overrides service-account auth */
  private perUserBearerToken?: string;
  /** Local per-user OAuth only: refresh token + expiry + persist callback (unset for the gateway). */
  private perUserRefreshToken?: string;
  private perUserTokenExpiry?: number;
  private onTokenRefreshed?: ServiceNowConfig['onTokenRefreshed'];

  private accessToken?: string;
  private tokenExpiry?: number;

  constructor(config: ServiceNowConfig) {
    this.baseUrl = config.instanceUrl.replace(/\/$/, ''); // Remove trailing slash
    this.authMethod = config.authMethod;
    this.authMode = config.authMode || 'service-account';
    this.oauthConfig = config.oauth;
    this.basicConfig = config.basic;
    this.maxRetries = config.maxRetries || 3;
    this.retryDelayMs = config.retryDelayMs || 1000;
    this.requestTimeoutMs = config.requestTimeoutMs || 30000;
    this.impersonateUserSysId = config.impersonateUserSysId;
    this.perUserBearerToken = config.perUserBearerToken;
    this.perUserRefreshToken = config.perUserRefreshToken;
    this.perUserTokenExpiry = config.perUserTokenExpiry;
    this.onTokenRefreshed = config.onTokenRefreshed;
  }

  /**
   * True only for LOCAL per-user OAuth that owns a refresh token + client id (i.e. can renew its
   * own token). The multi-tenant gateway's per-user mode has no refresh token, so this is false
   * there and the injected token is used as-is — the gateway path is unchanged.
   */
  private hasPerUserRefresh(): boolean {
    return this.authMode === 'per-user' && !!this.perUserRefreshToken && !!this.oauthConfig?.clientId;
  }

  /** Renew the per-user access token using the stored refresh token (refresh_token grant). */
  private async refreshPerUserToken(): Promise<void> {
    if (!this.perUserRefreshToken || !this.oauthConfig?.clientId) {
      throw new ServiceNowError('Cannot refresh: no refresh token or OAuth client configured', 'AUTHENTICATION_FAILED');
    }
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: this.oauthConfig.clientId,
      refresh_token: this.perUserRefreshToken,
    });
    // Confidential clients send the secret; public (PKCE) clients omit it.
    if (this.oauthConfig.clientSecret) body.set('client_secret', this.oauthConfig.clientSecret);
    const resp = await fetch(`${this.baseUrl}/oauth_token.do`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    if (!resp.ok) {
      throw new ServiceNowError(`OAuth token refresh failed: ${resp.status} ${resp.statusText}`, 'AUTHENTICATION_FAILED');
    }
    const data = await resp.json() as { access_token: string; refresh_token?: string; expires_in?: number };
    this.perUserBearerToken = data.access_token;
    if (data.refresh_token) this.perUserRefreshToken = data.refresh_token; // honour rotation
    const expiresAt = Date.now() + (data.expires_in ? data.expires_in * 1000 * 0.9 : 25 * 60 * 1000);
    this.perUserTokenExpiry = expiresAt;
    try {
      this.onTokenRefreshed?.({ accessToken: this.perUserBearerToken!, refreshToken: this.perUserRefreshToken!, expiresAt });
    } catch { /* persistence is best-effort; never fail the request over it */ }
  }

  /**
   * The ServiceNow instance host this client targets (e.g. "acme.service-now.com").
   * Used to scope per-instance caches so tenants never share discovered schema.
   */
  get instanceHost(): string {
    try { return new URL(this.baseUrl).host.toLowerCase(); } catch { return this.baseUrl.toLowerCase(); }
  }

  /** Public accessor for the resolved instance base URL (no trailing slash), for building UI links. */
  get instanceUrl(): string {
    return this.baseUrl;
  }

  /** Human-facing record URL (opens the form in ServiceNow), not the /api/now REST link. */
  recordUrl(table: string, sysId: string): string {
    return `${this.baseUrl}/${encodeURIComponent(table)}.do?sys_id=${encodeURIComponent(sysId)}`;
  }

  /**
   * Return the fields that ServiceNow Data Policies make mandatory on a table, so an agent can
   * collect them BEFORE a create/update and avoid the "Data Policy Exception: mandatory fields"
   * error. Reads sys_data_policy_rule (the mandatory rules) and sys_data_policy2 (the condition
   * under which each applies). All server-side, read-only.
   */
  async getMandatoryFields(table: string): Promise<any> {
    const t = validateTableName(table);
    const rules = await this.queryRecords({
      table: 'sys_data_policy_rule',
      query: `table=${t}^mandatory=true`,
      fields: 'field,sys_data_policy',
      limit: 100,
    });
    const rows: any[] = (rules as any).records ?? rules ?? [];
    // Resolve the parent policy conditions once.
    const policyIds = Array.from(new Set(rows.map((r) => (typeof r.sys_data_policy === 'object' ? r.sys_data_policy?.value : r.sys_data_policy)).filter(Boolean)));
    const condByPolicy = new Map<string, { desc?: string; conditions?: string; active?: string }>();
    if (policyIds.length) {
      const pol = await this.queryRecords({
        table: 'sys_data_policy2',
        query: `sys_idIN${policyIds.join(',')}`,
        fields: 'sys_id,short_description,conditions,active',
        limit: 100,
      });
      for (const p of ((pol as any).records ?? pol ?? [])) {
        condByPolicy.set(p.sys_id, { desc: p.short_description, conditions: p.conditions, active: p.active });
      }
    }
    const fields = rows.map((r) => {
      const pid = typeof r.sys_data_policy === 'object' ? r.sys_data_policy?.value : r.sys_data_policy;
      const meta = condByPolicy.get(pid) || {};
      return { field: r.field, applies_when: meta.conditions || 'always', policy: meta.desc, active: meta.active };
    }).filter((f) => f.active !== 'false');
    return {
      table: t,
      mandatory_fields: fields,
      summary: fields.length
        ? `On ${t}, these fields are made mandatory by data policy: ${fields.map((f) => f.field).join(', ')}. Collect them before creating or updating.`
        : `No data-policy mandatory fields found on ${t} (dictionary-level mandatory fields may still apply).`,
    };
  }

  /**
   * Return a copy of this client configured to run as a specific user.
   * Used for per-request user context switching without mutating the shared client.
   */
  withUser(options: { sysId?: string; bearerToken?: string; instanceUrl?: string }): ServiceNowClient {
    const copy = Object.create(Object.getPrototypeOf(this)) as ServiceNowClient;
    Object.assign(copy, this);
    // Multi-tenant: route this request to the caller's own instance (from the
    // delegated context), instead of the server-configured one. SSRF-guarded to
    // ServiceNow hosts (override the suffix allowlist with MT_INSTANCE_ALLOW).
    if (options.instanceUrl) {
      const url = options.instanceUrl.trim().replace(/\/$/, '');
      let host = '';
      try { host = new URL(url).host.toLowerCase(); } catch { host = ''; }
      const suffixes = (process.env.MT_INSTANCE_ALLOW || '.service-now.com')
        .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
      const okHost = host !== '' && suffixes.some(s => {
        const suf = s.startsWith('.') ? s : '.' + s;
        return host === suf.slice(1) || host.endsWith(suf);
      });
      if (!/^https:\/\//i.test(url) || !okHost) {
        throw new ServiceNowError(`Delegated instance URL not allowed: ${options.instanceUrl}`, 'VALIDATION_ERROR');
      }
      copy.baseUrl = url;
    }
    if (options.sysId) {
      copy.authMode = 'impersonation';
      copy.impersonateUserSysId = options.sysId;
    }
    if (options.bearerToken) {
      copy.authMode = 'per-user';
      copy.perUserBearerToken = options.bearerToken;
      // A per-request injected token (the gateway path) is not ours to refresh — never carry over
      // any refresh state from the base client. Keeps hasPerUserRefresh() false for the gateway.
      copy.perUserRefreshToken = undefined;
      copy.perUserTokenExpiry = undefined;
      copy.onTokenRefreshed = undefined;
    }
    return copy;
  }

  /**
   * Authenticate with ServiceNow using OAuth or Basic Auth
   */
  private async authenticate(): Promise<void> {
    // Per-user mode carries the user's own bearer token (delegated auth) —
    // no service-account token acquisition needed.
    if (this.authMode === 'per-user' && this.perUserBearerToken) {
      // Local stored-session OAuth: proactively refresh a token that is expired or within 60s of it.
      // The gateway path has no refresh token (hasPerUserRefresh() === false), so it is untouched.
      if (this.hasPerUserRefresh() && this.perUserTokenExpiry && Date.now() >= this.perUserTokenExpiry - 60_000) {
        await this.refreshPerUserToken();
      }
      return;
    }

    if (this.authMethod === 'basic') {
      // Basic auth doesn't require token acquisition
      return;
    }

    // Check if we have a valid token
    if (this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry) {
      return; // Token still valid
    }

    // Acquire OAuth token
    if (!this.oauthConfig?.clientId || !this.oauthConfig?.clientSecret) {
      throw new ServiceNowError(
        'OAuth client ID and secret are required for OAuth authentication',
        'AUTHENTICATION_FAILED'
      );
    }

    if (!this.oauthConfig?.username || !this.oauthConfig?.password) {
      throw new ServiceNowError(
        'Username and password are required for OAuth password grant',
        'AUTHENTICATION_FAILED'
      );
    }

    const tokenUrl = `${this.baseUrl}/oauth_token.do`;
    const body = new URLSearchParams({
      grant_type: 'password',
      client_id: this.oauthConfig.clientId,
      client_secret: this.oauthConfig.clientSecret,
      username: this.oauthConfig.username,
      password: this.oauthConfig.password,
    });

    try {
      const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
      });

      if (!response.ok) {
        throw new ServiceNowError(
          `OAuth authentication failed: ${response.status} ${response.statusText}`,
          'AUTHENTICATION_FAILED'
        );
      }

      const tokenData = await response.json() as OAuthTokenResponse;
      this.accessToken = tokenData.access_token;
      // Set expiry to 90% of actual expiry time for safety margin
      this.tokenExpiry = Date.now() + (tokenData.expires_in * 1000 * 0.9);

      logger.debug('OAuth token acquired successfully');
    } catch (error) {
      if (error instanceof ServiceNowError) {
        throw error;
      }
      throw new ServiceNowError(
        `OAuth authentication error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'AUTHENTICATION_FAILED'
      );
    }
  }

  /**
   * Get authorization header for requests.
   * Per-user mode returns the user's own Bearer token directly.
   * Impersonation and service-account modes use the configured service account.
   */
  private getAuthHeader(): string {
    // Per-user: use the individual user's token (highest precedence)
    if (this.authMode === 'per-user' && this.perUserBearerToken) {
      return `Bearer ${this.perUserBearerToken}`;
    }

    if (this.authMethod === 'basic') {
      if (!this.basicConfig?.username || !this.basicConfig?.password) {
        throw new ServiceNowError(
          'Username and password are required for Basic authentication',
          'AUTHENTICATION_FAILED'
        );
      }
      const credentials = Buffer.from(
        `${this.basicConfig.username}:${this.basicConfig.password}`
      ).toString('base64');
      return `Basic ${credentials}`;
    } else {
      if (!this.accessToken) {
        throw new ServiceNowError(
          'OAuth token not available. Call authenticate() first.',
          'AUTHENTICATION_FAILED'
        );
      }
      return `Bearer ${this.accessToken}`;
    }
  }

  /**
   * Returns the X-Sn-Impersonate header value if impersonation mode is active.
   * ServiceNow executes the request in the context of the named user's roles/ACLs.
   */
  private getImpersonateHeader(): string | undefined {
    if (this.authMode === 'impersonation' && this.impersonateUserSysId) {
      return this.impersonateUserSysId;
    }
    return undefined;
  }

  /**
   * Make HTTP request with retry logic
   */
  private async request<T>(
    url: string,
    options: RequestInit = {}
  ): Promise<T> {
    let lastError: Error | undefined;
    let reauthed = false;   // one-shot OAuth token refresh on a 401

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.requestTimeoutMs);

        const extraHeaders: Record<string, string> = {};
        const impersonateHeader = this.getImpersonateHeader();
        if (impersonateHeader) {
          extraHeaders['X-Sn-Impersonate'] = impersonateHeader;
        }

        const response = await fetch(url, {
          ...options,
          signal: controller.signal,
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'Authorization': this.getAuthHeader(),
            ...extraHeaders,
            ...options.headers,
          },
        });

        clearTimeout(timeout);

        // Handle HTTP errors
        if (!response.ok) {
          const errorText = await response.text();
          let errorMessage = `HTTP ${response.status}: ${response.statusText}`;

          try {
            const errorJson = JSON.parse(errorText);
            if (errorJson.error?.message) {
              errorMessage = errorJson.error.message;
              // ServiceNow puts the ACTUAL reason (data policy, ACL, mandatory/read-only field) in
              // `detail`; `message` is often just the generic "Operation Failed". Surface both.
              if (errorJson.error.detail) {
                errorMessage += `: ${String(errorJson.error.detail).replace(/\s+/g, ' ').trim()}`;
              }
            }
          } catch {
            // Error response wasn't JSON, use status text
          }

          // Map HTTP status to error codes
          let errorCode = 'API_ERROR';
          if (response.status === 401) {
            errorCode = 'AUTHENTICATION_FAILED';
            // OAuth token likely expired or was revoked — refresh once and retry,
            // so a stale token self-heals without any external launcher/relaunch.
            if (this.authMethod === 'oauth' && this.authMode !== 'per-user' && !reauthed) {
              reauthed = true;
              this.accessToken = undefined;
              this.tokenExpiry = undefined;
              try { await this.authenticate(); } catch { /* fall through to the throw below */ }
              continue;
            }
            // Local per-user OAuth that owns a refresh token: renew once and retry. The multi-tenant
            // gateway's injected-token per-user mode has NO refresh token, so hasPerUserRefresh() is
            // false there and this is skipped — the live Copilot path is unchanged.
            if (this.hasPerUserRefresh() && !reauthed) {
              reauthed = true;
              try { await this.refreshPerUserToken(); } catch { /* fall through to the throw below */ }
              continue;
            }
            // Attach the actionable checklist so a bare 401 isn't a dead end.
            if (this.authMethod === 'basic') {
              errorMessage = `${errorMessage}\n\n${basicAuthDiagnostic()}`;
            }
          } else if (response.status === 403) {
            errorCode = 'INSUFFICIENT_PRIVILEGES';
            errorMessage = `${errorMessage}\n\n${forbiddenDiagnostic(this.authMethod)}`;
          } else if (response.status === 404) {
            errorCode = 'NOT_FOUND';
          } else if (response.status === 400) {
            errorCode = 'INVALID_REQUEST';
          }

          throw new ServiceNowError(errorMessage, errorCode);
        }

        const data = await response.json();
        return data as T;

      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');

        // Don't retry on auth errors or invalid requests
        if (error instanceof ServiceNowError) {
          // 403 is not transient (a role/ACL/data-policy denial won't clear in 4s), so fail fast
          // instead of burning ~7s on retries.
          if (['AUTHENTICATION_FAILED', 'INVALID_REQUEST', 'NOT_FOUND', 'INSUFFICIENT_PRIVILEGES'].includes(error.code)) {
            throw error;
          }
        }

        // Retry on network errors or server errors
        if (attempt < this.maxRetries) {
          const delay = this.retryDelayMs * Math.pow(2, attempt); // Exponential backoff
          logger.warn(`Request failed, retrying in ${delay}ms (attempt ${attempt + 1}/${this.maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
      }
    }

    // Surface the real cause from Node.js fetch failures
    if (lastError) {
      const cause = (lastError as Error & { cause?: Error }).cause;
      if (cause) {
        throw new ServiceNowError(
          `Failed to query records: ${cause.message}`,
          (cause as Error & { code?: string }).code || 'NETWORK_ERROR'
        );
      }
      throw lastError;
    }
    throw new Error('Request failed after retries');
  }

  /**
   * Query records from a ServiceNow table
   */
  async queryRecords(params: QueryRecordsParams): Promise<QueryRecordsResponse> {
    // Validate inputs
    validateTableName(params.table);
    if (params.query) validateQuery(params.query);

    // Authenticate before making API calls
    await this.authenticate();

    // Build query parameters
    const queryParams = new URLSearchParams();

    if (params.query) {
      queryParams.set('sysparm_query', params.query);
    }

    if (params.fields) {
      queryParams.set('sysparm_fields', params.fields);
    }

    // Return reference fields as readable names, not raw sys_ids. 'all' keeps the sys_id too
    // (as {display_value, value}) so the agent can still act on the record.
    if (params.displayValue) {
      queryParams.set('sysparm_display_value', params.displayValue === 'all' ? 'all' : 'true');
    }

    if (params.limit !== undefined && params.limit > 0) {
      queryParams.set('sysparm_limit', Math.min(params.limit, 1000).toString());
    } else {
      queryParams.set('sysparm_limit', '10'); // Default limit
    }

    if (params.offset !== undefined) {
      queryParams.set('sysparm_offset', params.offset.toString());
    }

    if (params.orderBy) {
      // Handle descending sort (prefix with "-")
      if (params.orderBy.startsWith('-')) {
        const field = params.orderBy.substring(1);
        // ServiceNow descending syntax is ORDERBYDESC<field> (not ORDERBY<field>^ORDERBYDESC).
        queryParams.set('sysparm_query',
          params.query
            ? `${params.query}^ORDERBYDESC${field}`
            : `ORDERBYDESC${field}`
        );
      } else {
        queryParams.set('sysparm_query',
          params.query
            ? `${params.query}^ORDERBY${params.orderBy}`
            : `ORDERBY${params.orderBy}`
        );
      }
    }

    const url = `${this.baseUrl}/api/now/table/${params.table}?${queryParams.toString()}`;

    logger.info(`Querying ServiceNow table: ${params.table}`);
    logger.debug(`Query: ${params.query || 'none'}`);

    try {
      const response = await this.request<ServiceNowApiResponse<ServiceNowRecord[]>>(url);

      return {
        count: response.result.length,
        records: response.result,
      };
    } catch (error) {
      if (error instanceof ServiceNowError) {
        throw error;
      }
      throw new ServiceNowError(
        `Failed to query records: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'QUERY_FAILED'
      );
    }
  }

  /**
   * Verify authentication with the least possible privilege. `current_user` is
   * readable by ANY authenticated user regardless of roles/ACLs, so it confirms
   * the credentials work without falsely rejecting low-privilege accounts (which
   * a sys_user/sys_properties read would). Returns the resolved user identity.
   */
  async getCurrentUser(): Promise<{ user_name?: string; user_sys_id?: string; user_display_name?: string; [k: string]: any }> {
    await this.authenticate();
    const url = `${this.baseUrl}/api/now/ui/user/current_user`;
    const response = await this.request<{ result: Record<string, any> }>(url);
    return response.result || {};
  }

  /**
   * Get table schema/structure
   */
  async getTableSchema(tableName: string): Promise<any> {
    await this.authenticate();

    const url = `${this.baseUrl}/api/now/table/${tableName}?sysparm_exclude_reference_link=true&sysparm_limit=1`;

    logger.info(`Getting schema for table: ${tableName}`);

    try {
      // Get table structure by querying with limit=1
      const response = await this.request<ServiceNowApiResponse<any[]>>(url);

      // Extract field names and types from the result
      if (response.result && response.result.length > 0) {
        const sample = response.result[0];
        const columns = Object.keys(sample).map(key => ({
          element: key,
          value_sample: sample[key],
        }));

        return {
          table: tableName,
          columns,
        };
      }

      return {
        table: tableName,
        columns: [],
      };
    } catch (error) {
      if (error instanceof ServiceNowError) {
        throw error;
      }
      throw new ServiceNowError(
        `Failed to get table schema: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'QUERY_FAILED'
      );
    }
  }

  /**
   * Get a single record by sys_id
   */
  async getRecord(table: string, sysId: string, fields?: string, displayValue?: boolean | 'all'): Promise<ServiceNowRecord> {
    validateTableName(table);
    validateSysId(sysId);
    await this.authenticate();

    const queryParams = new URLSearchParams();
    if (fields) {
      queryParams.set('sysparm_fields', fields);
    }
    if (displayValue) {
      queryParams.set('sysparm_display_value', displayValue === 'all' ? 'all' : 'true');
    }

    const url = `${this.baseUrl}/api/now/table/${table}/${sysId}${queryParams.toString() ? '?' + queryParams.toString() : ''}`;

    logger.info(`Getting record from ${table}: ${sysId}`);

    try {
      const response = await this.request<ServiceNowApiResponse<ServiceNowRecord>>(url);
      return response.result;
    } catch (error) {
      if (error instanceof ServiceNowError) {
        throw error;
      }
      throw new ServiceNowError(
        `Failed to get record: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'QUERY_FAILED'
      );
    }
  }

  /**
   * Get user details by email or username
   */
  async getUser(userIdentifier: string): Promise<ServiceNowRecord> {
    await this.authenticate();

    // Try user_name, email, or sys_id
    if (/^[0-9a-f]{32}$/i.test(userIdentifier)) {
      return await this.getRecord('sys_user', userIdentifier);
    }
    // Reject encoded-query operators / URL-param injection chars before building the query.
    if (/[\^=&#?]/.test(userIdentifier)) {
      throw new ServiceNowError(`Invalid user identifier: ${userIdentifier}`, 'VALIDATION_ERROR');
    }
    const query = `user_name=${userIdentifier}^ORemail=${userIdentifier}`;
    const params = new URLSearchParams({ sysparm_query: query, sysparm_limit: '1' });
    const url = `${this.baseUrl}/api/now/table/sys_user?${params.toString()}`;

    logger.info(`Looking up user: ${userIdentifier}`);

    try {
      const response = await this.request<ServiceNowApiResponse<ServiceNowRecord[]>>(url);

      if (response.result.length === 0) {
        throw new ServiceNowError(`User not found: ${userIdentifier}`, 'NOT_FOUND');
      }

      return response.result[0];
    } catch (error) {
      if (error instanceof ServiceNowError) {
        throw error;
      }
      throw new ServiceNowError(
        `Failed to get user: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'QUERY_FAILED'
      );
    }
  }

  /**
   * Get group details by name or sys_id
   */
  async getGroup(groupIdentifier: string): Promise<ServiceNowRecord> {
    await this.authenticate();

    // Check if it's a sys_id (32 hex chars) or name
    const isSysId = /^[0-9a-f]{32}$/i.test(groupIdentifier);
    // Reject encoded-query operators / URL-param injection chars (group names may contain
    // spaces, which are safe; ^ = & # are not).
    if (/[\^=&#?]/.test(groupIdentifier)) {
      throw new ServiceNowError(`Invalid group identifier: ${groupIdentifier}`, 'VALIDATION_ERROR');
    }
    const query = isSysId ? `sys_id=${groupIdentifier}` : `name=${groupIdentifier}`;
    const params = new URLSearchParams({ sysparm_query: query, sysparm_limit: '1' });
    const url = `${this.baseUrl}/api/now/table/sys_user_group?${params.toString()}`;

    logger.info(`Looking up group: ${groupIdentifier}`);

    try {
      const response = await this.request<ServiceNowApiResponse<ServiceNowRecord[]>>(url);

      if (response.result.length === 0) {
        throw new ServiceNowError(`Group not found: ${groupIdentifier}`, 'NOT_FOUND');
      }

      return response.result[0];
    } catch (error) {
      if (error instanceof ServiceNowError) {
        throw error;
      }
      throw new ServiceNowError(
        `Failed to get group: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'QUERY_FAILED'
      );
    }
  }

  /**
   * Search CMDB configuration items
   */
  async searchCmdbCi(query?: string, limit: number = 10): Promise<QueryRecordsResponse> {
    await this.authenticate();

    const queryParams = new URLSearchParams();
    if (query) {
      queryParams.set('sysparm_query', query);
    }
    queryParams.set('sysparm_limit', Math.min(limit, 100).toString());

    const url = `${this.baseUrl}/api/now/table/cmdb_ci?${queryParams.toString()}`;

    logger.info('Searching CMDB CIs');

    try {
      const response = await this.request<ServiceNowApiResponse<ServiceNowRecord[]>>(url);

      return {
        count: response.result.length,
        records: response.result,
      };
    } catch (error) {
      if (error instanceof ServiceNowError) {
        throw error;
      }
      throw new ServiceNowError(
        `Failed to search CMDB CIs: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'QUERY_FAILED'
      );
    }
  }

  /**
   * Get a specific CMDB configuration item
   */
  async getCmdbCi(ciSysId: string, fields?: string): Promise<ServiceNowRecord> {
    return this.getRecord('cmdb_ci', ciSysId, fields);
  }

  /**
   * List relationships for a CI
   */
  async listRelationships(ciSysId: string): Promise<any> {
    await this.authenticate();

    const query = `parent=${ciSysId}^ORchild=${ciSysId}`;
    const url = `${this.baseUrl}/api/now/table/cmdb_rel_ci?sysparm_query=${query}`;

    logger.info(`Listing relationships for CI: ${ciSysId}`);

    try {
      const response = await this.request<ServiceNowApiResponse<ServiceNowRecord[]>>(url);

      return {
        count: response.result.length,
        relationships: response.result,
      };
    } catch (error) {
      if (error instanceof ServiceNowError) {
        throw error;
      }
      throw new ServiceNowError(
        `Failed to list relationships: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'QUERY_FAILED'
      );
    }
  }

  /**
   * List discovery schedules
   */
  async listDiscoverySchedules(activeOnly: boolean = false): Promise<any> {
    await this.authenticate();

    const query = activeOnly ? 'active=true' : '';
    const url = `${this.baseUrl}/api/now/table/discovery_schedule${query ? '?sysparm_query=' + query : ''}`;

    logger.info('Listing discovery schedules');

    try {
      const response = await this.request<ServiceNowApiResponse<ServiceNowRecord[]>>(url);

      return {
        count: response.result.length,
        schedules: response.result,
      };
    } catch (error) {
      if (error instanceof ServiceNowError) {
        throw error;
      }
      throw new ServiceNowError(
        `Failed to list discovery schedules: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'QUERY_FAILED'
      );
    }
  }

  /**
   * List MID servers
   */
  async listMidServers(activeOnly: boolean = false): Promise<any> {
    await this.authenticate();

    const query = activeOnly ? 'status=Up' : '';
    const url = `${this.baseUrl}/api/now/table/ecc_agent${query ? '?sysparm_query=' + query : ''}`;

    logger.info('Listing MID servers');

    try {
      const response = await this.request<ServiceNowApiResponse<ServiceNowRecord[]>>(url);

      return {
        count: response.result.length,
        mid_servers: response.result,
      };
    } catch (error) {
      if (error instanceof ServiceNowError) {
        throw error;
      }
      throw new ServiceNowError(
        `Failed to list MID servers: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'QUERY_FAILED'
      );
    }
  }

  /**
   * List active events
   */
  async listActiveEvents(query?: string, limit: number = 10): Promise<QueryRecordsResponse> {
    await this.authenticate();

    const queryParams = new URLSearchParams();
    if (query) {
      queryParams.set('sysparm_query', query);
    }
    queryParams.set('sysparm_limit', limit.toString());

    const url = `${this.baseUrl}/api/now/table/em_event?${queryParams.toString()}`;

    logger.info('Listing active events');

    try {
      const response = await this.request<ServiceNowApiResponse<ServiceNowRecord[]>>(url);

      return {
        count: response.result.length,
        records: response.result,
      };
    } catch (error) {
      if (error instanceof ServiceNowError) {
        throw error;
      }
      throw new ServiceNowError(
        `Failed to list events: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'QUERY_FAILED'
      );
    }
  }

  /**
   * Get CMDB health dashboard metrics
   */
  async cmdbHealthDashboard(): Promise<any> {
    await this.authenticate();

    logger.info('Getting CMDB health metrics');

    try {
      // Get server metrics
      const serversUrl = `${this.baseUrl}/api/now/table/cmdb_ci_server?sysparm_fields=sys_id,ip_address,os,serial_number`;
      const serversResponse = await this.request<ServiceNowApiResponse<ServiceNowRecord[]>>(serversUrl);

      const servers = serversResponse.result;
      const serversWithIp = servers.filter(s => s.ip_address).length;
      const serversWithOs = servers.filter(s => s.os).length;
      const serversWithSerial = servers.filter(s => s.serial_number).length;

      // Get network device metrics
      const networkUrl = `${this.baseUrl}/api/now/table/cmdb_ci_network_adapter?sysparm_fields=sys_id,ip_address,mac_address&sysparm_limit=100`;
      const networkResponse = await this.request<ServiceNowApiResponse<ServiceNowRecord[]>>(networkUrl);

      const network = networkResponse.result;
      const networkWithIp = network.filter(n => n.ip_address).length;
      const networkWithMac = network.filter(n => n.mac_address).length;

      return {
        server_metrics: {
          total: servers.length,
          with_ip: serversWithIp,
          with_os: serversWithOs,
          with_serial: serversWithSerial,
          ip_completeness: servers.length > 0 ? ((serversWithIp / servers.length) * 100).toFixed(2) : '0',
          os_completeness: servers.length > 0 ? ((serversWithOs / servers.length) * 100).toFixed(2) : '0',
        },
        network_metrics: {
          total: network.length,
          with_ip: networkWithIp,
          with_mac: networkWithMac,
          ip_completeness: network.length > 0 ? ((networkWithIp / network.length) * 100).toFixed(2) : '0',
          mac_completeness: network.length > 0 ? ((networkWithMac / network.length) * 100).toFixed(2) : '0',
        },
      };
    } catch (error) {
      if (error instanceof ServiceNowError) {
        throw error;
      }
      throw new ServiceNowError(
        `Failed to get CMDB health: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'QUERY_FAILED'
      );
    }
  }

  /**
   * Get service mapping summary
   */
  async serviceMappingSummary(serviceSysId: string): Promise<any> {
    await this.authenticate();

    logger.info(`Getting service mapping summary for: ${serviceSysId}`);

    try {
      // Get service details
      const serviceUrl = `${this.baseUrl}/api/now/table/cmdb_ci_service/${serviceSysId}`;
      const serviceResponse = await this.request<ServiceNowApiResponse<ServiceNowRecord>>(serviceUrl);

      // Get related CIs
      const relatedUrl = `${this.baseUrl}/api/now/table/cmdb_rel_ci?sysparm_query=parent=${serviceSysId}^ORchild=${serviceSysId}`;
      const relatedResponse = await this.request<ServiceNowApiResponse<ServiceNowRecord[]>>(relatedUrl);

      return {
        service: serviceResponse.result,
        related_cis_count: relatedResponse.result.length,
        related_cis: relatedResponse.result,
      };
    } catch (error) {
      if (error instanceof ServiceNowError) {
        throw error;
      }
      throw new ServiceNowError(
        `Failed to get service mapping: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'QUERY_FAILED'
      );
    }
  }

  /**
   * Create a change request
   */
  async createChangeRequest(params: any): Promise<ServiceNowRecord> {
    await this.authenticate();

    logger.info('Creating change request');

    const url = `${this.baseUrl}/api/now/table/change_request`;

    try {
      const response = await this.request<ServiceNowApiResponse<ServiceNowRecord>>(url, {
        method: 'POST',
        body: JSON.stringify(params),
      });

      return response.result;
    } catch (error) {
      if (error instanceof ServiceNowError) {
        throw error;
      }
      throw new ServiceNowError(
        `Failed to create change request: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'QUERY_FAILED'
      );
    }
  }

  /**
   * Create a record in any ServiceNow table
   */
  async createRecord(table: string, data: Record<string, any>): Promise<ServiceNowRecord> {
    validateTableName(table);
    await this.authenticate();
    // Field-level mandatory check: reject a create that omits a field this instance genuinely
    // requires at the data layer (dictionary, overrides, data policies). UI policies are ignored
    // on purpose, the Table API never evaluates them. Bypass with NOWAIKIT_SKIP_MANDATORY_CHECK=true.
    const missing = await missingRequiredFields(this, table, data);
    if (missing.length) {
      throw new ServiceNowError(
        `Cannot create ${table}: missing required field(s): ${missing.map(m => `${m.label} (${m.element})`).join(', ')}. Provide these values, or ask the user for them before creating.`,
        'MANDATORY_FIELDS_MISSING'
      );
    }
    logger.info(`Creating record in ${table}`);
    const url = `${this.baseUrl}/api/now/table/${table}`;
    try {
      const response = await this.request<ServiceNowApiResponse<ServiceNowRecord>>(url, {
        method: 'POST',
        body: JSON.stringify(data),
      });
      return response.result;
    } catch (error) {
      if (error instanceof ServiceNowError) throw error;
      throw new ServiceNowError(
        `Failed to create record in ${table}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'CREATE_FAILED'
      );
    }
  }

  /**
   * Update a record in any ServiceNow table
   */
  async updateRecord(table: string, sysId: string, data: Record<string, any>): Promise<ServiceNowRecord> {
    validateTableName(table);
    validateSysId(sysId);
    await this.authenticate();
    logger.info(`Updating record ${sysId} in ${table}`);
    const url = `${this.baseUrl}/api/now/table/${table}/${sysId}`;
    try {
      const response = await this.request<ServiceNowApiResponse<ServiceNowRecord>>(url, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
      const result = response.result as Record<string, any>;
      // Detect silently-discarded writes: ACLs or data policies can drop field updates
      // while the Table API still returns HTTP 200 with the record body, so a blind
      // pass-through reads as success. Compare the requested values against what came back.
      const unapplied: string[] = [];
      for (const [field, requested] of Object.entries(data)) {
        const returned = result?.[field];
        if (returned === undefined) continue; // field not in response, can't verify
        const returnedVal = returned && typeof returned === 'object'
          ? (returned.value ?? returned.display_value ?? '')
          : returned;
        if (String(returnedVal ?? '').trim() !== String(requested ?? '').trim()) unapplied.push(field);
      }
      if (unapplied.length > 0) {
        result._write_warning =
          `Requested value(s) not reflected after the write for: ${unapplied.join(', ')}. ` +
          `ACLs or a data policy may have silently discarded them (the Table API still returns 200), ` +
          `or a business rule transformed them. Verify the change took effect.`;
      }
      return result as ServiceNowRecord;
    } catch (error) {
      if (error instanceof ServiceNowError) throw error;
      throw new ServiceNowError(
        `Failed to update record ${sysId} in ${table}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'UPDATE_FAILED'
      );
    }
  }

  /**
   * Delete a record from any ServiceNow table
   */
  async deleteRecord(table: string, sysId: string): Promise<void> {
    validateTableName(table);
    validateSysId(sysId);
    await this.authenticate();
    logger.info(`Deleting record ${sysId} from ${table}`);
    const url = `${this.baseUrl}/api/now/table/${table}/${sysId}`;
    try {
      await this.request<void>(url, { method: 'DELETE' });
    } catch (error) {
      if (error instanceof ServiceNowError) {
        // ServiceNow returns 404 for BOTH a missing record AND an ACL-denied delete
        // (it hides the record's existence). Disambiguate: if the record is still
        // readable, the delete was rejected by ACLs — an authorization failure, not
        // a missing record.
        if (error.code === 'NOT_FOUND') {
          let stillExists = false;
          try { await this.getRecord(table, sysId, 'sys_id'); stillExists = true; } catch { /* not readable: genuine not-found */ }
          if (stillExists) {
            throw new ServiceNowError(
              `Delete of ${sysId} in ${table} was rejected: the record still exists but you lack delete access. This is an authorization failure (ACL), not a missing record.`,
              'INSUFFICIENT_PRIVILEGES'
            );
          }
        }
        throw error;
      }
      throw new ServiceNowError(
        `Failed to delete record ${sysId} from ${table}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'DELETE_FAILED'
      );
    }
  }

  /**
   * Call Now Assist / Generative AI endpoints (latest release)
   */
  async callNowAssist(endpoint: string, payload: Record<string, any>): Promise<any> {
    await this.authenticate();
    logger.info(`Calling Now Assist endpoint: ${endpoint}`);
    const url = `${this.baseUrl}${endpoint}`;
    try {
      const response = await this.request<any>(url, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      return response;
    } catch (error) {
      if (error instanceof ServiceNowError) throw error;
      throw new ServiceNowError(
        `Now Assist call failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'NOW_ASSIST_ERROR'
      );
    }
  }

  /**
   * Get a Service Catalog item with its variables (label, mandatory, type, choices)
   * via the Service Catalog API. The Table API (getRecord) does not expose variables,
   * so callers cannot tell which fields are required before ordering.
   */
  async getServiceCatalogItem(sysId: string): Promise<any> {
    await this.authenticate();
    const url = `${this.baseUrl}/api/sn_sc/servicecatalog/items/${sysId}`;
    const response = await this.request<any>(url, { method: 'GET' });
    return (response && (response as any).result) || response;
  }

  /**
   * Read Performance Analytics scorecard/indicator data via the PA Scorecards API
   * (GET /api/now/pa/scorecards). This is the supported read API; the legacy
   * /api/now/pa/widget/{sys_id} route is the widget renderer, not a data API.
   */
  async getPaScorecards(params: Record<string, string>): Promise<any> {
    await this.authenticate();
    const qs = new URLSearchParams(params).toString();
    const url = `${this.baseUrl}/api/now/pa/scorecards${qs ? `?${qs}` : ''}`;
    const response = await this.request<any>(url, { method: 'GET' });
    return (response && (response as any).result) || response;
  }

  /**
   * Full Stats/Aggregate API query (GET /api/now/stats/{table}). Returns per-group
   * statistics — count plus averages/sums/mins/maxes of numeric or duration fields — in a
   * SINGLE server-side query, so it never truncates the way a record list does. Duration
   * fields come back pre-formatted by ServiceNow (e.g. "21 14:03:10" = 21d 14h 3m 10s).
   */
  async runStats(
    table: string,
    opts: { groupBy?: string; query?: string; count?: boolean; avgFields?: string[]; sumFields?: string[]; minFields?: string[]; maxFields?: string[]; displayValue?: boolean },
  ): Promise<any[]> {
    await this.authenticate();
    const params = new URLSearchParams();
    if (opts.groupBy) params.set('sysparm_group_by', opts.groupBy);
    if (opts.count !== false) params.set('sysparm_count', 'true');
    // Readable group labels ("Closed" not "7", "Critical" not "1"). Callers that group by a
    // date field for time buckets should leave this off so the raw datetime stays parseable.
    if (opts.displayValue) params.set('sysparm_display_value', 'true');
    if (opts.avgFields?.length) params.set('sysparm_avg_fields', opts.avgFields.join(','));
    if (opts.sumFields?.length) params.set('sysparm_sum_fields', opts.sumFields.join(','));
    if (opts.minFields?.length) params.set('sysparm_min_fields', opts.minFields.join(','));
    if (opts.maxFields?.length) params.set('sysparm_max_fields', opts.maxFields.join(','));
    if (opts.query) params.set('sysparm_query', opts.query);
    const url = `${this.baseUrl}/api/now/stats/${table}?${params.toString()}`;
    const response = await this.request<any>(url);
    const result = response && (response as any).result;
    return Array.isArray(result) ? result : result ? [result] : [];
  }

  /**
   * Run aggregate/stats query on a table (ServiceNow Reporting API)
   */
  async runAggregateQuery(table: string, groupBy: string, _aggregate: string = 'COUNT', query?: string): Promise<any> {
    await this.authenticate();
    const params = new URLSearchParams();
    params.set('sysparm_group_by', groupBy);
    if (query) params.set('sysparm_query', query);
    params.set('sysparm_count', 'true');
    const url = `${this.baseUrl}/api/now/stats/${table}?${params.toString()}`;
    try {
      const response = await this.request<any>(url);
      return response.result;
    } catch (error) {
      if (error instanceof ServiceNowError) throw error;
      throw new ServiceNowError(
        `Aggregate query failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'QUERY_FAILED'
      );
    }
  }

  /**
   * Natural language search (simplified implementation)
   */
  async naturalLanguageSearch(query: string, limit: number = 10): Promise<any> {
    // For now, search across incidents - in a full implementation,
    // this would use NLP to determine the table and build the query
    logger.info(`Natural language search: ${query}`);

    const searchQuery = `short_descriptionLIKE${query}^ORdescriptionLIKE${query}`;

    return this.queryRecords({
      table: 'incident',
      query: searchQuery,
      limit,
    });
  }

  /**
   * Upload a file attachment to a ServiceNow record via the Attachment API.
   * Accepts base64-encoded content and uploads it as a multipart form.
   */
  async uploadAttachment(
    table: string,
    recordSysId: string,
    fileName: string,
    contentType: string,
    contentBase64: string
  ): Promise<any> {
    // Decode base64 to binary, then hand off to the shared binary uploader.
    const binary = Buffer.from(contentBase64, 'base64');
    return this.uploadAttachmentBuffer(table, recordSysId, fileName, contentType, binary);
  }

  /**
   * Attach a file to a record by fetching its bytes server-side from a URL, so the file content
   * never has to travel through the LLM/tool call as a base64 argument. This is the reliable path
   * for anything larger than a few hundred KB. `sourceHeaders` lets the caller pass auth (e.g. a
   * bearer/basic credential) for any protected URL. Content type is taken from the caller, then
   * the response's Content-Type, then guessed from the file extension.
   */
  async uploadAttachmentFromUrl(
    table: string,
    recordSysId: string,
    fileName: string,
    sourceUrl: string,
    contentType?: string,
    sourceHeaders?: Record<string, string>
  ): Promise<any> {
    const MAX_FETCH_BYTES = 50 * 1024 * 1024; // 50MB safety cap on server-side fetch

    let src: URL;
    try {
      src = new URL(sourceUrl);
    } catch {
      throw new ServiceNowError(`source_url is not a valid URL: ${sourceUrl}`, 'INVALID_REQUEST');
    }
    if (src.protocol !== 'https:' && src.protocol !== 'http:') {
      throw new ServiceNowError(`source_url must be http(s), got ${src.protocol}`, 'INVALID_REQUEST');
    }

    logger.info(`Fetching attachment "${fileName}" from source URL for ${table}:${recordSysId}`);

    let fetched: Response;
    try {
      fetched = await fetch(src, { headers: sourceHeaders ?? {} });
    } catch (error) {
      throw new ServiceNowError(
        `Failed to fetch source_url: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'ATTACHMENT_SOURCE_FETCH_FAILED'
      );
    }
    if (!fetched.ok) {
      throw new ServiceNowError(
        `source_url returned HTTP ${fetched.status} ${fetched.statusText}`,
        'ATTACHMENT_SOURCE_FETCH_FAILED'
      );
    }

    const arrayBuf = await fetched.arrayBuffer();
    const binary = Buffer.from(arrayBuf);
    if (binary.length > MAX_FETCH_BYTES) {
      throw new ServiceNowError(
        `Fetched file is ${(binary.length / 1024 / 1024).toFixed(1)}MB, over the ${MAX_FETCH_BYTES / 1024 / 1024}MB limit`,
        'ATTACHMENT_TOO_LARGE'
      );
    }

    const responseType = fetched.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() || '';
    const resolvedType = contentType || responseType || guessContentType(fileName);

    // Phantom-attachment guard: a protected/expired link (e.g. SharePoint) often returns a tiny
    // HTML/JSON error page with HTTP 200. Uploading that as "document.pdf" creates an empty, broken
    // attachment that looks successful. Reject the obvious cases instead of attaching junk.
    const expectedType = (contentType || guessContentType(fileName)).toLowerCase();
    const expectsBinary = !expectedType.startsWith('text/') && !/json|xml|csv|html/.test(expectedType);
    const looksLikeErrorPage = /text\/html|application\/json|application\/xml/.test(responseType);
    const head = binary.subarray(0, 5).toString('latin1');
    const magicOk =
      !expectedType.includes('pdf') ? true : head.startsWith('%PDF'); // PDFs must start with %PDF
    if (binary.length < 100 && expectsBinary) {
      throw new ServiceNowError(
        `source_url returned only ${binary.length} bytes for "${fileName}" — this is almost certainly an error/redirect page, not the file. ` +
          'The link is likely protected or expired (for SharePoint, use the pre-authorised @microsoft.graph.downloadUrl). Nothing was attached.',
        'ATTACHMENT_SOURCE_NOT_A_FILE'
      );
    }
    if (expectsBinary && looksLikeErrorPage) {
      throw new ServiceNowError(
        `source_url returned ${responseType} but "${fileName}" was expected to be a binary file — this looks like an error page, not the document. Nothing was attached.`,
        'ATTACHMENT_SOURCE_NOT_A_FILE'
      );
    }
    if (!magicOk) {
      throw new ServiceNowError(
        `source_url content is not a valid PDF (missing %PDF header) for "${fileName}". The link likely returned an error page. Nothing was attached.`,
        'ATTACHMENT_SOURCE_NOT_A_FILE'
      );
    }

    return this.uploadAttachmentBuffer(table, recordSysId, fileName, resolvedType, binary);
  }

  /** Shared core: POST raw bytes to ServiceNow's native binary attachment endpoint. */
  private async uploadAttachmentBuffer(
    table: string,
    recordSysId: string,
    fileName: string,
    contentType: string,
    binary: Buffer
  ): Promise<any> {
    await this.authenticate();

    const url = `${this.baseUrl}/api/now/attachment/file?table_name=${encodeURIComponent(table)}&table_sys_id=${encodeURIComponent(recordSysId)}&file_name=${encodeURIComponent(fileName)}`;

    logger.info(`Uploading attachment "${fileName}" (${binary.length} bytes) to ${table}:${recordSysId}`);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': contentType,
          'Authorization': this.getAuthHeader(),
          'Accept': 'application/json',
        },
        body: binary,
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        try {
          const errorJson = JSON.parse(errorText);
          if (errorJson.error?.message) {
            errorMessage = errorJson.error.message;
            if (errorJson.error.detail) errorMessage += `: ${String(errorJson.error.detail).replace(/\s+/g, ' ').trim()}`;
          }
        } catch {
          // ignore parse error
        }
        throw new ServiceNowError(errorMessage, 'ATTACHMENT_UPLOAD_FAILED');
      }

      const data = await response.json() as any;
      return data.result ?? data;
    } catch (error) {
      if (error instanceof ServiceNowError) throw error;
      throw new ServiceNowError(
        `Failed to upload attachment: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'ATTACHMENT_UPLOAD_FAILED'
      );
    }
  }

  /** Fetch an existing attachment's metadata + raw bytes, server-side (no LLM involvement). */
  private async fetchAttachment(attachmentSysId: string): Promise<{ meta: any; bytes: Buffer }> {
    await this.authenticate();
    const id = validateSysId(attachmentSysId);

    // Metadata (file_name, content_type, size) via the attachment record.
    const metaRes = await fetch(`${this.baseUrl}/api/now/attachment/${encodeURIComponent(id)}`, {
      headers: { Authorization: this.getAuthHeader(), Accept: 'application/json' },
    });
    if (!metaRes.ok) {
      throw new ServiceNowError(
        metaRes.status === 404 ? `Attachment not found: ${id}` : `HTTP ${metaRes.status}: ${metaRes.statusText}`,
        metaRes.status === 404 ? 'NOT_FOUND' : 'ATTACHMENT_READ_FAILED'
      );
    }
    const meta = ((await metaRes.json()) as any).result ?? {};

    // Raw bytes via the binary file endpoint.
    const fileRes = await fetch(`${this.baseUrl}/api/now/attachment/${encodeURIComponent(id)}/file`, {
      headers: { Authorization: this.getAuthHeader() },
    });
    if (!fileRes.ok) {
      throw new ServiceNowError(`HTTP ${fileRes.status}: ${fileRes.statusText}`, 'ATTACHMENT_READ_FAILED');
    }
    const bytes = Buffer.from(await fileRes.arrayBuffer());
    return { meta, bytes };
  }

  /**
   * Copy an existing ServiceNow attachment onto another record, entirely server-side. The bytes
   * are fetched from the source attachment and re-posted to the target, so nothing passes through
   * the LLM/tool call. Great for "attach the same document from the RITM onto the KB".
   */
  async copyAttachment(
    attachmentSysId: string,
    targetTable: string,
    targetRecordSysId: string,
    newFileName?: string
  ): Promise<any> {
    const { meta, bytes } = await this.fetchAttachment(attachmentSysId);
    const fileName = newFileName || meta.file_name || `attachment-${attachmentSysId}`;
    const contentType = meta.content_type || guessContentType(fileName);
    logger.info(`Copying attachment ${attachmentSysId} (${bytes.length} bytes) to ${targetTable}:${targetRecordSysId}`);
    return this.uploadAttachmentBuffer(targetTable, targetRecordSysId, fileName, contentType, bytes);
  }

  /**
   * Read an existing ServiceNow attachment and return its text content when the file is text-based
   * (txt/csv/json/xml/html/md). For binary formats (PDF/DOCX/images) it returns metadata plus a note
   * rather than dumping bytes, since those need a dedicated extractor. All server-side.
   */
  async readAttachment(attachmentSysId: string, maxChars = 200_000): Promise<any> {
    const { meta, bytes } = await this.fetchAttachment(attachmentSysId);
    const ct = String(meta.content_type || guessContentType(meta.file_name || '')).toLowerCase();
    const name = String(meta.file_name || '').toLowerCase();
    const isTextual =
      ct.startsWith('text/') ||
      /json|xml|csv|html|yaml|markdown|javascript|x-www-form-urlencoded/.test(ct) ||
      /\.(txt|csv|json|xml|html?|md|log|yaml|yml|tsv)$/.test(name);

    const base = {
      attachment_sys_id: attachmentSysId,
      file_name: meta.file_name,
      content_type: meta.content_type,
      size_bytes: bytes.length,
    };

    if (isTextual) {
      const text = bytes.toString('utf8');
      const truncated = text.length > maxChars;
      return {
        ...base,
        text: truncated ? text.slice(0, maxChars) : text,
        truncated,
        summary: `Read ${bytes.length} bytes of text from "${meta.file_name}"${truncated ? ` (truncated to ${maxChars} chars)` : ''}`,
      };
    }

    return {
      ...base,
      text: null,
      extractable: false,
      note:
        `"${meta.file_name}" is a binary format (${meta.content_type}) that needs a dedicated text extractor. ` +
        'Use copy_attachment to move it between records, or process the file where it was uploaded.',
    };
  }

  /**
   * Execute multiple REST API operations in a single HTTP call (Batch API).
   * Uses /api/now/v1/batch endpoint. Up to 50 operations per batch.
   */
  async batchRequest(operations: Array<{ id: string; method: string; url: string; body?: any }>): Promise<any> {
    await this.authenticate();
    logger.info(`Executing batch request with ${operations.length} operations`);

    if (operations.length > 50) {
      throw new ServiceNowError('Maximum 50 operations per batch request', 'INVALID_REQUEST');
    }

    const batchPayload = {
      batch_request_id: `nowaikit_${Date.now()}`,
      rest_requests: operations.map(op => ({
        id: op.id,
        method: op.method,
        url: op.url.startsWith('/') ? op.url : `/${op.url}`,
        headers: [
          { name: 'Content-Type', value: 'application/json' },
          { name: 'Accept', value: 'application/json' },
        ],
        ...(op.body ? { body: JSON.stringify(op.body) } : {}),
      })),
    };

    const url = `${this.baseUrl}/api/now/v1/batch`;

    try {
      const response = await this.request<any>(url, {
        method: 'POST',
        body: JSON.stringify(batchPayload),
      });

      // Parse individual responses
      const results = (response.serviced_requests || []).map((r: any) => {
        let parsedBody: any;
        try {
          parsedBody = typeof r.body === 'string' ? JSON.parse(r.body) : r.body;
        } catch {
          parsedBody = r.body;
        }
        return {
          id: r.id,
          status_code: r.status_code,
          body: parsedBody,
        };
      });

      return {
        batch_id: batchPayload.batch_request_id,
        total: operations.length,
        results,
      };
    } catch (error) {
      if (error instanceof ServiceNowError) throw error;
      throw new ServiceNowError(
        `Batch request failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'BATCH_FAILED'
      );
    }
  }

  /**
   * Execute a server-side script via the Background Script API.
   * Useful for GlideQuery, GlideAggregate, and complex operations.
   */
  async executeScript(script: string, scope?: string): Promise<any> {
    await this.authenticate();

    // ServiceNow has NO supported REST endpoint for running arbitrary background scripts. The only
    // reliable server-side path is an optional helper the customer installs and reviews: a scoped,
    // secured Scripted REST API. Point us at it with SCRIPT_EXEC_ENDPOINT (e.g. "/api/x_nowaikit/exec")
    // and this executes through it; otherwise we fail with a clear, actionable message rather than
    // silently hitting a non-existent endpoint (the previous implementation targeted a bogus
    // sys_script_execution table wrapped in a malformed Batch request and never worked).
    // 1) Optional customer-installed helper (a scoped, secured Scripted REST API) if configured.
    const endpoint = process.env.SCRIPT_EXEC_ENDPOINT;
    if (endpoint) {
      logger.info('Executing server-side script via SCRIPT_EXEC_ENDPOINT');
      const url = `${this.baseUrl}${endpoint.startsWith('/') ? endpoint : '/' + endpoint}`;
      const response = await this.request<any>(url, {
        method: 'POST',
        body: JSON.stringify({ script, scope: scope || 'global' }),
      });
      return { status: 200, output: (response && response.result !== undefined) ? response.result : response, scope: scope || 'global' };
    }

    // 2) Default (no install): run via a one-time, self-terminating scheduled job. ServiceNow has no
    // REST endpoint to run background scripts, but the SCHEDULER is a separate path — and the job record
    // is created with the Table API, which works. The wrapper captures the result to a temp property,
    // then deactivates and deletes the job.
    return await this.executeViaScheduledJob(script);
  }

  private async executeViaScheduledJob(script: string): Promise<any> {
    const runId = `nwk_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e9).toString(36)}`;
    const jobName = `NowAIKit exec ${runId}`;
    const prop = `nowaikit.exec.${runId}`;
    const wrapper =
      `var __r, __e = null;\n` +
      `try { __r = (function(){\n${script}\n})(); } catch (e) { __e = '' + e; }\n` +
      `try { gs.setProperty(${JSON.stringify(prop)}, JSON.stringify({ ok: __e === null, result: (__r === undefined ? null : __r), error: __e })); } catch (ig) {}\n` +
      `try { var __j = new GlideRecord('sysauto_script'); if (__j.get('name', ${JSON.stringify(jobName)})) { __j.active = false; __j.deleteRecord(); } } catch (ig) {}\n`;
    const nowGmt = new Date().toISOString().replace('T', ' ').slice(0, 19);

    let jobSysId: string | undefined;
    try {
      const job = await this.createRecord('sysauto_script', {
        name: jobName, script: wrapper, active: 'true', run_type: 'once', run_start: nowGmt, next_action: nowGmt,
      });
      jobSysId = (job as any)?.sys_id;
    } catch (e) {
      throw new ServiceNowError(
        `Server-side script execution needs to create a one-time scheduled job (sysauto_script), but that ` +
        `write was rejected: ${e instanceof Error ? e.message : String(e)}. ` +
        `Alternatives: use the Table API tools for data changes, run it in ServiceNow (Scripts - Background), ` +
        `or install the optional script-exec helper and set SCRIPT_EXEC_ENDPOINT.`,
        'SCRIPT_EXEC_UNAVAILABLE',
      );
    }

    // Poll for the result property (scheduler latency is typically a few to ~60s).
    const deadline = Date.now() + 90_000;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 3000));
      const res = await this.queryRecords({ table: 'sys_properties', query: `name=${prop}`, fields: 'sys_id,value', limit: 1 });
      if (res.count > 0) {
        const rec = res.records[0] as any;
        try { await this.deleteRecord('sys_properties', rec.sys_id); } catch { /* leave it */ }
        let parsed: any;
        try { parsed = JSON.parse(rec.value); } catch { parsed = { ok: true, result: rec.value }; }
        return { status: 200, ...parsed, via: 'scheduled-job' };
      }
    }
    throw new ServiceNowError(
      `Script was scheduled (sysauto_script "${jobName}"${jobSysId ? ' ' + jobSysId : ''}) but did not report a ` +
      `result within 90s — the scheduler may be backed up or the script was blocked by instance hardening. ` +
      `Check the job and its output on the instance.`,
      'SCRIPT_EXEC_TIMEOUT',
    );
  }

  /**
   * Natural language update (simplified implementation)
   */
  async naturalLanguageUpdate(_instruction: string, _table: string): Promise<any> {
    // This is a simplified implementation - a full version would parse
    // the instruction to extract record identifier and field updates
    logger.warn('Natural language update uses best-effort parsing; verify the result before applying');

    throw new ServiceNowError(
      'Natural language update requires custom parsing logic - not yet implemented',
      'NOT_IMPLEMENTED'
    );
  }
}

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

// ─── Input validation helpers ────────────────────────────────────────────────

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
function validateQuery(query: string): string {
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
  }

  /**
   * Return a copy of this client configured to run as a specific user.
   * Used for per-request user context switching without mutating the shared client.
   */
  withUser(options: { sysId?: string; bearerToken?: string }): ServiceNowClient {
    const copy = Object.create(Object.getPrototypeOf(this)) as ServiceNowClient;
    Object.assign(copy, this);
    if (options.sysId) {
      copy.authMode = 'impersonation';
      copy.impersonateUserSysId = options.sysId;
    }
    if (options.bearerToken) {
      copy.authMode = 'per-user';
      copy.perUserBearerToken = options.bearerToken;
    }
    return copy;
  }

  /**
   * Authenticate with ServiceNow using OAuth or Basic Auth
   */
  private async authenticate(): Promise<void> {
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
            }
          } catch {
            // Error response wasn't JSON, use status text
          }

          // Map HTTP status to error codes
          let errorCode = 'API_ERROR';
          if (response.status === 401) {
            errorCode = 'AUTHENTICATION_FAILED';
          } else if (response.status === 403) {
            errorCode = 'INSUFFICIENT_PRIVILEGES';
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
          if (['AUTHENTICATION_FAILED', 'INVALID_REQUEST', 'NOT_FOUND'].includes(error.code)) {
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

    if (params.limit !== undefined) {
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
        queryParams.set('sysparm_query',
          params.query
            ? `${params.query}^ORDERBY${field}^ORDERBYDESC`
            : `ORDERBY${field}^ORDERBYDESC`
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
  async getRecord(table: string, sysId: string, fields?: string): Promise<ServiceNowRecord> {
    validateTableName(table);
    validateSysId(sysId);
    await this.authenticate();

    const queryParams = new URLSearchParams();
    if (fields) {
      queryParams.set('sysparm_fields', fields);
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
    const query = `user_name=${userIdentifier}^ORemail=${userIdentifier}`;
    const url = `${this.baseUrl}/api/now/table/sys_user?sysparm_query=${query}&sysparm_limit=1`;

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
    const query = isSysId ? `sys_id=${groupIdentifier}` : `name=${groupIdentifier}`;
    const url = `${this.baseUrl}/api/now/table/sys_user_group?sysparm_query=${query}&sysparm_limit=1`;

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
      return response.result;
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
      if (error instanceof ServiceNowError) throw error;
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
    await this.authenticate();

    const url = `${this.baseUrl}/api/now/attachment/file?table_name=${encodeURIComponent(table)}&table_sys_id=${encodeURIComponent(recordSysId)}&file_name=${encodeURIComponent(fileName)}`;

    logger.info(`Uploading attachment "${fileName}" to ${table}:${recordSysId}`);

    try {
      // Decode base64 to binary
      const binary = Buffer.from(contentBase64, 'base64');

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
          if (errorJson.error?.message) errorMessage = errorJson.error.message;
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

  /**
   * Natural language update (simplified implementation)
   */
  async naturalLanguageUpdate(_instruction: string, _table: string): Promise<any> {
    // This is a simplified implementation - a full version would parse
    // the instruction to extract record identifier and field updates
    logger.warn('Natural language update is experimental and requires manual parsing');

    throw new ServiceNowError(
      'Natural language update requires custom parsing logic - not yet implemented',
      'NOT_IMPLEMENTED'
    );
  }
}

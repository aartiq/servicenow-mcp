/**
 * Multi-instance manager for NowAIKit.
 *
 * Supports connecting to multiple ServiceNow instances (e.g. dev, staging, prod,
 * or multiple customers) from a single MCP session.
 *
 * Configuration methods (in priority order):
 *   1. SN_INSTANCES_CONFIG — path to an instances.json file
 *   2. SN_INSTANCE_<NAME>_URL / SN_INSTANCE_<NAME>_AUTH env var groups
 *   3. Single-instance legacy env vars (SERVICENOW_INSTANCE_URL, etc.) → registered as "default"
 *
 * Usage:
 *   import { instanceManager } from './instances.js';
 *   const client = instanceManager.getClient();          // current instance
 *   const client = instanceManager.getClient('prod');    // specific instance
 *   instanceManager.switch('prod');                      // switch active instance
 */
import { readFileSync, existsSync, writeFileSync, chmodSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

// ─── Local per-user OAuth token store (written by `nowaikit auth login`) ─────────────────────────
// Read/write here directly (rather than importing the CLI layer) to avoid a servicenow→cli import.
function tokenStorePath(): string { return join(homedir(), '.config', 'nowaikit', 'tokens.json'); }
function storeKey(url: string): string { return url.replace(/https?:\/\//, '').replace(/[^a-z0-9]/gi, '_'); }
interface StoredToken { accessToken: string; refreshToken: string; expiresAt: number; snUser?: string; snUserSysId?: string }
function readStoredToken(url: string): StoredToken | undefined {
  try {
    const store = JSON.parse(readFileSync(tokenStorePath(), 'utf8')) as { tokens?: Record<string, StoredToken> };
    return store.tokens?.[storeKey(url)];
  } catch { return undefined; }
}
function writeStoredToken(url: string, t: { accessToken: string; refreshToken: string; expiresAt: number }): void {
  try {
    const p = tokenStorePath();
    const store = (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : { tokens: {} }) as { tokens: Record<string, StoredToken> };
    const prev = store.tokens[storeKey(url)] || {} as StoredToken;
    store.tokens[storeKey(url)] = { ...prev, accessToken: t.accessToken, refreshToken: t.refreshToken, expiresAt: t.expiresAt };
    writeFileSync(p, JSON.stringify(store, null, 2), { encoding: 'utf8', mode: 0o600 });
    try { chmodSync(p, 0o600); } catch { /* Windows: ignore */ }
  } catch { /* best-effort persistence */ }
}
import { ServiceNowClient } from './client.js';
import type { ServiceNowConfig } from './types.js';

interface InstanceEntry {
  name: string;
  url: string;
  group: string;
  environment: string;
  client: ServiceNowClient;
}

export class InstanceManager {
  private instances: Map<string, InstanceEntry> = new Map();
  private currentName: string = 'default';

  constructor() {
    this.loadInstances();
  }

  /**
   * Decide the starting instance. SN_DEFAULT_INSTANCE always wins over a config file's own default,
   * whichever source loaded the instances (SN_INSTANCES_CONFIG, the wizard store, or env groups).
   * Matched case-insensitively, since env names are lower-cased but file names keep their case.
   * Returns the registered instance name, or undefined if neither choice matches.
   */
  private pickDefault(fileDefault?: string): string | undefined {
    const find = (want: string) => {
      const w = want.toLowerCase();
      for (const name of this.instances.keys()) if (name.toLowerCase() === w) return name;
      return undefined;
    };
    const fromEnv = (process.env.SN_DEFAULT_INSTANCE || '').trim();
    if (fromEnv) {
      const hit = find(fromEnv);
      if (hit) return hit;
      process.stderr.write(
        `[nowaikit] SN_DEFAULT_INSTANCE="${fromEnv}" does not match any configured instance ` +
          `(${[...this.instances.keys()].join(', ') || 'none'}). Falling back to the config default.\n`
      );
    }
    return fileDefault ? find(fileDefault) : undefined;
  }

  private loadInstances(): void {
    // 1. Try instances.json config file
    const configPath = process.env.SN_INSTANCES_CONFIG;
    if (configPath && existsSync(configPath)) {
      try {
        const raw = JSON.parse(readFileSync(configPath, 'utf8'));
        const defaultName: string = raw.default_instance || raw.default || 'default';
        for (const [name, cfg] of Object.entries(raw.instances || {})) {
          const c = cfg as any;
          this.register(name, this.buildConfig(
            c.instance_url || c.url,
            c.auth_method || c.auth || 'basic',
            c
          ), c.group || 'Default', c.environment || '');
        }
        const chosen = this.pickDefault(defaultName);
        if (chosen) this.currentName = chosen;
        return;
      } catch {
        // fall through to env vars
      }
    }

    // 2. Try the wizard config store (~/.config/nowaikit/instances.json)
    //    Written by `nowaikit setup` — allows the HTTP server and MCP server
    //    to work without a .env file after running the setup wizard.
    const wizardConfigPath = join(homedir(), '.config', 'nowaikit', 'instances.json');
    if (existsSync(wizardConfigPath)) {
      try {
        const raw = JSON.parse(readFileSync(wizardConfigPath, 'utf8'));
        const defaultName: string = raw.defaultInstance || 'default';
        for (const [name, cfg] of Object.entries(raw.instances || {})) {
          const c = cfg as Record<string, unknown>;
          const url = c['instanceUrl'] as string;
          const authMethod = (c['authMethod'] as 'basic' | 'oauth') || 'basic';
          const group = (c['group'] as string) || 'Default';
          const environment = (c['environment'] as string) || '';

          // Local per-user OAuth: if the user ran `nowaikit auth login`, use their own stored token
          // and let the client refresh it (self-heals the 30-min token, no launcher needed). This
          // path is entirely separate from the multi-tenant gateway (which injects tokens via the
          // SERVICENOW_BEARER_TOKEN env branch and never reads this config file), and from basic/ROPC.
          const stored = authMethod === 'oauth' ? readStoredToken(url) : undefined;
          if (stored?.accessToken && stored.refreshToken && c['clientId']) {
            this.register(name, {
              instanceUrl: url,
              authMethod: 'oauth',
              authMode: 'per-user',
              perUserBearerToken: stored.accessToken,
              perUserRefreshToken: stored.refreshToken,
              perUserTokenExpiry: stored.expiresAt,
              oauth: {
                clientId: c['clientId'] as string | undefined,
                clientSecret: c['clientSecret'] as string | undefined,
              },
              onTokenRefreshed: (t) => writeStoredToken(url, t),
            }, group, environment);
            continue;
          }

          this.register(name, {
            instanceUrl: url,
            authMethod,
            basic: {
              username: c['username'] as string | undefined,
              password: c['password'] as string | undefined,
            },
            oauth: {
              clientId: c['clientId'] as string | undefined,
              clientSecret: c['clientSecret'] as string | undefined,
              username: c['username'] as string | undefined,
              password: c['password'] as string | undefined,
            },
          }, group, environment);
        }
        const chosen = this.pickDefault(defaultName);
        if (chosen) this.currentName = chosen;

        // Apply permission flags from the instance actually selected (not the file's default, which
        // would hand e.g. MRE the write/scripting flags configured for demo2) to process.env so
        // permissions.ts can read them. Only set if not already provided by the client config
        // (env vars from Claude Desktop, Cursor, etc.).
        const defaultCfg = (chosen ? raw.instances?.[chosen] : undefined) as Record<string, unknown> | undefined;
        if (defaultCfg) {
          const permMap: Record<string, string> = {
            writeEnabled: 'WRITE_ENABLED',
            scriptingEnabled: 'SCRIPTING_ENABLED',
            cmdbWriteEnabled: 'CMDB_WRITE_ENABLED',
            atfEnabled: 'ATF_ENABLED',
            nowAssistEnabled: 'NOW_ASSIST_ENABLED',
          };
          for (const [jsonKey, envKey] of Object.entries(permMap)) {
            if (process.env[envKey] === undefined && defaultCfg[jsonKey] !== undefined) {
              process.env[envKey] = defaultCfg[jsonKey] ? 'true' : 'false';
            }
          }
        }

        return;
      } catch {
        // fall through to env vars
      }
    }

    // 3. Try SN_INSTANCE_<NAME>_URL env var groups (manual multi-instance env config)
    const envNames = Object.keys(process.env)
      .filter(k => /^SN_INSTANCE_[A-Z0-9_]+_URL$/.test(k))
      .map(k => k.replace(/^SN_INSTANCE_/, '').replace(/_URL$/, '').toLowerCase());

    for (const name of envNames) {
      const upper = name.toUpperCase();
      const url = process.env[`SN_INSTANCE_${upper}_URL`];
      const auth = (process.env[`SN_INSTANCE_${upper}_AUTH`] || 'basic') as 'oauth' | 'basic';
      if (!url) continue;
      this.register(name, {
        instanceUrl: url,
        authMethod: auth,
        basic: {
          username: process.env[`SN_INSTANCE_${upper}_USERNAME`],
          password: process.env[`SN_INSTANCE_${upper}_PASSWORD`],
        },
        oauth: {
          clientId: process.env[`SN_INSTANCE_${upper}_CLIENT_ID`],
          clientSecret: process.env[`SN_INSTANCE_${upper}_CLIENT_SECRET`],
          username: process.env[`SN_INSTANCE_${upper}_USERNAME`],
          password: process.env[`SN_INSTANCE_${upper}_PASSWORD`],
        },
      });
    }

    if (envNames.length) {
      const chosen = this.pickDefault();
      if (chosen) this.currentName = chosen;
    }

    // 4. Legacy single-instance env vars → register as "default" if no others loaded
    //    Supports both SERVICENOW_OAUTH_* (documented in .env.example) and the
    //    older unprefixed SERVICENOW_CLIENT_ID / SERVICENOW_USERNAME forms.
    const legacyUrl = process.env.SERVICENOW_INSTANCE_URL;
    if (legacyUrl && !this.instances.has('default')) {
      // Delegated auth: a pre-obtained access token (e.g. supplied by a host that
      // already manages the OAuth session). Per-user mode sends it as `Bearer
      // <token>` and skips all service-account token acquisition — so a caller with
      // only an access token (no username/password, no client_credentials that this
      // server could exchange) can still connect over stdio.
      const bearer = process.env.SERVICENOW_BEARER_TOKEN || process.env.SN_BEARER_TOKEN;
      if (bearer) {
        this.register('default', {
          instanceUrl: legacyUrl,
          authMethod: 'oauth', // unused in per-user mode; the bearer token is authoritative
          authMode: 'per-user',
          perUserBearerToken: bearer,
          maxRetries: parseInt(process.env.MAX_RETRIES || '3', 10),
          retryDelayMs: parseInt(process.env.RETRY_DELAY_MS || '1000', 10),
          requestTimeoutMs: parseInt(process.env.REQUEST_TIMEOUT_MS || '30000', 10),
        });
        if (this.instances.size === 1) this.currentName = 'default';
        return;
      }
      const auth = (process.env.SERVICENOW_AUTH_METHOD || 'basic') as 'oauth' | 'basic';
      this.register('default', {
        instanceUrl: legacyUrl,
        authMethod: auth,
        basic: {
          // SERVICENOW_USERNAME / _PASSWORD (and the SN_USERNAME alias) also work for basic auth.
          username: process.env.SERVICENOW_BASIC_USERNAME || process.env.SERVICENOW_USERNAME,
          password: process.env.SERVICENOW_BASIC_PASSWORD || process.env.SERVICENOW_PASSWORD,
        },
        oauth: {
          clientId: process.env.SERVICENOW_OAUTH_CLIENT_ID || process.env.SERVICENOW_CLIENT_ID,
          clientSecret: process.env.SERVICENOW_OAUTH_CLIENT_SECRET || process.env.SERVICENOW_CLIENT_SECRET,
          username: process.env.SERVICENOW_OAUTH_USERNAME || process.env.SERVICENOW_USERNAME,
          password: process.env.SERVICENOW_OAUTH_PASSWORD || process.env.SERVICENOW_PASSWORD,
        },
        maxRetries: parseInt(process.env.MAX_RETRIES || '3', 10),
        retryDelayMs: parseInt(process.env.RETRY_DELAY_MS || '1000', 10),
        requestTimeoutMs: parseInt(process.env.REQUEST_TIMEOUT_MS || '30000', 10),
      });
      if (this.instances.size === 1) this.currentName = 'default';
    }
  }

  private buildConfig(url: string, auth: 'oauth' | 'basic', c: any): ServiceNowConfig {
    return {
      instanceUrl: url,
      authMethod: auth,
      basic: { username: c.username, password: c.password },
      oauth: {
        clientId: c.client_id,
        clientSecret: c.client_secret,
        username: c.username,
        password: c.password,
      },
      maxRetries: c.max_retries ?? parseInt(process.env.MAX_RETRIES || '3', 10),
      retryDelayMs: c.retry_delay_ms || parseInt(process.env.RETRY_DELAY_MS || '1000', 10),
      requestTimeoutMs: c.request_timeout_ms || parseInt(process.env.REQUEST_TIMEOUT_MS || '30000', 10),
    };
  }

  private register(name: string, config: ServiceNowConfig, group = 'Default', environment = ''): void {
    this.instances.set(name, {
      name,
      url: config.instanceUrl,
      group,
      environment,
      client: new ServiceNowClient(config),
    });
  }

  /** Return client for named instance (or current instance if no name given). */
  getClient(name?: string): ServiceNowClient {
    const target = name ? name.toLowerCase() : this.currentName;
    const entry = this.instances.get(target);
    if (!entry) {
      throw new Error(`Unknown instance "${target}". Available: ${this.listNames().join(', ')}`);
    }
    return entry.client;
  }

  /** Reload instances from config files (call after config is updated). */
  reload(): void {
    this.instances.clear();
    this.currentName = 'default';
    this.loadInstances();
  }

  /** Switch the active instance for the session. */
  switch(name: string): void {
    const lower = name.toLowerCase();
    if (!this.instances.has(lower)) {
      throw new Error(`Unknown instance "${name}". Available: ${this.listNames().join(', ')}`);
    }
    this.currentName = lower;
  }

  getCurrentName(): string {
    return this.currentName;
  }

  getCurrentUrl(): string {
    return this.instances.get(this.currentName)?.url || '';
  }

  listNames(): string[] {
    return Array.from(this.instances.keys());
  }

  listAll(): Array<{ name: string; url: string; active: boolean; group: string; environment: string }> {
    return Array.from(this.instances.values()).map(e => ({
      name: e.name,
      url: e.url,
      active: e.name === this.currentName,
      group: e.group,
      environment: e.environment,
    }));
  }
}

export const instanceManager = new InstanceManager();

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
import { readFileSync, existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { ServiceNowClient } from './client.js';
import type { ServiceNowConfig } from './types.js';

interface InstanceEntry {
  name: string;
  url: string;
  group: string;
  environment: string;
  client: ServiceNowClient;
}

class InstanceManager {
  private instances: Map<string, InstanceEntry> = new Map();
  private currentName: string = 'default';

  constructor() {
    this.loadInstances();
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
        if (this.instances.has(defaultName)) this.currentName = defaultName;
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
          this.register(name, {
            instanceUrl: c['instanceUrl'] as string,
            authMethod: (c['authMethod'] as 'basic' | 'oauth') || 'basic',
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
          }, (c['group'] as string) || 'Default', (c['environment'] as string) || '');
        }
        if (this.instances.has(defaultName)) this.currentName = defaultName;

        // Apply permission flags from the default instance to process.env
        // so permissions.ts can read them. Only set if not already provided
        // by the client config (env vars from Claude Desktop, Cursor, etc.).
        const defaultCfg = raw.instances?.[defaultName] as Record<string, unknown> | undefined;
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

    const defaultEnvName = (process.env.SN_DEFAULT_INSTANCE || '').toLowerCase();
    if (defaultEnvName && this.instances.has(defaultEnvName)) {
      this.currentName = defaultEnvName;
    }

    // 4. Legacy single-instance env vars → register as "default" if no others loaded
    //    Supports both SERVICENOW_OAUTH_* (documented in .env.example) and the
    //    older unprefixed SERVICENOW_CLIENT_ID / SERVICENOW_USERNAME forms.
    const legacyUrl = process.env.SERVICENOW_INSTANCE_URL;
    if (legacyUrl && !this.instances.has('default')) {
      const auth = (process.env.SERVICENOW_AUTH_METHOD || 'basic') as 'oauth' | 'basic';
      this.register('default', {
        instanceUrl: legacyUrl,
        authMethod: auth,
        basic: {
          username: process.env.SERVICENOW_BASIC_USERNAME,
          password: process.env.SERVICENOW_BASIC_PASSWORD,
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
      maxRetries: c.max_retries || parseInt(process.env.MAX_RETRIES || '3', 10),
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

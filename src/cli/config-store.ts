/**
 * Persistent config store for nowaikit CLI.
 * Stores named instance configs at ~/.config/nowaikit/instances.json
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import type { LlmProvider } from '../direct/llm-client.js';

/** Integration mode — how NowAIKit is consumed. */
export type IntegrationMode = 'mcp' | 'sdk' | 'both';

export interface InstanceConfig {
  name: string;
  instanceUrl: string;
  authMethod: 'basic' | 'oauth';
  username?: string;
  password?: string;
  clientId?: string;
  clientSecret?: string;
  authMode?: 'service-account' | 'per-user' | 'impersonation';
  writeEnabled?: boolean;
  scriptingEnabled?: boolean;
  cmdbWriteEnabled?: boolean;
  atfEnabled?: boolean;
  toolPackage?: string;
  nowAssistEnabled?: boolean;
  /**
   * Integration mode: mcp (default), sdk, or both.
   * @deprecated Use mcpEnabled / sdkEnabled booleans instead.
   *             Kept for backward compatibility — computed from booleans when present.
   */
  integrationMode?: IntegrationMode;
  /** MCP Server enabled — AI clients discover and call tools automatically */
  mcpEnabled?: boolean;
  /** TypeScript SDK enabled — import NowAIKit in your code */
  sdkEnabled?: boolean;
  /** Apex AI Skills: enable 26 scan/review/build/ops/docs capabilities */
  apexEnabled?: boolean;
  /** AI provider for direct mode capabilities */
  aiProvider?: LlmProvider;
  /** AI model name (e.g. 'claude-sonnet-4-6', 'llama3.3') */
  aiModel?: string;
  /** API key for cloud providers (Anthropic/OpenAI) */
  aiApiKey?: string;
  /** Custom base URL override for the AI provider endpoint */
  aiBaseUrl?: string;
  group?: string;
  environment?: string;
  addedAt: string;
}

/**
 * Migrate a loaded InstanceConfig that may have only `integrationMode` set to
 * also include the new granular boolean fields.  Runs in place.
 */
export function migrateInstanceConfig(instance: InstanceConfig): InstanceConfig {
  // If the new fields are already present, nothing to do
  if (instance.mcpEnabled !== undefined || instance.sdkEnabled !== undefined) {
    // Still compute integrationMode from booleans for backward compat
    if (instance.mcpEnabled !== undefined || instance.sdkEnabled !== undefined) {
      const mcp = instance.mcpEnabled ?? true;
      const sdk = instance.sdkEnabled ?? false;
      if (mcp && sdk) instance.integrationMode = 'both';
      else if (sdk) instance.integrationMode = 'sdk';
      else instance.integrationMode = 'mcp';
    }
    return instance;
  }

  // Migrate from legacy integrationMode
  switch (instance.integrationMode) {
    case 'sdk':
      instance.mcpEnabled = false;
      instance.sdkEnabled = true;
      break;
    case 'both':
      instance.mcpEnabled = true;
      instance.sdkEnabled = true;
      break;
    case 'mcp':
    default:
      instance.mcpEnabled = true;
      instance.sdkEnabled = false;
      break;
  }

  return instance;
}

export interface NowaikitConfig {
  version: number;
  defaultInstance: string;
  instances: Record<string, InstanceConfig>;
}

function configDir(): string {
  return join(homedir(), '.config', 'nowaikit');
}

function configPath(): string {
  return join(configDir(), 'instances.json');
}

function ensureDir(): void {
  const dir = configDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

export function loadConfig(): NowaikitConfig {
  const path = configPath();
  if (!existsSync(path)) {
    return { version: 1, defaultInstance: '', instances: {} };
  }
  try {
    const cfg = JSON.parse(readFileSync(path, 'utf8')) as NowaikitConfig;
    // Run migration on every loaded instance so callers always see the new fields
    for (const key of Object.keys(cfg.instances)) {
      cfg.instances[key] = migrateInstanceConfig(cfg.instances[key]);
    }
    return cfg;
  } catch {
    return { version: 1, defaultInstance: '', instances: {} };
  }
}

export function saveConfig(config: NowaikitConfig): void {
  ensureDir();
  writeFileSync(configPath(), JSON.stringify(config, null, 2), 'utf8');
}

export function addInstance(instance: InstanceConfig): void {
  const config = loadConfig();
  config.instances[instance.name] = instance;
  if (!config.defaultInstance) {
    config.defaultInstance = instance.name;
  }
  saveConfig(config);
}

export function listInstances(): InstanceConfig[] {
  const config = loadConfig();
  return Object.values(config.instances);
}

export function getDefaultInstance(): InstanceConfig | undefined {
  const config = loadConfig();
  return config.instances[config.defaultInstance];
}

export function removeInstance(name: string): boolean {
  const config = loadConfig();
  if (!config.instances[name]) return false;
  delete config.instances[name];
  if (config.defaultInstance === name) {
    const remaining = Object.keys(config.instances);
    config.defaultInstance = remaining[0] || '';
  }
  saveConfig(config);
  return true;
}

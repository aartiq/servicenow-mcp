/**
 * Config writers — each writer knows how to inject nowaikit into a specific AI client.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import type { InstanceConfig } from '../config-store.js';
import type { DetectedClient } from '../detect-clients.js';

export interface WriteResult {
  success: boolean;
  message: string;
}

/** Build the env block that goes into any JSON-based MCP config. */
function buildEnvBlock(instance: InstanceConfig): Record<string, string> {
  const env: Record<string, string> = {
    SERVICENOW_INSTANCE_URL: instance.instanceUrl,
    SERVICENOW_AUTH_METHOD: instance.authMethod,
    WRITE_ENABLED: instance.writeEnabled ? 'true' : 'false',
    SCRIPTING_ENABLED: instance.scriptingEnabled ? 'true' : 'false',
    CMDB_WRITE_ENABLED: instance.cmdbWriteEnabled ? 'true' : 'false',
    ATF_ENABLED: instance.atfEnabled ? 'true' : 'false',
    MCP_TOOL_PACKAGE: instance.toolPackage || 'full',
  };
  if (instance.authMethod === 'basic') {
    env['SERVICENOW_BASIC_USERNAME'] = instance.username || '';
    env['SERVICENOW_BASIC_PASSWORD'] = instance.password || '';
  } else {
    env['SERVICENOW_OAUTH_CLIENT_ID'] = instance.clientId || '';
    env['SERVICENOW_OAUTH_CLIENT_SECRET'] = instance.clientSecret || '';
    env['SERVICENOW_OAUTH_USERNAME'] = instance.username || '';
    env['SERVICENOW_OAUTH_PASSWORD'] = instance.password || '';
  }
  if (instance.authMode && instance.authMode !== 'service-account') {
    env['SERVICENOW_AUTH_MODE'] = instance.authMode;
  }
  env['NOW_ASSIST_ENABLED'] = instance.nowAssistEnabled ? 'true' : 'false';
  if (instance.group) {
    env['SN_INSTANCE_GROUP'] = instance.group;
  }
  if (instance.environment) {
    env['SN_INSTANCE_ENVIRONMENT'] = instance.environment;
  }
  return env;
}

/** Absolute path to the compiled server entry point. */
function serverPath(): string {
  // dist/server.js relative to project root (where package.json lives)
  // Use fileURLToPath to handle Windows drive letters correctly (avoids /C:/... issue)
  const pkgDir = fileURLToPath(new URL('../../../', import.meta.url)).replace(/[\\/]$/, '');
  return join(pkgDir, 'dist', 'server.js');
}

/** Read + merge JSON config, creating it if needed. */
function mergeJsonConfig(path: string, key: string, entry: Record<string, unknown>): void {
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  let existing: Record<string, unknown> = {};
  if (existsSync(path)) {
    try {
      existing = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
    } catch {
      existing = {};
    }
  }

  if (!existing[key] || typeof existing[key] !== 'object') {
    existing[key] = {};
  }
  (existing[key] as Record<string, unknown>)['nowaikit'] = entry;
  writeFileSync(path, JSON.stringify(existing, null, 2), 'utf8');
}

/** Write to any client that uses `mcpServers` JSON key. */
function writeMcpServersJson(client: DetectedClient, instance: InstanceConfig): WriteResult {
  const entry = {
    command: 'node',
    args: [serverPath()],
    env: buildEnvBlock(instance),
  };
  try {
    mergeJsonConfig(client.configPath, 'mcpServers', entry);
    return { success: true, message: `Written to ${client.configPath}` };
  } catch (err) {
    return { success: false, message: `Failed to write ${client.configPath}: ${err}` };
  }
}

/** Write to VS Code (.vscode/mcp.json) which uses `servers` key + `type: stdio`. */
function writeVsCodeJson(client: DetectedClient, instance: InstanceConfig): WriteResult {
  const entry = {
    type: 'stdio',
    command: 'node',
    args: [serverPath()],
    env: buildEnvBlock(instance),
  };
  try {
    mergeJsonConfig(client.configPath, 'servers', entry);
    return { success: true, message: `Written to ${client.configPath}` };
  } catch (err) {
    return { success: false, message: `Failed to write ${client.configPath}: ${err}` };
  }
}

/** Run `claude mcp add` for Claude Code. */
function writeClaudeCode(_client: DetectedClient, instance: InstanceConfig): WriteResult {
  const env = buildEnvBlock(instance);
  const envFlags = Object.entries(env)
    .map(([k, v]) => `--env ${k}=${v}`)
    .join(' ');
  const cmd = `claude mcp add nowaikit node ${serverPath()} ${envFlags}`;
  try {
    execSync(cmd, { stdio: 'pipe' });
    return { success: true, message: 'Added via `claude mcp add nowaikit`' };
  } catch (err) {
    return { success: false, message: `claude mcp add failed: ${err}` };
  }
}

/** Write a .env file. */
function writeDotEnv(client: DetectedClient, instance: InstanceConfig): WriteResult {
  const env = buildEnvBlock(instance);
  const lines = Object.entries(env).map(([k, v]) => `${k}=${v}`).join('\n');
  try {
    writeFileSync(client.configPath, lines + '\n', 'utf8');
    return { success: true, message: `Written to ${client.configPath}` };
  } catch (err) {
    return { success: false, message: `Failed to write .env: ${err}` };
  }
}

/** Write to the appropriate config based on client type. */
export function writeClientConfig(client: DetectedClient, instance: InstanceConfig): WriteResult {
  switch (client.writeMethod) {
    case 'json-mcpServers':
      return writeMcpServersJson(client, instance);
    case 'json-servers':
      return writeVsCodeJson(client, instance);
    case 'command':
      return writeClaudeCode(client, instance);
    case 'env':
      return writeDotEnv(client, instance);
    default:
      return { success: false, message: `Unknown write method: ${client.writeMethod}` };
  }
}

/**
 * Auto-detect installed AI clients and their MCP config paths.
 * Checks app binaries and known config file locations per platform.
 */
import { existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { execSync } from 'child_process';

export type WriteMethod = 'json-mcpServers' | 'json-servers' | 'command' | 'env';

export interface DetectedClient {
  id: string;
  name: string;
  detected: boolean;
  configPath: string;
  /** JSON key inside the config that holds the server map */
  configKey: string;
  /** How the wizard writes the entry */
  writeMethod: WriteMethod;
  requiresRestart: boolean;
  /** Extra note shown to the user after writing */
  note?: string;
}

function which(bin: string): boolean {
  try {
    // Use 'where' on Windows, 'which' on Unix
    const cmd = process.platform === 'win32' ? `where ${bin}` : `which ${bin}`;
    execSync(cmd, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function appExists(macPath: string, winExe: string, linuxBin: string): boolean {
  const p = process.platform;
  if (p === 'darwin') return existsSync(macPath);
  if (p === 'win32') {
    const localAppData = process.env['LOCALAPPDATA'] || '';
    return existsSync(join(localAppData, winExe));
  }
  return which(linuxBin);
}

export function detectClients(): DetectedClient[] {
  const home = homedir();
  const p = process.platform;
  const appData = process.env['APPDATA'] || join(home, 'AppData', 'Roaming');

  const clients: DetectedClient[] = [
    {
      id: 'claude-desktop',
      name: 'Claude Desktop',
      detected: false,
      configPath:
        p === 'win32'
          ? join(appData, 'Claude', 'claude_desktop_config.json')
          : p === 'darwin'
          ? join(home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json')
          : join(home, '.config', 'Claude', 'claude_desktop_config.json'),
      configKey: 'mcpServers',
      writeMethod: 'json-mcpServers',
      requiresRestart: true,
      note: 'Restart Claude Desktop to activate.',
    },
    {
      id: 'cursor',
      name: 'Cursor',
      detected: false,
      configPath:
        p === 'win32'
          ? join(appData, 'Cursor', 'mcp.json')
          : join(home, '.cursor', 'mcp.json'),
      configKey: 'mcpServers',
      writeMethod: 'json-mcpServers',
      requiresRestart: true,
      note: 'Reload Cursor window (Cmd/Ctrl+Shift+P → Reload Window) to activate.',
    },
    {
      id: 'vscode',
      name: 'VS Code (GitHub Copilot)',
      detected: false,
      configPath: join(process.cwd(), '.vscode', 'mcp.json'),
      configKey: 'servers',
      writeMethod: 'json-servers',
      requiresRestart: false,
      note: 'VS Code reads .vscode/mcp.json from the workspace root. Open the workspace folder in VS Code.',
    },
    {
      id: 'windsurf',
      name: 'Windsurf',
      detected: false,
      configPath:
        p === 'win32'
          ? join(appData, 'Codeium', 'windsurf', 'mcp_config.json')
          : join(home, '.codeium', 'windsurf', 'mcp_config.json'),
      configKey: 'mcpServers',
      writeMethod: 'json-mcpServers',
      requiresRestart: true,
      note: 'Restart Windsurf to activate.',
    },
    {
      id: 'continue',
      name: 'Continue.dev',
      detected: false,
      configPath: join(home, '.continue', 'config.json'),
      configKey: 'mcpServers',
      writeMethod: 'json-mcpServers',
      requiresRestart: false,
      note: 'Continue.dev will pick up the change automatically.',
    },
    {
      id: 'claude-code',
      name: 'Claude Code (CLI)',
      detected: false,
      configPath: '',
      configKey: '',
      writeMethod: 'command',
      requiresRestart: false,
      note: 'The `claude mcp add` command will be run automatically.',
    },
    {
      id: 'dotenv',
      name: 'Generate .env file only',
      detected: true,
      configPath: join(process.cwd(), '.env'),
      configKey: '',
      writeMethod: 'env',
      requiresRestart: false,
      note: 'Set SERVICENOW_INSTANCE_URL and credentials in the generated .env file.',
    },
  ];

  return clients.map(c => {
    if (c.id === 'claude-desktop') {
      return {
        ...c,
        detected:
          existsSync(c.configPath) ||
          appExists(
            '/Applications/Claude.app',
            join('AnthropicClaude', 'claude.exe'),
            'claude-desktop'
          ),
      };
    }
    if (c.id === 'cursor') {
      return {
        ...c,
        detected:
          existsSync(c.configPath) ||
          appExists(
            '/Applications/Cursor.app',
            join('Programs', 'cursor', 'Cursor.exe'),
            'cursor'
          ),
      };
    }
    if (c.id === 'vscode') {
      return {
        ...c,
        detected: appExists(
          '/Applications/Visual Studio Code.app',
          join('Programs', 'Microsoft VS Code', 'Code.exe'),
          'code'
        ),
      };
    }
    if (c.id === 'windsurf') {
      return {
        ...c,
        detected:
          existsSync(c.configPath) ||
          appExists('/Applications/Windsurf.app', join('Programs', 'windsurf', 'Windsurf.exe'), 'windsurf'),
      };
    }
    if (c.id === 'continue') {
      return { ...c, detected: existsSync(c.configPath) };
    }
    if (c.id === 'claude-code') {
      return { ...c, detected: which('claude') };
    }
    return c;
  });
}

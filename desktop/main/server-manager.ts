import { ChildProcess, spawn, execSync } from 'child_process';
import { join } from 'path';
import { existsSync, readFileSync } from 'fs';
import type { InstanceConfig } from './index';

interface ServerStatus {
  running: boolean;
  instance?: string;
  pid?: number;
  startedAt?: string;
  toolCount?: number;
}

export class ServerManager {
  private process: ChildProcess | null = null;
  private status: ServerStatus = { running: false };
  private tools: Array<{ name: string; description: string; inputSchema?: Record<string, unknown> }> = [];

  /**
   * Try to find a system-installed Node.js binary.
   * Returns the path if found, or null if not available.
   */
  private findSystemNode(): string | null {
    const candidates = process.platform === 'win32'
      ? ['node.exe']
      : ['/usr/local/bin/node', '/opt/homebrew/bin/node', '/usr/bin/node'];

    for (const candidate of candidates) {
      if (existsSync(candidate)) return candidate;
    }

    // Try 'which node' as last resort
    try {
      const result = execSync('which node 2>/dev/null || where node 2>NUL', { encoding: 'utf8', timeout: 3000 }).trim();
      if (result && existsSync(result)) return result;
    } catch {
      // Not found
    }

    return null;
  }

  /**
   * Resolve the path to the MCP server entry point.
   * In development: ../dist/server.js (parent nowaikit project)
   * In packaged app: resources/server/server.js
   */
  private getServerPath(): string {
    const resourcePath = join(process.resourcesPath || '', 'server', 'server.js');
    if (existsSync(resourcePath)) return resourcePath;
    return join(__dirname, '..', '..', 'dist', 'server.js');
  }

  /**
   * Build environment variables for the MCP server process.
   */
  private buildEnv(instance: InstanceConfig): Record<string, string> {
    const env: Record<string, string> = {
      SERVICENOW_INSTANCE_URL: instance.instanceUrl,
      SERVICENOW_AUTH_METHOD: instance.authMethod,
      MCP_TOOL_PACKAGE: instance.toolPackage || 'full',
      WRITE_ENABLED: instance.writeEnabled ? 'true' : 'false',
      NOW_ASSIST_ENABLED: instance.nowAssistEnabled ? 'true' : 'false',
    };

    if (instance.authMethod === 'basic') {
      env.SERVICENOW_BASIC_USERNAME = instance.username || '';
      env.SERVICENOW_BASIC_PASSWORD = instance.password || '';
    } else {
      env.SERVICENOW_OAUTH_CLIENT_ID = instance.clientId || '';
      env.SERVICENOW_OAUTH_CLIENT_SECRET = instance.clientSecret || '';
      env.SERVICENOW_OAUTH_USERNAME = instance.username || '';
      env.SERVICENOW_OAUTH_PASSWORD = instance.password || '';
    }

    return env;
  }

  /**
   * Start the MCP server as a child process.
   */
  async start(instance: InstanceConfig): Promise<{ success: boolean; error?: string }> {
    if (this.process) {
      this.stopAll();
    }

    const serverPath = this.getServerPath();
    if (!existsSync(serverPath)) {
      return { success: false, error: `Server not found at ${serverPath}. Run "npm run build" in the nowaikit root directory.` };
    }

    try {
      const env = { ...process.env, ...this.buildEnv(instance) };

      // Server directory — contains package.json ("type":"module") and node_modules
      const serverDir = join(serverPath, '..');

      // Resolve Node.js binary for the server process.
      // The MCP server uses ESM (import syntax), so it needs a Node.js binary.
      // Try system 'node' first (handles ESM better), fall back to Electron's node.
      const systemNode = this.findSystemNode();
      const nodeBin = systemNode || process.execPath;
      const spawnEnv = systemNode
        ? { ...env }
        : { ...env, ELECTRON_RUN_AS_NODE: '1' };

      this.process = spawn(nodeBin, [serverPath], {
        env: spawnEnv,
        cwd: serverDir,
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      });

      // Wait briefly to detect early crashes (e.g., missing modules, bad config)
      const result = await new Promise<{ success: boolean; error?: string }>((resolve) => {
        let stderrOutput = '';
        let resolved = false;

        const onError = (err: Error) => {
          if (resolved) return;
          resolved = true;
          this.status = { running: false };
          this.process = null;
          resolve({ success: false, error: `Failed to start server: ${err.message}` });
        };

        const onExit = (code: number | null) => {
          if (resolved) return;
          resolved = true;
          this.status = { running: false };
          this.process = null;
          const detail = stderrOutput.trim() ? `: ${stderrOutput.trim().split('\n').slice(-3).join(' | ')}` : '';
          resolve({ success: false, error: `Server exited immediately with code ${code}${detail}` });
        };

        const onStderr = (data: Buffer) => {
          stderrOutput += data.toString();
          console.error(`MCP server stderr: ${data}`);
        };

        this.process!.on('error', onError);
        this.process!.on('exit', onExit);
        this.process!.stderr?.on('data', onStderr);

        // If still running after 3 seconds, consider it started
        setTimeout(() => {
          if (resolved) return;
          resolved = true;
          // Remove early-exit handler, replace with long-term one
          this.process!.removeListener('exit', onExit);
          this.process!.removeListener('error', onError);

          this.process!.on('exit', (code) => {
            console.log(`MCP server exited with code ${code}`);
            this.status = { running: false };
            this.process = null;
          });

          this.status = {
            running: true,
            instance: instance.name,
            pid: this.process!.pid,
            startedAt: new Date().toISOString(),
          };

          resolve({ success: true });
        }, 3000);
      });

      return result;
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  /**
   * Stop all running server processes.
   */
  stopAll(): void {
    if (this.process) {
      this.process.kill('SIGTERM');
      this.process = null;
      this.status = { running: false };
    }
  }

  /**
   * Get current server status.
   */
  getStatus(): ServerStatus {
    return { ...this.status };
  }

  /**
   * Test connection to a ServiceNow instance.
   */
  async testConnection(instance: InstanceConfig): Promise<{ success: boolean; error?: string; info?: Record<string, unknown> }> {
    try {
      const url = `${instance.instanceUrl}/api/now/table/sys_properties?sysparm_query=name=instance_name&sysparm_limit=1&sysparm_fields=value`;

      const headers: Record<string, string> = {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      };

      if (instance.authMethod === 'basic') {
        const creds = Buffer.from(`${instance.username}:${instance.password}`).toString('base64');
        headers['Authorization'] = `Basic ${creds}`;
      }

      const response = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });

      if (response.status === 401) {
        return { success: false, error: 'Authentication failed. Check your credentials.' };
      }
      if (response.status === 403) {
        return { success: false, error: 'Access denied. Check user permissions.' };
      }
      if (!response.ok) {
        return { success: false, error: `HTTP ${response.status}: ${response.statusText}` };
      }

      const data = await response.json() as { result?: Array<{ value?: string }> };
      const instanceName = data?.result?.[0]?.value || 'Unknown';

      return { success: true, info: { instanceName, url: instance.instanceUrl } };
    } catch (err) {
      if (err instanceof Error && err.name === 'TimeoutError') {
        return { success: false, error: 'Connection timed out. Check the instance URL.' };
      }
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  /**
   * List available tools from the pre-built manifest.
   */
  async listTools(): Promise<Array<{ name: string; description: string; inputSchema?: Record<string, unknown> }>> {
    if (this.tools.length > 0) return this.tools;

    try {
      // Read the static tools manifest generated at build time
      const serverPath = this.getServerPath();
      const manifestPath = serverPath.replace('server.js', 'tools-manifest.json');

      if (existsSync(manifestPath)) {
        const raw = readFileSync(manifestPath, 'utf8');
        this.tools = JSON.parse(raw);
        return this.tools;
      }
    } catch {
      // Fallback
    }

    return [];
  }

  /**
   * Execute a tool via the running server.
   */
  async executeTool(name: string, args: Record<string, unknown>): Promise<{ success: boolean; result?: unknown; error?: string }> {
    if (!this.process || !this.status.running) {
      return { success: false, error: 'Server is not running. Start the server first.' };
    }

    // Send JSON-RPC request to the MCP server via stdin
    const id = Date.now();
    const request = JSON.stringify({
      jsonrpc: '2.0',
      id,
      method: 'tools/call',
      params: { name, arguments: args },
    });

    return new Promise((resolve) => {
      let buffer = '';

      const cleanup = () => {
        clearTimeout(timer);
        this.process?.stdout?.off('data', onData);
      };

      const timer = setTimeout(() => {
        cleanup();
        resolve({ success: false, error: `Tool execution timed out (90s). Tool: ${name}` });
      }, 90000);

      const onData = (data: Buffer) => {
        buffer += data.toString();
        // Try to parse each complete line from the buffer
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete last line in buffer
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const response = JSON.parse(line);
            if (response.id === id) {
              cleanup();
              if (response.error) {
                resolve({ success: false, error: response.error.message });
              } else {
                resolve({ success: true, result: response.result });
              }
              return;
            }
          } catch {
            // Not valid JSON, skip this line
          }
        }
      };

      this.process?.stdout?.on('data', onData);
      this.process?.stdin?.write(request + '\n');
    });
  }
}

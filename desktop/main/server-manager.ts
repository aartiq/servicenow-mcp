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

type ToolDef = { name: string; description: string; inputSchema?: Record<string, unknown>; _meta?: Record<string, unknown> };
type Pending = { resolve: (msg: { result?: unknown; error?: { message: string } }) => void; timer: NodeJS.Timeout };

/** MCP Apps UI extension: advertised at initialize so the server lists the open_* view tools and app_* tools. */
const UI_EXTENSION = 'io.modelcontextprotocol/ui';

export class ServerManager {
  private process: ChildProcess | null = null;
  private status: ServerStatus = { running: false };
  private tools: ToolDef[] = [];
  private liveTools: ToolDef[] | null = null;
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private stdoutBuffer = '';
  private initialized: Promise<boolean> | null = null;

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
  getServerPath(): string {
    const resourcePath = join(process.resourcesPath || '', 'server', 'server.js');
    if (existsSync(resourcePath)) return resourcePath;
    // tsx dev runs from desktop/main, the compiled build from desktop/dist/main.
    const candidates = [join(__dirname, '..', '..', 'dist', 'server.js'), join(__dirname, '..', '..', '..', 'dist', 'server.js')];
    return candidates.find(p => existsSync(p)) ?? candidates[0];
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
      // The chat renders MCP Apps views, so always list the open_* and app_* tools.
      NOWAIKIT_MCP_APPS: 'true',
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
            this.stopAll();
          });

          this.status = {
            running: true,
            instance: instance.name,
            pid: this.process!.pid,
            startedAt: new Date().toISOString(),
          };

          this.process!.stdout?.on('data', (d: Buffer) => this.onStdout(d));
          this.initialized = this.initialize();
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
    for (const [, p] of this.pending) { clearTimeout(p.timer); p.resolve({ error: { message: 'Server stopped' } }); }
    this.pending.clear();
    this.stdoutBuffer = '';
    this.initialized = null;
    this.liveTools = null;
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

  /** Parse newline-delimited JSON-RPC from the server and settle pending requests. */
  private onStdout(data: Buffer): void {
    this.stdoutBuffer += data.toString();
    const lines = this.stdoutBuffer.split('\n');
    this.stdoutBuffer = lines.pop() || '';
    for (const line of lines) {
      if (!line.trim()) continue;
      let msg: { id?: number; result?: unknown; error?: { message: string } };
      try { msg = JSON.parse(line); } catch { continue; }
      if (typeof msg.id !== 'number') continue;
      const p = this.pending.get(msg.id);
      if (!p) continue;
      this.pending.delete(msg.id);
      clearTimeout(p.timer);
      p.resolve(msg);
    }
  }

  private send(message: Record<string, unknown>): void {
    this.process?.stdin?.write(JSON.stringify({ jsonrpc: '2.0', ...message }) + '\n');
  }

  /** Send a JSON-RPC request to the MCP server over stdio. */
  private rawRequest(method: string, params: Record<string, unknown>, timeoutMs = 90000): Promise<{ result?: unknown; error?: { message: string } }> {
    if (!this.process || !this.status.running) {
      return Promise.resolve({ error: { message: 'Server is not running. Start the server first.' } });
    }
    const id = this.nextId++;
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        resolve({ error: { message: `Request timed out (${Math.round(timeoutMs / 1000)}s): ${method}` } });
      }, timeoutMs);
      this.pending.set(id, { resolve, timer });
      this.send({ id, method, params });
    });
  }

  /** MCP initialize handshake, advertising the MCP Apps extension. */
  private async initialize(): Promise<boolean> {
    const r = await this.rawRequest('initialize', {
      protocolVersion: '2025-06-18',
      capabilities: { extensions: { [UI_EXTENSION]: { mimeTypes: ['text/html;profile=mcp-app'] } } },
      clientInfo: { name: 'nowaikit-desktop', version: '1' },
    }, 30000);
    if (r.error) return false;
    this.send({ method: 'notifications/initialized' });
    return true;
  }

  async request(method: string, params: Record<string, unknown>, timeoutMs?: number): Promise<{ result?: unknown; error?: { message: string } }> {
    if (this.initialized) await this.initialized;
    return this.rawRequest(method, params, timeoutMs);
  }

  /**
   * List tools: live from the running server (includes MCP Apps `_meta`), else the pre-built manifest.
   */
  async listTools(): Promise<ToolDef[]> {
    if (this.status.running) {
      if (this.liveTools) return this.liveTools;
      const all: ToolDef[] = [];
      let cursor: string | undefined;
      do {
        const r = await this.request('tools/list', cursor ? { cursor } : {}, 30000);
        if (r.error || !r.result) break;
        const page = r.result as { tools?: ToolDef[]; nextCursor?: string };
        all.push(...(page.tools || []));
        cursor = page.nextCursor;
      } while (cursor);
      if (all.length) {
        this.liveTools = all;
        return all;
      }
    }

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
   * Execute a tool via the running server. `result` is the MCP CallToolResult.
   */
  async executeTool(name: string, args: Record<string, unknown>): Promise<{ success: boolean; result?: unknown; error?: string }> {
    const r = await this.request('tools/call', { name, arguments: args }, 120000);
    if (r.error) return { success: false, error: r.error.message };
    const result = r.result as { isError?: boolean; content?: Array<{ text?: string }> } | undefined;
    if (result?.isError) {
      const text = (result.content || []).map(c => c.text || '').join('\n').trim();
      return { success: false, result, error: text || `Tool ${name} failed` };
    }
    return { success: true, result };
  }

  /** Read an MCP resource (MCP Apps ui:// views). */
  async readResource(uri: string): Promise<unknown | null> {
    const r = await this.request('resources/read', { uri }, 30000);
    return r.error ? null : r.result ?? null;
  }
}

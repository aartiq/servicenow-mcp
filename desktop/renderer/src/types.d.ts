/** Types for the preload API exposed on window.api */

declare global {
  /** Build-time version injected by Vite */
  const __APP_VERSION__: string;

  interface InstanceConfig {
    name: string;
    instanceUrl: string;
    authMethod: 'basic' | 'oauth';
    username?: string;
    password?: string;
    clientId?: string;
    clientSecret?: string;
    toolPackage?: string;
    writeEnabled?: boolean;
    scriptingEnabled?: boolean;
    cmdbWriteEnabled?: boolean;
    atfEnabled?: boolean;
    nowAssistEnabled?: boolean;
    group?: string;
    environment?: string;
  }

  interface VersionInfo {
    app: string;
    electron: string;
    node: string;
  }

  interface ServerStatus {
    running: boolean;
    instance?: string;
    pid?: number;
    startedAt?: string;
    toolCount?: number;
  }

  interface ToolDef {
    name: string;
    description: string;
    inputSchema?: {
      properties?: Record<string, { type: string; description?: string; enum?: string[] }>;
      required?: string[];
    };
    /** MCP tool metadata. `ui.resourceUri` points at an MCP Apps view; `ui.visibility: ["app"]` hides a tool from the model. */
    _meta?: { ui?: { resourceUri?: string; visibility?: string[] }; [key: string]: unknown };
  }

  /** MCP CallToolResult as returned by the NowAIKit server. */
  interface McpCallToolResult {
    content?: Array<{ type: string; text?: string; [key: string]: unknown }>;
    structuredContent?: Record<string, unknown>;
    isError?: boolean;
    _meta?: Record<string, unknown>;
  }

  /** MCP ReadResourceResult (MCP Apps views are text/html;profile=mcp-app). */
  interface McpReadResourceResult {
    contents: Array<{ uri: string; mimeType?: string; text?: string; _meta?: Record<string, unknown> }>;
  }

  /** One `nowaikit doctor` check. */
  interface DoctorCheck {
    id: string;
    title: string;
    status: 'ok' | 'warn' | 'fail' | 'info';
    detail: string;
    fix?: string;
  }

  interface AuditEntry {
    ts: string;
    event: string;
    tool?: string;
    instance?: string;
    user?: string;
    provider?: string;
    model?: string;
    toolCount?: number;
    success?: boolean;
    durationMs?: number;
    inputTokens?: number;
    outputTokens?: number;
    error?: string;
    raw?: string;
  }

  interface ElectronAPI {
    getConfig: (key: string) => Promise<unknown>;
    setConfig: (key: string, value: unknown) => Promise<void>;
    getAllConfig: () => Promise<Record<string, unknown>>;
    listInstances: () => Promise<InstanceConfig[]>;
    addInstance: (instance: InstanceConfig) => Promise<{ success: boolean; error?: string }>;
    removeInstance: (name: string) => Promise<{ success: boolean; error?: string }>;
    testInstance: (instance: InstanceConfig) => Promise<{ success: boolean; error?: string; info?: Record<string, unknown> }>;
    startServer: (instanceName?: string) => Promise<{ success: boolean; error?: string }>;
    stopServer: () => Promise<{ success: boolean }>;
    getServerStatus: () => Promise<ServerStatus>;
    listTools: () => Promise<ToolDef[]>;
    executeTool: (name: string, args: Record<string, unknown>) => Promise<{ success: boolean; result?: unknown; error?: string }>;
    getAuditLogs: (limit?: number) => Promise<AuditEntry[]>;
    getVersion: () => Promise<VersionInfo>;
    openExternal: (url: string) => Promise<void>;
    selectDirectory: () => Promise<string | null>;
    getServerPath: () => Promise<string>;
    /** Read an MCP resource (ui:// views). Null when no real NowAIKit server is reachable. */
    readResource: (uri: string) => Promise<McpReadResourceResult | null>;
    /** Run the `nowaikit doctor` checks against the stored NowAIKit config. */
    runDoctor: (instance?: string) => Promise<{ checks?: DoctorCheck[]; instance?: string | null; error?: string }>;
    sendChat: (params: {
      provider: string;
      apiKey: string;
      model: string;
      messages: Array<{ role: string; content: unknown }>;
      tools?: Array<{ name: string; description: string; inputSchema?: Record<string, unknown> }>;
      baseUrl?: string;
      authMethod?: string;
      instanceUrl?: string;
    }) => Promise<{ content?: Array<{ type: string; text?: string; id?: string; name?: string; input?: Record<string, unknown> }>; stop_reason?: string; error?: string; usage?: { inputTokens: number; outputTokens: number } }>;
  }

  interface Window {
    api: ElectronAPI;
  }
}

export {};

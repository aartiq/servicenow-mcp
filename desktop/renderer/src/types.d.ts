/** Build-time version injected by Vite */
declare const __APP_VERSION__: string;

/** Types for the preload API exposed on window.api */

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
  sendChat: (params: {
    provider: string;
    apiKey: string;
    model: string;
    messages: Array<{ role: string; content: unknown }>;
    tools?: Array<{ name: string; description: string; inputSchema?: Record<string, unknown> }>;
    baseUrl?: string;
  }) => Promise<{ content?: Array<{ type: string; text?: string; id?: string; name?: string; input?: Record<string, unknown> }>; stop_reason?: string; error?: string; usage?: { inputTokens: number; outputTokens: number } }>;
}

declare global {
  interface Window {
    api: ElectronAPI;
  }
}

export {};

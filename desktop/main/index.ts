import { app, BrowserWindow, ipcMain, shell, dialog } from 'electron';
import { join } from 'path';
import { existsSync } from 'fs';
import { ServerManager } from './server-manager';
import { ConfigStore } from './config-store';

const isDev = process.argv.includes('--dev');
let mainWindow: BrowserWindow | null = null;
const serverManager = new ServerManager();
const configStore = new ConfigStore();

// ─── Security helpers ────────────────────────────────────────────────────────

/** Validate URL protocol for shell.openExternal */
function isSafeExternalUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ['https:', 'http:', 'mailto:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

/** Strip potential API key patterns from error messages */
function sanitizeError(msg: string): string {
  return msg
    .replace(/sk-ant-[a-zA-Z0-9_-]+/g, 'sk-ant-***')
    .replace(/sk-[a-zA-Z0-9_-]{20,}/g, 'sk-***')
    .replace(/AIza[a-zA-Z0-9_-]+/g, 'AIza***')
    .replace(/gsk_[a-zA-Z0-9_-]+/g, 'gsk_***')
    .replace(/sk-or-[a-zA-Z0-9_-]+/g, 'sk-or-***')
    .replace(/key=[^&\s]+/g, 'key=***');
}

/** Allowlist of config keys the renderer is permitted to set */
const CONFIG_SET_ALLOWLIST = new Set([
  'theme', 'telemetry', 'autoUpdate', 'windowBounds', 'settings', 'activeInstance',
]);

/** Validate ServiceNow instance URL */
function isValidInstanceUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'NowAIKit',
    icon: join(__dirname, '..', '..', 'resources', 'icon.png'),
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    show: false,
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(join(__dirname, '..', '..', 'renderer', 'dist', 'index.html'));
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url)) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ─── App lifecycle ───────────────────────────────────────────────────────────

app.whenReady().then(() => {
  createWindow();
  registerIpcHandlers();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  serverManager.stopAll();
  if (process.platform !== 'darwin') app.quit();
});

// ─── IPC Handlers ────────────────────────────────────────────────────────────

function registerIpcHandlers() {
  // ── Config ──
  ipcMain.handle('config:get', (_event, key: string) => {
    return configStore.get(key);
  });

  ipcMain.handle('config:set', (_event, key: string, value: unknown) => {
    if (!CONFIG_SET_ALLOWLIST.has(key)) {
      return { success: false, error: `Config key "${key}" is not settable` };
    }
    configStore.set(key, value);
  });

  ipcMain.handle('config:getAll', () => {
    return configStore.getAll();
  });

  // ── Instances ──
  ipcMain.handle('instances:list', () => {
    return configStore.getInstances();
  });

  ipcMain.handle('instances:add', (_event, instance: InstanceConfig) => {
    // Validate instance URL requires HTTPS
    if (instance.instanceUrl && !isValidInstanceUrl(instance.instanceUrl)) {
      return { success: false, error: 'Instance URL must use HTTPS' };
    }
    return configStore.addInstance(instance);
  });

  ipcMain.handle('instances:remove', (_event, name: string) => {
    return configStore.removeInstance(name);
  });

  ipcMain.handle('instances:test', async (_event, instance: InstanceConfig) => {
    const start = Date.now();
    const result = await serverManager.testConnection(instance);
    configStore.appendAuditLog({
      ts: new Date().toISOString(),
      event: 'instance:test',
      instance: instance.name || instance.instanceUrl,
      success: result.success,
      durationMs: Date.now() - start,
      error: result.error,
    });
    return result;
  });

  // ── Server ──
  ipcMain.handle('server:start', async (_event, instanceName?: string) => {
    const instances = configStore.getInstances();
    const instance = instanceName
      ? instances.find(i => i.name === instanceName)
      : instances[0];

    if (!instance) return { success: false, error: 'No instance configured. Use Setup Wizard to add one.' };
    const result = await serverManager.start(instance);

    // Log to audit
    configStore.appendAuditLog({
      ts: new Date().toISOString(),
      event: 'server:start',
      instance: instance.name,
      success: result.success,
      error: result.error,
    });

    return result;
  });

  ipcMain.handle('server:stop', async () => {
    const status = serverManager.getStatus();
    serverManager.stopAll();

    configStore.appendAuditLog({
      ts: new Date().toISOString(),
      event: 'server:stop',
      instance: status.instance,
      success: true,
    });

    return { success: true };
  });

  ipcMain.handle('server:status', () => {
    return serverManager.getStatus();
  });

  // ── Tools ──
  ipcMain.handle('tools:list', async () => {
    return serverManager.listTools();
  });

  ipcMain.handle('tools:execute', async (_event, toolName: string, args: Record<string, unknown>) => {
    const start = Date.now();
    const result = await serverManager.executeTool(toolName, args);
    configStore.appendAuditLog({
      ts: new Date().toISOString(),
      event: 'tool:execute',
      tool: toolName,
      instance: serverManager.getStatus().instance,
      success: result.success,
      durationMs: Date.now() - start,
      error: result.error,
    });
    return result;
  });

  // ── Audit Log ──
  ipcMain.handle('audit:getLogs', async (_event, limit?: number) => {
    return configStore.getAuditLogs(limit || 100);
  });

  // ── System ──
  ipcMain.handle('system:getVersion', () => {
    return { app: app.getVersion(), electron: process.versions.electron, node: process.versions.node };
  });

  ipcMain.handle('system:openExternal', (_event, url: string) => {
    if (!isSafeExternalUrl(url)) {
      return { success: false, error: 'Only https, http, and mailto URLs are allowed' };
    }
    shell.openExternal(url);
  });

  ipcMain.handle('system:selectDirectory', async () => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle('system:getServerPath', () => {
    // In packaged app, server is in resources/server/
    const packagedPath = join(process.resourcesPath, 'server', 'server.js');
    const devPath = join(__dirname, '..', '..', 'dist', 'server.js');
    return existsSync(packagedPath) ? packagedPath : devPath;
  });

  // ── AI Chat (proxy through main process to avoid CORS) ──
  // Supports tool definitions for function calling / tool-use across all providers.
  // The renderer handles the tool execution loop (tool_use → executeTool → tool_result → repeat).
  ipcMain.handle('chat:send', async (_event, params: {
    provider: string;
    apiKey: string;
    model: string;
    messages: Array<{ role: string; content: unknown }>;
    tools?: Array<{ name: string; description: string; inputSchema?: Record<string, unknown> }>;
    baseUrl?: string;
  }) => {
    const { provider, apiKey, model, messages, tools: toolDefs, baseUrl } = params;
    const isLocalProvider = provider === 'ollama' || provider === 'lmstudio';
    if (!apiKey && !isLocalProvider) return { error: 'No API key configured' };

    const chatStart = Date.now();
    const toolCount = toolDefs?.length || 0;

    // System prompt that instructs the AI to use ServiceNow tools
    const systemPrompt = toolDefs && toolDefs.length > 0
      ? `You are NowAIKit, an AI assistant for ServiceNow. You have access to tools that query and modify a ServiceNow instance.

CRITICAL RULES:
1. ALWAYS use tools to fetch real data. NEVER make up or guess data.
2. After getting results, summarize clearly for the user.
3. Do NOT add filters the user did not ask for. If they say "open incidents", query ALL open incidents — do NOT filter by assigned_to unless they explicitly say "my" or "assigned to me".

HOW TO QUERY DATA:
- Use "query_records" tool with the correct table name:
  - Incidents: table="incident"
  - Change Requests: table="change_request"
  - Problems: table="problem"
  - Tasks: table="task"
  - Users: table="sys_user"
  - Groups: table="sys_user_group"
  - CIs: table="cmdb_ci" (or cmdb_ci_server, cmdb_ci_computer)
  - Knowledge Articles: table="kb_knowledge"
  - Catalog Items: table="sc_cat_item"
  - HR Cases: table="sn_hr_core_case"
  - Security Incidents: table="sn_si_incident"

QUERY SYNTAX examples:
- All open incidents: query="active=true^ORDERBYDESCsys_created_on"
- By priority: query="priority=1^active=true"
- By state: query="state=1" (1=New, 2=In Progress, 3=On Hold, 6=Resolved, 7=Closed)
- Contains text: query="short_descriptionLIKEnetwork"
- Date range: query="sys_created_on>=2024-01-01"
- Combined: query="active=true^priority<=2^ORDERBYDESCsys_created_on"
- ONLY if user says "my": query="assigned_to=javascript:gs.getUserID()^active=true"

IMPORTANT: Only add assigned_to filter when user explicitly says "my incidents", "assigned to me", etc. Otherwise query ALL records matching their criteria.
When user says "recent" or "latest", order by sys_created_on DESC.
When user says "open", filter by active=true.
Set the limit parameter to match what user asks for (e.g. "5 most recent" → limit=5).`
      : undefined;

    // Build Anthropic-format tool definitions
    const anthropicTools = toolDefs?.map(t => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema || { type: 'object', properties: {} },
    }));

    // Build OpenAI-format tool definitions
    const openaiTools = toolDefs?.map(t => ({
      type: 'function' as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.inputSchema || { type: 'object', properties: {} },
      },
    }));

    try {
      if (provider === 'anthropic') {
        const body: Record<string, unknown> = { model, max_tokens: 4096, messages };
        if (systemPrompt) body.system = systemPrompt;
        if (anthropicTools && anthropicTools.length > 0) body.tools = anthropicTools;

        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const errText = sanitizeError(`API error ${res.status}: ${await res.text()}`);
          configStore.appendAuditLog({ ts: new Date().toISOString(), event: 'chat:send', provider, model, toolCount, success: false, durationMs: Date.now() - chatStart, error: errText });
          return { error: errText };
        }
        const data = await res.json() as Record<string, unknown>;
        const usage = data.usage as { input_tokens?: number; output_tokens?: number } | undefined;
        configStore.appendAuditLog({ ts: new Date().toISOString(), event: 'chat:send', provider, model, toolCount, success: true, durationMs: Date.now() - chatStart, inputTokens: usage?.input_tokens, outputTokens: usage?.output_tokens });
        return { content: data.content, stop_reason: data.stop_reason, usage: usage ? { inputTokens: usage.input_tokens || 0, outputTokens: usage.output_tokens || 0 } : undefined };

      } else if (provider === 'google') {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

        // Convert messages to Google format
        const contents = messages.map((m: { role: string; content: unknown }) => {
          const parts: Array<Record<string, unknown>> = [];
          if (typeof m.content === 'string') {
            parts.push({ text: m.content });
          } else if (Array.isArray(m.content)) {
            for (const c of m.content as Array<Record<string, unknown>>) {
              if (c.type === 'text') parts.push({ text: c.text });
              else if (c.type === 'tool_use') parts.push({ functionCall: { name: c.name, args: c.input } });
              else if (c.type === 'tool_result') parts.push({ functionResponse: { name: 'tool', response: { content: c.content } } });
            }
          }
          return { role: m.role === 'assistant' ? 'model' : 'user', parts };
        });

        const body: Record<string, unknown> = { contents };
        if (systemPrompt) body.systemInstruction = { parts: [{ text: systemPrompt }] };
        if (toolDefs && toolDefs.length > 0) {
          body.tools = [{
            functionDeclarations: toolDefs.map(t => ({
              name: t.name,
              description: t.description,
              parameters: t.inputSchema || { type: 'object', properties: {} },
            })),
          }];
        }

        const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        if (!res.ok) {
          const errText = sanitizeError(`Google AI error ${res.status}: ${await res.text()}`);
          configStore.appendAuditLog({ ts: new Date().toISOString(), event: 'chat:send', provider, model, toolCount, success: false, durationMs: Date.now() - chatStart, error: errText });
          return { error: errText };
        }
        const data = await res.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string; functionCall?: { name: string; args: Record<string, unknown> } }> } }>; usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number } };
        const parts = data.candidates?.[0]?.content?.parts ?? [];

        // Convert Google response to Anthropic-like content format
        const content: Array<Record<string, unknown>> = [];
        for (const p of parts) {
          if (p.text) content.push({ type: 'text', text: p.text });
          if (p.functionCall) content.push({ type: 'tool_use', id: `toolu_${Date.now()}`, name: p.functionCall.name, input: p.functionCall.args });
        }
        const hasToolUse = content.some(c => c.type === 'tool_use');
        const gUsage = data.usageMetadata;
        configStore.appendAuditLog({ ts: new Date().toISOString(), event: 'chat:send', provider, model, toolCount, success: true, durationMs: Date.now() - chatStart, inputTokens: gUsage?.promptTokenCount, outputTokens: gUsage?.candidatesTokenCount });
        return { content, stop_reason: hasToolUse ? 'tool_use' : 'end_turn', usage: gUsage ? { inputTokens: gUsage.promptTokenCount || 0, outputTokens: gUsage.candidatesTokenCount || 0 } : undefined };

      } else {
        // OpenAI-compatible (OpenAI, Groq, OpenRouter, Ollama, LM Studio)
        const endpoints: Record<string, string> = {
          openai: 'https://api.openai.com/v1/chat/completions',
          groq: 'https://api.groq.com/openai/v1/chat/completions',
          openrouter: 'https://openrouter.ai/api/v1/chat/completions',
          ollama: `${baseUrl || 'http://localhost:11434'}/v1/chat/completions`,
          lmstudio: `${baseUrl || 'http://localhost:1234'}/v1/chat/completions`,
        };
        const url = endpoints[provider];
        if (!url) return { error: `Unknown provider: ${provider}` };

        // Convert messages: tool_use/tool_result → OpenAI format
        const oaiMessages: Array<Record<string, unknown>> = [];
        if (systemPrompt) oaiMessages.push({ role: 'system', content: systemPrompt });
        for (const m of messages) {
          if (typeof m.content === 'string') {
            oaiMessages.push({ role: m.role, content: m.content });
          } else if (Array.isArray(m.content)) {
            const parts = m.content as Array<Record<string, unknown>>;
            const textParts = parts.filter(c => c.type === 'text').map(c => c.text).join('\n');
            const toolUses = parts.filter(c => c.type === 'tool_use');
            const toolResults = parts.filter(c => c.type === 'tool_result');

            if (toolUses.length > 0) {
              // Assistant message with tool calls
              oaiMessages.push({
                role: 'assistant',
                content: textParts || null,
                tool_calls: toolUses.map(tu => ({
                  id: tu.id,
                  type: 'function',
                  function: { name: tu.name, arguments: JSON.stringify(tu.input) },
                })),
              });
            } else if (toolResults.length > 0) {
              // Tool result messages
              for (const tr of toolResults) {
                oaiMessages.push({ role: 'tool', tool_call_id: tr.tool_use_id, content: typeof tr.content === 'string' ? tr.content : JSON.stringify(tr.content) });
              }
            } else if (textParts) {
              oaiMessages.push({ role: m.role, content: textParts });
            }
          }
        }

        const body: Record<string, unknown> = { model, messages: oaiMessages };
        if (openaiTools && openaiTools.length > 0) body.tools = openaiTools;

        const fetchHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
        if (apiKey) fetchHeaders['Authorization'] = `Bearer ${apiKey}`;
        const res = await fetch(url, {
          method: 'POST',
          headers: fetchHeaders,
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const errText = sanitizeError(`API error ${res.status}: ${await res.text()}`);
          configStore.appendAuditLog({ ts: new Date().toISOString(), event: 'chat:send', provider, model, toolCount, success: false, durationMs: Date.now() - chatStart, error: errText });
          return { error: errText };
        }
        const data = await res.json() as { choices?: Array<{ message?: { content?: string; tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }> }; finish_reason?: string }>; usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } };
        const choice = data.choices?.[0];
        const msg = choice?.message;

        // Convert OpenAI response to Anthropic-like format
        const content: Array<Record<string, unknown>> = [];
        if (msg?.content) content.push({ type: 'text', text: msg.content });
        if (msg?.tool_calls) {
          for (const tc of msg.tool_calls) {
            let args: Record<string, unknown> = {};
            try { args = JSON.parse(tc.function.arguments); } catch { /* empty */ }
            content.push({ type: 'tool_use', id: tc.id, name: tc.function.name, input: args });
          }
        }
        const hasToolUse = content.some(c => c.type === 'tool_use');
        const oUsage = data.usage;
        configStore.appendAuditLog({ ts: new Date().toISOString(), event: 'chat:send', provider, model, toolCount, success: true, durationMs: Date.now() - chatStart, inputTokens: oUsage?.prompt_tokens, outputTokens: oUsage?.completion_tokens });
        return { content, stop_reason: hasToolUse ? 'tool_use' : 'end_turn', usage: oUsage ? { inputTokens: oUsage.prompt_tokens || 0, outputTokens: oUsage.completion_tokens || 0 } : undefined };
      }
    } catch (err) {
      const errMsg = sanitizeError(err instanceof Error ? err.message : 'Request failed');
      configStore.appendAuditLog({
        ts: new Date().toISOString(),
        event: 'chat:send',
        provider, model, toolCount,
        success: false,
        durationMs: Date.now() - chatStart,
        error: errMsg,
      });
      return { error: errMsg };
    }
  });
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface InstanceConfig {
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

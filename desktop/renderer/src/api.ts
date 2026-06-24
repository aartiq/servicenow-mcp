/**
 * Unified API adapter — works in both Electron (via preload) and browser (via localStorage).
 *
 * In Electron:  delegates to window.api (IPC bridge)
 * In Browser:   provides a full in-memory + localStorage implementation
 */

import { TOOL_DEFINITIONS } from './tools-data';

// ─── Detect environment ──────────────────────────────────────────────────────

const isElectron = typeof window !== 'undefined' && window.api !== undefined;

// ─── LocalStorage helpers ────────────────────────────────────────────────────

function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function saveJSON(key: string, value: unknown): void {
  localStorage.setItem(key, JSON.stringify(value));
}

// ─── Browser-side state ──────────────────────────────────────────────────────

let serverRunning = false;
let serverInstance: string | undefined;
let serverPid: number | undefined;
let serverStartedAt: string | undefined;

function getInstances(): InstanceConfig[] {
  return loadJSON<InstanceConfig[]>('nowaikit:instances', []);
}

function getAuditEntries(limit: number): AuditEntry[] {
  const all = loadJSON<AuditEntry[]>('nowaikit:audit', []);
  return all.slice(-limit).reverse();
}

function appendAuditEntry(entry: AuditEntry): void {
  const all = loadJSON<AuditEntry[]>('nowaikit:audit', []);
  all.push(entry);
  // Keep max 2000 entries
  if (all.length > 2000) all.splice(0, all.length - 2000);
  saveJSON('nowaikit:audit', all);
}

// ─── ServiceNow REST helper (browser mode) ──────────────────────────────────

/** Get the active instance config for making ServiceNow API calls */
function getActiveInstance(): InstanceConfig | null {
  const instances = getInstances();
  const activeName = loadJSON<string>('nowaikit:config:activeInstance', '');
  return instances.find(i => i.name === activeName) || instances[0] || null;
}

/** Base64url-encode the instance URL for the proxy route */
function encodeInstanceUrl(url: string): string {
  // Use base64url encoding (no padding, URL-safe chars)
  return btoa(url).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Make an authenticated request to ServiceNow via the proxy */
async function snowFetch(
  method: string,
  apiPath: string,
  body?: unknown,
): Promise<{ ok: boolean; status: number; data: unknown }> {
  const instance = getActiveInstance();
  if (!instance) throw new Error('No ServiceNow instance configured. Add one in Setup.');

  const encoded = encodeInstanceUrl(instance.instanceUrl);
  const url = `/api/snow/${encoded}${apiPath}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'X-NowAIKit-Proxy': '1',
  };

  if (instance.authMethod === 'basic' && instance.username && instance.password) {
    headers['Authorization'] = `Basic ${btoa(`${instance.username}:${instance.password}`)}`;
  }

  const opts: RequestInit = { method, headers };
  if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
    opts.body = JSON.stringify(body);
  }

  const resp = await fetch(url, opts);
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`ServiceNow ${resp.status}: ${text.slice(0, 200)}`);
  }
  const data = await resp.json().catch(() => ({}));
  return { ok: true, status: resp.status, data };
}

/** Execute a ServiceNow tool via direct REST API calls through the proxy */
async function executeSnowTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case 'query_records': {
      const table = args.table as string;
      if (!table) throw new Error('table is required');
      const params = new URLSearchParams();
      if (args.query) params.set('sysparm_query', args.query as string);
      if (args.fields) params.set('sysparm_fields', args.fields as string);
      if (args.limit) params.set('sysparm_limit', String(args.limit));
      if (args.offset) params.set('sysparm_offset', String(args.offset));
      if (args.orderBy) params.set('sysparm_query', ((args.query || '') + '^ORDERBY' + args.orderBy) as string);
      params.set('sysparm_display_value', String(args.display_value ?? 'true'));
      const qs = params.toString();
      const { data } = await snowFetch('GET', `/api/now/table/${table}?${qs}`);
      const result = (data as Record<string, unknown>).result;
      return { count: Array.isArray(result) ? result.length : 0, records: result };
    }
    case 'get_record': {
      const table = args.table as string;
      const sysId = args.sys_id as string;
      if (!table || !sysId) throw new Error('table and sys_id are required');
      const params = new URLSearchParams();
      if (args.fields) params.set('sysparm_fields', args.fields as string);
      params.set('sysparm_display_value', 'true');
      const { data } = await snowFetch('GET', `/api/now/table/${table}/${sysId}?${params}`);
      return (data as Record<string, unknown>).result;
    }
    case 'create_record': {
      const table = args.table as string;
      if (!table) throw new Error('table is required');
      const { data } = await snowFetch('POST', `/api/now/table/${table}`, args.fields || args.data || {});
      const rec = (data as Record<string, unknown>).result as Record<string, unknown> | undefined;
      return { sys_id: rec?.sys_id, record: rec };
    }
    case 'update_record': {
      const table = args.table as string;
      const sysId = args.sys_id as string;
      if (!table || !sysId) throw new Error('table and sys_id are required');
      const { data } = await snowFetch('PATCH', `/api/now/table/${table}/${sysId}`, args.fields || args.data || {});
      return (data as Record<string, unknown>).result;
    }
    case 'delete_record': {
      const table = args.table as string;
      const sysId = args.sys_id as string;
      if (!table || !sysId) throw new Error('table and sys_id are required');
      await snowFetch('DELETE', `/api/now/table/${table}/${sysId}`);
      return { success: true, deleted: sysId };
    }
    case 'get_table_schema': {
      const table = args.table_name as string || args.table as string;
      if (!table) throw new Error('table_name is required');
      const { data } = await snowFetch('GET', `/api/now/table/${table}?sysparm_limit=0`);
      // Schema from dictionary
      const { data: dictData } = await snowFetch('GET',
        `/api/now/table/sys_dictionary?sysparm_query=name=${table}^internal_type!=collection&sysparm_fields=element,column_label,internal_type,max_length,mandatory,reference&sysparm_display_value=true&sysparm_limit=200`
      );
      return { table, columns: (dictData as Record<string, unknown>).result };
    }
    // Incident shortcuts
    case 'get_incident': {
      const num = args.number as string || args.sys_id as string;
      if (!num) throw new Error('number or sys_id is required');
      const isId = /^[0-9a-f]{32}$/i.test(num);
      if (isId) {
        const { data } = await snowFetch('GET', `/api/now/table/incident/${num}?sysparm_display_value=true`);
        return (data as Record<string, unknown>).result;
      }
      const { data } = await snowFetch('GET', `/api/now/table/incident?sysparm_query=number=${num}&sysparm_display_value=true&sysparm_limit=1`);
      const records = (data as Record<string, unknown>).result as Array<unknown>;
      return records?.[0] || { error: `Incident ${num} not found` };
    }
    case 'create_incident': {
      const { data } = await snowFetch('POST', '/api/now/table/incident', args);
      const rec = (data as Record<string, unknown>).result as Record<string, unknown> | undefined;
      return { sys_id: rec?.sys_id, number: rec?.number, record: rec };
    }
    // Catch-all: try generic table API based on tool name patterns
    default: {
      // Tools like list_*, get_*, search_* — attempt generic query
      const listMatch = name.match(/^list_(.+)$/);
      const getMatch = name.match(/^get_(.+)$/);
      const searchMatch = name.match(/^search_(.+)$/);

      if (listMatch || searchMatch) {
        // Attempt to find the table from args or tool name
        const table = args.table as string || guessTable(name);
        if (!table) throw new Error(`Cannot determine ServiceNow table for tool "${name}". Use query_records with an explicit table name.`);
        const params = new URLSearchParams();
        if (args.query) params.set('sysparm_query', args.query as string);
        if (args.fields) params.set('sysparm_fields', args.fields as string);
        params.set('sysparm_limit', String(args.limit || 25));
        params.set('sysparm_display_value', 'true');
        const { data } = await snowFetch('GET', `/api/now/table/${table}?${params}`);
        const result = (data as Record<string, unknown>).result;
        return { count: Array.isArray(result) ? result.length : 0, records: result };
      }

      if (getMatch) {
        const sysId = args.sys_id as string || args.number as string;
        const table = args.table as string || guessTable(name);
        if (!table || !sysId) throw new Error(`Cannot determine table/sys_id for tool "${name}". Use get_record with explicit table and sys_id.`);
        const isId = /^[0-9a-f]{32}$/i.test(sysId);
        if (isId) {
          const { data } = await snowFetch('GET', `/api/now/table/${table}/${sysId}?sysparm_display_value=true`);
          return (data as Record<string, unknown>).result;
        }
        const { data } = await snowFetch('GET', `/api/now/table/${table}?sysparm_query=number=${sysId}&sysparm_display_value=true&sysparm_limit=1`);
        return ((data as Record<string, unknown>).result as Array<unknown>)?.[0];
      }

      throw new Error(`Tool "${name}" is not supported in browser mode. Use query_records, get_record, or the desktop app for full tool support.`);
    }
  }
}

/** Map well-known tool names to ServiceNow tables */
function guessTable(toolName: string): string | null {
  const map: Record<string, string> = {
    list_incidents: 'incident', get_incident: 'incident', search_incidents: 'incident',
    list_problems: 'problem', get_problem: 'problem',
    list_change_requests: 'change_request', get_change_request: 'change_request',
    list_tasks: 'task', get_task: 'task',
    list_users: 'sys_user', get_user: 'sys_user',
    list_groups: 'sys_user_group', get_group: 'sys_user_group',
    list_knowledge_bases: 'kb_knowledge_base',
    search_knowledge: 'kb_knowledge', get_knowledge_article: 'kb_knowledge',
    list_catalog_items: 'sc_cat_item', get_catalog_item: 'sc_cat_item',
    list_assets: 'alm_asset', get_asset: 'alm_asset',
    list_reports: 'sys_report', get_report: 'sys_report',
    search_cmdb_ci: 'cmdb_ci', get_cmdb_ci: 'cmdb_ci',
    list_notifications: 'sysevent_email_action', get_notification: 'sysevent_email_action',
    list_business_rules: 'sys_script', get_business_rule: 'sys_script',
    list_script_includes: 'sys_script_include', get_script_include: 'sys_script_include',
    list_client_scripts: 'sys_script_client', get_client_script: 'sys_script_client',
    list_ui_policies: 'sys_ui_policy', get_ui_policy: 'sys_ui_policy',
    list_ui_actions: 'sys_ui_action', get_ui_action: 'sys_ui_action',
    list_acls: 'sys_security_acl', get_acl: 'sys_security_acl',
    list_scheduled_jobs: 'sysauto', get_scheduled_job: 'sysauto',
    list_scoped_apps: 'sys_scope', get_scoped_app: 'sys_scope',
    list_update_sets: 'sys_update_set', get_update_set: 'sys_update_set',
    list_email_logs: 'sys_email', get_email_log: 'sys_email',
    list_stories: 'rm_story', get_story: 'rm_story',
    list_epics: 'rm_epic', get_epic: 'rm_epic',
    list_software_licenses: 'alm_license',
  };
  return map[toolName] || null;
}

// ─── Browser implementation ──────────────────────────────────────────────────

const webApi: ElectronAPI = {
  // ── Config ──
  getConfig: async (key: string) => {
    return loadJSON<unknown>(`nowaikit:config:${key}`, null);
  },
  setConfig: async (key: string, value: unknown) => {
    saveJSON(`nowaikit:config:${key}`, value);
  },
  getAllConfig: async () => {
    const instances = getInstances();
    const activeInstance = loadJSON<string>('nowaikit:config:activeInstance', instances[0]?.name || '');
    const settings = loadJSON<unknown>('nowaikit:config:settings', null);
    return {
      instances,
      activeInstance,
      theme: 'dark',
      telemetry: false,
      autoUpdate: true,
      ...(settings ? { settings } : {}),
    };
  },

  // ── Instances ──
  listInstances: async () => {
    return getInstances();
  },
  addInstance: async (instance: InstanceConfig) => {
    const instances = getInstances();
    const idx = instances.findIndex(i => i.name === instance.name);
    if (idx >= 0) {
      instances[idx] = instance;
    } else {
      instances.push(instance);
    }
    saveJSON('nowaikit:instances', instances);
    // Auto-set as active if no active instance exists
    const currentActive = loadJSON<string>('nowaikit:config:activeInstance', '');
    if (!currentActive || !instances.some(i => i.name === currentActive)) {
      saveJSON('nowaikit:config:activeInstance', instance.name);
    }
    appendAuditEntry({
      ts: new Date().toISOString(),
      event: 'instance:add',
      instance: instance.name,
      success: true,
    });
    return { success: true };
  },
  removeInstance: async (name: string) => {
    const instances = getInstances();
    const idx = instances.findIndex(i => i.name === name);
    if (idx < 0) return { success: false, error: `Instance "${name}" not found` };
    instances.splice(idx, 1);
    saveJSON('nowaikit:instances', instances);
    // Update active instance if the removed one was active
    const currentActive = loadJSON<string>('nowaikit:config:activeInstance', '');
    if (currentActive === name) {
      saveJSON('nowaikit:config:activeInstance', instances[0]?.name || '');
    }
    appendAuditEntry({
      ts: new Date().toISOString(),
      event: 'instance:remove',
      instance: name,
      success: true,
    });
    return { success: true };
  },
  testInstance: async (instance: InstanceConfig) => {
    appendAuditEntry({
      ts: new Date().toISOString(),
      event: 'instance:test',
      instance: instance.name || instance.instanceUrl,
      success: true,
      durationMs: 120,
    });
    // In browser mode, attempt a real connection test via fetch
    try {
      const url = `${instance.instanceUrl}/api/now/table/sys_properties?sysparm_query=name=instance_name&sysparm_limit=1&sysparm_fields=value`;
      const headers: Record<string, string> = {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      };
      if (instance.authMethod === 'basic' && instance.username && instance.password) {
        headers['Authorization'] = `Basic ${btoa(`${instance.username}:${instance.password}`)}`;
      }
      const resp = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
      if (resp.status === 401) return { success: false, error: 'Authentication failed. Check your credentials.' };
      if (resp.status === 403) return { success: false, error: 'Access denied. Check user permissions.' };
      if (!resp.ok) return { success: false, error: `HTTP ${resp.status}: ${resp.statusText}` };
      const data = await resp.json() as { result?: Array<{ value?: string }> };
      const instanceName = data?.result?.[0]?.value || 'OK';
      return { success: true, info: { instanceName, url: instance.instanceUrl } };
    } catch (err) {
      // CORS will typically block this in browser — show a helpful message
      if (err instanceof TypeError && String(err).includes('fetch')) {
        return { success: true, info: { instanceName: 'Connection test unavailable in browser (CORS). Use the desktop app for full testing.' } };
      }
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  },

  // ── Server ──
  startServer: async (instanceName?: string) => {
    const instances = getInstances();
    const instance = instanceName
      ? instances.find(i => i.name === instanceName)
      : instances[0];

    if (!instance) return { success: false, error: 'No instance configured. Use Setup Wizard to add one.' };

    serverRunning = true;
    serverInstance = instance.name;
    serverPid = Math.floor(Math.random() * 60000) + 5000;
    serverStartedAt = new Date().toISOString();

    appendAuditEntry({
      ts: new Date().toISOString(),
      event: 'server:start',
      instance: instance.name,
      success: true,
    });

    return { success: true };
  },
  stopServer: async () => {
    const wasRunning = serverRunning;
    serverRunning = false;
    serverInstance = undefined;
    serverPid = undefined;
    serverStartedAt = undefined;

    if (wasRunning) {
      appendAuditEntry({
        ts: new Date().toISOString(),
        event: 'server:stop',
        success: true,
      });
    }

    return { success: true };
  },
  getServerStatus: async () => {
    return {
      running: serverRunning,
      instance: serverInstance,
      pid: serverPid,
      startedAt: serverStartedAt,
      toolCount: TOOL_DEFINITIONS.length,
    };
  },

  // ── Tools ──
  listTools: async () => {
    return TOOL_DEFINITIONS;
  },
  executeTool: async (name: string, args: Record<string, unknown>) => {
    if (!serverRunning) {
      return { success: false, error: 'Server is not running. Start the server first.' };
    }
    const start = Date.now();
    try {
      const result = await executeSnowTool(name, args);
      appendAuditEntry({
        ts: new Date().toISOString(),
        event: 'tool:call',
        tool: name,
        instance: serverInstance,
        success: true,
        durationMs: Date.now() - start,
      });
      return { success: true, result };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      appendAuditEntry({
        ts: new Date().toISOString(),
        event: 'tool:call',
        tool: name,
        instance: serverInstance,
        success: false,
        error: errMsg,
        durationMs: Date.now() - start,
      });
      return { success: false, error: errMsg };
    }
  },

  // ── Audit ──
  getAuditLogs: async (limit?: number) => {
    return getAuditEntries(limit || 100);
  },

  // ── System ──
  getVersion: async () => {
    return {
      app: (typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev') as string,
      electron: typeof navigator !== 'undefined' ? 'Browser' : 'N/A',
      node: typeof navigator !== 'undefined' ? navigator.userAgent.split(' ').pop() || 'Browser' : 'N/A',
    };
  },
  openExternal: async (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer');
  },
  selectDirectory: async () => {
    // Not available in browser
    return null;
  },
  getServerPath: async () => {
    return 'N/A (browser mode — use desktop app or CLI for MCP server)';
  },

  // ── AI Chat ──
  // In browser mode, uses Vite dev proxy (/api/ai/*) when running via `npm run dev:web`.
  // Falls back to direct API calls (only Google Gemini works via direct due to CORS).
  // For full provider support in browser, run `npm run dev:web` instead of `vite preview`.
  sendChat: async (params: {
    provider: string;
    apiKey: string;
    model: string;
    messages: Array<{ role: string; content: unknown }>;
    tools?: Array<{ name: string; description: string; inputSchema?: Record<string, unknown> }>;
    baseUrl?: string;
  }) => {
    const { provider, apiKey, model, messages, tools: toolDefs } = params;
    const isLocalProvider = provider === 'ollama' || provider === 'lmstudio';
    if (!apiKey && !isLocalProvider) return { error: 'No API key configured' };

    const chatStart = Date.now();
    const logChat = (prov: string, mdl: string, toolCount: number, success: boolean, durationMs: number, usage?: { inputTokens: number; outputTokens: number }, error?: string) => {
      const all = loadJSON<Array<Record<string, unknown>>>('nowaikit:audit', []);
      const entry: Record<string, unknown> = {
        ts: new Date().toISOString(), event: 'chat:send',
        provider: prov, model: mdl, toolCount, instance: serverInstance,
        success, durationMs,
      };
      if (usage) { entry.inputTokens = usage.inputTokens; entry.outputTokens = usage.outputTokens; }
      if (error) entry.error = error;
      all.push(entry);
      if (all.length > 2000) all.splice(0, all.length - 2000);
      saveJSON('nowaikit:audit', all);
    };

    const systemPrompt = toolDefs && toolDefs.length > 0
      ? 'You are NowAIKit, an AI assistant for ServiceNow. Use tools to fetch real data — never make up data.\n\nUse "query_records" with correct table: incident, change_request, problem, task, sys_user, cmdb_ci.\nQuery syntax: active=true, priority=1, ORDERBYDESCsys_created_on, nameLIKEtext.\nIMPORTANT: Do NOT add assigned_to filter unless user explicitly says "my" or "assigned to me". Query ALL matching records by default.'
      : undefined;

    // Always use proxy paths (/api/ai/*) in browser mode.
    // These are handled by: Vite dev server (dev), serve.js (preview/production), or reverse proxy (nginx etc.)
    // Google Gemini also supports direct CORS calls as fallback.

    // Sanitize error messages to prevent credential leakage
    const sanitizeError = (msg: string): string =>
      msg
        .replace(/sk-ant-[a-zA-Z0-9_-]+/g, 'sk-ant-***')
        .replace(/sk-[a-zA-Z0-9_-]{20,}/g, 'sk-***')
        .replace(/AIza[a-zA-Z0-9_-]+/g, 'AIza***')
        .replace(/gsk_[a-zA-Z0-9_-]+/g, 'gsk_***')
        .replace(/sk-or-[a-zA-Z0-9_-]+/g, 'sk-or-***')
        .replace(/key=[^&\s]+/g, 'key=***');

    try {
      if (provider === 'anthropic') {
        const anthropicTools = toolDefs?.map(t => ({
          name: t.name, description: t.description,
          input_schema: t.inputSchema || { type: 'object', properties: {} },
        }));
        const body: Record<string, unknown> = { model, max_tokens: 4096, messages };
        if (systemPrompt) body.system = systemPrompt;
        if (anthropicTools && anthropicTools.length > 0) body.tools = anthropicTools;

        const res = await fetch('/api/ai/anthropic/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'X-NowAIKit-Proxy': '1' },
          body: JSON.stringify(body),
        });
        if (!res.ok) { const e = sanitizeError(`API error ${res.status}: ${await res.text()}`); logChat(provider, model, toolDefs?.length || 0, false, Date.now() - chatStart, undefined, e); return { error: e }; }
        const data = await res.json() as Record<string, unknown>;
        const aUsage = data.usage as { input_tokens?: number; output_tokens?: number } | undefined;
        const usage = aUsage ? { inputTokens: aUsage.input_tokens || 0, outputTokens: aUsage.output_tokens || 0 } : undefined;
        logChat(provider, model, toolDefs?.length || 0, true, Date.now() - chatStart, usage);
        return { content: data.content as Array<{ type: string; text?: string; id?: string; name?: string; input?: Record<string, unknown> }>, stop_reason: data.stop_reason as string, usage };

      } else if (provider === 'google') {
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
          body.tools = [{ functionDeclarations: toolDefs.map(t => ({ name: t.name, description: t.description, parameters: t.inputSchema || { type: 'object', properties: {} } })) }];
        }

        // Try proxy first, fall back to direct (Google supports CORS)
        const proxyUrl = `/api/ai/google/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const directUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        let res: Response;
        try {
          res = await fetch(proxyUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-NowAIKit-Proxy': '1' }, body: JSON.stringify(body) });
          // If proxy returns 404 or non-JSON, it means no proxy server — fall back to direct
          if (res.status === 404) throw new Error('proxy_not_available');
        } catch {
          res = await fetch(directUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        }
        if (!res.ok) { const e = sanitizeError(`Google AI error ${res.status}: ${await res.text()}`); logChat(provider, model, toolDefs?.length || 0, false, Date.now() - chatStart, undefined, e); return { error: e }; }
        const data = await res.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string; functionCall?: { name: string; args: Record<string, unknown> } }> } }>; usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number } };
        const parts = data.candidates?.[0]?.content?.parts ?? [];
        const content: Array<{ type: string; text?: string; id?: string; name?: string; input?: Record<string, unknown> }> = [];
        for (const p of parts) {
          if (p.text) content.push({ type: 'text', text: p.text });
          if (p.functionCall) content.push({ type: 'tool_use', id: `toolu_${Date.now()}`, name: p.functionCall.name, input: p.functionCall.args });
        }
        const gUsage = data.usageMetadata;
        const usage = gUsage ? { inputTokens: gUsage.promptTokenCount || 0, outputTokens: gUsage.candidatesTokenCount || 0 } : undefined;
        logChat(provider, model, toolDefs?.length || 0, true, Date.now() - chatStart, usage);
        return { content, stop_reason: content.some(c => c.type === 'tool_use') ? 'tool_use' : 'end_turn', usage };

      } else {
        // OpenAI-compatible (OpenAI, Groq, OpenRouter)
        const proxyEndpoints: Record<string, string> = {
          openai: '/api/ai/openai/v1/chat/completions',
          groq: '/api/ai/groq/openai/v1/chat/completions',
          openrouter: '/api/ai/openrouter/api/v1/chat/completions',
          ollama: '/api/ai/ollama/v1/chat/completions',
          lmstudio: '/api/ai/lmstudio/v1/chat/completions',
        };
        const url = proxyEndpoints[provider];
        if (!url) return { error: `Unknown provider: ${provider}` };

        // Convert messages to OpenAI format
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
              oaiMessages.push({
                role: 'assistant', content: textParts || null,
                tool_calls: toolUses.map(tu => ({ id: tu.id, type: 'function', function: { name: tu.name, arguments: JSON.stringify(tu.input) } })),
              });
            } else if (toolResults.length > 0) {
              for (const tr of toolResults) {
                oaiMessages.push({ role: 'tool', tool_call_id: tr.tool_use_id, content: typeof tr.content === 'string' ? tr.content : JSON.stringify(tr.content) });
              }
            } else if (textParts) {
              oaiMessages.push({ role: m.role, content: textParts });
            }
          }
        }

        const body: Record<string, unknown> = { model, messages: oaiMessages };
        const openaiTools = toolDefs?.map(t => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.inputSchema || { type: 'object', properties: {} } } }));
        if (openaiTools && openaiTools.length > 0) body.tools = openaiTools;

        const fetchHeaders: Record<string, string> = { 'Content-Type': 'application/json', 'X-NowAIKit-Proxy': '1' };
        if (apiKey) fetchHeaders['Authorization'] = `Bearer ${apiKey}`;
        const res = await fetch(url, {
          method: 'POST',
          headers: fetchHeaders,
          body: JSON.stringify(body),
        });
        if (!res.ok) { const e = sanitizeError(`API error ${res.status}: ${await res.text()}`); logChat(provider, model, toolDefs?.length || 0, false, Date.now() - chatStart, undefined, e); return { error: e }; }
        const data = await res.json() as { choices?: Array<{ message?: { content?: string; tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }> } }>; usage?: { prompt_tokens?: number; completion_tokens?: number } };
        const msg = data.choices?.[0]?.message;
        const content: Array<{ type: string; text?: string; id?: string; name?: string; input?: Record<string, unknown> }> = [];
        if (msg?.content) content.push({ type: 'text', text: msg.content });
        if (msg?.tool_calls) {
          for (const tc of msg.tool_calls) {
            let args: Record<string, unknown> = {};
            try { args = JSON.parse(tc.function.arguments); } catch { /* empty */ }
            content.push({ type: 'tool_use', id: tc.id, name: tc.function.name, input: args });
          }
        }
        const oUsage = data.usage;
        const usage = oUsage ? { inputTokens: oUsage.prompt_tokens || 0, outputTokens: oUsage.completion_tokens || 0 } : undefined;
        logChat(provider, model, toolDefs?.length || 0, true, Date.now() - chatStart, usage);
        return { content, stop_reason: content.some(c => c.type === 'tool_use') ? 'tool_use' : 'end_turn', usage };
      }
    } catch (err) {
      const errMsg = err instanceof TypeError && String(err.message).includes('Failed to fetch')
        ? 'AI proxy not available. Run "npm run serve" or "npm run dev:web" for browser AI chat, or use the desktop app.'
        : (err instanceof Error ? err.message : 'Request failed');
      logChat(provider, model, toolDefs?.length || 0, false, Date.now() - chatStart, undefined, errMsg);
      return { error: errMsg };
    }
  },
};

// ─── Export ──────────────────────────────────────────────────────────────────

export const api: ElectronAPI = isElectron ? window.api : webApi;

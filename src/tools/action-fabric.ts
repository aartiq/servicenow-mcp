/**
 * ServiceNow Action Fabric: work alongside the instance's own MCP servers (MCP Server Console and the
 * out-of-box ITSM / ITOM / CMDB / SPM servers) and call its AI agents over A2A.
 *
 * NowAIKit acts as a client here. ServiceNow's MCP endpoint only accepts JWT access tokens from an
 * OAuth authorization-code (+PKCE) sign-in, which is exactly what `nowaikit auth login` produces when
 * the instance's OAuth app uses the JWT token format (`nowaikit setup` creates it that way). The same
 * token works for the REST API, so one sign-in covers NowAIKit's own tools and ServiceNow's.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { ServiceNowClient } from '../servicenow/client.js';
import { ServiceNowError } from '../utils/errors.js';
import { requireWrite } from '../utils/permissions.js';
import { VERSION } from '../utils/version.js';

const SYS_ID = /^[0-9a-f]{32}$/i;
const SERVER_NAME = /^[a-z0-9_.-]{1,100}$/i;
const READ = { readOnlyHint: true, openWorldHint: true };
const WRITE = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true };

function val(r: any, f: string): string {
  const v = r?.[f];
  if (v && typeof v === 'object') return String(v.value ?? '');
  return v === undefined || v === null ? '' : String(v);
}

/** The URL path segment for a registry record name (sn_mcp_server.default → sn_mcp_server_default). */
export function mcpEndpointName(name: string): string {
  return name.replace(/\./g, '_');
}

export function isJwt(token: string): boolean {
  const parts = token.split('.');
  return parts.length === 3 && parts.every((p) => /^[A-Za-z0-9_-]+$/.test(p));
}

/** Bearer token for ServiceNow's MCP / A2A endpoints, with a precise fix when there isn't a usable one. */
export async function actionFabricBearer(client: ServiceNowClient): Promise<string> {
  const override = (process.env.NOWAIKIT_SN_MCP_TOKEN || '').trim();
  if (override) return override;
  const header = await client.authorizationHeader();
  if (header.startsWith('Bearer ')) {
    const token = header.slice(7);
    if (isJwt(token)) return token;
    throw new ServiceNowError(
      'ServiceNow MCP servers and A2A agents only accept JWT access tokens, and this connection uses an opaque OAuth token. ' +
        'Fix: on the instance open System OAuth > Application Registry > your NowAIKit app and set Token Format to JWT, ' +
        'then run `nowaikit auth login` again.',
      'AUTH_JWT_REQUIRED',
    );
  }
  throw new ServiceNowError(
    'ServiceNow MCP servers and A2A agents need an OAuth sign-in (JWT), and this connection uses basic auth. ' +
      'Fix: run `nowaikit setup` and choose "Sign in with browser (OAuth)" for this instance, or `nowaikit auth login` ' +
      'if an OAuth app already exists. The same sign-in keeps working for every other NowAIKit tool.',
    'AUTH_OAUTH_REQUIRED',
  );
}

async function withMcp<T>(client: ServiceNowClient, server: string, fn: (mcp: Client) => Promise<T>): Promise<T> {
  if (!SERVER_NAME.test(server)) throw new ServiceNowError('server must be an MCP server name, e.g. sn_mcp_server_default', 'INVALID_REQUEST');
  const token = await actionFabricBearer(client);
  const url = new URL(`${client.instanceUrl}/sncapps/mcp-server/mcp/${mcpEndpointName(server)}`);
  const transport = new StreamableHTTPClientTransport(url, { requestInit: { headers: { Authorization: `Bearer ${token}` } } });
  const mcp = new Client({ name: 'nowaikit', version: VERSION });
  try {
    await mcp.connect(transport);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/401|unauthor|JWT/i.test(msg)) {
      throw new ServiceNowError(`The instance rejected the token for MCP server "${server}": ${msg}. Run \`nowaikit auth login\` to refresh it.`, 'AUTHENTICATION_FAILED');
    }
    throw new ServiceNowError(`Could not connect to MCP server "${server}": ${msg}`, 'MCP_CONNECT_FAILED');
  }
  try {
    return await fn(mcp);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/not found or inactive/i.test(msg)) {
      throw new ServiceNowError(
        `MCP server "${server}" is missing or inactive on this instance. Check sn_mcp_list_servers, then activate it with sn_mcp_activate_server.`,
        'NOT_FOUND',
      );
    }
    throw e instanceof ServiceNowError ? e : new ServiceNowError(msg, 'MCP_CALL_FAILED');
  } finally {
    await mcp.close().catch(() => {});
  }
}

/** Resolve an AI agent by sys_id or name. */
async function resolveAgent(client: ServiceNowClient, ref: string): Promise<{ sys_id: string; name: string }> {
  const r = String(ref || '').trim();
  if (!r) throw new ServiceNowError('agent is required (sys_id or name)', 'INVALID_REQUEST');
  const q = SYS_ID.test(r) ? `sys_id=${r}` : `name=${r.replace(/[\^\n]/g, ' ')}^ORnameLIKE${r.replace(/[\^\n]/g, ' ')}`;
  const resp = await client.queryRecords({ table: 'sn_aia_agent', query: q, fields: 'sys_id,name', limit: 1 });
  const rec = resp.records[0] as any;
  if (!rec) throw new ServiceNowError(`AI agent not found: ${r}`, 'NOT_FOUND');
  return { sys_id: val(rec, 'sys_id'), name: val(rec, 'name') };
}

function textParts(message: any): string {
  return ((message?.parts || []) as any[]).map((p) => p?.text ?? (p?.kind === 'data' ? JSON.stringify(p.data) : '')).filter(Boolean).join('\n');
}

export function getActionFabricToolDefinitions() {
  return [
    {
      name: 'sn_mcp_status',
      description:
        'Check whether this instance\'s own MCP servers (ServiceNow MCP Server Console, Action Fabric) are usable from here: ' +
        'endpoint health, OAuth/JWT readiness of the current connection, and each server\'s status and tool count, with fixes.',
      inputSchema: { type: 'object', properties: {}, required: [] },
      annotations: READ,
    },
    {
      name: 'sn_mcp_list_servers',
      description:
        'List the ServiceNow MCP servers defined on the instance (MCP Server Console registry, including out-of-box ITSM, ITOM, ' +
        'CMDB and SPM servers when installed), with status, endpoint URL and attached tools.',
      inputSchema: {
        type: 'object',
        properties: { status: { type: 'string', enum: ['active', 'draft', 'inactive'], description: 'Filter by status' } },
        required: [],
      },
      annotations: READ,
    },
    {
      name: 'sn_mcp_list_tools',
      description:
        'List the tools a ServiceNow MCP server exposes (live tools/list over MCP, with input schemas and annotations). ' +
        'Needs an OAuth (JWT) sign-in; see sn_mcp_status.',
      inputSchema: {
        type: 'object',
        properties: { server: { type: 'string', description: 'Server name, e.g. sn_mcp_server_default' } },
        required: ['server'],
      },
      annotations: READ,
    },
    {
      name: 'sn_mcp_call_tool',
      description:
        'Call a tool on one of the instance\'s own MCP servers (Now Assist / Otto skills, subflows, actions, Knowledge Graph, ' +
        'scripted REST tools). Runs as the signed-in user and consumes Now Assist entitlement like any MCP call. Tools that ' +
        'ServiceNow does not mark read-only need WRITE_ENABLED=true.',
      inputSchema: {
        type: 'object',
        properties: {
          server: { type: 'string', description: 'Server name, e.g. sn_mcp_server_default' },
          tool: { type: 'string', description: 'Tool name from sn_mcp_list_tools' },
          arguments: { type: 'object', description: 'Tool arguments' },
        },
        required: ['server', 'tool'],
      },
      annotations: WRITE,
    },
    {
      name: 'sn_mcp_activate_server',
      description:
        'Activate or deactivate a ServiceNow MCP server, and optionally attach tool definitions to it by name ' +
        '(admin setup helper for MCP Server Console). REQUIRES WRITE_ENABLED=true and the sn_mcp_server.admin role.',
      inputSchema: {
        type: 'object',
        properties: {
          server: { type: 'string', description: 'Server name or sys_id' },
          status: { type: 'string', enum: ['active', 'inactive'], description: 'New status (default active)' },
          add_tools: { type: 'array', items: { type: 'string' }, description: 'Tool definition names to attach, e.g. ["sn_mcp_server.incident_summarization"]' },
        },
        required: ['server'],
      },
      annotations: WRITE,
    },
    {
      name: 'sn_a2a_list_agents',
      description:
        'List ServiceNow AI agents (Otto / AI Agent Studio) and whether each is exposed to external callers over A2A, ' +
        'with its agent card URL.',
      inputSchema: {
        type: 'object',
        properties: {
          exposed_only: { type: 'boolean', description: 'Only agents open to third-party (A2A) access' },
          search: { type: 'string', description: 'Filter by name' },
          limit: { type: 'number', description: 'Max agents (default 25)' },
        },
        required: [],
      },
      annotations: READ,
    },
    {
      name: 'sn_a2a_get_agent_card',
      description: 'Fetch the A2A agent card of a ServiceNow AI agent (skills, capabilities, supported protocol versions).',
      inputSchema: {
        type: 'object',
        properties: { agent: { type: 'string', description: 'Agent sys_id or name' } },
        required: ['agent'],
      },
      annotations: READ,
    },
    {
      name: 'sn_a2a_send_message',
      description:
        'Send a message to a ServiceNow AI agent over A2A and return its reply (or the task when it needs more input or runs ' +
        'async). Pass context_id / task_id from a previous reply to continue the conversation. The agent acts with its own ' +
        'tools, so this REQUIRES WRITE_ENABLED=true.',
      inputSchema: {
        type: 'object',
        properties: {
          agent: { type: 'string', description: 'Agent sys_id or name' },
          message: { type: 'string', description: 'What to ask the agent' },
          context_id: { type: 'string', description: 'Continue an earlier conversation' },
          task_id: { type: 'string', description: 'Answer an agent that asked for more input' },
          wait_seconds: { type: 'number', description: 'How long to wait for an async agent to finish (default 120, max 600; 0 returns the task immediately)' },
        },
        required: ['agent', 'message'],
      },
      annotations: WRITE,
    },
    {
      name: 'sn_a2a_get_task',
      description: 'Get the status and result of an A2A task started with sn_a2a_send_message.',
      inputSchema: {
        type: 'object',
        properties: {
          agent: { type: 'string', description: 'Agent sys_id or name' },
          task_id: { type: 'string', description: 'Task id from the earlier reply' },
        },
        required: ['agent', 'task_id'],
      },
      annotations: READ,
    },
    {
      name: 'sn_a2a_expose_agent',
      description:
        'Turn third-party (A2A) access on or off for a ServiceNow AI agent ("Allow third party to access this AI agent"). ' +
        'REQUIRES WRITE_ENABLED=true and AI agent admin rights.',
      inputSchema: {
        type: 'object',
        properties: {
          agent: { type: 'string', description: 'Agent sys_id or name' },
          exposed: { type: 'boolean', description: 'true to allow A2A access, false to remove it (default true)' },
        },
        required: ['agent'],
      },
      annotations: WRITE,
    },
  ];
}

export async function executeActionFabricToolCall(client: ServiceNowClient, name: string, args: Record<string, any>): Promise<any> {
  switch (name) {
    case 'sn_mcp_status': {
      const out: Record<string, any> = { instance: client.instanceUrl, checks: [] as any[] };
      const add = (check: string, ok: boolean, detail: string, fix?: string) => out.checks.push({ check, ok, detail, ...(fix && !ok ? { fix } : {}) });
      try {
        const h = await fetch(`${client.instanceUrl}/sncapps/mcp-server/health`, { headers: { Accept: 'application/json' } });
        add('MCP Server Console endpoint', h.ok, h.ok ? 'healthy' : `HTTP ${h.status}`, 'Install or activate the MCP Server Console app (sn_mcp_server) from the ServiceNow Store. It needs Now Assist / Otto.');
      } catch (e) {
        add('MCP Server Console endpoint', false, e instanceof Error ? e.message : String(e));
      }
      try {
        await actionFabricBearer(client);
        add('OAuth (JWT) sign-in', true, 'this connection has a JWT access token');
      } catch (e) {
        add('OAuth (JWT) sign-in', false, (e as Error).message.split('. Fix:')[0]!, (e as Error).message.split('Fix: ')[1]);
      }
      try {
        const reg = await client.queryRecords({ table: 'sn_mcp_server_registry', fields: 'sys_id,name,label,status,tools', limit: 50 });
        out.servers = (reg.records as any[]).map((r) => ({
          name: val(r, 'name'), label: val(r, 'label'), status: val(r, 'status'),
          tools: val(r, 'tools') ? val(r, 'tools').split(',').length : 0,
          endpoint: `${client.instanceUrl}/sncapps/mcp-server/mcp/${mcpEndpointName(val(r, 'name'))}`,
        }));
        const active = out.servers.filter((s: any) => s.status === 'active');
        add('Active MCP servers', active.length > 0, `${active.length} of ${out.servers.length} active`, 'Activate a server with sn_mcp_activate_server (or in MCP Server Console).');
        const empty = active.filter((s: any) => !s.tools);
        if (empty.length) add('Tools attached', false, `${empty.map((s: any) => s.name).join(', ')} has no tools`, 'Attach tools with sn_mcp_activate_server add_tools, or in MCP Server Console.');
      } catch (e) {
        add('MCP server registry', false, (e as Error).message.split('\n')[0]!, 'The MCP Server Console app (sn_mcp_server) is not installed, or this user lacks sn_mcp_server.viewer.');
      }
      out.ready = out.checks.every((c: any) => c.ok);
      return out;
    }

    case 'sn_mcp_list_servers': {
      const q = args.status ? `status=${String(args.status).replace(/[^a-z]/gi, '')}` : undefined;
      const reg = await client.queryRecords({ table: 'sn_mcp_server_registry', query: q, fields: 'sys_id,name,label,status,tools,description', limit: 100 });
      const servers = (reg.records as any[]).map((r) => ({
        sys_id: val(r, 'sys_id'), name: val(r, 'name'), label: val(r, 'label'), status: val(r, 'status'), description: val(r, 'description'),
        endpoint: `${client.instanceUrl}/sncapps/mcp-server/mcp/${mcpEndpointName(val(r, 'name'))}`,
        tool_sys_ids: val(r, 'tools') ? val(r, 'tools').split(',') : [],
      }));
      const ids = [...new Set(servers.flatMap((s) => s.tool_sys_ids))];
      if (ids.length) {
        const tools = await client.queryRecords({ table: 'sn_mcp_tool_definition', query: `sys_idIN${ids.join(',')}`, fields: 'sys_id,name,sys_class_name', limit: ids.length });
        const byId = Object.fromEntries((tools.records as any[]).map((t) => [val(t, 'sys_id'), { name: val(t, 'name'), type: val(t, 'sys_class_name').replace(/^sn_mcp_|_tool_definition$/g, '') }]));
        for (const s of servers as any[]) s.tools = s.tool_sys_ids.map((id: string) => byId[id] || { sys_id: id });
      }
      return { count: servers.length, servers: servers.map(({ tool_sys_ids: _ids, ...s }) => s) };
    }

    case 'sn_mcp_list_tools': {
      const server = String(args.server || '');
      return withMcp(client, server, async (mcp) => {
        const { tools } = await mcp.listTools();
        return { server, count: tools.length, tools };
      });
    }

    case 'sn_mcp_call_tool': {
      const server = String(args.server || '');
      const tool = String(args.tool || '');
      if (!tool) throw new ServiceNowError('tool is required', 'INVALID_REQUEST');
      return withMcp(client, server, async (mcp) => {
        const { tools } = await mcp.listTools();
        const def = tools.find((t) => t.name === tool);
        if (!def) throw new ServiceNowError(`Tool "${tool}" is not on server "${server}". Available: ${tools.map((t) => t.name).join(', ') || 'none'}`, 'NOT_FOUND');
        if (!def.annotations?.readOnlyHint) requireWrite();
        const result = await mcp.callTool({ name: tool, arguments: (args.arguments as Record<string, unknown>) || {} });
        return { server, tool, ...result };
      });
    }

    case 'sn_mcp_activate_server': {
      requireWrite();
      const ref = String(args.server || '').trim();
      if (!ref) throw new ServiceNowError('server is required', 'INVALID_REQUEST');
      const safe = ref.replace(/[\^\n]/g, ' ');
      const q = SYS_ID.test(ref) ? `sys_id=${ref}` : `name=${safe}^ORname=${safe.replace(/_(?=[^_]*$)/, '.')}^ORlabel=${safe}`;
      const reg = await client.queryRecords({ table: 'sn_mcp_server_registry', query: q, fields: 'sys_id,name,status,tools', limit: 1 });
      const rec = reg.records[0] as any;
      if (!rec) throw new ServiceNowError(`MCP server not found: ${ref}`, 'NOT_FOUND');
      const update: Record<string, string> = { status: args.status === 'inactive' ? 'inactive' : 'active' };
      const added: string[] = [];
      if (Array.isArray(args.add_tools) && args.add_tools.length) {
        const names = args.add_tools.map((n: unknown) => String(n).replace(/[\^\n,]/g, '')).filter(Boolean);
        const found = await client.queryRecords({ table: 'sn_mcp_tool_definition', query: `nameIN${names.join(',')}`, fields: 'sys_id,name', limit: names.length });
        const missing = names.filter((n: string) => !(found.records as any[]).some((t) => val(t, 'name') === n));
        if (missing.length) throw new ServiceNowError(`Tool definitions not found: ${missing.join(', ')}`, 'NOT_FOUND');
        const current = val(rec, 'tools') ? val(rec, 'tools').split(',') : [];
        for (const t of found.records as any[]) if (!current.includes(val(t, 'sys_id'))) { current.push(val(t, 'sys_id')); added.push(val(t, 'name')); }
        update.tools = current.join(',');
      }
      await client.updateRecord('sn_mcp_server_registry', val(rec, 'sys_id'), update);
      return {
        server: val(rec, 'name'), status: update.status, tools_added: added,
        endpoint: `${client.instanceUrl}/sncapps/mcp-server/mcp/${mcpEndpointName(val(rec, 'name'))}`,
      };
    }

    case 'sn_a2a_list_agents': {
      const limit = Math.min(Math.max(Number(args.limit) || 25, 1), 200);
      // sn_aia_agent has no active flag; activity and A2A exposure live on sn_aia_agent_config.
      const q = args.search ? `nameLIKE${String(args.search).replace(/[\^\n]/g, ' ')}^ORDERBYname` : 'ORDERBYname';
      const agents = await client.queryRecords({ table: 'sn_aia_agent', query: q, fields: 'sys_id,name,description', limit: 500 });
      let exposed = new Set<string>();
      let inactive = new Set<string>();
      try {
        const cfg = await client.queryRecords({ table: 'sn_aia_agent_config', fields: 'agent,public,active', limit: 1000 });
        exposed = new Set((cfg.records as any[]).filter((r) => val(r, 'public') === 'true').map((r) => val(r, 'agent')));
        inactive = new Set((cfg.records as any[]).filter((r) => val(r, 'active') === 'false').map((r) => val(r, 'agent')));
      } catch { /* config table restricted: report exposure as unknown */ }
      const rows = (agents.records as any[])
        .filter((a) => !inactive.has(val(a, 'sys_id')))
        .map((a) => ({
          sys_id: val(a, 'sys_id'), name: val(a, 'name'), description: val(a, 'description').slice(0, 300),
          a2a_exposed: exposed.has(val(a, 'sys_id')),
          agent_card_url: `${client.instanceUrl}/api/sn_aia/a2a/v2/agent_card/id/${val(a, 'sys_id')}`,
        }))
        .filter((a) => !args.exposed_only || a.a2a_exposed);
      return {
        count: Math.min(rows.length, limit), exposed: rows.filter((a) => a.a2a_exposed).length, agents: rows.slice(0, limit),
        note: rows.some((a) => a.a2a_exposed) ? undefined : 'No agent is exposed to A2A yet. Use sn_a2a_expose_agent, and make sure sn_aia.external_agents.enabled is true.',
      };
    }

    case 'sn_a2a_get_agent_card': {
      const agent = await resolveAgent(client, args.agent);
      try {
        const card = await client.apiRequest('GET', `/api/sn_aia/a2a/v2/agent_card/id/${agent.sys_id}`);
        return { agent, card: card?.result ?? card };
      } catch (e) {
        const msg = (e as Error).message;
        if (/no agent available/i.test(msg)) {
          throw new ServiceNowError(`"${agent.name}" is not exposed to A2A. Turn it on with sn_a2a_expose_agent.`, 'NOT_EXPOSED');
        }
        throw e;
      }
    }

    case 'sn_a2a_send_message': {
      requireWrite();
      const agent = await resolveAgent(client, args.agent);
      const text = String(args.message || '').trim();
      if (!text) throw new ServiceNowError('message is required', 'INVALID_REQUEST');
      const message: Record<string, any> = {
        kind: 'message', role: 'user', messageId: `nowaikit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        parts: [{ kind: 'text', text }],
      };
      if (args.context_id) message.contextId = String(args.context_id);
      if (args.task_id) message.taskId = String(args.task_id);
      // ServiceNow validates acceptedOutputModes against the agent card, so take them from the card.
      let outputModes: string[] = ['text/plain'];
      try {
        const card = await client.apiRequest('GET', `/api/sn_aia/a2a/v2/agent_card/id/${agent.sys_id}`);
        const modes = (card?.result ?? card)?.defaultOutputModes;
        if (Array.isArray(modes) && modes.length) outputModes = modes.map(String);
      } catch (e) {
        if (/no agent available/i.test((e as Error).message)) {
          throw new ServiceNowError(`"${agent.name}" is not exposed to A2A. Turn it on with sn_a2a_expose_agent.`, 'NOT_EXPOSED');
        }
      }
      const path = `/api/sn_aia/a2a/v2/agent/id/${agent.sys_id}`;
      // A2A needs an OAuth (JWT) token with a2aauthscope; basic auth is refused by the instance.
      const auth = { Authorization: `Bearer ${await actionFabricBearer(client)}` };
      const send = (configuration: Record<string, unknown>) => client.apiRequest('POST', path, {
        jsonrpc: '2.0', id: message.messageId, method: 'message/send', params: { message, configuration },
      }, auth);
      let resp: any;
      try {
        resp = await send({ blocking: true, acceptedOutputModes: outputModes });
      } catch (e) {
        const msg = (e as Error).message;
        if (/scope: a2aauthscope/i.test(msg)) {
          throw new ServiceNowError(
            'ServiceNow only accepts A2A calls with an OAuth token that has the a2aauthscope scope. Fix: add the "a2aauthscope" auth scope ' +
              'to your NowAIKit OAuth app (System OAuth > Application Registry > Auth Scopes), then run `nowaikit auth login` again.',
            'AUTH_SCOPE_REQUIRED',
          );
        }
        if (/push notification url is required/i.test(msg)) {
          throw new ServiceNowError(
            'This instance runs external A2A calls asynchronously, which needs a registered callback URL. For direct use from NowAIKit, ' +
              'switch it to synchronous: AI Agent Studio > Settings > External AI agents > Discoverability > Communication mode = Synchronous.',
            'A2A_ASYNC_MODE',
          );
        }
        throw e;
      }
      if (resp?.error) throw new ServiceNowError(`A2A error from "${agent.name}": ${resp.error.message || JSON.stringify(resp.error)}`, 'A2A_ERROR');
      let result = resp?.result ?? resp;
      const waitMs = Math.min(Math.max(Number(args.wait_seconds) || 120, 0), 600) * 1000;
      const deadline = Date.now() + waitMs;
      while (result?.kind === 'task' && ['submitted', 'working'].includes(String(result?.status?.state)) && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 3000));
        const poll = await client.apiRequest('POST', path, { jsonrpc: '2.0', id: `${message.messageId}-poll`, method: 'tasks/get', params: { id: result.id } }, auth);
        if (poll?.error) break;
        result = poll?.result ?? result;
      }
      const isTask = result?.kind === 'task' || !!result?.status;
      const reply = isTask
        ? textParts(result?.status?.message) || ((result?.artifacts || []) as any[]).map((a) => textParts(a)).filter(Boolean).join('\n')
        : textParts(result);
      return {
        agent,
        reply,
        state: isTask ? result?.status?.state : 'completed',
        task_id: isTask ? result?.id : undefined,
        context_id: result?.contextId,
        raw: result,
      };
    }

    case 'sn_a2a_get_task': {
      const agent = await resolveAgent(client, args.agent);
      if (!args.task_id) throw new ServiceNowError('task_id is required', 'INVALID_REQUEST');
      const resp = await client.apiRequest('POST', `/api/sn_aia/a2a/v2/agent/id/${agent.sys_id}`, {
        jsonrpc: '2.0', id: `nowaikit-${Date.now()}`, method: 'tasks/get', params: { id: String(args.task_id) },
      }, { Authorization: `Bearer ${await actionFabricBearer(client)}` });
      if (resp?.error) throw new ServiceNowError(`A2A error: ${resp.error.message || JSON.stringify(resp.error)}`, 'A2A_ERROR');
      const task = resp?.result ?? resp;
      return { agent, state: task?.status?.state, reply: textParts(task?.status?.message), task };
    }

    case 'sn_a2a_expose_agent': {
      requireWrite();
      const agent = await resolveAgent(client, args.agent);
      const exposed = args.exposed !== false;
      const cfg = await client.queryRecords({ table: 'sn_aia_agent_config', query: `agent=${agent.sys_id}`, fields: 'sys_id,public', limit: 1 });
      const rec = cfg.records[0] as any;
      if (!rec) throw new ServiceNowError(`No agent configuration record found for "${agent.name}". Open it once in AI Agent Studio and save.`, 'NOT_FOUND');
      await client.updateRecord('sn_aia_agent_config', val(rec, 'sys_id'), { public: exposed ? 'true' : 'false' });
      return {
        agent, a2a_exposed: exposed,
        agent_card_url: `${client.instanceUrl}/api/sn_aia/a2a/v2/agent_card/id/${agent.sys_id}`,
        note: exposed ? 'External callers also need sn_aia.external_agents.enabled=true and an integration user with sn_aia.integration.' : undefined,
      };
    }

    default:
      return null;
  }
}

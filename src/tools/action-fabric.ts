/**
 * ServiceNow Action Fabric: work alongside the instance's own MCP servers (MCP Server Console and the
 * out-of-box ITSM / ITOM / CMDB / SPM servers) and call its AI agents over A2A.
 *
 * NowAIKit acts as a client here. ServiceNow's MCP endpoint only accepts JWT access tokens from an
 * OAuth authorization-code (+PKCE) sign-in, which is exactly what `nowaikit auth login` produces when
 * the instance's OAuth app uses the JWT token format (`nowaikit setup` creates it that way). The same
 * token works for the REST API, so one sign-in covers NowAIKit's own tools and ServiceNow's.
 */
// v2 client in its default (legacy) negotiation mode: the same 2025 initialize handshake as v1, which is
// what the instance's MCP servers speak today.
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
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
    if (/401|unauthor|JWT|expired|token validation|authentication failed/i.test(msg)) {
      throw new ServiceNowError(`The instance rejected the sign-in token for MCP server "${server}" (${/expired/i.test(msg) ? 'it has expired' : msg}). Run \`nowaikit auth login\` to sign in again.`, 'AUTHENTICATION_FAILED');
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

// ─── MCP Server Console authoring (server side) and MCP client registry ─────────────────────────────

const DESTRUCTIVE = { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true };
const TOOL_NAME = /^[a-z0-9_.]{1,128}$/;
/** Tool definition subclasses the MCP Server Console ships (category choice → table). Verified on Zurich-era instances. */
const TOOL_SOURCES = {
  skill: { table: 'sn_mcp_ai_skill_tool_definition', category: 'ai_skill', inputTable: 'sn_mcp_ai_skill_tool_input' },
  scripted_rest: { table: 'sn_mcp_scripted_rest_tool_definition', category: 'rest_api', inputTable: 'sn_mcp_scripted_rest_input' },
} as const;
const REST_INPUT_TYPES = ['string', 'boolean', 'number', 'simple_array', 'object', 'date-time'];

/** Strip encoded-query control characters from a user value. */
function q(v: unknown): string {
  return String(v ?? '').replace(/[\^\n\r]/g, ' ').trim();
}

/** The MCP Server Console naming rule: lowercase, non-alphanumerics collapsed to "_". */
export function slugName(label: string): string {
  return String(label || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function stripHtml(s: string): string {
  return s.replace(/<\/?[^>]+(>|$)/g, '').trim();
}

function endpointFor(client: ServiceNowClient, name: string): string {
  return `${client.instanceUrl}/sncapps/mcp-server/mcp/${mcpEndpointName(name)}`;
}

interface ServerRec { sys_id: string; name: string; label: string; status: string; url: string; tools: string[]; scope: string }

async function resolveServer(client: ServiceNowClient, ref: unknown): Promise<ServerRec> {
  const r = q(ref);
  if (!r) throw new ServiceNowError('server is required (name, label or sys_id)', 'INVALID_REQUEST');
  const query = SYS_ID.test(r) ? `sys_id=${r}` : `name=${r}^ORname=${r.replace(/_(?=[^_]*$)/, '.')}^ORlabel=${r}`;
  const reg = await client.queryRecords({ table: 'sn_mcp_server_registry', query, fields: 'sys_id,name,label,status,url,tools,sys_scope', limit: 1 });
  const rec = reg.records[0] as any;
  if (!rec) throw new ServiceNowError(`MCP server not found: ${r}. List servers with sn_mcp_list_servers.`, 'NOT_FOUND');
  return {
    sys_id: val(rec, 'sys_id'), name: val(rec, 'name'), label: val(rec, 'label'), status: val(rec, 'status'), url: val(rec, 'url'),
    tools: val(rec, 'tools') ? val(rec, 'tools').split(',').filter(Boolean) : [], scope: val(rec, 'sys_scope'),
  };
}

async function resolveToolDefs(client: ServiceNowClient, refs: unknown[]): Promise<Array<{ sys_id: string; name: string; label: string; servers: string[]; scope: string; cls: string }>> {
  const wanted = refs.map(q).filter(Boolean);
  if (!wanted.length) return [];
  const ids = wanted.filter((w) => SYS_ID.test(w));
  const names = wanted.filter((w) => !SYS_ID.test(w)).map((n) => n.replace(/,/g, ''));
  const parts = [ids.length ? `sys_idIN${ids.join(',')}` : '', names.length ? `nameIN${names.join(',')}` : ''].filter(Boolean);
  const found = await client.queryRecords({
    table: 'sn_mcp_tool_definition', query: parts.join('^OR'), fields: 'sys_id,name,label,servers,sys_scope,sys_class_name', limit: wanted.length * 2,
  });
  const recs = (found.records as any[]).filter((t) => wanted.includes(val(t, 'sys_id')) || wanted.includes(val(t, 'name'))).map((t) => ({
    sys_id: val(t, 'sys_id'), name: val(t, 'name'), label: val(t, 'label'),
    servers: val(t, 'servers') ? val(t, 'servers').split(',').filter(Boolean) : [], scope: val(t, 'sys_scope'), cls: val(t, 'sys_class_name'),
  }));
  const missing = wanted.filter((w) => !recs.some((t) => t.sys_id === w || t.name === w));
  if (missing.length) throw new ServiceNowError(`Tool definitions not found: ${missing.join(', ')}. Check sn_mcp_list_servers or create one with sn_mcp_add_tool.`, 'NOT_FOUND');
  return recs;
}

/** Tables the platform touches when a server goes active (Sync Oauth Data + Sync MCP data to AICT business rules). */
interface Footprint { table: string; sys_id: string; name: string; what: string }

/**
 * Query that never throws and only keeps rows that really match. ServiceNow ignores an unknown field in an encoded
 * query and returns every row, so each caller passes a check that is re-applied client-side; these rows feed deletes.
 */
async function safeQuery(client: ServiceNowClient, table: string, query: string, fields: string, check: (r: any) => boolean, limit = 20): Promise<any[]> {
  try {
    const recs = (await client.queryRecords({ table, query, fields, limit })).records as any[];
    return recs.filter(check);
  } catch {
    return []; // table absent on this release, or not readable by this user
  }
}

/**
 * Find the records ServiceNow auto-creates for an active MCP server (business rules "Sync Oauth Data" and
 * "Sync MCP data to AICT"): an OAuth client registry entry named like the server, an AutoGen OAuth provider with its
 * profile and resource, an AutoGen connection alias with its HTTP connection, OAuth 2.0 credential and Workflow Data
 * Fabric mapping, an auth server connection, a default-allow execute ACL named after the endpoint, and the AI Control
 * Tower product model, CI and digital asset.
 */
export async function serverFootprint(client: ServiceNowClient, server: { sys_id: string; name: string; url?: string }): Promise<Footprint[]> {
  const out: Footprint[] = [];
  const endpoint = mcpEndpointName(server.name);
  const url = server.url || endpointFor(client, server.name);
  const autoGen = `AutoGen-${endpoint}-`;
  const add = (table: string, recs: any[], what: string, nameField = 'name') => {
    for (const r of recs) if (val(r, 'sys_id') && !out.some((o) => o.sys_id === val(r, 'sys_id'))) out.push({ table, sys_id: val(r, 'sys_id'), name: val(r, nameField), what });
  };
  add('oauth_entity', await safeQuery(client, 'oauth_entity', `name=${q(server.name)}`, 'sys_id,name', (r) => val(r, 'name') === server.name),
    'OAuth client (Application Registry) that MCP clients sign in with');
  const providers = await safeQuery(client, 'oauth_entity', `nameSTARTSWITH${autoGen}`, 'sys_id,name', (r) => val(r, 'name').startsWith(autoGen));
  add('oauth_entity', providers, 'AutoGen OAuth provider');
  const providerIds = providers.map((p) => val(p, 'sys_id'));
  if (providerIds.length) {
    add('oauth_entity_profile', await safeQuery(client, 'oauth_entity_profile', `oauth_entityIN${providerIds.join(',')}`, 'sys_id,name,oauth_entity',
      (r) => providerIds.includes(val(r, 'oauth_entity'))), 'OAuth provider profile');
  }
  add('oauth_resource', await safeQuery(client, 'oauth_resource', `oauth_resource=${url}`, 'sys_id,oauth_resource', (r) => val(r, 'oauth_resource') === url),
    'OAuth resource (the server URL)', 'oauth_resource');
  const aliases = await safeQuery(client, 'sys_alias', `nameSTARTSWITH${autoGen}`, 'sys_id,name', (r) => val(r, 'name').startsWith(autoGen));
  add('sys_alias', aliases, 'AutoGen connection alias');
  const aliasIds = aliases.map((a) => val(a, 'sys_id'));
  if (aliasIds.length) {
    const inAlias = (f: string) => (r: any) => aliasIds.includes(val(r, f));
    const conns = await safeQuery(client, 'sys_connection', `connection_aliasIN${aliasIds.join(',')}`, 'sys_id,name,credential,connection_alias', inAlias('connection_alias'));
    add('http_connection', conns, 'HTTP connection for the alias');
    const creds = conns.map((c) => val(c, 'credential')).filter(Boolean);
    if (creds.length) {
      add('discovery_credentials', await safeQuery(client, 'discovery_credentials', `sys_idIN${creds.join(',')}`, 'sys_id,name', (r) => creds.includes(val(r, 'sys_id'))),
        'OAuth 2.0 credential');
    }
    add('sys_wdf_external_connection_mapping', await safeQuery(client, 'sys_wdf_external_connection_mapping', `asset_idIN${aliasIds.join(',')}`,
      'sys_id,connection_name,asset_id', inAlias('asset_id')), 'Workflow Data Fabric connection mapping', 'connection_name');
    add('auth_server_connection', await safeQuery(client, 'auth_server_connection', `connection_aliasIN${aliasIds.join(',')}`, 'sys_id,resource,connection_alias',
      inAlias('connection_alias')), 'Auth server connection (MCP resource governance)', 'resource');
  }
  add('sys_security_acl', await safeQuery(client, 'sys_security_acl', `name=${endpoint}^operation=execute`, 'sys_id,name,operation',
    (r) => val(r, 'name') === endpoint), 'Default-allow execute ACL for the endpoint');
  add('cmdb_ci_function_mcp', await safeQuery(client, 'cmdb_ci_function_mcp', `mcp_url=${url}`, 'sys_id,name,mcp_url', (r) => val(r, 'mcp_url') === url),
    'AI Control Tower CI (MCP function)');
  add('cmdb_mcp_product_model', await safeQuery(client, 'cmdb_mcp_product_model', `name=${q(server.name)}`, 'sys_id,name', (r) => val(r, 'name') === server.name),
    'AI Control Tower product model');
  const assets = await safeQuery(client, 'alm_mcp_digital_asset', `servicenow_ref_id=${server.sys_id}`, 'sys_id,display_name,servicenow_ref_id',
    (r) => val(r, 'servicenow_ref_id') === server.sys_id);
  add('alm_mcp_digital_asset', assets, 'AI Control Tower digital asset', 'display_name');
  const assetIds = assets.map((a) => val(a, 'sys_id'));
  if (assetIds.length) {
    add('sn_ai_governance_asset_governance_details', await safeQuery(client, 'sn_ai_governance_asset_governance_details', `assetIN${assetIds.join(',')}`,
      'sys_id,number,asset', (r) => assetIds.includes(val(r, 'asset'))), 'AI governance details', 'number');
  }
  return out;
}

/** Delete records best-effort, children first. Returns what is left with the reason. */
async function deleteAll(client: ServiceNowClient, recs: Footprint[]): Promise<{ deleted: Footprint[]; leftover: Array<Footprint & { reason: string }> }> {
  const order = [
    'sn_ai_governance_asset_governance_details', 'alm_mcp_digital_asset', 'auth_server_connection', 'cmdb_ci_function_mcp', 'cmdb_mcp_product_model',
    'sn_mcp_server', 'sys_wdf_external_connection_mapping', 'http_connection', 'api_key_credentials', 'discovery_credentials', 'sys_alias',
    'oauth_resource', 'oauth_entity_profile',
    'oauth_entity', 'sys_security_acl',
  ];
  const sorted = [...recs].sort((a, b) => order.indexOf(a.table) - order.indexOf(b.table));
  const deleted: Footprint[] = [];
  const leftover: Array<Footprint & { reason: string }> = [];
  for (const r of sorted) {
    try {
      await client.deleteRecord(r.table, r.sys_id);
      deleted.push(r);
    } catch (e) {
      const msg = (e as Error).message;
      const reason = r.table === 'sys_security_acl' && /privilege|ACL|403|denied|rejected/i.test(msg)
        ? 'ACL records need the security_admin role (elevated). Delete it in System Security > Access Control (ACL).'
        : msg.split('\n')[0]!;
      leftover.push({ ...r, reason });
    }
  }
  return { deleted, leftover };
}

/** Push URL used when an instance runs A2A asynchronously. The .invalid TLD never resolves, so nothing leaves the instance. */
export function a2aCallbackUrl(): string {
  return (process.env.NOWAIKIT_A2A_CALLBACK_URL || 'https://callback.nowaikit.invalid/a2a').trim();
}

/** Make sure the callback URL is in the instance's external agent callback registry as verified. */
async function ensureA2aCallback(client: ServiceNowClient): Promise<void> {
  const url = a2aCallbackUrl();
  const found = await client.queryRecords({ table: 'sn_aia_external_agent_callback_registry', query: `url=${url}`, fields: 'sys_id,state', limit: 1 });
  const rec = found.records[0] as any;
  if (!rec) await client.createRecord('sn_aia_external_agent_callback_registry', { url, state: 'verified' });
  else if (val(rec, 'state') !== 'verified') await client.updateRecord('sn_aia_external_agent_callback_registry', val(rec, 'sys_id'), { state: 'verified' });
}

/** The agent's answer: the status message, artifacts, or the latest agent message in the task history. */
function a2aReply(task: any): string {
  const fromStatus = textParts(task?.status?.message);
  if (fromStatus) return fromStatus;
  const fromArtifacts = ((task?.artifacts || []) as any[]).map((a) => textParts(a)).filter(Boolean).join('\n');
  if (fromArtifacts) return fromArtifacts;
  const agentMsgs = ((task?.history || []) as any[]).filter((m) => m?.role === 'agent').map((m) => textParts(m)).filter(Boolean);
  return agentMsgs[0] || '';
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
    {
      name: 'sn_mcp_create_server',
      description:
        'Create a server in ServiceNow MCP Server Console (sn_mcp_server_registry), optionally with tools attached. The endpoint is ' +
        '<instance>/sncapps/mcp-server/mcp/<name with dots as underscores>. A draft server creates only the registry row. When the ' +
        'server is (or later becomes) active, ServiceNow itself auto-creates: an OAuth client in Application Registry named like the ' +
        'server (redirect mcp_redirect.do, JWT tokens), an AutoGen OAuth provider with profile and resource, an AutoGen connection ' +
        'alias with HTTP connection, OAuth 2.0 credential and Workflow Data Fabric mapping, an auth server connection, a ' +
        'default-allow execute ACL named after the endpoint, and AI Control Tower records (product model, CI, digital asset). ' +
        'For an active server this tool waits for those and returns them. Remove everything with sn_mcp_delete_server. ' +
        'REQUIRES WRITE_ENABLED=true and the sn_mcp_server.admin role.',
      inputSchema: {
        type: 'object',
        properties: {
          label: { type: 'string', description: 'Display label, e.g. "Service desk tools"' },
          name: { type: 'string', description: 'Unique server name (lowercase, digits, _ and .). Default: the label as snake_case' },
          description: { type: 'string', description: 'Short description MCP clients see (default: the label)' },
          status: { type: 'string', enum: ['draft', 'active'], description: 'Default draft. active publishes the endpoint and triggers the OAuth / ACL / AI Control Tower setup' },
          tools: { type: 'array', items: { type: 'string' }, description: 'Existing tool definition names or sys_ids to attach, e.g. ["sn_mcp_server.incident_summarization"]' },
          wait_seconds: { type: 'number', description: 'How long to wait for the auto-created OAuth/ACL records of an active server (default 30, max 120)' },
        },
        required: ['label'],
      },
      annotations: WRITE,
    },
    {
      name: 'sn_mcp_delete_server',
      description:
        'Delete an MCP Server Console server and, by default, the OAuth client, AutoGen provider/alias/connection/credential, WDF mapping, ' +
        'execute ACL and AI Control Tower records ServiceNow created for it. Tool definitions are detached, not deleted. Out-of-box ' +
        '(scoped) servers are refused. Records this user cannot delete (the ACL needs security_admin) are returned as leftovers with ' +
        'sys_ids. REQUIRES WRITE_ENABLED=true.',
      inputSchema: {
        type: 'object',
        properties: {
          server: { type: 'string', description: 'Server name, label or sys_id' },
          cleanup_auto_created: { type: 'boolean', description: 'Also delete the records ServiceNow auto-created on activation (default true)' },
        },
        required: ['server'],
      },
      annotations: DESTRUCTIVE,
    },
    {
      name: 'sn_mcp_add_tool',
      description:
        'Add a tool to an MCP Server Console server. Either attach an existing tool definition (tool), or register a new one from ' +
        'a Now Assist / Otto skill (skill → sn_mcp_ai_skill_tool_definition, inputs copied from the skill\'s input attributes) or a ' +
        'Scripted REST operation (rest_operation → sn_mcp_scripted_rest_tool_definition, inputs you list). These are the two tool ' +
        'sources MCP Server Console offers; to expose a subflow, action, Knowledge Graph or AI Search, wrap it in a Now Assist ' +
        'skill or a Scripted REST operation first. REQUIRES WRITE_ENABLED=true and sn_mcp_server.admin.',
      inputSchema: {
        type: 'object',
        properties: {
          server: { type: 'string', description: 'Server name, label or sys_id' },
          tool: { type: 'string', description: 'Existing tool definition name or sys_id to attach (no new definition is created)' },
          skill: { type: 'string', description: 'Now Assist skill config (sn_nowassist_skill_config) sys_id or name, or the name of an existing skill tool to copy the skill from' },
          rest_operation: { type: 'string', description: 'Scripted REST resource (sys_ws_operation) sys_id, or "METHOD /api/..." / "/api/..." path' },
          label: { type: 'string', description: 'Tool label MCP clients see as the tool name (default: skill or operation name)' },
          name: { type: 'string', description: 'Unique definition name (default: label as snake_case)' },
          description: { type: 'string', description: 'What the tool does; MCP clients use it to decide when to call the tool (default: the skill or operation description)' },
          inputs: {
            type: 'array',
            description: 'Skill: which skill inputs to expose (by attribute name; default all active ones); a value makes it a fixed (static) input. ' +
              'Scripted REST: the request fields the tool takes.',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                description: { type: 'string' },
                type: { type: 'string', enum: REST_INPUT_TYPES, description: 'Scripted REST only (default string)' },
                mandatory: { type: 'boolean', description: 'Scripted REST only' },
                value: { type: 'string', description: 'Fixed value; the input is then hidden from MCP clients' },
                default_value: { type: 'string', description: 'Skill only: default when the client omits it' },
              },
              required: ['name'],
            },
          },
        },
        required: ['server'],
      },
      annotations: WRITE,
    },
    {
      name: 'sn_mcp_remove_tool',
      description:
        'Detach a tool from an MCP Server Console server. With delete_definition=true the definition and its inputs are also deleted, ' +
        'but only when no other server uses it and it is not an out-of-box (scoped) definition. REQUIRES WRITE_ENABLED=true.',
      inputSchema: {
        type: 'object',
        properties: {
          server: { type: 'string', description: 'Server name, label or sys_id' },
          tool: { type: 'string', description: 'Tool definition name or sys_id' },
          delete_definition: { type: 'boolean', description: 'Also delete the tool definition and its inputs (default false)' },
        },
        required: ['server', 'tool'],
      },
      annotations: DESTRUCTIVE,
    },
    {
      name: 'sn_mcp_list_registry',
      description:
        'List the EXTERNAL MCP servers registered on the instance\'s MCP client (sn_mcp_server, used by AI Agent Studio to give ' +
        'ServiceNow AI agents tools from outside MCP servers), with endpoint URL, auth, the AI agent tools built on each, and whether ' +
        'MCP tools are enabled for AI agents (sn_aia.enable_mcp_tool).',
      inputSchema: { type: 'object', properties: { search: { type: 'string', description: 'Filter by name' } }, required: [] },
      annotations: READ,
    },
    {
      name: 'sn_mcp_register_external_server',
      description:
        'Register an external MCP server (for example the NowAIKit hosted gateway, https://mcp.nowaikit.com/mcp) on the instance\'s MCP ' +
        'client so ServiceNow AI agents can use its tools. Creates a connection alias, an HTTP connection with the URL, an optional ' +
        'API key credential, and the sn_mcp_server record. Pass connection_alias to reuse an alias you already set up (for OAuth). ' +
        'Adding the server\'s tools to an agent is then done in AI Agent Studio. REQUIRES WRITE_ENABLED=true and admin.',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Server name shown in AI Agent Studio, e.g. "NowAIKit"' },
          url: { type: 'string', description: 'Streamable HTTP MCP endpoint (https), e.g. https://mcp.nowaikit.com/mcp' },
          api_key: { type: 'string', description: 'Optional API key, stored encrypted in an API Key credential' },
          api_key_header: { type: 'string', description: 'Header that carries the key (default x-nowaikit-key; use Authorization with api_key_prefix "Bearer" for bearer tokens)' },
          api_key_prefix: { type: 'string', description: 'Optional prefix before the key, e.g. Bearer' },
          connection_alias: { type: 'string', description: 'Existing connection alias (sys_alias) sys_id or name to reuse instead of creating one' },
        },
        required: ['name'],
      },
      annotations: WRITE,
    },
    {
      name: 'sn_mcp_unregister_external_server',
      description:
        'Remove an external MCP server from the instance\'s MCP client registry (sn_mcp_server) and, unless keep_connection is true, the ' +
        'connection alias, HTTP connection and credential created for it. Refused while AI agent tools still use the server. ' +
        'REQUIRES WRITE_ENABLED=true.',
      inputSchema: {
        type: 'object',
        properties: {
          server: { type: 'string', description: 'sn_mcp_server name or sys_id' },
          keep_connection: { type: 'boolean', description: 'Keep the connection alias, connection and credential (default false)' },
        },
        required: ['server'],
      },
      annotations: DESTRUCTIVE,
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
      // The registry's description column is short_description.
      const reg = await client.queryRecords({ table: 'sn_mcp_server_registry', query: q, fields: 'sys_id,name,label,status,tools,short_description', limit: 100 });
      const servers = (reg.records as any[]).map((r) => ({
        sys_id: val(r, 'sys_id'), name: val(r, 'name'), label: val(r, 'label'), status: val(r, 'status'), description: val(r, 'short_description'),
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
      let asyncMode = false;
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
        if (!/push notification url is required/i.test(msg)) throw e;
        // The instance runs external A2A calls asynchronously and insists on a registered push URL.
        // Register one (by default on the reserved .invalid TLD, which never resolves, so no reply data
        // leaves the instance), then poll tasks/get for the outcome.
        await ensureA2aCallback(client);
        asyncMode = true;
        resp = await send({ blocking: false, acceptedOutputModes: outputModes, pushNotificationConfig: { url: a2aCallbackUrl() } });
      }
      if (resp?.error) throw new ServiceNowError(`A2A error from "${agent.name}": ${resp.error.message || JSON.stringify(resp.error)}`, 'A2A_ERROR');
      let result = resp?.result ?? resp;
      const waitMs = Math.min(Math.max(Number(args.wait_seconds) || 120, 0), 600) * 1000;
      const deadline = Date.now() + waitMs;
      // Poll while the agent is still running. An input-required with nothing to say yet is treated as
      // still running for a short while (ServiceNow often moves on to completed a moment later).
      const stillRunning = (r: any) => {
        const st = String(r?.status?.state || '');
        if (['submitted', 'working'].includes(st)) return true;
        return st === 'input-required' && !a2aReply(r);
      };
      let quietInputPolls = 0;
      while (result?.id && result?.status && stillRunning(result) && Date.now() < deadline) {
        if (String(result?.status?.state) === 'input-required' && ++quietInputPolls > 4) break;
        await new Promise((r) => setTimeout(r, 3000));
        const poll = await client.apiRequest('POST', path, { jsonrpc: '2.0', id: `${message.messageId}-poll`, method: 'tasks/get', params: { id: result.id, historyLength: 20 } }, auth);
        if (poll?.error) break;
        result = poll?.result ?? result;
      }
      const isTask = !!result?.status;
      return {
        agent,
        reply: isTask ? a2aReply(result) : textParts(result),
        state: isTask ? result?.status?.state : 'completed',
        task_id: isTask ? result?.id : undefined,
        context_id: result?.contextId,
        ...(asyncMode ? { mode: 'async (polled)', note: 'This instance runs A2A asynchronously; NowAIKit registered a callback that never resolves and polled for the result.' } : {}),
        raw: result,
      };
    }

    case 'sn_a2a_get_task': {
      const agent = await resolveAgent(client, args.agent);
      if (!args.task_id) throw new ServiceNowError('task_id is required', 'INVALID_REQUEST');
      const resp = await client.apiRequest('POST', `/api/sn_aia/a2a/v2/agent/id/${agent.sys_id}`, {
        jsonrpc: '2.0', id: `nowaikit-${Date.now()}`, method: 'tasks/get', params: { id: String(args.task_id), historyLength: 20 },
      }, { Authorization: `Bearer ${await actionFabricBearer(client)}` });
      if (resp?.error) throw new ServiceNowError(`A2A error: ${resp.error.message || JSON.stringify(resp.error)}`, 'A2A_ERROR');
      const task = resp?.result ?? resp;
      return { agent, state: task?.status?.state, reply: a2aReply(task), task };
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

    case 'sn_mcp_create_server': {
      requireWrite();
      const label = String(args.label || '').trim();
      if (!label) throw new ServiceNowError('label is required', 'INVALID_REQUEST');
      if (label.length > 50) throw new ServiceNowError('label must be 50 characters or fewer', 'INVALID_REQUEST');
      const name = args.name ? String(args.name).trim() : slugName(label);
      if (!name || !/^[a-z0-9_.]{1,50}$/.test(name)) {
        throw new ServiceNowError('name must be 1-50 characters of lowercase letters, digits, "_" and "." (it becomes the endpoint path)', 'INVALID_REQUEST');
      }
      const status = args.status === 'active' ? 'active' : 'draft';
      const endpoint = endpointFor(client, name);
      // The console looks servers up by URL, so a clash on either name or URL breaks routing.
      const clash = await client.queryRecords({ table: 'sn_mcp_server_registry', query: `name=${name}^ORurl=${endpoint}`, fields: 'sys_id,name', limit: 1 });
      if (clash.records.length) throw new ServiceNowError(`An MCP server named "${val(clash.records[0], 'name')}" already uses this name or endpoint. Pick another name.`, 'ALREADY_EXISTS');
      const tools = await resolveToolDefs(client, Array.isArray(args.tools) ? args.tools : []);
      const rec = await client.createRecord('sn_mcp_server_registry', {
        label, name, status, url: endpoint,
        short_description: String(args.description || label),
        tools: tools.map((t) => t.sys_id).join(','),
      });
      const sysId = String(rec.sys_id);
      const out: Record<string, any> = {
        sys_id: sysId, name, label, status, endpoint, tools: tools.map((t) => t.name),
        record_url: `${client.instanceUrl}/sn_mcp_server_registry.do?sys_id=${sysId}`,
      };
      if (status === 'active') {
        // The OAuth/AICT setup runs in an async business rule, so poll until the OAuth client and ACL appear.
        const deadline = Date.now() + Math.min(Math.max(Number(args.wait_seconds) || 30, 0), 120) * 1000;
        let found = await serverFootprint(client, { sys_id: sysId, name, url: endpoint });
        while (Date.now() < deadline && !(found.some((f) => f.table === 'sys_security_acl') && found.some((f) => f.table === 'oauth_entity'))) {
          await new Promise((r) => setTimeout(r, 3000));
          found = await serverFootprint(client, { sys_id: sysId, name, url: endpoint });
        }
        out.auto_created = found;
        const client_rec = found.find((f) => f.table === 'oauth_entity' && f.name === name);
        out.note = client_rec
          ? `ServiceNow created the OAuth client "${name}" (System OAuth > Application Registry). MCP clients sign in with its client ID; get it there.`
          : 'The OAuth/ACL setup has not finished yet (it runs asynchronously, and is skipped when sn_cmdb_foundation is inactive or ' +
            'sn_mcp_server.stop_aict_and_oauth_sync=true). Run sn_mcp_status again in a minute.';
      } else {
        out.note = 'Draft servers are not reachable. Activate with sn_mcp_activate_server; ServiceNow then creates the OAuth client, ACL and AI Control Tower records.';
      }
      return out;
    }

    case 'sn_mcp_delete_server': {
      requireWrite();
      const server = await resolveServer(client, args.server);
      const sn = await client.queryRecords({ table: 'sys_scope', query: `sys_id=${server.scope}`, fields: 'scope', limit: 1 }).catch(() => ({ records: [] as any[] }));
      const scope = val(sn.records[0], 'scope') || server.scope;
      if (scope && scope !== 'global') {
        throw new ServiceNowError(`"${server.name}" ships with the ${scope} application and cannot be deleted here. Deactivate it with sn_mcp_activate_server status=inactive instead.`, 'NOT_ALLOWED');
      }
      const footprint = args.cleanup_auto_created === false ? [] : await serverFootprint(client, server);
      await client.deleteRecord('sn_mcp_server_registry', server.sys_id);
      const { deleted, leftover } = await deleteAll(client, footprint);
      return {
        deleted_server: { sys_id: server.sys_id, name: server.name },
        tools_detached: server.tools.length,
        auto_created_deleted: deleted,
        leftover,
        note: leftover.length ? 'Some records could not be deleted with this user; see leftover for sys_ids and why.' : undefined,
      };
    }

    case 'sn_mcp_add_tool': {
      requireWrite();
      const server = await resolveServer(client, args.server);
      const sources = ['tool', 'skill', 'rest_operation'].filter((k) => args[k]);
      if (sources.length !== 1) throw new ServiceNowError('Pass exactly one of tool (attach existing), skill or rest_operation', 'INVALID_REQUEST');

      const attach = async (toolId: string) => {
        if (server.tools.includes(toolId)) return false;
        // The "Synchronize tools from server" business rule mirrors this into the tool's servers list.
        await client.updateRecord('sn_mcp_server_registry', server.sys_id, { tools: [...server.tools, toolId].join(',') });
        return true;
      };

      if (args.tool) {
        const [t] = await resolveToolDefs(client, [args.tool]);
        const added = await attach(t!.sys_id);
        return { server: server.name, tool: { sys_id: t!.sys_id, name: t!.name, label: t!.label }, created: false, attached: added, endpoint: endpointFor(client, server.name) };
      }

      const inputs: any[] = Array.isArray(args.inputs) ? args.inputs : [];
      let def: Record<string, string>;
      let src: (typeof TOOL_SOURCES)[keyof typeof TOOL_SOURCES];
      let skillInputs: any[] = [];
      let opUri = '';
      if (args.skill) {
        src = TOOL_SOURCES.skill;
        const ref = q(args.skill);
        let cfg: any;
        if (SYS_ID.test(ref)) {
          cfg = (await client.queryRecords({ table: 'sn_nowassist_skill_config', query: `sys_id=${ref}`, fields: 'sys_id,name,description,skill_id', limit: 1 })).records[0];
        } else {
          cfg = (await client.queryRecords({ table: 'sn_nowassist_skill_config', query: `name=${ref}`, fields: 'sys_id,name,description,skill_id', limit: 1 })).records[0];
          if (!cfg) {
            const existing = (await client.queryRecords({ table: src.table, query: `name=${ref}`, fields: 'tool', limit: 1 })).records[0];
            if (existing && val(existing, 'tool')) {
              cfg = (await client.queryRecords({ table: 'sn_nowassist_skill_config', query: `sys_id=${val(existing, 'tool')}`, fields: 'sys_id,name,description,skill_id', limit: 1 })).records[0];
            }
          }
        }
        if (!cfg) throw new ServiceNowError(`Now Assist skill not found: ${ref}. Use list_now_assist_skills to find it.`, 'NOT_FOUND');
        const capability = val(cfg, 'skill_id');
        if (capability) {
          skillInputs = (await client.queryRecords({
            table: 'sys_one_extend_definition_attribute', query: `capability=${capability}^type=input^active=true^ORDERBYname`,
            fields: 'sys_id,name,description,capability', limit: 100,
          })).records.filter((a: any) => val(a, 'capability') === capability);
        }
        const unknown = inputs.filter((i) => !skillInputs.some((a) => val(a, 'name') === i.name)).map((i) => i.name);
        if (unknown.length) {
          throw new ServiceNowError(`The skill has no input named ${unknown.join(', ')}. Its inputs: ${skillInputs.map((a) => val(a, 'name')).join(', ') || 'none'}`, 'INVALID_REQUEST');
        }
        const label = String(args.label || val(cfg, 'name'));
        def = { label, tool: val(cfg, 'sys_id'), description: String(args.description || stripHtml(val(cfg, 'description')) || label) };
      } else {
        src = TOOL_SOURCES.scripted_rest;
        const ref = q(args.rest_operation);
        let op: any;
        if (SYS_ID.test(ref)) {
          op = (await client.queryRecords({ table: 'sys_ws_operation', query: `sys_id=${ref}`, fields: 'sys_id,name,http_method,operation_uri', limit: 1 })).records[0];
        } else {
          const m = ref.match(/^(GET|POST|PUT|PATCH|DELETE)\s+(\S+)$/i);
          const uri = m ? m[2]! : ref;
          const recs = (await client.queryRecords({
            table: 'sys_ws_operation', query: `operation_uri=${uri}${m ? `^http_method=${m[1]!.toUpperCase()}` : ''}^active=true`,
            fields: 'sys_id,name,http_method,operation_uri', limit: 5,
          })).records;
          if (recs.length > 1 && !m) throw new ServiceNowError(`Several operations use ${uri}; pass "METHOD ${uri}" or the sys_id.`, 'AMBIGUOUS');
          op = recs[0];
        }
        if (!op) throw new ServiceNowError(`Scripted REST operation not found: ${ref}. Use "METHOD /api/<namespace>/<api>/<path>" or the sys_ws_operation sys_id.`, 'NOT_FOUND');
        const bad = inputs.filter((i) => i.type && !REST_INPUT_TYPES.includes(String(i.type))).map((i) => `${i.name}:${i.type}`);
        if (bad.length) throw new ServiceNowError(`Unsupported input type ${bad.join(', ')}. Use one of ${REST_INPUT_TYPES.join(', ')}.`, 'INVALID_REQUEST');
        opUri = `${val(op, 'http_method')} ${val(op, 'operation_uri')}`;
        const label = String(args.label || val(op, 'name'));
        def = { label, tool: val(op, 'sys_id'), description: String(args.description || `${label} (${opUri})`) };
      }

      const name = args.name ? String(args.name).trim() : slugName(def.label!);
      if (!TOOL_NAME.test(name)) throw new ServiceNowError('name must be lowercase letters, digits, "_" and "." (max 128)', 'INVALID_REQUEST');
      const dup = await client.queryRecords({ table: 'sn_mcp_tool_definition', query: `name=${name}`, fields: 'sys_id,name', limit: 1 });
      if (dup.records.length) {
        throw new ServiceNowError(`A tool definition named "${name}" already exists. Attach it with tool="${name}", or pass a different name.`, 'ALREADY_EXISTS');
      }
      const created = await client.createRecord(src.table, { ...def, name, category: src.category });
      const toolId = String(created.sys_id);
      const createdInputs: Array<{ sys_id: string; name: string }> = [];
      try {
        // A "Default Label and Category" business rule forces category=ai_skill on insert; the console picks the tool builder
        // by category, so put a REST tool's category back.
        if (src.category !== 'ai_skill' && val(created, 'category') !== src.category) await client.updateRecord(src.table, toolId, { category: src.category });
        if (src === TOOL_SOURCES.skill) {
          const chosen = inputs.length ? skillInputs.filter((a) => inputs.some((i) => i.name === val(a, 'name'))) : skillInputs;
          for (const a of chosen) {
            const o = inputs.find((i) => i.name === val(a, 'name')) || {};
            const hasValue = o.value !== undefined && o.value !== null && String(o.value) !== '';
            const r = await client.createRecord(src.inputTable, {
              tool_definition: toolId, tool_input: val(a, 'sys_id'), enabled: 'true',
              description: String(o.description || val(a, 'description') || val(a, 'name')),
              static_value: hasValue ? 'true' : 'false',
              ...(hasValue ? { value: String(o.value) } : {}),
              ...(o.default_value !== undefined ? { default_value: String(o.default_value) } : {}),
            });
            createdInputs.push({ sys_id: String(r.sys_id), name: val(a, 'name') });
          }
        } else {
          for (const i of inputs) {
            const hasValue = i.value !== undefined && i.value !== null && String(i.value) !== '';
            const r = await client.createRecord(src.inputTable, {
              tool_definition: toolId, name: String(i.name), type: String(i.type || 'string'), enabled: 'true',
              description: String(i.description || i.name), mandatory: i.mandatory ? 'true' : 'false',
              static_value: hasValue ? 'true' : 'false', ...(hasValue ? { value: String(i.value) } : {}),
            });
            createdInputs.push({ sys_id: String(r.sys_id), name: String(i.name) });
          }
        }
        await attach(toolId);
      } catch (e) {
        for (const ci of createdInputs) await client.deleteRecord(src.inputTable, ci.sys_id).catch(() => undefined);
        await client.deleteRecord(src.table, toolId).catch(() => undefined);
        throw e;
      }
      return {
        server: server.name, created: true, attached: true,
        tool: { sys_id: toolId, name, label: def.label, table: src.table, source: def.tool, ...(opUri ? { operation: opUri } : {}) },
        inputs: createdInputs,
        endpoint: endpointFor(client, server.name),
        note: server.status === 'active' ? 'Live now; MCP clients see it on their next tools/list.' : `The server is ${server.status}; activate it with sn_mcp_activate_server.`,
      };
    }

    case 'sn_mcp_remove_tool': {
      requireWrite();
      const server = await resolveServer(client, args.server);
      const [t] = await resolveToolDefs(client, [args.tool]);
      const tool = t!;
      const wasAttached = server.tools.includes(tool.sys_id);
      if (wasAttached) {
        await client.updateRecord('sn_mcp_server_registry', server.sys_id, { tools: server.tools.filter((id) => id !== tool.sys_id).join(',') });
      }
      const out: Record<string, any> = { server: server.name, tool: { sys_id: tool.sys_id, name: tool.name }, detached: wasAttached, deleted: false };
      if (args.delete_definition) {
        const others = tool.servers.filter((s) => s !== server.sys_id);
        const scopeRec = await client.queryRecords({ table: 'sys_scope', query: `sys_id=${tool.scope}`, fields: 'scope', limit: 1 }).catch(() => ({ records: [] as any[] }));
        const scope = val(scopeRec.records[0], 'scope') || tool.scope;
        if (others.length) {
          out.note = `Not deleted: ${others.length} other server(s) still use this tool.`;
        } else if (scope && scope !== 'global') {
          out.note = `Not deleted: the definition ships with the ${scope} application.`;
        } else {
          const ins = await client.queryRecords({ table: 'sn_mcp_tool_input', query: `tool_definition=${tool.sys_id}`, fields: 'sys_id,tool_definition', limit: 200 });
          const inputIds = (ins.records as any[]).filter((r) => val(r, 'tool_definition') === tool.sys_id).map((r) => val(r, 'sys_id'));
          for (const id of inputIds) await client.deleteRecord('sn_mcp_tool_input', id);
          await client.deleteRecord(tool.cls || 'sn_mcp_tool_definition', tool.sys_id);
          out.deleted = true;
          out.inputs_deleted = inputIds.length;
        }
      }
      return out;
    }

    case 'sn_mcp_list_registry': {
      const query = args.search ? `nameLIKE${q(args.search)}^ORDERBYname` : 'ORDERBYname';
      const servers = (await client.queryRecords({ table: 'sn_mcp_server', query, fields: 'sys_id,name,connection_alias,sys_created_on', limit: 200 })).records as any[];
      const aliasIds = [...new Set(servers.map((s) => val(s, 'connection_alias')).filter(Boolean))];
      const conns = aliasIds.length
        ? ((await client.queryRecords({
            // http_connection, not the sys_connection parent: the Table API only returns a parent table's own columns.
            table: 'http_connection', query: `connection_aliasIN${aliasIds.join(',')}^active=true`,
            fields: 'sys_id,connection_alias,connection_url,credential,credential.sys_class_name', limit: 400,
          })).records as any[])
        : [];
      const serverIds = servers.map((s) => val(s, 'sys_id'));
      const agentTools = serverIds.length
        ? await safeQuery(client, 'sn_aia_tool', `target_document_table=sn_mcp_server^target_documentIN${serverIds.join(',')}`, 'sys_id,name,target_document',
            (r) => serverIds.includes(val(r, 'target_document')), 500)
        : [];
      let enabled: string | undefined;
      try {
        const p = await client.queryRecords({ table: 'sys_properties', query: 'name=sn_aia.enable_mcp_tool', fields: 'value', limit: 1 });
        enabled = val(p.records[0], 'value') || undefined;
      } catch { /* property not readable */ }
      return {
        count: servers.length,
        mcp_tools_enabled_for_agents: enabled === undefined ? 'unknown' : enabled === 'true',
        servers: servers.map((s) => {
          const c = conns.find((x) => val(x, 'connection_alias') === val(s, 'connection_alias'));
          const tools = agentTools.filter((t) => val(t, 'target_document') === val(s, 'sys_id'));
          return {
            sys_id: val(s, 'sys_id'), name: val(s, 'name'), connection_alias: val(s, 'connection_alias'),
            url: c ? val(c, 'connection_url') : undefined,
            auth: c ? (val(c, 'credential.sys_class_name') || (val(c, 'credential') ? 'credential' : 'none')) : 'no active connection',
            agent_tools: tools.map((t) => val(t, 'name')),
          };
        }),
        note: enabled === 'false' ? 'AI Agent Studio cannot add MCP tools until sn_aia.enable_mcp_tool is true.' : undefined,
      };
    }

    case 'sn_mcp_register_external_server': {
      requireWrite();
      const name = String(args.name || '').trim();
      if (!name || name.length > 100) throw new ServiceNowError('name is required (max 100 characters)', 'INVALID_REQUEST');
      const dup = await client.queryRecords({ table: 'sn_mcp_server', query: `name=${q(name)}`, fields: 'sys_id,name', limit: 1 });
      if ((dup.records as any[]).some((r) => val(r, 'name') === name)) throw new ServiceNowError(`An external MCP server named "${name}" is already registered.`, 'ALREADY_EXISTS');
      const created: Footprint[] = [];
      let aliasId: string;
      if (args.connection_alias) {
        const ref = q(args.connection_alias);
        const a = (await client.queryRecords({ table: 'sys_alias', query: SYS_ID.test(ref) ? `sys_id=${ref}` : `name=${ref}^ORid=${ref}`, fields: 'sys_id,name', limit: 1 })).records[0];
        if (!a) throw new ServiceNowError(`Connection alias not found: ${ref}`, 'NOT_FOUND');
        aliasId = val(a, 'sys_id');
      } else {
        let url: URL;
        try { url = new URL(String(args.url || '')); } catch { throw new ServiceNowError('url must be a full https URL of the MCP endpoint, e.g. https://mcp.nowaikit.com/mcp', 'INVALID_REQUEST'); }
        if (url.protocol !== 'https:') throw new ServiceNowError('url must use https', 'INVALID_REQUEST');
        try {
          // ServiceNow derives the alias id from the name.
          const alias = await client.createRecord('sys_alias', { name: `${name} MCP`, type: 'connection', connection_type: 'http_connection', description: `MCP server ${url.href} (registered by NowAIKit)` });
          aliasId = String(alias.sys_id);
          created.push({ table: 'sys_alias', sys_id: aliasId, name: `${name} MCP`, what: 'Connection alias' });
          let credId = '';
          if (args.api_key) {
            const cred = await client.createRecord('api_key_credentials', {
              name: `${name} MCP key`.slice(0, 40), api_key: String(args.api_key), active: 'true',
              api_key_header_name: String(args.api_key_header || 'x-nowaikit-key'),
              ...(args.api_key_prefix ? { api_key_prefix: String(args.api_key_prefix) } : {}),
            });
            credId = String(cred.sys_id);
            created.push({ table: 'api_key_credentials', sys_id: credId, name: `${name} MCP key`.slice(0, 40), what: 'API key credential' });
          }
          const conn = await client.createRecord('http_connection', {
            name: `${name} MCP connection`, connection_alias: aliasId, connection_url: url.href, active: 'true', ...(credId ? { credential: credId } : {}),
          });
          created.push({ table: 'http_connection', sys_id: String(conn.sys_id), name: `${name} MCP connection`, what: 'HTTP connection' });
        } catch (e) {
          await deleteAll(client, [...created].reverse());
          throw e;
        }
      }
      try {
        const srv = await client.createRecord('sn_mcp_server', { name, connection_alias: aliasId });
        created.push({ table: 'sn_mcp_server', sys_id: String(srv.sys_id), name, what: 'MCP client server record' });
      } catch (e) {
        await deleteAll(client, created.filter((c) => c.table !== 'sn_mcp_server').reverse());
        throw e;
      }
      return {
        server: created.find((c) => c.table === 'sn_mcp_server'), connection_alias: aliasId, created,
        next_steps: 'In AI Agent Studio, open an agent > Add tool > MCP server, pick this server and choose its tools. ' +
          'sn_aia.enable_mcp_tool must be true. ServiceNow calls the server from the instance, so the URL must be reachable from the internet.',
      };
    }

    case 'sn_mcp_unregister_external_server': {
      requireWrite();
      const ref = q(args.server);
      if (!ref) throw new ServiceNowError('server is required', 'INVALID_REQUEST');
      const srv = ((await client.queryRecords({ table: 'sn_mcp_server', query: SYS_ID.test(ref) ? `sys_id=${ref}` : `name=${ref}`, fields: 'sys_id,name,connection_alias', limit: 1 })).records as any[])
        .find((r) => val(r, 'sys_id') === ref || val(r, 'name') === ref);
      if (!srv) throw new ServiceNowError(`External MCP server not found: ${ref}. See sn_mcp_list_registry.`, 'NOT_FOUND');
      const sid = val(srv, 'sys_id');
      const used = await safeQuery(client, 'sn_aia_tool', `target_document_table=sn_mcp_server^target_document=${sid}`, 'sys_id,name,target_document', (r) => val(r, 'target_document') === sid);
      if (used.length) {
        throw new ServiceNowError(`AI agent tools still use "${val(srv, 'name')}": ${used.map((t) => val(t, 'name')).join(', ')}. Remove them in AI Agent Studio first.`, 'IN_USE');
      }
      await client.deleteRecord('sn_mcp_server', sid);
      const removed: Footprint[] = [{ table: 'sn_mcp_server', sys_id: sid, name: val(srv, 'name'), what: 'MCP client server record' }];
      let leftover: any[] = [];
      const aliasId = val(srv, 'connection_alias');
      if (aliasId && !args.keep_connection) {
        const sharers = await safeQuery(client, 'sn_mcp_server', `connection_alias=${aliasId}`, 'sys_id,connection_alias', (r) => val(r, 'connection_alias') === aliasId);
        if (!sharers.length) {
          const conns = await safeQuery(client, 'sys_connection', `connection_alias=${aliasId}`, 'sys_id,name,credential,connection_alias', (r) => val(r, 'connection_alias') === aliasId, 50);
          const recs: Footprint[] = conns.map((c) => ({ table: 'http_connection', sys_id: val(c, 'sys_id'), name: val(c, 'name'), what: 'HTTP connection' }));
          const credIds = conns.map((c) => val(c, 'credential')).filter(Boolean);
          for (const c of await safeQuery(client, 'discovery_credentials', `sys_idIN${credIds.join(',')}`, 'sys_id,name', (r) => credIds.includes(val(r, 'sys_id')))) {
            recs.push({ table: 'discovery_credentials', sys_id: val(c, 'sys_id'), name: val(c, 'name'), what: 'Credential' });
          }
          const alias = await safeQuery(client, 'sys_alias', `sys_id=${aliasId}`, 'sys_id,name', (r) => val(r, 'sys_id') === aliasId);
          for (const a of alias) recs.push({ table: 'sys_alias', sys_id: aliasId, name: val(a, 'name'), what: 'Connection alias' });
          const res = await deleteAll(client, recs);
          removed.push(...res.deleted);
          leftover = res.leftover;
        }
      }
      return { removed, leftover, note: leftover.length ? 'Some connection records could not be deleted; see leftover.' : undefined };
    }

    default:
      return null;
  }
}

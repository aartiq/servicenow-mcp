/**
 * Otto (ServiceNow AI Platform) front door and AI Control Tower operations.
 *
 *   ask_otto           Send a request to Otto: A2A to an AI agent on the instance, or the Moveworks
 *                      Conversations API (EmployeeWorks assistant) when it is configured.
 *   ai_kill_switch     Contain (deactivate) or restore an AI agent, agentic workflow or Now Assist skill,
 *                      with the reason written to its AI Control Tower asset.
 *   test_agent_access  "Can user X use AI agent / workflow / skill Y?", worked out from the instance's
 *                      execute ACLs (types gen_ai_agent, gen_ai_workflow, gen_ai_skill) and the user's roles.
 *   list_ai_policies   Otto guardrails: sensitive-topic filters, Guardian providers and transformers, and
 *                      the guardrail properties, plus AI Control Tower policy tables when present.
 *
 * Data model (checked on an Australia instance with sn_aia 6.0.25 and sn_ai_governance 5.0.6):
 *   sn_aia_agent_config.active / .public / .run_as_user          agent on/off, A2A exposure, data access user
 *   sn_aia_usecase_config_override.active (usecase_configuration)  agentic workflow on/off
 *   sn_nowassist_skill_config.active / .in_product_roles         Now Assist skill on/off and role filter
 *   sys_security_acl (operation execute) named
 *     <domain>.<scope>.<agent name>        type gen_ai_agent
 *     <domain>.<scope>.<workflow name>     type gen_ai_workflow
 *     <slug>.<skill config sys_id>         type gen_ai_skill
 *   alm_ai_digital_asset.servicenow_ref_table / servicenow_ref_id (+ work_notes)  AI Control Tower asset
 */
import type { ServiceNowClient } from '../servicenow/client.js';
import { ServiceNowError } from '../utils/errors.js';
import { requireWrite } from '../utils/permissions.js';
import { executeActionFabricToolCall } from './action-fabric.js';

const SYS_ID = /^[0-9a-f]{32}$/i;
const READ = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };
const ASK = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true };
const SWITCH = { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true };

type TargetType = 'agent' | 'workflow' | 'skill';
const TARGET_TYPES: TargetType[] = ['agent', 'workflow', 'skill'];

/** Where each kind of AI asset lives, how its on/off switch works, and which ACL type guards it. */
const TARGETS: Record<TargetType, { table: string; label: string; aclType: string; assetRefTable: string }> = {
  agent: { table: 'sn_aia_agent', label: 'AI agent', aclType: 'gen_ai_agent', assetRefTable: 'sn_aia_agent' },
  workflow: { table: 'sn_aia_usecase', label: 'agentic workflow', aclType: 'gen_ai_workflow', assetRefTable: 'sn_aia_usecase' },
  skill: { table: 'sn_nowassist_skill_config', label: 'Now Assist skill', aclType: 'gen_ai_skill', assetRefTable: 'sn_nowassist_skill_config' },
};

function val(r: any, f: string): string {
  const v = r?.[f];
  if (v && typeof v === 'object') return String(v.value ?? '');
  return v === undefined || v === null ? '' : String(v);
}

function disp(r: any, f: string): string {
  const v = r?.[f];
  if (v && typeof v === 'object') return String(v.display_value ?? v.value ?? '');
  return v === undefined || v === null ? '' : String(v);
}

/** Encoded-query safe text: no "^" (condition separator) or newlines. */
function q(s: string): string {
  return String(s).replace(/[\^\n\r]/g, ' ').trim();
}

function targetType(v: unknown): TargetType {
  const t = String(v || 'agent').toLowerCase() as TargetType;
  if (!TARGET_TYPES.includes(t)) throw new ServiceNowError(`target_type must be one of ${TARGET_TYPES.join(', ')}`, 'INVALID_REQUEST');
  return t;
}

function isInvalidTable(err: unknown): boolean {
  return /invalid table/i.test(err instanceof Error ? err.message : String(err));
}

interface Target { type: TargetType; sys_id: string; name: string; scope: string; scope_name: string }

/** Resolve an agent / workflow / skill by sys_id or name (exact name first, then contains). */
async function resolveTarget(client: ServiceNowClient, type: TargetType, ref: unknown): Promise<Target> {
  const r = String(ref ?? '').trim();
  if (!r) throw new ServiceNowError('target is required (sys_id or name)', 'INVALID_REQUEST');
  const { table, label } = TARGETS[type];
  const fields = 'sys_id,name,sys_scope,sys_scope.scope';
  const pick = async (query: string) => (await client.queryRecords({ table, query, fields, limit: 5, displayValue: 'all' })).records as any[];
  let rows = SYS_ID.test(r) ? await pick(`sys_id=${r}`) : await pick(`name=${q(r)}`);
  if (!rows.length && !SYS_ID.test(r)) rows = await pick(`nameLIKE${q(r)}^ORDERBYname`);
  if (!rows.length) throw new ServiceNowError(`${label} not found: ${r}`, 'NOT_FOUND');
  if (rows.length > 1 && !SYS_ID.test(r) && !rows.every((x) => val(x, 'name') === val(rows[0], 'name'))) {
    throw new ServiceNowError(
      `"${r}" matches more than one ${label}: ${rows.map((x) => `${val(x, 'name')} (${val(x, 'sys_id')})`).join('; ')}. Pass the exact name or sys_id.`,
      'AMBIGUOUS',
    );
  }
  const rec = rows[0];
  return { type, sys_id: val(rec, 'sys_id'), name: val(rec, 'name'), scope: val(rec, 'sys_scope.scope'), scope_name: disp(rec, 'sys_scope') };
}

interface Switch { table: string; sys_id: string; active: boolean; scope: string; extra: Record<string, string> }

/** The record that holds the on/off switch for a target. */
async function findSwitch(client: ServiceNowClient, t: Target): Promise<Switch | null> {
  if (t.type === 'agent') {
    const r = (await client.queryRecords({ table: 'sn_aia_agent_config', query: `agent=${t.sys_id}`, fields: 'sys_id,active,public,run_as_user,sys_scope', limit: 1, displayValue: 'all' })).records[0];
    return r ? { table: 'sn_aia_agent_config', sys_id: val(r, 'sys_id'), scope: val(r, 'sys_scope'), active: val(r, 'active') === 'true', extra: { a2a_exposed: val(r, 'public'), run_as_user: disp(r, 'run_as_user') } } : null;
  }
  if (t.type === 'workflow') {
    const r = (await client.queryRecords({ table: 'sn_aia_usecase_config_override', query: `usecase_configuration=${t.sys_id}`, fields: 'sys_id,active,run_as_user,sys_scope', limit: 1, displayValue: 'all' })).records[0];
    return r ? { table: 'sn_aia_usecase_config_override', sys_id: val(r, 'sys_id'), scope: val(r, 'sys_scope'), active: val(r, 'active') === 'true', extra: { run_as_user: disp(r, 'run_as_user') } } : null;
  }
  const r = (await client.queryRecords({ table: 'sn_nowassist_skill_config', query: `sys_id=${t.sys_id}`, fields: 'sys_id,active,in_product_roles,state,sys_scope', limit: 1, displayValue: 'all' })).records[0];
  return r ? { table: 'sn_nowassist_skill_config', sys_id: val(r, 'sys_id'), scope: val(r, 'sys_scope'), active: val(r, 'active') === 'true', extra: { in_product_roles: val(r, 'in_product_roles'), state: disp(r, 'state') } } : null;
}

/** The AI Control Tower asset that points at a target, if AI Control Tower has inventoried it. */
async function findAsset(client: ServiceNowClient, t: Target): Promise<{ sys_id: string; name: string } | null> {
  try {
    const r = (await client.queryRecords({
      table: 'alm_ai_digital_asset',
      query: `servicenow_ref_table=${TARGETS[t.type].assetRefTable}^servicenow_ref_id=${t.sys_id}`,
      fields: 'sys_id,display_name', limit: 1,
    })).records[0];
    return r ? { sys_id: val(r, 'sys_id'), name: val(r, 'display_name') } : null;
  } catch (e) {
    if (isInvalidTable(e)) return null;
    throw e;
  }
}

// ---------------------------------------------------------------------------------------------
// ask_otto: Moveworks Conversations API route
// ---------------------------------------------------------------------------------------------

export function moveworksConfigured(): boolean {
  return !!(process.env.MOVEWORKS_API_BASE || '').trim() && !!(process.env.MOVEWORKS_API_TOKEN || '').trim();
}

/** Base URL including the /rest/v1 prefix, e.g. https://api.moveworks.ai/rest/v1. */
export function moveworksBase(raw = process.env.MOVEWORKS_API_BASE || ''): string {
  const base = raw.trim().replace(/\/+$/, '');
  let u: URL;
  try {
    u = new URL(base);
  } catch {
    throw new ServiceNowError(`MOVEWORKS_API_BASE is not a valid URL: ${base}`, 'CONFIG_ERROR');
  }
  if (u.protocol !== 'https:') throw new ServiceNowError('MOVEWORKS_API_BASE must use https', 'CONFIG_ERROR');
  return /\/rest\/v1$/.test(base) ? base : `${base}/rest/v1`;
}

/** Text of the assistant's messages in a Moveworks response's outputs[]. */
export function moveworksReplyText(outputs: unknown): string {
  const text = (c: any): string => {
    if (!c || typeof c !== 'object') return typeof c === 'string' ? c : '';
    const body = c.plain_text ?? c.markdown_text ?? c.commonmark_text ?? c.text;
    if (typeof body === 'string') return body;
    if (body && typeof body === 'object') return String(body.text ?? body.value ?? body.content ?? '');
    return '';
  };
  return ((Array.isArray(outputs) ? outputs : []) as any[])
    .filter((o) => o?.type === 'MESSAGE' && (!o.message?.actor || o.message.actor === 'ASSISTANT' || o.message.actor === 'LIVE_AGENT'))
    .map((o) => text(o.message?.content))
    .filter(Boolean)
    .join('\n\n');
}

async function moveworksCall(method: string, url: string, body?: unknown): Promise<any> {
  const token = (process.env.MOVEWORKS_API_TOKEN || '').trim();
  const assistant = (process.env.MOVEWORKS_ASSISTANT_NAME || '').trim();
  const headers: Record<string, string> = { Authorization: `Bearer ${token}`, Accept: 'application/json' };
  if (assistant) headers['Assistant-Name'] = assistant;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const raw = await res.text();
  let json: any;
  try {
    json = raw ? JSON.parse(raw) : {};
  } catch {
    json = { raw };
  }
  if (!res.ok) {
    const code = json?.error?.code || `HTTP_${res.status}`;
    const msg = json?.error?.message || raw.slice(0, 300) || res.statusText;
    const fix =
      res.status === 401 ? ' Fix: MOVEWORKS_API_TOKEN must be a current user bearer (mwt_...) from POST /oauth/v1/token; it expires after about an hour.' :
      res.status === 403 ? ' Fix: set MOVEWORKS_ASSISTANT_NAME to the Bot Name of your Conversations API chatbot.' :
      res.status === 404 ? ' Fix: the Conversations API must be enabled for your org by Moveworks, and MOVEWORKS_API_BASE must be your data center host.' : '';
    throw new ServiceNowError(`Moveworks ${code}: ${msg}.${fix}`, res.status === 401 ? 'AUTHENTICATION_FAILED' : 'MOVEWORKS_ERROR');
  }
  return json;
}

async function askMoveworks(args: Record<string, any>, text: string): Promise<any> {
  if (!(process.env.MOVEWORKS_ASSISTANT_NAME || '').trim()) {
    throw new ServiceNowError('Set MOVEWORKS_ASSISTANT_NAME to the Bot Name of your Conversations API chatbot (sent as the Assistant-Name header).', 'CONFIG_ERROR');
  }
  const base = moveworksBase();
  let conversationId = String(args.conversation_id || '').trim();
  if (conversationId && !/^[A-Za-z0-9_-]{1,200}$/.test(conversationId)) throw new ServiceNowError('conversation_id has unexpected characters', 'INVALID_REQUEST');
  if (!conversationId) {
    const conv = await moveworksCall('POST', `${base}/conversations`, { title: text.slice(0, 80) });
    conversationId = String(conv?.conversation_id || '');
    if (!conversationId) throw new ServiceNowError('Moveworks did not return a conversation_id', 'MOVEWORKS_ERROR');
  }
  const conv = encodeURIComponent(conversationId);
  let resp = await moveworksCall('POST', `${base}/conversations/${conv}/responses`, { input: { chat: { text } } });
  const waitMs = Math.min(Math.max(Number(args.wait_seconds ?? 120), 0), 300) * 1000;
  const deadline = Date.now() + waitMs;
  const pollMs = Math.max(Number(process.env.NOWAIKIT_OTTO_POLL_MS) || 2000, 10);
  while (!['COMPLETED', 'FAILED'].includes(String(resp?.status)) && resp?.response_id && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, pollMs));
    resp = await moveworksCall('GET', `${base}/conversations/${conv}/responses/${encodeURIComponent(String(resp.response_id))}`);
  }
  return {
    route: 'moveworks',
    verified: 'configured route, not verified against a live Moveworks tenant',
    reply: moveworksReplyText(resp?.outputs),
    state: String(resp?.status || 'unknown').toLowerCase(),
    conversation_id: conversationId,
    response_id: resp?.response_id,
    raw: resp,
  };
}

// ---------------------------------------------------------------------------------------------
// ask_otto: A2A route
// ---------------------------------------------------------------------------------------------

const FRONT_DOOR = /otto|orchestrat|concierge|assistant|front ?door|primary/i;

/** Pick the agent that answers for Otto over A2A: argument, then NOWAIKIT_OTTO_AGENT, then the exposed agents. */
async function pickOttoAgent(client: ServiceNowClient, explicit?: string): Promise<{ agent: string; how: string; candidates?: string[] }> {
  if (explicit) return { agent: explicit, how: 'agent argument' };
  const env = (process.env.NOWAIKIT_OTTO_AGENT || '').trim();
  if (env) return { agent: env, how: 'NOWAIKIT_OTTO_AGENT' };
  const cfg = await client.queryRecords({ table: 'sn_aia_agent_config', query: 'public=true^active=true', fields: 'agent', limit: 100, displayValue: 'all' });
  const exposed = (cfg.records as any[]).map((r) => ({ sys_id: val(r, 'agent'), name: disp(r, 'agent') })).filter((a) => a.sys_id);
  if (!exposed.length) {
    throw new ServiceNowError(
      'No AI agent on this instance is open to A2A, so Otto has no external front door here. Fix: pick the agent that should answer ' +
        '(for example your orchestrating or virtual agent assistant agent), expose it with sn_a2a_expose_agent, and set NOWAIKIT_OTTO_AGENT ' +
        'to its name or sys_id. Or configure the Moveworks route (MOVEWORKS_API_BASE, MOVEWORKS_API_TOKEN, MOVEWORKS_ASSISTANT_NAME).',
      'NO_FRONT_DOOR',
    );
  }
  const preferred = exposed.find((a) => FRONT_DOOR.test(a.name)) || exposed[0]!;
  return {
    agent: preferred.sys_id,
    how: exposed.length === 1 ? 'the only A2A-exposed agent' : `first A2A-exposed agent${FRONT_DOOR.test(preferred.name) ? ' matching an orchestrator / assistant name' : ''}`,
    candidates: exposed.length > 1 ? exposed.map((a) => `${a.name} (${a.sys_id})`) : undefined,
  };
}

// ---------------------------------------------------------------------------------------------
// test_agent_access
// ---------------------------------------------------------------------------------------------

interface AclCheck {
  acl: string; sys_id: string; decision: 'allow' | 'deny'; roles: string[];
  result: 'pass' | 'fail' | 'not_evaluated'; reasons: string[];
}

async function resolveUser(client: ServiceNowClient, ref: unknown) {
  const r = String(ref ?? '').trim();
  if (!r) throw new ServiceNowError('user is required (sys_id, user_name or email)', 'INVALID_REQUEST');
  const query = SYS_ID.test(r) ? `sys_id=${r}` : `user_name=${q(r)}^ORemail=${q(r)}`;
  const u = (await client.queryRecords({ table: 'sys_user', query, fields: 'sys_id,user_name,name,active,locked_out', limit: 1 })).records[0];
  if (!u) throw new ServiceNowError(`User not found: ${r}`, 'NOT_FOUND');
  return { sys_id: val(u, 'sys_id'), user_name: val(u, 'user_name'), name: val(u, 'name'), active: val(u, 'active') === 'true', locked_out: val(u, 'locked_out') === 'true' };
}

async function userRoles(client: ServiceNowClient, userSysId: string): Promise<Set<string>> {
  const rows = await client.queryRecords({ table: 'sys_user_has_role', query: `user=${userSysId}^state=active`, fields: 'role.name', limit: 1000 });
  return new Set((rows.records as any[]).map((r) => val(r, 'role.name')).filter(Boolean));
}

/**
 * Execute ACLs that guard a target, matched by the platform's naming for each ACL type. As with other ACL types,
 * a name-specific rule wins over the type's wildcard ("*") rule, so the wildcard is used only when nothing specific exists.
 */
async function findAcls(client: ServiceNowClient, t: Target): Promise<{ acls: any[]; wildcard: boolean }> {
  const { aclType } = TARGETS[t.type];
  const suffix = t.type === 'skill' ? `.${t.sys_id}` : `.${t.scope}.${t.name}`;
  if (t.type !== 'skill' && !t.scope) throw new ServiceNowError(`Could not read the application scope of ${t.name}`, 'NOT_FOUND');
  const rows = await client.queryRecords({
    table: 'sys_security_acl',
    query: `type.name=${aclType}^operation=execute^active=true^nameENDSWITH${q(suffix)}^ORname=*`,
    fields: 'sys_id,name,decision_type,admin_overrides,condition,script,advanced,security_attribute,security_attribute.name,security_attribute.condition',
    limit: 50,
  });
  const all = rows.records as any[];
  // ENDSWITH on "<scope>.<name>" could also match a longer scope name ending the same way; keep exact segment matches.
  const specific = all.filter((a) => {
    const n = val(a, 'name');
    if (n === '*') return false;
    return t.type === 'skill' ? n.endsWith(suffix) : n === `${n.split('.')[0]}${suffix}`;
  });
  if (specific.length) return { acls: specific, wildcard: false };
  return { acls: all.filter((a) => val(a, 'name') === '*'), wildcard: true };
}

/** Data access for dynamic-user agents: the roles the agent may use on the user's behalf (role masking). */
async function roleMasking(client: ServiceNowClient, t: Target, userRoleSet: Set<string>) {
  try {
    const cfg = (await client.queryRecords({
      table: 'sys_agent_access_role_configuration', query: `agent_table=${TARGETS[t.type].table}^agent=${t.sys_id}`,
      fields: 'sys_id,action,role_list,allow_all_session_roles', limit: 1, displayValue: 'all',
    })).records[0];
    if (!cfg) return undefined;
    const approved = disp(cfg, 'role_list').split(',').map((s) => s.trim()).filter(Boolean);
    const allowAll = val(cfg, 'allow_all_session_roles') === 'true';
    return {
      action: val(cfg, 'action'), approved_roles: approved, allow_all_session_roles: allowAll,
      effective_roles_for_user: allowAll ? [...userRoleSet].sort() : approved.filter((r) => userRoleSet.has(r)),
    };
  } catch (e) {
    if (isInvalidTable(e)) return undefined;
    throw e;
  }
}

function evaluateAcl(acl: any, roles: string[], userRoleSet: Set<string>, isAdmin: boolean): AclCheck {
  const decision = val(acl, 'decision_type') === 'deny' ? 'deny' : 'allow';
  const out: AclCheck = { acl: val(acl, 'name'), sys_id: val(acl, 'sys_id'), decision, roles, result: 'pass', reasons: [] };
  if (isAdmin && val(acl, 'admin_overrides') === 'true') {
    out.reasons.push('admin role with "Admin overrides" on this ACL');
    return out;
  }
  let unknown = false;
  if (roles.length) {
    const held = roles.filter((r) => userRoleSet.has(r));
    if (held.length) out.reasons.push(`has role ${held.join(', ')}`);
    else if (isAdmin) out.reasons.push(`admin role satisfies role check (${roles.join(', ')})`);
    else {
      out.result = 'fail';
      out.reasons.push(`needs one of roles: ${roles.join(', ')}`);
    }
  } else out.reasons.push('no role requirement');
  const attr = val(acl, 'security_attribute.name') || disp(acl, 'security_attribute');
  if (/^Never$/i.test(attr)) {
    out.result = 'fail';
    out.reasons.push('security attribute "Never" (deny by default)');
  } else if (/^Always$/i.test(attr)) out.reasons.push('security attribute "Always"');
  else if (/^UserIsAuthenticated$/i.test(attr)) out.reasons.push('authenticated user');
  else if (attr) {
    // The ACL editor compiles simple rules into a compound attribute (e.g. "UserIsAuthenticated=true").
    const cond = val(acl, 'security_attribute.condition').trim();
    if (/^UserIsAuthenticated=true$/i.test(cond)) out.reasons.push('authenticated user');
    else {
      unknown = true;
      out.reasons.push(`security attribute "${attr}"${cond ? ` (${cond})` : ''} not evaluated`);
    }
  }
  if (val(acl, 'condition').trim()) {
    unknown = true;
    out.reasons.push(`condition not evaluated: ${val(acl, 'condition')}`);
  }
  if (val(acl, 'advanced') === 'true' && val(acl, 'script').trim()) {
    unknown = true;
    out.reasons.push('script not evaluated');
  }
  if (out.result !== 'fail' && unknown) out.result = 'not_evaluated';
  return out;
}

// ---------------------------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------------------------

const TARGET_PROPS = {
  target_type: { type: 'string', enum: TARGET_TYPES, description: 'agent (AI agent), workflow (agentic workflow / use case) or skill (Now Assist skill). Default agent.' },
  target: { type: 'string', description: 'sys_id or name of the agent, workflow or skill' },
};

export function getOttoToolDefinitions() {
  return [
    {
      name: 'ask_otto',
      description:
        'Send a plain-language request to Otto and return the answer. Two routes: (1) a2a, which sends it over A2A to an AI agent on the ' +
        'instance: the agent argument, else NOWAIKIT_OTTO_AGENT, else the A2A-exposed agent that looks like an orchestrator or assistant. ' +
        'This needs an OAuth (JWT) sign-in with the a2aauthscope scope and synchronous external agent mode. ' +
        '(2) moveworks, the Moveworks Conversations API (EmployeeWorks assistant), used when MOVEWORKS_API_BASE, MOVEWORKS_API_TOKEN ' +
        '(a user bearer from /oauth/v1/token) and MOVEWORKS_ASSISTANT_NAME are set. The moveworks route is a configured route, not ' +
        'verified against a live tenant. route=auto picks a2a when an agent is named or NOWAIKIT_OTTO_AGENT is set, else moveworks when ' +
        'configured, else a2a. Agents act with their own tools, so this REQUIRES WRITE_ENABLED=true.',
      inputSchema: {
        type: 'object',
        properties: {
          message: { type: 'string', description: 'What to ask Otto' },
          route: { type: 'string', enum: ['auto', 'a2a', 'moveworks'], description: 'Which route (default auto)' },
          agent: { type: 'string', description: 'a2a: agent sys_id or name to send to' },
          context_id: { type: 'string', description: 'a2a: continue an earlier conversation' },
          task_id: { type: 'string', description: 'a2a: answer an agent that asked for more input' },
          conversation_id: { type: 'string', description: 'moveworks: continue an earlier conversation (conv_...)' },
          wait_seconds: { type: 'number', description: 'How long to wait for the answer (default 120)' },
        },
        required: ['message'],
      },
      annotations: ASK,
    },
    {
      name: 'ai_kill_switch',
      description:
        'AI Control Tower containment for one AI agent, agentic workflow or Now Assist skill. action=status reads its on/off state. ' +
        'action=contain switches it OFF right away for every user and channel (sn_aia_agent_config.active, ' +
        'sn_aia_usecase_config_override.active or sn_nowassist_skill_config.active = false). action=restore switches it back ON. ' +
        'The reason is written as a work note on its AI Control Tower asset when one exists. These records are application files: the ' +
        'change is captured in your current update set, and on a store-delivered agent or skill it marks the file as customized, which ' +
        'stays after restore (revert to the store version if upgrades must apply). AI Control Tower containment (Deactivate Agent / Reinstate on the AI asset, Brazil and later) is a UI feature with no ' +
        'documented REST API, so this flips the same active flags that AI Agent Studio and Now Assist Admin use. It does not revoke ' +
        'access in external platforms. Contain and restore REQUIRE WRITE_ENABLED=true, confirm=true and a reason.',
      inputSchema: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['status', 'contain', 'restore'], description: 'What to do' },
          ...TARGET_PROPS,
          reason: { type: 'string', description: 'Why (required for contain and restore; recorded on the AI asset)' },
          confirm: { type: 'boolean', description: 'Must be true for contain and restore' },
        },
        required: ['action', 'target'],
      },
      annotations: SWITCH,
    },
    {
      name: 'test_agent_access',
      description:
        'Answer "can this user use this AI agent, agentic workflow or Now Assist skill?" with the reasons. Works it out from the instance ' +
        'data: whether the asset is active, its execute ACLs (types gen_ai_agent, gen_ai_workflow, gen_ai_skill, falling back to the ' +
        'type\'s wildcard rule), the roles on those ACLs, the skill role filter (in_product_roles) and the user\'s active roles. Also ' +
        'reports data access: run-as user and role masking (sys_agent_access_role_configuration). ACL conditions, scripts and custom ' +
        'security attributes are reported as not evaluated, and the verdict is then undetermined. This models the platform check. It is ' +
        'not ServiceNow\'s own "Test access" (AI Agent Studio, Brazil) or Access Analyzer, which have no documented REST API.',
      inputSchema: {
        type: 'object',
        properties: {
          user: { type: 'string', description: 'User sys_id, user_name or email' },
          ...TARGET_PROPS,
        },
        required: ['user', 'target'],
      },
      annotations: READ,
    },
    {
      name: 'list_ai_policies',
      description:
        'List the guardrails that apply to Otto: sensitive-topic filters and their groups and attachments (sys_gen_ai_filter, ' +
        'sys_gen_ai_filter_group, sys_gen_ai_filter_config), Guardian providers and custom transformers, and guardrail properties. ' +
        'AI Control Tower policy tables are included when the installed version has them (none exist on sn_ai_governance 5.0.6).',
      inputSchema: {
        type: 'object',
        properties: {
          active_only: { type: 'boolean', description: 'Only active filters (default false)' },
          limit: { type: 'number', description: 'Max rows per source (default 100)' },
        },
        required: [],
      },
      annotations: READ,
    },
  ];
}

/** AI Control Tower policy tables named in newer releases; queried only if they exist on the instance. */
const OPTIONAL_POLICY_TABLES = ['sn_ai_governance_policy', 'sn_ai_governance_guardrail', 'sn_aia_guardrail'];

const GUARDRAIL_PROPERTIES = [
  'sn_aia.external_agent_guardian_check',
  'mcp_guardian_check',
  'sn_aia.external_agents.user_data_access.enabled',
  'sn_aia.external_agents.ltm_access.enabled',
  'sn_aia.external_agents.stm_access.enabled',
];

export async function executeOttoToolCall(client: ServiceNowClient, name: string, args: Record<string, any>): Promise<any> {
  switch (name) {
    case 'ask_otto': {
      requireWrite();
      const text = String(args.message || '').trim();
      if (!text) throw new ServiceNowError('message is required', 'INVALID_REQUEST');
      const route = String(args.route || 'auto');
      if (!['auto', 'a2a', 'moveworks'].includes(route)) throw new ServiceNowError('route must be auto, a2a or moveworks', 'INVALID_REQUEST');
      const agentArg = String(args.agent || '').trim();
      const useMoveworks = route === 'moveworks' || (route === 'auto' && !agentArg && !(process.env.NOWAIKIT_OTTO_AGENT || '').trim() && moveworksConfigured());
      if (useMoveworks) {
        if (!moveworksConfigured()) {
          throw new ServiceNowError('The moveworks route needs MOVEWORKS_API_BASE (e.g. https://api.moveworks.ai) and MOVEWORKS_API_TOKEN.', 'CONFIG_ERROR');
        }
        return askMoveworks(args, text);
      }
      const pick = await pickOttoAgent(client, agentArg || undefined);
      let res: any;
      try {
        res = await executeActionFabricToolCall(client, 'sn_a2a_send_message', {
          agent: pick.agent, message: text, context_id: args.context_id, task_id: args.task_id,
          wait_seconds: args.wait_seconds,
        });
      } catch (e) {
        if (e instanceof ServiceNowError && e.code === 'A2A_ASYNC_MODE') {
          throw new ServiceNowError(
            `Otto (A2A agent ${pick.agent}, chosen by ${pick.how}) is reachable, but this instance runs external A2A calls ` +
              'asynchronously and only replies to a registered callback URL. Fix: in AI Agent Studio > Settings > External AI agents > ' +
              'Discoverability set Communication mode = Synchronous, then ask again. Or use route=moveworks if that is configured.',
            'A2A_ASYNC_MODE',
          );
        }
        throw e;
      }
      return { route: 'a2a', agent_chosen_by: pick.how, other_candidates: pick.candidates, ...res };
    }

    case 'ai_kill_switch': {
      const action = String(args.action || '');
      if (!['status', 'contain', 'restore'].includes(action)) throw new ServiceNowError('action must be status, contain or restore', 'INVALID_REQUEST');
      if (action !== 'status') {
        requireWrite();
        if (args.confirm !== true) {
          throw new ServiceNowError(`${action} changes a live AI asset for every user. Call again with confirm=true to go ahead.`, 'CONFIRMATION_REQUIRED');
        }
        if (!String(args.reason || '').trim()) throw new ServiceNowError(`reason is required for ${action}`, 'INVALID_REQUEST');
      }
      const t = await resolveTarget(client, targetType(args.target_type), args.target);
      const sw = await findSwitch(client, t);
      const asset = await findAsset(client, t);
      const label = TARGETS[t.type].label;
      if (!sw) {
        const why = t.type === 'workflow'
          ? `Agentic workflow "${t.name}" has no activation record (sn_aia_usecase_config_override), so it is not switched on in AI Agent Studio and there is nothing to contain.`
          : `No configuration record found for ${label} "${t.name}".`;
        if (action === 'status') return { target: t, active: false, switch: null, ai_asset: asset, note: why };
        throw new ServiceNowError(why, 'NOT_FOUND');
      }
      const base = { target: t, switch: { table: sw.table, sys_id: sw.sys_id, ...sw.extra }, ai_asset: asset };
      if (action === 'status') return { ...base, active: sw.active };
      const want = action === 'restore';
      if (sw.active === want) {
        return { ...base, action, changed: false, active: sw.active, note: `${label} "${t.name}" is already ${want ? 'active' : 'inactive'}. Nothing changed.` };
      }
      try {
        await client.updateRecord(sw.table, sw.sys_id, { active: String(want) });
      } catch (e) {
        if (e instanceof ServiceNowError && e.code === 'INSUFFICIENT_PRIVILEGES') {
          throw new ServiceNowError(
            `The instance refused to change ${sw.table} ${sw.sys_id} for this user (ACL). Nothing was changed. Fix: run as a user with ` +
              `${t.type === 'skill' ? 'sn_nowassist_admin.nsa_admin' : 'sn_aia.admin'} (or admin), or switch it off in ${t.type === 'skill' ? 'Now Assist Admin' : 'AI Agent Studio'}. ` +
              'Some store-delivered records refuse Table API edits even for admins.',
            'INSUFFICIENT_PRIVILEGES',
          );
        }
        throw e;
      }
      const after = await findSwitch(client, t);
      if (!after || after.active !== want) {
        throw new ServiceNowError(
          `The instance accepted the update but ${sw.table}.active is still ${after?.active}. A business rule or cross-scope protection may block it; change it in AI Agent Studio or Now Assist Admin.`,
          'UPDATE_NOT_APPLIED',
        );
      }
      const note = `[NowAIKit AI kill switch] ${want ? 'Restored' : 'Contained'} ${label} "${t.name}" (${sw.table}.active ${sw.active} -> ${want}). Reason: ${String(args.reason).trim()}`;
      let reason_recorded: string;
      if (asset) {
        try {
          await client.updateRecord('alm_ai_digital_asset', asset.sys_id, { work_notes: note });
          reason_recorded = `work note on AI Control Tower asset ${asset.name} (${asset.sys_id})`;
        } catch (e) {
          reason_recorded = `not recorded on the AI asset (${(e as Error).message.split('\n')[0]})`;
        }
      } else {
        reason_recorded = `no AI Control Tower asset for this ${label}, so the reason is only in this response`;
      }
      return {
        ...base, action, changed: true, active: want, previous_active: sw.active, reason_recorded,
        note: `${sw.table} is an application file, so this change is in your current update set and the record now counts as customized.`,
        undo: { tool: 'ai_kill_switch', action: want ? 'contain' : 'restore', target_type: t.type, target: t.sys_id },
      };
    }

    case 'test_agent_access': {
      const t = await resolveTarget(client, targetType(args.target_type), args.target);
      const user = await resolveUser(client, args.user);
      const roleSet = await userRoles(client, user.sys_id);
      const isAdmin = roleSet.has('admin');
      const reasons: string[] = [];
      const blockers: string[] = [];
      const unknowns: string[] = [];
      if (!user.active) blockers.push('user is inactive');
      if (user.locked_out) blockers.push('user is locked out');

      const sw = await findSwitch(client, t);
      if (!sw) blockers.push(t.type === 'workflow' ? 'workflow is not activated (no sn_aia_usecase_config_override record)' : 'no configuration record');
      else if (!sw.active) blockers.push(`${TARGETS[t.type].label} is inactive (${sw.table}.active=false)`);
      else reasons.push(`${TARGETS[t.type].label} is active`);

      if (t.type === 'skill' && sw?.extra.in_product_roles) {
        const need = sw.extra.in_product_roles.split(',').map((s) => s.trim()).filter(Boolean);
        const held = need.filter((r) => roleSet.has(r));
        if (held.length || isAdmin) reasons.push(`skill role filter met (${held.length ? held.join(', ') : 'admin'})`);
        else blockers.push(`skill is limited to roles: ${need.join(', ')}`);
      }

      const { acls, wildcard } = await findAcls(client, t);
      if (wildcard && acls.length) reasons.push(`no ${TARGETS[t.type].aclType} rule for this ${TARGETS[t.type].label}, so the type's wildcard (*) rule applies`);
      let checks: AclCheck[] = [];
      if (acls.length) {
        const links = await client.queryRecords({
          table: 'sys_security_acl_role', query: `sys_security_aclIN${acls.map((a) => val(a, 'sys_id')).join(',')}`,
          fields: 'sys_security_acl,sys_user_role.name', limit: 500,
        });
        const rolesByAcl = new Map<string, string[]>();
        for (const l of links.records as any[]) {
          const k = val(l, 'sys_security_acl');
          rolesByAcl.set(k, [...(rolesByAcl.get(k) || []), val(l, 'sys_user_role.name')].filter(Boolean));
        }
        checks = acls.map((a) => evaluateAcl(a, rolesByAcl.get(val(a, 'sys_id')) || [], roleSet, isAdmin));
        const allows = checks.filter((c) => c.decision === 'allow');
        const denies = checks.filter((c) => c.decision === 'deny');
        for (const d of denies) {
          if (d.result === 'fail') blockers.push(`deny-unless ACL ${d.acl}: ${d.reasons.join('; ')}`);
          else if (d.result === 'not_evaluated') unknowns.push(`deny-unless ACL ${d.acl}: ${d.reasons.join('; ')}`);
        }
        if (allows.length) {
          const passed = allows.find((c) => c.result === 'pass');
          if (passed) reasons.push(`execute ACL ${passed.acl}: ${passed.reasons.join('; ')}`);
          else if (allows.some((c) => c.result === 'not_evaluated')) unknowns.push(...allows.filter((c) => c.result === 'not_evaluated').map((c) => `ACL ${c.acl}: ${c.reasons.join('; ')}`));
          else blockers.push(...allows.map((c) => `execute ACL ${c.acl}: ${c.reasons.join('; ')}`));
        }
      } else {
        unknowns.push(`no active execute ACL of type ${TARGETS[t.type].aclType} matches this ${TARGETS[t.type].label} and there is no wildcard (*) rule; access then follows the instance default for unmatched ACLs`);
      }

      const verdict = blockers.length ? 'denied' : unknowns.length ? 'undetermined' : 'allowed';
      const masking = await roleMasking(client, t, roleSet);
      const relevant = new Set<string>(['admin', ...checks.flatMap((c) => c.roles), ...(masking?.approved_roles || []),
        ...String(sw?.extra.in_product_roles || '').split(',').map((r) => r.trim()).filter(Boolean)]);
      return {
        verdict,
        user: { ...user, role_count: roleSet.size, relevant_roles: [...relevant].filter((r) => roleSet.has(r)).sort(), has_admin: isAdmin },
        target: t,
        reasons: verdict === 'denied' ? blockers : reasons,
        not_evaluated: unknowns.length ? unknowns : undefined,
        acls: checks,
        data_access: {
          runs_as: sw?.extra.run_as_user ? `AI user ${sw.extra.run_as_user}` : 'the calling user (dynamic user)',
          role_masking: masking,
        },
        method: 'modeled from instance data (ACLs, roles, active flags); not ServiceNow\'s own access test',
      };
    }

    case 'list_ai_policies': {
      const limit = Math.min(Math.max(Number(args.limit) || 100, 1), 500);
      const sources: Record<string, any> = {};
      const notes: string[] = [];
      const tryQuery = async (key: string, params: Parameters<ServiceNowClient['queryRecords']>[0], map: (r: any) => any) => {
        try {
          const res = await client.queryRecords({ ...params, limit, displayValue: 'all' });
          sources[key] = { count: res.records.length, rows: (res.records as any[]).map(map) };
        } catch (e) {
          notes.push(isInvalidTable(e) ? `${params.table} is not on this instance` : `${params.table}: ${(e as Error).message.split('\n')[0]}`);
        }
      };
      await tryQuery('sensitive_topic_filters', {
        table: 'sys_gen_ai_filter', query: `${args.active_only ? 'active=true^' : ''}ORDERBYfilter_group_order`,
        fields: 'sys_id,filter_name,filter_type,active,is_global,filter_threshold,filter_group,business_unit,filter_configurations,filter_error_topic,sys_scope',
      }, (r) => ({
        sys_id: val(r, 'sys_id'), name: val(r, 'filter_name'), type: val(r, 'filter_type'), active: val(r, 'active') === 'true',
        global: val(r, 'is_global') === 'true', threshold: val(r, 'filter_threshold'), group: disp(r, 'filter_group'),
        business_unit: disp(r, 'business_unit'), config: val(r, 'filter_configurations'), fallback_topic: disp(r, 'filter_error_topic'), app: disp(r, 'sys_scope'),
      }));
      await tryQuery('filter_groups', { table: 'sys_gen_ai_filter_group', fields: 'sys_id,filter_group_name,description,sys_scope' }, (r) => ({
        sys_id: val(r, 'sys_id'), name: val(r, 'filter_group_name'), description: val(r, 'description').slice(0, 300), app: disp(r, 'sys_scope'),
      }));
      await tryQuery('filter_attachments', { table: 'sys_gen_ai_filter_config', query: args.active_only ? 'active=true' : '', fields: 'sys_id,filter,active,document_table,document_id' }, (r) => ({
        sys_id: val(r, 'sys_id'), filter: disp(r, 'filter'), active: val(r, 'active') === 'true', applies_to: `${val(r, 'document_table')}: ${disp(r, 'document_id')}`,
      }));
      // Field lists for these differ by release, so return every non-system field.
      const generic = (r: any) => Object.fromEntries(Object.keys(r).filter((k) => !k.startsWith('sys_') || k === 'sys_id' || k === 'sys_scope').map((k) => [k, disp(r, k)]));
      await tryQuery('guardian_providers', { table: 'sys_gen_ai_guardian_provider' }, generic);
      await tryQuery('guardian_transformers', { table: 'sys_generative_ai_custom_guardian_transformer' }, generic);
      for (const table of OPTIONAL_POLICY_TABLES) await tryQuery(table, { table }, generic);
      try {
        const props = await client.queryRecords({ table: 'sys_properties', query: `nameIN${GUARDRAIL_PROPERTIES.join(',')}`, fields: 'name,value', limit: GUARDRAIL_PROPERTIES.length });
        sources.guardrail_properties = Object.fromEntries((props.records as any[]).map((p) => [val(p, 'name'), val(p, 'value')]));
      } catch (e) {
        notes.push(`sys_properties: ${(e as Error).message.split('\n')[0]}`);
      }
      return { ...sources, notes: notes.length ? notes : undefined };
    }

    default:
      return null;
  }
}

/**
 * Platform AI runtime tools: model providers, runtime metrics, AI inventory CIs and the parts of
 * AI Agent Studio the other modules do not cover (teams, strategies, external agent runs).
 *
 * All read-only (Tier 0). Every section degrades to a note when its table is missing or the
 * account cannot read it, so one missing plugin never fails the whole call.
 *
 * Tables:
 *   sys_gen_ai_provider, sys_gen_ai_provider_routing, sys_gen_ai_provider_preference(_audit),
 *   sys_gen_ai_routing_selection, sys_gen_ai_model_availability, sys_gen_ai_model_version_mapping,
 *   sys_gen_ai_system_provider_mapping, sys_gen_ai_guardian_provider                   providers
 *   sys_one_extend_definition_config -> sys_one_extend_capability(_definition)          skill -> provider
 *   sn_aia_execution_plan, sn_aia_tools_execution, sn_aia_report_metric, sn_aia_perf_event,
 *   sn_mcp_execution_logs, sn_mcp_usage_job_history, sys_gen_ai_usage_log, sys_gen_ai_log_detail,
 *   sn_aia_external_agent_exec_history                                                 runtime
 *   cmdb_ci_function_ai, cmdb_ci_function_mcp, cmdb_ci_appl_ai_application,
 *   cmdb_ci_ai_model_deployment, alm_ai_digital_asset, alm_mcp_digital_asset            inventory
 *   sn_aia_team, sn_aia_team_member, sn_aia_strategy, sn_aia_agent                     Agent Studio
 */
import type { ServiceNowClient } from '../servicenow/client.js';
import { ServiceNowError } from '../utils/errors.js';

const READ = { readOnlyHint: true, openWorldHint: true } as const;

const val = (v: any) => (v && typeof v === 'object' && 'value' in v ? v.value : v);
const disp = (v: any) => (v && typeof v === 'object' && 'display_value' in v ? v.display_value : v);

function errText(err: unknown): string {
  return (err instanceof Error ? err.message : String(err)).split('\n')[0]!;
}

function lim(v: unknown, def: number, max = 500): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return def;
  return Math.min(Math.floor(n), max);
}

function safe(v: unknown, field: string): string {
  const s = String(v ?? '').trim();
  if (s.includes('^')) throw new ServiceNowError(`${field} must not contain "^"`, 'INVALID_REQUEST');
  return s;
}

function url(client: ServiceNowClient, table: string, id: unknown): string | undefined {
  const s = String(val(id) ?? '');
  return s && typeof (client as any).recordUrl === 'function' ? client.recordUrl(table, s) : undefined;
}

async function soft(client: ServiceNowClient, params: Parameters<ServiceNowClient['queryRecords']>[0]): Promise<{ records: any[]; note?: string }> {
  try {
    return { records: (await client.queryRecords(params)).records };
  } catch (err) {
    return { records: [], note: `${params.table}: ${/invalid table/i.test(errText(err)) ? 'not available on this instance' : errText(err)}` };
  }
}

async function stats(
  client: ServiceNowClient,
  table: string,
  opts: Parameters<ServiceNowClient['runStats']>[1],
): Promise<{ rows: Array<Record<string, any>>; note?: string }> {
  try {
    const rows = await client.runStats(table, { displayValue: true, ...opts });
    return {
      rows: rows.map((r: any) => {
        const out: Record<string, any> = {};
        for (const g of r.groupby_fields || []) out[g.field] = g.display_value ?? g.value ?? '';
        out.count = Number(r.stats?.count ?? 0);
        for (const [k, v] of Object.entries(r.stats?.avg || {})) out[`avg_${k}`] = Math.round(Number(v) || 0);
        for (const [k, v] of Object.entries(r.stats?.sum || {})) out[`sum_${k}`] = Number(v) || 0;
        for (const [k, v] of Object.entries(r.stats?.max || {})) out[`max_${k}`] = Number(v) || 0;
        return out;
      }),
    };
  } catch (err) {
    return { rows: [], note: `${table}: ${/invalid table/i.test(errText(err)) ? 'not available on this instance' : errText(err)}` };
  }
}

async function countOf(client: ServiceNowClient, table: string, query = ''): Promise<number | string> {
  const s = await stats(client, table, { query });
  return s.note ? (/not available/.test(s.note) ? 'not available' : 'no access') : (s.rows[0]?.count ?? 0);
}

/**
 * The provider a OneExtend capability definition calls. Definitions are named
 * "<skill> (<Provider> - <API>)" or "<skill> (<Provider>)"; filter_properties and the connection
 * alias are fallbacks.
 */
export function providerFromDefinition(name: unknown, filterProps?: unknown, connection?: unknown): string {
  const n = String(disp(name) ?? '');
  const m = /\(([^()]+)\)\s*$/.exec(n);
  if (m) {
    const inner = m[1]!.trim();
    const head = inner.split(/\s+-\s+/)[0]!.trim();
    const cleaned = head.replace(/\s+(Chat Completions|Responses|Converse)$/i, '').trim();
    if (cleaned) return cleaned;
  }
  try {
    const fp = typeof filterProps === 'string' && filterProps ? JSON.parse(filterProps) : filterProps;
    if (fp && typeof fp === 'object' && (fp as any).provider) return String((fp as any).provider).replace(/Chat Completions$/i, '').trim();
  } catch { /* not JSON */ }
  const conn = String(disp(connection) ?? '');
  if (conn) return conn.replace(/^sn_[a-z0-9_]+\./i, '').replace(/_/g, ' ');
  return 'No LLM (script or flow)';
}

/** Group provider labels into families: "Now LLM Generic" and "NOW LLM LARGE" are both Now LLM. */
export function providerFamily(provider: string): string {
  const p = provider.toLowerCase();
  if (/no llm/.test(p)) return 'No LLM (script or flow)';
  if (/now ?llm|servicenow/.test(p)) return 'Now LLM (ServiceNow)';
  if (/azure/.test(p)) return 'Azure OpenAI';
  if (/claude|anthropic|bedrock|aws|amazon/.test(p)) return 'Anthropic Claude (AWS)';
  if (/gemini|google|vertex/.test(p)) return 'Google Gemini';
  if (/openai|gpt/.test(p)) return 'OpenAI';
  if (/watson|ibm/.test(p)) return 'IBM watsonx';
  if (/mixtral|mistral/.test(p)) return 'Mistral';
  if (/perplexity/.test(p)) return 'Perplexity';
  return provider;
}

const THIRD_PARTY = /azure|openai|gpt|claude|anthropic|bedrock|amazon|aws|gemini|google|vertex|watson|perplexity|mistral|mixtral|llama|meta/i;

export function providerKind(provider: string): 'servicenow' | 'third_party' | 'custom' | 'none' | 'unknown' {
  if (/no llm/i.test(provider)) return 'none';
  if (/now ?llm|servicenow/i.test(provider)) return 'servicenow';
  if (THIRD_PARTY.test(provider)) return 'third_party';
  if (/custom|byo|gaf/i.test(provider)) return 'custom';
  return 'unknown';
}

export function getAiPlatformToolDefinitions() {
  return [
    {
      name: 'get_ai_model_providers',
      description:
        'Which LLM provider each Otto (Now Assist) skill and AI agent capability uses: the default, active OneExtend definition per capability (sys_one_extend_definition_config), grouped by provider (Now LLM, Azure OpenAI, AWS Claude, Google Gemini and others). Also returns the configured providers (sys_gen_ai_provider, OEM or BYOK), provider routing and preferences, recent preference changes, model availability and version mappings, Guardian providers, and agents by strategy. From July 2026 out-of-box skills default to third-party providers, so use this for data residency and AI governance reviews. Read-only.',
      inputSchema: {
        type: 'object',
        properties: {
          skill: { type: 'string', description: 'Only skills or capabilities whose name contains this text' },
          provider: { type: 'string', description: 'Only skills whose provider contains this text, e.g. "Azure", "Claude", "Now LLM"' },
          agents_only: { type: 'boolean', description: 'Only the AI Agents capabilities (scope sn_aia)' },
          limit: { type: 'number', description: 'Max skills to list (default 50, max 500). Totals by provider always cover every skill' },
        },
        required: [],
      },
      annotations: READ,
    },
    {
      name: 'get_ai_runtime_metrics',
      description:
        'AI runtime health over a time window: AI agent executions by agent and state with average duration, LLM tokens and p95 latencies (sn_aia_execution_plan), agent tool calls and failures (sn_aia_tools_execution), slowest agents from the p95 report metrics (sn_aia_report_metric), MCP server calls and errors (sn_mcp_execution_logs, sn_mcp_usage_job_history), Now Assist usage and assists (sys_gen_ai_usage_log, sys_gen_ai_log_detail), agent performance events (sn_aia_perf_event) and A2A traffic (sn_aia_external_agent_exec_history). Read-only.',
      inputSchema: {
        type: 'object',
        properties: {
          days: { type: 'number', description: 'Look back this many days (default 30, max 365)' },
          agent: { type: 'string', description: 'Only executions of agents whose name contains this text' },
          limit: { type: 'number', description: 'Max rows per list (default 15)' },
        },
        required: [],
      },
      annotations: READ,
    },
    {
      name: 'list_ai_inventory_cis',
      description:
        'AI and MCP configuration items in the CMDB: AI functions (cmdb_ci_function_ai), MCP servers (cmdb_ci_function_mcp, with mcp_url), AI applications (cmdb_ci_appl_ai_application) and AI model deployments (cmdb_ci_ai_model_deployment), with owner, life cycle and linked AI Control Tower asset. mode=gaps finds CIs with no asset and AI assets (alm_ai_digital_asset) with no CI. Read-only.',
      inputSchema: {
        type: 'object',
        properties: {
          ci_type: { type: 'string', enum: ['all', 'ai_function', 'mcp_server', 'ai_application', 'ai_model_deployment'], description: 'Which CI class (default all)' },
          mode: { type: 'string', enum: ['list', 'gaps'], description: 'list (default) or gaps (CI without asset, asset without CI)' },
          name: { type: 'string', description: 'Name contains' },
          limit: { type: 'number', description: 'Max records per class (default 25)' },
        },
        required: [],
      },
      annotations: READ,
    },
    {
      name: 'list_agent_teams',
      description: 'AI Agent Studio teams (sn_aia_team) with their member agents and memory scope (sn_aia_team_member), and how often each team ran (sn_aia_execution_plan). Read-only.',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Team name contains' },
          limit: { type: 'number', description: 'Max teams (default 25)' },
        },
        required: [],
      },
      annotations: READ,
    },
    {
      name: 'list_agent_strategies',
      description: 'AI agent reasoning strategies (sn_aia_strategy: ReAct, hierarchical, voice and others) with the number of agents that use each one, and agents by type (internal, voice, external). Read-only.',
      inputSchema: { type: 'object', properties: {}, required: [] },
      annotations: READ,
    },
    {
      name: 'list_external_agent_runs',
      description: 'A2A and external agent traffic (sn_aia_external_agent_exec_history): inbound and outbound messages and tasks with protocol, method, state and the record they relate to, plus totals by direction and state. Payloads are left out unless include_payload is true. Read-only.',
      inputSchema: {
        type: 'object',
        properties: {
          direction: { type: 'string', enum: ['inbound', 'outbound'], description: 'Only one direction' },
          days: { type: 'number', description: 'Look back this many days (default 30)' },
          include_payload: { type: 'boolean', description: 'Include the first 500 characters of each payload (default false)' },
          limit: { type: 'number', description: 'Max runs (default 25)' },
        },
        required: [],
      },
      annotations: READ,
    },
  ];
}

const AI_CI_CLASSES: Record<string, string> = {
  ai_function: 'cmdb_ci_function_ai',
  mcp_server: 'cmdb_ci_function_mcp',
  ai_application: 'cmdb_ci_appl_ai_application',
  ai_model_deployment: 'cmdb_ci_ai_model_deployment',
};

export async function getAiModelProviders(client: ServiceNowClient, args: Record<string, any>): Promise<Record<string, any>> {
  const max = lim(args.limit, 50);
  const skillFilter = args.skill ? safe(args.skill, 'skill') : '';
  const providerFilter = args.provider ? safe(args.provider, 'provider').toLowerCase() : '';
  const base = ['default=true', 'active=true'];
  if (args.agents_only) base.push('capability.sys_scope.scope=sn_aia');
  if (skillFilter) base.push(`capability.nameLIKE${skillFilter}`);
  base.push('ORDERBYcapability.name');

  const [providers, routing, selection, prefs, audit, avail, versions, sysMap, guardian, defs, props, agents] = await Promise.all([
    soft(client, { table: 'sys_gen_ai_provider', fields: 'sys_id,gen_ai_provider,integration_type,managed_integration', limit: 100 }),
    soft(client, { table: 'sys_gen_ai_provider_routing', fields: 'routing,region,supported_providers,default', limit: 20, displayValue: true }),
    soft(client, { table: 'sys_gen_ai_routing_selection', fields: 'selected_routing,selected_providers,fallback,sys_updated_on', limit: 20, displayValue: true }),
    soft(client, { table: 'sys_gen_ai_provider_preference', fields: 'scope,scope_id,provider,sys_updated_on,sys_updated_by', limit: 50, displayValue: true }),
    soft(client, { table: 'sys_gen_ai_provider_preference_audit', query: 'ORDERBYDESCsys_created_on', fields: 'source,status,trigger,definition_config,sys_created_on,sys_created_by', limit: 20, displayValue: true }),
    soft(client, { table: 'sys_gen_ai_model_availability', fields: 'model,available', limit: 100 }),
    soft(client, { table: 'sys_gen_ai_model_version_mapping', query: 'active=true', fields: 'gen_ai_provider,source_model_name,target_model_name,skill_type,model_type', limit: 50, displayValue: true }),
    soft(client, { table: 'sys_gen_ai_system_provider_mapping', query: 'active=true', fields: 'system_executor,gen_ai_provider,modes_supported', limit: 50, displayValue: true }),
    soft(client, { table: 'sys_gen_ai_guardian_provider', fields: 'name,gen_ai_provider,guardian_integration_type,active,default', limit: 20, displayValue: true }),
    soft(client, {
      table: 'sys_one_extend_definition_config',
      query: base.join('^'),
      fields: 'sys_id,capability,capability.name,capability.sys_scope.scope,definition,definition.name,definition.filter_properties,definition.connection,definition.api_type',
      limit: 3000,
      displayValue: 'all',
    }),
    soft(client, { table: 'sys_properties', query: 'nameINcom.sn.generative.ai.provider,sn_generative_ai.com.glide.one_extend.use_gen_ai_provider_routing_config', fields: 'name,value', limit: 5 }),
    stats(client, 'sn_aia_agent', { groupBy: 'strategy' }),
  ]);

  const skills = defs.records
    .map((r: any) => {
      const provider = providerFromDefinition(r['definition.name'], val(r['definition.filter_properties']), r['definition.connection']);
      return {
        skill: String(disp(r['capability.name']) ?? disp(r.capability) ?? ''),
        provider,
        provider_family: providerFamily(provider),
        provider_kind: providerKind(provider),
        definition: String(disp(r['definition.name']) ?? ''),
        api_type: String(disp(r['definition.api_type']) ?? '') || null,
        scope: String(val(r['capability.sys_scope.scope']) ?? '') || null,
        record_url: url(client, 'sys_one_extend_capability', r.capability),
      };
    })
    .filter((s) => !providerFilter || `${s.provider} ${s.provider_family}`.toLowerCase().includes(providerFilter));

  const byProvider = new Map<string, { provider: string; kind: string; skills: number; labels: string[] }>();
  for (const s of skills) {
    const e = byProvider.get(s.provider_family) ?? { provider: s.provider_family, kind: s.provider_kind, skills: 0, labels: [] };
    e.skills += 1;
    if (!e.labels.includes(s.provider) && e.labels.length < 8) e.labels.push(s.provider);
    byProvider.set(s.provider_family, e);
  }
  const propMap = Object.fromEntries(props.records.map((p: any) => [p.name, p.value]));
  const thirdParty = skills.filter((s) => s.provider_kind === 'third_party').length;
  const notes = [providers, routing, selection, prefs, audit, avail, versions, sysMap, guardian, defs, props].map((x) => x.note).concat(agents.note).filter(Boolean);

  return {
    summary: {
      skills_with_a_default_definition: skills.length,
      third_party_provider_skills: thirdParty,
      servicenow_model_skills: skills.filter((s) => s.provider_kind === 'servicenow').length,
      no_llm_skills: skills.filter((s) => s.provider_kind === 'none').length,
      providers_configured: providers.records.length,
      routing_config_in_use: propMap['sn_generative_ai.com.glide.one_extend.use_gen_ai_provider_routing_config'] ?? null,
      instance_default_provider_property: propMap['com.sn.generative.ai.provider'] || null,
    },
    by_provider: [...byProvider.values()].sort((a, b) => b.skills - a.skills),
    providers: providers.records.map((p: any) => ({
      name: String(val(p.gen_ai_provider) ?? ''),
      integration_type: String(val(p.integration_type) ?? '') || null,
      managed: String(val(p.managed_integration)) === 'true',
    })),
    routing: routing.records,
    routing_selection: selection.records,
    provider_preferences: prefs.records,
    recent_preference_changes: audit.records,
    model_availability: avail.records.map((m: any) => ({ model: m.model, available: String(m.available) === 'true' })),
    model_version_mappings: versions.records,
    system_executors: sysMap.records,
    guardian_providers: guardian.records,
    agents_by_strategy: agents.rows.map((r) => ({ strategy: r.strategy || '(none)', agents: r.count })),
    skills: skills.slice(0, max),
    ...(skills.length > max ? { skills_truncated: `${skills.length - max} more; narrow with skill or provider` } : {}),
    note: 'Provider per skill comes from the default, active definition of each OneExtend capability. Admins can change it per skill in Now Assist Admin; agents run their planner and tools through the AI Agents capabilities (scope sn_aia).',
    ...(notes.length ? { notes } : {}),
  };
}

export async function getAiRuntimeMetrics(client: ServiceNowClient, args: Record<string, any>): Promise<Record<string, any>> {
  const days = lim(args.days, 30, 365);
  const max = lim(args.limit, 15, 100);
  const since = `sys_created_on>=javascript:gs.daysAgoStart(${days})`;
  const agentQ = args.agent ? `^agent.nameLIKE${safe(args.agent, 'agent')}` : '';

  const [plans, planTotals, tools, toolErrors, slowAgents, mcp, mcpErrors, mcpJobs, usage, usageByFeature, logDetail, perf, a2a] = await Promise.all([
    stats(client, 'sn_aia_execution_plan', { query: since + agentQ, groupBy: 'agent,state', avgFields: ['execution_time_ms', 'llm_token_avg', 'llm_p95_latency', 'tool_p95_latency'] }),
    stats(client, 'sn_aia_execution_plan', { query: since + agentQ, groupBy: 'state' }),
    stats(client, 'sn_aia_tools_execution', { query: since, groupBy: 'tool,execution_status', avgFields: ['execution_time_ms'] }),
    soft(client, { table: 'sn_aia_tools_execution', query: `${since}^error_messageISNOTEMPTY^ORDERBYDESCsys_created_on`, fields: 'sys_id,tool,execution_status,error_message,execution_time_ms,sys_created_on', limit: max, displayValue: 'all' }),
    soft(client, { table: 'sn_aia_report_metric', query: `metric=execplan_p95^target_document_table=sn_aia_agent^start_date>=javascript:gs.daysAgoStart(${days})^value>0^ORDERBYDESCvalue`, fields: 'target_document,value,start_date', limit: max, displayValue: 'all' }),
    stats(client, 'sn_mcp_execution_logs', { query: since, groupBy: 'mcp_server,execution_status' }),
    soft(client, { table: 'sn_mcp_execution_logs', query: `${since}^error_messageISNOTEMPTY^ORDERBYDESCsys_created_on`, fields: 'sys_id,mcp_server,method,execution_status,error_message,sys_created_on', limit: max, displayValue: 'all' }),
    stats(client, 'sn_mcp_usage_job_history', { query: since, groupBy: 'success' }),
    stats(client, 'sys_gen_ai_usage_log', { query: since, groupBy: 'status', sumFields: ['assists'] }),
    stats(client, 'sys_gen_ai_usage_log', { query: since, groupBy: 'feature', sumFields: ['assists'] }),
    countOf(client, 'sys_gen_ai_log_detail', since),
    stats(client, 'sn_aia_perf_event', { query: since, groupBy: 'event_category,status', avgFields: ['duration_ms'] }),
    stats(client, 'sn_aia_external_agent_exec_history', { query: since, groupBy: 'direction,state' }),
  ]);

  const byAgent = new Map<string, { agent: string; runs: number; by_state: Record<string, number>; avg_execution_ms: number; avg_llm_tokens: number; avg_llm_p95_ms: number; avg_tool_p95_ms: number }>();
  for (const r of plans.rows) {
    const name = String(r.agent || '(no agent)');
    const e = byAgent.get(name) ?? { agent: name, runs: 0, by_state: {}, avg_execution_ms: 0, avg_llm_tokens: 0, avg_llm_p95_ms: 0, avg_tool_p95_ms: 0 };
    const prev = e.runs;
    e.runs += r.count;
    e.by_state[String(r.state || '(empty)')] = r.count;
    const w = (a: number, b: number) => (e.runs ? Math.round((a * prev + b * r.count) / e.runs) : 0);
    e.avg_execution_ms = w(e.avg_execution_ms, r.avg_execution_time_ms ?? 0);
    e.avg_llm_tokens = w(e.avg_llm_tokens, r.avg_llm_token_avg ?? 0);
    e.avg_llm_p95_ms = w(e.avg_llm_p95_ms, r.avg_llm_p95_latency ?? 0);
    e.avg_tool_p95_ms = w(e.avg_tool_p95_ms, r.avg_tool_p95_latency ?? 0);
    byAgent.set(name, e);
  }
  const failed = (s: Record<string, number>) => Object.entries(s).filter(([k]) => /fail|error|cancel/i.test(k)).reduce((n, [, v]) => n + v, 0);
  const agents = [...byAgent.values()]
    .map((a) => ({ ...a, failed: failed(a.by_state), failure_rate: a.runs ? Math.round((failed(a.by_state) / a.runs) * 1000) / 10 : 0 }))
    .sort((a, b) => b.runs - a.runs)
    .slice(0, max);
  const totalRuns = planTotals.rows.reduce((n, r) => n + r.count, 0);
  const notes = [plans, planTotals, tools, toolErrors, slowAgents, mcp, mcpErrors, mcpJobs, usage, usageByFeature, perf, a2a].map((x: any) => x.note).filter(Boolean);

  return {
    window_days: days,
    summary: {
      agent_runs: totalRuns,
      agent_runs_by_state: Object.fromEntries(planTotals.rows.map((r) => [r.state || '(empty)', r.count])),
      agent_tool_calls: tools.rows.reduce((n, r) => n + r.count, 0),
      mcp_server_calls: mcp.rows.reduce((n, r) => n + r.count, 0),
      now_assist_requests: usage.rows.reduce((n, r) => n + r.count, 0),
      now_assist_assists: usage.rows.reduce((n, r) => n + (r.sum_assists ?? 0), 0),
      gen_ai_log_details: logDetail,
      a2a_messages: a2a.rows.reduce((n, r) => n + r.count, 0),
    },
    agents,
    agent_tools: tools.rows.sort((a, b) => b.count - a.count).slice(0, max),
    agent_tool_errors: toolErrors.records.map((t: any) => ({
      tool: disp(t.tool), status: disp(t.execution_status), error: String(disp(t.error_message) ?? '').slice(0, 300), ms: Number(val(t.execution_time_ms)) || null, at: disp(t.sys_created_on), record_url: url(client, 'sn_aia_tools_execution', t.sys_id),
    })),
    slowest_agents_p95: slowAgents.records.map((m: any) => ({ agent: String(disp(m.target_document) ?? '').replace(/^AI Agent:\s*/, ''), p95_seconds: Number(val(m.value)) || 0, date: disp(m.start_date) })),
    mcp_servers: mcp.rows,
    mcp_errors: mcpErrors.records.map((m: any) => ({
      server: disp(m.mcp_server), method: disp(m.method), status: disp(m.execution_status), error: String(disp(m.error_message) ?? '').slice(0, 300), at: disp(m.sys_created_on), record_url: url(client, 'sn_mcp_execution_logs', m.sys_id),
    })),
    mcp_usage_jobs: mcpJobs.rows,
    now_assist_usage_by_status: usage.rows,
    now_assist_usage_by_feature: usageByFeature.rows.sort((a, b) => b.count - a.count).slice(0, max),
    agent_perf_events: perf.rows,
    a2a_by_direction_and_state: a2a.rows,
    ...(notes.length ? { notes } : {}),
  };
}

export async function listAiInventoryCis(client: ServiceNowClient, args: Record<string, any>): Promise<Record<string, any>> {
  const type = String(args.ci_type || 'all');
  if (type !== 'all' && !AI_CI_CLASSES[type]) throw new ServiceNowError(`ci_type must be all or one of ${Object.keys(AI_CI_CLASSES).join(', ')}`, 'INVALID_REQUEST');
  const mode = String(args.mode || 'list');
  if (!['list', 'gaps'].includes(mode)) throw new ServiceNowError('mode must be list or gaps', 'INVALID_REQUEST');
  const max = lim(args.limit, 25, 200);
  const classes = type === 'all' ? Object.entries(AI_CI_CLASSES) : [[type, AI_CI_CLASSES[type]!] as [string, string]];
  const nameQ = args.name ? `nameLIKE${safe(args.name, 'name')}` : '';
  const fields = 'sys_id,name,sys_class_name,short_description,owned_by,managed_by,support_group,asset,model_id,install_status,operational_status,life_cycle_stage,life_cycle_stage_status,sys_updated_on';

  const out: Record<string, any> = { mode, counts: {} as Record<string, any> };
  const notes: string[] = [];
  for (const [key, table] of classes) {
    // MCP functions extend cmdb_ci_function_ai; list them once, under mcp_server, when showing every class.
    const own = type === 'all' && table === 'cmdb_ci_function_ai' ? 'sys_class_name!=cmdb_ci_function_mcp' : '';
    const q = [own, nameQ, mode === 'gaps' ? 'assetISEMPTY' : ''].filter(Boolean).concat('ORDERBYname').join('^');
    const [total, recs] = await Promise.all([
      countOf(client, table, [own, nameQ].filter(Boolean).join('^')),
      soft(client, { table, query: q, fields: table === 'cmdb_ci_function_mcp' ? `${fields},mcp_url` : fields, limit: max, displayValue: 'all' }),
    ]);
    out.counts[key] = total;
    if (recs.note) notes.push(recs.note);
    out[mode === 'gaps' ? `${key}_without_asset` : key] = recs.records.map((r: any) => ({
      sys_id: val(r.sys_id),
      name: disp(r.name) || disp(r.model_id) || disp(r.short_description) || '(unnamed)',
      class: disp(r.sys_class_name),
      owner: disp(r.owned_by) || disp(r.managed_by) || null,
      support_group: disp(r.support_group) || null,
      asset: disp(r.asset) || null,
      model: disp(r.model_id) || null,
      install_status: disp(r.install_status) || null,
      life_cycle: [disp(r.life_cycle_stage), disp(r.life_cycle_stage_status)].filter(Boolean).join(' / ') || null,
      ...(r.mcp_url ? { mcp_url: val(r.mcp_url) } : {}),
      record_url: url(client, String(val(r.sys_class_name) || table), r.sys_id),
    }));
  }
  if (mode === 'gaps') {
    const [assetsNoCi, assetTotal] = await Promise.all([
      soft(client, { table: 'alm_ai_digital_asset', query: `ciISEMPTY${args.name ? `^display_nameLIKE${safe(args.name, 'name')}` : ''}^ORDERBYdisplay_name`, fields: 'sys_id,display_name,sys_class_name,model_category,install_status,owned_by', limit: max, displayValue: 'all' }),
      countOf(client, 'alm_ai_digital_asset', 'ciISEMPTY'),
    ]);
    if (assetsNoCi.note) notes.push(assetsNoCi.note);
    out.ai_assets_without_ci_count = assetTotal;
    out.ai_assets_without_ci = assetsNoCi.records.map((a: any) => ({
      sys_id: val(a.sys_id), name: disp(a.display_name), class: disp(a.sys_class_name), category: disp(a.model_category) || null, install_status: disp(a.install_status) || null, owner: disp(a.owned_by) || null, record_url: url(client, 'alm_ai_digital_asset', a.sys_id),
    }));
  }
  if (notes.length) out.notes = notes;
  return out;
}

export async function executeAiPlatformToolCall(client: ServiceNowClient, name: string, args: Record<string, any>): Promise<any> {
  switch (name) {
    case 'get_ai_model_providers':
      return getAiModelProviders(client, args);
    case 'get_ai_runtime_metrics':
      return getAiRuntimeMetrics(client, args);
    case 'list_ai_inventory_cis':
      return listAiInventoryCis(client, args);
    case 'list_agent_teams': {
      const max = lim(args.limit, 25, 200);
      const q = [args.name ? `nameLIKE${safe(args.name, 'name')}` : '', 'ORDERBYname'].filter(Boolean).join('^');
      let teams;
      try {
        teams = await client.queryRecords({ table: 'sn_aia_team', query: q, fields: 'sys_id,name,description', limit: max });
      } catch (err) {
        if (/invalid table/i.test(errText(err))) throw new ServiceNowError('sn_aia_team is not available on this instance. It needs ServiceNow Otto AI Agents (sn_aia).', 'PLUGIN_NOT_INSTALLED');
        throw err;
      }
      const ids = teams.records.map((t: any) => String(val(t.sys_id)));
      const [members, runs] = ids.length
        ? await Promise.all([
            soft(client, { table: 'sn_aia_team_member', query: `teamIN${ids.join(',')}`, fields: 'team,agent,memory_scope', limit: 1000, displayValue: 'all' }),
            stats(client, 'sn_aia_execution_plan', { query: `teamIN${ids.join(',')}`, groupBy: 'team' }),
          ])
        : [{ records: [] as any[] }, { rows: [] as any[] }];
      const runsBy = new Map(runs.rows.map((r: any) => [String(r.team), r.count]));
      const out = teams.records.map((t: any) => {
        const id = String(val(t.sys_id));
        const m = members.records.filter((x: any) => val(x.team) === id);
        const name = String(disp(t.name) ?? '');
        return {
          sys_id: id,
          name,
          description: String(disp(t.description) ?? '').slice(0, 240),
          members: m.map((x: any) => ({ agent: disp(x.agent), memory_scope: disp(x.memory_scope) || null })),
          runs: runsBy.get(name) ?? 0,
          record_url: url(client, 'sn_aia_team', id),
        };
      });
      return { count: out.length, teams: out, ...((members as any).note ? { notes: [(members as any).note] } : {}) };
    }
    case 'list_agent_strategies': {
      const [strategies, byStrategy, byType] = await Promise.all([
        soft(client, { table: 'sn_aia_strategy', query: 'ORDERBYname', fields: 'sys_id,name,type,publish,topic', limit: 100, displayValue: 'all' }),
        stats(client, 'sn_aia_agent', { groupBy: 'strategy' }),
        stats(client, 'sn_aia_agent', { groupBy: 'agent_type' }),
      ]);
      if (strategies.note && /not available/.test(strategies.note)) throw new ServiceNowError('sn_aia_strategy is not available on this instance. It needs ServiceNow Otto AI Agents (sn_aia).', 'PLUGIN_NOT_INSTALLED');
      const used = new Map(byStrategy.rows.map((r: any) => [String(r.strategy), r.count]));
      return {
        strategies: strategies.records.map((s: any) => ({
          sys_id: val(s.sys_id), name: disp(s.name), type: disp(s.type), published: val(s.publish) === 'true', topic: disp(s.topic) || null, agents: used.get(String(disp(s.name))) ?? 0, record_url: url(client, 'sn_aia_strategy', s.sys_id),
        })),
        agents_without_strategy: used.get('') ?? 0,
        agents_by_type: byType.rows.map((r: any) => ({ agent_type: r.agent_type || '(empty)', agents: r.count })),
      };
    }
    case 'list_external_agent_runs': {
      const days = lim(args.days, 30, 365);
      const max = lim(args.limit, 25, 200);
      const parts = [`sys_created_on>=javascript:gs.daysAgoStart(${days})`];
      if (args.direction) {
        if (!['inbound', 'outbound'].includes(String(args.direction))) throw new ServiceNowError('direction must be inbound or outbound', 'INVALID_REQUEST');
        parts.push(`direction=${args.direction}`);
      }
      const fields = `sys_id,direction,protocol,method,type,mode,state,associated_table,associated_record,context_id,task_id,sys_created_on${args.include_payload ? ',payload' : ''}`;
      let runs;
      try {
        runs = await client.queryRecords({ table: 'sn_aia_external_agent_exec_history', query: `${parts.join('^')}^ORDERBYDESCsys_created_on`, fields, limit: max, displayValue: 'all' });
      } catch (err) {
        if (/invalid table/i.test(errText(err))) throw new ServiceNowError('sn_aia_external_agent_exec_history is not available. It needs ServiceNow Otto AI Agents with external agent (A2A) support.', 'PLUGIN_NOT_INSTALLED');
        throw err;
      }
      const totals = await stats(client, 'sn_aia_external_agent_exec_history', { query: parts.join('^'), groupBy: 'direction,state' });
      return {
        window_days: days,
        totals: totals.rows,
        count: runs.records.length,
        runs: runs.records.map((r: any) => ({
          direction: disp(r.direction), protocol: disp(r.protocol) || null, method: disp(r.method) || null, type: disp(r.type) || null, mode: disp(r.mode) || null, state: disp(r.state) || null,
          related: r.associated_table && val(r.associated_record) ? { table: val(r.associated_table), sys_id: val(r.associated_record), record_url: url(client, String(val(r.associated_table)), r.associated_record) } : null,
          context_id: val(r.context_id) || null, task_id: val(r.task_id) || null, at: disp(r.sys_created_on),
          ...(args.include_payload ? { payload: String(val(r.payload) ?? '').slice(0, 500) } : {}),
          record_url: url(client, 'sn_aia_external_agent_exec_history', r.sys_id),
        })),
      };
    }
    default:
      return null;
  }
}

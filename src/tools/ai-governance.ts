/**
 * AI Control Tower and platform AI tools (Otto, formerly Now Assist).
 *
 * Read-only (Tier 0). Answers "what AI do we have, who approved it, how much is it used,
 * what did it change, and what is switched on" from the instance's own tables.
 *
 * Tables:
 *   alm_ai_digital_asset (+ alm_ai_model/_prompt/_dataset/_system/alm_mcp _digital_asset)  AI inventory
 *   sn_ai_governance_asset_governance_details, sn_ai_governance_lifecycle              governance + lifecycle
 *   sn_ai_governance_assessment_request, sn_ai_governance_assessment_task              approvals
 *   sn_ai_governance_ai_inventory_usage, sys_gen_ai_usage_log                           usage
 *   sys_ai_record_activity                                                              records changed by AI
 *   sys_meta_graph, sys_meta_graph_node, sys_meta_graph_edge, sn_kg_context_config,
 *   sn_kg_related_data_map, knowledge_graph_use_case_mapping                            Knowledge Graph
 *   sys_now_assist_deployment, _deployment_channel, _deployment_config, _config_attributes  Otto channels
 *   sys_scope, sys_properties                                                           status report
 */
import type { ServiceNowClient } from '../servicenow/client.js';
import { ServiceNowError } from '../utils/errors.js';

const ACT_PLUGIN = 'AI Control Tower (sn_ai_governance, "AI Control Tower Core")';
const GENAI_PLUGIN = 'Generative AI Controller (sn_generative_ai) / Otto (Now Assist)';
const KG_PLUGIN = 'Knowledge Graph (sn_kg)';
const SYS_ID_RE = /^[0-9a-f]{32}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const ASSET_CLASSES: Record<string, string> = {
  all: 'alm_ai_digital_asset',
  model: 'alm_ai_model_digital_asset',
  prompt: 'alm_ai_prompt_digital_asset',
  dataset: 'alm_ai_dataset_digital_asset',
  system: 'alm_ai_system_digital_asset',
  mcp: 'alm_mcp_digital_asset',
};

const ASSET_FIELDS =
  'sys_id,display_name,sys_class_name,model,model_category,install_status,substatus,vendor,owned_by,managed_by,assigned_to,source_system,servicenow_ref_table,servicenow_ref_id,external_ref_id,sys_created_on,sys_updated_on';

/** Scopes that make up Otto / Now Assist, AI Agents, MCP, Knowledge Graph and AI Control Tower. */
const CORE_AI_SCOPES = [
  'sn_generative_ai', 'now_assist_core', 'sn_aia', 'sn_mcp_server', 'sn_mcp_client', 'sn_ai_governance',
  'sn_kg', 'sn_genai_platform', 'sn_nowassist_admin', 'sn_skill_builder', 'sn_voice_aia', 'sn_ais_assist',
];

const KEY_PROPERTIES = [
  'sn_aia.external_agents.enabled',
  'sn_aia.enable_mcp_tool',
  'com.glide.generative_ai.enabled',
  'sn_generative_ai.enabled',
];

function isInvalidTable(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /invalid table/i.test(msg);
}

function needsPlugin(err: unknown, table: string, plugin: string): never {
  if (isInvalidTable(err)) {
    throw new ServiceNowError(`Table ${table} is not available on this instance. It needs ${plugin}.`, 'PLUGIN_NOT_INSTALLED');
  }
  throw err;
}

async function optionalQuery(
  client: ServiceNowClient,
  params: Parameters<ServiceNowClient['queryRecords']>[0],
  plugin: string
): Promise<{ available: boolean; records: any[]; note?: string }> {
  try {
    const r = await client.queryRecords(params);
    return { available: true, records: r.records };
  } catch (err) {
    if (isInvalidTable(err)) return { available: false, records: [], note: `${params.table} not present (needs ${plugin})` };
    const msg = err instanceof Error ? err.message : String(err);
    return { available: false, records: [], note: `${params.table}: ${msg.split('\n')[0]}` };
  }
}

function lim(v: unknown, def: number, max = 500): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return def;
  return Math.min(Math.floor(n), max);
}

function requireSysId(v: unknown, field: string): string {
  if (!v || typeof v !== 'string') throw new ServiceNowError(`${field} is required`, 'INVALID_REQUEST');
  if (!SYS_ID_RE.test(v)) throw new ServiceNowError(`${field} must be a 32-character sys_id`, 'INVALID_REQUEST');
  return v;
}

function safeVal(v: unknown, field: string): string {
  const s = String(v ?? '').trim();
  if (s.includes('^')) throw new ServiceNowError(`${field} must not contain "^"`, 'INVALID_REQUEST');
  return s;
}

function dateArg(v: unknown, field: string): string | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  if (typeof v !== 'string' || !DATE_RE.test(v)) throw new ServiceNowError(`${field} must be YYYY-MM-DD`, 'INVALID_REQUEST');
  return v;
}

/** Encoded query fragment for a datetime field over [from, to] (inclusive dates). */
function dateRange(field: string, from?: string, to?: string, isDateOnly = false): string[] {
  const parts: string[] = [];
  if (from) parts.push(isDateOnly ? `${field}>=${from}` : `${field}>=${from} 00:00:00`);
  if (to) parts.push(isDateOnly ? `${field}<=${to}` : `${field}<=${to} 23:59:59`);
  return parts;
}

const val = (v: any) => (v && typeof v === 'object' && 'value' in v ? v.value : v);
const disp = (v: any) => (v && typeof v === 'object' && 'display_value' in v ? v.display_value : v);

function statRows(rows: any[], sumFields: string[] = []): Array<Record<string, any>> {
  return rows.map((r) => {
    const out: Record<string, any> = {};
    for (const g of r.groupby_fields || []) out[g.field] = g.display_value ?? g.value;
    out.count = Number(r.stats?.count ?? 0);
    for (const f of sumFields) out[`sum_${f}`] = Number(r.stats?.sum?.[f] ?? 0);
    return out;
  });
}

export function getAiGovernanceToolDefinitions() {
  return [
    {
      name: 'list_ai_assets',
      description:
        'List AI assets from the AI Control Tower inventory (alm_ai_digital_asset and its model / prompt / dataset / system / MCP classes), with governance status, risk and lifecycle phase (sn_ai_governance_asset_governance_details). Covers Otto (Now Assist) skills, AI agents, prompts, models and MCP servers.',
      inputSchema: {
        type: 'object',
        properties: {
          asset_class: { type: 'string', enum: Object.keys(ASSET_CLASSES), description: 'Asset class (default all)' },
          name: { type: 'string', description: 'Display name contains' },
          install_status: { type: 'string', description: 'Asset install_status value, e.g. 1 (Installed/Deployed)' },
          governance_status: { type: 'string', description: 'Governance status value: 1 In review, 2 Approved, 4 Deployed, 5 AI steward review, 8 Approved for deployment, 9 Canceled, 10 Offboarded' },
          risk_score: { type: 'string', description: 'Risk value, e.g. 1 High, 2 Medium, 6 Critical' },
          lifecycle_phase: { type: 'string', description: 'Lifecycle phase name, e.g. New, Assess, Build, Deploy, Offboard' },
          limit: { type: 'number', description: 'Max records (default 50)' },
        },
        required: [],
      },
    },
    {
      name: 'get_ai_asset',
      description:
        'Get one AI Control Tower asset (alm_ai_digital_asset) with its governance details, lifecycle phase, risk, and any assessment / approval requests and tasks. Works for Otto (Now Assist) skills, AI agents, prompts, models and MCP assets.',
      inputSchema: {
        type: 'object',
        properties: {
          sys_id: { type: 'string', description: 'sys_id of the alm_ai_digital_asset (or of its sn_ai_governance_asset_governance_details record)' },
        },
        required: ['sys_id'],
      },
    },
    {
      name: 'list_ai_approval_requests',
      description:
        'List AI Control Tower assessment / approval requests (sn_ai_governance_assessment_request) and optionally their review tasks (sn_ai_governance_assessment_task) with reviewer and state.',
      inputSchema: {
        type: 'object',
        properties: {
          state: { type: 'string', description: 'Request state value: 1 Open, 3 Completed, 4 Canceled' },
          active: { type: 'boolean', description: 'Only active (open) requests' },
          asset: { type: 'string', description: 'Filter by governance details sys_id' },
          include_tasks: { type: 'boolean', description: 'Include review tasks (default true)' },
          limit: { type: 'number', description: 'Max requests (default 50)' },
        },
        required: [],
      },
    },
    {
      name: 'get_ai_usage',
      description:
        'Report AI usage for Otto (Now Assist) and other AI: AI Control Tower inventory/billing counts (sn_ai_governance_ai_inventory_usage, daily snapshots) and Generative AI assist consumption (sys_gen_ai_usage_log), over a date range and grouped by a field.',
      inputSchema: {
        type: 'object',
        properties: {
          source: { type: 'string', enum: ['inventory', 'genai_log', 'both'], description: 'Which usage source (default both)' },
          from: { type: 'string', description: 'Start date YYYY-MM-DD (default 30 days ago)' },
          to: { type: 'string', description: 'End date YYYY-MM-DD (default today)' },
          group_by: { type: 'string', description: 'Group field. inventory: type (default), source, accrual_date. genai_log: feature (default), plugin_name, license_name, strategy, status, execution_type, user, document_table' },
        },
        required: [],
      },
    },
    {
      name: 'list_ai_modified_records',
      description:
        'List records that were changed by AI (Otto / Now Assist, AI agents) using the platform AI record activity log (sys_ai_record_activity): table, record and which fields AI updated. Filter by table and date range, or group counts by table.',
      inputSchema: {
        type: 'object',
        properties: {
          table: { type: 'string', description: 'Only records of this table, e.g. incident' },
          from: { type: 'string', description: 'Start date YYYY-MM-DD' },
          to: { type: 'string', description: 'End date YYYY-MM-DD' },
          summary: { type: 'boolean', description: 'Return counts per table instead of rows' },
          limit: { type: 'number', description: 'Max records (default 50)' },
        },
        required: [],
      },
    },
    {
      name: 'list_kg_context_configs',
      description:
        'List Knowledge Graph configuration used by Otto (Now Assist) and AI agents for grounding: graphs (sys_meta_graph), context configs (sn_kg_context_config), related-data connector maps (sn_kg_related_data_map) and use case mappings (knowledge_graph_use_case_mapping).',
      inputSchema: {
        type: 'object',
        properties: {
          include_configuration: { type: 'boolean', description: 'Include full JSON configuration of context configs (default false)' },
          limit: { type: 'number', description: 'Max rows per section (default 50)' },
        },
        required: [],
      },
    },
    {
      name: 'describe_kg_schema',
      description:
        'Describe one Knowledge Graph schema (sys_meta_graph) used by Otto / Now Assist: its nodes (tables, labels, properties) and edges (relationships). Reads sys_meta_graph_node / sys_meta_graph_edge, falling back to the graph schema_json.',
      inputSchema: {
        type: 'object',
        properties: {
          graph: { type: 'string', description: 'Graph sys_id or name, e.g. now_user_graph, hrsd_knowledge_graph' },
          include_properties: { type: 'boolean', description: 'Include node property lists (default true)' },
        },
        required: ['graph'],
      },
    },
    {
      name: 'list_otto_channels',
      description:
        'List where Otto (Now Assist) is deployed: assistant deployments (sys_now_assist_deployment: Otto panel, Virtual Agent, voice), their channels (sys_now_assist_deployment_channel) and configuration attributes such as which skills are enabled (sys_now_assist_deployment_config_attributes).',
      inputSchema: {
        type: 'object',
        properties: {
          active: { type: 'boolean', description: 'Only active deployments' },
          include_attributes: { type: 'boolean', description: 'Include config attributes (default true)' },
        },
        required: [],
      },
    },
    {
      name: 'get_otto_status',
      description:
        'One report of what AI is available on this instance: installed Otto / Now Assist, Generative AI Controller, AI Agents, MCP server/client, Knowledge Graph and AI Control Tower apps with versions (sys_scope), key properties (sn_aia.external_agents.enabled, sn_aia.enable_mcp_tool) and counts of agents, tools, triggers and deployments.',
      inputSchema: { type: 'object', properties: {}, required: [] },
    },
  ];
}

export async function executeAiGovernanceToolCall(
  client: ServiceNowClient,
  name: string,
  args: Record<string, any>
): Promise<any> {
  switch (name) {
    case 'list_ai_assets': {
      const cls = args.asset_class || 'all';
      const table = ASSET_CLASSES[cls];
      if (!table) throw new ServiceNowError(`asset_class must be one of ${Object.keys(ASSET_CLASSES).join(', ')}`, 'INVALID_REQUEST');
      const max = lim(args.limit, 50);
      const govFilter = args.governance_status || args.risk_score || args.lifecycle_phase;

      if (govFilter) {
        // Filter on governance first, then hydrate the asset fields by dot-walk.
        const parts: string[] = [];
        if (args.governance_status) parts.push(`status=${safeVal(args.governance_status, 'governance_status')}`);
        if (args.risk_score) parts.push(`risk_score=${safeVal(args.risk_score, 'risk_score')}`);
        if (args.lifecycle_phase) parts.push(`lifecycle_phase.name=${safeVal(args.lifecycle_phase, 'lifecycle_phase')}`);
        if (cls !== 'all') parts.push(`asset.sys_class_name=${table}`);
        if (args.name) parts.push(`asset.display_nameLIKE${safeVal(args.name, 'name')}`);
        if (args.install_status) parts.push(`asset.install_status=${safeVal(args.install_status, 'install_status')}`);
        parts.push('ORDERBYasset.display_name');
        let res;
        try {
          res = await client.queryRecords({
            table: 'sn_ai_governance_asset_governance_details',
            query: parts.join('^'),
            fields: 'sys_id,asset,asset.display_name,asset.sys_class_name,asset.install_status,asset.model_category,status,risk_score,lifecycle_phase,deployed_at',
            limit: max,
            displayValue: 'all',
          });
        } catch (err) {
          needsPlugin(err, 'sn_ai_governance_asset_governance_details', ACT_PLUGIN);
        }
        const assets = res.records.map((r: any) => ({
          sys_id: val(r.asset),
          display_name: disp(r['asset.display_name']),
          class: disp(r['asset.sys_class_name']),
          category: disp(r['asset.model_category']),
          install_status: disp(r['asset.install_status']),
          governance: { sys_id: val(r.sys_id), status: disp(r.status), risk_score: disp(r.risk_score), lifecycle_phase: disp(r.lifecycle_phase), deployed_at: disp(r.deployed_at) },
        }));
        return { count: assets.length, assets };
      }

      const parts: string[] = [];
      if (args.name) parts.push(`display_nameLIKE${safeVal(args.name, 'name')}`);
      if (args.install_status) parts.push(`install_status=${safeVal(args.install_status, 'install_status')}`);
      parts.push('ORDERBYdisplay_name');
      let res;
      try {
        res = await client.queryRecords({ table, query: parts.join('^'), fields: ASSET_FIELDS, limit: max, displayValue: true });
      } catch (err) {
        needsPlugin(err, table, ACT_PLUGIN);
      }
      const ids = res.records.map((r: any) => r.sys_id).filter(Boolean);
      const gov = ids.length
        ? await optionalQuery(client, {
            table: 'sn_ai_governance_asset_governance_details',
            query: `assetIN${ids.join(',')}`,
            fields: 'sys_id,asset,status,risk_score,lifecycle_phase,deployed_at',
            limit: ids.length * 2,
            displayValue: 'all',
          }, ACT_PLUGIN)
        : { available: true, records: [] as any[] };
      const byAsset = new Map<string, any>();
      for (const g of gov.records) byAsset.set(val(g.asset), g);
      const assets = res.records.map((r: any) => {
        const g = byAsset.get(r.sys_id);
        return {
          ...r,
          governance: g ? { sys_id: val(g.sys_id), status: disp(g.status), risk_score: disp(g.risk_score), lifecycle_phase: disp(g.lifecycle_phase), deployed_at: disp(g.deployed_at) } : null,
        };
      });
      return { count: assets.length, assets, ...(gov.note ? { governance_note: gov.note } : {}) };
    }

    case 'get_ai_asset': {
      const id = requireSysId(args.sys_id, 'sys_id');
      let asset: any;
      let govRecs: any[] = [];
      try {
        asset = await client.getRecord('alm_ai_digital_asset', id, ASSET_FIELDS, true);
      } catch (err) {
        if (isInvalidTable(err)) needsPlugin(err, 'alm_ai_digital_asset', ACT_PLUGIN);
        // Maybe the caller passed the governance details sys_id instead.
        const g = await optionalQuery(client, {
          table: 'sn_ai_governance_asset_governance_details',
          query: `sys_id=${id}`,
          fields: 'sys_id,asset,status,risk_score,lifecycle_phase,deployed_at',
          limit: 1,
          displayValue: 'all',
        }, ACT_PLUGIN);
        if (!g.records.length) throw err;
        govRecs = g.records;
        asset = await client.getRecord('alm_ai_digital_asset', val(g.records[0].asset), ASSET_FIELDS, true);
      }
      if (!govRecs.length) {
        const g = await optionalQuery(client, {
          table: 'sn_ai_governance_asset_governance_details',
          query: `asset=${asset.sys_id}`,
          fields: 'sys_id,asset,status,risk_score,lifecycle_phase,deployed_at',
          limit: 5,
          displayValue: 'all',
        }, ACT_PLUGIN);
        govRecs = g.records;
      }
      const governance = govRecs.map((g) => ({ sys_id: val(g.sys_id), status: disp(g.status), risk_score: disp(g.risk_score), lifecycle_phase: disp(g.lifecycle_phase), deployed_at: disp(g.deployed_at) }));
      const govIds = governance.map((g) => g.sys_id);
      const requests = govIds.length
        ? await optionalQuery(client, {
            table: 'sn_ai_governance_assessment_request',
            query: `assetIN${govIds.join(',')}^ORDERBYDESCsys_created_on`,
            fields: 'sys_id,number,short_description,state,type,opened_at,opened_by,assigned_to,assignment_group,closed_at',
            limit: 50,
            displayValue: true,
          }, ACT_PLUGIN)
        : { available: true, records: [] as any[] };
      const reqIds = requests.records.map((r: any) => r.sys_id);
      const tasks = reqIds.length
        ? await optionalQuery(client, {
            table: 'sn_ai_governance_assessment_task',
            query: `assessment_reqIN${reqIds.join(',')}`,
            fields: 'sys_id,number,short_description,state,type,assessment_req,reviewer,reviewer_group,related_record_table,related_record,closed_at',
            limit: 200,
            displayValue: true,
          }, ACT_PLUGIN)
        : { available: true, records: [] as any[] };
      return { asset, governance, assessment_requests: requests.records, assessment_tasks: tasks.records };
    }

    case 'list_ai_approval_requests': {
      const parts: string[] = [];
      if (args.state) parts.push(`state=${safeVal(args.state, 'state')}`);
      if (args.active !== undefined) parts.push(`active=${args.active === true || args.active === 'true'}`);
      if (args.asset) parts.push(`asset=${requireSysId(args.asset, 'asset')}`);
      parts.push('ORDERBYDESCsys_created_on');
      let res;
      try {
        res = await client.queryRecords({
          table: 'sn_ai_governance_assessment_request',
          query: parts.join('^'),
          fields: 'sys_id,number,short_description,state,type,asset,asset.asset,opened_at,opened_by,assigned_to,assignment_group,approval,closed_at',
          limit: lim(args.limit, 50),
          displayValue: true,
        });
      } catch (err) {
        needsPlugin(err, 'sn_ai_governance_assessment_request', ACT_PLUGIN);
      }
      const out: Record<string, any> = { count: res.count, requests: res.records };
      if (args.include_tasks !== false && res.records.length) {
        const ids = res.records.map((r: any) => r.sys_id);
        const tasks = await optionalQuery(client, {
          table: 'sn_ai_governance_assessment_task',
          query: `assessment_reqIN${ids.join(',')}`,
          fields: 'sys_id,number,short_description,state,type,assessment_req,reviewer,reviewer_group,related_record_table,closed_at',
          limit: 500,
          displayValue: true,
        }, ACT_PLUGIN);
        out.tasks = tasks.records;
        if (tasks.note) out.tasks_note = tasks.note;
      }
      if (res.count === 0) out.note = 'No AI Control Tower assessment requests match.';
      return out;
    }

    case 'get_ai_usage': {
      const source = args.source || 'both';
      if (!['inventory', 'genai_log', 'both'].includes(source)) throw new ServiceNowError('source must be inventory, genai_log or both', 'INVALID_REQUEST');
      const today = new Date();
      const from = dateArg(args.from, 'from') ?? new Date(today.getTime() - 30 * 86400000).toISOString().slice(0, 10);
      const to = dateArg(args.to, 'to') ?? today.toISOString().slice(0, 10);
      if (from > to) throw new ServiceNowError('from must be on or before to', 'INVALID_REQUEST');
      const out: Record<string, any> = { from, to };

      if (source === 'inventory' || source === 'both') {
        const groupBy = safeVal(args.group_by && ['type', 'source', 'accrual_date'].includes(args.group_by) ? args.group_by : 'type', 'group_by');
        const sums = ['inventory_count', 'licensable_count', 'billing_count'];
        const range = dateRange('accrual_date', from, to, true).join('^');
        try {
          // Rows are daily snapshots, so the latest snapshot is the real current size of the estate.
          const latest = await client.queryRecords({ table: 'sn_ai_governance_ai_inventory_usage', query: `${range}^ORDERBYDESCaccrual_date`, fields: 'accrual_date', limit: 1 });
          const latestDate = (latest.records[0] as any)?.accrual_date;
          const [overRange, snapshot] = await Promise.all([
            client.runStats('sn_ai_governance_ai_inventory_usage', { groupBy, query: range, sumFields: sums, displayValue: true }),
            latestDate
              ? client.runStats('sn_ai_governance_ai_inventory_usage', { groupBy: groupBy === 'accrual_date' ? 'type' : groupBy, query: `accrual_date=${latestDate}`, sumFields: sums, displayValue: true })
              : Promise.resolve([]),
          ]);
          out.inventory = {
            table: 'sn_ai_governance_ai_inventory_usage',
            group_by: groupBy,
            latest_snapshot_date: latestDate ?? null,
            latest_snapshot: statRows(snapshot, sums),
            totals_over_range: statRows(overRange, sums),
            note: 'Inventory rows are daily snapshots. latest_snapshot is the current count; totals_over_range adds every day in the range.',
          };
        } catch (err) {
          if (source === 'inventory') needsPlugin(err, 'sn_ai_governance_ai_inventory_usage', ACT_PLUGIN);
          out.inventory = { available: false, note: isInvalidTable(err) ? `needs ${ACT_PLUGIN}` : (err as Error).message.split('\n')[0] };
        }
      }

      if (source === 'genai_log' || source === 'both') {
        const allowed = ['feature', 'plugin_name', 'license_name', 'strategy', 'status', 'execution_type', 'user', 'document_table', 'source_scope'];
        const groupBy = args.group_by && allowed.includes(args.group_by) ? args.group_by : 'feature';
        const range = dateRange('sys_created_on', from, to).join('^');
        try {
          const rows = await client.runStats('sys_gen_ai_usage_log', { groupBy, query: range, sumFields: ['assists', 'trial_assists'], displayValue: true });
          const grouped = statRows(rows, ['assists', 'trial_assists']).sort((a, b) => b.sum_assists - a.sum_assists);
          out.genai_log = {
            table: 'sys_gen_ai_usage_log',
            group_by: groupBy,
            total_calls: grouped.reduce((n, r) => n + r.count, 0),
            total_assists: grouped.reduce((n, r) => n + r.sum_assists, 0),
            groups: grouped,
            ...(grouped.length ? {} : { note: 'No Generative AI usage log rows in this range.' }),
          };
        } catch (err) {
          if (source === 'genai_log') needsPlugin(err, 'sys_gen_ai_usage_log', GENAI_PLUGIN);
          out.genai_log = { available: false, note: isInvalidTable(err) ? `needs ${GENAI_PLUGIN}` : (err as Error).message.split('\n')[0] };
        }
      }
      return out;
    }

    case 'list_ai_modified_records': {
      const from = dateArg(args.from, 'from');
      const to = dateArg(args.to, 'to');
      const parts: string[] = [];
      if (args.table) parts.push(`document_table=${safeVal(args.table, 'table')}`);
      parts.push(...dateRange('sys_created_on', from, to));
      const query = parts.join('^');
      try {
        if (args.summary) {
          const rows = await client.runStats('sys_ai_record_activity', { groupBy: 'document_table', query });
          const byTable = statRows(rows).sort((a, b) => b.count - a.count);
          return { total: byTable.reduce((n, r) => n + r.count, 0), by_table: byTable };
        }
        const res = await client.queryRecords({
          table: 'sys_ai_record_activity',
          query: (query ? `${query}^` : '') + 'ORDERBYDESCsys_created_on',
          fields: 'sys_id,document_table,document_id,fields_updated_by_ai,record_updated_by_ai,sys_created_on,sys_created_by',
          limit: lim(args.limit, 50),
        });
        const records = res.records.map((r: any) => ({
          ...r,
          fields_updated_by_ai: typeof r.fields_updated_by_ai === 'string' && r.fields_updated_by_ai ? r.fields_updated_by_ai.split(',').map((s: string) => s.trim()) : [],
        }));
        return { count: res.count, records, ...(res.count === 0 ? { note: 'No AI-modified records logged for this filter.' } : {}) };
      } catch (err) {
        needsPlugin(err, 'sys_ai_record_activity', GENAI_PLUGIN);
      }
    }

    case 'list_kg_context_configs': {
      const max = lim(args.limit, 50);
      const ctxFields = 'sys_id,context_name,graph,sys_scope,sys_updated_on' + (args.include_configuration ? ',configuration' : '');
      const [graphs, contexts, dataMaps, useCases] = await Promise.all([
        optionalQuery(client, { table: 'sys_meta_graph', query: 'ORDERBYname', fields: 'sys_id,name,label,description,model,default,parent,scope', limit: max, displayValue: true }, KG_PLUGIN),
        optionalQuery(client, { table: 'sn_kg_context_config', query: 'ORDERBYcontext_name', fields: ctxFields, limit: max, displayValue: true }, KG_PLUGIN),
        optionalQuery(client, { table: 'sn_kg_related_data_map', query: 'ORDERBYname', fields: 'sys_id,name,description,active,subflow,subflow_quick_api_supported,properties', limit: max, displayValue: true }, KG_PLUGIN),
        optionalQuery(client, { table: 'knowledge_graph_use_case_mapping', fields: 'sys_id,knowledge_graph_schema,use_case_table,use_case_record', limit: max, displayValue: true }, KG_PLUGIN),
      ]);
      if (!contexts.available && !graphs.available) {
        throw new ServiceNowError(`Knowledge Graph tables are not available on this instance. They need ${KG_PLUGIN}.`, 'PLUGIN_NOT_INSTALLED');
      }
      if (args.include_configuration) {
        for (const c of contexts.records) {
          try { c.configuration = JSON.parse(c.configuration); } catch { /* leave as string */ }
        }
      }
      const notes = [graphs, contexts, dataMaps, useCases].map((x) => x.note).filter(Boolean);
      return {
        summary: { graphs: graphs.records.length, context_configs: contexts.records.length, related_data_maps: dataMaps.records.length, use_case_mappings: useCases.records.length },
        graphs: graphs.records,
        context_configs: contexts.records,
        related_data_maps: dataMaps.records,
        use_case_mappings: useCases.records,
        ...(notes.length ? { notes } : {}),
      };
    }

    case 'describe_kg_schema': {
      const g = safeVal(args.graph, 'graph');
      if (!g) throw new ServiceNowError('graph is required', 'INVALID_REQUEST');
      const withProps = args.include_properties !== false;
      let res;
      try {
        res = await client.queryRecords({
          table: 'sys_meta_graph',
          query: SYS_ID_RE.test(g) ? `sys_id=${g}` : `name=${g}^ORlabel=${g}`,
          fields: 'sys_id,name,label,description,model,default,parent,scope,schema_json',
          limit: 1,
          displayValue: true,
        });
      } catch (err) {
        needsPlugin(err, 'sys_meta_graph', KG_PLUGIN);
      }
      const graph: any = res.records[0];
      if (!graph) throw new ServiceNowError(`Graph "${g}" not found in sys_meta_graph. Use list_kg_context_configs to see graphs.`, 'NOT_FOUND');
      const [nodesQ, edgesQ] = await Promise.all([
        optionalQuery(client, { table: 'sys_meta_graph_node', query: `graph=${graph.sys_id}^ORDERBYnode_type`, fields: 'sys_id,node_type,label,table,description,hidden,all_properties,encoded_query,synonyms', limit: 1000, displayValue: true }, KG_PLUGIN),
        optionalQuery(client, { table: 'sys_meta_graph_edge', query: `graph=${graph.sys_id}`, fields: 'sys_id,edge_type,label,source_node,target_node,source_key_field,target_key_field,mapping_table,description', limit: 2000, displayValue: true }, KG_PLUGIN),
      ]);
      let schema: any = null;
      if (graph.schema_json) {
        try { schema = JSON.parse(graph.schema_json); } catch { /* not JSON */ }
      }
      let nodes: any[] = nodesQ.records;
      let edges: any[] = edgesQ.records;
      let sourceOfTruth = 'sys_meta_graph_node/edge';
      if (!nodes.length && Array.isArray(schema?.nodes)) {
        sourceOfTruth = 'sys_meta_graph.schema_json';
        nodes = schema.nodes;
        edges = Array.isArray(schema.edges) ? schema.edges : [];
      }
      // Properties are only carried in schema_json; attach them by node table.
      const propsByTable = new Map<string, any[]>();
      if (Array.isArray(schema?.nodes)) for (const n of schema.nodes) if (n.table) propsByTable.set(n.table, n.properties || []);
      const outNodes = nodes.map((n: any) => {
        const props = n.properties ?? propsByTable.get(n.table);
        let nodeType = n.node_type;
        if (typeof nodeType === 'string' && nodeType.startsWith('[')) {
          try { const a = JSON.parse(nodeType); if (Array.isArray(a)) nodeType = a.join(', '); } catch { /* keep raw */ }
        }
        const base: Record<string, any> = { node_type: nodeType, label: n.label, table: n.table, description: n.description, hidden: String(n.hidden) === 'true' };
        if (n.encoded_query) base.encoded_query = n.encoded_query;
        if (withProps && props) base.properties = props.map((p: any) => ({ name: p.property, label: p.label, type: p.type, description: p.description !== p.property ? p.description : undefined }));
        else if (props) base.property_count = props.length;
        return base;
      });
      const outEdges = edges.map((e: any) => ({
        edge_type: e.edge_type,
        label: e.label,
        source: disp(e.source_node),
        target: disp(e.target_node),
        source_key_field: e.source_key_field || undefined,
        target_key_field: e.target_key_field || undefined,
        mapping_table: e.mapping_table || undefined,
      }));
      const { schema_json: _omit, ...graphInfo } = graph;
      return {
        graph: graphInfo,
        source: nodes.length ? sourceOfTruth : 'none',
        node_count: outNodes.length,
        edge_count: outEdges.length,
        nodes: outNodes,
        edges: outEdges,
        ...(nodes.length ? {} : { note: 'This graph has no explicit nodes. Graphs with model "Extension" or the Global Graph derive nodes from the table dictionary.' }),
      };
    }

    case 'list_otto_channels': {
      const depQuery = (args.active !== undefined ? `active=${args.active === true || args.active === 'true'}^` : '') + 'ORDERBYname';
      let deps;
      try {
        deps = await client.queryRecords({ table: 'sys_now_assist_deployment', query: depQuery, fields: 'sys_id,name,description,active,assistant_type,relationship_type', limit: 200, displayValue: 'all' });
      } catch (err) {
        needsPlugin(err, 'sys_now_assist_deployment', GENAI_PLUGIN);
      }
      const ids = deps.records.map((d: any) => val(d.sys_id));
      if (!ids.length) return { count: 0, deployments: [], note: 'No Otto (Now Assist) deployments found.' };
      const [channels, configs] = await Promise.all([
        optionalQuery(client, { table: 'sys_now_assist_deployment_channel', query: `now_assist_deploymentIN${ids.join(',')}`, fields: 'sys_id,now_assist_deployment,experience,active,config_type,document_table,document_id', limit: 500, displayValue: 'all' }, GENAI_PLUGIN),
        optionalQuery(client, { table: 'sys_now_assist_deployment_config', query: `now_assist_deploymentIN${ids.join(',')}`, fields: 'sys_id,now_assist_deployment,context_profile,branding', limit: 200, displayValue: 'all' }, GENAI_PLUGIN),
      ]);
      const cfgIds = configs.records.map((c: any) => val(c.sys_id));
      const attrs = args.include_attributes !== false && cfgIds.length
        ? await optionalQuery(client, { table: 'sys_now_assist_deployment_config_attributes', query: `deployment_configIN${cfgIds.join(',')}^ORDERBYname`, fields: 'name,value,deployment_config', limit: 1000 }, GENAI_PLUGIN)
        : { available: true, records: [] as any[] };
      const deployments = deps.records.map((d: any) => {
        const id = val(d.sys_id);
        const cfgs = configs.records.filter((c: any) => val(c.now_assist_deployment) === id);
        const cfgSet = new Set(cfgs.map((c: any) => val(c.sys_id)));
        const attributes: Record<string, string> = {};
        for (const a of attrs.records) if (cfgSet.has(val(a.deployment_config))) attributes[a.name] = a.value;
        return {
          sys_id: id,
          name: disp(d.name),
          active: val(d.active) === 'true',
          assistant_type: disp(d.assistant_type),
          description: disp(d.description),
          channels: channels.records
            .filter((c: any) => val(c.now_assist_deployment) === id)
            .map((c: any) => ({ sys_id: val(c.sys_id), active: val(c.active) === 'true', experience: disp(c.experience), config_type: disp(c.config_type), surface_table: val(c.document_table), surface: disp(c.document_id) })),
          config: cfgs.map((c: any) => ({ sys_id: val(c.sys_id), context_profile: disp(c.context_profile), branding: disp(c.branding) })),
          ...(args.include_attributes !== false ? { attributes } : {}),
        };
      });
      const notes = [channels, configs, attrs].map((x: any) => x.note).filter(Boolean);
      return { count: deployments.length, deployments, ...(notes.length ? { notes } : {}) };
    }

    case 'get_otto_status': {
      const scopeQuery = `scopeIN${CORE_AI_SCOPES.join(',')}^ORscopeSTARTSWITHsn_nowassist^ORscopeSTARTSWITHsn_now_assist^ORnameLIKEOtto^ORnameLIKENow Assist^ORnameLIKEGenerative AI^ORDERBYscope`;
      const [scopes, props] = await Promise.all([
        optionalQuery(client, { table: 'sys_scope', query: scopeQuery, fields: 'scope,name,version,active,sys_class_name', limit: 300 }, 'sys_scope read access'),
        optionalQuery(client, { table: 'sys_properties', query: `nameIN${KEY_PROPERTIES.join(',')}^ORnameSTARTSWITHsn_mcp_server.^ORnameSTARTSWITHsn_aia.enable`, fields: 'name,value', limit: 100 }, 'sys_properties read access'),
      ]);
      const apps = scopes.records.map((s: any) => ({ scope: s.scope, name: s.name, version: s.version || null, active: s.active === 'true' }));
      const byScope = new Map(apps.map((a) => [a.scope, a]));
      const flag = (scope: string) => {
        const a = byScope.get(scope);
        return a ? { installed: true, active: a.active, version: a.version, name: a.name } : { installed: false };
      };
      const propMap: Record<string, string | null> = {};
      for (const p of KEY_PROPERTIES) propMap[p] = null;
      for (const p of props.records) propMap[p.name] = p.value;

      const countOf = async (table: string, query = '') => {
        try {
          const rows = await client.runStats(table, { query });
          return Number(rows[0]?.stats?.count ?? 0);
        } catch (err) {
          return isInvalidTable(err) ? 'not installed' : 'no access';
        }
      };
      const [agents, activeAgents, tools, triggers, workflows, deployments, aiAssets, mcpServers] = await Promise.all([
        countOf('sn_aia_agent'),
        countOf('sn_aia_agent_config', 'active=true'),
        countOf('sn_aia_tool'),
        countOf('sn_aia_trigger_configuration', 'active=true'),
        countOf('sn_aia_usecase'),
        countOf('sys_now_assist_deployment', 'active=true'),
        countOf('alm_ai_digital_asset'),
        countOf('alm_mcp_digital_asset'),
      ]);
      const otto = apps.filter((a) => /otto|now assist|gen_ai|genai|nowassist|now_assist/i.test(`${a.name} ${a.scope}`));
      return {
        summary: {
          generative_ai_controller: flag('sn_generative_ai'),
          now_assist_core: flag('now_assist_core'),
          ai_agents: flag('sn_aia'),
          mcp_server: flag('sn_mcp_server'),
          mcp_client: flag('sn_mcp_client'),
          knowledge_graph: flag('sn_kg'),
          ai_control_tower: flag('sn_ai_governance'),
          external_agents_enabled: propMap['sn_aia.external_agents.enabled'] === 'true',
          mcp_tools_in_agents_enabled: propMap['sn_aia.enable_mcp_tool'] === 'true',
          otto_app_count: otto.length,
        },
        counts: {
          ai_agents: agents,
          active_ai_agents: activeAgents,
          agent_tools: tools,
          active_triggers: triggers,
          agentic_workflows: workflows,
          active_otto_deployments: deployments,
          ai_control_tower_assets: aiAssets,
          mcp_assets: mcpServers,
        },
        properties: propMap,
        apps,
        ...(scopes.note || props.note ? { notes: [scopes.note, props.note].filter(Boolean) } : {}),
      };
    }

    default:
      return null;
  }
}

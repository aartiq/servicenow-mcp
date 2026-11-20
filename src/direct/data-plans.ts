/**
 * Data plans for direct mode (`nowaikit run` / `nowaikit report`).
 *
 * Direct mode gathers data once and makes one model call, so every capability needs its data
 * gathered up front. Each plan lists the read-only steps for one capability: a catalog tool run
 * through the same handler the MCP server uses, a Table API query (with a record_url on every
 * row) or an Aggregate API count. Steps can depend on earlier results (for example "the first open
 * P1 incident" when no incident was given).
 *
 * Every step that cannot run (missing argument, missing plugin, no access) is reported in the
 * data_coverage section, so the report says what is missing instead of guessing.
 */
import type { ServiceNowClient } from '../servicenow/client.js';

export interface PlanContext {
  /** Capability arguments (CLI -t, -s, -f and --arg key=value). */
  args: Record<string, string>;
  /** -t, or -s when it names a table. */
  table: string;
  /** Results gathered so far, by key. */
  results: Record<string, unknown>;
}

type ArgsFn = (ctx: PlanContext) => Record<string, unknown> | null;

export interface QuerySpec { table: string; query?: string; fields: string; limit?: number; displayValue?: boolean | 'all' }
export interface StatsSpec { table: string; query?: string; groupBy?: string; avgFields?: string[]; sumFields?: string[] }

export type PlanStep =
  | { key: string; tool: string; args?: ArgsFn; limit?: number; why?: string; urls?: Record<string, string> }
  | { key: string; query: QuerySpec | ((ctx: PlanContext) => QuerySpec | null); urlTable?: string; truncate?: Record<string, number>; limit?: number; why?: string }
  | { key: string; stats: StatsSpec | ((ctx: PlanContext) => StatsSpec | null); limit?: number; why?: string };

export interface CoverageEntry { key: string; status: 'gathered' | 'empty' | 'skipped' | 'failed'; detail?: string }

const SYS_ID_RE = /^[0-9a-f]{32}$/i;
const TABLE_RE = /^[a-z0-9_]+$/i;

const val = (v: any) => (v && typeof v === 'object' && 'value' in v ? v.value : v);

/** Pick a value from an earlier result by a path such as "incidents.records.0.number". */
export function pick(results: Record<string, unknown>, path: string): unknown {
  let cur: any = results;
  for (const p of path.split('.')) {
    if (cur === null || cur === undefined) return undefined;
    cur = Array.isArray(cur) && /^\d+$/.test(p) ? cur[Number(p)] : cur[p];
  }
  return val(cur);
}

const safeArg = (v: unknown) => String(v ?? '').trim().replace(/\^/g, '');
const tableOr = (ctx: PlanContext, def: string) => (ctx.table && TABLE_RE.test(ctx.table) ? ctx.table : def);
const SCAN_WORDS = new Set(['instance', 'all', 'security', 'performance', 'upgradability', 'manageability', 'user_experience']);
/** Filter by application scope when -s names one (not "instance" or a scan category). */
const scopeQ = (ctx: PlanContext, field = 'sys_scope.scope') => {
  const s = safeArg(ctx.args.scope);
  return s && TABLE_RE.test(s) && !SCAN_WORDS.has(s.toLowerCase()) ? `${field}=${s}^` : '';
};
const recent = (days: number, field = 'sys_updated_on') => `${field}>=javascript:gs.daysAgoStart(${days})`;
const customBy = 'sys_updated_by!=maint^sys_updated_by!=system^sys_updated_by!=admin@snc';

// Steps reused by several plans.
const step = {
  release: { key: 'release_info', tool: 'get_release_info', limit: 7000 } as PlanStep,
  aclPosture: (forTable = true): PlanStep => ({ key: 'acl_posture', tool: 'get_acl_posture', args: (c) => ({ table: forTable && c.table ? c.table : undefined, limit: 25 }), limit: 9000 }),
  authPosture: { key: 'integration_auth_posture', tool: 'get_integration_auth_posture', args: () => ({ limit: 20 }), limit: 9000 } as PlanStep,
  mcpExposure: { key: 'mcp_exposure', tool: 'get_mcp_exposure', args: () => ({ limit: 25 }), limit: 8000 } as PlanStep,
  schema: { key: 'table_schema', tool: 'get_table_schema', args: (c) => (c.table ? { table: c.table } : null), limit: 5000, why: 'needs -t <table>' } as PlanStep,
  admins: {
    key: 'admin_role_holders',
    query: { table: 'sys_user_has_role', query: 'role.nameINadmin,security_admin^state=active^user.active=true^ORDERBYrole.name', fields: 'user,user.user_name,user.last_login_time,role.name,inherited', limit: 60, displayValue: 'all' },
    urlTable: 'sys_user_has_role',
  } as PlanStep,
  scriptsBy: (table: string, filter: string, fields: string, key: string, limit = 8): PlanStep => ({
    key,
    query: (c) => ({ table, query: `${scopeQ(c)}${filter}`, fields, limit }),
    truncate: { script: 1500, condition: 300 },
    limit: 12000,
  }),
};

/** Counts of risky script patterns, each with a list link. */
const PATTERN_COUNTS: Array<{ key: string; table: string; query: string; label: string }> = [
  { key: 'eval_server', table: 'sys_script', query: 'active=true^scriptLIKEeval(', label: 'business rules calling eval()' },
  { key: 'eval_si', table: 'sys_script_include', query: 'active=true^scriptLIKEeval(', label: 'script includes calling eval()' },
  { key: 'sleep', table: 'sys_script', query: 'active=true^scriptLIKEgs.sleep', label: 'business rules calling gs.sleep' },
  { key: 'client_gr', table: 'sys_script_client', query: 'active=true^scriptLIKEnew GlideRecord', label: 'client scripts using GlideRecord' },
  { key: 'client_wait', table: 'sys_script_client', query: 'active=true^scriptLIKEgetXMLWait', label: 'client scripts using synchronous getXMLWait' },
  { key: 'set_workflow', table: 'sys_script', query: 'active=true^scriptLIKEsetWorkflow(false)', label: 'business rules switching off workflow with setWorkflow(false)' },
  { key: 'current_update', table: 'sys_script', query: 'active=true^when=after^scriptLIKEcurrent.update()', label: 'after business rules calling current.update()' },
  { key: 'gs_log', table: 'sys_script_include', query: 'active=true^scriptLIKEgs.log(', label: 'script includes using gs.log' },
  { key: 'client_callable', table: 'sys_script_include', query: 'active=true^client_callable=true', label: 'client-callable script includes' },
];

const patternSteps = (keys?: string[]): PlanStep[] =>
  PATTERN_COUNTS.filter((p) => !keys || keys.includes(p.key)).map((p) => ({ key: `pattern_${p.key}`, stats: { table: p.table, query: p.query }, why: p.label }));

/** Data plans per capability. */
export const DATA_PLANS: Record<string, PlanStep[]> = {
  // ── Scan ──────────────────────────────────────────────────────────────────
  'scan-health': [
    step.release,
    { key: 'errors_last_24h_by_source', stats: { table: 'syslog', query: `level=2^${recent(1, 'sys_created_on')}`, groupBy: 'source' } },
    { key: 'recent_errors', query: { table: 'syslog', query: `level=2^${recent(1, 'sys_created_on')}^ORDERBYDESCsys_created_on`, fields: 'sys_id,source,message,sys_created_on', limit: 20 }, truncate: { message: 300 } },
    { key: 'slow_transactions_24h', query: { table: 'syslog_transaction', query: `${recent(1, 'sys_created_on')}^response_time>5000^ORDERBYDESCresponse_time`, fields: 'sys_id,url,response_time,sql_time,business_rule_time,sys_created_on', limit: 15 }, truncate: { url: 160 } },
    { key: 'transaction_response_24h', stats: { table: 'syslog_transaction', query: recent(1, 'sys_created_on'), avgFields: ['response_time', 'sql_time'] } },
    { key: 'scheduled_jobs', tool: 'list_scheduled_jobs', args: () => ({ active: true, limit: 30 }), limit: 5000 },
    ...['task', 'syslog', 'sys_email', 'sys_attachment', 'sys_update_xml', 'cmdb_ci', 'sys_journal_field'].map((t): PlanStep => ({ key: `row_count_${t}`, stats: { table: t } })),
    { key: 'email_last_24h_by_state', stats: { table: 'sys_email', query: recent(1, 'sys_created_on'), groupBy: 'type' } },
    { key: 'mid_servers', tool: 'list_mid_servers', args: () => ({}), limit: 3000 },
    { key: 'ai_runtime_7d', tool: 'get_ai_runtime_metrics', args: () => ({ days: 7, limit: 8 }), limit: 5000 },
  ],
  'scan-security': [
    step.aclPosture(false),
    step.authPosture,
    step.admins,
    { key: 'security_properties', query: { table: 'sys_properties', query: 'nameINglide.security.use_csrf_token,glide.script.use.sandbox,glide.ui.escape_text,glide.html.escape_script,glide.security.strict.updates,glide.ui.session_timeout,glide.authenticate.multifactor,glide.basicauth.required.api,glide.security.acl_with_invalid_roles_strict_deny,glide.sm.default_mode,glide.security.explicit_roles.enabled', fields: 'sys_id,name,value', limit: 30 } },
    { key: 'rest_messages', tool: 'list_rest_messages', args: () => ({ limit: 30 }), limit: 4000 },
    step.mcpExposure,
    ...patternSteps(['eval_server', 'eval_si', 'client_gr', 'client_callable']),
    { key: 'public_pages', stats: { table: 'sys_public', query: 'active=true' } },
  ],
  'scan-debt': [
    { key: 'inactive_counts_business_rules', stats: { table: 'sys_script', query: `active=false^${customBy}` } },
    { key: 'inactive_counts_script_includes', stats: { table: 'sys_script_include', query: `active=false^${customBy}` } },
    { key: 'inactive_counts_client_scripts', stats: { table: 'sys_script_client', query: `active=false^${customBy}` } },
    { key: 'old_custom_script_includes', query: (c) => ({ table: 'sys_script_include', query: `${scopeQ(c)}active=true^${customBy}^sys_updated_on<javascript:gs.yearsAgo(3)^ORDERBYsys_updated_on`, fields: 'sys_id,name,api_name,sys_updated_on,sys_updated_by,sys_scope', limit: 25 }) },
    { key: 'open_update_sets', tool: 'list_update_sets', args: () => ({ state: 'in progress', limit: 30 }), limit: 5000 },
    { key: 'inactive_flows', tool: 'list_flows', args: () => ({ active: false, limit: 30 }), limit: 4000 },
    { key: 'legacy_workflows_active', stats: { table: 'wf_workflow_version', query: 'active=true^published=true' } },
    { key: 'scheduled_jobs_inactive', stats: { table: 'sysauto_script', query: 'active=false' } },
    { key: 'dashboard_migration', tool: 'get_dashboard_migration_status', args: () => ({ limit: 15 }), limit: 5000 },
    ...patternSteps(['gs_log', 'sleep', 'current_update']),
  ],
  'scan-upgrade': [
    step.release,
    step.aclPosture(false),
    { key: 'dashboard_migration', tool: 'get_dashboard_migration_status', args: () => ({ limit: 15 }), limit: 5000 },
    { key: 'customised_baseline_records', stats: { table: 'sys_update_xml', query: `${recent(365)}^replace_on_upgrade=false`, groupBy: 'type' } },
    ...patternSteps(['client_gr', 'client_wait', 'eval_server']),
  ],
  'scan-cmdb': [
    { key: 'cmdb_health_dashboard', tool: 'cmdb_health_dashboard', args: () => ({}), limit: 4000 },
    { key: 'data_foundations', tool: 'get_cmdb_data_foundations', args: () => ({ limit: 5 }), limit: 26000 },
    { key: 'csdm_health', tool: 'get_csdm_health', args: () => ({ limit: 8 }), limit: 9000 },
    { key: 'ci_classes', stats: (c) => ({ table: 'cmdb_ci', query: c.args.ci_class ? `sys_class_name=${safeArg(c.args.ci_class)}` : '', groupBy: 'sys_class_name' }) },
    { key: 'duplicates', tool: 'cmdb_find_duplicates', args: (c) => ({ ci_class: c.args.ci_class || 'cmdb_ci_server', limit: 300 }), limit: 4000 },
    { key: 'orphans', tool: 'cmdb_find_orphans', args: (c) => ({ ci_class: c.args.ci_class || 'cmdb_ci_server', limit: 40 }), limit: 4000 },
    { key: 'stale', tool: 'cmdb_find_stale', args: (c) => ({ ci_class: c.args.ci_class || 'cmdb_ci', lifecycle_model: 'either', limit: 15 }), limit: 4000 },
    { key: 'server_completeness', tool: 'check_table_completeness', args: (c) => ({ table: c.args.ci_class || 'cmdb_ci_server', fields: 'name,ip_address,os,serial_number,manufacturer,model_id,location,support_group,owned_by', sample_size: 200 }), limit: 3000 },
    { key: 'ai_inventory_cis', tool: 'list_ai_inventory_cis', args: () => ({ mode: 'gaps', limit: 5 }), limit: 4000 },
  ],
  'scan-automation': [
    { key: 'trace_insert', tool: 'trace_table_operation', args: (c) => ({ table: tableOr(c, 'incident'), operation: 'insert', max_per_stage: 25 }), limit: 12000 },
    { key: 'trace_update', tool: 'trace_table_operation', args: (c) => ({ table: tableOr(c, 'incident'), operation: 'update', max_per_stage: 25 }), limit: 12000 },
    { key: 'business_rule_scripts', query: (c) => ({ table: 'sys_script', query: `collection=${tableOr(c, 'incident')}^active=true^ORDERBYorder`, fields: 'sys_id,name,when,order,action_insert,action_update,filter_condition,script', limit: 15 }), truncate: { script: 900, filter_condition: 200 }, limit: 14000 },
    { key: 'client_scripts', tool: 'list_client_scripts', args: (c) => ({ table: tableOr(c, 'incident'), active: true, limit: 30 }), limit: 4000 },
  ],
  'scan-instance': [],

  // ── Review ────────────────────────────────────────────────────────────────
  'review-acls': [
    step.aclPosture(true),
    { key: 'acls', tool: 'list_acls', args: (c) => ({ table: c.table || undefined, active: true, limit: c.table ? 100 : 60 }), limit: 9000 },
    { key: 'acl_roles', query: (c) => ({ table: 'sys_security_acl_role', query: c.table ? `sys_security_acl.name=${c.table}^ORsys_security_acl.nameSTARTSWITH${c.table}.` : 'sys_security_acl.active=true^ORDERBYDESCsys_updated_on', fields: 'sys_security_acl,sys_security_acl.name,sys_security_acl.operation,sys_security_acl.decision_type,sys_user_role.name', limit: c.table ? 200 : 60 }), urlTable: 'sys_security_acl_role', limit: 8000 },
    { key: 'open_read_acls', query: (c) => ({ table: 'sys_security_acl', query: `${c.table ? `name=${c.table}^ORnameSTARTSWITH${c.table}.^` : ''}active=true^operation=read^advanced=false^conditionISEMPTY^security_attributeISEMPTY^decision_type=allow`, fields: 'sys_id,name,type,operation', limit: 40 }), limit: 5000, why: 'ACLs with no script, condition or security attribute; open to any role on them' },
    step.schema,
    step.admins,
  ],
  'review-code': [
    { key: 'artifact', tool: 'find_artifact', args: (c) => (c.args.artifact ? { name: c.args.artifact, limit: 5 } : null), limit: 4000, why: 'needs --arg artifact=<name>' },
    stepScriptsRecent('sys_script', 'recent_business_rules', 'sys_id,name,collection,when,order,script'),
    stepScriptsRecent('sys_script_include', 'recent_script_includes', 'sys_id,name,api_name,client_callable,script'),
    stepScriptsRecent('sys_script_client', 'recent_client_scripts', 'sys_id,name,table,type,script'),
    ...patternSteps(),
  ],
  'review-scripts': [
    ...patternSteps(),
    { key: 'pattern_examples_eval', query: (c) => ({ table: 'sys_script', query: `${scopeQ(c)}active=true^scriptLIKEeval(`, fields: 'sys_id,name,collection,sys_scope', limit: 8 }) },
    { key: 'pattern_examples_client_gr', query: (c) => ({ table: 'sys_script_client', query: `${scopeQ(c)}active=true^scriptLIKEnew GlideRecord`, fields: 'sys_id,name,table,sys_scope', limit: 8 }) },
    stepScriptsRecent('sys_script', 'recent_business_rules', 'sys_id,name,collection,when,script'),
    stepScriptsRecent('sys_script_include', 'recent_script_includes', 'sys_id,name,api_name,script'),
  ],
  'review-flows': [
    { key: 'active_flows', tool: 'list_flows', args: () => ({ active: true, limit: 40 }), limit: 6000 },
    { key: 'subflows', tool: 'list_subflows', args: () => ({ active: true, limit: 25 }), limit: 4000 },
    { key: 'flow_errors_30d_by_flow', stats: { table: 'sys_flow_context', query: `state=ERROR^${recent(30, 'sys_created_on')}`, groupBy: 'name' } },
    { key: 'recent_flow_errors', query: { table: 'sys_flow_context', query: `state=ERROR^${recent(30, 'sys_created_on')}^ORDERBYDESCsys_created_on`, fields: 'sys_id,name,state,error_message,sys_created_on', limit: 15 }, truncate: { error_message: 300 } },
    { key: 'flow_runs_30d_by_state', stats: { table: 'sys_flow_context', query: recent(30, 'sys_created_on'), groupBy: 'state' } },
    { key: 'legacy_workflow_contexts_running', query: { table: 'wf_context', query: 'stateINexecuting,waiting', fields: 'sys_id,name,state,table,started', limit: 15 } },
    step.mcpExposure,
  ],

  // ── Build (they write nothing in direct mode; the data is context for the plan) ──
  'build-business-rule': [step.schema, { key: 'existing_business_rules', tool: 'list_business_rules', args: (c) => (c.table ? { table: c.table, active: true, limit: 40 } : null), limit: 5000, why: 'needs -t <table>' }, { key: 'trace_update', tool: 'trace_table_operation', args: (c) => (c.table ? { table: c.table, operation: 'update', max_per_stage: 15 } : null), limit: 8000, why: 'needs -t <table>' }],
  'build-client-script': [step.schema, { key: 'existing_client_scripts', tool: 'list_client_scripts', args: (c) => (c.table ? { table: c.table, active: true, limit: 40 } : null), limit: 5000, why: 'needs -t <table>' }, { key: 'ui_policies', tool: 'list_ui_policies', args: (c) => (c.table ? { table: c.table, active: true, limit: 30 } : null), limit: 4000, why: 'needs -t <table>' }],
  'build-flow': [step.schema, { key: 'existing_flows', tool: 'list_flows', args: () => ({ active: true, limit: 40 }), limit: 5000 }, { key: 'subflows', tool: 'list_subflows', args: () => ({ active: true, limit: 25 }), limit: 3000 }],
  'build-catalog': [{ key: 'catalog_categories', tool: 'list_catalog_categories', args: () => ({ limit: 40 }), limit: 4000 }, { key: 'catalog_items', tool: 'list_catalog_items', args: () => ({ limit: 30 }), limit: 4000 }],
  'build-portal': [{ key: 'portal_widgets', tool: 'list_portal_widgets', args: () => ({ limit: 30 }), limit: 4000 }, step.schema],
  'build-uib': [{ key: 'uib_pages', tool: 'list_uib_pages', args: () => ({ limit: 25 }), limit: 4000 }],
  'build-rest-api': [{ key: 'rest_messages', tool: 'list_rest_messages', args: () => ({ limit: 25 }), limit: 4000 }, { key: 'scripted_rest_apis', query: { table: 'sys_ws_definition', query: 'active=true^ORDERBYDESCsys_updated_on', fields: 'sys_id,name,base_uri,namespace,sys_scope', limit: 25 } }, step.authPosture],
  'build-app': [{ key: 'scoped_apps', tool: 'list_scoped_apps', args: () => ({ active: true, limit: 30 }), limit: 4000 }],
  'build-atf-suite': [
    { key: 'target_artifact', tool: 'find_artifact', args: (c) => (c.args.target ? { name: c.args.target, limit: 5 } : null), limit: 4000, why: 'needs --arg target=<artifact>' },
    { key: 'atf_suites', tool: 'list_atf_suites', args: () => ({ active: true, limit: 25 }), limit: 4000 },
    { key: 'atf_code_coverage', tool: 'get_atf_code_coverage', args: () => ({ limit: 10 }), limit: 6000 },
  ],
  'build-test-plan': [
    { key: 'target_artifact', tool: 'find_artifact', args: (c) => (c.args.target ? { name: c.args.target, limit: 5 } : null), limit: 4000, why: 'needs --arg target=<artifact>' },
    { key: 'atf_suites', tool: 'list_atf_suites', args: () => ({ active: true, limit: 25 }), limit: 4000 },
  ],

  // ── Ops ───────────────────────────────────────────────────────────────────
  'ops-triage': [
    { key: 'open_major_incidents', query: { table: 'incident', query: 'active=true^priorityIN1,2^ORDERBYpriority^ORDERBYDESCsys_updated_on', fields: 'sys_id,number,short_description,priority,state,assignment_group,cmdb_ci,opened_at', limit: 10, displayValue: 'all' } },
    { key: 'investigation', tool: 'investigate_incident', args: (c) => ({ number_or_sysid: safeArg(c.args.incident) || pick(c.results, 'open_major_incidents.records.0.number') || null }), limit: 12000, why: 'no incident given and no open P1/P2 incident', urls: { incident: 'incident', similar_incidents: 'incident', affected_ci: 'cmdb_ci', related_knowledge: 'kb_knowledge' } },
    { key: 'incident_slas', query: (c) => {
      const id = pick(c.results, 'investigation.incident.sys_id') || pick(c.results, 'investigation.sys_id');
      return id && SYS_ID_RE.test(String(id)) ? { table: 'task_sla', query: `task=${id}`, fields: 'sys_id,sla,stage,has_breached,planned_end_time,percentage', limit: 10, displayValue: 'all' } : null;
    }, why: 'needs the incident sys_id' },
  ],
  'ops-risk': [
    { key: 'upcoming_changes', query: { table: 'change_request', query: 'active=true^start_date>=javascript:gs.beginningOfToday()^start_date<=javascript:gs.daysAgoEnd(-30)^ORDERBYstart_date', fields: 'sys_id,number,short_description,type,risk,state,start_date,end_date,cmdb_ci,assignment_group', limit: 15, displayValue: 'all' } },
    { key: 'open_changes', query: { table: 'change_request', query: 'active=true^ORDERBYDESCsys_updated_on', fields: 'sys_id,number,short_description,type,risk,state,start_date,end_date,cmdb_ci,assignment_group', limit: 10, displayValue: 'all' } },
    { key: 'change_readiness', tool: 'change_readiness', args: (c) => ({ number_or_sysid: safeArg(c.args.change) || pick(c.results, 'upcoming_changes.records.0.number') || pick(c.results, 'open_changes.records.0.number') || null }), limit: 12000, why: 'no change given and no open change', urls: { change: 'change_request', potential_conflicts: 'change_request', recent_changes: 'change_request', open_incidents: 'incident', related_cis: 'cmdb_ci' } },
    { key: 'predicted_risk', tool: 'ml_predict_change_risk', args: (c) => {
      const id = pick(c.results, 'change_readiness.change.sys_id');
      return id ? { change_sys_id: id } : null;
    }, limit: 3000, why: 'needs the change sys_id' },
  ],
  'ops-deploy': [
    { key: 'update_set', tool: 'list_update_sets', args: (c) => ({ query: c.args.updateset ? `name=${safeArg(c.args.updateset)}^ORsys_id=${safeArg(c.args.updateset)}` : undefined, limit: 5 }), limit: 3000, urls: { update_sets: 'sys_update_set' } },
    { key: 'update_set_changes', query: (c) => {
      const id = pick(c.results, 'update_set.update_sets.0.sys_id') || pick(c.results, 'update_set.records.0.sys_id');
      return id ? { table: 'sys_update_xml', query: `update_set=${id}^ORDERBYtype`, fields: 'sys_id,name,type,target_name,action,sys_updated_on', limit: 150 } : null;
    }, limit: 9000, why: 'update set not found' },
    { key: 'current_update_set', tool: 'get_current_update_set', args: () => ({}), limit: 2000 },
  ],

  // ── Docs ──────────────────────────────────────────────────────────────────
  'docs-app': [
    { key: 'app', tool: 'get_scoped_app', args: (c) => (c.args.app || c.args.scope ? { id: safeArg(c.args.app || c.args.scope) } : null), limit: 4000, why: 'needs --arg app=<scope>' },
    ...(['sys_db_object', 'sys_script', 'sys_script_include', 'sys_script_client', 'sys_ui_policy', 'sys_ui_action', 'sys_security_acl', 'sys_hub_flow', 'sc_cat_item', 'sys_ws_definition'] as const).map((t): PlanStep => ({
      key: `app_${t}`,
      query: (c) => {
        const s = safeArg(c.args.app || c.args.scope);
        return s ? { table: t, query: `sys_scope.scope=${s}^ORsys_scope.name=${s}`, fields: t === 'sys_db_object' ? 'sys_id,name,label,super_class' : 'sys_id,name,sys_updated_on', limit: 40 } : null;
      },
      why: 'needs --arg app=<scope>',
    })),
  ],
  'docs-release': [
    { key: 'update_set', tool: 'list_update_sets', args: (c) => ({ query: c.args.updateset ? `name=${safeArg(c.args.updateset)}^ORsys_id=${safeArg(c.args.updateset)}` : 'state=complete^ORDERBYDESCsys_updated_on', limit: 3 }), limit: 3000, urls: { update_sets: 'sys_update_set' } },
    { key: 'update_set_changes', query: (c) => {
      const id = pick(c.results, 'update_set.update_sets.0.sys_id') || pick(c.results, 'update_set.records.0.sys_id');
      return id ? { table: 'sys_update_xml', query: `update_set=${id}^ORDERBYtype`, fields: 'sys_id,name,type,target_name,action,sys_updated_on,sys_updated_by', limit: 150 } : null;
    }, limit: 10000, why: 'update set not found' },
  ],
  'docs-runbook': [
    { key: 'service', tool: 'service_health', args: (c) => (c.args.service ? { name_or_sysid: c.args.service } : null), limit: 8000, why: 'needs --arg service=<name>' },
    { key: 'cis', tool: 'search_cmdb_ci', args: (c) => (c.args.service ? { query: `nameLIKE${safeArg(c.args.service)}`, limit: 10 } : null), limit: 4000, why: 'needs --arg service=<name>' },
    { key: 'knowledge', tool: 'search_knowledge', args: (c) => (c.args.service ? { query: c.args.service, limit: 8 } : null), limit: 4000, why: 'needs --arg service=<name>' },
    { key: 'recent_incidents', query: (c) => (c.args.service ? { table: 'incident', query: `cmdb_ci.nameLIKE${safeArg(c.args.service)}^ORbusiness_service.nameLIKE${safeArg(c.args.service)}^${recent(90, 'opened_at')}^ORDERBYDESCopened_at`, fields: 'sys_id,number,short_description,priority,state,close_notes', limit: 15 } : null), truncate: { close_notes: 300 }, why: 'needs --arg service=<name>' },
  ],
  'docs-script': [
    { key: 'artifact', tool: 'find_artifact', args: (c) => (c.args.script ? { name: c.args.script, limit: 5 } : null), limit: 4000, why: 'needs --arg script=<name>' },
    { key: 'script_include', tool: 'get_script_include', args: (c) => (c.args.script ? { sys_id_or_name: c.args.script } : null), limit: 9000, why: 'needs --arg script=<name>' },
    { key: 'references', tool: 'find_script_references', args: (c) => (c.args.script ? { name: c.args.script, limit: 25 } : null), limit: 5000, why: 'needs --arg script=<name>' },
  ],

  // ── New skills ────────────────────────────────────────────────────────────
  'ai-governance-audit': [
    { key: 'otto_status', tool: 'get_otto_status', limit: 5000 },
    { key: 'ai_assets', tool: 'list_ai_assets', args: () => ({ limit: 30 }), limit: 7000 },
    { key: 'ai_approval_requests', tool: 'list_ai_approval_requests', args: () => ({ limit: 15 }), limit: 4000 },
    { key: 'ai_model_providers', tool: 'get_ai_model_providers', args: () => ({ limit: 25 }), limit: 9000 },
    { key: 'agent_access_matrix', tool: 'get_agent_access_matrix', args: () => ({ limit: 60 }), limit: 12000 },
    { key: 'ai_policies', tool: 'list_ai_policies', args: () => ({ limit: 30 }), limit: 5000 },
    { key: 'external_agents', tool: 'list_external_agents', args: () => ({ limit: 15 }), limit: 5000 },
    step.mcpExposure,
    { key: 'ai_inventory_gaps', tool: 'list_ai_inventory_cis', args: () => ({ mode: 'gaps', limit: 8 }), limit: 5000 },
    { key: 'ai_runtime_30d', tool: 'get_ai_runtime_metrics', args: () => ({ days: 30, limit: 8 }), limit: 6000 },
    { key: 'ai_usage', tool: 'get_ai_usage', limit: 4000 },
  ],
  'process-insights': [
    { key: 'process_mining_projects', tool: 'list_process_mining_projects', args: () => ({ limit: 30 }), limit: 6000 },
    { key: 'process_mining_findings', tool: 'get_process_mining_findings', args: (c) => ({ project: c.args.project || undefined, limit: 40 }), limit: 10000 },
    { key: 'reassignment_by_group_90d', stats: (c) => ({ table: tableOr(c, 'incident'), query: `${recent(90, 'sys_created_on')}^assignment_groupISNOTEMPTY`, groupBy: 'assignment_group', avgFields: ['reassignment_count', 'reopen_count'] }), limit: 5000 },
    { key: 'volume_by_category_90d', stats: (c) => ({ table: tableOr(c, 'incident'), query: recent(90, 'sys_created_on'), groupBy: 'category' }), limit: 3000 },
    { key: 'state_mix_90d', stats: (c) => ({ table: tableOr(c, 'incident'), query: recent(90, 'sys_created_on'), groupBy: 'state' }), limit: 2000 },
    { key: 'most_reassigned', query: (c) => ({ table: tableOr(c, 'incident'), query: `${recent(90, 'sys_created_on')}^reassignment_count>=3^ORDERBYDESCreassignment_count`, fields: 'sys_id,number,short_description,reassignment_count,assignment_group,state', limit: 10, displayValue: 'all' }) },
  ],
  'integration-auth-audit': [
    step.authPosture,
    { key: 'credential_aliases', tool: 'list_credential_aliases', args: () => ({ limit: 40 }), limit: 4000 },
    { key: 'rest_messages', tool: 'list_rest_messages', args: () => ({ limit: 30 }), limit: 4000 },
    { key: 'basic_auth_rest_messages', query: { table: 'sys_rest_message_fn', query: 'authentication_type=basic', fields: 'sys_id,name,rest_message,rest_endpoint,authentication_type', limit: 25 }, why: 'outbound REST methods that use Basic auth' },
    step.mcpExposure,
    { key: 'inbound_api_users_by_last_login', query: { table: 'sys_user', query: 'active=true^web_service_access_only=true^ORDERBYlast_login_time', fields: 'sys_id,user_name,last_login_time,locked_out', limit: 30 } },
  ],
  'atf-coverage': [
    { key: 'atf_code_coverage', tool: 'get_atf_code_coverage', args: (c) => ({ changed_days: Number(c.args.days) || 90, limit: 25 }), limit: 12000 },
    { key: 'atf_suites', tool: 'list_atf_suites', args: () => ({ active: true, limit: 25 }), limit: 4000 },
    { key: 'recent_test_results', query: { table: 'sys_atf_test_result', query: `${recent(90, 'sys_created_on')}^ORDERBYDESCsys_created_on`, fields: 'sys_id,test,status,output,start_time,run_time', limit: 20, displayValue: 'all' }, truncate: { output: 200 } },
    { key: 'tests_by_table', stats: { table: 'sys_atf_test', query: 'active=true', groupBy: 'sys_scope' }, limit: 3000 },
  ],
  'table-execution-order': [
    { key: 'trace', tool: 'trace_table_operation', args: (c) => ({ table: tableOr(c, 'incident'), operation: c.args.operation || 'update', max_per_stage: 40 }), limit: 16000 },
    { key: 'trace_insert', tool: 'trace_table_operation', args: (c) => (c.args.operation ? null : { table: tableOr(c, 'incident'), operation: 'insert', max_per_stage: 20 }), limit: 10000, why: 'an operation was given' },
    { key: 'same_order_collisions', stats: (c) => ({ table: 'sys_script', query: `collection=${tableOr(c, 'incident')}^active=true`, groupBy: 'when,order' }), limit: 3000 },
  ],
  'csdm-data-foundations': [
    { key: 'data_foundations', tool: 'get_cmdb_data_foundations', args: () => ({ limit: 5 }), limit: 26000 },
    { key: 'csdm_health', tool: 'get_csdm_health', args: () => ({ limit: 8 }), limit: 10000 },
    { key: 'life_cycle_by_stage', stats: { table: 'cmdb_ci', groupBy: 'life_cycle_stage' } },
    { key: 'install_status_mix', stats: { table: 'cmdb_ci', groupBy: 'install_status' } },
    { key: 'stale_operational', tool: 'cmdb_find_stale', args: () => ({ lifecycle_model: 'either', limit: 10 }), limit: 4000 },
    { key: 'ai_inventory_cis', tool: 'list_ai_inventory_cis', args: () => ({ mode: 'gaps', limit: 5 }), limit: 4000 },
  ],
  'mcp-exposure-review': [
    step.mcpExposure,
    { key: 'external_agents', tool: 'list_external_agents', args: () => ({ limit: 15 }), limit: 5000 },
    { key: 'external_agent_runs', tool: 'list_external_agent_runs', args: () => ({ limit: 15 }), limit: 4000 },
    { key: 'a2a_agent_access', tool: 'get_agent_access_matrix', args: () => ({ limit: 150 }), limit: 9000 },
    step.authPosture,
    { key: 'mcp_usage_30d', tool: 'get_ai_runtime_metrics', args: () => ({ days: 30, limit: 8 }), limit: 5000 },
  ],
};

function stepScriptsRecent(table: string, key: string, fields: string): PlanStep {
  return {
    key,
    query: (c) => ({
      table,
      query: `${scopeQ(c)}active=true^${customBy}^${recent(Number(c.args.days) || 180)}^ORDERBYDESCsys_updated_on`,
      fields: `${fields},sys_updated_on,sys_updated_by`,
      limit: 6,
    }),
    truncate: { script: 1500 },
    limit: 12000,
  };
}

/** Steps that could not run need a short human reason. */
function reason(err: unknown): string {
  const m = (err instanceof Error ? err.message : String(err)).split('\n')[0]!;
  if (/invalid table/i.test(m) || /not available/i.test(m) || /PLUGIN/.test(m)) return `not available on this instance: ${m.slice(0, 160)}`;
  if (/401|403|not authori[sz]ed|ACL|access/i.test(m)) return `no access for this account: ${m.slice(0, 160)}`;
  return m.slice(0, 200);
}

function truncateFields(records: any[], spec?: Record<string, number>): any[] {
  if (!spec) return records;
  return records.map((r) => {
    const out = { ...r };
    for (const [f, n] of Object.entries(spec)) {
      const v = val(out[f]);
      if (typeof v === 'string' && v.length > n) out[f] = `${v.slice(0, n)}... (${v.length} chars)`;
    }
    return out;
  });
}

function isEmpty(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if (Array.isArray(o.records)) return o.records.length === 0;
    return Object.keys(o).length === 0;
  }
  return false;
}

export interface GatherDeps {
  runTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  isReadOnlyTool: (name: string) => boolean;
}

/**
 * Run a capability's data plan. Returns the gathered sections plus a coverage list. Write tools are
 * never run: a step that names one is reported as skipped.
 */
export async function gatherPlan(
  client: ServiceNowClient,
  capability: string,
  ctxIn: { args: Record<string, string>; table: string },
  deps: GatherDeps,
): Promise<{ results: Record<string, unknown>; coverage: CoverageEntry[]; limits: Record<string, number> }> {
  const plan = DATA_PLANS[capability] ?? [];
  const results: Record<string, unknown> = {};
  const coverage: CoverageEntry[] = [];
  const limits: Record<string, number> = {};
  const ctx: PlanContext = { args: ctxIn.args, table: ctxIn.table, results };
  const url = (t: string, id: string) => client.recordUrl(t, id);

  for (const s of plan) {
    if (s.limit) limits[s.key] = s.limit;
    try {
      if ('tool' in s) {
        if (!deps.isReadOnlyTool(s.tool)) {
          coverage.push({ key: s.key, status: 'skipped', detail: `${s.tool} changes data and is never run in direct mode` });
          continue;
        }
        const a = s.args ? s.args(ctx) : {};
        if (a === null || Object.values(a).some((v) => v === null)) {
          coverage.push({ key: s.key, status: 'skipped', detail: s.why ?? 'a required argument is missing' });
          continue;
        }
        const out = await deps.runTool(s.tool, a);
        addUrls(client, out, { ...(TOOL_URLS[s.tool] ?? {}), ...(s.urls ?? {}) });
        results[s.key] = out;
        coverage.push({ key: s.key, status: isEmpty(out) ? 'empty' : 'gathered', detail: s.tool });
      } else if ('query' in s) {
        const q = typeof s.query === 'function' ? s.query(ctx) : s.query;
        if (!q) {
          coverage.push({ key: s.key, status: 'skipped', detail: s.why ?? 'a required argument is missing' });
          continue;
        }
        const r = await client.queryRecords({ table: q.table, query: q.query, fields: q.fields, limit: q.limit ?? 25, ...(q.displayValue ? { displayValue: q.displayValue } : {}) });
        const recTable = s.urlTable ?? q.table;
        const records = truncateFields(r.records, s.truncate).map((rec: any) => {
          const id = val(rec.sys_id);
          return id && SYS_ID_RE.test(String(id)) ? { ...rec, record_url: url(recTable, String(id)) } : rec;
        });
        results[s.key] = { table: q.table, count: records.length, list_url: listUrlFor(client, q.table, q.query ?? ''), records, ...(s.why ? { about: s.why } : {}) };
        coverage.push({ key: s.key, status: records.length ? 'gathered' : 'empty', detail: q.table });
      } else {
        const st = typeof s.stats === 'function' ? s.stats(ctx) : s.stats;
        if (!st) {
          coverage.push({ key: s.key, status: 'skipped', detail: s.why ?? 'a required argument is missing' });
          continue;
        }
        const rows = await client.runStats(st.table, { query: st.query, groupBy: st.groupBy, avgFields: st.avgFields, sumFields: st.sumFields, displayValue: true });
        const out = rows.map((r: any) => {
          const o: Record<string, unknown> = {};
          for (const g of r.groupby_fields || []) o[g.field] = g.display_value || g.value || '';
          o.count = Number(r.stats?.count ?? 0);
          for (const [k, v] of Object.entries(r.stats?.avg || {})) o[`avg_${k}`] = Math.round((Number(v) || 0) * 100) / 100;
          for (const [k, v] of Object.entries(r.stats?.sum || {})) o[`sum_${k}`] = Number(v) || 0;
          return o;
        }).sort((a, b) => Number(b.count) - Number(a.count)).slice(0, 40);
        results[s.key] = { table: st.table, ...(st.query ? { query: st.query, list_url: listUrlFor(client, st.table, st.query) } : {}), ...(s.why ? { about: s.why } : {}), rows: out };
        coverage.push({ key: s.key, status: out.length && out.some((o) => Number(o.count) > 0) ? 'gathered' : 'empty', detail: st.table });
      }
    } catch (err) {
      coverage.push({ key: s.key, status: 'failed', detail: reason(err) });
    }
  }
  return { results, coverage, limits };
}

/** Where the records in common list tools live, so their rows get a record_url. */
const TOOL_URLS: Record<string, Record<string, string>> = {
  list_acls: { acls: 'sys_security_acl' },
  list_scheduled_jobs: { records: 'sysauto_script', jobs: 'sysauto_script' },
  list_update_sets: { update_sets: 'sys_update_set' },
  list_flows: { flows: 'sys_hub_flow', records: 'sys_hub_flow' },
  list_subflows: { subflows: 'sys_hub_flow', records: 'sys_hub_flow' },
  list_rest_messages: { records: 'sys_rest_message', rest_messages: 'sys_rest_message' },
  list_credential_aliases: { records: 'sys_alias', aliases: 'sys_alias' },
  list_client_scripts: { records: 'sys_script_client', client_scripts: 'sys_script_client' },
  list_business_rules: { records: 'sys_script', business_rules: 'sys_script' },
  list_ui_policies: { records: 'sys_ui_policy', ui_policies: 'sys_ui_policy' },
  list_atf_suites: { records: 'sys_atf_test_suite', suites: 'sys_atf_test_suite' },
  list_catalog_items: { records: 'sc_cat_item', items: 'sc_cat_item' },
  list_catalog_categories: { records: 'sc_category', categories: 'sc_category' },
  list_portal_widgets: { records: 'sp_widget', widgets: 'sp_widget' },
  list_scoped_apps: { records: 'sys_app', apps: 'sys_app' },
  list_mid_servers: { records: 'ecc_agent', mid_servers: 'ecc_agent' },
  list_uib_pages: { records: 'sys_ux_page_registry', pages: 'sys_ux_page_registry' },
  search_cmdb_ci: { records: 'cmdb_ci' },
  search_knowledge: { records: 'kb_knowledge', articles: 'kb_knowledge' },
  cmdb_find_stale: { stale_cis: 'cmdb_ci' },
  cmdb_find_orphans: { orphans: 'cmdb_ci' },
  list_ai_agents: { agents: 'sn_aia_agent' },
};

/** Add record_url to rows (or one object) at the given top-level keys when they carry a sys_id. */
export function addUrls(client: ServiceNowClient, out: unknown, map: Record<string, string>): void {
  if (!out || typeof out !== 'object') return;
  const o = out as Record<string, any>;
  const tag = (rec: any, table: string) => {
    if (!rec || typeof rec !== 'object' || rec.record_url) return;
    const id = val(rec.sys_id);
    if (id && SYS_ID_RE.test(String(id))) rec.record_url = client.recordUrl(table, String(id));
  };
  for (const [key, table] of Object.entries(map)) {
    const v = o[key];
    if (Array.isArray(v)) v.forEach((r) => tag(r, table));
    else tag(v, table);
  }
  // duplicates groups nest records
  if (Array.isArray(o.duplicates)) for (const g of o.duplicates) if (Array.isArray(g?.records)) g.records.forEach((r: any) => tag(r, 'cmdb_ci'));
}

function listUrlFor(client: ServiceNowClient, table: string, query: string): string {
  const base = String((client as any).instanceUrl ?? '').replace(/\/$/, '');
  return `${base}/${table}_list.do${query ? `?sysparm_query=${encodeURIComponent(query.replace(/\^ORDERBY.*$/, ''))}` : ''}`;
}

/** Keys a capability's plan produces, for the prompt and for tests. */
export function planKeys(capability: string): string[] {
  return (DATA_PLANS[capability] ?? []).map((s) => s.key);
}

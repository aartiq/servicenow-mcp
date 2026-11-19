/**
 * Platform insight tools: release awareness, Process Mining, ATF code coverage, the order in which
 * logic runs for one table operation, integration authentication posture, CSDM health and MCP
 * exposure. They gather the data the matching Apex skills report on, and work on their own in MCP.
 *
 * All read-only (Tier 0). Sections degrade to notes when a table is missing or not readable.
 */
import type { ServiceNowClient } from '../servicenow/client.js';
import { ServiceNowError } from '../utils/errors.js';
import { readBuildTag, releaseContext } from '../servicenow/release.js';

const READ = { readOnlyHint: true, openWorldHint: true } as const;
const TABLE_RE = /^[a-z0-9_]+$/i;

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

function tableArg(v: unknown, field = 'table'): string {
  const s = String(v ?? '').trim();
  if (!s || !TABLE_RE.test(s)) throw new ServiceNowError(`${field} must be a table name`, 'INVALID_REQUEST');
  return s;
}

function recUrl(client: ServiceNowClient, table: string, id: unknown): string | undefined {
  const s = String(val(id) ?? '');
  return s && typeof (client as any).recordUrl === 'function' ? client.recordUrl(table, s) : undefined;
}

/** A clickable list view link for a table and encoded query. */
export function listUrl(client: ServiceNowClient, table: string, query = ''): string {
  const base = String((client as any).instanceUrl ?? '').replace(/\/$/, '');
  return `${base}/${table}_list.do${query ? `?sysparm_query=${encodeURIComponent(query)}` : ''}`;
}

async function soft(client: ServiceNowClient, params: Parameters<ServiceNowClient['queryRecords']>[0]): Promise<{ records: any[]; note?: string }> {
  try {
    return { records: (await client.queryRecords(params)).records };
  } catch (err) {
    return { records: [], note: `${params.table}: ${/invalid table/i.test(errText(err)) ? 'not available on this instance' : errText(err)}` };
  }
}

async function countOf(client: ServiceNowClient, table: string, query = ''): Promise<number | string> {
  try {
    const rows = await client.runStats(table, { query });
    return Number(rows[0]?.stats?.count ?? 0);
  } catch (err) {
    return /invalid table/i.test(errText(err)) ? 'not available' : 'no access';
  }
}

async function groupOf(client: ServiceNowClient, table: string, field: string, query = ''): Promise<Array<{ value: string; count: number }>> {
  try {
    const rows = await client.runStats(table, { query, groupBy: field, displayValue: true });
    return rows
      .map((r: any) => ({ value: String(r.groupby_fields?.[0]?.display_value ?? r.groupby_fields?.[0]?.value ?? '') || '(empty)', count: Number(r.stats?.count ?? 0) }))
      .sort((a, b) => b.count - a.count);
  } catch {
    return [];
  }
}

const num = (v: number | string) => (typeof v === 'number' ? v : 0);

// ─── Tool definitions ────────────────────────────────────────────────────────

export function getPlatformInsightsToolDefinitions() {
  return [
    {
      name: 'get_release_info',
      description: 'Which ServiceNow release the instance runs (glide.buildtag.last: family, patch, hotfix), the next family, and the known breaking or behaviour changes on the way (Australia, Brazil), each with a live count of what on this instance it could affect and a list link. Also the recent upgrade history (sys_upgrade_history). Read-only',
      inputSchema: {
        type: 'object',
        properties: {
          target_release: { type: 'string', description: 'Target family, e.g. "brazil". Default: the next family after the current one' },
          include_checks: { type: 'boolean', description: 'Count what each known change could affect on this instance (default true)' },
        },
        required: [],
      },
      annotations: READ,
    },
    {
      name: 'list_process_mining_projects',
      description: 'Process Mining (Process Intelligence) projects (promin_project): table, status, when last mined, templates, and how many automated findings each has. Read-only',
      inputSchema: {
        type: 'object',
        properties: {
          include_templates: { type: 'boolean', description: 'Include template projects (default false)' },
          limit: { type: 'number', description: 'Max projects (default 50)' },
        },
        required: [],
      },
      annotations: READ,
    },
    {
      name: 'get_process_mining_findings',
      description: 'Process Mining findings: automated findings (promin_automated_finding: rework, extra steps, extreme durations, with impacted KPIs, table and field), finding definitions (promin_finding_def) and AI analysis results (promin_gen_ai_analysis_result), for one project or all. Read-only',
      inputSchema: {
        type: 'object',
        properties: {
          project: { type: 'string', description: 'Project sys_id, number (PRO...) or name. Omit for all projects' },
          limit: { type: 'number', description: 'Max rows per list (default 50)' },
        },
        required: [],
      },
      annotations: READ,
    },
    {
      name: 'get_atf_code_coverage',
      description: 'ATF code coverage (sys_atf_code_coverage, Australia and later): covered and executable lines per business rule, script include and other script, merged across test runs, with coverage percent and the tests that hit each script. Also lists scripts changed recently that no test covers, and ATF test, suite and Test Generator totals. Read-only',
      inputSchema: {
        type: 'object',
        properties: {
          script_table: { type: 'string', description: 'Only one script table, e.g. sys_script or sys_script_include' },
          changed_days: { type: 'number', description: 'Window for "recently changed and untested" scripts (default 90)' },
          limit: { type: 'number', description: 'Max scripts per list (default 30)' },
        },
        required: [],
      },
      annotations: READ,
    },
    {
      name: 'trace_table_operation',
      description: 'Everything that runs for one operation on a table, in order: ACLs (Deny Unless first), before business rules, the database write, after business rules, assignment rules, SLA definitions, notifications, Flow Designer record triggers, legacy workflows, and async business rules. Includes rules inherited from parent tables (for example task for incident), links to each record, and a Mermaid diagram. Read-only',
      inputSchema: {
        type: 'object',
        properties: {
          table: { type: 'string', description: 'Table name, e.g. incident' },
          operation: { type: 'string', enum: ['insert', 'update', 'delete', 'query'], description: 'Operation to trace (default update)' },
          include_inactive: { type: 'boolean', description: 'Also list inactive items (default false)' },
          max_per_stage: { type: 'number', description: 'Max items listed per stage (default 20). The summary always counts them all' },
        },
        required: ['table'],
      },
      annotations: READ,
    },
    {
      name: 'get_integration_auth_posture',
      description: 'Inbound integration authentication posture: the Basic auth restriction properties (Brazil allowlist with tracking and enforce modes), accounts allowed to keep Basic auth (snc_basic_auth_api_access role, web service access only users), the Basic auth usage tracker when readable, OAuth clients by grant type and token format (JWT is needed for MCP and A2A), CIMD clients, credential aliases and recent failed logins. Read-only',
      inputSchema: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Max rows per list (default 25)' },
        },
        required: [],
      },
      annotations: READ,
    },
    {
      name: 'get_csdm_health',
      description: 'CSDM 5 health by domain, with a 0 to 100 score each and links: Design (business applications, product models), Build and integration, Service delivery (service instances, formerly application services, and technical services), Service consumption (business services, offerings), Foundation, life cycle stage adoption (life_cycle_stage vs legacy status, migration properties), relationships, CMDB data management and certification policies, and AI and MCP CIs. Read-only',
      inputSchema: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Max sample records per gap list (default 10)' },
        },
        required: [],
      },
      annotations: READ,
    },
    {
      name: 'get_cmdb_data_foundations',
      description: 'ServiceNow\'s own CMDB and CSDM Data Foundations scores (plugin com.snc.cmdb.getwell): each metric\'s result percent, failing record count, priority, CMDB tab or CSDM stage (Foundation, Crawl, Walk, Run, Fly) and the ServiceNow KB remediation playbook link, plus the drill-down tables (for example application services missing a business application, duplicate locations) with counts, list links and sample CIs. Read-only',
      inputSchema: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Max sample CIs per drill-down table (default 5)' },
        },
        required: [],
      },
      annotations: READ,
    },
    {
      name: 'get_mcp_exposure',
      description: 'What the instance exposes to outside AI and what outside AI it calls: MCP Server Console servers and their tools (with tools that look write-capable flagged), the external MCP server registry, A2A-exposed agents, external agent providers, OAuth clients that can reach them (token format, grant type), MCP roles and the agent MCP and external agent properties. Read-only',
      inputSchema: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Max rows per list (default 50)' },
        },
        required: [],
      },
      annotations: READ,
    },
  ];
}

// ─── Release info ────────────────────────────────────────────────────────────

const CHANGE_CHECKS: Array<{ match: RegExp; table: string; query: string; label: string }> = [
  { match: /GlideElementDynamicAttribute/, table: 'sys_script_include', query: 'active=true^scriptLIKEGlideElementDynamicAttribute', label: 'script includes that use GlideElementDynamicAttribute' },
  { match: /GlideElementDynamicAttribute/, table: 'sys_script', query: 'active=true^scriptLIKEGlideElementDynamicAttribute', label: 'business rules that use GlideElementDynamicAttribute' },
  { match: /strict read-only/, table: 'sys_script_client', query: 'active=true^scriptLIKEsetReadOnly^scriptLIKEsetValue', label: 'client scripts that both set read-only and set values' },
  { match: /Performance Analytics/, table: 'pa_dashboards', query: 'active=true', label: 'active legacy Performance Analytics dashboards' },
  { match: /UI11 and UI15/, table: 'sys_portal_page', query: '', label: 'Core UI homepages' },
  { match: /getRefRecord/, table: 'sys_script_include', query: 'active=true^scriptLIKEgetRefRecord^sys_scope!=global', label: 'scoped script includes that call getRefRecord() (all apps, including ServiceNow apps)' },
  { match: /getRefRecord/, table: 'sys_script', query: 'active=true^scriptLIKEgetRefRecord^sys_scope!=global', label: 'scoped business rules that call getRefRecord() (all apps, including ServiceNow apps)' },
  { match: /Basic auth/, table: 'sys_user', query: 'active=true^web_service_access_only=true', label: 'active web service access only users' },
  { match: /missing role|does not exist/, table: 'sys_security_acl_role', query: 'sys_user_role.nameISEMPTY^sys_security_acl.active=true', label: 'active ACL role links to roles that do not exist' },
  { match: /deny-by-default/, table: 'sn_aia_agent', query: '', label: 'AI agents (check each has an execute ACL)' },
  { match: /TinyMCE/, table: 'sys_properties', query: 'nameLIKEtinymce', label: 'TinyMCE properties' },
];

export async function getReleaseInfo(client: ServiceNowClient, args: Record<string, any>): Promise<Record<string, any>> {
  const tag = await readBuildTag(client).catch(() => '');
  const ctx = releaseContext(tag, args.target_release ? String(args.target_release) : undefined);
  const history = await soft(client, {
    table: 'sys_upgrade_history',
    query: 'ORDERBYDESCupgrade_started',
    fields: 'sys_id,from_version,to_version,upgrade_started,upgrade_finished,skipped,skipped_and_different,skipped_manual_merge,skipped_error,changes_applied',
    limit: 5,
  });
  const out: Record<string, any> = {
    ...ctx,
    upgrade_history: history.records.map((h: any) => ({
      from: val(h.from_version), to: val(h.to_version), started: val(h.upgrade_started), finished: val(h.upgrade_finished),
      skipped: Number(val(h.skipped)) || 0, skipped_and_different: Number(val(h.skipped_and_different)) || 0, manual_merge: Number(val(h.skipped_manual_merge)) || 0, errors: Number(val(h.skipped_error)) || 0,
      record_url: recUrl(client, 'sys_upgrade_history', h.sys_id),
    })),
    upgrade_history_note: history.note ?? 'Skipped-record details (sys_upgrade_history_log) need an admin account; use the Upgrade Center for dispositions.',
  };
  if (args.include_checks !== false && ctx.changes_to_check.length) {
    const checks = CHANGE_CHECKS.filter((c) => ctx.changes_to_check.some((ch) => c.match.test(`${ch.change} ${ch.check}`)));
    const counts = await Promise.all(checks.map((c) => countOf(client, c.table, c.query)));
    out.instance_checks = checks.map((c, i) => ({ what: c.label, table: c.table, count: counts[i], list_url: listUrl(client, c.table, c.query) }));
  }
  return out;
}

// ─── Process Mining ──────────────────────────────────────────────────────────

const PM_PLUGIN = 'Process Mining (Process Intelligence, plugin sn_po)';

export async function listProcessMiningProjects(client: ServiceNowClient, args: Record<string, any>): Promise<Record<string, any>> {
  const max = lim(args.limit, 50);
  const q = [args.include_templates ? '' : 'is_template=false', 'ORDERBYDESCsys_updated_on'].filter(Boolean).join('^');
  let projects;
  try {
    projects = await client.queryRecords({ table: 'promin_project', query: q, fields: 'sys_id,number,name,short_description,status,state,source,last_mined_time,is_template,error_message,goal,sys_updated_on', limit: max, displayValue: 'all' });
  } catch (err) {
    if (/invalid table/i.test(errText(err))) throw new ServiceNowError(`promin_project is not available. It needs ${PM_PLUGIN}.`, 'PLUGIN_NOT_INSTALLED');
    throw err;
  }
  const findings = await (async () => {
    try {
      const rows = await client.runStats('promin_automated_finding', { groupBy: 'project', query: 'active=true' });
      return new Map(rows.map((r: any) => [String(r.groupby_fields?.[0]?.value ?? ''), Number(r.stats?.count ?? 0)]));
    } catch {
      return new Map<string, number>();
    }
  })();
  const list = projects.records.map((p: any) => {
    const id = String(val(p.sys_id));
    const mined = String(val(p.last_mined_time) ?? '');
    return {
      number: disp(p.number), name: disp(p.name), description: disp(p.short_description) || null, status: disp(p.status), state: disp(p.state), source: disp(p.source),
      template: val(p.is_template) === 'true', last_mined: mined || null, mined: !!mined, error: disp(p.error_message) || null, goal: disp(p.goal) || null,
      automated_findings: findings.get(id) ?? 0, sys_id: id, record_url: recUrl(client, 'promin_project', id),
    };
  });
  return {
    count: list.length,
    summary: { projects: list.length, never_mined: list.filter((p) => !p.mined).length, with_errors: list.filter((p) => p.error).length, total_automated_findings: [...findings.values()].reduce((a, b) => a + b, 0) },
    projects: list,
  };
}

export async function getProcessMiningFindings(client: ServiceNowClient, args: Record<string, any>): Promise<Record<string, any>> {
  const max = lim(args.limit, 50);
  let projectId = '';
  let projectName: string | null = null;
  if (args.project) {
    const ref = safe(args.project, 'project');
    const pq = /^[0-9a-f]{32}$/i.test(ref) ? `sys_id=${ref}` : `number=${ref}^ORname=${ref}`;
    const p = await soft(client, { table: 'promin_project', query: pq, fields: 'sys_id,name', limit: 1 });
    if (!p.records[0]) throw new ServiceNowError(`Process Mining project "${ref}" not found${p.note ? ` (${p.note})` : ''}`, 'NOT_FOUND');
    projectId = String(val(p.records[0].sys_id));
    projectName = String(disp(p.records[0].name));
  }
  const pf = projectId ? `project=${projectId}^` : '';
  const [auto, defs, ai, byType, byCategory] = await Promise.all([
    soft(client, { table: 'promin_automated_finding', query: `${pf}active=true^ORDERBYcategory`, fields: 'sys_id,name,project,type,category,table,field,impacted_kpis,process_def', limit: max, displayValue: 'all' }),
    soft(client, { table: 'promin_finding_def', query: `${pf}active=true`, fields: 'sys_id,message,type,category,subcategory,project,impacted_kpis', limit: max, displayValue: 'all' }),
    soft(client, { table: 'promin_gen_ai_analysis_result', query: 'ORDERBYDESCsys_created_on', fields: 'sys_id,analysis_type,analysis_identifier,llm_response_text,sys_created_on', limit: Math.min(max, 10), displayValue: 'all' }),
    groupOf(client, 'promin_automated_finding', 'type', `${pf}active=true`),
    groupOf(client, 'promin_automated_finding', 'category', `${pf}active=true`),
  ]);
  if (auto.note && /not available/.test(auto.note)) throw new ServiceNowError(`Process Mining tables are not available. They need ${PM_PLUGIN}.`, 'PLUGIN_NOT_INSTALLED');
  const notes = [auto.note, defs.note, ai.note].filter(Boolean);
  return {
    project: projectName,
    by_type: byType,
    by_category: byCategory,
    automated_findings: auto.records.map((f: any) => ({
      name: disp(f.name), project: disp(f.project), type: disp(f.type), category: disp(f.category), table: val(f.table), field: val(f.field), impacted_kpis: disp(f.impacted_kpis) || null, record_url: recUrl(client, 'promin_automated_finding', f.sys_id),
    })),
    finding_definitions: defs.records.map((d: any) => ({
      message: String(disp(d.message) ?? '').slice(0, 300), type: disp(d.type), category: disp(d.category), subcategory: disp(d.subcategory) || null, project: disp(d.project) || null, record_url: recUrl(client, 'promin_finding_def', d.sys_id),
    })),
    ai_analyses: ai.records.map((a: any) => ({ type: disp(a.analysis_type), at: disp(a.sys_created_on), summary: String(disp(a.llm_response_text) ?? '').slice(0, 800), record_url: recUrl(client, 'promin_gen_ai_analysis_result', a.sys_id) })),
    ...(notes.length ? { notes } : {}),
  };
}

// ─── ATF code coverage ───────────────────────────────────────────────────────

function lineSet(json: unknown): Map<string, Set<number>> {
  const out = new Map<string, Set<number>>();
  let o: any;
  try {
    o = typeof json === 'string' ? JSON.parse(json) : json;
  } catch {
    return out;
  }
  const lines = o?.lines && typeof o.lines === 'object' ? o.lines : {};
  for (const [field, arr] of Object.entries(lines)) {
    if (Array.isArray(arr)) out.set(field, new Set(arr.map(Number).filter((n) => Number.isFinite(n))));
  }
  return out;
}

/** Merge coverage rows into one entry per script: covered / executable lines across all runs. */
export function mergeCoverage(rows: Array<{ table: string; id: string; name: string; covered: unknown; total: unknown; test?: string }>): Array<{ table: string; id: string; name: string; covered_lines: number; executable_lines: number; coverage_pct: number; tests: string[] }> {
  const by = new Map<string, { table: string; id: string; name: string; cov: Map<string, Set<number>>; tot: Map<string, Set<number>>; tests: Set<string> }>();
  for (const r of rows) {
    const key = `${r.table}:${r.id}`;
    const e = by.get(key) ?? { table: r.table, id: r.id, name: r.name, cov: new Map(), tot: new Map(), tests: new Set<string>() };
    for (const [f, s] of lineSet(r.covered)) e.cov.set(f, new Set([...(e.cov.get(f) ?? []), ...s]));
    for (const [f, s] of lineSet(r.total)) e.tot.set(f, new Set([...(e.tot.get(f) ?? []), ...s]));
    if (r.test) e.tests.add(r.test);
    by.set(key, e);
  }
  return [...by.values()].map((e) => {
    let covered = 0;
    let total = 0;
    for (const [f, s] of e.tot) {
      total += s.size;
      const c = e.cov.get(f);
      if (c) for (const n of s) if (c.has(n)) covered += 1;
    }
    return { table: e.table, id: e.id, name: e.name, covered_lines: covered, executable_lines: total, coverage_pct: total ? Math.round((covered / total) * 1000) / 10 : 0, tests: [...e.tests].slice(0, 5) };
  });
}

export async function getAtfCodeCoverage(client: ServiceNowClient, args: Record<string, any>): Promise<Record<string, any>> {
  const max = lim(args.limit, 30, 200);
  const days = lim(args.changed_days, 90, 730);
  const tableFilter = args.script_table ? tableArg(args.script_table, 'script_table') : '';
  let rows;
  try {
    rows = await client.queryRecords({
      table: 'sys_atf_code_coverage',
      query: [tableFilter ? `metadata_table=${tableFilter}` : '', 'state=complete'].filter(Boolean).join('^'),
      fields: 'metadata_table,metadata_id,coverage,total_executable_info,sys_atf_test_result',
      limit: 5000,
      displayValue: 'all',
    });
  } catch (err) {
    if (/invalid table/i.test(errText(err))) throw new ServiceNowError('sys_atf_code_coverage is not available. ATF code coverage needs Australia or later.', 'PLUGIN_NOT_INSTALLED');
    throw err;
  }
  const merged = mergeCoverage(rows.records.map((r: any) => ({
    table: String(val(r.metadata_table) ?? ''), id: String(val(r.metadata_id) ?? ''), name: String(disp(r.metadata_id) ?? ''),
    covered: val(r.coverage), total: val(r.total_executable_info), test: String(disp(r.sys_atf_test_result) ?? '') || undefined,
  }))).map((m) => ({ ...m, record_url: recUrl(client, m.table, m.id) }));
  const byTable = new Map<string, { scripts: number; covered: number; executable: number }>();
  for (const m of merged) {
    const e = byTable.get(m.table) ?? { scripts: 0, covered: 0, executable: 0 };
    e.scripts += 1; e.covered += m.covered_lines; e.executable += m.executable_lines;
    byTable.set(m.table, e);
  }
  const coveredIds = new Set(merged.map((m) => m.id));
  const scriptTables = tableFilter ? [tableFilter] : ['sys_script', 'sys_script_include'];
  const recent = await Promise.all(scriptTables.map((t) => soft(client, {
    table: t,
    query: `active=true^sys_updated_on>=javascript:gs.daysAgoStart(${days})^sys_updated_by!=maint^sys_updated_by!=system^ORDERBYDESCsys_updated_on`,
    fields: t === 'sys_script' ? 'sys_id,name,collection,sys_updated_on,sys_updated_by,sys_scope' : 'sys_id,name,api_name,sys_updated_on,sys_updated_by,sys_scope',
    limit: 200,
    displayValue: 'all',
  })));
  const untested = recent.flatMap((r, i) => r.records
    .filter((x: any) => !coveredIds.has(String(val(x.sys_id))))
    .map((x: any) => ({ table: scriptTables[i], name: disp(x.name), on: disp(x.collection) || disp(x.api_name) || null, updated: disp(x.sys_updated_on), by: disp(x.sys_updated_by), scope: disp(x.sys_scope), record_url: recUrl(client, scriptTables[i]!, x.sys_id) })));
  const [tests, suites, generated, results] = await Promise.all([
    countOf(client, 'sys_atf_test', 'active=true'),
    countOf(client, 'sys_atf_test_suite', 'active=true'),
    countOf(client, 'sn_atf_tg_generated_test'),
    groupOf(client, 'sys_atf_test_result', 'status', `sys_created_on>=javascript:gs.daysAgoStart(${days})`),
  ]);
  const totals = [...byTable.entries()].map(([table, e]) => ({ table, scripts_with_coverage: e.scripts, covered_lines: e.covered, executable_lines: e.executable, coverage_pct: e.executable ? Math.round((e.covered / e.executable) * 1000) / 10 : 0 }));
  return {
    summary: {
      scripts_with_coverage_data: merged.length,
      coverage_rows: rows.records.length,
      active_tests: tests,
      active_suites: suites,
      test_generator_tests: generated,
      recent_scripts_without_coverage: untested.length,
      changed_window_days: days,
    },
    by_script_table: totals,
    test_results_in_window: results,
    lowest_coverage: [...merged].sort((a, b) => a.coverage_pct - b.coverage_pct || b.executable_lines - a.executable_lines).slice(0, max),
    highest_coverage: [...merged].sort((a, b) => b.coverage_pct - a.coverage_pct).slice(0, Math.min(10, max)),
    recently_changed_without_coverage: untested.slice(0, max),
    notes: [
      'Coverage is recorded when ATF runs with code coverage on (Australia and later). Scripts never run under coverage do not appear here at all.',
      ...recent.map((r) => r.note).filter(Boolean) as string[],
    ],
  };
}

// ─── Table operation trace ───────────────────────────────────────────────────

/** The table and its parents, nearest first (incident -> task). */
export async function tableHierarchy(client: ServiceNowClient, table: string): Promise<string[]> {
  const chain = [table];
  let current = table;
  for (let i = 0; i < 8; i++) {
    const r = await soft(client, { table: 'sys_db_object', query: `name=${current}`, fields: 'name,super_class.name', limit: 1 });
    const parent = r.records[0] ? String(val(r.records[0]['super_class.name']) ?? '') : '';
    if (!parent || chain.includes(parent)) break;
    chain.push(parent);
    current = parent;
  }
  return chain;
}

interface TraceStep { stage: string; order: number | null; kind: string; name: string; table: string; detail?: string; active: boolean; record_url?: string }

export function mermaidForTrace(table: string, operation: string, steps: TraceStep[]): string {
  const lines = ['flowchart TD', `  start([${operation} on ${table}])`];
  let prev = 'start';
  const stages = [...new Set(steps.map((s) => s.stage))];
  stages.forEach((stage, i) => {
    const items = steps.filter((s) => s.stage === stage);
    const id = `s${i}`;
    const shown = items.slice(0, 6).map((s) => `${s.kind}: ${s.name}`.replace(/["[\](){}<>|]/g, ' ').trim());
    const more = items.length > 6 ? `<br/>+${items.length - 6} more` : '';
    lines.push(`  ${id}["${stage} (${items.length})<br/>${shown.join('<br/>')}${more}"]`);
    lines.push(`  ${prev} --> ${id}`);
    prev = id;
  });
  return lines.join('\n');
}

export async function traceTableOperation(client: ServiceNowClient, args: Record<string, any>): Promise<Record<string, any>> {
  const table = tableArg(args.table);
  const op = String(args.operation || 'update').toLowerCase();
  if (!['insert', 'update', 'delete', 'query'].includes(op)) throw new ServiceNowError('operation must be insert, update, delete or query', 'INVALID_REQUEST');
  const activeQ = args.include_inactive ? '' : 'active=true^';
  const chain = await tableHierarchy(client, table);
  const tables = chain.join(',');
  const aclOp = { insert: 'create', update: 'write', delete: 'delete', query: 'read' }[op]!;
  const brFlag = `action_${op}=true`;
  const write = op !== 'query';

  const [acls, brs, flows, wfs, notifs, assign, slas, policies] = await Promise.all([
    soft(client, { table: 'sys_security_acl', query: `${activeQ}operation=${aclOp}^nameIN${chain.flatMap((t) => [t, `${t}.*`]).join(',')}^ORname=*^ORDERBYname`, fields: 'sys_id,name,decision_type,advanced,condition,active', limit: 100 }),
    soft(client, { table: 'sys_script', query: `${activeQ}collectionIN${tables}^${brFlag}^ORDERBYorder`, fields: 'sys_id,name,collection,when,order,filter_condition,condition,active,sys_scope', limit: 300, displayValue: 'all' }),
    write ? soft(client, { table: 'sys_flow_record_trigger', query: `tableIN${tables}^on_${op}=true`, fields: 'sys_id,table,condition,run_flow_in', limit: 200 }) : Promise.resolve({ records: [] as any[] }),
    write ? soft(client, { table: 'wf_workflow_version', query: `${activeQ}published=true^tableIN${tables}^ORDERBYorder`, fields: 'sys_id,name,table,condition,order,active', limit: 100 }) : Promise.resolve({ records: [] as any[] }),
    op === 'insert' || op === 'update'
      ? soft(client, { table: 'sysevent_email_action', query: `${activeQ}collectionIN${tables}^action_${op}=true^generation_type=engine`, fields: 'sys_id,name,collection,condition,active', limit: 200 })
      : Promise.resolve({ records: [] as any[] }),
    op === 'insert' || op === 'update' ? soft(client, { table: 'sysrule_assignment', query: `${activeQ}tableIN${tables}^ORDERBYorder`, fields: 'sys_id,name,table,order,active', limit: 50 }) : Promise.resolve({ records: [] as any[] }),
    op === 'insert' || op === 'update' ? soft(client, { table: 'contract_sla', query: `${activeQ}collectionIN${tables}`, fields: 'sys_id,name,collection,active', limit: 100 }) : Promise.resolve({ records: [] as any[] }),
    write ? soft(client, { table: 'sys_data_policy2', query: `${activeQ}model_tableIN${tables}`, fields: 'sys_id,short_description,model_table,active', limit: 50 }) : Promise.resolve({ records: [] as any[] }),
  ]);

  // Flow record triggers link to their flow through sys_hub_flow.remote_trigger_id.
  const trigIds = flows.records.map((t: any) => String(val(t.sys_id)));
  const flowRecs = trigIds.length
    ? await soft(client, { table: 'sys_hub_flow', query: `remote_trigger_idIN${trigIds.join(',')}${args.include_inactive ? '' : '^active=true'}`, fields: 'sys_id,name,active,status,remote_trigger_id,run_as', limit: 300 })
    : { records: [] as any[] };
  const trigById = new Map(flows.records.map((t: any) => [String(val(t.sys_id)), t]));

  const isActive = (r: any) => String(val(r.active)) !== 'false';
  const steps: TraceStep[] = [];
  const aclRecs = acls.records.filter((a: any) => {
    const n = String(val(a.name));
    return n === '*' || chain.includes(n) || chain.some((t) => n === `${t}.*`);
  });
  for (const a of aclRecs.sort((x: any, y: any) => (String(val(y.decision_type)) === 'deny' ? 1 : 0) - (String(val(x.decision_type)) === 'deny' ? 1 : 0))) {
    const deny = String(val(a.decision_type)) === 'deny';
    steps.push({ stage: deny ? '1. ACL: Deny Unless' : '2. ACL: Allow If', order: null, kind: 'ACL', name: String(val(a.name)), table: String(val(a.name)).split('.')[0]!, detail: [String(val(a.advanced)) === 'true' ? 'scripted' : '', String(val(a.condition) ?? '') ? 'has condition' : ''].filter(Boolean).join(', ') || undefined, active: isActive(a), record_url: recUrl(client, 'sys_security_acl', a.sys_id) });
  }
  const when = (r: any) => String(val(r.when) ?? '').toLowerCase();
  const brStage: Record<string, string> = { before: '4. Before business rules', after: '6. After business rules', async: '9. Async business rules', async_always: '9. Async business rules', display: '5. Display business rules' };
  if (write) for (const p of policies.records) steps.push({ stage: '3. Data policies', order: null, kind: 'Data policy', name: String(disp(p.short_description) ?? ''), table: String(val(p.model_table)), active: isActive(p), record_url: recUrl(client, 'sys_data_policy2', p.sys_id) });
  for (const b of brs.records) {
    const w = when(b);
    if (op === 'query' && w !== 'before') continue;
    const stage = op === 'query' ? '4. Before query business rules' : brStage[w] ?? `4. Business rules (${w})`;
    steps.push({ stage, order: Number(val(b.order)) || 0, kind: 'Business rule', name: String(disp(b.name) ?? ''), table: String(val(b.collection)), detail: String(val(b.filter_condition) ?? '') || String(val(b.condition) ?? '') ? 'conditional' : undefined, active: isActive(b), record_url: recUrl(client, 'sys_script', b.sys_id) });
  }
  if (write) steps.push({ stage: `5. Database ${op}`, order: null, kind: 'Engine', name: `${op} committed`, table, active: true });
  for (const a of assign.records) steps.push({ stage: '7. Engines: assignment rules and SLAs', order: Number(val(a.order)) || 0, kind: 'Assignment rule', name: String(val(a.name)), table: String(val(a.table)), active: isActive(a), record_url: recUrl(client, 'sysrule_assignment', a.sys_id) });
  for (const s of slas.records) steps.push({ stage: '7. Engines: assignment rules and SLAs', order: null, kind: 'SLA definition', name: String(val(s.name)), table: String(val(s.collection)), active: isActive(s), record_url: recUrl(client, 'contract_sla', s.sys_id) });
  for (const n of notifs.records) steps.push({ stage: '8. Notifications', order: null, kind: 'Notification', name: String(val(n.name)), table: String(val(n.collection)), detail: String(val(n.condition) ?? '') ? 'conditional' : undefined, active: isActive(n), record_url: recUrl(client, 'sysevent_email_action', n.sys_id) });
  for (const f of flowRecs.records) {
    const t = trigById.get(String(val(f.remote_trigger_id)));
    steps.push({ stage: '10. Flow Designer record triggers', order: null, kind: 'Flow', name: String(val(f.name)), table: t ? String(val(t.table)) : table, detail: [t ? `runs in ${val(t.run_flow_in) || 'background'}` : '', String(val(f.status) ?? ''), t && String(val(t.condition) ?? '').replace(/\^EQ$/, '') ? 'conditional' : ''].filter(Boolean).join(', '), active: isActive(f), record_url: recUrl(client, 'sys_hub_flow', f.sys_id) });
  }
  for (const w of wfs.records) steps.push({ stage: '10. Legacy workflows', order: Number(val(w.order)) || 0, kind: 'Workflow', name: String(val(w.name)), table: String(val(w.table)), active: isActive(w), record_url: recUrl(client, 'wf_workflow_version', w.sys_id) });

  steps.sort((a, b) => {
    const sa = parseInt(a.stage, 10);
    const sb = parseInt(b.stage, 10);
    return sa - sb || (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name);
  });
  const notes = [acls, brs, flows, wfs, notifs, assign, slas, policies, flowRecs].map((x: any) => x.note).filter(Boolean);
  const byStage: Record<string, number> = {};
  for (const s of steps) byStage[s.stage] = (byStage[s.stage] ?? 0) + 1;
  const perStage = lim(args.max_per_stage, 20, 500);
  const seen: Record<string, number> = {};
  const listed = steps
    .filter((s) => (seen[s.stage] = (seen[s.stage] ?? 0) + 1) <= perStage)
    .map((s) => ({
      stage: s.stage,
      kind: s.kind,
      name: s.name,
      ...(s.order !== null ? { order: s.order } : {}),
      ...(s.table !== table ? { table: s.table } : {}),
      ...(s.detail ? { detail: s.detail } : {}),
      ...(s.active ? {} : { inactive: true }),
      ...(s.record_url ? { record_url: s.record_url } : {}),
    }));
  return {
    table,
    operation: op,
    table_hierarchy: chain,
    summary: byStage,
    steps: listed,
    ...(listed.length < steps.length ? { steps_truncated: `${steps.length - listed.length} more; raise max_per_stage to see them` } : {}),
    mermaid: mermaidForTrace(table, op, steps),
    caveats: [
      'Order within a stage follows the order field. Rules with the same order run in an order ServiceNow does not guarantee.',
      'Async business rules, flows and notifications run after the transaction. Their exact timing depends on the event and flow queues.',
      'Event-based notifications, script actions, client scripts and UI policies are not listed: they run on events or in the browser.',
    ],
    ...(notes.length ? { notes } : {}),
  };
}

// ─── Integration authentication ──────────────────────────────────────────────

export async function getIntegrationAuthPosture(client: ServiceNowClient, args: Record<string, any>): Promise<Record<string, any>> {
  const max = lim(args.limit, 25, 200);
  const [props, wsUsers, wsCount, roleHolders, roleCount, tracker, oauthByGrant, oauthByToken, clients, cimd, aliases, failed, failedByUser] = await Promise.all([
    soft(client, { table: 'sys_properties', query: 'nameSTARTSWITHglide.authenticate.basic_auth^ORname=glide.oauth.inbound.client.credential.grant_type.enabled^ORnameSTARTSWITHglide.authenticate.multifactor', fields: 'name,value', limit: 40 }),
    soft(client, { table: 'sys_user', query: 'active=true^web_service_access_only=true^ORDERBYuser_name', fields: 'sys_id,user_name,name,last_login_time,locked_out', limit: max, displayValue: 'all' }),
    countOf(client, 'sys_user', 'active=true^web_service_access_only=true'),
    soft(client, { table: 'sys_user_has_role', query: 'role.name=snc_basic_auth_api_access^state=active', fields: 'user,user.user_name,user.last_login_time,inherited', limit: max, displayValue: 'all' }),
    countOf(client, 'sys_user_has_role', 'role.name=snc_basic_auth_api_access^state=active'),
    soft(client, { table: 'sys_user_basic_auth_exception', query: 'ORDERBYDESClast_seen', fields: 'sys_id,user,usage_count,last_seen,decision,source,action_taken', limit: max, displayValue: 'all' }),
    groupOf(client, 'oauth_entity', 'default_grant_type', 'type=client^active=true'),
    groupOf(client, 'oauth_entity', 'token_format', 'type=client^active=true'),
    soft(client, { table: 'oauth_entity', query: 'type=client^ORDERBYDESCsys_updated_on', fields: 'sys_id,name,active,default_grant_type,token_format,public_client,use_pkce,auth_cimd_client,access_token_lifespan,refresh_token_lifespan,sys_updated_on', limit: max, displayValue: 'all' }),
    countOf(client, 'oauth_entity_cimd'),
    groupOf(client, 'sys_alias', 'type'),
    countOf(client, 'sysevent', 'name=login.failed^sys_created_on>=javascript:gs.daysAgoStart(7)'),
    groupOf(client, 'sysevent', 'parm1', 'name=login.failed^sys_created_on>=javascript:gs.daysAgoStart(7)'),
  ]);
  const p = Object.fromEntries(props.records.map((r: any) => [String(r.name), String(r.value ?? '')]));
  const enforce = p['glide.authenticate.basic_auth.restriction.enforce'];
  const decision = p['glide.authenticate.basic_auth.restriction.default_decision'] || null;
  const state = enforce === undefined && p['glide.authenticate.basic_auth.restriction.active'] === undefined
    ? 'not present (release before the Basic auth restriction)'
    : enforce === 'true' ? 'enforce mode' : 'tracking mode';
  const notes = [props.note, wsUsers.note, roleHolders.note, clients.note, tracker.note ? `${tracker.note} (the Basic auth usage tracker needs an admin or security_admin account)` : undefined].filter(Boolean);
  return {
    basic_auth_restriction: {
      state,
      default_decision: decision,
      enforcement_date: p['glide.authenticate.basic_auth.restriction.enforcement_date'] || null,
      allowed_roles: p['glide.authenticate.basic_auth.allowed_roles'] || null,
      allowed_users: p['glide.authenticate.basic_auth.allowed_users'] || null,
      web_service_access_only_users_allowed: p['glide.authenticate.basic_auth.allow_wsao'] ?? null,
      external_users_allowed: p['glide.authenticate.basic_auth.allow_snc_external'] ?? null,
      what_changes: 'When the default decision moves away from "Maintain current login", Basic auth API calls fail for any account that is not on the allowlist (role snc_basic_auth_api_access, allowed users, web service access only users when allowed). Move those integrations to OAuth.',
      properties_url: listUrl(client, 'sys_properties', 'nameSTARTSWITHglide.authenticate.basic_auth'),
    },
    properties: p,
    web_service_access_only_users: { count: wsCount, list_url: listUrl(client, 'sys_user', 'active=true^web_service_access_only=true'), sample: wsUsers.records.map((u: any) => ({ user_name: disp(u.user_name), name: disp(u.name), last_login: disp(u.last_login_time) || null, locked_out: val(u.locked_out) === 'true', record_url: recUrl(client, 'sys_user', u.sys_id) })) },
    basic_auth_role_holders: { count: roleCount, list_url: listUrl(client, 'sys_user_has_role', 'role.name=snc_basic_auth_api_access^state=active'), sample: roleHolders.records.map((r: any) => ({ user_name: disp(r['user.user_name']) || disp(r.user), last_login: disp(r['user.last_login_time']) || null, inherited: val(r.inherited) === 'true', record_url: recUrl(client, 'sys_user', r.user) })) },
    basic_auth_usage_tracker: tracker.note ? { readable: false } : { readable: true, rows: tracker.records.map((t: any) => ({ user: disp(t.user), usage_count: Number(val(t.usage_count)) || 0, last_seen: disp(t.last_seen), decision: disp(t.decision) || null, source: disp(t.source) || null, record_url: recUrl(client, 'sys_user_basic_auth_exception', t.sys_id) })) },
    oauth: {
      clients_by_grant_type: oauthByGrant,
      clients_by_token_format: oauthByToken,
      cimd_clients: cimd,
      clients: clients.records.map((c: any) => ({
        name: disp(c.name), active: val(c.active) === 'true', grant_type: disp(c.default_grant_type) || null, token_format: disp(c.token_format) || null, public_client: val(c.public_client) === 'true', pkce: val(c.use_pkce) === 'true', cimd: val(c.auth_cimd_client) === 'true',
        access_token_lifespan_s: Number(val(c.access_token_lifespan)) || null, updated: disp(c.sys_updated_on), record_url: recUrl(client, 'oauth_entity', c.sys_id),
      })),
      note: 'MCP Server Console and A2A need OAuth clients that issue JWT access tokens. The password grant sends user passwords and should move to authorization code with PKCE or client credentials.',
    },
    credential_aliases_by_type: aliases,
    failed_logins_last_7_days: { count: failed, top_accounts: failedByUser.slice(0, 10), list_url: listUrl(client, 'sysevent', 'name=login.failed^sys_created_on>=javascript:gs.daysAgoStart(7)') },
    ...(notes.length ? { notes } : {}),
  };
}

// ─── CSDM health ─────────────────────────────────────────────────────────────

function score(parts: Array<[boolean | number, number]>): number {
  let got = 0;
  let total = 0;
  for (const [v, w] of parts) {
    total += w;
    got += (typeof v === 'number' ? Math.max(0, Math.min(1, v)) : v ? 1 : 0) * w;
  }
  return total ? Math.round((got / total) * 100) : 0;
}

export async function getCsdmHealth(client: ServiceNowClient, args: Record<string, any>): Promise<Record<string, any>> {
  const max = lim(args.limit, 10, 100);
  const c = (t: string, q = '') => countOf(client, t, q);
  const [
    bizApps, bizAppsOwned, appServices, techServices, discovered, queryBased, bizServices, offerings, offeringsNoParent,
    productModels, appProductModels, swModels, hwModels, cis, lcStage, lcStatus, rels, appl, servers, capabilities, infoObjects,
    dmPolicies, dmExec, certPolicies, aiCis, mcpCis, props, relTypes, appsNoRel, servicesNoOffering,
  ] = await Promise.all([
    c('cmdb_ci_business_app'), c('cmdb_ci_business_app', 'owned_byISNOTEMPTY^ORit_application_ownerISNOTEMPTY'),
    c('cmdb_ci_service_auto'), c('cmdb_ci_service_technical'), c('cmdb_ci_service_discovered'), c('cmdb_ci_query_based_service'),
    c('cmdb_ci_service_business'), c('service_offering'), c('service_offering', 'parentISEMPTY'),
    c('cmdb_model'), c('cmdb_application_product_model'), c('cmdb_software_product_model'), c('cmdb_hardware_product_model'),
    c('cmdb_ci'), c('cmdb_ci', 'life_cycle_stageISNOTEMPTY'), c('cmdb_ci', 'life_cycle_stage_statusISNOTEMPTY'),
    c('cmdb_rel_ci'), c('cmdb_ci_appl'), c('cmdb_ci_server'), c('cmdb_ci_business_capability'), c('cmdb_ci_information_object'),
    c('cmdb_data_management_policy'), c('cmdb_data_management_policy_execution'), c('sn_cmdb_ws_dm_certification_policy'),
    c('cmdb_ci_function_ai'), c('cmdb_ci_function_mcp'),
    soft(client, { table: 'sys_properties', query: 'nameSTARTSWITHcsdm.', fields: 'name,value', limit: 30 }),
    groupOf(client, 'cmdb_rel_ci', 'type'),
    soft(client, { table: 'cmdb_ci_business_app', query: 'ORDERBYname', fields: 'sys_id,name,owned_by,it_application_owner,life_cycle_stage,install_status', limit: 200, displayValue: 'all' }),
    soft(client, { table: 'cmdb_ci_service_auto', query: 'ORDERBYname', fields: 'sys_id,name,sys_class_name,owned_by,life_cycle_stage', limit: 200, displayValue: 'all' }),
  ]);

  // Which business applications have a relationship and which services have an offering.
  const appIds = appsNoRel.records.map((a: any) => String(val(a.sys_id)));
  const svcIds = servicesNoOffering.records.map((s: any) => String(val(s.sys_id)));
  const [appRels, svcOfferings, svcRels] = await Promise.all([
    appIds.length ? soft(client, { table: 'cmdb_rel_ci', query: `parentIN${appIds.join(',')}^ORchildIN${appIds.join(',')}`, fields: 'parent,child', limit: 2000 }) : Promise.resolve({ records: [] as any[] }),
    svcIds.length ? soft(client, { table: 'service_offering', query: `parentIN${svcIds.join(',')}`, fields: 'parent', limit: 2000 }) : Promise.resolve({ records: [] as any[] }),
    svcIds.length ? soft(client, { table: 'cmdb_rel_ci', query: `parentIN${svcIds.join(',')}^ORchildIN${svcIds.join(',')}`, fields: 'parent,child', limit: 2000 }) : Promise.resolve({ records: [] as any[] }),
  ]);
  const related = new Set(appRels.records.flatMap((r: any) => [String(val(r.parent)), String(val(r.child))]));
  const offered = new Set(svcOfferings.records.map((r: any) => String(val(r.parent))));
  const svcRelated = new Set(svcRels.records.flatMap((r: any) => [String(val(r.parent)), String(val(r.child))]));
  const appsWithoutRel = appsNoRel.records.filter((a: any) => !related.has(String(val(a.sys_id))));
  const appsWithoutOwner = appsNoRel.records.filter((a: any) => !disp(a.owned_by) && !disp(a.it_application_owner));
  const svcWithoutOffering = servicesNoOffering.records.filter((s: any) => !offered.has(String(val(s.sys_id))));
  const svcWithoutRel = servicesNoOffering.records.filter((s: any) => !svcRelated.has(String(val(s.sys_id))));
  const link = (t: string) => (r: any) => ({ name: disp(r.name), class: disp(r.sys_class_name) || t, owner: disp(r.owned_by) || disp(r.it_application_owner) || null, life_cycle_stage: disp(r.life_cycle_stage) || null, record_url: recUrl(client, String(val(r.sys_class_name) || t), r.sys_id) });

  const p = Object.fromEntries(props.records.map((r: any) => [String(r.name), String(r.value ?? '')]));
  const ciTotal = num(cis);
  const lcPct = ciTotal ? Math.round((num(lcStage) / ciTotal) * 1000) / 10 : 0;
  const nBiz = num(bizApps);
  const nSvc = num(appServices);
  const domains = {
    design: {
      score: score([[nBiz > 0, 2], [nBiz ? num(bizAppsOwned) / nBiz : 0, 2], [nBiz ? 1 - appsWithoutRel.length / Math.max(1, appIds.length) : 0, 2], [num(appProductModels) > 0, 1], [num(capabilities) > 0, 1], [num(infoObjects) > 0, 1]]),
      business_applications: bizApps, business_applications_with_owner: bizAppsOwned, application_product_models: appProductModels, business_capabilities: capabilities, information_objects: infoObjects,
      list_url: listUrl(client, 'cmdb_ci_business_app'),
    },
    service_delivery: {
      score: score([[nSvc > 0, 2], [num(techServices) > 0, 1], [nSvc ? 1 - svcWithoutRel.length / Math.max(1, svcIds.length) : 0, 2], [num(discovered) + num(queryBased) > 0, 1]]),
      service_instances: appServices, technical_services: techServices, discovered_services: discovered, query_based_services: queryBased,
      list_url: listUrl(client, 'cmdb_ci_service_auto'),
    },
    service_consumption: {
      score: score([[num(bizServices) > 0, 2], [num(offerings) > 0, 2], [num(offerings) ? 1 - num(offeringsNoParent) / num(offerings) : 0, 1], [nSvc ? 1 - svcWithoutOffering.length / Math.max(1, svcIds.length) : 0, 2]]),
      business_services: bizServices, service_offerings: offerings, offerings_without_parent_service: offeringsNoParent,
      list_url: listUrl(client, 'service_offering'),
    },
    foundation_and_build: {
      score: score([[num(productModels) > 0, 1], [num(swModels) + num(hwModels) > 0, 1], [num(appl) > 0, 1], [num(servers) > 0, 1], [num(rels) > 0, 1]]),
      product_models: productModels, software_product_models: swModels, hardware_product_models: hwModels, applications: appl, servers, relationships: rels,
    },
    life_cycle: {
      score: score([[lcPct / 100, 3], [p['csdm.lifecycle.migration.activated'] === 'true', 1], [p['csdm.lifecycle.sync.between.ci.and.asset.activated'] === 'true', 1]]),
      cis: cis, cis_with_life_cycle_stage: lcStage, cis_with_life_cycle_status: lcStatus, adoption_pct: lcPct,
      migration_activated: p['csdm.lifecycle.migration.activated'] ?? null, ci_asset_sync_activated: p['csdm.lifecycle.sync.between.ci.and.asset.activated'] ?? null,
      cis_without_stage_url: listUrl(client, 'cmdb_ci', 'life_cycle_stageISEMPTY'),
    },
    data_management: {
      score: score([[num(dmPolicies) > 0, 1], [num(dmExec) > 0, 1], [num(certPolicies) > 0, 1]]),
      data_management_policies: dmPolicies, policy_executions: dmExec, certification_policies: certPolicies,
    },
    ai_and_mcp: { ai_function_cis: aiCis, mcp_server_cis: mcpCis, list_url: listUrl(client, 'cmdb_ci_function_ai') },
  };
  const scored = Object.values(domains).filter((d: any) => typeof d.score === 'number') as Array<{ score: number }>;
  return {
    overall_score: Math.round(scored.reduce((n, d) => n + d.score, 0) / scored.length),
    domains,
    gaps: {
      business_apps_without_relationships: appsWithoutRel.slice(0, max).map(link('cmdb_ci_business_app')),
      business_apps_without_owner: appsWithoutOwner.slice(0, max).map(link('cmdb_ci_business_app')),
      service_instances_without_offering: svcWithoutOffering.slice(0, max).map(link('cmdb_ci_service_auto')),
      service_instances_without_relationships: svcWithoutRel.slice(0, max).map(link('cmdb_ci_service_auto')),
    },
    relationship_types: relTypes.slice(0, 12),
    csdm_properties: p,
    scoring: 'Each domain score weighs presence and completeness: records exist, owners set, relationships and offerings in place, life cycle adoption, and data management policies. It is a guide for prioritising, not a ServiceNow metric.',
  };
}

// ─── CMDB / CSDM Data Foundations ────────────────────────────────────────────

const GETWELL_DRILLDOWNS: Record<string, string> = {
  sn_getwell_app_svc_missing_biz_app: 'Application services with no business application',
  sn_getwell_app_svc_missing_biz_svc_off: 'Application services with no business service offering',
  sn_getwell_app_svc_missing_inf_obj: 'Application services with no information object',
  sn_getwell_app_svc_incorrect_biz_app_rel: 'Application services with the wrong business application relationship',
  sn_getwell_biz_app_missing_app_svc: 'Business applications with no application service',
  sn_getwell_biz_app_missing_inf_obj: 'Business applications with no information object',
  sn_getwell_biz_svc_off_missing_app_svc: 'Business service offerings with no application service',
  sn_getwell_tech_svc_missing_tech_svc_off: 'Technical services with no technical service offering',
  sn_getwell_inf_obj_missing_biz_app: 'Information objects with no business application',
  sn_getwell_inf_obj_missing_app_svc: 'Information objects with no application service',
  sn_getwell_ci_name_not_reflecting_hostname: 'CIs whose name does not match the host name',
  sn_getwell_duplicate_location: 'Duplicate locations',
  sn_getwell_biz_svc_from_custom_tables: 'Business services built on custom tables',
  sn_getwell_unconventional_custom_table: 'Unconventional custom CMDB tables',
};

const CSDM_STAGES: Record<string, string> = { '1': 'Foundation', '2': 'Crawl', '3': 'Walk', '4': 'Run', '5': 'Fly' };

export async function getCmdbDataFoundations(client: ServiceNowClient, args: Record<string, any>): Promise<Record<string, any>> {
  const max = lim(args.limit, 5, 50);
  const fields = 'sys_id,name,result,count,priority,remediation_playbook_url,active,sys_updated_on';
  const [cmdb, csdm, metrics] = await Promise.all([
    soft(client, { table: 'sn_getwell_cmdb_score', query: 'active=true^ORDERBYresult', fields: `${fields},cmdb_tab`, limit: 200, displayValue: 'all' }),
    soft(client, { table: 'sn_getwell_csdm_score', query: 'active=true^ORDERBYcsdm_stage', fields: `${fields},csdm_stage`, limit: 200, displayValue: 'all' }),
    countOf(client, 'sn_getwell_metric', 'active=true'),
  ]);
  if (cmdb.note && csdm.note && /not available/.test(cmdb.note)) {
    throw new ServiceNowError('Data Foundations tables (sn_getwell_*) are not available. They need the CMDB and CSDM Data Foundations dashboards (plugin com.snc.cmdb.getwell).', 'PLUGIN_NOT_INSTALLED');
  }
  const row = (r: any, extra: Record<string, unknown>) => ({
    metric: disp(r.name),
    result_pct: Number(val(r.result)) || 0,
    failing_records: Number(val(r.count)) || 0,
    priority: disp(r.priority) || null,
    ...extra,
    playbook_url: val(r.remediation_playbook_url) || null,
    updated: disp(r.sys_updated_on),
    record_url: recUrl(client, extra.stage ? 'sn_getwell_csdm_score' : 'sn_getwell_cmdb_score', r.sys_id),
  });
  const cmdbRows = cmdb.records.map((r: any) => row(r, { tab: disp(r.cmdb_tab) || null }));
  const csdmRows = csdm.records.map((r: any) => row(r, { stage: CSDM_STAGES[String(val(r.csdm_stage))] ?? disp(r.csdm_stage) }));
  const avg = (xs: Array<{ result_pct: number }>) => (xs.length ? Math.round((xs.reduce((n, x) => n + x.result_pct, 0) / xs.length) * 10) / 10 : null);
  const byKey = (xs: any[], key: string) => {
    const m = new Map<string, any[]>();
    for (const x of xs) m.set(String(x[key] ?? '(none)'), [...(m.get(String(x[key] ?? '(none)')) ?? []), x]);
    return [...m.entries()].map(([k, v]) => ({ [key]: k, metrics: v.length, average_result_pct: avg(v), below_80_pct: v.filter((x) => x.result_pct < 80).length }));
  };
  const drill = await Promise.all(Object.entries(GETWELL_DRILLDOWNS).map(async ([table, label]) => {
    const n = await countOf(client, table, 'to_delete=false');
    if (typeof n !== 'number' || n === 0) return { table, label, count: n };
    const sample = await soft(client, { table, query: 'to_delete=false', fields: 'ci,location', limit: max, displayValue: 'all' });
    return {
      table, label, count: n, list_url: listUrl(client, table, 'to_delete=false'),
      sample: sample.records.map((s: any) => (val(s.ci)
        ? { name: disp(s.ci), record_url: recUrl(client, 'cmdb_ci', s.ci) }
        : { name: disp(s.location), record_url: recUrl(client, 'cmn_location', s.location) })),
    };
  }));
  const notes = [cmdb.note, csdm.note].filter(Boolean);
  return {
    summary: {
      active_metrics: metrics,
      cmdb_average_result_pct: avg(cmdbRows),
      csdm_average_result_pct: avg(csdmRows),
      metrics_below_80_pct: [...cmdbRows, ...csdmRows].filter((r) => r.result_pct < 80).length,
      last_calculated: cmdbRows[0]?.updated ?? csdmRows[0]?.updated ?? null,
    },
    cmdb_by_tab: byKey(cmdbRows, 'tab'),
    csdm_by_stage: byKey(csdmRows, 'stage'),
    cmdb_metrics: cmdbRows,
    csdm_metrics: csdmRows,
    drill_downs: drill.filter((d) => d.count !== 0),
    note: 'These are ServiceNow\'s own Data Foundations results (calculated by the instance\'s scheduled job). The playbook links go to the matching ServiceNow KB article.',
    ...(notes.length ? { notes } : {}),
  };
}

// ─── MCP exposure ────────────────────────────────────────────────────────────

const WRITE_WORDS = /\b(create|update|delete|close|resolve|assign|approve|reject|submit|order|cancel|write|modify|reassign|escalate|add|remove|set)\b/i;

export async function getMcpExposure(client: ServiceNowClient, args: Record<string, any>): Promise<Record<string, any>> {
  const max = lim(args.limit, 50, 200);
  const [servers, tools, registry, exposed, providers, jwtClients, roles, props] = await Promise.all([
    soft(client, { table: 'sn_mcp_server_registry', fields: 'sys_id,name,label,url,status,tools,short_description', limit: max, displayValue: 'all' }),
    soft(client, { table: 'sn_mcp_tool_definition', fields: 'sys_id,name,label,category,description,servers', limit: 500, displayValue: 'all' }),
    soft(client, { table: 'sn_mcp_server', fields: 'sys_id,name,url,active,auth_type', limit: max, displayValue: 'all' }),
    soft(client, { table: 'sn_aia_agent_config', query: 'public=true', fields: 'sys_id,agent,active,run_as_user', limit: max, displayValue: 'all' }),
    soft(client, { table: 'sn_aia_external_agent_provider', fields: 'sys_id,name,agent_card_url,api_type,connection_credential_alias', limit: max, displayValue: 'all' }),
    soft(client, { table: 'oauth_entity', query: 'type=client^active=true^token_format=jwt', fields: 'sys_id,name,default_grant_type,public_client,use_pkce,auth_cimd_client,sys_updated_on', limit: max, displayValue: 'all' }),
    soft(client, { table: 'sys_user_has_role', query: 'role.nameSTARTSWITHsn_mcp^state=active', fields: 'role.name,user', limit: 500, displayValue: 'all' }),
    soft(client, { table: 'sys_properties', query: 'nameINsn_aia.enable_mcp_tool,sn_aia.external_agents.enabled,sn_aia.external_agent_guardian_check^ORnameSTARTSWITHsn_mcp_server.^ORnameSTARTSWITHsn_mcp_client.', fields: 'name,value', limit: 50 }),
  ]);
  const toolList = tools.records.map((t: any) => {
    const text = `${disp(t.name)} ${disp(t.label)} ${disp(t.description)}`;
    return { name: disp(t.label) || disp(t.name), category: disp(t.category), servers: disp(t.servers) || null, looks_write_capable: WRITE_WORDS.test(text), record_url: recUrl(client, 'sn_mcp_tool_definition', t.sys_id) };
  });
  const roleCounts: Record<string, number> = {};
  for (const r of roles.records) roleCounts[String(val(r['role.name']))] = (roleCounts[String(val(r['role.name']))] ?? 0) + 1;
  const notes = [servers, tools, registry, exposed, providers, jwtClients, roles, props].map((x) => x.note).filter(Boolean);
  return {
    summary: {
      mcp_servers: servers.records.length,
      active_mcp_servers: servers.records.filter((s: any) => /active/i.test(String(disp(s.status)))).length,
      mcp_tools: toolList.length,
      write_capable_looking_tools: toolList.filter((t) => t.looks_write_capable).length,
      external_mcp_servers_called: registry.records.length,
      a2a_exposed_agents: exposed.records.length,
      external_agent_providers: providers.records.length,
      jwt_oauth_clients: jwtClients.records.length,
    },
    mcp_servers: servers.records.map((s: any) => ({ name: disp(s.label) || disp(s.name), internal_name: val(s.name), status: disp(s.status), url: val(s.url), tools: disp(s.tools) || null, record_url: recUrl(client, 'sn_mcp_server_registry', s.sys_id) })),
    mcp_tools: toolList,
    external_mcp_servers: registry.records.map((r: any) => ({ name: disp(r.name), url: val(r.url), active: val(r.active) === 'true', auth: disp(r.auth_type) || null, record_url: recUrl(client, 'sn_mcp_server', r.sys_id) })),
    a2a_exposed_agents: exposed.records.map((e: any) => ({ agent: disp(e.agent), active: val(e.active) === 'true', run_as: disp(e.run_as_user) || 'the calling user', record_url: recUrl(client, 'sn_aia_agent_config', e.sys_id) })),
    external_agent_providers: providers.records.map((p: any) => ({ name: disp(p.name), card_url: val(p.agent_card_url) || null, api_type: disp(p.api_type) || null, credential_alias: disp(p.connection_credential_alias) || null, record_url: recUrl(client, 'sn_aia_external_agent_provider', p.sys_id) })),
    jwt_oauth_clients: jwtClients.records.map((o: any) => ({ name: disp(o.name), grant_type: disp(o.default_grant_type) || null, public_client: val(o.public_client) === 'true', pkce: val(o.use_pkce) === 'true', cimd: val(o.auth_cimd_client) === 'true', record_url: recUrl(client, 'oauth_entity', o.sys_id) })),
    mcp_role_assignments: roleCounts,
    properties: Object.fromEntries(props.records.map((r: any) => [String(r.name), String(r.value ?? '')])),
    ...(notes.length ? { notes } : {}),
  };
}

export async function executePlatformInsightsToolCall(client: ServiceNowClient, name: string, args: Record<string, any>): Promise<any> {
  switch (name) {
    case 'get_release_info': return getReleaseInfo(client, args);
    case 'list_process_mining_projects': return listProcessMiningProjects(client, args);
    case 'get_process_mining_findings': return getProcessMiningFindings(client, args);
    case 'get_atf_code_coverage': return getAtfCodeCoverage(client, args);
    case 'trace_table_operation': return traceTableOperation(client, args);
    case 'get_integration_auth_posture': return getIntegrationAuthPosture(client, args);
    case 'get_csdm_health': return getCsdmHealth(client, args);
    case 'get_mcp_exposure': return getMcpExposure(client, args);
    case 'get_cmdb_data_foundations': return getCmdbDataFoundations(client, args);
    default: return null;
  }
}

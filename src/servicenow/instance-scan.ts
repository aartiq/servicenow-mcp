/**
 * Instance Scan helpers shared by the MCP tools (run_instance_scan, get_instance_scan_summary,
 * get_instance_scan_findings) and the direct-mode capabilities (scan-instance and the enriched
 * scan-health, scan-security, scan-debt and scan-upgrade).
 *
 * Data model (checked on an Australia instance):
 *   scan_check (+ scan_table_check, scan_column_type_check, scan_linter_check, scan_script_only_check)
 *     name, category, priority (1 critical .. 4 low), short_description, resolution_details, documentation_url
 *   scan_check_suite, scan_check_suite_check (suite <-> check), scan_check_suite_m2m (suite <-> child suite)
 *   scan_combo (sources -> scan_source{table, record_id}, targets -> scan_target) — the saved "what to scan"
 *   scan_result (number SR..., state, scan_type, combo, finding_count, execution_time, progress_id)
 *   scan_suite_execution (result <-> suite), scan_score (result, category, score), scan_check_execution
 *   scan_finding (result, check, source_table, source, finding_details, count, muted, sys_package, product_family)
 *   scan_mute_rule, scan_queue (Zurich+ queueing; parallel scans from Australia)
 *
 * Running scans uses the CI/CD REST API (sn_cicd.sys_ci_automation or admin):
 *   POST /api/sn_cicd/instance_scan/full_scan
 *   POST /api/sn_cicd/instance_scan/point_scan?target_table=&target_sys_id=
 *   POST /api/sn_cicd/instance_scan/suite_scan/combo/{combo_sys_id}
 *   POST /api/sn_cicd/instance_scan/suite_scan/{suite_sys_id}/scoped_apps   body { app_scope_sys_ids: [] }
 *   POST /api/sn_cicd/instance_scan/suite_scan/{suite_sys_id}/update_sets   body { update_set_sys_ids: [] }
 *   GET  /api/sn_cicd/progress/{progress_id}  (status 0 pending, 1 running, 2 successful, 3 failed, 4 canceled;
 *        links.source.id is the scan_result sys_id)
 */
import type { ServiceNowClient } from './client.js';
import { ServiceNowError } from '../utils/errors.js';

export const SCAN_CATEGORIES = ['security', 'performance', 'upgradability', 'manageability', 'user_experience'] as const;

const SYS_ID = /^[0-9a-f]{32}$/i;
const PRIORITY_LABEL: Record<string, string> = { '1': '1 - Critical', '2': '2 - High', '3': '3 - Moderate', '4': '4 - Low' };
const CICD_STATUS: Record<string, string> = { '0': 'pending', '1': 'running', '2': 'successful', '3': 'failed', '4': 'canceled' };

/** Name and short-description patterns that mark a check as covering AI, Now Assist or agents. */
const AI_CHECK_QUERY = [
  'nameLIKENow Assist', 'nameLIKEAI Agent', 'nameLIKEagentic', 'nameLIKEgenerative', 'nameLIKEMCP server',
  'nameLIKEVirtual Agent', 'nameLIKEPredictive Intelligence', 'nameLIKEAI Search', 'nameLIKElarge language model',
  'short_descriptionLIKENow Assist', 'short_descriptionLIKEAI agent', 'short_descriptionLIKEgenerative AI',
  'sys_scope.nameLIKENow Assist', 'sys_scope.nameLIKEAI Agent', 'sys_scope.nameLIKEGenerative',
].join('^OR');

// ─── Small helpers ────────────────────────────────────────────────────────────

const refValue = (v: unknown): string => (v && typeof v === 'object' ? String((v as any).value ?? '') : String(v ?? ''));
const num = (v: unknown): number => { const n = Number(refValue(v)); return Number.isFinite(n) ? n : 0; };
const unwrap = (body: any) => (body && typeof body === 'object' && 'result' in body ? body.result : body);

/** Plain text from a finding's HTML details, cut to `max` characters. */
export function stripHtml(s: unknown, max = 240): string {
  const text = String(s ?? '')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

function normaliseCategories(categories?: string[] | string): string[] | undefined {
  const list = (Array.isArray(categories) ? categories : String(categories ?? '').split(','))
    .map((c) => c.trim().toLowerCase().replace(/\s+/g, '_'))
    .filter(Boolean);
  return list.length ? list : undefined;
}

/** True when `scope` names an Instance Scan category (so callers can use -s security as a filter). */
export function isScanCategory(scope: unknown): boolean {
  return (normaliseCategories(String(scope ?? '')) ?? []).every((c) => (SCAN_CATEGORIES as readonly string[]).includes(c)) && !!scope;
}

async function aggregate(client: ServiceNowClient, table: string, groupBy: string, query?: string): Promise<Array<{ key: string; count: number }>> {
  const rows = await client.runAggregateQuery(table, groupBy, 'COUNT', query);
  return (Array.isArray(rows) ? rows : []).map((r: any) => ({
    key: String(r?.groupby_fields?.[0]?.display_value || r?.groupby_fields?.[0]?.value || ''),
    count: num(r?.stats?.count),
  }));
}

/** Sum aggregate rows by key (the stats API can return the same key twice). */
function sumByKey(rows: Array<{ key: string; count: number }>, label: (k: string) => string = (k) => k || '(none)'): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) out[label(r.key)] = (out[label(r.key)] ?? 0) + r.count;
  return out;
}

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try { return await fn(); } catch { return fallback; }
}

// ─── Scan results and runs ────────────────────────────────────────────────────

export interface ScanResultRow {
  sys_id: string;
  number: string;
  state: string;
  scan_type: string;
  finding_count: number;
  execution_time_ms: number;
  created: string;
  combo: string;
  message?: string;
}

const RESULT_FIELDS = 'sys_id,number,state,scan_type,finding_count,execution_time,sys_created_on,combo,message,progress_id';

function toResultRow(r: any): ScanResultRow {
  return {
    sys_id: refValue(r.sys_id),
    number: refValue(r.number),
    state: refValue(r.state),
    scan_type: refValue(r.scan_type),
    finding_count: num(r.finding_count),
    execution_time_ms: num(r.execution_time),
    created: refValue(r.sys_created_on),
    combo: refValue(r.combo),
    message: refValue(r.message) || undefined,
  };
}

/** Find a scan_result by sys_id, number (SR...) or CI/CD progress id. */
export async function resolveScanResult(client: ServiceNowClient, ref: string): Promise<ScanResultRow> {
  const r = String(ref || '').trim();
  if (!r) throw new ServiceNowError('A scan result sys_id, number or progress id is required', 'INVALID_REQUEST');
  const query = SYS_ID.test(r) ? `sys_id=${r}^ORprogress_id=${r}` : `number=${r}`;
  const resp = await client.queryRecords({ table: 'scan_result', query, fields: RESULT_FIELDS, limit: 1 });
  const row = resp.records[0];
  if (!row) throw new ServiceNowError(`Scan result not found: ${r}`, 'NOT_FOUND');
  return toResultRow(row);
}

export interface ScanRun {
  combo: string;
  /** Suite names (or other scan sources) the combo scans. */
  scans: string[];
  latest?: ScanResultRow;
  previous?: ScanResultRow;
  finding_delta?: number;
  runs_last_30_days?: number;
}

/** Suite names for a set of combos, through scan_combo.sources -> scan_source -> scan_check_suite. */
async function comboLabels(client: ServiceNowClient, combos: any[]): Promise<Map<string, string[]>> {
  const sourceIds = [...new Set(combos.flatMap((c) => refValue(c.sources).split(',').filter(Boolean)))];
  const labels = new Map<string, string[]>();
  if (!sourceIds.length) return labels;
  const sources = await client.queryRecords({ table: 'scan_source', query: `sys_idIN${sourceIds.join(',')}`, fields: 'sys_id,table,record_id', limit: 500 });
  const suiteIds = sources.records.filter((s: any) => refValue(s.table) === 'scan_check_suite').map((s: any) => refValue(s.record_id));
  const suites = suiteIds.length
    ? await client.queryRecords({ table: 'scan_check_suite', query: `sys_idIN${suiteIds.join(',')}`, fields: 'sys_id,name', limit: 500 })
    : { records: [] as any[] };
  const suiteName = new Map(suites.records.map((s: any) => [refValue(s.sys_id), refValue(s.name)]));
  const sourceLabel = new Map(sources.records.map((s: any) => {
    const table = refValue(s.table);
    const id = refValue(s.record_id);
    return [refValue(s.sys_id), table === 'scan_check_suite' ? (suiteName.get(id) || `suite ${id} (not readable)`) : `${table} ${id}`];
  }));
  for (const c of combos) {
    labels.set(refValue(c.sys_id), refValue(c.sources).split(',').filter(Boolean).map((s) => sourceLabel.get(s) || s));
  }
  return labels;
}

/**
 * The latest and previous result of every saved scan (combo), newest first, plus recent scans that
 * have no combo (full and point scans).
 */
export async function listScanRuns(client: ServiceNowClient, maxCombos = 25): Promise<ScanRun[]> {
  const combos = await client.queryRecords({ table: 'scan_combo', fields: 'sys_id,number,sources', limit: 200 });
  const labels = await safe(() => comboLabels(client, combos.records), new Map<string, string[]>());
  const runs = await Promise.all(combos.records.map(async (c: any): Promise<ScanRun> => {
    const id = refValue(c.sys_id);
    const [results, recent] = await Promise.all([
      client.queryRecords({ table: 'scan_result', query: `combo=${id}^ORDERBYDESCsys_created_on`, fields: RESULT_FIELDS, limit: 2 }),
      safe(() => client.runAggregateQuery('scan_result', 'state', 'COUNT', `combo=${id}^sys_created_on>=javascript:gs.daysAgoStart(30)`), [] as any[]),
    ]);
    const [latest, previous] = results.records.map(toResultRow);
    const recentCount = (Array.isArray(recent) ? recent : []).reduce((n: number, r: any) => n + num(r?.stats?.count), 0);
    return {
      combo: id,
      scans: labels.get(id) ?? [],
      latest,
      previous,
      finding_delta: latest && previous ? latest.finding_count - previous.finding_count : undefined,
      runs_last_30_days: recentCount,
    };
  }));
  // Full and point scans have no combo.
  const loose = await safe(() => client.queryRecords({ table: 'scan_result', query: 'comboISEMPTY^ORDERBYDESCsys_created_on', fields: RESULT_FIELDS, limit: 5 }), { count: 0, records: [] as any[] });
  for (const r of loose.records) {
    runs.push({ combo: '', scans: ['full or point scan'], latest: toResultRow(r) });
  }
  return runs
    .filter((r) => r.latest)
    .sort((a, b) => (b.latest!.created).localeCompare(a.latest!.created))
    .slice(0, maxCombos);
}

async function scoresFor(client: ServiceNowClient, resultIds: string[]): Promise<Map<string, Record<string, number>>> {
  const out = new Map<string, Record<string, number>>();
  if (!resultIds.length) return out;
  const rows = await client.queryRecords({ table: 'scan_score', query: `resultIN${resultIds.join(',')}`, fields: 'result,category,score', limit: 500 });
  for (const r of rows.records) {
    const id = refValue(r.result);
    const scores = out.get(id) ?? {};
    scores[refValue(r.category)] = num(r.score);
    out.set(id, scores);
  }
  return out;
}

// ─── Summary ──────────────────────────────────────────────────────────────────

export interface ScanSummaryOptions {
  /** Only report checks in these categories (security, performance, upgradability, manageability, user_experience). */
  categories?: string[] | string;
  /** Focus on one scan result (sys_id, SR number or progress id) instead of the latest result of each saved scan. */
  result?: string;
  /** How many results to analyse in depth (default 6). */
  maxResults?: number;
  /** How many checks to list with remediation (default 25). */
  topChecks?: number;
  /** Sample findings per top check (default 2, 0 to skip). */
  samplesPerCheck?: number;
  /** Skip the inventory, AI coverage and sample sections (smaller output for other capabilities). */
  compact?: boolean;
}

interface CheckMeta {
  sys_id: string; name: string; category: string; priority: string; type: string; app: string;
  short_description: string; resolution: string; documentation_url: string; active: boolean;
}

async function loadChecks(client: ServiceNowClient, ids: string[]): Promise<Map<string, CheckMeta>> {
  const out = new Map<string, CheckMeta>();
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const resp = await client.queryRecords({
      table: 'scan_check',
      query: `sys_idIN${chunk.join(',')}`,
      fields: 'sys_id,name,category,priority,short_description,resolution_details,documentation_url,sys_class_name,sys_scope.name,active',
      limit: chunk.length,
    });
    for (const c of resp.records) {
      out.set(refValue(c.sys_id), {
        sys_id: refValue(c.sys_id),
        name: refValue(c.name),
        category: refValue(c.category).toLowerCase(),
        priority: refValue(c.priority),
        type: refValue(c.sys_class_name).replace(/^scan_/, '').replace(/_check$/, ''),
        app: refValue((c as any)['sys_scope.name']),
        short_description: stripHtml(c.short_description, 200),
        resolution: stripHtml(c.resolution_details, 320),
        documentation_url: refValue(c.documentation_url),
        active: refValue(c.active) === 'true',
      });
    }
  }
  return out;
}


export interface InstanceScanSummary {
  generated_at: string;
  scope: { categories: string[] | 'all'; result?: string };
  inventory?: Record<string, unknown>;
  runs: Array<Record<string, unknown>>;
  analysed_results: Array<Record<string, unknown>>;
  by_category: Array<Record<string, unknown>>;
  by_priority: Array<Record<string, unknown>>;
  top_checks: Array<Record<string, unknown>>;
  resolved_checks: Array<Record<string, unknown>>;
  by_table: Array<Record<string, unknown>>;
  by_app: Array<Record<string, unknown>>;
  ai_coverage?: Record<string, unknown>;
  sample_findings?: Array<Record<string, unknown>>;
  notes: string[];
}

/**
 * Build a grouped view of the latest Instance Scan results: per saved scan (latest vs previous run),
 * findings by category, priority, check, table and application, remediation for the top checks,
 * trend per check against the previous run, and coverage of AI and agent checks.
 */
export async function getInstanceScanSummary(client: ServiceNowClient, opts: ScanSummaryOptions = {}): Promise<InstanceScanSummary> {
  const categories = normaliseCategories(opts.categories);
  const maxResults = Math.min(Math.max(opts.maxResults ?? 6, 1), 20);
  const topN = Math.min(Math.max(opts.topChecks ?? 25, 1), 100);
  const samplesPer = Math.min(Math.max(opts.samplesPerCheck ?? 2, 0), 5);
  const notes: string[] = [];

  // 1. Which results to analyse, and the result to compare each one with.
  const runs = await listScanRuns(client);
  let focus: Array<{ current: ScanResultRow; previous?: ScanResultRow; scans: string[] }> = [];
  if (opts.result) {
    const current = await resolveScanResult(client, opts.result);
    let previous: ScanResultRow | undefined;
    if (current.combo) {
      const prev = await client.queryRecords({
        table: 'scan_result',
        query: `combo=${current.combo}^sys_created_on<${current.created}^state=complete^ORDERBYDESCsys_created_on`,
        fields: RESULT_FIELDS,
        limit: 1,
      });
      previous = prev.records[0] ? toResultRow(prev.records[0]) : undefined;
    }
    const run = runs.find((r) => r.combo && r.combo === current.combo);
    focus = [{ current, previous, scans: run?.scans ?? [] }];
  } else {
    focus = runs
      .filter((r) => r.latest && (r.latest.finding_count > 0 || (r.previous?.finding_count ?? 0) > 0))
      .sort((a, b) => b.latest!.finding_count - a.latest!.finding_count)
      .slice(0, maxResults)
      .map((r) => ({ current: r.latest!, previous: r.previous, scans: r.scans }));
    if (!focus.length) notes.push('No saved scan has findings in its latest or previous run.');
  }

  const resultIds = [...new Set(focus.flatMap((f) => [f.current.sys_id, f.previous?.sys_id].filter(Boolean) as string[]))];
  const scores = await safe(() => scoresFor(client, [...new Set([...resultIds, ...runs.map((r) => r.latest!.sys_id)])]), new Map());

  // 2. Findings per check for each focus result and its previous run.
  const perCheckNow = new Map<string, number>();
  const perCheckPrev = new Map<string, number>();
  const perTable = new Map<string, number>();
  const perApp = new Map<string, number>();
  let muted = 0;
  await Promise.all(focus.map(async (f) => {
    const [nowRows, prevRows, tableRows, appRows, famRows, mutedRows] = await Promise.all([
      aggregate(client, 'scan_finding', 'check', `result=${f.current.sys_id}^muted=false`),
      f.previous ? aggregate(client, 'scan_finding', 'check', `result=${f.previous.sys_id}^muted=false`) : Promise.resolve([]),
      aggregate(client, 'scan_finding', 'source_table', `result=${f.current.sys_id}^muted=false`),
      safe(() => aggregate(client, 'scan_finding', 'sys_package.name', `result=${f.current.sys_id}^muted=false^sys_packageISNOTEMPTY`), []),
      safe(() => aggregate(client, 'scan_finding', 'product_family', `result=${f.current.sys_id}^muted=false^product_familyISNOTEMPTY`), []),
      safe(() => aggregate(client, 'scan_finding', 'muted', `result=${f.current.sys_id}^muted=true`), []),
    ]);
    for (const r of nowRows) perCheckNow.set(r.key, (perCheckNow.get(r.key) ?? 0) + r.count);
    for (const r of prevRows) perCheckPrev.set(r.key, (perCheckPrev.get(r.key) ?? 0) + r.count);
    for (const r of tableRows) perTable.set(r.key || '(no table)', (perTable.get(r.key || '(no table)') ?? 0) + r.count);
    const apps = appRows.length ? appRows : famRows;
    for (const r of apps) perApp.set(r.key, (perApp.get(r.key) ?? 0) + r.count);
    muted += mutedRows.reduce((n, r) => n + r.count, 0);
  }));

  const checkIds = [...new Set([...perCheckNow.keys(), ...perCheckPrev.keys()])].filter(Boolean);
  const checks = await loadChecks(client, checkIds);
  const inScope = (id: string) => !categories || categories.includes(checks.get(id)?.category ?? '');

  // 3. Group by category and priority.
  const catAgg = new Map<string, { findings: number; checks: number; previous: number }>();
  const prioAgg = new Map<string, { findings: number; checks: number }>();
  for (const id of checkIds) {
    if (!inScope(id)) continue;
    const c = checks.get(id);
    const nowN = perCheckNow.get(id) ?? 0;
    const prevN = perCheckPrev.get(id) ?? 0;
    const cat = c?.category || 'unknown';
    const ca = catAgg.get(cat) ?? { findings: 0, checks: 0, previous: 0 };
    ca.findings += nowN; ca.previous += prevN; if (nowN) ca.checks += 1;
    catAgg.set(cat, ca);
    if (nowN) {
      const p = PRIORITY_LABEL[c?.priority ?? ''] ?? (c?.priority || 'unknown');
      const pa = prioAgg.get(p) ?? { findings: 0, checks: 0 };
      pa.findings += nowN; pa.checks += 1;
      prioAgg.set(p, pa);
    }
  }

  const ranked = checkIds
    .filter((id) => inScope(id) && (perCheckNow.get(id) ?? 0) > 0)
    .sort((a, b) => (Number(checks.get(a)?.priority) || 9) - (Number(checks.get(b)?.priority) || 9) || (perCheckNow.get(b) ?? 0) - (perCheckNow.get(a) ?? 0));
  const topIds = ranked.slice(0, topN);

  const trendOf = (now: number, prev: number | undefined, hasPrev: boolean) => {
    if (!hasPrev) return 'no previous run';
    if (!prev) return 'new';
    if (now > prev) return 'worse';
    if (now < prev) return 'better';
    return 'same';
  };
  const anyPrevious = focus.some((f) => f.previous);

  const summary: InstanceScanSummary = {
    generated_at: new Date().toISOString(),
    scope: { categories: categories ?? 'all', result: opts.result },
    runs: runs.map((r) => ({
      scans: r.scans.join(', ') || '(unnamed combo)',
      combo_sys_id: r.combo || undefined,
      latest: r.latest ? `${r.latest.number} ${r.latest.state} ${r.latest.created} findings=${r.latest.finding_count}` : undefined,
      previous: r.previous ? `${r.previous.number} ${r.previous.state} ${r.previous.created} findings=${r.previous.finding_count}` : undefined,
      finding_delta: r.finding_delta,
      runs_last_30_days: r.runs_last_30_days,
      scores: r.latest ? scores.get(r.latest.sys_id) : undefined,
    })),
    analysed_results: focus.map((f) => ({
      result: f.current.number,
      result_sys_id: f.current.sys_id,
      scans: f.scans.join(', ') || undefined,
      state: f.current.state,
      created: f.current.created,
      findings: f.current.finding_count,
      execution_time_s: Math.round(f.current.execution_time_ms / 1000),
      scores: scores.get(f.current.sys_id),
      previous: f.previous ? { result: f.previous.number, created: f.previous.created, findings: f.previous.finding_count, scores: scores.get(f.previous.sys_id) } : undefined,
    })),
    by_category: [...catAgg.entries()].sort((a, b) => b[1].findings - a[1].findings).map(([category, v]) => ({
      category, findings: v.findings, checks_with_findings: v.checks, previous_findings: anyPrevious ? v.previous : undefined,
    })),
    by_priority: [...prioAgg.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([priority, v]) => ({ priority, findings: v.findings, checks: v.checks })),
    top_checks: topIds.map((id) => {
      const c = checks.get(id);
      const nowN = perCheckNow.get(id) ?? 0;
      const prevN = perCheckPrev.get(id);
      return {
        check: c?.name || id,
        check_sys_id: id,
        category: c?.category,
        priority: PRIORITY_LABEL[c?.priority ?? ''] ?? c?.priority,
        type: c?.type,
        app: c?.app,
        findings: nowN,
        previous: anyPrevious ? (prevN ?? 0) : undefined,
        trend: trendOf(nowN, prevN, anyPrevious),
        description: c?.short_description,
        remediation: c?.resolution || undefined,
        documentation_url: c?.documentation_url || undefined,
      };
    }),
    resolved_checks: checkIds
      .filter((id) => inScope(id) && !(perCheckNow.get(id)) && (perCheckPrev.get(id) ?? 0) > 0)
      .slice(0, 20)
      .map((id) => ({ check: checks.get(id)?.name || id, category: checks.get(id)?.category, previous_findings: perCheckPrev.get(id) })),
    by_table: [...perTable.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([table, findings]) => ({ table, findings })),
    by_app: [...perApp.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([app, findings]) => ({ app, findings })),
    notes,
  };
  if (categories) notes.push(`Only checks in categories: ${categories.join(', ')}. Table and app counts cover all categories of the analysed results.`);
  if (muted) notes.push(`${muted} findings in the analysed results are muted and left out of the counts.`);
  if (ranked.length > topIds.length) notes.push(`${ranked.length - topIds.length} more checks with findings are not listed.`);

  if (opts.compact) return summary;

  // 4. Inventory: what the instance can scan for.
  summary.inventory = await safe(async () => {
    const [byCat, byPrio, byType, suites, inactive, mutes, queued, props, recent] = await Promise.all([
      aggregate(client, 'scan_check', 'category', 'active=true'),
      aggregate(client, 'scan_check', 'priority', 'active=true'),
      aggregate(client, 'scan_check', 'sys_class_name', 'active=true'),
      client.queryRecords({ table: 'scan_check_suite', query: 'active=true', fields: 'sys_id', limit: 1000 }),
      aggregate(client, 'scan_check', 'active', 'active=false'),
      safe(() => aggregate(client, 'scan_mute_rule', 'sys_class_name'), []),
      safe(() => aggregate(client, 'scan_queue', 'status'), []),
      safe(() => client.queryRecords({ table: 'sys_properties', query: 'nameSTARTSWITHglide.scan.', fields: 'name,value', limit: 30 }), { count: 0, records: [] as any[] }),
      aggregate(client, 'scan_result', 'state', 'sys_created_on>=javascript:gs.daysAgoStart(30)'),
    ]);
    return {
      active_checks_by_category: sumByKey(byCat),
      active_checks_by_priority: sumByKey(byPrio, (k) => PRIORITY_LABEL[k] ?? (k || '(none)')),
      active_checks_by_type: sumByKey(byType, (k) => k.replace(/^scan_/, '')),
      inactive_checks: inactive.reduce((n, r) => n + r.count, 0),
      active_suites: suites.records.length,
      mute_rules: mutes.reduce((n, r) => n + r.count, 0),
      queued_scans: sumByKey(queued),
      scan_results_last_30_days: sumByKey(recent),
      properties: Object.fromEntries(props.records.map((p: any) => [refValue(p.name), refValue(p.value)])),
    };
  }, undefined);

  // 5. AI, Now Assist and agent coverage.
  summary.ai_coverage = await safe(async () => {
    const aiChecks = await client.queryRecords({
      table: 'scan_check',
      query: AI_CHECK_QUERY,
      fields: 'sys_id,name,category,priority,active,sys_scope.name',
      limit: 100,
    });
    const [agents, skills] = await Promise.all([
      safe(() => aggregate(client, 'sn_aia_agent', 'sys_class_name'), []),
      safe(() => aggregate(client, 'sn_nowassist_skill_config', 'active'), []),
    ]);
    const list = aiChecks.records.map((c: any) => ({
      check: refValue(c.name),
      category: refValue(c.category),
      priority: PRIORITY_LABEL[refValue(c.priority)] ?? refValue(c.priority),
      active: refValue(c.active) === 'true',
      app: refValue(c['sys_scope.name']),
      findings_in_analysed_results: perCheckNow.get(refValue(c.sys_id)) ?? 0,
    }));
    return {
      ai_related_checks: list.length,
      active_ai_related_checks: list.filter((c) => c.active).length,
      checks: list.slice(0, 30),
      ai_agents_on_instance: agents.length ? agents.reduce((n, r) => n + r.count, 0) : 'not readable or not installed',
      now_assist_skill_configs: skills.length ? sumByKey(skills, (k) => (k === 'true' ? 'active' : 'inactive')) : 'not readable or not installed',
      note: list.length
        ? 'Checks matched by name, description or application. Review each for relevance.'
        : 'No Instance Scan checks on this instance target Now Assist, AI agents or generative AI. AI governance needs other tooling (for example AI Control Tower or a custom suite).',
    };
  }, undefined);

  // 6. Sample findings for the top checks, so the report can point at real records.
  if (samplesPer > 0 && focus.length) {
    const ids = focus.map((f) => f.current.sys_id).join(',');
    const sampleIds = topIds.slice(0, 8);
    const samples = await Promise.all(sampleIds.map((id) => safe(() => client.queryRecords({
      table: 'scan_finding',
      query: `resultIN${ids}^check=${id}^muted=false`,
      fields: 'source_table,source,finding_details,result.number',
      limit: samplesPer,
    }), { count: 0, records: [] as any[] })));
    summary.sample_findings = samples.flatMap((s, i) => s.records.map((f: any) => ({
      check: checks.get(sampleIds[i]!)?.name,
      result: refValue(f['result.number']),
      table: refValue(f.source_table),
      record: refValue(f.source),
      details: stripHtml(f.finding_details, 220),
    })));
  }

  return summary;
}

// ─── Running scans ────────────────────────────────────────────────────────────

export type ScanType = 'full' | 'point' | 'suite' | 'combo' | 'scoped_apps' | 'update_sets';

export interface ScanSpec {
  scan_type: ScanType;
  /** Suite name or sys_id (suite, scoped_apps, update_sets). */
  suite?: string;
  combo_sys_id?: string;
  target_table?: string;
  target_sys_id?: string;
  app_scope_sys_ids?: string[];
  update_set_sys_ids?: string[];
}

/**
 * Parse a CLI scan spec: "full", "suite:<name|sys_id>", "combo:<sys_id>", "point:<table>:<sys_id>",
 * "apps:<suite>:<scope_id,...>", "update-sets:<suite>:<update_set_id,...>".
 */
export function parseScanSpec(spec: string): ScanSpec {
  const s = String(spec || '').trim();
  if (!s) throw new ServiceNowError('Scan spec is empty', 'INVALID_REQUEST');
  if (s.toLowerCase() === 'full') return { scan_type: 'full' };
  const idx = s.indexOf(':');
  const kind = (idx < 0 ? s : s.slice(0, idx)).toLowerCase();
  const rest = idx < 0 ? '' : s.slice(idx + 1);
  const ids = (v: string) => v.split(',').map((x) => x.trim()).filter(Boolean);
  const lastColon = rest.lastIndexOf(':');
  switch (kind) {
    case 'suite': return { scan_type: 'suite', suite: rest };
    case 'combo': return { scan_type: 'combo', combo_sys_id: rest };
    case 'point': {
      const [table, sysId] = rest.split(':');
      return { scan_type: 'point', target_table: table, target_sys_id: sysId };
    }
    case 'apps':
    case 'scoped_apps':
      return { scan_type: 'scoped_apps', suite: rest.slice(0, lastColon), app_scope_sys_ids: ids(rest.slice(lastColon + 1)) };
    case 'update-sets':
    case 'update_sets':
      return { scan_type: 'update_sets', suite: rest.slice(0, lastColon), update_set_sys_ids: ids(rest.slice(lastColon + 1)) };
    default:
      // A bare value is a suite name or sys_id.
      return { scan_type: 'suite', suite: s };
  }
}

async function resolveSuite(client: ServiceNowClient, suite: string): Promise<{ sys_id: string; name: string }> {
  const s = String(suite || '').trim();
  if (!s) throw new ServiceNowError('suite (name or sys_id) is required for this scan type', 'INVALID_REQUEST');
  const resp = await client.queryRecords({
    table: 'scan_check_suite',
    query: SYS_ID.test(s) ? `sys_id=${s}` : `name=${s}`,
    fields: 'sys_id,name,active',
    limit: 2,
  });
  if (!resp.records.length) throw new ServiceNowError(`Scan suite not found: ${s}. Use list_scan_suites to see the suites on this instance.`, 'NOT_FOUND');
  if (resp.records.length > 1) throw new ServiceNowError(`More than one suite is called "${s}". Pass its sys_id instead.`, 'INVALID_REQUEST');
  return { sys_id: refValue(resp.records[0].sys_id), name: refValue(resp.records[0].name) };
}

/** The saved combo that scans a suite on the whole instance, if the suite has been run before. */
export async function findSuiteCombo(client: ServiceNowClient, suiteSysId: string): Promise<string | undefined> {
  const sources = await client.queryRecords({ table: 'scan_source', query: `table=scan_check_suite^record_id=${suiteSysId}`, fields: 'sys_id', limit: 20 });
  for (const src of sources.records) {
    const combos = await client.queryRecords({ table: 'scan_combo', query: `sourcesLIKE${refValue(src.sys_id)}^targetsISEMPTY`, fields: 'sys_id', limit: 1 });
    if (combos.records[0]) return refValue(combos.records[0].sys_id);
  }
  return undefined;
}

export interface ScanStart {
  scan_type: ScanType;
  endpoint: string;
  progress_id?: string;
  status: string;
  status_message?: string;
  suite?: string;
  combo_sys_id?: string;
  raw: unknown;
}

/** Start an Instance Scan through the CI/CD API. Returns the progress id to poll. */
export async function startInstanceScan(client: ServiceNowClient, spec: ScanSpec): Promise<ScanStart> {
  let endpoint: string;
  let body: Record<string, unknown> = {};
  let suiteName: string | undefined;
  let combo = spec.combo_sys_id;
  switch (spec.scan_type) {
    case 'full':
      endpoint = '/api/sn_cicd/instance_scan/full_scan';
      break;
    case 'point': {
      if (!spec.target_table || !spec.target_sys_id) throw new ServiceNowError('target_table and target_sys_id are required for a point scan', 'INVALID_REQUEST');
      if (!SYS_ID.test(spec.target_sys_id)) throw new ServiceNowError('target_sys_id must be a 32-character sys_id', 'INVALID_REQUEST');
      await client.getRecord(spec.target_table, spec.target_sys_id, 'sys_id'); // fail early with NOT_FOUND
      endpoint = `/api/sn_cicd/instance_scan/point_scan?target_table=${encodeURIComponent(spec.target_table)}&target_sys_id=${encodeURIComponent(spec.target_sys_id)}`;
      break;
    }
    case 'suite': {
      const suite = await resolveSuite(client, spec.suite ?? '');
      suiteName = suite.name;
      combo = await findSuiteCombo(client, suite.sys_id);
      if (!combo) {
        throw new ServiceNowError(
          `Suite "${suite.name}" has no saved instance-wide scan (scan_combo) yet, and the CI/CD API can only re-run a saved one. ` +
          'Run the suite once from Instance Scan > Suites (Execute Scan), or scan it against apps or update sets with scan_type scoped_apps or update_sets.',
          'INVALID_REQUEST');
      }
      endpoint = `/api/sn_cicd/instance_scan/suite_scan/combo/${combo}`;
      break;
    }
    case 'combo': {
      if (!combo || !SYS_ID.test(combo)) throw new ServiceNowError('combo_sys_id (32-character sys_id) is required for a combo scan', 'INVALID_REQUEST');
      await client.getRecord('scan_combo', combo, 'sys_id');
      endpoint = `/api/sn_cicd/instance_scan/suite_scan/combo/${combo}`;
      break;
    }
    case 'scoped_apps': {
      const suite = await resolveSuite(client, spec.suite ?? '');
      suiteName = suite.name;
      if (!spec.app_scope_sys_ids?.length) throw new ServiceNowError('app_scope_sys_ids is required for a scoped_apps scan', 'INVALID_REQUEST');
      endpoint = `/api/sn_cicd/instance_scan/suite_scan/${suite.sys_id}/scoped_apps`;
      body = { app_scope_sys_ids: spec.app_scope_sys_ids };
      break;
    }
    case 'update_sets': {
      const suite = await resolveSuite(client, spec.suite ?? '');
      suiteName = suite.name;
      if (!spec.update_set_sys_ids?.length) throw new ServiceNowError('update_set_sys_ids is required for an update_sets scan', 'INVALID_REQUEST');
      endpoint = `/api/sn_cicd/instance_scan/suite_scan/${suite.sys_id}/update_sets`;
      body = { update_set_sys_ids: spec.update_set_sys_ids };
      break;
    }
    default:
      throw new ServiceNowError(`Unknown scan_type: ${String((spec as any).scan_type)}. Use full, point, suite, combo, scoped_apps or update_sets.`, 'INVALID_REQUEST');
  }
  let raw: any;
  try {
    raw = await client.apiRequest('POST', endpoint, body);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new ServiceNowError(
      `Could not start the ${spec.scan_type} scan through the CI/CD API (${endpoint.split('?')[0]}): ${msg}. ` +
      'This needs the CI/CD REST API (com.snc.cicd) and the sn_cicd.sys_ci_automation or admin role.',
      'SCAN_START_FAILED');
  }
  const r = unwrap(raw);
  return {
    scan_type: spec.scan_type,
    endpoint: endpoint.split('?')[0]!,
    progress_id: r?.links?.progress?.id,
    status: CICD_STATUS[String(r?.status)] ?? String(r?.status_label || 'unknown').toLowerCase(),
    status_message: r?.status_message || r?.error || undefined,
    suite: suiteName,
    combo_sys_id: combo,
    raw: r,
  };
}

export interface ScanProgress {
  status: string;
  percent?: number;
  message?: string;
  error?: string;
  scan_result_sys_id?: string;
}

export async function getScanProgress(client: ServiceNowClient, progressId: string): Promise<ScanProgress> {
  const p = unwrap(await client.apiRequest('GET', `/api/sn_cicd/progress/${encodeURIComponent(progressId)}`));
  const sourceUrl = String(p?.links?.source?.url || '');
  return {
    status: CICD_STATUS[String(p?.status)] ?? String(p?.status_label || p?.status || 'unknown').toLowerCase(),
    percent: p?.percent_complete !== undefined ? Number(p.percent_complete) : undefined,
    message: p?.status_message || undefined,
    error: p?.error || undefined,
    scan_result_sys_id: p?.links?.source?.id && (!sourceUrl || sourceUrl.includes('scan_result')) ? String(p.links.source.id) : undefined,
  };
}

export const isFinalScanStatus = (s: string) => ['successful', 'failed', 'canceled'].includes(s);

/** Outcome of a finished scan: the result record, finding count and scores. */
export async function scanOutcome(client: ServiceNowClient, progress: ScanProgress, progressId: string): Promise<Record<string, unknown>> {
  let result: ScanResultRow | undefined;
  try {
    result = progress.scan_result_sys_id
      ? await resolveScanResult(client, progress.scan_result_sys_id)
      : await resolveScanResult(client, progressId);
  } catch { /* the result record is optional */ }
  const scores = result ? await safe(() => scoresFor(client, [result!.sys_id]), new Map()) : new Map();
  return {
    status: progress.status,
    status_message: progress.message,
    error: progress.error,
    scan_result: result?.number,
    scan_result_sys_id: result?.sys_id ?? progress.scan_result_sys_id,
    finding_count: result?.finding_count,
    execution_time_s: result ? Math.round(result.execution_time_ms / 1000) : undefined,
    scores: result ? scores.get(result.sys_id) : undefined,
    details: result ? `Use get_instance_scan_summary with result ${result.number} for findings grouped by category, check and table.` : undefined,
  };
}

export interface WaitOptions {
  pollMs?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
  onProgress?: (p: ScanProgress) => void;
}

/** Poll a scan until it finishes (or the timeout passes), then return its outcome. */
export async function waitForInstanceScan(client: ServiceNowClient, progressId: string, opts: WaitOptions = {}): Promise<Record<string, unknown>> {
  const pollMs = opts.pollMs ?? 5000;
  const deadline = Date.now() + (opts.timeoutMs ?? 15 * 60_000);
  for (;;) {
    if (opts.signal?.aborted) throw opts.signal.reason ?? new Error('aborted');
    const p = await getScanProgress(client, progressId);
    opts.onProgress?.(p);
    if (isFinalScanStatus(p.status)) return scanOutcome(client, p, progressId);
    if (Date.now() >= deadline) {
      return { status: 'still_running', progress_id: progressId, percent: p.percent, note: 'The scan is still running in ServiceNow. Check it later with the progress id.' };
    }
    await new Promise<void>((resolve) => setTimeout(resolve, pollMs));
  }
}

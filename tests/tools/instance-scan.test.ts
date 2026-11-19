import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import type { ServiceNowClient } from '../../src/servicenow/client.js';
import {
  parseScanSpec,
  stripHtml,
  startInstanceScan,
  getInstanceScanSummary,
  isScanCategory,
} from '../../src/servicenow/instance-scan.js';
import { executePlatformOpsToolCall, getPlatformOpsToolDefinitions } from '../../src/tools/platform-ops.js';

const SUITE = 'a'.repeat(32);
const COMBO = 'b'.repeat(32);
const SOURCE = 'c'.repeat(32);
const R_NOW = '1'.repeat(32);
const R_PREV = '2'.repeat(32);
const CHK_SEC = '3'.repeat(32);
const CHK_PERF = '4'.repeat(32);
const CHK_OLD = '5'.repeat(32);

type Rec = Record<string, any>;
const rows = (records: Rec[]) => ({ count: records.length, records });
const agg = (pairs: Array<[string, number]>) => pairs.map(([value, count]) => ({ stats: { count: String(count) }, groupby_fields: [{ field: 'x', value }] }));

/** A small fake instance: one saved scan (combo) of one suite, run twice. */
function fakeScanInstance() {
  const queryRecords = vi.fn(async ({ table, query }: { table: string; query?: string }) => {
    const q = query ?? '';
    switch (table) {
      case 'scan_combo':
        return q.startsWith('sourcesLIKE') ? rows([{ sys_id: COMBO }]) : rows([{ sys_id: COMBO, number: 'SC1', sources: SOURCE }]);
      case 'scan_source':
        return rows([{ sys_id: SOURCE, table: 'scan_check_suite', record_id: { value: SUITE } }]);
      case 'scan_check_suite':
        return q.startsWith('active=') ? rows([{ sys_id: SUITE }]) : rows([{ sys_id: SUITE, name: 'Hardening', active: 'true' }]);
      case 'scan_result':
        if (q.startsWith('comboISEMPTY')) return rows([]);
        return rows([
          { sys_id: R_NOW, number: 'SR2', state: 'complete', scan_type: 'instance_scan', finding_count: '7', execution_time: '4000', sys_created_on: '2026-11-19 07:00:00', combo: { value: COMBO } },
          { sys_id: R_PREV, number: 'SR1', state: 'complete', scan_type: 'instance_scan', finding_count: '5', execution_time: '3000', sys_created_on: '2026-11-18 07:00:00', combo: { value: COMBO } },
        ]);
      case 'scan_score':
        return rows([
          { result: { value: R_NOW }, category: 'overall', score: '70' },
          { result: { value: R_PREV }, category: 'overall', score: '75' },
        ]);
      case 'scan_check':
        return rows([
          { sys_id: CHK_SEC, name: 'Weak password policy', category: 'security', priority: '1', short_description: 'Checks the <b>password</b> policy', resolution_details: 'Set a minimum length of 12.', documentation_url: 'https://example.test/doc', sys_class_name: 'scan_script_only_check', 'sys_scope.name': 'Security Center', active: 'true' },
          { sys_id: CHK_PERF, name: 'Unindexed query', category: 'performance', priority: '3', short_description: '', resolution_details: '', documentation_url: '', sys_class_name: 'scan_table_check', 'sys_scope.name': 'Global', active: 'true' },
          { sys_id: CHK_OLD, name: 'Old check', category: 'security', priority: '2', short_description: '', resolution_details: '', documentation_url: '', sys_class_name: 'scan_table_check', 'sys_scope.name': 'Global', active: 'true' },
        ].filter((c) => !q.startsWith('sys_idIN') || q.includes(c.sys_id)));
      case 'scan_finding':
        return rows([{ source_table: 'sys_user', source: { value: 'u1' }, finding_details: 'User <a href=x>Abel</a> has a direct role', 'result.number': 'SR2' }]);
      case 'sys_properties':
        return rows([{ name: 'glide.scan.parallel_scan_enabled', value: 'true' }]);
      default:
        return rows([]);
    }
  });
  const runAggregateQuery = vi.fn(async (table: string, groupBy: string, _a: string, query?: string) => {
    const q = query ?? '';
    if (table === 'scan_finding' && groupBy === 'check') {
      if (q.startsWith(`result=${R_NOW}`)) return agg([[CHK_SEC, 5], [CHK_PERF, 2]]);
      if (q.startsWith(`result=${R_PREV}`)) return agg([[CHK_SEC, 3], [CHK_OLD, 2]]);
    }
    if (table === 'scan_finding' && groupBy === 'source_table') return agg([['sys_user', 5], ['sys_script', 2]]);
    if (table === 'scan_check' && groupBy === 'category') return agg([['security', 10], ['performance', 4]]);
    if (table === 'scan_result' && groupBy === 'state') return agg([['complete', 2]]);
    return [];
  });
  return {
    queryRecords,
    runAggregateQuery,
    apiRequest: vi.fn(),
    getRecord: vi.fn(async () => ({ sys_id: 'x' })),
  } as unknown as ServiceNowClient & Record<string, ReturnType<typeof vi.fn>>;
}

describe('scan spec parsing and helpers', () => {
  it('parses every scan spec form', () => {
    expect(parseScanSpec('full')).toEqual({ scan_type: 'full' });
    expect(parseScanSpec('suite:Instance Security Hardening Settings')).toEqual({ scan_type: 'suite', suite: 'Instance Security Hardening Settings' });
    expect(parseScanSpec(`combo:${COMBO}`)).toEqual({ scan_type: 'combo', combo_sys_id: COMBO });
    expect(parseScanSpec(`point:sys_script:${SUITE}`)).toEqual({ scan_type: 'point', target_table: 'sys_script', target_sys_id: SUITE });
    expect(parseScanSpec(`apps:My suite:${SUITE},${COMBO}`)).toEqual({ scan_type: 'scoped_apps', suite: 'My suite', app_scope_sys_ids: [SUITE, COMBO] });
    expect(parseScanSpec(`update-sets:${SUITE}:${COMBO}`)).toEqual({ scan_type: 'update_sets', suite: SUITE, update_set_sys_ids: [COMBO] });
    expect(parseScanSpec('Deprecated APIs')).toEqual({ scan_type: 'suite', suite: 'Deprecated APIs' });
    expect(() => parseScanSpec('')).toThrow('empty');
  });

  it('strips HTML from finding details and cuts long text', () => {
    expect(stripHtml('User <a href=x>Abel</a> &amp; co')).toBe('User Abel & co');
    expect(stripHtml('x'.repeat(50), 10)).toBe('xxxxxxx...');
  });

  it('recognises scan categories', () => {
    expect(isScanCategory('security')).toBe(true);
    expect(isScanCategory('security,performance')).toBe(true);
    expect(isScanCategory('instance')).toBe(false);
    expect(isScanCategory(undefined)).toBe(false);
  });
});

describe('startInstanceScan', () => {
  it('re-runs a suite through its saved combo', async () => {
    const client = fakeScanInstance();
    client.apiRequest.mockResolvedValue({ result: { status: '0', status_label: 'Pending', links: { progress: { id: 'prog1' } } } });
    const started = await startInstanceScan(client, { scan_type: 'suite', suite: 'Hardening' });
    expect(client.apiRequest).toHaveBeenCalledWith('POST', `/api/sn_cicd/instance_scan/suite_scan/combo/${COMBO}`, {});
    expect(started).toMatchObject({ scan_type: 'suite', progress_id: 'prog1', status: 'pending', suite: 'Hardening', combo_sys_id: COMBO });
  });

  it('sends update_set_sys_ids for an update set scan', async () => {
    const client = fakeScanInstance();
    client.apiRequest.mockResolvedValue({ result: { status: '0', links: { progress: { id: 'p2' } } } });
    await startInstanceScan(client, { scan_type: 'update_sets', suite: SUITE, update_set_sys_ids: [COMBO] });
    expect(client.apiRequest).toHaveBeenCalledWith('POST', `/api/sn_cicd/instance_scan/suite_scan/${SUITE}/update_sets`, { update_set_sys_ids: [COMBO] });
  });

  it('rejects a point scan without a valid record', async () => {
    const client = fakeScanInstance();
    await expect(startInstanceScan(client, { scan_type: 'point', target_table: 'sys_script' })).rejects.toThrow('target_table and target_sys_id');
    await expect(startInstanceScan(client, { scan_type: 'point', target_table: 'sys_script', target_sys_id: 'abc' })).rejects.toThrow('32-character');
    expect(client.apiRequest).not.toHaveBeenCalled();
  });

  it('explains when a suite has never been run instance-wide', async () => {
    const client = fakeScanInstance();
    client.queryRecords.mockImplementation(async ({ table }: { table: string }) => (
      table === 'scan_check_suite' ? rows([{ sys_id: SUITE, name: 'Never run' }]) : rows([])
    ));
    await expect(startInstanceScan(client, { scan_type: 'suite', suite: 'Never run' })).rejects.toThrow('no saved instance-wide scan');
  });
});

describe('getInstanceScanSummary', () => {
  it('groups findings by category, priority, check and table, with the trend against the previous run', async () => {
    const client = fakeScanInstance();
    const s = await getInstanceScanSummary(client, {});
    expect(s.runs[0]).toMatchObject({ scans: 'Hardening', finding_delta: 2, scores: { overall: 70 } });
    expect(s.analysed_results[0]).toMatchObject({ result: 'SR2', findings: 7, previous: { result: 'SR1', findings: 5 } });
    expect(s.by_category).toEqual([
      { category: 'security', findings: 5, checks_with_findings: 1, previous_findings: 5 },
      { category: 'performance', findings: 2, checks_with_findings: 1, previous_findings: 0 },
    ]);
    expect(s.by_priority).toEqual([
      { priority: '1 - Critical', findings: 5, checks: 1 },
      { priority: '3 - Moderate', findings: 2, checks: 1 },
    ]);
    expect(s.top_checks[0]).toMatchObject({ check: 'Weak password policy', findings: 5, previous: 3, trend: 'worse', remediation: 'Set a minimum length of 12.', description: 'Checks the password policy' });
    expect(s.top_checks[1]).toMatchObject({ check: 'Unindexed query', trend: 'new' });
    expect(s.resolved_checks).toEqual([{ check: 'Old check', category: 'security', previous_findings: 2 }]);
    expect(s.by_table[0]).toEqual({ table: 'sys_user', findings: 5 });
    expect(s.inventory).toMatchObject({ active_checks_by_category: { security: 10, performance: 4 }, active_suites: 1 });
    expect(s.sample_findings?.[0]).toMatchObject({ check: 'Weak password policy', table: 'sys_user', details: 'User Abel has a direct role' });
  });

  it('filters to the requested categories', async () => {
    const client = fakeScanInstance();
    const s = await getInstanceScanSummary(client, { categories: 'performance', compact: true });
    expect(s.by_category.map((c) => c.category)).toEqual(['performance']);
    expect(s.top_checks.map((c) => c.check)).toEqual(['Unindexed query']);
    expect(s.inventory).toBeUndefined();
    expect(s.ai_coverage).toBeUndefined();
  });
});

describe('Instance Scan MCP tools', () => {
  beforeEach(() => { delete process.env.WRITE_ENABLED; });
  afterEach(() => { delete process.env.WRITE_ENABLED; });

  it('defines run_instance_scan and get_instance_scan_summary, and keeps the old findings filters', () => {
    const defs = getPlatformOpsToolDefinitions();
    const findings = defs.find((d) => d.name === 'get_instance_scan_findings')!;
    expect(Object.keys(findings.inputSchema.properties)).toEqual(expect.arrayContaining(['check', 'suite_result', 'table', 'limit', 'result', 'category', 'priority']));
    expect(defs.find((d) => d.name === 'run_instance_scan')!.inputSchema.required).toEqual(['scan_type']);
    expect(defs.find((d) => d.name === 'get_instance_scan_summary')).toBeTruthy();
  });

  it('get_instance_scan_findings maps filters onto real scan_finding fields', async () => {
    const client = fakeScanInstance();
    client.queryRecords.mockImplementation(async ({ table }: { table: string }) => {
      if (table === 'scan_result') return rows([{ sys_id: R_NOW, number: 'SR2', combo: '' }]);
      return rows([{ sys_id: 'f1', 'check.name': 'Weak password policy', 'check.category': 'security', 'check.priority': '1', source_table: 'sys_user', source: { value: 'u1' }, finding_details: '<b>bad</b>', 'result.number': 'SR2', result: { value: R_NOW } }]);
    });
    const out = await executePlatformOpsToolCall(client, 'get_instance_scan_findings', { result: 'SR2', table: 'sys_user', category: 'Security', priority: '1, 2' });
    const call = client.queryRecords.mock.calls.find((c: any[]) => c[0].table === 'scan_finding')![0];
    expect(call.query).toBe(`result=${R_NOW}^source_table=sys_user^check.category=security^check.priorityIN1,2^muted=false^ORDERBYDESCsys_created_on`);
    expect(out.records[0]).toMatchObject({ check_name: 'Weak password policy', table: 'sys_user', record: 'u1', details: 'bad', result: 'SR2' });
  });

  it('run_instance_scan needs WRITE_ENABLED', async () => {
    const client = fakeScanInstance();
    await expect(executePlatformOpsToolCall(client, 'run_instance_scan', { scan_type: 'full' })).rejects.toThrow('WRITE_ENABLED');
    expect(client.apiRequest).not.toHaveBeenCalled();
  });
});

describe('run_instance_scan as a job', () => {
  let jobs: typeof import('../../src/tools/jobs.js');
  let store: typeof import('../../src/utils/jobs.js');
  let tools: typeof import('../../src/tools/index.js');

  beforeAll(async () => {
    process.env.NOWAIKIT_JOB_POLL_MS = '10';
    jobs = await import('../../src/tools/jobs.js');
    store = await import('../../src/utils/jobs.js');
    tools = await import('../../src/tools/index.js');
  });
  beforeEach(() => { process.env.WRITE_ENABLED = 'true'; store.jobStore.clear(); });
  afterEach(() => { delete process.env.WRITE_ENABLED; });

  it('follows the CI/CD progress API and reports the scan result, findings and scores', async () => {
    const client = fakeScanInstance();
    const progress = [
      { result: { status: '1', percent_complete: 50, status_message: 'Scanning' } },
      { result: { status: '2', percent_complete: 100, status_message: 'Scan completed with 0 warning(s), 0 error(s), and 7 finding(s)', links: { source: { id: R_NOW, url: `https://x/api/now/table/scan_result/${R_NOW}` } } } },
    ];
    client.apiRequest.mockImplementation(async (method: string, path: string) => {
      if (method === 'POST' && path === '/api/sn_cicd/instance_scan/full_scan') return { result: { status: '0', links: { progress: { id: 'prog9' } } } };
      if (method === 'GET' && path === '/api/sn_cicd/progress/prog9') return progress.shift() ?? progress[0];
      throw new Error(`unexpected ${method} ${path}`);
    });
    const execute = (c: ServiceNowClient, n: string, a: Record<string, any>) => tools.executeTool(c, n, a);
    const started = await jobs.runLongRunningTool(client, 'run_instance_scan', { scan_type: 'full' }, execute, true) as any;
    expect(started).toMatchObject({ status: 'running', tool: 'run_instance_scan' });
    const done = await tools.executeTool(client, 'get_job', { job_id: started.job_id, wait_seconds: 5 });
    expect(done.status).toBe('completed');
    expect(done.result).toMatchObject({
      action: 'scan_started',
      progress_id: 'prog9',
      outcome: { status: 'successful', scan_result: 'SR2', scan_result_sys_id: R_NOW, finding_count: 7, scores: { overall: 70 } },
    });
  });

  it('is long-running and annotated as a non-destructive write; the summary is read-only', () => {
    const all = tools.getTools() as Array<any>;
    const run = all.find((t) => t.name === 'run_instance_scan');
    expect(run.inputSchema.properties.async.type).toBe('boolean');
    expect(run.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: false });
    expect(all.find((t) => t.name === 'get_instance_scan_summary').annotations.readOnlyHint).toBe(true);
  });
});

describe('direct mode data gathering', () => {
  it('splits the scan summary into instance_scan sections', async () => {
    const { gatherInstanceScanData } = await import('../../src/direct/executor.js');
    const client = fakeScanInstance();
    const full = await gatherInstanceScanData(client, {}, undefined, false);
    expect(Object.keys(full)).toEqual(expect.arrayContaining([
      'instance_scan_runs', 'instance_scan_analysed_results', 'instance_scan_findings_by_category_and_priority',
      'instance_scan_top_checks_1', 'instance_scan_trend_resolved_checks', 'instance_scan_by_table_and_app',
      'instance_scan_inventory', 'instance_scan_ai_agent_coverage', 'instance_scan_sample_findings',
    ]));
    const compact = await gatherInstanceScanData(client, {}, ['security'], true);
    expect(compact['instance_scan_inventory']).toBeUndefined();
    expect((compact['instance_scan_top_checks'] as any[]).map((c) => c.check)).toEqual(['Weak password policy']);
  });

  it('the enriched capabilities ask for Instance Scan findings in their categories', async () => {
    const caps = await Promise.all(['scan-health', 'scan-security', 'scan-debt', 'scan-upgrade', 'scan-instance']
      .map(async (n) => (await import(`../../src/prompts/capabilities/${n}.ts`)).default as import('../../src/prompts/types.js').CapabilityDefinition));
    const by = (n: string) => caps.find((c) => c.name === n)!;
    const { getCapabilityMeta } = await import('../../src/prompts/index.js');
    expect(getCapabilityMeta().map((m) => m.name)).toContain('scan-instance');
    expect(by('scan-security').recommendedTools).toContain('get_instance_scan_findings');
    expect(by('scan-security').instanceScanCategories).toEqual(['security']);
    expect(by('scan-upgrade').instanceScanCategories).toEqual(['upgradability']);
    expect(by('scan-debt').instanceScanCategories).toEqual(['manageability', 'upgradability']);
    expect(by('scan-health').recommendedTools).toContain('get_instance_scan_findings');
    expect(by('scan-instance').recommendedTools).toContain('get_instance_scan_summary');
    const text = by('scan-instance').buildPrompt({ run_scan: 'suite:Deprecated APIs' }).map((m) => m.content.text).join('\n');
    expect(text).toContain('run_instance_scan');
    expect(text).not.toMatch(/[–—]/);
  });
});

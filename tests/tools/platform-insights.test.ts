import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executePlatformInsightsToolCall, getPlatformInsightsToolDefinitions, listUrl, mergeCoverage, mermaidForTrace } from '../../src/tools/platform-insights.js';
import { familiesBetween, nextFamily, normaliseFamily, parseBuildTag, releaseContext } from '../../src/servicenow/release.js';
import type { ServiceNowClient } from '../../src/servicenow/client.js';

const client = {
  instanceUrl: 'https://x.service-now.com',
  queryRecords: vi.fn(),
  runStats: vi.fn(),
  recordUrl: (t: string, id: string) => `https://x.service-now.com/${t}.do?sys_id=${id}`,
} as unknown as ServiceNowClient;
const q = client.queryRecords as ReturnType<typeof vi.fn>;
const stats = client.runStats as ReturnType<typeof vi.fn>;

beforeEach(() => vi.resetAllMocks());

describe('release awareness', () => {
  it('parses build tags', () => {
    expect(parseBuildTag('glide-australia-02-11-2026__patch5bw46-11-07-2026')).toMatchObject({ family: 'australia', family_label: 'Australia', patch: 5 });
    expect(parseBuildTag('glide-washingtondc-12-20-2023__patch2-hotfix1')).toMatchObject({ family: 'washingtondc', family_label: 'Washington DC', patch: 2, hotfix: 1 });
    expect(parseBuildTag('nonsense').family).toBeUndefined();
  });
  it('knows the order of families', () => {
    expect(nextFamily('australia')).toBe('brazil');
    expect(nextFamily('brazil')).toBeUndefined();
    expect(normaliseFamily('Washington DC')).toBe('washingtondc');
    expect(familiesBetween('zurich', 'brazil')).toEqual(['australia', 'brazil']);
  });
  it('lists Brazil changes for an Australia instance and both for a Zurich one', () => {
    const a = releaseContext('glide-australia-02-11-2026__patch5');
    expect(a.target).toMatchObject({ family: 'brazil', status: 'early_availability' });
    expect(a.changes_to_check.every((c) => c.release === 'Brazil')).toBe(true);
    expect(a.changes_to_check.some((c) => /Basic auth/.test(c.change))).toBe(true);
    const z = releaseContext('glide-zurich-07-01-2025__patch3', 'brazil');
    expect(new Set(z.changes_to_check.map((c) => c.release))).toEqual(new Set(['Australia', 'Brazil']));
    expect(releaseContext('glide-brazil-09-01-2026__patch2').note).toMatch(/newest family/);
  });
});

describe('platform insight definitions', () => {
  it('are read-only', () => {
    const defs = getPlatformInsightsToolDefinitions();
    expect(defs.map((d) => d.name)).toEqual(['get_release_info', 'list_process_mining_projects', 'get_process_mining_findings', 'get_atf_code_coverage', 'trace_table_operation', 'get_integration_auth_posture', 'get_csdm_health', 'get_cmdb_data_foundations', 'get_mcp_exposure']);
    for (const d of defs) expect(d.annotations.readOnlyHint).toBe(true);
  });
  it('builds list links', () => {
    expect(listUrl(client, 'sys_user', 'active=true^x=1')).toBe('https://x.service-now.com/sys_user_list.do?sysparm_query=active%3Dtrue%5Ex%3D1');
  });
});

describe('get_release_info', () => {
  it('returns the release, the next family and live counts with links', async () => {
    q.mockImplementation(async (p: any) => (p.table === 'sys_properties'
      ? { records: [{ name: 'glide.buildtag.last', value: 'glide-australia-02-11-2026__patch5' }] }
      : { records: [{ sys_id: 'u1', from_version: 'a', to_version: 'b', skipped: '3' }] }));
    stats.mockResolvedValue([{ stats: { count: 7 } }]);
    const r = await executePlatformInsightsToolCall(client, 'get_release_info', {});
    expect(r.current.family).toBe('australia');
    expect(r.target.family).toBe('brazil');
    expect(r.upgrade_history[0]).toMatchObject({ skipped: 3, record_url: expect.stringContaining('sys_upgrade_history') });
    expect(r.instance_checks.length).toBeGreaterThan(0);
    expect(r.instance_checks[0]).toMatchObject({ count: 7, list_url: expect.stringContaining('_list.do') });
  });
});

describe('Process Mining', () => {
  it('lists projects with finding counts and never-mined flags', async () => {
    q.mockResolvedValue({ records: [{ sys_id: 'p1', number: 'PRO1', name: 'Incidents', last_mined_time: '' }] });
    stats.mockResolvedValue([{ groupby_fields: [{ value: 'p1' }], stats: { count: 4 } }]);
    const r = await executePlatformInsightsToolCall(client, 'list_process_mining_projects', {});
    expect(r.projects[0]).toMatchObject({ number: 'PRO1', mined: false, automated_findings: 4, record_url: expect.stringContaining('promin_project') });
    expect(r.summary.never_mined).toBe(1);
    expect(q.mock.calls[0][0].query).toContain('is_template=false');
  });
  it('reports findings for one project and a clear error when the plugin is missing', async () => {
    q.mockImplementation(async (p: any) => {
      if (p.table === 'promin_project') return { records: [{ sys_id: 'p1', name: 'Incidents' }] };
      if (p.table === 'promin_automated_finding') return { records: [{ sys_id: 'f1', name: 'Rework', type: 'Rework', table: 'incident' }] };
      return { records: [] };
    });
    stats.mockResolvedValue([]);
    const r = await executePlatformInsightsToolCall(client, 'get_process_mining_findings', { project: 'PRO1' });
    expect(r.project).toBe('Incidents');
    expect(r.automated_findings[0].record_url).toContain('promin_automated_finding');
    q.mockReset();
    q.mockRejectedValue(new Error('Invalid table promin_automated_finding'));
    await expect(executePlatformInsightsToolCall(client, 'get_process_mining_findings', {})).rejects.toThrow(/Process Mining/);
  });
});

describe('ATF code coverage', () => {
  it('merges line coverage across runs', () => {
    const m = mergeCoverage([
      { table: 'sys_script', id: 'a', name: 'BR', covered: '{"lines":{"script":[1,2]}}', total: '{"lines":{"script":[1,2,3,4]}}', test: 'T1' },
      { table: 'sys_script', id: 'a', name: 'BR', covered: '{"lines":{"script":[3]}}', total: '{"lines":{"script":[1,2,3,4]}}', test: 'T2' },
      { table: 'sys_script_include', id: 'b', name: 'SI', covered: 'not json', total: '{"lines":{"script":[1]}}' },
    ]);
    expect(m.find((x) => x.id === 'a')).toMatchObject({ covered_lines: 3, executable_lines: 4, coverage_pct: 75, tests: ['T1', 'T2'] });
    expect(m.find((x) => x.id === 'b')).toMatchObject({ covered_lines: 0, coverage_pct: 0 });
  });
  it('lists recent scripts with no coverage', async () => {
    q.mockImplementation(async (p: any) => {
      if (p.table === 'sys_atf_code_coverage') return { records: [{ metadata_table: 'sys_script', metadata_id: { value: 'a', display_value: 'BR' }, coverage: '{"lines":{"script":[1]}}', total_executable_info: '{"lines":{"script":[1,2]}}' }] };
      if (p.table === 'sys_script') return { records: [{ sys_id: { value: 'a' }, name: 'BR' }, { sys_id: { value: 'z' }, name: { display_value: 'New BR' } }] };
      return { records: [] };
    });
    stats.mockResolvedValue([{ stats: { count: 1 } }]);
    const r = await executePlatformInsightsToolCall(client, 'get_atf_code_coverage', { script_table: 'sys_script' });
    expect(r.by_script_table[0]).toMatchObject({ table: 'sys_script', coverage_pct: 50 });
    expect(r.recently_changed_without_coverage.map((x: any) => x.name)).toEqual(['New BR']);
    await expect(executePlatformInsightsToolCall(client, 'get_atf_code_coverage', { script_table: 'bad table' })).rejects.toThrow(/table/);
  });
});

describe('trace_table_operation', () => {
  it('orders deny ACLs, before rules, the write, after rules and flows, with a diagram', async () => {
    q.mockImplementation(async (p: any) => {
      switch (p.table) {
        case 'sys_db_object': return { records: p.query === 'name=incident' ? [{ 'super_class.name': 'task' }] : [{}] };
        case 'sys_security_acl': return { records: [{ sys_id: 'a1', name: 'incident', decision_type: 'allow' }, { sys_id: 'a2', name: 'incident', decision_type: 'deny' }, { sys_id: 'a3', name: 'other_table', decision_type: 'allow' }] };
        case 'sys_script': return { records: [
          { sys_id: { value: 'b2' }, name: { display_value: 'After one' }, collection: { value: 'incident' }, when: { value: 'after' }, order: { value: '100' } },
          { sys_id: { value: 'b1' }, name: { display_value: 'Before two' }, collection: { value: 'task' }, when: { value: 'before' }, order: { value: '200' } },
          { sys_id: { value: 'b0' }, name: { display_value: 'Before one' }, collection: { value: 'incident' }, when: { value: 'before' }, order: { value: '100' } },
        ] };
        case 'sys_flow_record_trigger': return { records: [{ sys_id: 't1', table: 'incident', run_flow_in: 'background' }] };
        case 'sys_hub_flow': return { records: [{ sys_id: 'f1', name: 'Notify', active: 'true', remote_trigger_id: 't1', status: 'published' }] };
        default: return { records: [] };
      }
    });
    const r = await executePlatformInsightsToolCall(client, 'trace_table_operation', { table: 'incident', operation: 'update' });
    expect(r.table_hierarchy).toEqual(['incident', 'task']);
    const names = r.steps.map((s: any) => `${s.kind}:${s.name}`);
    expect(names.indexOf('ACL:incident')).toBe(0);
    expect(r.steps[0].stage).toMatch(/Deny Unless/);
    expect(names.indexOf('Business rule:Before one')).toBeLessThan(names.indexOf('Business rule:Before two'));
    expect(names.indexOf('Business rule:Before two')).toBeLessThan(names.indexOf('Engine:update committed'));
    expect(names.indexOf('Engine:update committed')).toBeLessThan(names.indexOf('Business rule:After one'));
    expect(names).toContain('Flow:Notify');
    expect(names.some((n: string) => n.includes('other_table'))).toBe(false);
    expect(r.steps.find((s: any) => s.name === 'Before two').table).toBe('task');
    expect(r.mermaid).toMatch(/^flowchart TD/);
    await expect(executePlatformInsightsToolCall(client, 'trace_table_operation', { table: 'incident', operation: 'merge' })).rejects.toThrow(/operation/);
  });
  it('keeps Mermaid labels safe', () => {
    const m = mermaidForTrace('t', 'insert', [{ stage: '1. X', order: null, kind: 'ACL', name: 'a[b](c)"d"', table: 't', active: true }]);
    expect(m).not.toMatch(/a\[b\]/);
  });
});

describe('integration auth, CSDM and MCP exposure', () => {
  it('reports the Basic auth restriction state and OAuth clients with links', async () => {
    q.mockImplementation(async (p: any) => {
      if (p.table === 'sys_properties') return { records: [{ name: 'glide.authenticate.basic_auth.restriction.enforce', value: 'true' }, { name: 'glide.authenticate.basic_auth.restriction.default_decision', value: 'Maintain current login' }] };
      if (p.table === 'oauth_entity') return { records: [{ sys_id: 'o1', name: 'MCP client', token_format: { value: 'jwt', display_value: 'JWT' }, default_grant_type: { display_value: 'authorization_code' }, active: { value: 'true' } }] };
      if (p.table === 'sys_user_basic_auth_exception') throw new Error('User Not Authorized');
      return { records: [] };
    });
    stats.mockResolvedValue([{ stats: { count: 2 } }]);
    const r = await executePlatformInsightsToolCall(client, 'get_integration_auth_posture', {});
    expect(r.basic_auth_restriction.state).toBe('enforce mode');
    expect(r.basic_auth_usage_tracker.readable).toBe(false);
    expect(r.oauth.clients[0]).toMatchObject({ name: 'MCP client', token_format: 'JWT', record_url: expect.stringContaining('oauth_entity') });
  });

  it('scores CSDM domains and lists gaps with links', async () => {
    stats.mockResolvedValue([{ stats: { count: 4 } }]);
    q.mockImplementation(async (p: any) => {
      if (p.table === 'cmdb_ci_business_app') return { records: [{ sys_id: { value: 'b1' }, name: { display_value: 'Payroll' } }] };
      if (p.table === 'cmdb_ci_service_auto') return { records: [{ sys_id: { value: 's1' }, name: { display_value: 'Web' }, sys_class_name: { value: 'cmdb_ci_service_discovered', display_value: 'Mapped Application Service' } }] };
      if (p.table === 'sys_properties') return { records: [{ name: 'csdm.lifecycle.migration.activated', value: 'false' }] };
      return { records: [] };
    });
    const r = await executePlatformInsightsToolCall(client, 'get_csdm_health', {});
    expect(typeof r.overall_score).toBe('number');
    expect(r.domains.life_cycle.migration_activated).toBe('false');
    expect(r.gaps.business_apps_without_relationships[0]).toMatchObject({ name: 'Payroll', record_url: expect.stringContaining('cmdb_ci_business_app.do?sys_id=b1') });
    expect(r.gaps.business_apps_without_owner).toHaveLength(1);
    expect(r.gaps.service_instances_without_offering[0].record_url).toContain('cmdb_ci_service_discovered.do');
  });

  it('flags MCP tools that look write-capable', async () => {
    q.mockImplementation(async (p: any) => (p.table === 'sn_mcp_tool_definition'
      ? { records: [{ sys_id: 't1', label: 'Create incident', category: 'rest_api' }, { sys_id: 't2', label: 'Summarise incident', category: 'ai_skill' }] }
      : { records: [] }));
    const r = await executePlatformInsightsToolCall(client, 'get_mcp_exposure', {});
    expect(r.summary).toMatchObject({ mcp_tools: 2, write_capable_looking_tools: 1 });
  });
});

describe('get_cmdb_data_foundations', () => {
  it('reads CMDB and CSDM scores with playbook links and drill-downs', async () => {
    q.mockImplementation(async (p: any) => {
      if (p.table === 'sn_getwell_cmdb_score') return { records: [{ sys_id: 'c1', name: 'Hardware CIs with serial numbers', result: '60', count: '12', cmdb_tab: { display_value: 'Completeness' }, remediation_playbook_url: 'https://support.servicenow.com/kb?id=kb_article_view&sysparm_article=KB1' }] };
      if (p.table === 'sn_getwell_csdm_score') return { records: [{ sys_id: 's1', name: 'App services with business app', result: '100', count: '0', csdm_stage: { value: '2', display_value: 'Crawl' } }] };
      if (p.table === 'sn_getwell_duplicate_location') return { records: [{ location: { value: 'l1', display_value: 'London' } }] };
      return { records: [] };
    });
    stats.mockImplementation(async (t: string) => [{ stats: { count: t === 'sn_getwell_duplicate_location' ? 3 : t === 'sn_getwell_metric' ? 40 : 0 } }]);
    const r = await executePlatformInsightsToolCall(client, 'get_cmdb_data_foundations', {});
    expect(r.summary).toMatchObject({ active_metrics: 40, cmdb_average_result_pct: 60, csdm_average_result_pct: 100, metrics_below_80_pct: 1 });
    expect(r.cmdb_metrics[0]).toMatchObject({ failing_records: 12, tab: 'Completeness', playbook_url: expect.stringContaining('KB1') });
    expect(r.csdm_metrics[0].stage).toBe('Crawl');
    expect(r.drill_downs).toEqual([expect.objectContaining({ table: 'sn_getwell_duplicate_location', count: 3, sample: [{ name: 'London', record_url: expect.stringContaining('cmn_location.do?sys_id=l1') }] })]);
  });
});

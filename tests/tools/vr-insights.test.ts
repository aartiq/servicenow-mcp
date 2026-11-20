import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeVrInsightsToolCall, getVrInsightsToolDefinitions } from '../../src/tools/vr-insights.js';

const c: any = {
  instanceUrl: 'https://x.service-now.com',
  queryRecords: vi.fn(),
  runStats: vi.fn(),
  recordUrl: (t: string, id: string) => `https://x.service-now.com/${t}.do?sys_id=${id}`,
};
const A = 'a'.repeat(32);
const B = 'b'.repeat(32);
beforeEach(() => vi.resetAllMocks());

describe('vr insight tools', () => {
  it('are read-only', () => {
    for (const d of getVrInsightsToolDefinitions()) expect(d.annotations.readOnlyHint).toBe(true);
  });

  it('get_threat_status joins CVEs, items, tasks, changes and incidents with links', async () => {
    c.queryRecords.mockImplementation(async (p: any) => {
      switch (p.table) {
        case 'sn_vul_vulnerable_item': return { records: [
          { sys_id: { value: A }, number: { display_value: 'VIT1' }, state: { value: '10', display_value: 'Awaiting Implementation' }, active: { value: 'true' }, cmdb_ci: { value: 'c1', display_value: 'web01' }, 'vulnerability.id': { display_value: 'CVE-2026-109618' } },
          { sys_id: { value: B }, number: { display_value: 'VIT2' }, state: { value: '3', display_value: 'Closed' }, active: { value: 'false' }, cmdb_ci: { value: 'c2', display_value: 'web02' }, 'vulnerability.id': { display_value: 'CVE-2026-109618' }, closed_at: { display_value: '2026-10-20' } },
        ] };
        case 'sn_vul_entry': return { records: [{ sys_id: 'e', id: 'CVE-2026-109618', cisa_exists: 'true', due_date: '2026-10-29', sys_class_name: 'sn_vul_nvd_entry' }] };
        case 'sn_vul_m2m_vul_group_item': return { records: [{ sn_vul_vulnerability: { value: 't1' }, sn_vul_vulnerable_item: { value: A } }] };
        case 'sn_vul_vulnerability': return { records: [{ sys_id: { value: 't1' }, number: { display_value: 'VUL1' }, state: { display_value: 'Open' } }] };
        case 'sn_vul_m2m_vg_change_request': return { records: [{ change_request: { value: 'ch' }, 'change_request.number': { display_value: 'CHG1' }, 'change_request.type': { display_value: 'Emergency' } }] };
        case 'sn_si_incident': return { records: [{ sys_id: { value: 's' }, number: { display_value: 'SIR1' }, state: { display_value: 'Contain' } }] };
        case 'cmdb_rel_ci': return { records: [{ parent: { value: 'svc' }, 'parent.name': { display_value: 'Storefront' } }] };
        default: return { records: [] };
      }
    });
    const r = await executeVrInsightsToolCall(c, 'get_threat_status', { cve: 'cve-2026-109618', name: 'PHP2Shell' });
    expect(r.summary).toMatchObject({ vulnerable_items: 2, open_items: 1, remediated_pct: 50, affected_cis: 2, open_past_cisa_due: 1, kev: true, changes: 1, security_incidents: 1 });
    expect(r.cves[0].record_url).toContain('sn_vul_nvd_entry.do');
    expect(r.changes[0]).toMatchObject({ number: 'CHG1', record_url: expect.stringContaining('change_request.do?sys_id=ch') });
    expect(r.services).toEqual([{ service: 'Storefront', record_url: expect.stringContaining('svc') }]);
    expect(c.queryRecords.mock.calls.find((x: any) => x[0].table === 'sn_si_incident')[0].query).toContain('short_descriptionLIKEPHP2Shell');
    await expect(executeVrInsightsToolCall(c, 'get_threat_status', {})).rejects.toThrow(/cve/);
    await expect(executeVrInsightsToolCall(c, 'get_threat_status', { cve: 'not-a-cve' })).rejects.toThrow(/Not a CVE/);
  });

  it('get_kev_compliance sorts KEV items into met, missed, overdue and in time', async () => {
    const future = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);
    const item = (n: string, state: string, active: string, due: string, closed = '') => ({ sys_id: { value: n.padEnd(32, '0') }, number: { display_value: n }, state: { value: state }, active: { value: active }, 'vulnerability.due_date': { value: due }, 'vulnerability.id': { display_value: 'CVE-1' }, assignment_group: { display_value: 'Ops' }, closed_at: { value: closed } });
    c.queryRecords.mockResolvedValue({ records: [
      item('met', '3', 'false', '2026-10-29', '2026-10-20 10:00:00'),
      item('late', '3', 'false', '2026-10-29', '2026-11-05 10:00:00'),
      item('over', '10', 'true', '2026-10-29'),
      item('ok', '1', 'true', future),
    ] });
    c.runStats.mockResolvedValue([{ groupby_fields: [{ value: 'true' }], stats: { count: 2, avg: { age_closed: '12.4' } } }]);
    const r = await executeVrInsightsToolCall(c, 'get_kev_compliance', {});
    expect(r.summary).toMatchObject({ kev_items: 4, fixed_on_time: 1, fixed_late: 1, open_overdue: 1, open_within_deadline: 1, on_time_rate_pct: 50, compliance_pct: 50 });
    expect(r.overdue_items[0]).toMatchObject({ number: 'over', record_url: expect.stringContaining('sn_vul_vulnerable_item') });
    expect(r.average_days_to_close).toEqual([{ kev: true, items: 2, avg_days: 12 }]);
  });
});

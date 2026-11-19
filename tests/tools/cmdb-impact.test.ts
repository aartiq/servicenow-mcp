import { describe, it, expect, vi } from 'vitest';
import { executeTool } from '../../src/tools/index.js';

// svc depends on api, mobile depends on api, api depends on db (parent depends on child).
const rels = [
  { parent: 'svc', child: 'api', 'parent.name': 'Checkout', 'parent.sys_class_name': 'cmdb_ci_service' },
  { parent: 'mobile', child: 'api', 'parent.name': 'Mobile', 'parent.sys_class_name': 'cmdb_ci_appl' },
  { parent: 'api', child: 'db', 'parent.name': 'API', 'parent.sys_class_name': 'cmdb_ci_appl' },
];
const client = {
  queryRecords: vi.fn(async ({ table, query, limit }: any) => {
    if (table === 'cmdb_rel_ci') {
      const m = /^(parent|child)(=|IN)(.*)$/.exec(query)!;
      const ids = m[3].split(',');
      const rows = rels.filter((r: any) => ids.includes(r[m[1]]));
      return { count: rows.length, records: rows };
    }
    if (table === 'svc_ci_assoc') return { count: 0, records: [] };
    if (table === 'sys_atf_test_suite_test') return { count: 2, records: [{ test: { value: 't1' } }, { test: 't2' }] };
    if (table === 'sys_atf_test') return { count: 1, records: [{ sys_id: 't1', query }] };
    if (table === 'sys_atf_test_suite') {
      const rows = Array.from({ length: 30 }, (_, i) => ({ sys_id: String(i) })).slice(0, limit);
      return { count: rows.length, records: rows };
    }
    return { count: 0, records: [] };
  }),
} as any;

describe('cmdb_impact_analysis', () => {
  it('reports what depends on the CI as well as what it depends on', async () => {
    const r: any = await executeTool(client, 'cmdb_impact_analysis', { ci_sys_id: 'api', depth: 3 });
    expect(r.impacted_count).toBe(2);
    expect(r.dependency_count).toBe(1);
    expect(r.total_impacted).toBe(3);
    expect(r.impact_analysis[0].downstream).toHaveLength(1);
  });

  it('walks up through several hops when only the impacted side is asked for', async () => {
    const r: any = await executeTool(client, 'cmdb_impact_analysis', { ci_sys_id: 'db', depth: 3, direction: 'impacted' });
    expect(r.impacted_count).toBe(3);
    expect(r.dependency_count).toBe(0);
  });
});

describe('cmdb_services_for_ci', () => {
  it('finds services related through CI relationships, not only the service map', async () => {
    const r: any = await executeTool(client, 'cmdb_services_for_ci', { ci: 'db' });
    expect(r.services.map((s: any) => s['cmdb_ci_service.name'])).toEqual(['Checkout']);
    expect(r.services[0].via).toMatch(/2 hops/);
  });
});

describe('list_atf_suites', () => {
  it('says when the list was cut short', async () => {
    const r: any = await executeTool(client, 'list_atf_suites', { limit: 20 });
    expect(r.count).toBe(20);
    expect(r.more).toBe(true);
    const all: any = await executeTool(client, 'list_atf_suites', { limit: 50 });
    expect(all.more).toBeUndefined();
  });
});

describe('list_atf_tests', () => {
  it('filters by suite through the suite membership table', async () => {
    const r: any = await executeTool(client, 'list_atf_tests', { suite_sys_id: 's1' });
    expect(r.tests[0].query).toContain('sys_idINt1,t2');
  });
});

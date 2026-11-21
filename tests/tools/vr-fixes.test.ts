import { describe, it, expect, vi } from 'vitest';
import { executeTool } from '../../src/tools/index.js';

describe('list_vulnerabilities library search', () => {
  it('turns search into an ID, name or summary match on sn_vul_entry', async () => {
    const queryRecords = vi.fn(async () => ({ count: 0, records: [] }));
    await executeTool({ queryRecords } as any, 'list_vulnerabilities', { source: 'library', search: 'PHP2Shell' });
    expect(queryRecords).toHaveBeenCalledWith(expect.objectContaining({
      table: 'sn_vul_entry', query: 'idLIKEPHP2Shell^ORnameLIKEPHP2Shell^ORsummaryLIKEPHP2Shell',
    }));
  });
});

describe('get_kev_compliance KEV grouping', () => {
  it('reads the boolean group value as 1 or true', async () => {
    const client = {
      queryRecords: vi.fn(async () => ({ count: 0, records: [] })),
      runStats: vi.fn(async () => [{ stats: { count: '10', avg: { age_closed: '1.0' } }, groupby_fields: [{ field: 'vulnerability.cisa_exists', value: '1' }] }]),
    } as any;
    const r: any = await executeTool(client, 'get_kev_compliance', {});
    expect(r.average_days_to_close).toEqual([{ kev: true, items: 10, avg_days: 1 }]);
  });
});

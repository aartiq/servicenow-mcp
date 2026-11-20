import { describe, it, expect, vi } from 'vitest';
import { executeTool } from '../../src/tools/index.js';
import { queryFieldNames } from '../../src/tools/core.js';
import { ServiceNowError } from '../../src/utils/errors.js';

describe('queryFieldNames', () => {
  it('pulls field names from an encoded query, including OR, NQ, ORDERBY and dot-walks', () => {
    expect(queryFieldNames('nameLIKEphp^ORsummaryLIKEphp^active=true^NQvulnerability.id=CVE-1^ORDERBYDESCsys_created_on'))
      .toEqual(['name', 'summary', 'active', 'vulnerability', 'sys_created_on']);
    expect(queryFieldNames('')).toEqual([]);
  });
});

describe('query_records on a missing field', () => {
  const forbidden = new ServiceNowError('Insufficient rights to query records: Field(s) present in the query do not have permission to be read', 'INSUFFICIENT_PRIVILEGES');
  const client = (dictionary: string[]) => ({
    queryRecords: vi.fn(async (p: any) => {
      if (p.table === 'sn_vul_vulnerability') throw forbidden;
      if (p.table === 'sys_db_object') return { count: 1, records: [{ name: p.query.slice(5), 'super_class.name': p.query.includes('task') ? '' : 'task' }] };
      if (p.table === 'sys_dictionary') return { count: dictionary.length, records: dictionary.map((element) => ({ element })) };
      return { count: 0, records: [] };
    }),
  }) as any;

  it('names the unknown field instead of reporting a permissions problem', async () => {
    const c = client(['number', 'short_description', 'state', 'assignment_group']);
    await expect(executeTool(c, 'query_records', { table: 'sn_vul_vulnerability', query: 'nameLIKEPHP2Shell^state=1' }))
      .rejects.toMatchObject({ code: 'INVALID_REQUEST', message: expect.stringMatching(/no field named name.*not a permissions problem/s) });
  });

  it('keeps the original 403 when every field exists', async () => {
    const c = client(['number', 'short_description', 'state']);
    await expect(executeTool(c, 'query_records', { table: 'sn_vul_vulnerability', query: 'short_descriptionLIKEPHP2Shell' }))
      .rejects.toMatchObject({ code: 'INSUFFICIENT_PRIVILEGES' });
  });
});

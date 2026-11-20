import { describe, it, expect, vi, afterEach } from 'vitest';
import { ServiceNowClient } from '../../src/servicenow/client.js';

const mk = () => new ServiceNowClient({
  instanceUrl: 'https://example.service-now.com',
  authMethod: 'basic', basic: { username: 'a', password: 'b' },
  maxRetries: 0,
});
const forbid = () => vi.stubGlobal('fetch', vi.fn(async () => new Response(
  JSON.stringify({ error: { message: 'Insufficient rights to query records', detail: 'Field(s) present in the query do not have permission to be read' } }),
  { status: 403, headers: { 'content-type': 'application/json' } },
)));

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('403 table hints', () => {
  it('points a refused read of sn_vul_remediation_task at sn_vul_vulnerability', async () => {
    forbid();
    await expect(mk().queryRecords({ table: 'sn_vul_remediation_task', query: 'number=VUL0019001', limit: 1 }))
      .rejects.toMatchObject({ code: 'INSUFFICIENT_PRIVILEGES', message: expect.stringMatching(/sn_vul_vulnerability/) });
  });
  it('adds no hint for other tables', async () => {
    forbid();
    await expect(mk().queryRecords({ table: 'incident', limit: 1 })).rejects.toMatchObject({ message: expect.not.stringMatching(/Hint:/) });
  });
});

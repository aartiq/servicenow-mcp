import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ServiceNowClient } from '../../src/servicenow/client.js';

/**
 * Server-side script execution runs via a one-time self-terminating scheduled job (sysauto_script).
 * When that job record can't be created (e.g. hardened instance), we fail with a clear, actionable
 * SCRIPT_EXEC_UNAVAILABLE rather than a silent/malformed call.
 */
function res(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, statusText: '', text: async () => JSON.stringify(body), json: async () => body } as unknown as Response;
}

describe('executeScript transport', () => {
  const prev = process.env.SCRIPT_EXEC_ENDPOINT;
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => { delete process.env.SCRIPT_EXEC_ENDPOINT; fetchMock = vi.fn(); (global as any).fetch = fetchMock; });
  afterEach(() => { vi.restoreAllMocks(); if (prev === undefined) delete process.env.SCRIPT_EXEC_ENDPOINT; else process.env.SCRIPT_EXEC_ENDPOINT = prev; });

  it('creates a one-time scheduled job to run the script', async () => {
    // Job create succeeds; then the poll finds the result property immediately.
    fetchMock.mockImplementation(async (url: string, _opts: any) => {
      if (String(url).includes('/sysauto_script')) return res(201, { result: { sys_id: 'JOB1' } });
      if (String(url).includes('sys_properties')) return res(200, { result: [{ sys_id: 'P1', value: JSON.stringify({ ok: true, result: 'hello' }) }] });
      return res(200, { result: {} });
    });
    const c = new ServiceNowClient({ instanceUrl: 'https://x.service-now.com', authMethod: 'basic', basic: { username: 'a', password: 'b' } });
    const out = await c.executeScript('return "hello";');
    expect(out.result).toBe('hello');
    expect(out.via).toBe('scheduled-job');
    expect(fetchMock.mock.calls.some((cl) => String(cl[0]).includes('/sysauto_script'))).toBe(true);
  });

  it('fails with SCRIPT_EXEC_UNAVAILABLE when the job record cannot be created', async () => {
    fetchMock.mockResolvedValue(res(403, { error: { message: 'Operation Failed' } }));
    const c = new ServiceNowClient({ instanceUrl: 'https://x.service-now.com', authMethod: 'basic', basic: { username: 'a', password: 'b' } });
    await expect(c.executeScript('gs.info(1)')).rejects.toMatchObject({ code: 'SCRIPT_EXEC_UNAVAILABLE' });
  });
});

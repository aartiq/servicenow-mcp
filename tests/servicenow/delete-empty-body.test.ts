import { describe, it, expect, vi, afterEach } from 'vitest';
import { ServiceNowClient } from '../../src/servicenow/client.js';

/**
 * A successful DELETE returns 204 No Content with an empty body. request() must NOT call
 * response.json() on that (it throws on an empty body), which previously surfaced a *successful*
 * delete as a bogus error. These tests pin the fix: empty/no-content 2xx resolves cleanly, and a
 * genuine 404 still errors.
 */
const mk = () => new ServiceNowClient({
  instanceUrl: 'https://inteliblissltddemo2.service-now.com',
  authMethod: 'basic', basic: { username: 'a', password: 'b' },
  maxRetries: 0,
});

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('delete / empty-body handling', () => {
  it('resolves when DELETE returns 204 No Content (no false error)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 204 })));
    await expect(mk().deleteRecord('sys_script_include', 'a'.repeat(32))).resolves.toBeUndefined();
  });

  it('resolves when a 2xx has an empty body', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 200 })));
    await expect(mk().deleteRecord('incident', 'b'.repeat(32))).resolves.toBeUndefined();
  });

  it('still surfaces a genuine 404 as NOT_FOUND (record not readable afterwards)', async () => {
    // DELETE -> 404, then the ACL disambiguation read-back also 404s (not readable): genuine not-found.
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: { message: 'No Record found' } }), { status: 404 })));
    await expect(mk().deleteRecord('incident', 'c'.repeat(32))).rejects.toThrow(/not.?found|no record/i);
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ServiceNowClient } from '../../src/servicenow/client.js';
import { isDelegationRequired, isDelegatedAuthEnabled, parseDelegatedAuthHeaders, strictDelegationViolation, runWithDelegatedAuth } from '../../src/utils/request-context.js';

/**
 * Regression tests for the two behaviours a partner reported against 4.12.1:
 *  1. Retry: an explicit MAX_RETRIES=0 must be honoured (not turned back into 3), and a
 *     non-idempotent write must never be auto-retried when the response was lost (duplicate-write risk).
 *  2. Strict delegated-auth: a missing/invalid delegation must yield no token, so strict mode rejects
 *     before tool execution and never falls back to base credentials.
 */
function res(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, statusText: '', text: async () => JSON.stringify(body), json: async () => body } as unknown as Response;
}
const mk = (maxRetries?: number) =>
  new ServiceNowClient({ instanceUrl: 'https://x.service-now.com', authMethod: 'basic', basic: { username: 'a', password: 'b' }, maxRetries, retryDelayMs: 1 });

describe('retry policy', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => { fetchMock = vi.fn(); (global as any).fetch = fetchMock; });
  afterEach(() => vi.restoreAllMocks());

  it('honours an explicit maxRetries=0 on a read (no retries)', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNRESET'));
    await expect(mk(0).queryRecords({ table: 'incident' })).rejects.toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries reads up to maxRetries on network errors', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNRESET'));
    await expect(mk(3).queryRecords({ table: 'incident' })).rejects.toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(4); // 1 initial + 3 retries
  });

  it('never replays a write after a 500 (the record may already exist)', async () => {
    process.env.NOWAIKIT_SKIP_MANDATORY_CHECK = 'true'; // count only the write itself
    fetchMock.mockResolvedValue(res(500, { error: { message: 'Internal error' } }));
    await expect(mk(3).createRecord('incident', { short_description: 'x' })).rejects.toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    delete process.env.NOWAIKIT_SKIP_MANDATORY_CHECK;
  });

  it('retries a write only when ServiceNow says it was not processed (429 / 503)', async () => {
    process.env.NOWAIKIT_SKIP_MANDATORY_CHECK = 'true';
    fetchMock.mockResolvedValueOnce(res(503, { error: { message: 'unavailable' } })).mockResolvedValue(res(201, { result: { sys_id: 'a'.repeat(32) } }));
    await mk(3).createRecord('incident', { short_description: 'x' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    delete process.env.NOWAIKIT_SKIP_MANDATORY_CHECK;
  });

  it('a read recovers after a transient network blip', async () => {
    fetchMock.mockRejectedValueOnce(new Error('ECONNRESET')).mockResolvedValue(res(200, { result: [{ number: 'INC1' }] }));
    await mk(3).queryRecords({ table: 'incident' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('never auto-retries a write (POST) when the response was lost', async () => {
    // Any GET (dictionary/mandatory checks) succeeds; the POST fails with a network error.
    fetchMock.mockImplementation(async (_url: string, o: any) => {
      if ((o?.method || 'GET') === 'POST') throw new Error('socket hang up');
      return res(200, { result: [] });
    });
    await expect(mk(3).createRecord('incident', { short_description: 'x' })).rejects.toBeTruthy();
    const postAttempts = fetchMock.mock.calls.filter((c: any[]) => (c[1]?.method || 'GET') === 'POST').length;
    expect(postAttempts).toBe(1); // the write is not replayed
  });

  it('a business-rule abort (403) is OPERATION_ABORTED, not a privilege error, and not retried', async () => {
    fetchMock.mockResolvedValue(res(403, { error: { message: 'Operation Failed', detail: "Operation against file 'change_task' was aborted by Business Rule 'Prevent Duplicate Active Change Tasks'" } }));
    const err: any = await mk(3).queryRecords({ table: 'change_task' }).catch((e) => e);
    expect(err.code).toBe('OPERATION_ABORTED');
    expect(err.message).toMatch(/server-side logic/);          // abort guidance
    expect(err.message).not.toMatch(/Writes need WRITE_ENABLED/); // NOT the privilege checklist
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('a genuine 403 still gets the privilege diagnostic', async () => {
    fetchMock.mockResolvedValue(res(403, { error: { message: 'Insufficient rights to write', detail: 'ACL denied' } }));
    const err: any = await mk(3).queryRecords({ table: 'sys_user' }).catch((e) => e);
    expect(err.code).toBe('INSUFFICIENT_PRIVILEGES');
    expect(err.message).toMatch(/Writes need WRITE_ENABLED|Authenticated, but not authorized/);
  });
});

describe('strict delegated-auth', () => {
  const saved = { ...process.env };
  afterEach(() => { process.env = { ...saved }; });

  it('DELEGATED_AUTH=strict enables AND requires delegation', () => {
    process.env.DELEGATED_AUTH = 'strict'; delete process.env.NOWAIKIT_REQUIRE_DELEGATION;
    expect(isDelegatedAuthEnabled()).toBe(true);
    expect(isDelegationRequired()).toBe(true);
  });

  it('DELEGATED_AUTH=true enables but does NOT require', () => {
    process.env.DELEGATED_AUTH = 'true'; delete process.env.NOWAIKIT_REQUIRE_DELEGATION;
    expect(isDelegatedAuthEnabled()).toBe(true);
    expect(isDelegationRequired()).toBe(false);
  });

  it('NOWAIKIT_REQUIRE_DELEGATION=true requires delegation', () => {
    delete process.env.DELEGATED_AUTH; process.env.NOWAIKIT_REQUIRE_DELEGATION = 'true';
    expect(isDelegationRequired()).toBe(true);
  });

  it('unset: neither enabled nor required', () => {
    delete process.env.DELEGATED_AUTH; delete process.env.NOWAIKIT_REQUIRE_DELEGATION;
    expect(isDelegatedAuthEnabled()).toBe(false);
    expect(isDelegationRequired()).toBe(false);
  });

  it('an invalid gateway secret yields NO delegated token (strict then rejects, no base fallback)', () => {
    process.env.NOWAIKIT_DELEGATED_SECRET = 'right-secret';
    const ctx = parseDelegatedAuthHeaders({ 'x-nowaikit-gateway-secret': 'wrong', 'x-servicenow-token': 'TOK', 'x-nowaikit-write-enabled': 'true' });
    expect(ctx.bearerToken).toBeUndefined();
    expect(ctx.flags.write).toBeFalsy();
  });

  it('a valid gateway secret passes the delegated token through', () => {
    process.env.NOWAIKIT_DELEGATED_SECRET = 'right-secret';
    const ctx = parseDelegatedAuthHeaders({ 'x-nowaikit-gateway-secret': 'right-secret', 'x-servicenow-token': 'TOK' });
    expect(ctx.bearerToken).toBe('TOK');
  });
});

/**
 * The gate the tool handler runs (server.ts), exercised through the real async delegated-auth context.
 * This is the security boundary: strict mode must reject before any tool executes and never allow a
 * base-client fallback.
 */
describe('strict-gate enforcement (via runWithDelegatedAuth)', () => {
  const saved = { ...process.env };
  afterEach(() => { process.env = { ...saved }; });

  it('strict + no delegated context: DELEGATION_REQUIRED (would reject before tool runs)', () => {
    process.env.DELEGATED_AUTH = 'strict';
    expect(strictDelegationViolation('query_records')).toBe('DELEGATION_REQUIRED');
  });

  it('strict + context but no token (invalid secret path): DELEGATION_REQUIRED', () => {
    process.env.DELEGATED_AUTH = 'strict';
    const v = runWithDelegatedAuth({ flags: {} }, () => strictDelegationViolation('query_records'));
    expect(v).toBe('DELEGATION_REQUIRED');
  });

  it('strict + valid delegated token: a normal tool is allowed', () => {
    process.env.DELEGATED_AUTH = 'strict';
    const v = runWithDelegatedAuth({ bearerToken: 'TOK', flags: {} }, () => strictDelegationViolation('query_records'));
    expect(v).toBeNull();
  });

  it('strict + valid token: instance-manager tools are still refused', () => {
    process.env.DELEGATED_AUTH = 'strict';
    const v = runWithDelegatedAuth({ bearerToken: 'TOK', flags: {} }, () => strictDelegationViolation('compare_instances'));
    expect(v).toBe('DELEGATION_INCOMPATIBLE_TOOL');
  });

  it('non-strict (default): gate is a no-op even with no delegation', () => {
    delete process.env.DELEGATED_AUTH; delete process.env.NOWAIKIT_REQUIRE_DELEGATION;
    expect(strictDelegationViolation('query_records')).toBeNull();
    expect(strictDelegationViolation('compare_instances')).toBeNull();
  });
});

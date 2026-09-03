import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { executeUpdateSetToolCall, getUpdateSetToolDefinitions } from '../../src/tools/updateset.js';
import type { ServiceNowClient } from '../../src/servicenow/client.js';

// Regression guard for the "is_default vs current update set" bug (issue #11 / PR #12):
// the caller's current update set is a per-user sys_user_preference, NOT the per-scope is_default flag.
// These tests assert none of the switch paths ever write sys_update_set.is_default.

const mockClient = {
  queryRecords: vi.fn(),
  getRecord: vi.fn(),
  createRecord: vi.fn(),
  updateRecord: vi.fn(),
} as unknown as ServiceNowClient;

const qr = () => mockClient.queryRecords as ReturnType<typeof vi.fn>;
const gr = () => mockClient.getRecord as ReturnType<typeof vi.fn>;
const cr = () => mockClient.createRecord as ReturnType<typeof vi.fn>;
const ur = () => mockClient.updateRecord as ReturnType<typeof vi.fn>;

/** Assert no call to updateRecord/createRecord on sys_update_set ever set is_default. */
function assertNoIsDefaultWrite() {
  for (const call of ur().mock.calls) {
    const [table, , fields] = call;
    if (table === 'sys_update_set') expect(fields).not.toHaveProperty('is_default');
  }
  for (const call of cr().mock.calls) {
    const [table, fields] = call;
    if (table === 'sys_update_set') expect(fields).not.toHaveProperty('is_default');
  }
}

describe('getUpdateSetToolDefinitions', () => {
  it('every tool has name, description and inputSchema', () => {
    const tools = getUpdateSetToolDefinitions();
    expect(tools.length).toBeGreaterThan(0);
    tools.forEach(t => {
      expect(t.name).toBeTruthy();
      expect(t.description).toBeTruthy();
      expect(t.inputSchema).toBeTruthy();
    });
  });
});

describe('update set switching writes the user preference, never is_default', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WRITE_ENABLED = 'true';
    process.env.SCRIPTING_ENABLED = 'true';
  });
  afterEach(() => {
    delete process.env.WRITE_ENABLED;
    delete process.env.SCRIPTING_ENABLED;
  });

  it('switch_update_set updates the existing sys_user_preference', async () => {
    qr().mockResolvedValueOnce({ count: 1, records: [{ sys_id: 'pref1' }] }); // existing preference
    ur().mockResolvedValue({ sys_id: 'pref1' });
    const res = await executeUpdateSetToolCall(mockClient, 'switch_update_set', { sys_id: 'us123' });
    expect(res.action).toBe('switched');
    expect(ur()).toHaveBeenCalledWith('sys_user_preference', 'pref1', { value: 'us123' });
    assertNoIsDefaultWrite();
  });

  it('switch_update_set creates the preference when the user has none', async () => {
    qr()
      .mockResolvedValueOnce({ count: 0, records: [] })                 // no existing preference
      .mockResolvedValueOnce({ count: 1, records: [{ sys_id: 'user9' }] }); // resolve current user
    cr().mockResolvedValue({ sys_id: 'prefNew' });
    const res = await executeUpdateSetToolCall(mockClient, 'switch_update_set', { sys_id: 'us123' });
    expect(res.action).toBe('switched');
    expect(cr()).toHaveBeenCalledWith('sys_user_preference', expect.objectContaining({ name: 'sys_update_set', user: 'user9', value: 'us123' }));
    assertNoIsDefaultWrite();
  });

  it('create_update_set with switch_to sets the preference, not is_default', async () => {
    cr()
      .mockResolvedValueOnce({ sys_id: 'newUS' })                       // create the update set
      .mockResolvedValueOnce({ sys_id: 'prefNew' });                    // create the preference (no existing)
    qr()
      .mockResolvedValueOnce({ count: 0, records: [] })                 // no existing preference
      .mockResolvedValueOnce({ count: 1, records: [{ sys_id: 'user9' }] }); // resolve current user
    const res = await executeUpdateSetToolCall(mockClient, 'create_update_set', { name: 'My Set', switch_to: true });
    expect(res.action).toBe('created_and_switched');
    assertNoIsDefaultWrite();
  });

  it('get_current_update_set reads the user preference', async () => {
    qr().mockResolvedValueOnce({ count: 1, records: [{ sys_id: 'pref1', value: 'usCurrent' }] });
    gr().mockResolvedValue({ sys_id: 'usCurrent', name: 'Mine', state: 'in progress' });
    const res = await executeUpdateSetToolCall(mockClient, 'get_current_update_set', {});
    expect(res.source).toBe('user_preference');
    expect(res.current_update_set.sys_id).toBe('usCurrent');
    expect(gr()).toHaveBeenCalledWith('sys_update_set', 'usCurrent', expect.any(String));
  });

  it('ensure_active_update_set creates a set and points the user at it, no is_default', async () => {
    qr()
      .mockResolvedValueOnce({ count: 0, records: [] })                 // no current preference
      .mockResolvedValueOnce({ count: 0, records: [] })                 // setCurrentUpdateSet: no existing pref
      .mockResolvedValueOnce({ count: 1, records: [{ sys_id: 'user9' }] }); // resolve current user
    cr()
      .mockResolvedValueOnce({ sys_id: 'autoUS' })                      // create the update set
      .mockResolvedValueOnce({ sys_id: 'prefNew' });                    // create the preference
    const res = await executeUpdateSetToolCall(mockClient, 'ensure_active_update_set', {});
    expect(res.action).toBe('auto_created');
    expect(res.sys_id).toBe('autoUS');
    assertNoIsDefaultWrite();
  });
});

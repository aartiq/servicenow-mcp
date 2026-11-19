import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { executePerformanceToolCall, getPerformanceToolDefinitions } from '../../src/tools/performance.js';
import { executeScriptToolCall, getScriptToolDefinitions } from '../../src/tools/script.js';
import { executeCmdbReconciliationToolCall, retireFields } from '../../src/tools/cmdb-reconciliation.js';
import { normaliseDecisionType, parseRoleList } from '../../src/tools/acl-helpers.js';
import type { ServiceNowClient } from '../../src/servicenow/client.js';

const client = {
  queryRecords: vi.fn(),
  getRecord: vi.fn(),
  createRecord: vi.fn(),
  updateRecord: vi.fn(),
  deleteRecord: vi.fn(),
  runStats: vi.fn(),
  recordUrl: (t: string, id: string) => `https://x.service-now.com/${t}.do?sys_id=${id}`,
} as unknown as ServiceNowClient;
const q = client.queryRecords as ReturnType<typeof vi.fn>;
const get = client.getRecord as ReturnType<typeof vi.fn>;
const create = client.createRecord as ReturnType<typeof vi.fn>;
const update = client.updateRecord as ReturnType<typeof vi.fn>;
const del = client.deleteRecord as ReturnType<typeof vi.fn>;
const stats = client.runStats as ReturnType<typeof vi.fn>;
const ID = 'a'.repeat(32);

beforeEach(() => vi.resetAllMocks());

describe('dashboards: legacy and Platform Analytics', () => {
  it('defines the source argument and the migration tool', () => {
    const defs = getPerformanceToolDefinitions();
    const list = defs.find((d) => d.name === 'list_pa_dashboards')!;
    expect((list.inputSchema.properties as any).source.enum).toEqual(['all', 'legacy', 'platform']);
    expect(defs.some((d) => d.name === 'get_dashboard_migration_status')).toBe(true);
  });

  it('lists both sources by default, keeping the legacy fields and adding source', async () => {
    q.mockImplementation(async (p: any) => p.table === 'pa_dashboards'
      ? { count: 1, records: [{ sys_id: '1', name: 'Old', description: '', sys_updated_on: 'x' }] }
      : { count: 1, records: [{ sys_id: '2', name: 'New', active: 'true' }] });
    const r = await executePerformanceToolCall(client, 'list_pa_dashboards', {});
    expect(r.count).toBe(2);
    expect(r.records).toEqual([
      { sys_id: '1', name: 'Old', description: '', sys_updated_on: 'x', source: 'legacy' },
      { sys_id: '2', name: 'New', active: 'true', source: 'platform' },
    ]);
    expect(r.legacy_count).toBe(1);
    expect(r.platform_count).toBe(1);
  });

  it('source=legacy only reads pa_dashboards, and a missing par_dashboard is a note under all', async () => {
    q.mockResolvedValueOnce({ count: 0, records: [] });
    await executePerformanceToolCall(client, 'list_pa_dashboards', { source: 'legacy' });
    expect(q).toHaveBeenCalledTimes(1);
    expect(q.mock.calls[0][0].table).toBe('pa_dashboards');
    q.mockReset();
    q.mockImplementation(async (p: any) => {
      if (p.table === 'par_dashboard') throw new Error('Invalid table par_dashboard');
      return { count: 0, records: [] };
    });
    const r = await executePerformanceToolCall(client, 'list_pa_dashboards', {});
    expect(r.platform_note).toMatch(/Invalid table/);
    await expect(executePerformanceToolCall(client, 'list_pa_dashboards', { source: 'platform' })).rejects.toThrow(/not available/);
  });

  it('get_pa_dashboard falls back to par_dashboard with tabs, widgets and permissions', async () => {
    get.mockImplementation(async (table: string) => {
      if (table === 'pa_dashboards') throw new Error('Record not found');
      return { sys_id: ID, name: 'Platform one' };
    });
    q.mockImplementation(async (p: any) => {
      if (p.table === 'par_dashboard_tab') return { count: 1, records: [{ sys_id: 't', name: 'Tab 1' }] };
      if (p.table === 'par_dashboard_widget') return { count: 1, records: [{ sys_id: { value: 'w' }, component: { display_value: 'Single score' }, 'canvas.dashboard_tab': { display_value: 'Tab 1' } }] };
      if (p.table === 'par_dashboard_permission') return { count: 1, records: [{ role: { display_value: 'itil' }, can_read: { value: 'true' } }] };
      return { count: 1, records: [{ experience: { display_value: 'Platform Analytics' } }] };
    });
    const r = await executePerformanceToolCall(client, 'get_pa_dashboard', { sys_id_or_name: ID });
    expect(r.source).toBe('platform');
    expect(r.tabs).toHaveLength(1);
    expect(r.widgets[0]).toMatchObject({ component: 'Single score', tab: 'Tab 1' });
    expect(r.permissions[0]).toMatchObject({ role: 'itil', can_read: true, can_write: false });
    expect(r.visible_in).toEqual(['Platform Analytics']);
  });

  it('get_pa_dashboard still returns a legacy dashboard first, marked legacy', async () => {
    get.mockResolvedValue({ sys_id: ID, name: 'Legacy' });
    const r = await executePerformanceToolCall(client, 'get_pa_dashboard', { sys_id_or_name: ID });
    expect(r).toEqual({ sys_id: ID, name: 'Legacy', source: 'legacy' });
  });

  it('migration status separates legacy dashboards that already have a platform version', async () => {
    stats.mockImplementation(async (_t: string, o: any) => (o.groupBy ? [{ groupby_fields: [{ value: 'Yes' }], stats: { count: 2 } }] : [{ stats: { count: 2 } }]));
    q.mockImplementation(async (p: any) => {
      if (p.table === 'pa_dashboards') return { count: 2, records: [{ sys_id: { value: '1' }, name: { display_value: 'Sales - Old' } }, { sys_id: { value: '2' }, name: { display_value: 'Ops' } }] };
      if (p.table === 'par_dashboard') return { count: 1, records: [{ name: 'Sales' }] };
      return { count: 0, records: [] };
    });
    const r = await executePerformanceToolCall(client, 'get_dashboard_migration_status', {});
    expect(r.summary.active_legacy_with_platform_version).toBe(1);
    expect(r.legacy_without_platform_version.map((d: any) => d.name)).toEqual(['Ops']);
    expect(r.legacy_without_platform_version[0].record_url).toContain('pa_dashboards.do?sys_id=2');
  });
});

describe('ACL tools: deny-unless and role checks', () => {
  const env = { ...process.env };
  beforeEach(() => { process.env.WRITE_ENABLED = 'true'; process.env.SCRIPTING_ENABLED = 'true'; });
  afterEach(() => { process.env = { ...env }; });

  it('parses decision types and role lists', () => {
    expect(normaliseDecisionType('Deny Unless')).toBe('deny');
    expect(normaliseDecisionType('allow_if')).toBe('allow');
    expect(normaliseDecisionType(undefined)).toBeUndefined();
    expect(() => normaliseDecisionType('maybe')).toThrow(/decision_type/);
    expect(parseRoleList(' itil, admin ,itil')).toEqual(['itil', 'admin']);
  });

  it('defines decision_type on create/update and the posture tool', () => {
    const defs = getScriptToolDefinitions();
    expect((defs.find((d) => d.name === 'create_acl')!.inputSchema.properties as any).decision_type.enum).toEqual(['allow', 'deny']);
    expect(defs.find((d) => d.name === 'update_acl')!.inputSchema.required).toEqual(['sys_id']);
    expect(defs.some((d) => d.name === 'get_acl_posture')).toBe(true);
  });

  it('refuses to create an ACL that names a missing role, before writing anything', async () => {
    q.mockResolvedValue({ count: 1, records: [{ sys_id: 'r1', name: 'itil' }] });
    await expect(executeScriptToolCall(client, 'create_acl', { name: 'x.*', operation: 'read', roles: 'itil,itl' })).rejects.toThrow(/Role\(s\) not found: itl/);
    expect(create).not.toHaveBeenCalled();
  });

  it('creates a Deny Unless ACL with its roles linked and the script switched on', async () => {
    q.mockImplementation(async (p: any) => p.table === 'sys_user_role'
      ? { count: 1, records: [{ sys_id: 'r1', name: 'itil' }] }
      : { count: 1, records: [{ element: 'decision_type' }] });
    create.mockImplementation(async (table: string) => (table === 'sys_security_acl' ? { sys_id: ID } : { sys_id: 'link' }));
    const r = await executeScriptToolCall(client, 'create_acl', { name: 'x.*', operation: 'read', decision_type: 'deny', roles: 'itil', script: 'answer = true;' });
    expect(create.mock.calls[0][1]).toMatchObject({ decision_type: 'deny', advanced: true, script: 'answer = true;' });
    expect(create.mock.calls[1]).toEqual(['sys_security_acl_role', { sys_security_acl: ID, sys_user_role: 'r1' }]);
    expect(r.roles_linked).toEqual(['itil']);
    expect(r.summary).toMatch(/Deny Unless/);
  });

  it('keeps the old create payload when no new arguments are given', async () => {
    create.mockResolvedValue({ sys_id: ID });
    await executeScriptToolCall(client, 'create_acl', { name: 'x.*', operation: 'read' });
    expect(create.mock.calls[0][1]).toEqual({ name: 'x.*', operation: 'read', type: 'record', active: true, admin_overrides: true });
  });

  it('update_acl replaces roles: drops a missing-role link, adds the new one', async () => {
    q.mockImplementation(async (p: any) => {
      if (p.table === 'sys_user_role') return { count: 1, records: [{ sys_id: 'r2', name: 'admin' }] };
      return { count: 1, records: [{ sys_id: 'l1', sys_user_role: 'gone', 'sys_user_role.name': '' }] };
    });
    get.mockResolvedValue({ sys_id: ID });
    const r = await executeScriptToolCall(client, 'update_acl', { sys_id: ID, roles: 'admin' });
    expect(update).not.toHaveBeenCalled();
    expect(del).toHaveBeenCalledWith('sys_security_acl_role', 'l1');
    expect(create).toHaveBeenCalledWith('sys_security_acl_role', { sys_security_acl: ID, sys_user_role: 'r2' });
    expect(r.roles_added).toEqual(['admin']);
  });

  it('get_acl flags required roles that no longer exist', async () => {
    get.mockResolvedValue({ sys_id: ID, name: 'incident' });
    q.mockResolvedValue({ count: 2, records: [{ sys_id: 'l1', sys_user_role: 'r1', 'sys_user_role.name': 'itil' }, { sys_id: 'l2', sys_user_role: 'dead' }] });
    const r = await executeScriptToolCall(client, 'get_acl', { sys_id: ID });
    expect(r.required_roles).toEqual([{ name: 'itil', exists: true }, { name: 'dead', exists: false }]);
    expect(r.role_warning).toMatch(/Brazil/);
  });

  it('get_acl_posture reports deny ACLs and ACLs with missing roles, with links', async () => {
    stats.mockImplementation(async (_t: string, o: any) => (o.groupBy
      ? [{ groupby_fields: [{ value: 'deny' }], stats: { count: 3 } }, { groupby_fields: [{ value: 'allow' }], stats: { count: 9 } }]
      : [{ stats: { count: 4 } }]));
    q.mockImplementation(async (p: any) => {
      if (p.table === 'sys_security_acl_role') return { count: 1, records: [{ sys_security_acl: ID, 'sys_security_acl.name': 'incident', 'sys_security_acl.operation': 'read', sys_user_role: 'ghost' }] };
      if (p.table === 'sys_security_acl') return { count: 1, records: [{ sys_id: ID, name: 'incident', operation: 'read', decision_type: 'deny' }] };
      return { count: 0, records: [] };
    });
    const r = await executeScriptToolCall(client, 'get_acl_posture', { table: 'incident' });
    expect(r.summary.deny_unless_acls).toBe(3);
    expect(r.acls_with_missing_roles[0]).toMatchObject({ acl: 'incident', missing_role: 'ghost', record_url: expect.stringContaining('sys_security_acl.do') });
    expect(r.deny_unless_sample[0].record_url).toContain(ID);
    expect(r.strict_deny_for_missing_roles.value).toBeNull();
  });
});

describe('CMDB: CSDM life cycle', () => {
  const env = { ...process.env };
  beforeEach(() => { process.env.WRITE_ENABLED = 'true'; process.env.CMDB_WRITE_ENABLED = 'true'; });
  afterEach(() => { process.env = { ...env }; });

  it('keeps install_status as the default retirement', async () => {
    const r = await retireFields(client, undefined);
    expect(r).toMatchObject({ mode: 'install_status', fields: { operational_status: 6, install_status: 7 } });
    expect(q).not.toHaveBeenCalled();
  });

  it('retires with End of Life / Retired when asked, after checking the values exist', async () => {
    q.mockResolvedValue({ count: 1, records: [{ name: 'x' }] });
    update.mockResolvedValue({});
    const r = await executeCmdbReconciliationToolCall(client, 'cmdb_reconcile', { action: 'retire_stale', targets: [ID], dry_run: false, retire_using: 'life_cycle' });
    expect(update).toHaveBeenCalledWith('cmdb_ci', ID, { life_cycle_stage: 'End of Life', life_cycle_stage_status: 'Retired' });
    expect(r.retire_using).toBe('life_cycle');
  });

  it('auto follows csdm.lifecycle.migration.activated', async () => {
    q.mockImplementation(async (p: any) => (p.table === 'sys_properties' ? { records: [{ value: 'true' }] } : { records: [{ name: 'x' }] }));
    expect((await retireFields(client, 'auto')).mode).toBe('life_cycle');
    q.mockImplementation(async () => ({ records: [{ value: 'false' }] }));
    expect((await retireFields(client, 'auto')).mode).toBe('install_status');
  });

  it('refuses life_cycle when the stage values are missing', async () => {
    q.mockResolvedValue({ count: 0, records: [] });
    await expect(retireFields(client, 'life_cycle')).rejects.toThrow(/End of Life/);
  });

  it('cmdb_find_stale understands the life cycle stage and returns both field sets', async () => {
    q.mockResolvedValue({ count: 0, records: [] });
    await executeCmdbReconciliationToolCall(client, 'cmdb_find_stale', { lifecycle_model: 'either' });
    expect(q.mock.calls[0][0].query).toContain('operational_status=1^ORlife_cycle_stage.name=Operational');
    expect(q.mock.calls[0][0].fields).toContain('life_cycle_stage_status');
    q.mockClear();
    await executeCmdbReconciliationToolCall(client, 'cmdb_find_stale', {});
    expect(q.mock.calls[0][0].query).toContain('^operational_status=1^active=true');
  });
});

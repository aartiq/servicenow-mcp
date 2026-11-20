import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { executeSecurityToolCall, getSecurityToolDefinitions } from '../../src/tools/security.js';
import { executeChangeToolCall } from '../../src/tools/change.js';
import { executeCoreToolCall } from '../../src/tools/core.js';
import { executeBundleToolCall } from '../../src/tools/bundles.js';
import { checkSirMove, classifyVulnRef, mapChoice, SIR_STATES } from '../../src/tools/vr-helpers.js';

const ID = 'a'.repeat(32);
const c: any = {
  createRecord: vi.fn(),
  getRecord: vi.fn(),
  updateRecord: vi.fn(),
  queryRecords: vi.fn(),
  runStats: vi.fn(),
  executeScript: vi.fn(),
  attachRecordUrl: (t: string, r: any) => ({ ...r, record_url: `https://x.service-now.com/${t}.do?sys_id=${r?.sys_id?.value ?? r?.sys_id}` }),
  recordUrl: (t: string, id: string) => `https://x.service-now.com/${t}.do?sys_id=${id}`,
};
const env = { ...process.env };
beforeEach(() => { vi.resetAllMocks(); process.env.WRITE_ENABLED = 'true'; c.attachRecordUrl = (t: string, r: any) => ({ ...r, record_url: `https://x.service-now.com/${t}.do?sys_id=${r?.sys_id?.value ?? r?.sys_id}` }); c.recordUrl = (t: string, id: string) => `https://x.service-now.com/${t}.do?sys_id=${id}`; });
afterEach(() => { process.env = { ...env }; });

describe('state maps', () => {
  it('maps labels and numbers, and rejects unknown ones', () => {
    expect(mapChoice(SIR_STATES, 'Eradicate', 'state')).toBe('19');
    expect(mapChoice(SIR_STATES, '100', 'state')).toBe('100');
    expect(() => mapChoice(SIR_STATES, 'fixed', 'state')).toThrow(/Unknown state "fixed"/);
    expect(() => mapChoice(SIR_STATES, '42', 'state')).toThrow(/Unknown state value/);
  });
  it('blocks moves out of closed or cancelled and draft straight to closed', () => {
    expect(() => checkSirMove('3', '16')).toThrow(/Closed/);
    expect(() => checkSirMove('10', '3')).toThrow(/Draft/);
    expect(() => checkSirMove('16', '18')).not.toThrow();
  });
  it('classifies vulnerability references by prefix', () => {
    expect(classifyVulnRef('vit0010021').kind).toBe('vit');
    expect(classifyVulnRef('VUL0010001').kind).toBe('vul');
    expect(classifyVulnRef('cve-2026-109618')).toEqual({ kind: 'cve', value: 'CVE-2026-109618' });
    expect(classifyVulnRef(ID).kind).toBe('sys_id');
  });
});

describe('Vulnerability Response tools', () => {
  it('list_vulnerabilities reads vulnerable items with CVE and KEV filters; library is a separate path', async () => {
    c.queryRecords.mockResolvedValue({ count: 0, records: [] });
    await executeSecurityToolCall(c, 'list_vulnerabilities', { cve: 'cve-2026-109618', kev: true, severity: 'high', state: 'awaiting implementation' });
    expect(c.queryRecords.mock.calls[0][0]).toMatchObject({ table: 'sn_vul_vulnerable_item', query: 'state=10^risk_rating=2^vulnerability.id=CVE-2026-109618^vulnerability.cisa_exists=true', displayValue: 'all' });
    await executeSecurityToolCall(c, 'list_vulnerabilities', { source: 'library', cve: 'CVE-2026-109618' });
    expect(c.queryRecords.mock.calls[1][0]).toMatchObject({ table: 'sn_vul_entry', query: 'id=CVE-2026-109618' });
    await expect(executeSecurityToolCall(c, 'list_vulnerabilities', { severity: 'apocalyptic' })).rejects.toThrow(/Unknown risk rating/);
  });

  it('get_vulnerability routes VIT, VUL, CVE and sys_id', async () => {
    c.queryRecords.mockImplementation(async (p: any) => {
      if (p.table === 'sn_vul_vulnerability') return { records: [{ sys_id: { value: ID }, number: { value: 'VUL0010001' } }] };
      if (p.table === 'sn_vul_m2m_vul_group_item') return { records: [{ sn_vul_vulnerable_item: { value: 'b'.repeat(32) }, 'sn_vul_vulnerable_item.number': { display_value: 'VIT0010021' } }] };
      if (p.table === 'sn_vul_m2m_vg_change_request') return { records: [{ change_request: { value: 'c'.repeat(32) }, 'change_request.number': { display_value: 'CHG0030028' } }] };
      if (p.table === 'sn_vul_entry') return { records: [{ sys_id: 'e', id: 'CVE-2026-109618' }] };
      if (p.table === 'sn_vul_vulnerable_item') return p.query.startsWith('number=') ? { records: [{ sys_id: 'v', number: 'VIT0010021' }] } : { records: [] };
      return { records: [] };
    });
    const vul = await executeSecurityToolCall(c, 'get_vulnerability', { number_or_sysid: 'VUL0010001' });
    expect(vul.record_type).toBe('remediation_task');
    expect(vul.vulnerable_items[0]).toMatchObject({ number: 'VIT0010021', record_url: expect.stringContaining('sn_vul_vulnerable_item') });
    expect(vul.changes[0]).toMatchObject({ number: 'CHG0030028', record_url: expect.stringContaining('change_request') });
    expect((await executeSecurityToolCall(c, 'get_vulnerability', { number_or_sysid: 'VIT0010021' })).record_type).toBe('vulnerable_item');
    expect((await executeSecurityToolCall(c, 'get_vulnerability', { number_or_sysid: 'CVE-2026-109618' })).record_type).toBe('library_entry');
    const bySys = await executeSecurityToolCall(c, 'get_vulnerability', { number_or_sysid: ID });
    expect(bySys.record_type).toBe('remediation_task');
  });

  it('update_vulnerability never writes the CVE library, and sends deferrals through an exception request', async () => {
    c.queryRecords.mockImplementation(async (p: any) => (p.table === 'sn_vul_entry' ? { records: [{ sys_id: ID }] } : { records: [] }));
    await expect(executeSecurityToolCall(c, 'update_vulnerability', { sys_id: ID, fields: { state: 'closed' } })).rejects.toThrow(/CVE library entry/);
    expect(c.updateRecord).not.toHaveBeenCalled();
    c.queryRecords.mockImplementation(async (p: any) => (p.table === 'sn_vul_vulnerable_item' ? { records: [{ sys_id: ID, number: 'VIT0010021' }] } : { records: [] }));
    await expect(executeSecurityToolCall(c, 'update_vulnerability', { sys_id: 'VIT0010021', fields: { state: 'deferred' } })).rejects.toThrow(/defer_until/);
    c.createRecord.mockResolvedValue({ sys_id: 'x', number: 'VCA0001' });
    const r = await executeSecurityToolCall(c, 'update_vulnerability', { sys_id: 'VIT0010021', defer_until: '2026-12-31', reason: 'No patch for this host yet', compensating_controls: 'WAF rule' });
    expect(c.createRecord).toHaveBeenCalledWith('sn_vul_change_approval', expect.objectContaining({ vul_record: ID, vul_table_name: 'sn_vul_vulnerable_item', desired_state: 12, desired_validity_date: '2026-12-31', compensating_controls: 'WAF rule' }));
    expect(c.updateRecord).not.toHaveBeenCalled();
    expect(r.summary).toMatch(/once approved/);
    c.updateRecord.mockResolvedValue({ sys_id: ID });
    await executeSecurityToolCall(c, 'update_vulnerability', { sys_id: 'VIT0010021', fields: { state: 'under investigation' } });
    expect(c.updateRecord).toHaveBeenCalledWith('sn_vul_vulnerable_item', ID, { state: '2' });
  });

  it('get_security_dashboard counts active SIRs and active vulnerable items', async () => {
    c.runStats.mockResolvedValue([{ stats: { count: 4 } }]);
    const r = await executeSecurityToolCall(c, 'get_security_dashboard', {});
    const queries = c.runStats.mock.calls.map((x: any[]) => `${x[0]}|${x[1].query}`);
    expect(queries).toContain('sn_si_incident|active=true^severity=1');
    expect(queries).toContain('sn_vul_vulnerable_item|active=true');
    expect(queries.some((q: string) => q.startsWith('sn_vul_entry'))).toBe(false);
    expect(r.open_vulnerabilities).toBe(4);
  });

  it('create_change_from_remediation_task goes through VR Create Change', async () => {
    c.queryRecords.mockResolvedValue({ records: [{ sys_id: ID, number: 'VUL0010001' }] });
    c.executeScript.mockResolvedValue({ ok: true, result: { change_sys_id: 'c'.repeat(32), number: 'CHG0030099', status: 'finished' } });
    const r = await executeSecurityToolCall(c, 'create_change_from_remediation_task', { remediation_task: 'VUL0010001', change_type: 'emergency', justification: "KEV 'due' now" });
    const script = c.executeScript.mock.calls[0][0] as string;
    expect(script).toContain('sn_vul_action_create_cr');
    expect(script).toContain('actionCreateChange');
    expect(script).toContain('"emergency"');
    expect(script).toContain(JSON.stringify("KEV 'due' now"));
    expect(r).toMatchObject({ number: 'CHG0030099', record_url: expect.stringContaining('change_request.do') });
    expect(getSecurityToolDefinitions().some((d) => d.name === 'create_change_from_remediation_task')).toBe(true);
    delete process.env.WRITE_ENABLED;
    await expect(executeSecurityToolCall(c, 'create_change_from_remediation_task', { remediation_task: 'VUL0010001' })).rejects.toThrow();
  });

  it('run_security_playbook no longer needs WRITE_ENABLED (it does not write)', async () => {
    delete process.env.WRITE_ENABLED;
    c.queryRecords.mockResolvedValue({ count: 0, records: [] });
    await expect(executeSecurityToolCall(c, 'run_security_playbook', { playbook_sys_id: ID, incident_sys_id: ID })).rejects.toThrow(/no API for starting a security playbook/);
  });
});

describe('Security incidents', () => {
  it('create_security_incident sets cmdb_ci and links the other CIs', async () => {
    c.createRecord.mockImplementation(async (t: string) => (t === 'sn_si_incident' ? { sys_id: ID, number: 'SIR0010099' } : { sys_id: 'l' }));
    const ci2 = 'b'.repeat(32);
    const r = await executeSecurityToolCall(c, 'create_security_incident', { short_description: 's', category: 'malware', affected_cis: [ID, ci2] });
    expect(c.createRecord.mock.calls[0]).toEqual(['sn_si_incident', { short_description: 's', category: 'malware', cmdb_ci: ID }]);
    expect(c.createRecord.mock.calls[1]).toEqual(['task_ci', { task: ID, ci_item: ci2 }]);
    expect(r.affected_cis_linked).toEqual([ID, ci2]);
  });
  it('update_security_incident maps labels and refuses invalid moves', async () => {
    c.getRecord.mockResolvedValue({ state: { value: '16' } });
    c.updateRecord.mockResolvedValue({ sys_id: ID });
    await executeSecurityToolCall(c, 'update_security_incident', { sys_id: ID, fields: { state: 'contain' } });
    expect(c.updateRecord).toHaveBeenCalledWith('sn_si_incident', ID, { state: '18' });
    c.getRecord.mockResolvedValue({ state: { value: '3' } });
    await expect(executeSecurityToolCall(c, 'update_security_incident', { sys_id: ID, fields: { state: 'analysis' } })).rejects.toThrow(/Closed/);
    await expect(executeSecurityToolCall(c, 'update_security_incident', { sys_id: ID, fields: { state: 'fixed' } })).rejects.toThrow(/Unknown/);
  });
  it('get_security_incident returns labels and the work notes', async () => {
    c.queryRecords.mockImplementation(async (p: any) => (p.table === 'sn_si_incident'
      ? { count: 1, records: [{ sys_id: { value: ID }, state: { value: '19', display_value: 'Eradicate' } }] }
      : { count: 1, records: [{ element: 'work_notes', value: 'Isolated host', sys_created_on: 'now', sys_created_by: 'sec' }] }));
    const r = await executeSecurityToolCall(c, 'get_security_incident', { number_or_sysid: 'SIR0010009' });
    expect(c.queryRecords.mock.calls[0][0].displayValue).toBe('all');
    expect(r.state.display_value).toBe('Eradicate');
    expect(r.work_notes_history[0]).toMatchObject({ type: 'work_notes', text: 'Isolated host' });
  });
  it('list_security_incidents maps open and labels', async () => {
    c.queryRecords.mockResolvedValue({ count: 0, records: [] });
    await executeSecurityToolCall(c, 'list_security_incidents', { state: 'open' });
    await executeSecurityToolCall(c, 'list_security_incidents', { state: 'Recover' });
    expect(c.queryRecords.mock.calls.map((x: any[]) => x[0].query)).toEqual(['active=true', 'state=20']);
  });
});

describe('Change and CMDB fixes', () => {
  it('list_change_requests maps state names', async () => {
    c.queryRecords.mockResolvedValue({ count: 0, records: [] });
    await executeChangeToolCall(c, 'list_change_requests', { state: 'implement' });
    expect(c.queryRecords.mock.calls[0][0].query).toBe('state=-1');
    await expect(executeChangeToolCall(c, 'list_change_requests', { state: 'done' })).rejects.toThrow(/Unknown change state/);
  });
  it('close_change_request reports an already closed change instead of moving it', async () => {
    c.getRecord.mockResolvedValue({ state: '3', number: 'CHG0030028' });
    const r = await executeChangeToolCall(c, 'close_change_request', { sys_id: ID, close_code: 'successful', close_notes: 'done' });
    expect(r.already_closed).toBe(true);
    expect(c.updateRecord).not.toHaveBeenCalled();
  });
  it('cmdb_impact_analysis returns names and classes and rejects a bad direction', async () => {
    await expect(executeCoreToolCall(c, 'cmdb_impact_analysis', { ci_sys_id: ID, direction: 'sideways' })).rejects.toThrow(/direction/);
    c.queryRecords.mockImplementation(async (p: any) => (p.query === `child=${ID}`
      ? { records: [{ sys_id: 'r', parent: { value: 'p'.repeat(32) }, 'parent.name': 'Storefront', 'parent.sys_class_name': 'cmdb_ci_service_discovered', 'type.name': 'Depends on::Used by' }] }
      : { records: [] }));
    const r = await executeCoreToolCall(c, 'cmdb_impact_analysis', { ci_sys_id: ID, direction: 'impacted', depth: 1 });
    expect(r.impact_analysis[0].impacted[0].ci).toEqual({ sys_id: 'p'.repeat(32), name: 'Storefront', class: 'cmdb_ci_service_discovered', relationship_type: 'Depends on::Used by' });
  });
  it('service_health offers candidates when the name is not exact', async () => {
    c.queryRecords.mockImplementation(async (p: any) => (p.query.startsWith('name=')
      ? { count: 0, records: [] }
      : { count: 2, records: [{ sys_id: 'a', name: 'Storefront EU' }, { sys_id: 'b', name: 'Storefront US' }] }));
    const r = await executeBundleToolCall(c, 'service_health', { name_or_sysid: 'Storefront' });
    expect(r.found).toBe(false);
    expect(r.candidates).toHaveLength(2);
  });
});

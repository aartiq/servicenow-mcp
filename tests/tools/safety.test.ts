import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { assertWriteAllowed } from '../../src/utils/guardrails.js';
import { searchTools } from '../../src/tools/index.js';

describe('guardrails', () => {
  const saved = { ...process.env };
  beforeEach(() => {
    delete process.env.NOWAIKIT_TABLE_DENYLIST;
    delete process.env.NOWAIKIT_FIELD_DENYLIST;
    delete process.env.NOWAIKIT_WRITE_SCOPE_PREFIX;
  });
  afterEach(() => { process.env = { ...saved }; });

  it('allows ordinary writes by default', () => {
    expect(() => assertWriteAllowed('incident', { short_description: 'x' })).not.toThrow();
  });

  it('blocks built-in sensitive fields', () => {
    expect(() => assertWriteAllowed('sys_user', { user_password: 'secret' })).toThrow(/denylist/);
  });

  it('honors a table denylist', () => {
    process.env.NOWAIKIT_TABLE_DENYLIST = 'sys_properties,sys_user';
    expect(() => assertWriteAllowed('sys_properties', { value: '1' })).toThrow(/NOWAIKIT_TABLE_DENYLIST/);
  });

  it('confines writes to an allowed scope prefix', () => {
    process.env.NOWAIKIT_WRITE_SCOPE_PREFIX = 'x_';
    expect(() => assertWriteAllowed('incident', { x: '1' })).toThrow(/scope/);
    expect(() => assertWriteAllowed('x_acme_app_table', { x: '1' })).not.toThrow();
  });

  it('honors a custom field denylist (table.field form)', () => {
    process.env.NOWAIKIT_FIELD_DENYLIST = 'incident.assigned_to';
    expect(() => assertWriteAllowed('incident', { assigned_to: 'abc' })).toThrow(/denylist/);
    expect(() => assertWriteAllowed('problem', { assigned_to: 'abc' })).not.toThrow();
  });
});

describe('searchTools', () => {
  it('finds incident creation tools by keyword', () => {
    const results = searchTools('create incident');
    expect(results.length).toBeGreaterThan(0);
    expect(results.map(r => r.name)).toContain('create_incident');
  });

  it('ranks exact name matches highest', () => {
    const results = searchTools('query_records');
    expect(results[0].name).toBe('query_records');
  });

  it('returns [] for nonsense', () => {
    expect(searchTools('zzzzznotarealtool')).toEqual([]);
  });
});

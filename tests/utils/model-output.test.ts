import { describe, it, expect, afterEach } from 'vitest';
import { compactValue, modelText } from '../../src/utils/model-output.js';

const record = {
  number: { display_value: 'INC0010001', value: 'INC0010001' },
  assigned_to: { display_value: '', value: '' },
  caller_id: { display_value: 'Abel Tuter', value: '62826bf03710200044e0bfc8bcbe5df1', link: 'https://x.service-now.com/api/now/table/sys_user/62826bf03710200044e0bfc8bcbe5df1' },
  priority: { display_value: '1 - Critical', value: '1' },
  close_notes: '',
  parent: null,
};

describe('model output compaction (lossless)', () => {
  const saved = process.env.NOWAIKIT_COMPACT_OUTPUT;
  afterEach(() => { if (saved === undefined) delete process.env.NOWAIKIT_COMPACT_OUTPUT; else process.env.NOWAIKIT_COMPACT_OUTPUT = saved; });

  it('keeps every field, including empty ones', () => {
    const out = compactValue({ count: 1, records: [record] }) as any;
    expect(Object.keys(out.records[0]).sort()).toEqual(Object.keys(record).sort());
    expect(out.records[0].assigned_to).toBe('');
    expect(out.records[0].close_notes).toBe('');
    expect(out.records[0].parent).toBeNull();
  });

  it('collapses identical value/display pairs and keeps both when they differ', () => {
    const out = compactValue(record) as any;
    expect(out.number).toBe('INC0010001');
    expect(out.priority).toEqual({ value: '1', display: '1 - Critical' });
    expect(out.caller_id).toEqual({ value: '62826bf03710200044e0bfc8bcbe5df1', display: 'Abel Tuter' });
  });

  it('drops only reference link URLs (the sys_id stays)', () => {
    expect(modelText(record)).not.toContain('/api/now/table/');
    expect(modelText(record)).toContain('62826bf03710200044e0bfc8bcbe5df1');
  });

  it('leaves objects that merely contain a value key alone', () => {
    expect(compactValue({ value: 'x', label: 'X' })).toEqual({ value: 'x', label: 'X' });
  });

  it('is compact JSON, and NOWAIKIT_COMPACT_OUTPUT=false restores the old output', () => {
    expect(modelText({ a: 1 })).toBe('{"a":1}');
    process.env.NOWAIKIT_COMPACT_OUTPUT = 'false';
    expect(modelText({ a: { display_value: 'b', value: 'b' } })).toBe(JSON.stringify({ a: { display_value: 'b', value: 'b' } }, null, 2));
  });
});

import { describe, it, expect } from 'vitest';
import { ServiceNowClient } from '../../src/servicenow/client.js';

/**
 * create_/update_ tools should hand the user a direct, clickable record link. createRecord/updateRecord
 * attach `record_url` centrally so every tool that returns the record (mostly `{ ...result }`) gets it.
 */
const mk = () => new ServiceNowClient({
  instanceUrl: 'https://example.service-now.com',
  authMethod: 'basic', basic: { username: 'a', password: 'b' },
});

describe('record deep-link (record_url)', () => {
  const c = mk();

  it('builds the human form URL, not the REST link', () => {
    expect(c.recordUrl('sys_script_include', 'abc123'))
      .toBe('https://example.service-now.com/sys_script_include.do?sys_id=abc123');
  });

  it('attaches record_url from a plain sys_id', () => {
    const r = c.attachRecordUrl('incident', { sys_id: 'sid1', number: 'INC001' }) as any;
    expect(r.record_url).toBe('https://example.service-now.com/incident.do?sys_id=sid1');
  });

  it('handles sys_id returned as an object {value}', () => {
    const r = c.attachRecordUrl('sys_script', { sys_id: { value: 'sid2', display_value: 'sid2' } }) as any;
    expect(r.record_url).toBe('https://example.service-now.com/sys_script.do?sys_id=sid2');
  });

  it('never clobbers an existing record_url', () => {
    const r = c.attachRecordUrl('incident', { sys_id: 'x', record_url: 'keep-me' }) as any;
    expect(r.record_url).toBe('keep-me');
  });

  it('is a no-op with no sys_id', () => {
    const r = c.attachRecordUrl('incident', { number: 'INC002' }) as any;
    expect(r.record_url).toBeUndefined();
  });
});

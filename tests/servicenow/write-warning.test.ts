import { describe, it, expect, vi, afterEach } from 'vitest';
import { ServiceNowClient } from '../../src/servicenow/client.js';

/** updateRecord flags fields whose value didn't come back, but journal fields always read back empty. */
const mk = () => new ServiceNowClient({
  instanceUrl: 'https://example.service-now.com',
  authMethod: 'basic', basic: { username: 'a', password: 'b' },
  maxRetries: 0,
});
const reply = (result: Record<string, unknown>) =>
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ result }), { status: 200, headers: { 'content-type': 'application/json' } })));

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('updateRecord write verification', () => {
  it('does not warn for work notes and comments, which always read back empty', async () => {
    process.env.NOWAIKIT_SKIP_MANDATORY_CHECK = 'true';
    reply({ sys_id: 'a'.repeat(32), work_notes: '', comments: '', state: '2' });
    const r: any = await mk().updateRecord('incident', 'a'.repeat(32), { work_notes: 'Rollback starting', comments: 'Update for the caller', state: '2' });
    expect(r._write_warning).toBeUndefined();
  });

  it('still warns when an ordinary field was discarded', async () => {
    process.env.NOWAIKIT_SKIP_MANDATORY_CHECK = 'true';
    reply({ sys_id: 'a'.repeat(32), work_notes: '', state: '1' });
    const r: any = await mk().updateRecord('incident', 'a'.repeat(32), { work_notes: 'note', state: '2' });
    expect(r._write_warning).toMatch(/state/);
    expect(r._write_warning).not.toMatch(/work_notes/);
  });
});

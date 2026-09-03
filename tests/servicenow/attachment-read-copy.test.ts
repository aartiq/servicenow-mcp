import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ServiceNowClient } from '../../src/servicenow/client.js';

/**
 * read_attachment returns text for text formats and metadata-only for binaries; copy_attachment
 * moves an existing attachment record-to-record entirely server-side (no bytes through the tool call).
 */
function metaRes(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, statusText: '', json: async () => ({ result: body }) } as unknown as Response;
}
function fileRes(bytes: Uint8Array, status = 200) {
  return { ok: status >= 200 && status < 300, status, statusText: '', arrayBuffer: async () => bytes.buffer, text: async () => '', json: async () => ({}) } as unknown as Response;
}

describe('read_attachment / copy_attachment', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => { fetchMock = vi.fn(); (global as any).fetch = fetchMock; });
  afterEach(() => vi.restoreAllMocks());
  const client = () => new ServiceNowClient({ instanceUrl: 'https://x.service-now.com', authMethod: 'basic', basic: { username: 'a', password: 'b' } });

  it('read_attachment returns decoded text for a text file', async () => {
    fetchMock.mockImplementation(async (url: any) => {
      const u = String(url);
      if (u.endsWith('/attachment/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1')) return metaRes({ file_name: 'notes.txt', content_type: 'text/plain', size_bytes: 5 });
      if (u.endsWith('/attachment/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1/file')) return fileRes(new TextEncoder().encode('hello'));
      return metaRes({});
    });
    const out = await client().readAttachment('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1');
    expect(out.text).toBe('hello');
    expect(out.file_name).toBe('notes.txt');
  });

  it('read_attachment returns metadata + note (no text) for a binary file', async () => {
    fetchMock.mockImplementation(async (url: any) => {
      const u = String(url);
      if (u.endsWith('/attachment/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb1')) return metaRes({ file_name: 'doc.pdf', content_type: 'application/pdf', size_bytes: 9 });
      if (u.endsWith('/attachment/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb1/file')) return fileRes(new Uint8Array([1, 2, 3]));
      return metaRes({});
    });
    const out = await client().readAttachment('bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb1');
    expect(out.text).toBeNull();
    expect(out.extractable).toBe(false);
    expect(out.note).toContain('binary');
  });

  it('copy_attachment fetches source bytes and re-posts to the target record', async () => {
    fetchMock.mockImplementation(async (url: any, opts: any) => {
      const u = String(url);
      if (u.endsWith('/attachment/aaaaaaaaaaaaaaaaaaaaaaaaaaaaddd1')) return metaRes({ file_name: 'orig.pdf', content_type: 'application/pdf' });
      if (u.endsWith('/attachment/aaaaaaaaaaaaaaaaaaaaaaaaaaaaddd1/file')) return fileRes(new TextEncoder().encode('PDFDATA'));
      if (u.includes('/api/now/attachment/file')) {
        expect(opts.method).toBe('POST');
        expect(u).toContain('table_name=kb_knowledge');
        expect(u).toContain('file_name=orig.pdf');
        return metaRes({ sys_id: 'NEW1', file_name: 'orig.pdf' }, 201);
      }
      return metaRes({});
    });
    const out = await client().copyAttachment('aaaaaaaaaaaaaaaaaaaaaaaaaaaaddd1', 'kb_knowledge', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaeee1');
    expect(out.sys_id).toBe('NEW1');
  });
});

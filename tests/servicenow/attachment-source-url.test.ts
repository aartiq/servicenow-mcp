import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ServiceNowClient } from '../../src/servicenow/client.js';

/**
 * upload_attachment must support a server-side fetch (source_url) so large files never travel
 * through the LLM/tool call as base64. content_type is inferred when not supplied, protected URLs
 * can carry an Authorization header, and the raw bytes are POSTed to the native attachment endpoint.
 */
function res(status: number, body: unknown, headers: Record<string, string> = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: '',
    headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
    json: async () => body,
    arrayBuffer: async () => (body instanceof Uint8Array ? body.buffer : new TextEncoder().encode(String(body)).buffer),
  } as unknown as Response;
}

describe('uploadAttachmentFromUrl', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => { fetchMock = vi.fn(); (global as any).fetch = fetchMock; });
  afterEach(() => vi.restoreAllMocks());

  const client = () => new ServiceNowClient({ instanceUrl: 'https://x.service-now.com', authMethod: 'basic', basic: { username: 'a', password: 'b' } });

  it('fetches the URL server-side and POSTs raw bytes to the native attachment endpoint', async () => {
    const fileBytes = new TextEncoder().encode('%PDF-1.4' + ' hello world'.repeat(20)); // >100 bytes, valid %PDF header
    fetchMock.mockImplementation(async (url: any, opts: any) => {
      const u = String(url);
      if (u.startsWith('https://files.example.com')) {
        // the source fetch, with the caller-provided auth header
        expect(opts?.headers?.Authorization).toBe('Bearer XYZ');
        return res(200, fileBytes, { 'content-type': 'application/pdf' });
      }
      if (u.includes('/api/now/attachment/file')) {
        expect(opts.method).toBe('POST');
        expect(opts.headers['Content-Type']).toBe('application/pdf');
        return res(201, { result: { sys_id: 'ATT1', file_name: 'doc.pdf' } });
      }
      return res(200, { result: {} }); // auth/other
    });

    const out = await client().uploadAttachmentFromUrl(
      'kb_knowledge', 'KB1', 'doc.pdf', 'https://files.example.com/doc.pdf', undefined, { Authorization: 'Bearer XYZ' }
    );
    expect(out.sys_id).toBe('ATT1');
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('/api/now/attachment/file'))).toBe(true);
  });

  it('rejects a non-http(s) source_url before making any request', async () => {
    await expect(
      client().uploadAttachmentFromUrl('kb_knowledge', 'KB1', 'x.pdf', 'file:///etc/passwd')
    ).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('surfaces a clear error when the source URL is unreachable', async () => {
    fetchMock.mockImplementation(async (url: any) => {
      if (String(url).startsWith('https://files.example.com')) return res(404, 'nope');
      return res(200, { result: {} });
    });
    await expect(
      client().uploadAttachmentFromUrl('kb_knowledge', 'KB1', 'x.pdf', 'https://files.example.com/missing.pdf')
    ).rejects.toMatchObject({ code: 'ATTACHMENT_SOURCE_FETCH_FAILED' });
  });
});

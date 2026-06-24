import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { executeDocsToolCall, getDocsToolDefinitions } from '../../src/tools/docs.js';

// A minimal Fluid Topics clustered-search payload.
const SEARCH_PAYLOAD = {
  facets: [],
  results: [
    {
      entries: [
        {
          type: 'TOPIC',
          topic: {
            mapId: 'MAP1',
            contentId: 'CONTENT1',
            title: 'GlideRecord - Scoped',
            htmlTitle: 'GlideRecord - <b>Scoped</b>',
            mapTitle: 'API reference',
            breadcrumb: 'API reference / Server API reference / GlideRecord - Scoped',
            htmlExcerpt: 'The scoped <b>GlideRecord</b> API is used for database operations.',
            readerUrl: 'https://www.servicenow.com/docs/r/api-reference/server-api-reference/c_GlideRecordScopedAPI.html',
          },
        },
      ],
    },
  ],
};

const CONTENT_HTML =
  '<html><body><article><h1>GlideRecord - Scoped</h1><p>The scoped GlideRecord API is used for database operations.</p><script>var x=1;</script></article></body></html>';

function mockFetch(payloadFor: (url: string, init?: any) => { ok?: boolean; status?: number; json?: any; text?: string }) {
  return vi.fn(async (url: string, init?: any) => {
    const r = payloadFor(url, init);
    return {
      ok: r.ok ?? true,
      status: r.status ?? 200,
      json: async () => r.json,
      text: async () => r.text ?? '',
    } as any;
  });
}

describe('getDocsToolDefinitions', () => {
  it('exposes search + fetch docs tools', () => {
    const names = getDocsToolDefinitions().map((t) => t.name);
    expect(names).toContain('search_servicenow_docs');
    expect(names).toContain('fetch_servicenow_doc');
  });
});

describe('executeDocsToolCall', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.restoreAllMocks();
  });
  beforeEach(() => vi.clearAllMocks());

  it('returns null for unmatched tool names', async () => {
    expect(await executeDocsToolCall('not_a_docs_tool', {})).toBeNull();
  });

  it('search_servicenow_docs returns ranked results with refs', async () => {
    globalThis.fetch = mockFetch(() => ({ json: SEARCH_PAYLOAD }));
    const res = await executeDocsToolCall('search_servicenow_docs', { query: 'GlideRecord scoped' });
    expect(res.count).toBe(1);
    expect(res.results[0].title).toBe('GlideRecord - Scoped'); // html stripped
    expect(res.results[0].ref).toBe('MAP1/CONTENT1');
    expect(res.results[0].snippet).toContain('database operations');
  });

  it('search_servicenow_docs requires a query', async () => {
    await expect(executeDocsToolCall('search_servicenow_docs', {})).rejects.toThrow(/query is required/);
  });

  it('fetch_servicenow_doc reads content by ref and strips markup/scripts', async () => {
    globalThis.fetch = mockFetch(() => ({ text: CONTENT_HTML }));
    const res = await executeDocsToolCall('fetch_servicenow_doc', { ref: 'MAP1/CONTENT1' });
    expect(res.title).toBe('GlideRecord - Scoped');
    expect(res.content).toContain('database operations');
    expect(res.content).not.toContain('var x=1'); // script removed
  });

  it('fetch_servicenow_doc rejects non-ServiceNow URLs (SSRF guard)', async () => {
    await expect(executeDocsToolCall('fetch_servicenow_doc', { url: 'https://evil.example.com/x' })).rejects.toThrow(
      /allowed/
    );
  });

  it('fetch_servicenow_doc requires a ref or url', async () => {
    await expect(executeDocsToolCall('fetch_servicenow_doc', {})).rejects.toThrow(/ref.*url|url.*ref/);
  });
});

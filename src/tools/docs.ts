/**
 * ServiceNow product-documentation tools.
 *
 * NowAIKit already exposes live SDK docs (fluent_explain) and instance Knowledge
 * (search_knowledge). These tools cover the third surface developers reach for:
 * the official ServiceNow product documentation at servicenow.com/docs — API
 * references (GlideRecord, GlideSystem…), admin guides, encoded-query operators,
 * release notes, etc. Lets an AI ground answers in current docs instead of
 * training-data guesses.
 *
 *   - search_servicenow_docs : full-text search over servicenow.com/docs
 *   - fetch_servicenow_doc   : fetch the readable text of a specific docs page
 *
 * Backed by the public Fluid Topics REST API that powers servicenow.com/docs
 * (POST /api/khub/clustered-search + the topic content endpoint). Both tools are
 * read-only, reach only the public docs site (never the customer instance), need
 * no ServiceNow credentials, and require no extra permissions.
 */
import { ServiceNowError } from '../utils/errors.js';

const DOCS_BASE = 'https://www.servicenow.com/docs';
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

/** Hosts we are willing to fetch from — keeps fetch_servicenow_doc free of SSRF risk. */
const ALLOWED_DOC_HOSTS = new Set(['www.servicenow.com', 'servicenow.com', 'docs.servicenow.com']);

export function getDocsToolDefinitions() {
  return [
    {
      name: 'search_servicenow_docs',
      description:
        'Search the official ServiceNow product documentation (servicenow.com/docs) — API references ' +
        '(GlideRecord, GlideSystem, GlideAjax…), admin & developer guides, encoded-query operators, release notes. ' +
        'Returns ranked results with title, breadcrumb, URL, snippet, and a `ref` to read the full page with ' +
        'fetch_servicenow_doc. Use this to ground answers in current ServiceNow docs rather than memory. ' +
        'Read-only; uses the public docs site, not your instance.',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'What to look up (e.g., "GlideRecord addEncodedQuery", "flow designer rest step", "CSDM 4.0").',
          },
          limit: {
            type: 'number',
            description: 'Max results to return (default 6, max 20).',
          },
          product: {
            type: 'string',
            description:
              'Optional product/area to bias the search (e.g., "ITSM", "CMDB", "Flow Designer", "Performance Analytics").',
          },
        },
        required: ['query'],
      },
    },
    {
      name: 'fetch_servicenow_doc',
      description:
        'Fetch the full readable text of a specific ServiceNow documentation page. Pass either the `ref` returned by ' +
        'search_servicenow_docs (fastest, exact) or a servicenow.com/docs page URL. Use after search_servicenow_docs ' +
        'to read a result in full. Read-only; only ServiceNow docs are reachable.',
      inputSchema: {
        type: 'object',
        properties: {
          ref: {
            type: 'string',
            description: 'The `ref` from a search_servicenow_docs result (preferred — resolves directly to page content).',
          },
          url: {
            type: 'string',
            description: 'A servicenow.com/docs page URL (used when no ref is available; resolved via docs search).',
          },
          maxChars: {
            type: 'number',
            description: 'Truncate the returned text to this many characters (default 9000, max 30000).',
          },
        },
        required: [],
      },
    },
  ];
}

// ─── HTML / HTTP helpers (dependency-free) ────────────────────────────────────

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '—', ndash: '–', hellip: '…',
};

function decodeEntities(s: string): string {
  return s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (m, code: string) => {
    if (code[0] === '#') {
      const num = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(num) ? String.fromCodePoint(num) : m;
    }
    return NAMED_ENTITIES[code] ?? m;
  });
}

function stripTags(html: string): string {
  return decodeEntities(String(html ?? '').replace(/<[^>]+>/g, ' ')).replace(/[^\S\n]+/g, ' ').trim();
}

async function http(path: string, init?: RequestInit & { timeoutMs?: number }): Promise<Response> {
  const url = path.startsWith('http') ? path : `${DOCS_BASE}/${path.replace(/^\//, '')}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), init?.timeoutMs ?? 15000);
  try {
    const res = await fetch(url, {
      ...init,
      headers: { 'User-Agent': UA, Accept: 'application/json, text/html', ...(init?.headers || {}) },
      signal: controller.signal,
      redirect: 'follow',
    });
    if (!res.ok) throw new ServiceNowError(`Documentation request failed (HTTP ${res.status})`, 'DOCS_HTTP_ERROR');
    return res;
  } catch (err: any) {
    if (err instanceof ServiceNowError) throw err;
    if (err?.name === 'AbortError') throw new ServiceNowError('Documentation request timed out', 'DOCS_TIMEOUT');
    throw new ServiceNowError(`Documentation request error: ${err?.message || 'unknown'}`, 'DOCS_FETCH_ERROR');
  } finally {
    clearTimeout(timer);
  }
}

interface FtTopic {
  mapId?: string;
  contentId?: string;
  title?: string;
  htmlTitle?: string;
  mapTitle?: string;
  breadcrumb?: string | string[];
  htmlExcerpt?: string;
  readerUrl?: string;
}

/** POST the Fluid Topics clustered-search and flatten its grouped result entries. */
async function clusteredSearch(query: string, perPage: number): Promise<FtTopic[]> {
  const res = await http('api/khub/clustered-search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query,
      filters: [{ key: 'ft:locale', values: ['en-US'] }],
      paging: { page: 1, perPage },
    }),
  });
  const data = (await res.json()) as { results?: Array<{ entries?: Array<{ topic?: FtTopic; map?: FtTopic }> }> };
  const topics: FtTopic[] = [];
  for (const group of data.results || []) {
    const entry = group.entries?.[0];
    const t = entry?.topic || entry?.map;
    if (t && t.readerUrl) topics.push(t);
  }
  return topics;
}

function breadcrumbOf(t: FtTopic): string {
  if (Array.isArray(t.breadcrumb)) return t.breadcrumb.map((b) => stripTags(b)).join(' / ');
  if (t.breadcrumb) return stripTags(t.breadcrumb);
  return stripTags(t.mapTitle || '');
}

/** The page filename (case preserved) — e.g. "c_GlideRecordScopedAPI". */
function urlFilename(u: string): string {
  try {
    const path = new URL(u).pathname.replace(/\.html?$/i, '');
    return path.split('/').filter(Boolean).pop() || '';
  } catch {
    return '';
  }
}

/** Lowercased filename so two reader URLs for the same page compare equal. */
function urlSlug(u: string): string {
  return urlFilename(u).toLowerCase();
}

/** Turn a docs filename slug into a natural-language query the search index matches.
 *  e.g. "c_GlideRecordScopedAPI" -> "GlideRecord Scoped API" */
function humanizeSlug(slug: string): string {
  return slug
    .replace(/^(c|t|r|concept|task|reference)[_-]/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim();
}

// ─── Execution ────────────────────────────────────────────────────────────────

export async function executeDocsToolCall(name: string, args: Record<string, any>): Promise<any> {
  switch (name) {
    case 'search_servicenow_docs': {
      const query = (args.query || '').toString().trim();
      if (!query) throw new ServiceNowError('query is required', 'INVALID_REQUEST');
      const limit = Math.min(Math.max(Number(args.limit) || 6, 1), 20);
      const product = (args.product || '').toString().trim();
      const terms = `${product ? product + ' ' : ''}${query}`.trim();

      const topics = await clusteredSearch(terms, limit);
      const results = topics.map((t) => ({
        title: stripTags(t.htmlTitle || t.title || ''),
        breadcrumb: breadcrumbOf(t),
        url: t.readerUrl,
        snippet: stripTags(t.htmlExcerpt || ''),
        ref: t.mapId && t.contentId ? `${t.mapId}/${t.contentId}` : undefined,
      }));

      if (results.length === 0) {
        return {
          query: terms,
          results: [],
          note: `No documentation results found. Try broader terms or a specific API name, or browse https://www.servicenow.com/docs and search for "${terms}".`,
        };
      }
      return {
        query: terms,
        count: results.length,
        results,
        hint: 'Call fetch_servicenow_doc with a result `ref` (or `url`) to read the full page.',
      };
    }

    case 'fetch_servicenow_doc': {
      let ref = (args.ref || '').toString().trim();
      const url = (args.url || '').toString().trim();
      if (!ref && !url) throw new ServiceNowError('Provide a `ref` (from search) or a docs `url`', 'INVALID_REQUEST');
      const maxChars = Math.min(Math.max(Number(args.maxChars) || 9000, 500), 30000);

      // Resolve a URL to a content ref when no ref was supplied.
      let resolvedUrl: string | undefined = url || undefined;
      if (!ref && url) {
        let parsed: URL;
        try {
          parsed = new URL(url);
        } catch {
          throw new ServiceNowError('Invalid url', 'INVALID_REQUEST');
        }
        if (parsed.protocol !== 'https:' || !ALLOWED_DOC_HOSTS.has(parsed.hostname)) {
          throw new ServiceNowError(
            `Only https servicenow.com/docs URLs are allowed (${[...ALLOWED_DOC_HOSTS].join(', ')}).`,
            'DOCS_HOST_NOT_ALLOWED'
          );
        }
        const slug = urlSlug(url);
        const matches = await clusteredSearch(humanizeSlug(urlFilename(url)) || slug, 20);
        const hit =
          matches.find((m) => m.mapId && m.contentId && urlSlug(m.readerUrl || '') === slug) ||
          matches.find((m) => m.mapId && m.contentId && (m.readerUrl || '').endsWith(parsed.pathname));
        if (!hit || !hit.mapId || !hit.contentId) {
          // Docs search ranking is fuzzy, so an exact URL match isn't guaranteed.
          // Return close candidates (each with a reliable `ref`) instead of failing —
          // the caller can re-call with the right ref.
          return {
            resolved: false,
            requestedUrl: url,
            note: 'Could not match that exact URL. Re-call fetch_servicenow_doc with one of these `ref` values, or use search_servicenow_docs.',
            candidates: matches
              .filter((m) => m.mapId && m.contentId)
              .slice(0, 6)
              .map((m) => ({
                title: stripTags(m.htmlTitle || m.title || ''),
                url: m.readerUrl,
                ref: `${m.mapId}/${m.contentId}`,
              })),
          };
        }
        ref = `${hit.mapId}/${hit.contentId}`;
        resolvedUrl = hit.readerUrl;
      }

      const [mapId, contentId] = ref.split('/');
      if (!mapId || !contentId) {
        throw new ServiceNowError('Invalid `ref` — expected "<mapId>/<contentId>" from a search result.', 'INVALID_REQUEST');
      }

      const res = await http(`api/khub/maps/${encodeURIComponent(mapId)}/topics/${encodeURIComponent(contentId)}/content`);
      const html = await res.text();
      const bodyMatch = html.match(/<(?:article|main)\b[^>]*>([\s\S]*?)<\/(?:article|main)>/i);
      const titleMatch = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
      const raw = (bodyMatch ? bodyMatch[1] : html)
        .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style\b[\s\S]*?<\/style>/gi, ' ');
      let text = stripTags(raw).replace(/[^\S\n]*\n[^\S\n]*\n+/g, '\n\n');
      const truncated = text.length > maxChars;
      if (truncated) text = text.slice(0, maxChars);

      return {
        url: resolvedUrl,
        title: titleMatch ? stripTags(titleMatch[1]) : undefined,
        truncated,
        content: text,
      };
    }

    default:
      return null;
  }
}

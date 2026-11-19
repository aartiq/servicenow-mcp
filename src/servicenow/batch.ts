/**
 * ServiceNow Batch API helpers (POST /api/now/v1/batch).
 *
 * ServiceNow rejects the whole batch with 400 "The provided BatchRESTRequest was not formatted
 * correctly" unless each sub-request body is Base64-encoded and headers are an array of
 * { name, value }. Response bodies come back Base64-encoded too (body_encoding: "base64").
 */

/** Maximum operations ServiceNow accepts in one Batch API call. */
export const BATCH_MAX_REQUESTS = 50;

export interface BatchOperation {
  id: string;
  method: string;
  url: string;
  body?: unknown;
}

export interface BatchResult {
  id: string;
  status_code: number;
  status_text?: string;
  body: unknown;
  error?: string;
}

const HEADERS = [
  { name: 'Content-Type', value: 'application/json' },
  { name: 'Accept', value: 'application/json' },
];

/** Upper-case the method so "get" and "GET" mean the same thing. */
export function normaliseMethod(method: unknown): string {
  return String(method ?? '').trim().toUpperCase();
}

/** True when any operation changes data (anything other than GET). */
export function batchHasWrites(ops: Array<{ method?: unknown }>): boolean {
  return ops.some((op) => normaliseMethod(op.method) !== 'GET');
}

/** A full instance URL or a bare path, as the relative URL the Batch API expects. */
export function toRelativeUrl(url: string): string {
  const m = /^https?:\/\/[^/]+(\/.*)?$/i.exec(url);
  const path = m ? (m[1] || '/') : url;
  return path.startsWith('/') ? path : `/${path}`;
}

export function buildBatchPayload(ops: BatchOperation[], batchId: string) {
  return {
    batch_request_id: batchId,
    rest_requests: ops.map((op, i) => {
      const out: Record<string, unknown> = {
        id: op.id || `${batchId}_${i}`,
        method: normaliseMethod(op.method),
        url: toRelativeUrl(String(op.url ?? '')),
        headers: HEADERS.map((h) => ({ ...h })),
      };
      if (op.body !== undefined && op.body !== null && op.body !== '') {
        const text = typeof op.body === 'string' ? op.body : JSON.stringify(op.body);
        out.body = Buffer.from(text, 'utf8').toString('base64');
      }
      return out;
    }),
  };
}

function parseJson(text: unknown): unknown {
  if (typeof text !== 'string') return text;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** Decode a sub-response body: Base64 when marked (or when it plainly decodes to JSON), then JSON. */
export function decodeBatchBody(body: unknown, encoding: unknown): unknown {
  if (typeof body !== 'string') return body ?? null;
  if (body === '') return null;
  if (String(encoding ?? '').toLowerCase() === 'base64') return parseJson(Buffer.from(body, 'base64').toString('utf8'));
  if (/^[A-Za-z0-9+/]+={0,2}$/.test(body) && body.length % 4 === 0) {
    try {
      return JSON.parse(Buffer.from(body, 'base64').toString('utf8'));
    } catch { /* not Base64 JSON */ }
  }
  return parseJson(body);
}

function errorText(body: unknown): string | undefined {
  if (body && typeof body === 'object' && 'error' in body) {
    const e = (body as { error?: { message?: string; detail?: string } }).error;
    return e?.message || e?.detail || 'Request failed';
  }
  return undefined;
}

/** Parse a batch response into results, including requests ServiceNow did not run (status_code 0). */
export function parseBatchResponse(raw: any): BatchResult[] {
  const items: BatchResult[] = (Array.isArray(raw?.serviced_requests) ? raw.serviced_requests : []).map((r: any) => {
    const body = decodeBatchBody(r.body, r.body_encoding);
    const code = Number(r.status_code);
    const out: BatchResult = { id: String(r.id), status_code: code, body };
    if (r.status_text) out.status_text = String(r.status_text);
    if (code >= 400) out.error = errorText(body) ?? out.status_text ?? 'Request failed';
    return out;
  });
  for (const u of Array.isArray(raw?.unserviced_requests) ? raw.unserviced_requests : []) {
    const id = typeof u === 'string' ? u : u?.id;
    items.push({ id: String(id), status_code: 0, body: null, error: 'Not run by ServiceNow (unserviced request)' });
  }
  return items;
}

/** Put results back in the order the operations were given; ids ServiceNow never mentioned are reported as not run. */
export function orderResults(ops: BatchOperation[], results: BatchResult[]): BatchResult[] {
  const byId = new Map(results.map((r) => [r.id, r]));
  return ops.map((op) => byId.get(op.id) ?? { id: op.id, status_code: 0, body: null, error: 'No response from ServiceNow for this operation' });
}

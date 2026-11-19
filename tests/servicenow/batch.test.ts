import { describe, it, expect } from 'vitest';
import { batchHasWrites, buildBatchPayload, decodeBatchBody, orderResults, parseBatchResponse, toRelativeUrl } from '../../src/servicenow/batch.js';

const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64');

describe('batch API helpers', () => {
  it('Base64-encodes bodies, upper-cases methods and uses relative URLs', () => {
    const p = buildBatchPayload([
      { id: 'a', method: 'get', url: 'api/now/table/incident?sysparm_limit=1' },
      { id: 'b', method: 'POST', url: 'https://x.service-now.com/api/now/table/incident', body: { short_description: 'Ünïcode' } },
    ], 'batch1');
    expect(p.batch_request_id).toBe('batch1');
    const [a, b] = p.rest_requests as any[];
    expect(a).toMatchObject({ id: 'a', method: 'GET', url: '/api/now/table/incident?sysparm_limit=1' });
    expect(a.body).toBeUndefined();
    expect(b.url).toBe('/api/now/table/incident');
    expect(JSON.parse(Buffer.from(b.body, 'base64').toString('utf8'))).toEqual({ short_description: 'Ünïcode' });
    expect(b.headers).toEqual([{ name: 'Content-Type', value: 'application/json' }, { name: 'Accept', value: 'application/json' }]);
  });

  it('treats any non-GET method as a write, whatever the case', () => {
    expect(batchHasWrites([{ method: 'get' }, { method: 'GET' }])).toBe(false);
    expect(batchHasWrites([{ method: 'get' }, { method: 'patch' }])).toBe(true);
  });

  it('decodes Base64 bodies and parses JSON', () => {
    expect(decodeBatchBody(b64('{"result":{"sys_id":"1"}}'), 'base64')).toEqual({ result: { sys_id: '1' } });
    expect(decodeBatchBody(b64('{"ok":true}'), undefined)).toEqual({ ok: true });
    expect(decodeBatchBody('{"plain":1}', undefined)).toEqual({ plain: 1 });
    expect(decodeBatchBody('', 'base64')).toBeNull();
    expect(toRelativeUrl('https://a.b/c')).toBe('/c');
  });

  it('reports errors and unserviced requests, and keeps request order', () => {
    const results = parseBatchResponse({
      serviced_requests: [
        { id: 'b', status_code: 404, status_text: 'Not Found', body: b64('{"error":{"message":"No Record found"}}'), body_encoding: 'base64' },
        { id: 'a', status_code: 200, body: b64('{"result":[]}'), body_encoding: 'base64' },
      ],
      unserviced_requests: ['c'],
    });
    const ordered = orderResults([{ id: 'a', method: 'GET', url: '/x' }, { id: 'b', method: 'GET', url: '/y' }, { id: 'c', method: 'GET', url: '/z' }, { id: 'd', method: 'GET', url: '/w' }], results);
    expect(ordered.map((r) => r.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(ordered[0]).toMatchObject({ status_code: 200, body: { result: [] } });
    expect(ordered[1]).toMatchObject({ status_code: 404, error: 'No Record found' });
    expect(ordered[2]).toMatchObject({ status_code: 0, error: expect.stringMatching(/unserviced/) });
    expect(ordered[3]).toMatchObject({ status_code: 0, error: expect.stringMatching(/No response/) });
  });
});

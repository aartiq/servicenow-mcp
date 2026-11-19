import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleEmbeddedMcp } from '../src/embed.js';
import type { ServiceNowClient } from '../src/servicenow/client.js';

const mockClient = {} as ServiceNowClient;

describe('handleEmbeddedMcp', () => {
  beforeEach(() => vi.clearAllMocks());

  it('initialize → returns tools capability + serverInfo', async () => {
    const res = await handleEmbeddedMcp({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } }, { client: mockClient });
    expect((res as any).result.capabilities.tools).toBeDefined();
    expect((res as any).result.serverInfo.name).toBeTruthy();
    expect((res as any).result.protocolVersion).toBe('2025-06-18');
  });

  it('tools/list → returns the tool catalog', async () => {
    const res = await handleEmbeddedMcp({ jsonrpc: '2.0', id: 2, method: 'tools/list' }, { client: mockClient });
    const tools = (res as any).result.tools;
    expect(Array.isArray(tools)).toBe(true);
    expect(tools.length).toBeGreaterThan(100);
    expect(tools.every((t: any) => typeof t.name === 'string')).toBe(true);
  });

  it('notifications/* → no response', async () => {
    const res = await handleEmbeddedMcp({ jsonrpc: '2.0', method: 'notifications/initialized' }, { client: mockClient });
    expect(res).toBeUndefined();
  });

  it('unknown method → JSON-RPC -32601', async () => {
    const res = await handleEmbeddedMcp({ jsonrpc: '2.0', id: 9, method: 'does/not/exist' }, { client: mockClient });
    expect((res as any).error.code).toBe(-32601);
  });

  it('tools/call → routes through executeTool and formats the result', async () => {
    // query_records is a read tool; stub the client method it calls.
    const client = {
      queryRecords: vi.fn().mockResolvedValue({ count: 1, records: [{ number: 'INC0001' }] }),
    } as unknown as ServiceNowClient;
    const res = await handleEmbeddedMcp(
      { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'query_records', arguments: { table: 'incident', limit: 1 } } },
      { client, delegated: { flags: { write: false } } },
    );
    const result = (res as any).result;
    expect(result.content[0].type).toBe('text');
    expect(result.content[0].text).toContain('INC0001');
    expect(result.isError).toBeFalsy();
  });

  it('initialize → answers a supported version, never an arbitrary echo', async () => {
    const none = await handleEmbeddedMcp({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }, { client: mockClient });
    expect((none as any).result.protocolVersion).toBe('2025-06-18');
    const newer = await handleEmbeddedMcp({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25' } }, { client: mockClient });
    expect((newer as any).result.protocolVersion).toBe('2025-11-25');
    const bogus = await handleEmbeddedMcp({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '1999-01-01' } }, { client: mockClient });
    expect((bogus as any).result.protocolVersion).toBe('2025-11-25');
  });

  const modernMeta = { 'io.modelcontextprotocol/protocolVersion': '2026-07-28' };

  it('server/discover → 2026-07-28 opening with cache fields and server identity', async () => {
    const res = await handleEmbeddedMcp({ jsonrpc: '2.0', id: 5, method: 'server/discover', params: { _meta: modernMeta } }, { client: mockClient });
    const result = (res as any).result;
    expect(result.supportedVersions).toEqual(['2026-07-28']);
    expect(result.capabilities.tools).toBeDefined();
    expect(result.resultType).toBe('complete');
    expect(result.ttlMs).toBe(0);
    expect(result.cacheScope).toBe('private');
    expect(result._meta['io.modelcontextprotocol/serverInfo'].name).toBeTruthy();
  });

  it('modern tools/list → resultType + ttlMs/cacheScope; legacy tools/list unchanged', async () => {
    const modern = (await handleEmbeddedMcp({ jsonrpc: '2.0', id: 6, method: 'tools/list', params: { _meta: modernMeta } }, { client: mockClient }) as any).result;
    expect(modern.resultType).toBe('complete');
    expect(modern.ttlMs).toBe(0);
    expect(modern.cacheScope).toBe('private');
    const legacy = (await handleEmbeddedMcp({ jsonrpc: '2.0', id: 7, method: 'tools/list' }, { client: mockClient }) as any).result;
    expect(legacy.resultType).toBeUndefined();
    expect(legacy.ttlMs).toBeUndefined();
    // A 2025-era claim in _meta is legacy traffic, not an unsupported modern revision.
    const claimed = (await handleEmbeddedMcp({ jsonrpc: '2.0', id: 8, method: 'tools/list', params: { _meta: { 'io.modelcontextprotocol/protocolVersion': '2025-06-18' } } }, { client: mockClient }) as any);
    expect(claimed.error).toBeUndefined();
    expect(claimed.result.resultType).toBeUndefined();
  });

  it('unknown modern revision → -32022 with the supported list', async () => {
    const res = await handleEmbeddedMcp({ jsonrpc: '2.0', id: 9, method: 'tools/list', params: { _meta: { 'io.modelcontextprotocol/protocolVersion': '2099-01-01' } } }, { client: mockClient });
    expect((res as any).error.code).toBe(-32022);
    expect((res as any).error.data).toEqual({ supported: ['2026-07-28'], requested: '2099-01-01' });
  });

  it('modern tools/call → result carries resultType complete', async () => {
    const client = { queryRecords: vi.fn().mockResolvedValue({ count: 0, records: [] }) } as unknown as ServiceNowClient;
    const res = await handleEmbeddedMcp(
      { jsonrpc: '2.0', id: 10, method: 'tools/call', params: { name: 'query_records', arguments: { table: 'incident' }, _meta: modernMeta } },
      { client },
    );
    expect((res as any).result.resultType).toBe('complete');
    expect((res as any).result.content[0].type).toBe('text');
  });

  it('ping → legacy only', async () => {
    expect((await handleEmbeddedMcp({ jsonrpc: '2.0', id: 11, method: 'ping' }, { client: mockClient }) as any).result).toEqual({});
    expect((await handleEmbeddedMcp({ jsonrpc: '2.0', id: 12, method: 'ping', params: { _meta: modernMeta } }, { client: mockClient }) as any).error.code).toBe(-32601);
  });

  it('tools/call error → returns isError result, not a thrown exception', async () => {
    const client = {
      queryRecords: vi.fn().mockRejectedValue(new Error('boom')),
    } as unknown as ServiceNowClient;
    const res = await handleEmbeddedMcp(
      { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'query_records', arguments: { table: 'incident' } } },
      { client },
    );
    expect((res as any).result.isError).toBe(true);
    expect((res as any).result.content[0].text).toContain('boom');
  });
});

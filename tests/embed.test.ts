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

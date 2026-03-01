import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeCoreToolCall, getCoreToolDefinitions } from '../../src/tools/core.js';
import type { ServiceNowClient } from '../../src/servicenow/client.js';

const mockClient = {
  queryRecords: vi.fn(),
  getRecord: vi.fn(),
  getTableSchema: vi.fn(),
  getUser: vi.fn(),
  getGroup: vi.fn(),
  searchCmdbCi: vi.fn(),
  getCmdbCi: vi.fn(),
  listRelationships: vi.fn(),
  listDiscoverySchedules: vi.fn(),
  listMidServers: vi.fn(),
  listActiveEvents: vi.fn(),
  cmdbHealthDashboard: vi.fn(),
  serviceMappingSummary: vi.fn(),
  createChangeRequest: vi.fn(),
  naturalLanguageSearch: vi.fn(),
  naturalLanguageUpdate: vi.fn(),
} as unknown as ServiceNowClient;

describe('getCoreToolDefinitions', () => {
  it('returns 21 core tool definitions', () => {
    const tools = getCoreToolDefinitions();
    expect(tools.length).toBe(21);
  });

  it('all tools have name, description and inputSchema', () => {
    getCoreToolDefinitions().forEach(t => {
      expect(t.name).toBeTruthy();
      expect(t.description).toBeTruthy();
      expect(t.inputSchema).toBeTruthy();
    });
  });
});

describe('executeCoreToolCall – query_records', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns records with summary', async () => {
    (mockClient.queryRecords as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 2, records: [{ sys_id: 'a' }, { sys_id: 'b' }] });
    const result = await executeCoreToolCall(mockClient, 'query_records', { table: 'incident' });
    expect(result.count).toBe(2);
    expect(result.summary).toContain('2 record');
  });

  it('throws when table is missing', async () => {
    await expect(executeCoreToolCall(mockClient, 'query_records', {})).rejects.toThrow('Table name is required');
  });
});

describe('executeCoreToolCall – get_record', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns record from client', async () => {
    (mockClient.getRecord as ReturnType<typeof vi.fn>).mockResolvedValue({ sys_id: 'abc', number: 'INC001' });
    const result = await executeCoreToolCall(mockClient, 'get_record', { table: 'incident', sys_id: 'abc' });
    expect(result.sys_id).toBe('abc');
  });

  it('throws when sys_id is missing', async () => {
    await expect(executeCoreToolCall(mockClient, 'get_record', { table: 'incident' })).rejects.toThrow();
  });
});

describe('executeCoreToolCall – create_change_request (moved to change module)', () => {
  it('returns null because create_change_request is now in the change module', async () => {
    const result = await executeCoreToolCall(mockClient, 'create_change_request', { short_description: 'Test change', assignment_group: 'IT Ops' });
    expect(result).toBeNull();
  });
});

describe('executeCoreToolCall – unknown tool', () => {
  it('returns null for unknown tool names', async () => {
    const result = await executeCoreToolCall(mockClient, 'nonexistent_tool', {});
    expect(result).toBeNull();
  });
});

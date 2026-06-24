import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  executeDiscoveryToolCall,
  executeDynamicToolCall,
  getDiscoveryToolDefinitions,
} from '../../src/tools/discovery.js';
import { schemaCache } from '../../src/tools/schema-cache.js';
import type { ServiceNowClient } from '../../src/servicenow/client.js';

const mockClient = {
  queryRecords: vi.fn(),
  getRecord: vi.fn(),
  createRecord: vi.fn(),
  updateRecord: vi.fn(),
  deleteRecord: vi.fn(),
  callNowAssist: vi.fn(),
  batchRequest: vi.fn(),
  executeScript: vi.fn(),
} as unknown as ServiceNowClient;

describe('getDiscoveryToolDefinitions', () => {
  it('returns the discover_table tool definition', () => {
    const tools = getDiscoveryToolDefinitions();
    expect(tools).toHaveLength(1);
    expect(tools[0]!.name).toBe('discover_table');
    expect(tools[0]!.inputSchema.required).toContain('table');
  });
});

describe('executeDiscoveryToolCall', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    schemaCache.clear();
  });

  it('returns null for non-matching tool name', async () => {
    const result = await executeDiscoveryToolCall(mockClient, 'unknown_tool', {});
    expect(result).toBeNull();
  });

  it('throws when table argument is missing', async () => {
    await expect(
      executeDiscoveryToolCall(mockClient, 'discover_table', {})
    ).rejects.toThrow('table is required');
  });

  it('returns cached schema if available', async () => {
    // Pre-populate cache
    schemaCache.set(
      'u_test_table',
      [{ element: 'name', internal_type: 'string', label: 'Name', max_length: 255, mandatory: false, read_only: false }],
      ['dynamic_query_u_test_table', 'dynamic_get_u_test_table']
    );

    const result = await executeDiscoveryToolCall(mockClient, 'discover_table', { table: 'u_test_table' });

    expect(result.source).toBe('cache');
    expect(result.table).toBe('u_test_table');
    expect(result.columns).toBe(1);
    expect(result.available_tools).toEqual(['dynamic_query_u_test_table', 'dynamic_get_u_test_table']);
    // Should not have called the client
    expect(mockClient.queryRecords).not.toHaveBeenCalled();
  });

  it('queries sys_dictionary for schema when not cached', async () => {
    (mockClient.queryRecords as ReturnType<typeof vi.fn>).mockResolvedValue({
      count: 2,
      records: [
        { element: 'short_description', internal_type: 'string', column_label: 'Short Description', max_length: '160', mandatory: 'true', read_only: 'false' },
        { element: 'number', internal_type: 'string', column_label: 'Number', max_length: '40', mandatory: 'false', read_only: 'true' },
      ],
    });

    const result = await executeDiscoveryToolCall(mockClient, 'discover_table', { table: 'incident' });

    expect(result.source).toBe('sys_dictionary');
    expect(result.table).toBe('incident');
    expect(result.columns).toBe(2);
    expect(result.available_tools).toContain('dynamic_query_incident');
    expect(result.available_tools).toContain('dynamic_get_incident');
    expect(result.available_tools).toContain('dynamic_create_incident');
    expect(result.column_details).toHaveLength(2);
    expect(result.column_details[0].mandatory).toBe(true);
    expect(mockClient.queryRecords).toHaveBeenCalledWith(
      expect.objectContaining({
        table: 'sys_dictionary',
        query: expect.stringContaining('name=incident'),
      })
    );
  });

  it('returns schema from record probe when sys_dictionary is empty', async () => {
    // First call: sys_dictionary returns no results
    (mockClient.queryRecords as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ count: 0, records: [] })
      // Second call: table probe returns a record
      .mockResolvedValueOnce({
        count: 1,
        records: [{ sys_id: 'abc123', name: 'Test Server', ip_address: '10.0.0.1', sys_class_name: 'cmdb_ci_server' }],
      });

    const result = await executeDiscoveryToolCall(mockClient, 'discover_table', { table: 'u_custom_table' });

    expect(result.source).toBe('record_probe');
    expect(result.table).toBe('u_custom_table');
    expect(result.columns).toBe(4); // sys_id, name, ip_address, sys_class_name
    expect(result.note).toContain('record structure');
    expect(result.available_tools).toContain('dynamic_query_u_custom_table');
  });

  it('throws for non-existent tables when both sys_dictionary and probe are empty', async () => {
    (mockClient.queryRecords as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ count: 0, records: [] })
      .mockResolvedValueOnce({ count: 0, records: [] });

    await expect(
      executeDiscoveryToolCall(mockClient, 'discover_table', { table: 'nonexistent_table' })
    ).rejects.toThrow('not found');
  });

  it('respects operations filter for tool generation', async () => {
    (mockClient.queryRecords as ReturnType<typeof vi.fn>).mockResolvedValue({
      count: 1,
      records: [
        { element: 'name', internal_type: 'string', column_label: 'Name', max_length: '255', mandatory: 'false', read_only: 'false' },
      ],
    });

    const result = await executeDiscoveryToolCall(mockClient, 'discover_table', {
      table: 'u_limited',
      operations: ['query', 'get'],
    });

    expect(result.available_tools).toEqual(['dynamic_query_u_limited', 'dynamic_get_u_limited']);
    expect(result.available_tools).not.toContain('dynamic_create_u_limited');
    expect(result.available_tools).not.toContain('dynamic_delete_u_limited');
  });
});

describe('executeDynamicToolCall', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    schemaCache.clear();
    process.env.WRITE_ENABLED = 'true';
  });

  it('returns null for non-dynamic tool names', async () => {
    const result = await executeDynamicToolCall(mockClient, 'query_records', {});
    expect(result).toBeNull();
  });

  it('throws when schema is not cached', async () => {
    await expect(
      executeDynamicToolCall(mockClient, 'dynamic_query_u_missing', {})
    ).rejects.toThrow('schema not cached');
  });

  it('executes dynamic_query correctly', async () => {
    schemaCache.set(
      'u_test',
      [{ element: 'name', internal_type: 'string', label: 'Name', max_length: 255, mandatory: false, read_only: false }],
      ['dynamic_query_u_test']
    );
    (mockClient.queryRecords as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 3, records: [{}, {}, {}] });

    const result = await executeDynamicToolCall(mockClient, 'dynamic_query_u_test', {
      query: 'active=true',
      limit: 10,
    });

    expect(result.count).toBe(3);
    expect(mockClient.queryRecords).toHaveBeenCalledWith(
      expect.objectContaining({ table: 'u_test', query: 'active=true', limit: 10 })
    );
  });

  it('caps query limit at 200', async () => {
    schemaCache.set(
      'u_test',
      [{ element: 'name', internal_type: 'string', label: 'Name', max_length: 255, mandatory: false, read_only: false }],
      ['dynamic_query_u_test']
    );
    (mockClient.queryRecords as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 0, records: [] });

    await executeDynamicToolCall(mockClient, 'dynamic_query_u_test', { limit: 500 });

    expect(mockClient.queryRecords).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 200 })
    );
  });

  it('executes dynamic_get correctly', async () => {
    schemaCache.set(
      'u_test',
      [{ element: 'name', internal_type: 'string', label: 'Name', max_length: 255, mandatory: false, read_only: false }],
      ['dynamic_get_u_test']
    );
    (mockClient.getRecord as ReturnType<typeof vi.fn>).mockResolvedValue({ sys_id: 'abc', name: 'Test' });

    const result = await executeDynamicToolCall(mockClient, 'dynamic_get_u_test', { sys_id: 'abc' });

    expect(result.sys_id).toBe('abc');
    expect(mockClient.getRecord).toHaveBeenCalledWith('u_test', 'abc', undefined);
  });

  it('throws when dynamic_get is called without sys_id', async () => {
    schemaCache.set(
      'u_test',
      [{ element: 'name', internal_type: 'string', label: 'Name', max_length: 255, mandatory: false, read_only: false }],
      ['dynamic_get_u_test']
    );

    await expect(
      executeDynamicToolCall(mockClient, 'dynamic_get_u_test', {})
    ).rejects.toThrow('sys_id is required');
  });

  it('executes dynamic_create correctly', async () => {
    schemaCache.set(
      'u_test',
      [{ element: 'name', internal_type: 'string', label: 'Name', max_length: 255, mandatory: false, read_only: false }],
      ['dynamic_create_u_test']
    );
    (mockClient.createRecord as ReturnType<typeof vi.fn>).mockResolvedValue({ sys_id: 'new123', name: 'Created' });

    const result = await executeDynamicToolCall(mockClient, 'dynamic_create_u_test', { name: 'Created' });

    expect(result.sys_id).toBe('new123');
    expect(mockClient.createRecord).toHaveBeenCalledWith('u_test', { name: 'Created' });
  });

  it('executes dynamic_update correctly', async () => {
    schemaCache.set(
      'u_test',
      [{ element: 'name', internal_type: 'string', label: 'Name', max_length: 255, mandatory: false, read_only: false }],
      ['dynamic_update_u_test']
    );
    (mockClient.updateRecord as ReturnType<typeof vi.fn>).mockResolvedValue({ sys_id: 'abc', name: 'Updated' });

    const result = await executeDynamicToolCall(mockClient, 'dynamic_update_u_test', {
      sys_id: 'abc',
      name: 'Updated',
    });

    expect(result.name).toBe('Updated');
    expect(mockClient.updateRecord).toHaveBeenCalledWith('u_test', 'abc', { name: 'Updated' });
  });

  it('executes dynamic_delete correctly', async () => {
    schemaCache.set(
      'u_test',
      [{ element: 'name', internal_type: 'string', label: 'Name', max_length: 255, mandatory: false, read_only: false }],
      ['dynamic_delete_u_test']
    );
    (mockClient.deleteRecord as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true });

    const result = await executeDynamicToolCall(mockClient, 'dynamic_delete_u_test', { sys_id: 'abc' });

    expect(result.success).toBe(true);
    expect(mockClient.deleteRecord).toHaveBeenCalledWith('u_test', 'abc');
  });

  it('throws when write operations are called without WRITE_ENABLED', async () => {
    delete process.env.WRITE_ENABLED;
    schemaCache.set(
      'u_test',
      [{ element: 'name', internal_type: 'string', label: 'Name', max_length: 255, mandatory: false, read_only: false }],
      ['dynamic_create_u_test']
    );

    await expect(
      executeDynamicToolCall(mockClient, 'dynamic_create_u_test', { name: 'Test' })
    ).rejects.toThrow('Write operations are disabled');
  });
});

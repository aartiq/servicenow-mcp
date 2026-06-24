/**
 * Dynamic Schema Discovery tool — reads table schema at runtime and generates
 * ad-hoc CRUD tools for any ServiceNow table.
 *
 * Tools:
 *   discover_table — Discover a table's schema and register dynamic CRUD tools
 */
import type { ServiceNowClient } from '../servicenow/client.js';
import { ServiceNowError } from '../utils/errors.js';
import { schemaCache, type ColumnSchema } from './schema-cache.js';
import { requireWrite } from '../utils/permissions.js';

export function getDiscoveryToolDefinitions() {
  return [
    {
      name: 'discover_table',
      description:
        'Discover a ServiceNow table schema and register dynamic CRUD tools for it. ' +
        'After discovery, new tools become available: dynamic_query_<table>, dynamic_get_<table>, ' +
        'dynamic_create_<table>, dynamic_update_<table>, dynamic_delete_<table>. ' +
        'Schemas are cached for 30 minutes.',
      inputSchema: {
        type: 'object',
        properties: {
          table: { type: 'string', description: 'Table name to discover (e.g., "u_custom_table")' },
          operations: {
            type: 'array',
            description: 'Operations to enable: query, get, create, update, delete. Default: all.',
            items: { type: 'string', enum: ['query', 'get', 'create', 'update', 'delete'] },
          },
        },
        required: ['table'],
      },
    },
  ];
}

export async function executeDiscoveryToolCall(
  client: ServiceNowClient,
  name: string,
  args: Record<string, any>
): Promise<any> {
  if (name !== 'discover_table') return null;

  const table = args.table;
  if (!table || typeof table !== 'string') {
    throw new ServiceNowError('table is required', 'INVALID_REQUEST');
  }

  // Check cache first
  const cached = schemaCache.get(table);
  if (cached) {
    return {
      table,
      source: 'cache',
      columns: cached.columns.length,
      available_tools: cached.generatedToolNames,
      cache_expires_in_minutes: Math.round((cached.ttlMs - (Date.now() - cached.cachedAt)) / 60000),
    };
  }

  // Query sys_dictionary for detailed schema
  const dictResult = await client.queryRecords({
    table: 'sys_dictionary',
    query: `name=${table}^elementISNOTEMPTY^internal_type!=collection`,
    fields: 'element,internal_type,column_label,max_length,mandatory,reference,read_only,default_value',
    limit: 200,
  });

  if (dictResult.count === 0) {
    // Fallback: try to query the table directly to verify it exists
    try {
      const probe = await client.queryRecords({ table, limit: 1 });
      if (probe.count === 0 && probe.records.length === 0) {
        throw new ServiceNowError(`Table "${table}" not found or has no schema`, 'NOT_FOUND');
      }
      // Table exists but no sys_dictionary entries — build minimal schema from record keys
      const record = probe.records[0] || {};
      const columns: ColumnSchema[] = Object.keys(record).map(key => ({
        element: key,
        internal_type: 'string',
        label: key,
        max_length: 255,
        mandatory: false,
        read_only: key.startsWith('sys_'),
        default_value: undefined,
      }));

      const toolNames = buildToolNames(table, args.operations);
      schemaCache.set(table, columns, toolNames);

      return {
        table,
        source: 'record_probe',
        columns: columns.length,
        available_tools: toolNames,
        note: 'Schema derived from record structure (sys_dictionary unavailable)',
      };
    } catch (e) {
      if (e instanceof ServiceNowError) throw e;
      throw new ServiceNowError(`Table "${table}" not found`, 'NOT_FOUND');
    }
  }

  // Parse sys_dictionary results into ColumnSchema
  const columns: ColumnSchema[] = dictResult.records.map((r: any) => ({
    element: r.element,
    internal_type: r.internal_type || 'string',
    label: r.column_label || r.element,
    max_length: parseInt(r.max_length) || 255,
    mandatory: r.mandatory === 'true' || r.mandatory === true,
    reference: r.reference || undefined,
    read_only: r.read_only === 'true' || r.read_only === true,
    default_value: r.default_value || undefined,
  }));

  const toolNames = buildToolNames(table, args.operations);
  schemaCache.set(table, columns, toolNames);

  return {
    table,
    source: 'sys_dictionary',
    columns: columns.length,
    column_details: columns.slice(0, 20).map(c => ({
      name: c.element,
      type: c.internal_type,
      label: c.label,
      mandatory: c.mandatory,
      reference: c.reference,
    })),
    available_tools: toolNames,
  };
}

/** Execute a dynamically discovered tool. */
export async function executeDynamicToolCall(
  client: ServiceNowClient,
  name: string,
  args: Record<string, any>
): Promise<any> {
  // Check if this is a dynamic tool
  const match = name.match(/^dynamic_(query|get|create|update|delete)_(.+)$/);
  if (!match) return null;

  const operation = match[1]!;
  const table = match[2]!;

  // Verify schema is cached
  const cached = schemaCache.get(table);
  if (!cached) {
    throw new ServiceNowError(
      `Table "${table}" schema not cached. Run discover_table first.`,
      'SCHEMA_NOT_CACHED'
    );
  }

  switch (operation) {
    case 'query': {
      const limit = Math.min(args.limit || 20, 200);
      return client.queryRecords({
        table,
        query: args.query,
        fields: args.fields,
        limit,
        orderBy: args.orderBy,
      });
    }

    case 'get': {
      if (!args.sys_id) throw new ServiceNowError('sys_id is required', 'INVALID_REQUEST');
      return client.getRecord(table, args.sys_id, args.fields);
    }

    case 'create': {
      requireWrite();
      const { sys_id: _sysId, ...fields } = args; // eslint-disable-line @typescript-eslint/no-unused-vars
      return client.createRecord(table, fields);
    }

    case 'update': {
      requireWrite();
      if (!args.sys_id) throw new ServiceNowError('sys_id is required', 'INVALID_REQUEST');
      const { sys_id, ...fields } = args;
      return client.updateRecord(table, sys_id, fields);
    }

    case 'delete': {
      requireWrite();
      if (!args.sys_id) throw new ServiceNowError('sys_id is required', 'INVALID_REQUEST');
      return client.deleteRecord(table, args.sys_id);
    }

    default:
      return null;
  }
}

function buildToolNames(table: string, operations?: string[]): string[] {
  const ops = operations || ['query', 'get', 'create', 'update', 'delete'];
  return ops.map(op => `dynamic_${op}_${table}`);
}

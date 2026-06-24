/**
 * Schema Cache — TTL-based in-memory cache for discovered table schemas.
 * Used by the dynamic schema discovery tool to avoid re-querying on every call.
 */

export interface ColumnSchema {
  element: string;
  internal_type: string;
  label: string;
  max_length: number;
  mandatory: boolean;
  reference?: string;
  read_only: boolean;
  default_value?: string;
}

export interface CachedSchema {
  table: string;
  columns: ColumnSchema[];
  generatedToolNames: string[];
  cachedAt: number;
  ttlMs: number;
}

export interface DynamicToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, any>;
}

const DEFAULT_TTL_MS = 30 * 60 * 1000; // 30 minutes

class SchemaCache {
  private cache = new Map<string, CachedSchema>();

  /** Get cached schema if still valid. */
  get(table: string): CachedSchema | undefined {
    const entry = this.cache.get(table);
    if (!entry) return undefined;
    if (Date.now() - entry.cachedAt > entry.ttlMs) {
      this.cache.delete(table);
      return undefined;
    }
    return entry;
  }

  /** Store schema for a table. */
  set(table: string, columns: ColumnSchema[], generatedToolNames: string[], ttlMs = DEFAULT_TTL_MS): void {
    this.cache.set(table, {
      table,
      columns,
      generatedToolNames,
      cachedAt: Date.now(),
      ttlMs,
    });
  }

  /** Remove expired entries. */
  evictExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache) {
      if (now - entry.cachedAt > entry.ttlMs) {
        this.cache.delete(key);
      }
    }
  }

  /** Get all dynamically generated tool definitions across all cached tables. */
  getGeneratedTools(): DynamicToolDefinition[] {
    this.evictExpired();
    const tools: DynamicToolDefinition[] = [];

    for (const [, schema] of this.cache) {
      tools.push(...buildDynamicTools(schema));
    }
    return tools;
  }

  /** Get all cached table names. */
  getCachedTables(): string[] {
    this.evictExpired();
    return Array.from(this.cache.keys());
  }

  /** Clear all cached schemas. */
  clear(): void {
    this.cache.clear();
  }
}

/** Build dynamic tool definitions from a cached schema. */
function buildDynamicTools(schema: CachedSchema): DynamicToolDefinition[] {
  const { table, columns } = schema;
  const writableFields = columns.filter(c => !c.read_only && c.element !== 'sys_id');
  const fieldProps: Record<string, any> = {};

  for (const col of writableFields.slice(0, 30)) { // Limit to prevent schema explosion
    fieldProps[col.element] = {
      type: col.internal_type === 'integer' ? 'number' : col.internal_type === 'boolean' ? 'boolean' : 'string',
      description: `${col.label}${col.mandatory ? ' (required)' : ''}${col.reference ? ` [ref: ${col.reference}]` : ''}`,
    };
  }

  const allFieldNames = columns.map(c => c.element).join(', ');
  const requiredFields = columns.filter(c => c.mandatory && c.element !== 'sys_id').map(c => c.element);

  return [
    {
      name: `dynamic_query_${table}`,
      description: `Query ${table} records. Available fields: ${allFieldNames.slice(0, 200)}...`,
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'ServiceNow encoded query string' },
          fields: { type: 'string', description: 'Comma-separated fields to return' },
          limit: { type: 'number', description: 'Max records (default 20, max 200)' },
          orderBy: { type: 'string', description: 'Field to sort by, prefix - for desc' },
        },
        required: [],
      },
    },
    {
      name: `dynamic_get_${table}`,
      description: `Get a single ${table} record by sys_id`,
      inputSchema: {
        type: 'object',
        properties: {
          sys_id: { type: 'string', description: 'Record sys_id (32-char hex)' },
          fields: { type: 'string', description: 'Comma-separated fields to return' },
        },
        required: ['sys_id'],
      },
    },
    {
      name: `dynamic_create_${table}`,
      description: `Create a new ${table} record. Required fields: ${requiredFields.join(', ') || 'none'}`,
      inputSchema: {
        type: 'object',
        properties: fieldProps,
        required: requiredFields,
      },
    },
    {
      name: `dynamic_update_${table}`,
      description: `Update an existing ${table} record`,
      inputSchema: {
        type: 'object',
        properties: { sys_id: { type: 'string', description: 'Record sys_id' }, ...fieldProps },
        required: ['sys_id'],
      },
    },
    {
      name: `dynamic_delete_${table}`,
      description: `Delete a ${table} record by sys_id`,
      inputSchema: {
        type: 'object',
        properties: { sys_id: { type: 'string', description: 'Record sys_id' } },
        required: ['sys_id'],
      },
    },
  ];
}

export const schemaCache = new SchemaCache();

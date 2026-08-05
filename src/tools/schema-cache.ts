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
  /** ServiceNow instance host this schema was discovered from. Scopes the cache per tenant. */
  instance: string;
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

  /**
   * Cache key is scoped by ServiceNow instance so that, in a multi-tenant host, one
   * tenant's discovered table structure is never returned to another. An empty/absent
   * instance falls back to a single shared scope, preserving single-tenant behaviour.
   */
  private keyFor(table: string, instance?: string): string {
    return `${(instance || 'default').toLowerCase()}::${table}`;
  }

  /** Get cached schema if still valid, scoped to the given instance. */
  get(table: string, instance?: string): CachedSchema | undefined {
    const entry = this.cache.get(this.keyFor(table, instance));
    if (!entry) return undefined;
    if (Date.now() - entry.cachedAt > entry.ttlMs) {
      this.cache.delete(this.keyFor(table, instance));
      return undefined;
    }
    return entry;
  }

  /** Store schema for a table, scoped to the given instance. */
  set(table: string, columns: ColumnSchema[], generatedToolNames: string[], instance?: string, ttlMs = DEFAULT_TTL_MS): void {
    this.cache.set(this.keyFor(table, instance), {
      table,
      instance: (instance || 'default').toLowerCase(),
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

  /**
   * Get all dynamically generated tool definitions. When an instance is given, only that
   * instance's tables are returned; passing no instance returns every scope (single-tenant use).
   */
  getGeneratedTools(instance?: string): DynamicToolDefinition[] {
    this.evictExpired();
    const scope = instance ? instance.toLowerCase() : undefined;
    const tools: DynamicToolDefinition[] = [];

    for (const [, schema] of this.cache) {
      if (scope && schema.instance !== scope) continue;
      tools.push(...buildDynamicTools(schema));
    }
    return tools;
  }

  /** Get cached table names, optionally scoped to one instance. */
  getCachedTables(instance?: string): string[] {
    this.evictExpired();
    const scope = instance ? instance.toLowerCase() : undefined;
    const tables: string[] = [];
    for (const [, schema] of this.cache) {
      if (scope && schema.instance !== scope) continue;
      tables.push(schema.table);
    }
    return tables;
  }

  /** Clear cached schemas. With an instance, clears only that scope; otherwise all. */
  clear(instance?: string): void {
    if (!instance) { this.cache.clear(); return; }
    const scope = instance.toLowerCase();
    for (const [key, entry] of this.cache) {
      if (entry.instance === scope) this.cache.delete(key);
    }
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

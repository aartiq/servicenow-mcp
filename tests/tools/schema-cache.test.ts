import { describe, it, expect, beforeEach } from 'vitest';
import { schemaCache, type ColumnSchema } from '../../src/tools/schema-cache.js';

const cols = (label: string): ColumnSchema[] => [
  { element: 'u_custom', internal_type: 'string', label, max_length: 255, mandatory: false, read_only: false },
];

describe('SchemaCache multi-tenant isolation', () => {
  beforeEach(() => schemaCache.clear());

  it('does not return one instance\'s schema to another', () => {
    schemaCache.set('incident', cols('TENANT-A field'), ['dynamic_query_incident'], 'a.service-now.com');
    schemaCache.set('incident', cols('TENANT-B field'), ['dynamic_query_incident'], 'b.service-now.com');

    // Same table name, different instances -> each sees only its own structure.
    expect(schemaCache.get('incident', 'a.service-now.com')!.columns[0]!.label).toBe('TENANT-A field');
    expect(schemaCache.get('incident', 'b.service-now.com')!.columns[0]!.label).toBe('TENANT-B field');

    // A third instance that never discovered the table gets nothing (no leak, no false hit).
    expect(schemaCache.get('incident', 'c.service-now.com')).toBeUndefined();
  });

  it('is case-insensitive on instance but still isolates distinct hosts', () => {
    schemaCache.set('problem', cols('A'), [], 'ACME.service-now.com');
    expect(schemaCache.get('problem', 'acme.service-now.com')).toBeDefined();
    expect(schemaCache.get('problem', 'other.service-now.com')).toBeUndefined();
  });

  it('scopes generated tools and cached-table listings per instance', () => {
    schemaCache.set('u_a_only', cols('A'), [], 'a.service-now.com');
    schemaCache.set('u_b_only', cols('B'), [], 'b.service-now.com');

    expect(schemaCache.getCachedTables('a.service-now.com')).toEqual(['u_a_only']);
    expect(schemaCache.getCachedTables('b.service-now.com')).toEqual(['u_b_only']);

    const aTools = schemaCache.getGeneratedTools('a.service-now.com');
    expect(aTools.some(t => t.name.includes('u_a_only'))).toBe(true);
    expect(aTools.some(t => t.name.includes('u_b_only'))).toBe(false);
  });

  it('clears only the named instance scope', () => {
    schemaCache.set('change_request', cols('A'), [], 'a.service-now.com');
    schemaCache.set('change_request', cols('B'), [], 'b.service-now.com');
    schemaCache.clear('a.service-now.com');
    expect(schemaCache.get('change_request', 'a.service-now.com')).toBeUndefined();
    expect(schemaCache.get('change_request', 'b.service-now.com')).toBeDefined();
  });

  it('preserves single-tenant behaviour when no instance is given', () => {
    schemaCache.set('sc_request', cols('single'), ['dynamic_query_sc_request']);
    expect(schemaCache.get('sc_request')!.columns[0]!.label).toBe('single');
    // no-arg getGeneratedTools returns every scope (single-tenant / startup use)
    expect(schemaCache.getGeneratedTools().length).toBeGreaterThan(0);
  });
});

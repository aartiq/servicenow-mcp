import { describe, it, expect } from 'vitest';
import { getGovernanceToolDefinitions } from '../../src/tools/governance.js';

describe('governance tool definitions', () => {
  const defs = getGovernanceToolDefinitions();
  const names = defs.map((d) => d.name);

  it('exposes bulk_create_records, rollback_changes, compare_instances', () => {
    expect(names).toContain('bulk_create_records');
    expect(names).toContain('rollback_changes');
    expect(names).toContain('compare_instances');
  });

  it('all defs have name, description, inputSchema', () => {
    for (const d of defs) {
      expect(d.name).toBeTruthy();
      expect(d.description).toBeTruthy();
      expect(d.inputSchema).toBeTypeOf('object');
    }
  });

  it('bulk_create_records supports dry_run + rollback_on_error', () => {
    const def = defs.find((d) => d.name === 'bulk_create_records')!;
    const props = (def.inputSchema as any).properties;
    expect(props.dry_run).toBeTruthy();
    expect(props.rollback_on_error).toBeTruthy();
  });
});

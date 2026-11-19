import { describe, it, expect, beforeEach } from 'vitest';
import { getTools } from '../../src/tools/index.js';

describe('getTools – package system', () => {
  beforeEach(() => {
    delete process.env.MCP_TOOL_PACKAGE;
  });

  it('returns all 80+ tools when MCP_TOOL_PACKAGE is not set (full default)', () => {
    const tools = getTools();
    expect(tools.length).toBeGreaterThanOrEqual(80);
  });

  it('returns a subset for service_desk package', () => {
    process.env.MCP_TOOL_PACKAGE = 'service_desk';
    const tools = getTools();
    const names = tools.map(t => t.name);
    expect(names).toContain('create_incident');
    expect(names).toContain('get_incident');
    expect(names).toContain('approve_request');
    expect(names).not.toContain('create_business_rule');
    expect(names).not.toContain('commit_changeset');
  });

  it('platform_developer package includes scripting and ATF tools', () => {
    process.env.MCP_TOOL_PACKAGE = 'platform_developer';
    const tools = getTools();
    const names = tools.map(t => t.name);
    expect(names).toContain('list_business_rules');
    expect(names).toContain('run_atf_suite');
    expect(names).toContain('get_atf_failure_insight');
    expect(names).not.toContain('create_incident');
  });

  it('ai_developer package includes Now Assist tools', () => {
    process.env.MCP_TOOL_PACKAGE = 'ai_developer';
    const tools = getTools();
    const names = tools.map(t => t.name);
    expect(names).toContain('nlq_query');
    expect(names).toContain('categorize_incident');
    expect(names).toContain('get_virtual_agent_topics');
    expect(names).toContain('get_ms_copilot_topics');
  });

  it('returns full set for unknown package name', () => {
    process.env.MCP_TOOL_PACKAGE = 'nonexistent_package';
    const tools = getTools();
    expect(tools.length).toBeGreaterThanOrEqual(80);
  });

  it('no duplicate tool names in full package', () => {
    const tools = getTools();
    const names = tools.map(t => t.name);
    const unique = new Set(names);
    expect(unique.size).toBe(names.length);
  });

  it('registers the impact-analysis and local-sync tools', () => {
    delete process.env.MCP_TOOL_PACKAGE;
    const names = getTools().map(t => t.name);
    for (const n of [
      'list_table_config', 'find_field_references',
      'find_script_references', 'find_update_sets', 'find_property_usage',
      'list_supported_artifacts', 'pull_artifact', 'push_artifact', 'sync_status',
      'visualize_aggregate', 'visualize_trend', 'aggregate_report',
    ]) {
      expect(names).toContain(n);
    }
  });

  it('every tool has required MCP fields', () => {
    getTools().forEach(tool => {
      expect(tool.name).toBeTruthy();
      expect(typeof tool.name).toBe('string');
      expect(tool.description).toBeTruthy();
      expect(tool.inputSchema).toBeTruthy();
      expect(tool.inputSchema.type).toBe('object');
    });
  });
});

describe('annotations for tools that change data', () => {
  it('never marks a data-changing tool read-only', async () => {
    const { getTools } = await import('../../src/tools/index.js');
    const byName = Object.fromEntries(getTools().map((t: any) => [t.name, t]));
    for (const n of ['grant_role', 'revoke_role', 'deactivate_user', 'recall_approval_request', 'advance_hr_case', 'copy_attachment',
      'resubmit_ecc_probe', 'push_artifact', 'test_flow', 'cmdb_reconcile', 'natural_language_update', 'export_update_set', 'fluent_install', 'fluent_exec']) {
      if (!byName[n]) continue;
      expect(byName[n].annotations.readOnlyHint, n).toBe(false);
    }
    expect(byName.revoke_role?.annotations.destructiveHint).toBe(true);
    expect(byName.list_business_rules.annotations.readOnlyHint).toBe(true);
  });
});

describe('every listed tool has a handler', () => {
  it('never answers UNKNOWN_TOOL for a tool it lists', async () => {
    const { getTools, executeTool } = await import('../../src/tools/index.js');
    // A client whose every method resolves to an empty result, so handlers run without a network.
    const client: any = new Proxy({}, {
      get: (_t, prop) => (prop === 'instanceUrl' ? 'https://example.service-now.com' : prop === 'then' ? undefined : async () => ({ count: 0, records: [], result: [] })),
    });
    const saved = process.env.WRITE_ENABLED;
    process.env.WRITE_ENABLED = 'false';
    const missing: string[] = [];
    try {
      for (const t of getTools()) {
        if (/^fluent_/.test(t.name)) continue; // these shell out to the SDK CLI
        try { await executeTool(client, t.name, {}); } catch (e: any) { if (e?.code === 'UNKNOWN_TOOL') missing.push(t.name); }
      }
    } finally {
      if (saved === undefined) delete process.env.WRITE_ENABLED; else process.env.WRITE_ENABLED = saved;
    }
    expect(missing).toEqual([]);
  }, 60000);
});

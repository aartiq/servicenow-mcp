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
    expect(names).toContain('generate_summary');
    expect(names).toContain('trigger_agentic_playbook');
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

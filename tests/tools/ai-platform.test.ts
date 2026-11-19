import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeAiPlatformToolCall, getAiPlatformToolDefinitions, providerFamily, providerFromDefinition, providerKind } from '../../src/tools/ai-platform.js';
import { executeAiAgentsToolCall } from '../../src/tools/ai-agents.js';
import type { ServiceNowClient } from '../../src/servicenow/client.js';

const client = {
  queryRecords: vi.fn(),
  runStats: vi.fn(),
  recordUrl: (t: string, id: string) => `https://x.service-now.com/${t}.do?sys_id=${id}`,
} as unknown as ServiceNowClient;
const q = client.queryRecords as ReturnType<typeof vi.fn>;
const stats = client.runStats as ReturnType<typeof vi.fn>;

beforeEach(() => vi.resetAllMocks());

describe('ai-platform definitions', () => {
  it('exposes the new read-only tools', () => {
    const defs = getAiPlatformToolDefinitions();
    expect(defs.map((d) => d.name)).toEqual(['get_ai_model_providers', 'get_ai_runtime_metrics', 'list_ai_inventory_cis', 'get_agent_access_matrix', 'list_agent_teams', 'list_agent_strategies', 'list_external_agent_runs']);
    for (const d of defs) expect(d.annotations.readOnlyHint).toBe(true);
  });
});

describe('provider parsing', () => {
  it('reads the provider from a definition name, then filter properties, then the connection', () => {
    expect(providerFromDefinition('Summarize (Azure OpenAI - Chat Completions)')).toBe('Azure OpenAI');
    expect(providerFromDefinition('KB search (NOW LLM)')).toBe('NOW LLM');
    expect(providerFromDefinition({ display_value: 'X (Azure OpenAI Chat Completions)' })).toBe('Azure OpenAI');
    expect(providerFromDefinition('No parens', '{"provider":"Google Gemini"}')).toBe('Google Gemini');
    expect(providerFromDefinition('No parens', '', 'sn_azure_openai.Azure_OpenAI')).toBe('Azure OpenAI');
    expect(providerFromDefinition('script only')).toMatch(/No LLM/);
  });
  it('groups provider labels into families and kinds', () => {
    expect(providerFamily('NOW LLM LARGE')).toBe('Now LLM (ServiceNow)');
    expect(providerFamily('AWS Claude')).toBe('Anthropic Claude (AWS)');
    expect(providerFamily('Azure Chat Completion')).toBe('Azure OpenAI');
    expect(providerKind('Google Gemini')).toBe('third_party');
    expect(providerKind('Now LLM Service')).toBe('servicenow');
    expect(providerKind('No LLM (script or flow)')).toBe('none');
  });
});

describe('get_ai_model_providers', () => {
  it('maps each skill to its provider and totals by family, with links', async () => {
    stats.mockResolvedValue([{ groupby_fields: [{ field: 'strategy', display_value: 'ReAct' }], stats: { count: 3 } }]);
    q.mockImplementation(async (p: any) => {
      if (p.table === 'sys_one_extend_definition_config') {
        return { records: [
          { capability: { value: 'c1', display_value: 'Summarize' }, 'capability.name': { display_value: 'Summarize' }, 'definition.name': { display_value: 'Summarize (Azure OpenAI - Chat Completions)' } },
          { capability: { value: 'c2', display_value: 'Resolve' }, 'capability.name': { display_value: 'Resolve' }, 'definition.name': { display_value: 'Resolve (Now LLM Generic)' } },
        ] };
      }
      if (p.table === 'sys_gen_ai_provider') return { records: [{ gen_ai_provider: 'Azure OpenAI', integration_type: 'OEM', managed_integration: 'true' }] };
      return { records: [] };
    });
    const r = await executeAiPlatformToolCall(client, 'get_ai_model_providers', { provider: 'azure' });
    expect(r.summary.skills_with_a_default_definition).toBe(1);
    expect(r.skills[0]).toMatchObject({ skill: 'Summarize', provider_family: 'Azure OpenAI', provider_kind: 'third_party', record_url: expect.stringContaining('sys_one_extend_capability.do?sys_id=c1') });
    expect(r.providers[0]).toEqual({ name: 'Azure OpenAI', integration_type: 'OEM', managed: true });
    expect(r.agents_by_strategy).toEqual([{ strategy: 'ReAct', agents: 3 }]);
    expect(q.mock.calls.find((c: any) => c[0].table === 'sys_one_extend_definition_config')[0].query).toContain('default=true^active=true');
  });

  it('turns a missing table into a note, not a failure', async () => {
    stats.mockRejectedValue(new Error('Invalid table sn_aia_agent'));
    q.mockRejectedValue(new Error('Invalid table'));
    const r = await executeAiPlatformToolCall(client, 'get_ai_model_providers', {});
    expect(r.summary.skills_with_a_default_definition).toBe(0);
    expect(r.notes.length).toBeGreaterThan(0);
  });
});

describe('get_ai_runtime_metrics', () => {
  it('rolls agent executions up per agent with failure rates', async () => {
    stats.mockImplementation(async (table: string, o: any) => {
      if (table === 'sn_aia_execution_plan' && o.groupBy === 'agent,state') {
        return [
          { groupby_fields: [{ field: 'agent', display_value: 'Triage' }, { field: 'state', display_value: 'Completed' }], stats: { count: 3, avg: { execution_time_ms: '1000' } } },
          { groupby_fields: [{ field: 'agent', display_value: 'Triage' }, { field: 'state', display_value: 'Failed' }], stats: { count: 1, avg: { execution_time_ms: '3000' } } },
        ];
      }
      if (table === 'sn_aia_execution_plan') return [{ groupby_fields: [{ field: 'state', display_value: 'Completed' }], stats: { count: 4 } }];
      return [];
    });
    q.mockResolvedValue({ records: [] });
    const r = await executeAiPlatformToolCall(client, 'get_ai_runtime_metrics', { days: 7, agent: 'Tri' });
    expect(r.window_days).toBe(7);
    expect(r.agents[0]).toMatchObject({ agent: 'Triage', runs: 4, failed: 1, failure_rate: 25, avg_execution_ms: 1500 });
    expect(stats.mock.calls[0][1].query).toContain('gs.daysAgoStart(7)^agent.nameLIKETri');
    await expect(executeAiPlatformToolCall(client, 'get_ai_runtime_metrics', { agent: 'a^b' })).rejects.toThrow(/\^/);
  });
});

describe('list_ai_inventory_cis', () => {
  it('lists AI and MCP CIs once each, and finds gaps', async () => {
    stats.mockResolvedValue([{ stats: { count: 2 } }]);
    q.mockImplementation(async (p: any) => {
      if (p.table === 'alm_ai_digital_asset') return { records: [{ sys_id: { value: 'a1' }, display_name: { display_value: 'Model X' } }] };
      return { records: [{ sys_id: { value: 'c1' }, name: { display_value: '' }, model_id: { display_value: 'Model X' }, sys_class_name: { value: p.table, display_value: 'AI Function' } }] };
    });
    const list = await executeAiPlatformToolCall(client, 'list_ai_inventory_cis', {});
    const aiCall = q.mock.calls.find((c: any) => c[0].table === 'cmdb_ci_function_ai')[0];
    expect(aiCall.query).toContain('sys_class_name!=cmdb_ci_function_mcp');
    expect(list.ai_function[0]).toMatchObject({ name: 'Model X', record_url: expect.stringContaining('cmdb_ci_function_ai.do') });
    q.mockClear();
    const gaps = await executeAiPlatformToolCall(client, 'list_ai_inventory_cis', { mode: 'gaps', ci_type: 'mcp_server' });
    expect(q.mock.calls[0][0].query).toContain('assetISEMPTY');
    expect(gaps.ai_assets_without_ci[0]).toMatchObject({ name: 'Model X', record_url: expect.stringContaining('alm_ai_digital_asset') });
    await expect(executeAiPlatformToolCall(client, 'list_ai_inventory_cis', { ci_type: 'robot' })).rejects.toThrow(/ci_type/);
  });
});

describe('Agent Studio gaps', () => {
  it('lists teams with members and run counts', async () => {
    q.mockImplementation(async (p: any) => (p.table === 'sn_aia_team'
      ? { records: [{ sys_id: 't1', name: 'PIR team', description: 'd' }] }
      : { records: [{ team: { value: 't1' }, agent: { display_value: 'PIR agent' }, memory_scope: { display_value: 'Global' } }] }));
    stats.mockResolvedValue([{ groupby_fields: [{ field: 'team', display_value: 'PIR team' }], stats: { count: 2 } }]);
    const r = await executeAiPlatformToolCall(client, 'list_agent_teams', {});
    expect(r.teams[0]).toMatchObject({ name: 'PIR team', runs: 2, members: [{ agent: 'PIR agent', memory_scope: 'Global' }] });
  });

  it('counts agents per strategy and per type', async () => {
    q.mockResolvedValue({ records: [{ sys_id: 's1', name: 'Voice', type: 'Agent', publish: 'true' }] });
    stats.mockImplementation(async (_t: string, o: any) => (o.groupBy === 'strategy'
      ? [{ groupby_fields: [{ field: 'strategy', display_value: 'Voice' }], stats: { count: 8 } }]
      : [{ groupby_fields: [{ field: 'agent_type', display_value: 'voice' }], stats: { count: 8 } }]));
    const r = await executeAiPlatformToolCall(client, 'list_agent_strategies', {});
    expect(r.strategies[0]).toMatchObject({ name: 'Voice', agents: 8, published: true });
    expect(r.agents_by_type).toEqual([{ agent_type: 'voice', agents: 8 }]);
  });

  it('lists external agent runs without payloads by default', async () => {
    q.mockResolvedValue({ records: [{ sys_id: 'r1', direction: 'OUTBOUND', protocol: 'A2A', payload: 'secret' }] });
    stats.mockResolvedValue([]);
    const r = await executeAiPlatformToolCall(client, 'list_external_agent_runs', { direction: 'outbound' });
    expect(r.runs[0].payload).toBeUndefined();
    expect(q.mock.calls[0][0].query).toContain('direction=outbound');
    await expect(executeAiPlatformToolCall(client, 'list_external_agent_runs', { direction: 'sideways' })).rejects.toThrow(/direction/);
  });

  it('list_ai_agents filters by agent_type', async () => {
    q.mockResolvedValue({ count: 0, records: [] });
    await executeAiAgentsToolCall(client, 'list_ai_agents', { agent_type: 'voice' });
    expect(q.mock.calls[0][0].query).toBe('agent_type=voice');
  });
});

describe('get_agent_access_matrix', () => {
  it('matches each agent to its own execute ACL, falls back to the wildcard, and flags gaps', async () => {
    q.mockImplementation(async (p: any) => {
      switch (p.table) {
        case 'sn_aia_agent': return { records: [
          { sys_id: 'a1', name: 'Triage agent', 'sys_scope.scope': 'sn_itsm' },
          { sys_id: 'a2', name: 'Orphan agent', 'sys_scope.scope': 'x_acme' },
        ] };
        case 'sys_security_acl': return { records: [
          { sys_id: 'acl1', name: 'global.sn_itsm.Triage agent', decision_type: 'allow' },
          { sys_id: 'acl2', name: '*', decision_type: 'allow' },
        ] };
        case 'sys_security_acl_role': return { records: [
          { sys_security_acl: 'acl1', sys_user_role: 'r1', 'sys_user_role.name': 'itil' },
          { sys_security_acl: 'acl1', sys_user_role: 'ghost' },
        ] };
        case 'sn_aia_agent_config': return { records: [{ agent: { value: 'a1' }, active: { value: 'true' }, public: { value: 'true' }, run_as_user: { display_value: '' } }] };
        default: return { records: [] };
      }
    });
    const r = await executeAiPlatformToolCall(client, 'get_agent_access_matrix', {});
    const triage = r.agents.find((a: any) => a.agent === 'Triage agent');
    expect(triage).toMatchObject({ execute_acl: 'own', execute_roles: ['itil'], missing_roles: ['ghost'], a2a_exposed: true, active: true, run_as: 'the calling user' });
    expect(triage.record_url).toContain('sn_aia_agent.do?sys_id=a1');
    const orphan = r.agents.find((a: any) => a.agent === 'Orphan agent');
    expect(orphan.execute_acl).toBe('wildcard only');
    expect(orphan.open_to_any_signed_in_user).toBe(true);
    expect(r.summary).toMatchObject({ agents: 2, with_own_execute_acl: 1, wildcard_only: 1, with_missing_roles: 1, a2a_exposed: 1 });
  });
});

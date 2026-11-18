import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeAiAgentsToolCall } from '../../src/tools/ai-agents.js';
import type { ServiceNowClient } from '../../src/servicenow/client.js';

const mockClient = {
  queryRecords: vi.fn(),
  getRecord: vi.fn(),
  createRecord: vi.fn(),
  updateRecord: vi.fn(),
} as unknown as ServiceNowClient;

const q = mockClient.queryRecords as ReturnType<typeof vi.fn>;
const get = mockClient.getRecord as ReturnType<typeof vi.fn>;
const create = mockClient.createRecord as ReturnType<typeof vi.fn>;
const update = mockClient.updateRecord as ReturnType<typeof vi.fn>;

const AGENT = 'a'.repeat(32);

beforeEach(() => {
  vi.resetAllMocks();
  process.env.NOW_ASSIST_ENABLED = 'true';
  process.env.WRITE_ENABLED = 'true';
});

describe('list_ai_agents', () => {
  it('reads sn_aia_agent and takes the active flag from sn_aia_agent_config', async () => {
    q.mockResolvedValueOnce({ count: 1, records: [{ sys_id: AGENT, name: 'Triage' }] })
      .mockResolvedValueOnce({ count: 1, records: [{ agent: { value: AGENT }, active: 'true' }] });

    const result = await executeAiAgentsToolCall(mockClient, 'list_ai_agents', {});

    expect(q.mock.calls[0][0].table).toBe('sn_aia_agent');
    expect(q.mock.calls[0][0].query).toBeUndefined();
    expect(q.mock.calls[1][0]).toMatchObject({ table: 'sn_aia_agent_config', query: `agentIN${AGENT}` });
    expect(result.agents).toEqual([{ sys_id: AGENT, name: 'Triage', active: 'true' }]);
  });

  it('filters on active through sn_aia_agent_config, never on sn_aia_agent', async () => {
    q.mockResolvedValueOnce({ count: 1, records: [{ agent: { value: AGENT } }] })
      .mockResolvedValueOnce({ count: 1, records: [{ sys_id: AGENT, name: 'Triage' }] })
      .mockResolvedValueOnce({ count: 1, records: [{ agent: { value: AGENT }, active: 'true' }] });

    await executeAiAgentsToolCall(mockClient, 'list_ai_agents', { active: true });

    expect(q.mock.calls[0][0]).toMatchObject({ table: 'sn_aia_agent_config', query: 'active=true' });
    expect(q.mock.calls[1][0]).toMatchObject({ table: 'sn_aia_agent', query: `sys_idIN${AGENT}` });
    for (const [args] of q.mock.calls) {
      if (args.table === 'sn_aia_agent') expect(String(args.query)).not.toContain('active');
    }
  });

  it('turns a missing table into a plugin message', async () => {
    const { ServiceNowError } = await import('../../src/utils/errors.js');
    q.mockRejectedValueOnce(new ServiceNowError('Invalid table sn_aia_agent', 'INVALID_REQUEST'));
    await expect(executeAiAgentsToolCall(mockClient, 'list_ai_agents', {})).rejects.toThrow(/AI Agents \(sn_aia\) plugin/);
  });
});

describe('create_ai_agent', () => {
  it('creates the agent, reuses the auto-created config and version, and attaches resolved tools', async () => {
    create.mockImplementation(async (table: string, data: any) => ({ sys_id: `${table}_id`, ...data }));
    update.mockImplementation(async (table: string, id: string, data: any) => ({ sys_id: id, ...data }));
    get.mockResolvedValue({ sys_id: AGENT, internal_name: '' });
    q.mockImplementation(async ({ table, query }: any) => {
      if (table === 'sn_aia_agent_config') return { count: 1, records: [{ sys_id: 'cfg' }] };
      if (table === 'sn_aia_version') return { count: 1, records: [{ sys_id: 'ver', instructions: 'old' }] };
      if (table === 'sn_aia_tool') return query === 'name=Known tool' ? { count: 1, records: [{ sys_id: 'tool1', name: 'Known tool' }] } : { count: 0, records: [] };
      return { count: 0, records: [] };
    });

    const result = await executeAiAgentsToolCall(mockClient, 'create_ai_agent', {
      name: 'Test agent',
      description: 'Does tests',
      capabilities: ['Known tool', 'Unknown tool'],
    });

    expect(create).toHaveBeenCalledWith('sn_aia_agent', expect.objectContaining({ name: 'Test agent', record_type: 'custom', role: 'Does tests' }));
    expect(update).toHaveBeenCalledWith('sn_aia_agent_config', 'cfg', { active: 'true' });
    expect(update).toHaveBeenCalledWith('sn_aia_version', 'ver', { instructions: 'Does tests' });
    expect(create).toHaveBeenCalledWith('sn_aia_agent_tool_m2m', expect.objectContaining({ agent: 'sn_aia_agent_id', tool: 'tool1' }));
    expect(create).not.toHaveBeenCalledWith('sys_ai_agent', expect.anything());
    expect(result.unresolved_capabilities).toEqual(['Unknown tool']);
    expect(result.acl_error).toBeDefined();
  });
});

describe('create_agentic_workflow', () => {
  it('builds sn_aia_usecase with a team, version instructions and an active override', async () => {
    create.mockImplementation(async (table: string, data: any) => ({ sys_id: `${table}_id`, ...data }));
    get.mockResolvedValue({ sys_id: AGENT, internal_name: '' });
    q.mockResolvedValue({ count: 0, records: [] });

    const result = await executeAiAgentsToolCall(mockClient, 'create_agentic_workflow', {
      name: 'WF',
      description: 'Workflow',
      agent_sys_id: AGENT,
      steps: [{ name: 'Look up', action: 'lookup' }],
    });

    expect(create).toHaveBeenCalledWith('sn_aia_team_member', expect.objectContaining({ team: 'sn_aia_team_id', agent: AGENT }));
    expect(create).toHaveBeenCalledWith('sn_aia_usecase', expect.objectContaining({ name: 'WF', team: 'sn_aia_team_id', record_type: 'custom' }));
    expect(create).toHaveBeenCalledWith('sn_aia_version', expect.objectContaining({ target_table: 'sn_aia_usecase', instructions: '1. Look up: lookup' }));
    expect(create).toHaveBeenCalledWith('sn_aia_usecase_config_override', { usecase_configuration: 'sn_aia_usecase_id', active: 'true' });
    expect(result.workflow.sys_id).toBe('sn_aia_usecase_id');
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeAgentStudioToolCall, getAgentStudioToolDefinitions } from '../../src/tools/agent-studio.js';
import type { ServiceNowClient } from '../../src/servicenow/client.js';

const mockClient = {
  queryRecords: vi.fn(),
  getRecord: vi.fn(),
  createRecord: vi.fn(),
  updateRecord: vi.fn(),
  deleteRecord: vi.fn(),
  runStats: vi.fn(),
} as unknown as ServiceNowClient;

const q = mockClient.queryRecords as ReturnType<typeof vi.fn>;
const get = mockClient.getRecord as ReturnType<typeof vi.fn>;
const create = mockClient.createRecord as ReturnType<typeof vi.fn>;
const update = mockClient.updateRecord as ReturnType<typeof vi.fn>;
const del = mockClient.deleteRecord as ReturnType<typeof vi.fn>;

const AGENT = 'a'.repeat(32);
const TOOL = 'b'.repeat(32);
const LINK = 'c'.repeat(32);
const PLAN = 'd'.repeat(32);

describe('getAgentStudioToolDefinitions', () => {
  const defs = getAgentStudioToolDefinitions();
  const names = defs.map((d) => d.name);

  it('exposes the agent studio tools', () => {
    expect(names).toEqual([
      'list_agent_tools',
      'attach_agent_tool',
      'detach_agent_tool',
      'list_agent_triggers',
      'get_agent_versions',
      'list_agent_memory',
      'get_agent_execution_trace',
      'list_agent_evaluations',
      'get_evaluation_results',
      'list_external_agents',
    ]);
  });

  it('does not collide with ai-agents tool names', () => {
    for (const n of ['list_ai_agents', 'get_ai_agent', 'create_ai_agent']) expect(names).not.toContain(n);
  });

  it('every def has name, description mentioning Otto, inputSchema', () => {
    for (const d of defs) {
      expect(d.description).toMatch(/Otto/);
      expect(d.inputSchema.type).toBe('object');
    }
  });
});

describe('executeAgentStudioToolCall', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.WRITE_ENABLED = 'true';
  });

  it('returns null for unknown tools', async () => {
    expect(await executeAgentStudioToolCall(mockClient, 'nope', {})).toBeNull();
  });

  describe('list_agent_tools', () => {
    it('requires agent or tool', async () => {
      await expect(executeAgentStudioToolCall(mockClient, 'list_agent_tools', {})).rejects.toThrow('agent or tool is required');
    });

    it('filters by agent sys_id and flattens the tool join', async () => {
      q.mockResolvedValue({
        count: 1,
        records: [
          {
            sys_id: { value: LINK, display_value: LINK },
            name: { value: 'Lookup', display_value: 'Lookup' },
            active: { value: 'true', display_value: 'true' },
            agent: { value: AGENT, display_value: 'My agent' },
            tool: { value: TOOL, display_value: 'Lookup' },
            'tool.type': { value: 'script', display_value: 'Script' },
            execution_mode: { value: 'autopilot', display_value: 'Autonomous' },
          },
        ],
      });
      const r = await executeAgentStudioToolCall(mockClient, 'list_agent_tools', { agent: AGENT, active: true });
      const call = q.mock.calls[0][0];
      expect(call.table).toBe('sn_aia_agent_tool_m2m');
      expect(call.query).toBe(`agent=${AGENT}^active=true^ORDERBYname`);
      expect(r.tools[0]).toMatchObject({ link_sys_id: LINK, active: true, agent: { sys_id: AGENT, name: 'My agent' }, tool: { sys_id: TOOL, type: 'Script' }, execution_mode: 'Autonomous' });
    });

    it('filters by agent name with a dot-walk', async () => {
      q.mockResolvedValue({ count: 0, records: [] });
      await executeAgentStudioToolCall(mockClient, 'list_agent_tools', { agent: 'Request Status Agent' });
      expect(q.mock.calls[0][0].query).toBe('agent.name=Request Status Agent^ORDERBYname');
    });

    it('rejects ^ in the agent name (query injection)', async () => {
      await expect(executeAgentStudioToolCall(mockClient, 'list_agent_tools', { agent: 'x^ORactive=true' })).rejects.toThrow('must not contain');
    });

    it('turns Invalid table into a needs-plugin message', async () => {
      q.mockRejectedValue(new Error('Invalid table sn_aia_agent_tool_m2m'));
      await expect(executeAgentStudioToolCall(mockClient, 'list_agent_tools', { agent: AGENT })).rejects.toThrow(/needs ServiceNow Otto AI Agents/i);
    });
  });

  describe('attach_agent_tool', () => {
    it('refuses when WRITE_ENABLED is false', async () => {
      process.env.WRITE_ENABLED = 'false';
      await expect(executeAgentStudioToolCall(mockClient, 'attach_agent_tool', { agent_sys_id: AGENT, tool_sys_id: TOOL })).rejects.toThrow('Write operations are disabled');
      expect(create).not.toHaveBeenCalled();
    });

    it('validates sys_ids', async () => {
      await expect(executeAgentStudioToolCall(mockClient, 'attach_agent_tool', { agent_sys_id: 'bad', tool_sys_id: TOOL })).rejects.toThrow('32-character sys_id');
      await expect(executeAgentStudioToolCall(mockClient, 'attach_agent_tool', { agent_sys_id: AGENT })).rejects.toThrow('tool_sys_id is required');
    });

    it('validates execution_mode', async () => {
      await expect(
        executeAgentStudioToolCall(mockClient, 'attach_agent_tool', { agent_sys_id: AGENT, tool_sys_id: TOOL, execution_mode: 'yolo' })
      ).rejects.toThrow('execution_mode');
    });

    it('creates the m2m link with defaults', async () => {
      get.mockImplementation(async (table: string) => (table === 'sn_aia_agent' ? { sys_id: AGENT, name: 'Agent' } : { sys_id: TOOL, name: 'Tool', type: 'script' }));
      q.mockResolvedValue({ count: 0, records: [] });
      create.mockResolvedValue({ sys_id: LINK });
      const r = await executeAgentStudioToolCall(mockClient, 'attach_agent_tool', { agent_sys_id: AGENT, tool_sys_id: TOOL, inputs: [{ name: 'x' }] });
      expect(create).toHaveBeenCalledWith('sn_aia_agent_tool_m2m', {
        agent: AGENT,
        tool: TOOL,
        name: 'Tool',
        active: true,
        execution_mode: 'autopilot',
        max_auto_executions: 10,
        inputs: '[{"name":"x"}]',
      });
      expect(r).toMatchObject({ action: 'attached', link_sys_id: LINK });
    });

    it('returns the existing link instead of duplicating', async () => {
      get.mockResolvedValue({ sys_id: AGENT, name: 'X' });
      q.mockResolvedValue({ count: 1, records: [{ sys_id: LINK }] });
      const r = await executeAgentStudioToolCall(mockClient, 'attach_agent_tool', { agent_sys_id: AGENT, tool_sys_id: TOOL });
      expect(r.action).toBe('already_attached');
      expect(create).not.toHaveBeenCalled();
    });
  });

  describe('detach_agent_tool', () => {
    it('refuses when WRITE_ENABLED is false', async () => {
      delete process.env.WRITE_ENABLED;
      await expect(executeAgentStudioToolCall(mockClient, 'detach_agent_tool', { link_sys_id: LINK })).rejects.toThrow('Write operations are disabled');
      expect(del).not.toHaveBeenCalled();
    });

    it('needs a link or agent+tool', async () => {
      await expect(executeAgentStudioToolCall(mockClient, 'detach_agent_tool', { agent_sys_id: AGENT })).rejects.toThrow('link_sys_id');
    });

    it('deletes by link sys_id', async () => {
      const r = await executeAgentStudioToolCall(mockClient, 'detach_agent_tool', { link_sys_id: LINK });
      expect(del).toHaveBeenCalledWith('sn_aia_agent_tool_m2m', LINK);
      expect(r.action).toBe('detached');
    });

    it('resolves the link from agent + tool and can deactivate only', async () => {
      q.mockResolvedValue({ count: 1, records: [{ sys_id: LINK }] });
      const r = await executeAgentStudioToolCall(mockClient, 'detach_agent_tool', { agent_sys_id: AGENT, tool_sys_id: TOOL, deactivate_only: true });
      expect(q.mock.calls[0][0].query).toBe(`agent=${AGENT}^tool=${TOOL}`);
      expect(update).toHaveBeenCalledWith('sn_aia_agent_tool_m2m', LINK, { active: false });
      expect(del).not.toHaveBeenCalled();
      expect(r.action).toBe('deactivated');
    });

    it('errors when no link exists', async () => {
      q.mockResolvedValue({ count: 0, records: [] });
      await expect(executeAgentStudioToolCall(mockClient, 'detach_agent_tool', { agent_sys_id: AGENT, tool_sys_id: TOOL })).rejects.toThrow('No link found');
    });
  });

  it('list_agent_triggers builds the query and attaches linked use cases', async () => {
    q.mockImplementation(async (p: any) =>
      p.table === 'sn_aia_trigger_configuration'
        ? { count: 1, records: [{ sys_id: { value: 'T1', display_value: 'T1' }, name: { value: 'n', display_value: 'Trigger' }, usecase: { value: 'U1', display_value: 'UC' } }] }
        : { count: 1, records: [{ trigger_configuration: { value: 'T1' }, related_resource_table: { value: 'sn_aia_usecase' }, related_resource_record: { value: 'U1', display_value: 'UC' }, active: { value: 'true' } }] }
    );
    const r = await executeAgentStudioToolCall(mockClient, 'list_agent_triggers', { target_table: 'incident', active: false });
    expect(q.mock.calls[0][0].query).toBe('target_table=incident^active=false^ORDERBYname');
    expect(q.mock.calls[1][0].query).toBe('trigger_configurationINT1');
    expect(r.triggers[0]).toMatchObject({ sys_id: 'T1', name: 'Trigger', usecase_sys_id: 'U1', linked_resources: [{ table: 'sn_aia_usecase', sys_id: 'U1', active: true }] });
  });

  it('get_agent_versions requires target_id and orders newest first', async () => {
    await expect(executeAgentStudioToolCall(mockClient, 'get_agent_versions', {})).rejects.toThrow('target_id is required');
    q.mockResolvedValue({ count: 0, records: [] });
    await executeAgentStudioToolCall(mockClient, 'get_agent_versions', { target_id: AGENT, state: 'published' });
    expect(q.mock.calls[0][0]).toMatchObject({ table: 'sn_aia_version', query: `target_id=${AGENT}^state=published^ORDERBYDESCversion_number` });
    expect(q.mock.calls[0][0].fields).not.toContain('instructions');
  });

  it('list_agent_memory validates type and resolves user_name', async () => {
    await expect(executeAgentStudioToolCall(mockClient, 'list_agent_memory', { type: 'bogus' })).rejects.toThrow('semantic or episodic');
    q.mockResolvedValue({ count: 0, records: [] });
    const r = await executeAgentStudioToolCall(mockClient, 'list_agent_memory', { user: 'abel.tuter', type: 'episodic' });
    expect(q.mock.calls[0][0]).toMatchObject({ table: 'sn_aia_memory', query: 'user.user_name=abel.tuter^type=episodic^ORDERBYDESCsys_updated_on' });
    expect(r.note).toBeTruthy();
  });

  it('get_agent_execution_trace merges children into an ordered timeline', async () => {
    get.mockResolvedValue({ sys_id: PLAN, objective: 'do it' });
    q.mockImplementation(async (p: any) => {
      if (p.table === 'sn_aia_execution_task') return { count: 1, records: [{ sys_id: 't', order: '1', start_time: '2026-01-01 10:00:02', type: 'agent' }] };
      if (p.table === 'sn_aia_message') return { count: 1, records: [{ sys_id: 'm', message_sequence: '1', sys_created_on: '2026-01-01 10:00:01', role: 'user', message: 'x'.repeat(900) }] };
      throw new Error('Invalid table sn_aia_tools_execution');
    });
    const r = await executeAgentStudioToolCall(mockClient, 'get_agent_execution_trace', { execution_plan_sys_id: PLAN });
    expect(r.timeline.map((e: any) => e.kind)).toEqual(['message', 'task']);
    expect(r.timeline[0].message.length).toBeLessThan(600);
    expect(r.counts).toEqual({ tasks: 1, messages: 1, tool_calls: 0 });
    expect(r.notes[0]).toMatch(/sn_aia_tools_execution not present/);
    expect(q.mock.calls.find((c: any) => c[0].table === 'sn_aia_message')[0].query).toBe(`execution_plan=${PLAN}^ORDERBYmessage_sequence`);
  });

  it('list_agent_evaluations filters and can include strategies', async () => {
    q.mockResolvedValue({ count: 0, records: [] });
    const r = await executeAgentStudioToolCall(mockClient, 'list_agent_evaluations', { evaluation_type: 'agentic_ai', include_strategies: true });
    expect(q.mock.calls[0][0]).toMatchObject({ table: 'sys_one_extend_batch_run', query: 'evaluation_type=agentic_ai^ORDERBYDESCsys_created_on' });
    expect(q.mock.calls[1][0].table).toBe('sys_one_extend_eval_strategy');
    expect(r.strategies).toEqual([]);
  });

  it('get_evaluation_results summarises metric statuses', async () => {
    get.mockResolvedValue({ sys_id: PLAN, name: 'run' });
    q.mockImplementation(async (p: any) =>
      p.table === 'sys_one_extend_eval_metric_result'
        ? { count: 3, records: [{ metric: 'Faithfulness', status: 'pass' }, { metric: 'Faithfulness', status: 'fail' }, { metric: 'Faithfulness', status: 'pass' }] }
        : { count: 0, records: [] }
    );
    const r = await executeAgentStudioToolCall(mockClient, 'get_evaluation_results', { batch_run_sys_id: PLAN });
    expect(r.metric_summary).toEqual({ Faithfulness: { pass: 2, fail: 1 } });
  });

  it('list_external_agents reports needs-plugin when no A2A tables exist', async () => {
    q.mockRejectedValue(new Error('Invalid table'));
    await expect(executeAgentStudioToolCall(mockClient, 'list_external_agents', {})).rejects.toThrow(/need ServiceNow Otto AI Agents/);
  });

  it('list_external_agents queries agents of type external', async () => {
    q.mockResolvedValue({ count: 0, records: [] });
    const r = await executeAgentStudioToolCall(mockClient, 'list_external_agents', {});
    const agentCall = q.mock.calls.find((c: any) => c[0].table === 'sn_aia_agent')[0];
    expect(agentCall.query).toBe('agent_type=external');
    expect(r.summary).toMatchObject({ providers: 0, cards: 0, external_agents: 0 });
  });
});

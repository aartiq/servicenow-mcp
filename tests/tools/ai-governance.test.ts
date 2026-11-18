import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeAiGovernanceToolCall, getAiGovernanceToolDefinitions } from '../../src/tools/ai-governance.js';
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
const stats = mockClient.runStats as ReturnType<typeof vi.fn>;

const ASSET = 'a'.repeat(32);
const GOV = 'b'.repeat(32);

describe('getAiGovernanceToolDefinitions', () => {
  const defs = getAiGovernanceToolDefinitions();
  it('exposes the AI Control Tower / platform AI tools', () => {
    expect(defs.map((d) => d.name)).toEqual([
      'list_ai_assets',
      'get_ai_asset',
      'list_ai_approval_requests',
      'get_ai_usage',
      'list_ai_modified_records',
      'list_kg_context_configs',
      'describe_kg_schema',
      'list_otto_channels',
      'get_otto_status',
    ]);
  });
  it('all defs are well formed', () => {
    for (const d of defs) {
      expect(d.description.length).toBeGreaterThan(20);
      expect(d.inputSchema.type).toBe('object');
    }
  });
});

describe('executeAiGovernanceToolCall', () => {
  beforeEach(() => vi.resetAllMocks());

  it('returns null for unknown tools', async () => {
    expect(await executeAiGovernanceToolCall(mockClient, 'nope', {})).toBeNull();
  });

  describe('list_ai_assets', () => {
    it('rejects an unknown asset_class', async () => {
      await expect(executeAiGovernanceToolCall(mockClient, 'list_ai_assets', { asset_class: 'robot' })).rejects.toThrow('asset_class');
    });

    it('queries the class table and merges governance details', async () => {
      q.mockImplementation(async (p: any) =>
        p.table === 'alm_ai_model_digital_asset'
          ? { count: 1, records: [{ sys_id: ASSET, display_name: 'GPT' }] }
          : { count: 1, records: [{ sys_id: { value: GOV }, asset: { value: ASSET }, status: { display_value: 'Approved' }, risk_score: { display_value: 'High' }, lifecycle_phase: { display_value: 'Deploy' } }] }
      );
      const r = await executeAiGovernanceToolCall(mockClient, 'list_ai_assets', { asset_class: 'model', name: 'GPT' });
      expect(q.mock.calls[0][0]).toMatchObject({ table: 'alm_ai_model_digital_asset', query: 'display_nameLIKEGPT^ORDERBYdisplay_name' });
      expect(q.mock.calls[1][0]).toMatchObject({ table: 'sn_ai_governance_asset_governance_details', query: `assetIN${ASSET}` });
      expect(r.assets[0].governance).toMatchObject({ sys_id: GOV, status: 'Approved', risk_score: 'High', lifecycle_phase: 'Deploy' });
    });

    it('filters through governance details when a governance filter is set', async () => {
      q.mockResolvedValue({ count: 0, records: [] });
      await executeAiGovernanceToolCall(mockClient, 'list_ai_assets', { lifecycle_phase: 'Deploy', risk_score: '1', asset_class: 'prompt' });
      expect(q.mock.calls[0][0]).toMatchObject({
        table: 'sn_ai_governance_asset_governance_details',
        query: 'risk_score=1^lifecycle_phase.name=Deploy^asset.sys_class_name=alm_ai_prompt_digital_asset^ORDERBYasset.display_name',
      });
    });

    it('reports a needs-plugin message when AI Control Tower is missing', async () => {
      q.mockRejectedValue(new Error('Invalid table alm_ai_digital_asset'));
      await expect(executeAiGovernanceToolCall(mockClient, 'list_ai_assets', {})).rejects.toThrow(/needs AI Control Tower/);
    });
  });

  describe('get_ai_asset', () => {
    it('requires a valid sys_id', async () => {
      await expect(executeAiGovernanceToolCall(mockClient, 'get_ai_asset', { sys_id: 'x' })).rejects.toThrow('32-character');
    });

    it('returns asset, governance, requests and tasks', async () => {
      get.mockResolvedValue({ sys_id: ASSET, display_name: 'Prompt' });
      q.mockImplementation(async (p: any) => {
        if (p.table === 'sn_ai_governance_asset_governance_details') return { count: 1, records: [{ sys_id: { value: GOV }, asset: { value: ASSET } }] };
        if (p.table === 'sn_ai_governance_assessment_request') return { count: 1, records: [{ sys_id: 'R1', number: 'AIREQ1' }] };
        return { count: 1, records: [{ sys_id: 'T1', assessment_req: 'R1' }] };
      });
      const r = await executeAiGovernanceToolCall(mockClient, 'get_ai_asset', { sys_id: ASSET });
      expect(q.mock.calls[1][0].query).toBe(`assetIN${GOV}^ORDERBYDESCsys_created_on`);
      expect(q.mock.calls[2][0].query).toBe('assessment_reqINR1');
      expect(r.assessment_requests).toHaveLength(1);
      expect(r.assessment_tasks).toHaveLength(1);
    });
  });

  it('list_ai_approval_requests builds the query and fetches tasks', async () => {
    q.mockImplementation(async (p: any) =>
      p.table === 'sn_ai_governance_assessment_request' ? { count: 1, records: [{ sys_id: 'R1' }] } : { count: 0, records: [] }
    );
    const r = await executeAiGovernanceToolCall(mockClient, 'list_ai_approval_requests', { state: '1', active: true });
    expect(q.mock.calls[0][0].query).toBe('state=1^active=true^ORDERBYDESCsys_created_on');
    expect(q.mock.calls[1][0]).toMatchObject({ table: 'sn_ai_governance_assessment_task', query: 'assessment_reqINR1' });
    expect(r.tasks).toEqual([]);
  });

  describe('get_ai_usage', () => {
    it('validates dates and source', async () => {
      await expect(executeAiGovernanceToolCall(mockClient, 'get_ai_usage', { from: '01/01/2026' })).rejects.toThrow('YYYY-MM-DD');
      await expect(executeAiGovernanceToolCall(mockClient, 'get_ai_usage', { from: '2026-02-01', to: '2026-01-01' })).rejects.toThrow('on or before');
      await expect(executeAiGovernanceToolCall(mockClient, 'get_ai_usage', { source: 'x' })).rejects.toThrow('source');
    });

    it('reports latest inventory snapshot and range totals', async () => {
      q.mockResolvedValue({ count: 1, records: [{ accrual_date: '2026-03-31' }] });
      stats.mockResolvedValue([{ stats: { count: '2', sum: { inventory_count: '10', licensable_count: '8', billing_count: '8' } }, groupby_fields: [{ field: 'type', value: 'AI model' }] }]);
      const r = await executeAiGovernanceToolCall(mockClient, 'get_ai_usage', { source: 'inventory', from: '2026-03-01', to: '2026-03-31' });
      expect(q.mock.calls[0][0].query).toBe('accrual_date>=2026-03-01^accrual_date<=2026-03-31^ORDERBYDESCaccrual_date');
      expect(stats.mock.calls[0][1]).toMatchObject({ groupBy: 'type', query: 'accrual_date>=2026-03-01^accrual_date<=2026-03-31' });
      expect(stats.mock.calls[1][1].query).toBe('accrual_date=2026-03-31');
      expect(r.inventory.latest_snapshot[0]).toEqual({ type: 'AI model', count: 2, sum_inventory_count: 10, sum_licensable_count: 8, sum_billing_count: 8 });
      expect(r.genai_log).toBeUndefined();
    });

    it('groups the gen AI usage log and totals assists', async () => {
      stats.mockResolvedValue([
        { stats: { count: '3', sum: { assists: '5', trial_assists: '0' } }, groupby_fields: [{ field: 'plugin_name', value: 'a' }] },
        { stats: { count: '1', sum: { assists: '9', trial_assists: '1' } }, groupby_fields: [{ field: 'plugin_name', value: 'b' }] },
      ]);
      const r = await executeAiGovernanceToolCall(mockClient, 'get_ai_usage', { source: 'genai_log', group_by: 'plugin_name', from: '2026-01-01', to: '2026-01-31' });
      expect(stats.mock.calls[0][0]).toBe('sys_gen_ai_usage_log');
      expect(stats.mock.calls[0][1].query).toBe('sys_created_on>=2026-01-01 00:00:00^sys_created_on<=2026-01-31 23:59:59');
      expect(r.genai_log).toMatchObject({ total_calls: 4, total_assists: 14 });
      expect(r.genai_log.groups[0].plugin_name).toBe('b');
    });

    it('degrades softly in "both" mode when one source is missing', async () => {
      q.mockRejectedValue(new Error('Invalid table sn_ai_governance_ai_inventory_usage'));
      stats.mockResolvedValue([]);
      const r = await executeAiGovernanceToolCall(mockClient, 'get_ai_usage', {});
      expect(r.inventory.available).toBe(false);
      expect(r.inventory.note).toMatch(/needs AI Control Tower/);
      expect(r.genai_log.total_calls).toBe(0);
    });
  });

  it('list_ai_modified_records filters by table and date and splits fields', async () => {
    q.mockResolvedValue({ count: 1, records: [{ document_table: 'incident', fields_updated_by_ai: 'short_description, category' }] });
    const r = await executeAiGovernanceToolCall(mockClient, 'list_ai_modified_records', { table: 'incident', from: '2026-01-01' });
    expect(q.mock.calls[0][0]).toMatchObject({ table: 'sys_ai_record_activity', query: 'document_table=incident^sys_created_on>=2026-01-01 00:00:00^ORDERBYDESCsys_created_on' });
    expect(r.records[0].fields_updated_by_ai).toEqual(['short_description', 'category']);
  });

  it('list_ai_modified_records summary groups by table', async () => {
    stats.mockResolvedValue([{ stats: { count: '4' }, groupby_fields: [{ field: 'document_table', value: 'incident' }] }]);
    const r = await executeAiGovernanceToolCall(mockClient, 'list_ai_modified_records', { summary: true });
    expect(stats.mock.calls[0][1]).toMatchObject({ groupBy: 'document_table', query: '' });
    expect(r).toEqual({ total: 4, by_table: [{ document_table: 'incident', count: 4 }] });
  });

  it('list_kg_context_configs needs Knowledge Graph when tables are missing', async () => {
    q.mockRejectedValue(new Error('Invalid table'));
    await expect(executeAiGovernanceToolCall(mockClient, 'list_kg_context_configs', {})).rejects.toThrow(/need Knowledge Graph/);
  });

  describe('describe_kg_schema', () => {
    it('requires graph', async () => {
      await expect(executeAiGovernanceToolCall(mockClient, 'describe_kg_schema', {})).rejects.toThrow('graph is required');
    });

    it('falls back to schema_json when node tables are empty', async () => {
      const schema = { nodes: [{ node_type: 'User', label: 'User', table: 'sys_user', properties: [{ property: 'name', label: 'Name', type: 'string', description: 'name' }] }], edges: [{ edge_type: 'MANAGER', source_node: 'User', target_node: 'User', target_key_field: 'manager' }] };
      q.mockImplementation(async (p: any) =>
        p.table === 'sys_meta_graph' ? { count: 1, records: [{ sys_id: GOV, name: 'g', schema_json: JSON.stringify(schema) }] } : { count: 0, records: [] }
      );
      const r = await executeAiGovernanceToolCall(mockClient, 'describe_kg_schema', { graph: 'g' });
      expect(q.mock.calls[0][0].query).toBe('name=g^ORlabel=g');
      expect(r.source).toBe('sys_meta_graph.schema_json');
      expect(r.nodes[0].properties).toEqual([{ name: 'name', label: 'Name', type: 'string', description: undefined }]);
      expect(r.edges[0]).toMatchObject({ edge_type: 'MANAGER', source: 'User', target_key_field: 'manager' });
      expect(r.graph.schema_json).toBeUndefined();
    });

    it('errors when the graph is unknown', async () => {
      q.mockResolvedValue({ count: 0, records: [] });
      await expect(executeAiGovernanceToolCall(mockClient, 'describe_kg_schema', { graph: 'nope' })).rejects.toThrow('not found');
    });
  });

  it('list_otto_channels groups channels and attributes per deployment', async () => {
    q.mockImplementation(async (p: any) => {
      switch (p.table) {
        case 'sys_now_assist_deployment':
          return { count: 1, records: [{ sys_id: { value: 'D1' }, name: { display_value: 'Otto panel' }, active: { value: 'true' } }] };
        case 'sys_now_assist_deployment_channel':
          return { count: 1, records: [{ sys_id: { value: 'C1' }, now_assist_deployment: { value: 'D1' }, active: { value: 'true' }, document_table: { value: 'sys_ux_app' } }] };
        case 'sys_now_assist_deployment_config':
          return { count: 1, records: [{ sys_id: { value: 'CF1' }, now_assist_deployment: { value: 'D1' } }] };
        default:
          return { count: 1, records: [{ name: 'qna_skill_enabled', value: 'true', deployment_config: 'CF1' }] };
      }
    });
    const r = await executeAiGovernanceToolCall(mockClient, 'list_otto_channels', { active: true });
    expect(q.mock.calls[0][0].query).toBe('active=true^ORDERBYname');
    expect(r.deployments[0]).toMatchObject({ sys_id: 'D1', name: 'Otto panel', active: true, channels: [{ sys_id: 'C1', surface_table: 'sys_ux_app' }], attributes: { qna_skill_enabled: 'true' } });
  });

  it('get_otto_status reports apps, properties and counts', async () => {
    q.mockImplementation(async (p: any) =>
      p.table === 'sys_scope'
        ? { count: 2, records: [{ scope: 'sn_aia', name: 'ServiceNow Otto AI Agents', version: '6.0.25', active: 'true' }, { scope: 'sn_generative_ai', name: 'Generative AI Controller', version: '12.0.15', active: 'true' }] }
        : { count: 1, records: [{ name: 'sn_aia.external_agents.enabled', value: 'true' }] }
    );
    stats.mockImplementation(async (table: string) => {
      if (table === 'sn_aia_agent') return [{ stats: { count: '7' } }];
      throw new Error('Invalid table ' + table);
    });
    const r = await executeAiGovernanceToolCall(mockClient, 'get_otto_status', {});
    expect(r.summary.ai_agents).toMatchObject({ installed: true, version: '6.0.25' });
    expect(r.summary.mcp_server).toEqual({ installed: false });
    expect(r.summary.external_agents_enabled).toBe(true);
    expect(r.summary.mcp_tools_in_agents_enabled).toBe(false);
    expect(r.counts.ai_agents).toBe(7);
    expect(r.counts.agent_tools).toBe('not installed');
  });
});

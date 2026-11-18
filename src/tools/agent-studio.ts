/**
 * Otto (formerly Now Assist) AI Agent Studio parity tools.
 *
 * Covers the parts of AI Agent Studio that list_ai_agents / get_ai_agent do not: the tools an
 * agent can call, triggers, versions, long-term memory, execution traces, evaluations and
 * external (A2A) agents. Reads are Tier 0; attach/detach require WRITE_ENABLED=true.
 *
 * Tables (sn_aia scope "ServiceNow Otto AI Agents", plus Generative AI Controller eval tables):
 *   sn_aia_agent, sn_aia_tool, sn_aia_agent_tool_m2m        agent <-> tool links
 *   sn_aia_trigger_configuration, sn_aia_trigger_agent_usecase_m2m
 *   sn_aia_version                                         agent / use case versions
 *   sn_aia_memory                                          long-term memory (semantic / episodic)
 *   sn_aia_execution_plan, sn_aia_execution_task, sn_aia_message, sn_aia_tools_execution
 *   sys_one_extend_batch_run, sys_one_extend_eval_metric_result, sys_one_extend_batch_result,
 *   sys_one_extend_eval_strategy                           evaluations
 *   sn_aia_external_agent_provider / _protocol / _discovery / _card / _skill / _configuration
 */
import type { ServiceNowClient } from '../servicenow/client.js';
import { ServiceNowError } from '../utils/errors.js';
import { requireWrite } from '../utils/permissions.js';

const AIA_PLUGIN = 'ServiceNow Otto AI Agents (sn_aia, plugin com.glide.ai.agents / "Now Assist AI Agents")';
const EVAL_PLUGIN = 'Generative AI Controller evaluation framework (sys_one_extend_*, Otto / Now Assist Skill Kit evaluations)';
const SYS_ID_RE = /^[0-9a-f]{32}$/i;

function isInvalidTable(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /invalid table/i.test(msg);
}

/** Re-throw "Invalid table" as a clear needs-plugin error; pass everything else through. */
function needsPlugin(err: unknown, table: string, plugin: string): never {
  if (isInvalidTable(err)) {
    throw new ServiceNowError(
      `Table ${table} is not available on this instance. It needs ${plugin}.`,
      'PLUGIN_NOT_INSTALLED'
    );
  }
  throw err;
}

/** Run a sub-query; return a soft "unavailable" marker instead of failing the whole tool. */
async function optionalQuery(
  client: ServiceNowClient,
  params: Parameters<ServiceNowClient['queryRecords']>[0],
  plugin: string
): Promise<{ available: boolean; records: any[]; note?: string }> {
  try {
    const r = await client.queryRecords(params);
    return { available: true, records: r.records };
  } catch (err) {
    if (isInvalidTable(err)) return { available: false, records: [], note: `${params.table} not present (needs ${plugin})` };
    const msg = err instanceof Error ? err.message : String(err);
    return { available: false, records: [], note: `${params.table}: ${msg.split('\n')[0]}` };
  }
}

function lim(v: unknown, def: number, max = 500): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return def;
  return Math.min(Math.floor(n), max);
}

function requireSysId(v: unknown, field: string): string {
  if (!v || typeof v !== 'string') throw new ServiceNowError(`${field} is required`, 'INVALID_REQUEST');
  if (!SYS_ID_RE.test(v)) throw new ServiceNowError(`${field} must be a 32-character sys_id`, 'INVALID_REQUEST');
  return v;
}

/** Encoded-query values can't contain ^ (it's the separator). */
function safeVal(v: unknown, field: string): string {
  const s = String(v ?? '').trim();
  if (s.includes('^')) throw new ServiceNowError(`${field} must not contain "^"`, 'INVALID_REQUEST');
  return s;
}

/** Build an agent filter on a reference field from either a sys_id or an agent name. */
function agentFilter(field: string, agent: string): string {
  const a = safeVal(agent, 'agent');
  return SYS_ID_RE.test(a) ? `${field}=${a}` : `${field}.name=${a}`;
}

const val = (v: any) => (v && typeof v === 'object' && 'value' in v ? v.value : v);
const disp = (v: any) => (v && typeof v === 'object' && 'display_value' in v ? v.display_value : v);

export function getAgentStudioToolDefinitions() {
  return [
    {
      name: 'list_agent_tools',
      description:
        'List the tools attached to an Otto (Now Assist) AI agent in AI Agent Studio: flow actions, subflows, scripts, topics, skills, MCP tools, etc. Reads sn_aia_agent_tool_m2m joined to sn_aia_tool. Pass an agent sys_id or exact name, or a tool to see which agents use it.',
      inputSchema: {
        type: 'object',
        properties: {
          agent: { type: 'string', description: 'Agent sys_id or exact agent name (sn_aia_agent)' },
          tool: { type: 'string', description: 'Optional: sn_aia_tool sys_id, to list the agents a tool is attached to' },
          active: { type: 'boolean', description: 'Filter on link active flag' },
          limit: { type: 'number', description: 'Max records (default 100)' },
        },
        required: [],
      },
    },
    {
      name: 'attach_agent_tool',
      description:
        'Attach an existing tool (sn_aia_tool) to an Otto / Now Assist AI agent by creating a sn_aia_agent_tool_m2m link. Returns the existing link if one already exists. Requires WRITE_ENABLED=true.',
      inputSchema: {
        type: 'object',
        properties: {
          agent_sys_id: { type: 'string', description: 'sys_id of the sn_aia_agent' },
          tool_sys_id: { type: 'string', description: 'sys_id of the sn_aia_tool to attach' },
          name: { type: 'string', description: 'Link name shown in AI Agent Studio (defaults to the tool name)' },
          description: { type: 'string', description: 'What the agent should use this tool for' },
          execution_mode: { type: 'string', enum: ['autopilot', 'copilot'], description: 'autopilot = Autonomous, copilot = Supervised (default autopilot)' },
          max_auto_executions: { type: 'number', description: 'Max autonomous executions per run (default 10)' },
          display_output: { type: 'boolean', description: 'Show the tool output to the user' },
          inputs: { type: 'array', items: { type: 'object' }, description: 'Tool input definitions, e.g. [{name, description, mandatory}]' },
          active: { type: 'boolean', description: 'Active (default true)' },
        },
        required: ['agent_sys_id', 'tool_sys_id'],
      },
    },
    {
      name: 'detach_agent_tool',
      description:
        'Detach a tool from an Otto / Now Assist AI agent: deletes the sn_aia_agent_tool_m2m link (or only deactivates it with deactivate_only). Identify the link by link_sys_id, or by agent_sys_id + tool_sys_id. The tool itself is not deleted. Requires WRITE_ENABLED=true.',
      inputSchema: {
        type: 'object',
        properties: {
          link_sys_id: { type: 'string', description: 'sys_id of the sn_aia_agent_tool_m2m record' },
          agent_sys_id: { type: 'string', description: 'Agent sys_id (with tool_sys_id)' },
          tool_sys_id: { type: 'string', description: 'Tool sys_id (with agent_sys_id)' },
          deactivate_only: { type: 'boolean', description: 'Set active=false instead of deleting the link' },
        },
        required: [],
      },
    },
    {
      name: 'list_agent_triggers',
      description:
        'List Otto / Now Assist AI agent triggers (sn_aia_trigger_configuration): record-based, scheduled and channel triggers that start agentic workflows, with their target table, condition, run-as user and linked use cases/agents (sn_aia_trigger_agent_usecase_m2m).',
      inputSchema: {
        type: 'object',
        properties: {
          usecase: { type: 'string', description: 'Filter by agentic workflow / use case sys_id (sn_aia_usecase)' },
          target_table: { type: 'string', description: 'Filter by the table the trigger watches, e.g. incident' },
          active: { type: 'boolean', description: 'Filter on active' },
          query: { type: 'string', description: 'Extra encoded query' },
          limit: { type: 'number', description: 'Max records (default 50)' },
        },
        required: [],
      },
    },
    {
      name: 'get_agent_versions',
      description:
        'Get the version history of an Otto / Now Assist AI agent or agentic workflow (sn_aia_version): version number, name, state (Draft/Published), instructions and condition. Newest first.',
      inputSchema: {
        type: 'object',
        properties: {
          target_id: { type: 'string', description: 'sys_id of the sn_aia_agent or sn_aia_usecase' },
          target_table: { type: 'string', enum: ['sn_aia_agent', 'sn_aia_usecase'], description: 'Optional target table filter' },
          state: { type: 'string', description: 'Filter by state, e.g. published, draft' },
          include_instructions: { type: 'boolean', description: 'Include the full instructions text (default false)' },
          limit: { type: 'number', description: 'Max records (default 25)' },
        },
        required: ['target_id'],
      },
    },
    {
      name: 'list_agent_memory',
      description:
        'List Otto / Now Assist AI agent long-term memory entries (sn_aia_memory): semantic and episodic memories stored per user, with category, relevance score and source record.',
      inputSchema: {
        type: 'object',
        properties: {
          user: { type: 'string', description: 'sys_user sys_id or user_name' },
          type: { type: 'string', enum: ['semantic', 'episodic'], description: 'Memory type' },
          category: { type: 'string', description: 'Long-term memory category sys_id (sn_aia_ltm_category)' },
          active: { type: 'boolean', description: 'Filter on active (default: all)' },
          limit: { type: 'number', description: 'Max records (default 50)' },
        },
        required: [],
      },
    },
    {
      name: 'get_agent_execution_trace',
      description:
        'Get an ordered timeline for one Otto / Now Assist AI agent run: the execution plan (sn_aia_execution_plan) plus its tasks (sn_aia_execution_task), conversation messages (sn_aia_message) and tool calls with request/response (sn_aia_tools_execution). Use list_ai_agent_executions to find the plan sys_id.',
      inputSchema: {
        type: 'object',
        properties: {
          execution_plan_sys_id: { type: 'string', description: 'sys_id of the sn_aia_execution_plan' },
          include_payloads: { type: 'boolean', description: 'Include full tool request/response and message bodies (default false, truncated to 500 chars)' },
          limit: { type: 'number', description: 'Max rows per child table (default 200)' },
        },
        required: ['execution_plan_sys_id'],
      },
    },
    {
      name: 'list_agent_evaluations',
      description:
        'List Otto / Now Assist evaluation runs (sys_one_extend_batch_run) for AI agents and skills: status, evaluation type (agentic_ai, conversational_ai), run type, dataset and strategy. Optionally list the available evaluation strategies.',
      inputSchema: {
        type: 'object',
        properties: {
          evaluation_type: { type: 'string', description: 'agentic_ai or conversational_ai' },
          status: { type: 'string', description: 'draft, in_progress, completed, error, cancelled, archived' },
          usecase_id: { type: 'string', description: 'sys_id of the agent / use case / skill under test' },
          run_type: { type: 'string', description: 'eval_run, test_run or auto_prompt_tuning' },
          include_strategies: { type: 'boolean', description: 'Also list eval strategies (sys_one_extend_eval_strategy)' },
          limit: { type: 'number', description: 'Max records (default 25)' },
        },
        required: [],
      },
    },
    {
      name: 'get_evaluation_results',
      description:
        'Get the results of one Otto / Now Assist evaluation run: the run (sys_one_extend_batch_run), per-metric results with a pass/fail summary (sys_one_extend_eval_metric_result), per-record results (sys_one_extend_batch_result) and child runs.',
      inputSchema: {
        type: 'object',
        properties: {
          batch_run_sys_id: { type: 'string', description: 'sys_id of the sys_one_extend_batch_run' },
          include_records: { type: 'boolean', description: 'Include per-record batch results (default true)' },
          limit: { type: 'number', description: 'Max metric/record rows (default 200)' },
        },
        required: ['batch_run_sys_id'],
      },
    },
    {
      name: 'list_external_agents',
      description:
        'List external (third-party) AI agents registered for Otto / Now Assist A2A (Agent2Agent) use: providers (sn_aia_external_agent_provider), protocols, discovery configs, agent cards and skills, connection configurations, and sn_aia_agent records of type external.',
      inputSchema: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Max rows per section (default 50)' },
        },
        required: [],
      },
    },
  ];
}

export async function executeAgentStudioToolCall(
  client: ServiceNowClient,
  name: string,
  args: Record<string, any>
): Promise<any> {
  switch (name) {
    case 'list_agent_tools': {
      if (!args.agent && !args.tool) throw new ServiceNowError('agent or tool is required', 'INVALID_REQUEST');
      const parts: string[] = [];
      if (args.agent) parts.push(agentFilter('agent', args.agent));
      if (args.tool) parts.push(`tool=${requireSysId(args.tool, 'tool')}`);
      if (args.active !== undefined) parts.push(`active=${args.active === true || args.active === 'true'}`);
      parts.push('ORDERBYname');
      let res;
      try {
        res = await client.queryRecords({
          table: 'sn_aia_agent_tool_m2m',
          query: parts.join('^'),
          fields:
            'sys_id,name,description,active,agent,tool,tool.name,tool.type,tool.record_type,tool.target_document_table,tool.target_document,tool.active,execution_mode,max_auto_executions,display_output,output_transformation_strategy,timeout,pre_run,inputs,sys_scope',
          limit: lim(args.limit, 100),
          displayValue: 'all',
        });
      } catch (err) {
        needsPlugin(err, 'sn_aia_agent_tool_m2m', AIA_PLUGIN);
      }
      const tools = res.records.map((r: any) => ({
        link_sys_id: val(r.sys_id),
        name: disp(r.name),
        description: disp(r.description),
        active: val(r.active) === 'true',
        agent: { sys_id: val(r.agent), name: disp(r.agent) },
        tool: {
          sys_id: val(r.tool),
          name: disp(r['tool.name']),
          type: disp(r['tool.type']),
          record_type: disp(r['tool.record_type']),
          target_table: val(r['tool.target_document_table']),
          target: disp(r['tool.target_document']),
          active: val(r['tool.active']) === 'true',
        },
        execution_mode: disp(r.execution_mode),
        max_auto_executions: val(r.max_auto_executions),
        display_output: val(r.display_output) === 'true',
        output_transformation: disp(r.output_transformation_strategy),
        inputs: val(r.inputs),
        scope: disp(r.sys_scope),
      }));
      return { count: tools.length, tools };
    }

    case 'attach_agent_tool': {
      requireWrite();
      const agentId = requireSysId(args.agent_sys_id, 'agent_sys_id');
      const toolId = requireSysId(args.tool_sys_id, 'tool_sys_id');
      if (args.execution_mode && !['autopilot', 'copilot'].includes(args.execution_mode)) {
        throw new ServiceNowError('execution_mode must be autopilot or copilot', 'INVALID_REQUEST');
      }
      let agent: any;
      let tool: any;
      try {
        agent = await client.getRecord('sn_aia_agent', agentId, 'sys_id,name');
        tool = await client.getRecord('sn_aia_tool', toolId, 'sys_id,name,type,active');
      } catch (err) {
        needsPlugin(err, 'sn_aia_agent', AIA_PLUGIN);
      }
      const existing = await client.queryRecords({
        table: 'sn_aia_agent_tool_m2m',
        query: `agent=${agentId}^tool=${toolId}`,
        fields: 'sys_id,name,active',
        limit: 1,
      });
      if (existing.records.length) {
        return { action: 'already_attached', link: existing.records[0], agent: agent.name, tool: tool.name };
      }
      const payload: Record<string, any> = {
        agent: agentId,
        tool: toolId,
        name: args.name || tool.name,
        active: args.active === undefined ? true : !!args.active,
        execution_mode: args.execution_mode || 'autopilot',
        max_auto_executions: args.max_auto_executions ?? 10,
      };
      if (args.description) payload.description = args.description;
      if (args.display_output !== undefined) payload.display_output = !!args.display_output;
      if (args.inputs !== undefined) payload.inputs = typeof args.inputs === 'string' ? args.inputs : JSON.stringify(args.inputs);
      const created = await client.createRecord('sn_aia_agent_tool_m2m', payload);
      return {
        action: 'attached',
        link_sys_id: (created as any).sys_id,
        agent: { sys_id: agentId, name: agent.name },
        tool: { sys_id: toolId, name: tool.name, type: tool.type },
        link: created,
      };
    }

    case 'detach_agent_tool': {
      requireWrite();
      let linkId: string;
      if (args.link_sys_id) {
        linkId = requireSysId(args.link_sys_id, 'link_sys_id');
      } else if (args.agent_sys_id && args.tool_sys_id) {
        const agentId = requireSysId(args.agent_sys_id, 'agent_sys_id');
        const toolId = requireSysId(args.tool_sys_id, 'tool_sys_id');
        let found;
        try {
          found = await client.queryRecords({
            table: 'sn_aia_agent_tool_m2m',
            query: `agent=${agentId}^tool=${toolId}`,
            fields: 'sys_id',
            limit: 1,
          });
        } catch (err) {
          needsPlugin(err, 'sn_aia_agent_tool_m2m', AIA_PLUGIN);
        }
        if (!found.records.length) throw new ServiceNowError('No link found between that agent and tool', 'NOT_FOUND');
        linkId = (found.records[0] as any).sys_id;
      } else {
        throw new ServiceNowError('link_sys_id, or agent_sys_id + tool_sys_id, is required', 'INVALID_REQUEST');
      }
      if (args.deactivate_only) {
        await client.updateRecord('sn_aia_agent_tool_m2m', linkId, { active: false });
        return { action: 'deactivated', link_sys_id: linkId };
      }
      await client.deleteRecord('sn_aia_agent_tool_m2m', linkId);
      return { action: 'detached', link_sys_id: linkId };
    }

    case 'list_agent_triggers': {
      const parts: string[] = [];
      if (args.usecase) parts.push(`usecase=${requireSysId(args.usecase, 'usecase')}`);
      if (args.target_table) parts.push(`target_table=${safeVal(args.target_table, 'target_table')}`);
      if (args.active !== undefined) parts.push(`active=${args.active === true || args.active === 'true'}`);
      if (args.query) parts.push(String(args.query));
      parts.push('ORDERBYname');
      let res;
      try {
        res = await client.queryRecords({
          table: 'sn_aia_trigger_configuration',
          query: parts.join('^'),
          fields:
            'sys_id,name,description,active,usecase,target_table,trigger_strategy,trigger_flow_definition_type,condition,channel,run_as,run_as_user,run_period,run_dayofweek,run_dayofmonth,run_time,run_start,objective_template,show_notifications,enable_discovery,sys_scope',
          limit: lim(args.limit, 50),
          displayValue: 'all',
        });
      } catch (err) {
        needsPlugin(err, 'sn_aia_trigger_configuration', AIA_PLUGIN);
      }
      const ids = res.records.map((r: any) => val(r.sys_id));
      const links = ids.length
        ? await optionalQuery(client, {
            table: 'sn_aia_trigger_agent_usecase_m2m',
            query: `trigger_configurationIN${ids.join(',')}`,
            fields: 'sys_id,trigger_configuration,related_resource_table,related_resource_record,active',
            limit: 500,
            displayValue: 'all',
          }, AIA_PLUGIN)
        : { available: true, records: [] };
      const triggers = res.records.map((r: any) => {
        const id = val(r.sys_id);
        const out: Record<string, any> = {};
        for (const [k, v] of Object.entries(r)) out[k] = disp(v);
        out.sys_id = id;
        out.usecase_sys_id = val(r.usecase);
        out.run_as_user_sys_id = val(r.run_as_user);
        out.linked_resources = links.records
          .filter((l: any) => val(l.trigger_configuration) === id)
          .map((l: any) => ({ table: val(l.related_resource_table), sys_id: val(l.related_resource_record), name: disp(l.related_resource_record), active: val(l.active) === 'true' }));
        return out;
      });
      return { count: triggers.length, triggers };
    }

    case 'get_agent_versions': {
      const target = requireSysId(args.target_id, 'target_id');
      const parts = [`target_id=${target}`];
      if (args.target_table) parts.push(`target_table=${safeVal(args.target_table, 'target_table')}`);
      if (args.state) parts.push(`state=${safeVal(args.state, 'state')}`);
      parts.push('ORDERBYDESCversion_number');
      const fields = ['sys_id', 'version_name', 'version_number', 'state', 'target_table', 'target_id', 'condition', 'sys_created_on', 'sys_created_by', 'sys_updated_on'];
      if (args.include_instructions) fields.push('instructions');
      try {
        const res = await client.queryRecords({ table: 'sn_aia_version', query: parts.join('^'), fields: fields.join(','), limit: lim(args.limit, 25), displayValue: true });
        return { target_id: target, count: res.count, versions: res.records };
      } catch (err) {
        needsPlugin(err, 'sn_aia_version', AIA_PLUGIN);
      }
    }

    case 'list_agent_memory': {
      const parts: string[] = [];
      if (args.user) {
        const u = safeVal(args.user, 'user');
        parts.push(SYS_ID_RE.test(u) ? `user=${u}` : `user.user_name=${u}`);
      }
      if (args.type) {
        if (!['semantic', 'episodic'].includes(args.type)) throw new ServiceNowError('type must be semantic or episodic', 'INVALID_REQUEST');
        parts.push(`type=${args.type}`);
      }
      if (args.category) parts.push(`category=${requireSysId(args.category, 'category')}`);
      if (args.active !== undefined) parts.push(`active=${args.active === true || args.active === 'true'}`);
      parts.push('ORDERBYDESCsys_updated_on');
      try {
        const res = await client.queryRecords({
          table: 'sn_aia_memory',
          query: parts.join('^'),
          fields: 'sys_id,user,type,category,memory,relevance_score,task,source_table,source_id,active,sys_created_on,sys_updated_on',
          limit: lim(args.limit, 50),
          displayValue: true,
        });
        return { count: res.count, memories: res.records, note: res.count === 0 ? 'No long-term memory entries match. Memory is only written when AI agent long-term memory is enabled and agents have run.' : undefined };
      } catch (err) {
        needsPlugin(err, 'sn_aia_memory', AIA_PLUGIN);
      }
    }

    case 'get_agent_execution_trace': {
      const planId = requireSysId(args.execution_plan_sys_id, 'execution_plan_sys_id');
      const max = lim(args.limit, 200, 1000);
      const full = !!args.include_payloads;
      const trunc = (s: any) => {
        const v = disp(s);
        if (full || typeof v !== 'string' || v.length <= 500) return v;
        return v.slice(0, 500) + `... [${v.length} chars]`;
      };
      let plan: any;
      try {
        plan = await client.getRecord(
          'sn_aia_execution_plan',
          planId,
          'sys_id,objective,status,state,state_reason,agent,usecase,team,run_type,execution_mode,start_time,end_time,execution_time_ms,llm_token_avg,llm_p95_latency,tool_p95_latency,related_task_table,related_task_record,conversation,test_version,sys_created_on',
          true
        );
      } catch (err) {
        needsPlugin(err, 'sn_aia_execution_plan', AIA_PLUGIN);
      }
      const [tasks, messages, toolCalls] = await Promise.all([
        optionalQuery(client, {
          table: 'sn_aia_execution_task',
          query: `execution_plan=${planId}^ORDERBYorder`,
          fields: 'sys_id,order,type,status,description,output,target_document_table,target_document_id,parent,start_time,end_time,execution_time_ms,sys_created_on',
          limit: max,
          displayValue: true,
        }, AIA_PLUGIN),
        optionalQuery(client, {
          table: 'sn_aia_message',
          query: `execution_plan=${planId}^ORDERBYmessage_sequence`,
          fields: 'sys_id,message_sequence,role,type,name,message,user_message,error_type,document_table,sys_created_on',
          limit: max,
          displayValue: true,
        }, AIA_PLUGIN),
        optionalQuery(client, {
          table: 'sn_aia_tools_execution',
          query: `execution_plan_id=${planId}^ORDERBYsys_created_on`,
          fields: 'sys_id,tool,execution_status,execution_mode,request,response,error_message,execution_time_ms,run_as_user,sys_created_on',
          limit: max,
          displayValue: true,
        }, AIA_PLUGIN),
      ]);
      type Ev = { at: string; seq: number; kind: string; [k: string]: any };
      const timeline: Ev[] = [];
      for (const t of tasks.records as any[]) {
        timeline.push({ at: t.start_time || t.sys_created_on, seq: Number(t.order) || 0, kind: 'task', sys_id: t.sys_id, type: t.type, status: t.status, description: trunc(t.description), output: trunc(t.output), end_time: t.end_time, execution_time_ms: t.execution_time_ms });
      }
      for (const m of messages.records as any[]) {
        timeline.push({ at: m.sys_created_on, seq: Number(m.message_sequence) || 0, kind: 'message', sys_id: m.sys_id, role: m.role, type: m.type, name: m.name, message: trunc(m.message), user_message: trunc(m.user_message), error_type: m.error_type || undefined });
      }
      for (const c of toolCalls.records as any[]) {
        timeline.push({ at: c.sys_created_on, seq: 0, kind: 'tool_call', sys_id: c.sys_id, tool: disp(c.tool), status: c.execution_status, mode: c.execution_mode, request: trunc(c.request), response: trunc(c.response), error: c.error_message || undefined, execution_time_ms: c.execution_time_ms });
      }
      timeline.sort((a, b) => (a.at || '').localeCompare(b.at || '') || a.seq - b.seq);
      const notes = [tasks, messages, toolCalls].map((x) => x.note).filter(Boolean);
      return {
        execution_plan: plan,
        counts: { tasks: tasks.records.length, messages: messages.records.length, tool_calls: toolCalls.records.length },
        timeline,
        ...(notes.length ? { notes } : {}),
      };
    }

    case 'list_agent_evaluations': {
      const parts: string[] = [];
      if (args.evaluation_type) parts.push(`evaluation_type=${safeVal(args.evaluation_type, 'evaluation_type')}`);
      if (args.status) parts.push(`status=${safeVal(args.status, 'status')}`);
      if (args.usecase_id) parts.push(`usecase_id=${requireSysId(args.usecase_id, 'usecase_id')}`);
      if (args.run_type) parts.push(`run_type=${safeVal(args.run_type, 'run_type')}`);
      parts.push('ORDERBYDESCsys_created_on');
      let res;
      try {
        res = await client.queryRecords({
          table: 'sys_one_extend_batch_run',
          query: parts.join('^'),
          fields: 'sys_id,name,description,status,evaluation_type,evaluation_sub_type,run_type,usecase_table,usecase_id,usecase_version_id,capability,eval_strategy,test_dataset,parent,duration,source,sys_created_on,sys_created_by',
          limit: lim(args.limit, 25),
          displayValue: true,
        });
      } catch (err) {
        needsPlugin(err, 'sys_one_extend_batch_run', EVAL_PLUGIN);
      }
      const out: Record<string, any> = { count: res.count, evaluations: res.records };
      if (res.count === 0) out.note = 'No evaluation runs match. Runs appear after an evaluation is executed from AI Agent Studio or Now Assist Skill Kit.';
      if (args.include_strategies) {
        const strat = await optionalQuery(client, {
          table: 'sys_one_extend_eval_strategy',
          query: 'ORDERBYname',
          fields: 'sys_id,name,capability,skill_config_id,default',
          limit: 200,
          displayValue: true,
        }, EVAL_PLUGIN);
        out.strategies = strat.records;
        if (strat.note) out.strategies_note = strat.note;
      }
      return out;
    }

    case 'get_evaluation_results': {
      const runId = requireSysId(args.batch_run_sys_id, 'batch_run_sys_id');
      const max = lim(args.limit, 200, 1000);
      let run: any;
      try {
        run = await client.getRecord('sys_one_extend_batch_run', runId, undefined, true);
      } catch (err) {
        needsPlugin(err, 'sys_one_extend_batch_run', EVAL_PLUGIN);
      }
      const [metrics, children, records] = await Promise.all([
        optionalQuery(client, {
          table: 'sys_one_extend_eval_metric_result',
          query: `batch_run=${runId}`,
          fields: 'sys_id,metric,parent_metric,is_child_metric,status,response,additional_info,batch_result',
          limit: max,
          displayValue: true,
        }, EVAL_PLUGIN),
        optionalQuery(client, {
          table: 'sys_one_extend_batch_run',
          query: `parent=${runId}^ORDERBYsys_created_on`,
          fields: 'sys_id,name,status,run_type,evaluation_type,sys_created_on',
          limit: 100,
          displayValue: true,
        }, EVAL_PLUGIN),
        args.include_records === false
          ? Promise.resolve({ available: true, records: [] as any[] })
          : optionalQuery(client, {
              table: 'sys_one_extend_batch_result',
              query: `batch_run=${runId}`,
              fields: 'sys_id,status,input,response,processed_response,is_excluded,test_record,execution_stats',
              limit: max,
              displayValue: true,
            }, EVAL_PLUGIN),
      ]);
      const summary: Record<string, Record<string, number>> = {};
      for (const m of metrics.records as any[]) {
        const key = disp(m.metric) || 'unknown';
        const st = disp(m.status) || 'unknown';
        summary[key] = summary[key] || {};
        summary[key][st] = (summary[key][st] || 0) + 1;
      }
      const notes = [metrics, children, records].map((x: any) => x.note).filter(Boolean);
      return {
        run,
        metric_summary: summary,
        metric_results: metrics.records,
        child_runs: children.records,
        record_results: records.records,
        ...(notes.length ? { notes } : {}),
      };
    }

    case 'list_external_agents': {
      const max = lim(args.limit, 50);
      const q = (table: string, fields: string, query = '') =>
        optionalQuery(client, { table, query, fields, limit: max, displayValue: true }, AIA_PLUGIN);
      const [providers, protocols, discovery, cards, skills, configs, agents] = await Promise.all([
        q('sn_aia_external_agent_provider', 'sys_id,name,version,agent_card_url,api_type,api,rest_message,connection_credential_alias,is_secondary'),
        q('sn_aia_external_agent_protocol', 'sys_id,name,version,active,description'),
        q('sn_aia_external_agent_discovery', 'sys_id,provider,protocol,type,version,active'),
        q('sn_aia_external_agent_card', 'sys_id,name,description,version,url,agent,discovery_provider'),
        q('sn_aia_external_agent_skill', 'sys_id,name,description,card,tags'),
        q('sn_aia_external_agent_configuration', 'sys_id,name,external_agent_id,external_agent_provider,synchronous,analyse_response'),
        q('sn_aia_agent', 'sys_id,name,description,agent_type,external_agent_configuration,sys_scope', 'agent_type=external'),
      ]);
      const sections = { providers, protocols, discovery, cards, skills, configurations: configs, external_agents: agents };
      if (!providers.available && !protocols.available && !cards.available) {
        throw new ServiceNowError(`External agent tables are not available on this instance. They need ${AIA_PLUGIN} with external agent (A2A) support.`, 'PLUGIN_NOT_INSTALLED');
      }
      const out: Record<string, any> = {
        summary: Object.fromEntries(Object.entries(sections).map(([k, v]) => [k, v.records.length])),
      };
      for (const [k, v] of Object.entries(sections)) {
        out[k] = v.records;
        if (v.note) out[`${k}_note`] = v.note;
      }
      return out;
    }

    default:
      return null;
  }
}

/**
 * AI Agents tools — create and manage AI agents and agentic workflows.
 * Write tools require NOW_ASSIST_ENABLED + WRITE_ENABLED.
 */
import type { ServiceNowClient } from '../servicenow/client.js';
import { ServiceNowError } from '../utils/errors.js';
import { requireNowAssist, requireWrite } from '../utils/permissions.js';

export function getAiAgentsToolDefinitions() {
  return [
    {
      name: 'create_ai_agent',
      description: 'Create an AI agent definition with optional auto-generated ACLs (requires NOW_ASSIST_ENABLED + WRITE_ENABLED)',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Agent name' },
          description: { type: 'string', description: 'Agent description' },
          capabilities: { type: 'array', items: { type: 'string' }, description: 'Tools to attach: AI Agent tool (sn_aia_tool) names or sys_ids. Unknown entries are reported, not created' },
          auto_generate_acls: { type: 'boolean', description: 'Create the execute ACL (type gen_ai_agent) that controls who can invoke the agent (default true)' },
          role: { type: 'string', description: 'Agent role/purpose, e.g. "Service desk triage specialist" (default: the description)' },
          instructions: { type: 'string', description: 'Agent instructions for its first version (default: the description)' },
        },
        required: ['name', 'description', 'capabilities'],
      },
    },
    {
      name: 'list_ai_agents',
      description: 'List AI agent definitions (AI Agent Studio, sn_aia_agent) with their active flag from sn_aia_agent_config',
      inputSchema: {
        type: 'object',
        properties: {
          active: { type: 'boolean', description: 'Filter by active status' },
          agent_type: { type: 'string', description: 'Filter by agent type, e.g. internal, voice, external' },
          limit: { type: 'number', description: 'Max records to return (default 25)' },
        },
        required: [],
      },
    },
    {
      name: 'get_ai_agent',
      description: 'Get an AI agent definition with its config, tools, versions and execute ACLs',
      inputSchema: {
        type: 'object',
        properties: {
          sys_id: { type: 'string', description: 'System ID of the AI agent' },
        },
        required: ['sys_id'],
      },
    },
    {
      name: 'create_agentic_workflow',
      description: 'Create an agentic workflow linked to an AI agent (requires NOW_ASSIST_ENABLED + WRITE_ENABLED)',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Workflow name' },
          description: { type: 'string', description: 'Workflow description' },
          agent_sys_id: { type: 'string', description: 'System ID of the parent AI agent' },
          steps: {
            type: 'array',
            description: 'Ordered list of workflow steps',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string', description: 'Step name' },
                action: { type: 'string', description: 'Action identifier' },
                inputs: { type: 'object', description: 'Step input parameters' },
                condition: { type: 'string', description: 'Optional condition expression' },
              },
              required: ['name', 'action'],
            },
          },
          trigger_conditions: { type: 'string', description: 'Optional trigger condition expression' },
          execution_mode: { type: 'string', description: 'copilot (default) or autopilot' },
        },
        required: ['name', 'description', 'agent_sys_id', 'steps'],
      },
    },
  ];
}

const AI_AGENT_TOOL_NAMES = new Set([
  'create_ai_agent', 'list_ai_agents', 'get_ai_agent', 'create_agentic_workflow',
]);

function refValue(v: any): string {
  return v && typeof v === 'object' ? String(v.value ?? '') : String(v ?? '');
}

async function withAiaPlugin<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ServiceNowError && /Invalid table/i.test(e.message)) {
      throw new ServiceNowError("This needs the AI Agents (sn_aia) plugin, which isn't active on this instance.", 'PLUGIN_NOT_ACTIVE');
    }
    throw e;
  }
}

/** Return the record's latest version, giving it the instructions; create V1 (draft) if there is none. */
async function ensureVersion(client: ServiceNowClient, targetTable: string, targetId: string, instructions: string): Promise<any> {
  const existing = await client.queryRecords({ table: 'sn_aia_version', query: `target_id=${targetId}`, limit: 1, orderBy: '-version_number', fields: 'sys_id,instructions' });
  if (existing.count) {
    const v = existing.records[0] as any;
    return v.instructions === instructions ? await client.getRecord('sn_aia_version', String(v.sys_id)) : await client.updateRecord('sn_aia_version', String(v.sys_id), { instructions });
  }
  return await client.createRecord('sn_aia_version', {
    target_table: targetTable,
    target_id: targetId,
    version_name: 'V1',
    version_number: '1',
    state: 'draft',
    instructions,
  });
}

/**
 * Create the execute ACL that controls who can invoke an AI agent / agentic workflow. ServiceNow names
 * these ACLs after the record's internal_name and types them gen_ai_agent / gen_ai_workflow.
 */
async function createExecuteAcl(client: ServiceNowClient, aclType: 'gen_ai_agent' | 'gen_ai_workflow', record: any, description: string): Promise<any> {
  const table = aclType === 'gen_ai_agent' ? 'sn_aia_agent' : 'sn_aia_usecase';
  const fresh = await client.getRecord(table, String(record.sys_id), 'internal_name');
  const internalName = String((fresh as any).internal_name || '');
  if (!internalName) throw new ServiceNowError(`${table} ${record.sys_id} has no internal_name yet`, 'NOT_FOUND');
  const [type, op] = await Promise.all([
    client.queryRecords({ table: 'sys_security_type', query: `name=${aclType}`, limit: 1, fields: 'sys_id' }),
    client.queryRecords({ table: 'sys_security_operation', query: 'name=execute', limit: 1, fields: 'sys_id' }),
  ]);
  if (!type.count || !op.count) throw new ServiceNowError(`ACL type ${aclType} or operation execute not found`, 'NOT_FOUND');
  return await client.createRecord('sys_security_acl', {
    name: internalName,
    type: String(type.records[0].sys_id),
    operation: String(op.records[0].sys_id),
    decision_type: 'allow',
    admin_overrides: 'true',
    active: 'true',
    description,
  });
}

export async function executeAiAgentsToolCall(
  client: ServiceNowClient,
  name: string,
  args: Record<string, any>
): Promise<any> {
  if (!AI_AGENT_TOOL_NAMES.has(name)) return null;

  switch (name) {
    case 'create_ai_agent': {
      requireNowAssist();
      requireWrite();
      if (!args.name) throw new ServiceNowError('name is required', 'INVALID_REQUEST');
      if (!args.description) throw new ServiceNowError('description is required', 'INVALID_REQUEST');
      if (!args.capabilities || !Array.isArray(args.capabilities)) {
        throw new ServiceNowError('capabilities must be an array of strings', 'INVALID_REQUEST');
      }

      // Same record model as the now-sdk AiAgent API: sn_aia_agent + sn_aia_agent_config + sn_aia_version.
      const instructions = args.instructions || args.description;
      const agentRecord = await withAiaPlugin(() => client.createRecord('sn_aia_agent', {
        name: args.name,
        description: args.description,
        role: args.role || args.description,
        instructions,
        agent_type: 'internal',
        channel: 'nap_and_va',
        record_type: 'custom',
      }));
      const agentSysId = String(agentRecord.sys_id);

      const existingConfig = await client.queryRecords({ table: 'sn_aia_agent_config', query: `agent=${agentSysId}`, limit: 1, fields: 'sys_id' });
      const config = existingConfig.count
        ? await client.updateRecord('sn_aia_agent_config', String(existingConfig.records[0].sys_id), { active: 'true' })
        : await client.createRecord('sn_aia_agent_config', { agent: agentSysId, active: 'true', public: 'false' });

      // Current releases create the config and a published V1 version on insert (from the agent's
      // instructions); only create them when the instance didn't.
      const version = await ensureVersion(client, 'sn_aia_agent', agentSysId, instructions);

      const tools: any[] = [];
      const unresolvedCapabilities: string[] = [];
      for (const cap of args.capabilities as string[]) {
        const query = /^[0-9a-f]{32}$/i.test(cap) ? `sys_id=${cap}` : `name=${cap}`;
        const found = await client.queryRecords({ table: 'sn_aia_tool', query, limit: 1, fields: 'sys_id,name' });
        if (!found.count) { unresolvedCapabilities.push(cap); continue; }
        const tool = found.records[0] as any;
        tools.push(await client.createRecord('sn_aia_agent_tool_m2m', {
          agent: agentSysId,
          tool: tool.sys_id,
          name: tool.name,
          active: 'true',
          execution_mode: 'copilot',
        }));
      }

      const createdAcls: any[] = [];
      let aclError: string | undefined;
      if (args.auto_generate_acls !== false) {
        try {
          createdAcls.push(await createExecuteAcl(client, 'gen_ai_agent', agentRecord, `Execute ACL for AI agent: ${args.name}`));
        } catch (e) {
          aclError = (e instanceof Error ? e.message : String(e)).split('\n')[0];
        }
      }

      return {
        message: 'AI agent created',
        agent: agentRecord,
        config,
        version,
        tools,
        ...(unresolvedCapabilities.length ? { unresolved_capabilities: unresolvedCapabilities } : {}),
        acls_created: createdAcls.length,
        acls: createdAcls,
        ...(aclError ? { acl_error: `Agent created, but its execute ACL was not: ${aclError}. Create it in AI Agent Studio (Define security controls) or with the security_admin role.` } : {}),
      };
    }

    case 'list_ai_agents': {
      // sn_aia_agent has no active field: the flag lives on sn_aia_agent_config (agent -> sn_aia_agent).
      // role holds the agent's full instructions (often thousands of characters): get_ai_agent returns it.
      const agentFields = 'sys_id,name,description,agent_type,channel,record_type,internal_name,sys_updated_on';
      let agents: any[];
      const typeFilter = args.agent_type ? String(args.agent_type).trim() : '';
      if (typeFilter.includes('^')) throw new ServiceNowError('agent_type must not contain "^"', 'INVALID_REQUEST');
      const typeQ = typeFilter ? `^agent_type=${typeFilter}` : '';
      if (args.active !== undefined) {
        const cfgs = await withAiaPlugin(() => client.queryRecords({
          table: 'sn_aia_agent_config',
          query: `active=${args.active}`,
          limit: args.limit || 25,
          fields: 'agent',
        }));
        const ids = cfgs.records.map((c: any) => refValue(c.agent)).filter(Boolean);
        agents = ids.length
          ? (await client.queryRecords({ table: 'sn_aia_agent', query: `sys_idIN${ids.join(',')}${typeQ}`, limit: ids.length, fields: agentFields })).records
          : [];
      } else {
        agents = (await withAiaPlugin(() => client.queryRecords({ table: 'sn_aia_agent', ...(typeQ ? { query: typeQ.slice(1) } : {}), limit: args.limit || 25, fields: agentFields }))).records;
      }
      const activeById = new Map<string, string>();
      if (agents.length) {
        const cfgs = await client.queryRecords({
          table: 'sn_aia_agent_config',
          query: `agentIN${agents.map((a: any) => a.sys_id).join(',')}`,
          limit: agents.length,
          fields: 'agent,active',
        });
        for (const c of cfgs.records as any[]) activeById.set(refValue(c.agent), String(c.active));
      }
      const short = (v: unknown) => { const t = String(v ?? ''); return t.length > 240 ? t.slice(0, 240) + '...' : t; };
      const records = agents.map((a: any) => ({ ...a, ...(a.description !== undefined ? { description: short(a.description) } : {}), active: activeById.get(String(a.sys_id)) ?? null }));
      return { count: records.length, agents: records, note: 'Descriptions are shortened. get_ai_agent returns the full agent, its instructions, tools and versions.' };
    }

    case 'get_ai_agent': {
      if (!args.sys_id) throw new ServiceNowError('sys_id is required', 'INVALID_REQUEST');

      const agent = await withAiaPlugin(() => client.getRecord('sn_aia_agent', args.sys_id));
      const agentSysId = String(agent.sys_id);
      const [config, tools, versions] = await Promise.all([
        client.queryRecords({ table: 'sn_aia_agent_config', query: `agent=${agentSysId}`, limit: 1 }),
        client.queryRecords({ table: 'sn_aia_agent_tool_m2m', query: `agent=${agentSysId}`, limit: 100, fields: 'sys_id,name,tool,active,execution_mode,description' }),
        client.queryRecords({ table: 'sn_aia_version', query: `target_id=${agentSysId}`, limit: 20, orderBy: '-version_number', fields: 'sys_id,version_name,version_number,state,sys_updated_on' }),
      ]);
      // Agent execute ACLs are type gen_ai_agent and named after the agent's internal_name.
      const aclResp = (agent as any).internal_name
        ? await client.queryRecords({
            table: 'sys_security_acl',
            query: `type.name=gen_ai_agent^name=${(agent as any).internal_name}`,
            limit: 20,
            fields: 'sys_id,name,type,operation,active,decision_type,description',
          })
        : { count: 0, records: [] };

      return {
        agent: { ...agent, active: config.records[0] ? (config.records[0] as any).active : null },
        config: config.records[0] ?? null,
        tools: tools.records,
        versions: versions.records,
        acls: aclResp.records,
        acl_count: aclResp.count,
      };
    }

    case 'create_agentic_workflow': {
      requireNowAssist();
      requireWrite();
      if (!args.name) throw new ServiceNowError('name is required', 'INVALID_REQUEST');
      if (!args.description) throw new ServiceNowError('description is required', 'INVALID_REQUEST');
      if (!args.agent_sys_id) throw new ServiceNowError('agent_sys_id is required', 'INVALID_REQUEST');
      if (!args.steps || !Array.isArray(args.steps)) {
        throw new ServiceNowError('steps must be an array', 'INVALID_REQUEST');
      }

      // Same record model as the now-sdk AiAgenticWorkflow API: sn_aia_usecase with a team of
      // agents (sn_aia_team + sn_aia_team_member), instructions on sn_aia_version, and the active
      // flag on sn_aia_usecase_config_override. Steps become the version's instructions.
      await withAiaPlugin(() => client.getRecord('sn_aia_agent', args.agent_sys_id, 'sys_id'));
      const instructions = (args.steps as any[]).map((st, i) => {
        const inputs = st.inputs && Object.keys(st.inputs).length ? ` with inputs ${JSON.stringify(st.inputs)}` : '';
        const cond = st.condition ? ` (only when ${st.condition})` : '';
        return `${i + 1}. ${st.name}: ${st.action}${inputs}${cond}`;
      }).join('\n');

      const team = await client.createRecord('sn_aia_team', { name: `${args.name} Team`, description: args.description });
      const teamMember = await client.createRecord('sn_aia_team_member', { team: String(team.sys_id), agent: args.agent_sys_id, memory_scope: 'global' });
      const record = await client.createRecord('sn_aia_usecase', {
        name: args.name,
        description: args.description,
        team: String(team.sys_id),
        record_type: 'custom',
        execution_mode: args.execution_mode === 'autopilot' ? 'autopilot' : 'copilot',
        ...(args.trigger_conditions ? { condition: args.trigger_conditions } : {}),
      });
      const usecaseSysId = String(record.sys_id);
      const version = await ensureVersion(client, 'sn_aia_usecase', usecaseSysId, instructions);
      const existingOverride = await client.queryRecords({ table: 'sn_aia_usecase_config_override', query: `usecase_configuration=${usecaseSysId}`, limit: 1, fields: 'sys_id' });
      const configOverride = existingOverride.count
        ? await client.updateRecord('sn_aia_usecase_config_override', String(existingOverride.records[0].sys_id), { active: 'true' })
        : await client.createRecord('sn_aia_usecase_config_override', { usecase_configuration: usecaseSysId, active: 'true' });

      let acl: any;
      let aclError: string | undefined;
      try {
        acl = await createExecuteAcl(client, 'gen_ai_workflow', record, `Execute ACL for agentic workflow: ${args.name}`);
      } catch (e) {
        aclError = (e instanceof Error ? e.message : String(e)).split('\n')[0];
      }

      return {
        message: 'Agentic workflow created',
        workflow: record,
        team,
        team_members: [teamMember],
        version,
        config_override: configOverride,
        ...(acl ? { acl } : {}),
        ...(aclError ? { acl_error: `Workflow created, but its execute ACL was not: ${aclError}. Create it in AI Agent Studio or with the security_admin role.` } : {}),
      };
    }

    default:
      return null;
  }
}

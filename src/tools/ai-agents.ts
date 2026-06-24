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
          capabilities: { type: 'array', items: { type: 'string' }, description: 'List of capability identifiers the agent supports' },
          auto_generate_acls: { type: 'boolean', description: 'Automatically create ACL records for the agent (default true)' },
        },
        required: ['name', 'description', 'capabilities'],
      },
    },
    {
      name: 'list_ai_agents',
      description: 'List AI agent definitions',
      inputSchema: {
        type: 'object',
        properties: {
          active: { type: 'boolean', description: 'Filter by active status' },
          limit: { type: 'number', description: 'Max records to return (default 25)' },
        },
        required: [],
      },
    },
    {
      name: 'get_ai_agent',
      description: 'Get an AI agent definition and its related ACLs',
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
        },
        required: ['name', 'description', 'agent_sys_id', 'steps'],
      },
    },
  ];
}

const AI_AGENT_TOOL_NAMES = new Set([
  'create_ai_agent', 'list_ai_agents', 'get_ai_agent', 'create_agentic_workflow',
]);

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

      const agentData: Record<string, any> = {
        name: args.name,
        description: args.description,
        capabilities: args.capabilities.join(','),
        active: true,
      };

      const agentRecord = await client.createRecord('sys_ai_agent', agentData);
      const agentSysId = String(agentRecord.sys_id);
      const autoAcls = args.auto_generate_acls !== false;
      const createdAcls: any[] = [];

      if (autoAcls) {
        // Create read ACL for the agent
        const readAcl = await client.createRecord('sys_security_acl', {
          name: `${args.name} - Read`,
          type: 'record',
          operation: 'read',
          admin_overrides: true,
          active: true,
          description: `Auto-generated read ACL for AI agent: ${args.name}`,
          condition: `sys_ai_agent=${agentSysId}`,
        });
        createdAcls.push(readAcl);

        // Create write ACL for the agent
        const writeAcl = await client.createRecord('sys_security_acl', {
          name: `${args.name} - Write`,
          type: 'record',
          operation: 'write',
          admin_overrides: true,
          active: true,
          description: `Auto-generated write ACL for AI agent: ${args.name}`,
          condition: `sys_ai_agent=${agentSysId}`,
        });
        createdAcls.push(writeAcl);
      }

      return {
        message: 'AI agent created',
        agent: agentRecord,
        acls_created: createdAcls.length,
        acls: createdAcls,
      };
    }

    case 'list_ai_agents': {
      const parts: string[] = [];
      if (args.active !== undefined) parts.push(`active=${args.active}`);
      const query = parts.length > 0 ? parts.join('^') : undefined;

      const resp = await client.queryRecords({
        table: 'sys_ai_agent',
        query,
        limit: args.limit || 25,
        fields: 'sys_id,name,description,capabilities,active,sys_updated_on',
      });
      return { count: resp.count, agents: resp.records };
    }

    case 'get_ai_agent': {
      if (!args.sys_id) throw new ServiceNowError('sys_id is required', 'INVALID_REQUEST');

      const agent = await client.getRecord('sys_ai_agent', args.sys_id);
      const agentSysId = String(agent.sys_id);

      // Fetch related ACLs
      const aclResp = await client.queryRecords({
        table: 'sys_security_acl',
        query: `conditionLIKEsys_ai_agent=${agentSysId}`,
        limit: 20,
        fields: 'sys_id,name,type,operation,active,description',
      });

      return { agent, acls: aclResp.records, acl_count: aclResp.count };
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

      const workflowData: Record<string, any> = {
        name: args.name,
        description: args.description,
        agent: args.agent_sys_id,
        steps: JSON.stringify(args.steps),
        active: true,
      };
      if (args.trigger_conditions) workflowData.trigger_conditions = args.trigger_conditions;

      const record = await client.createRecord('sys_ai_agentic_workflow', workflowData);
      return { message: 'Agentic workflow created', workflow: record };
    }

    default:
      return null;
  }
}

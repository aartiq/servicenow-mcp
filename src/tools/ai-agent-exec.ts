/**
 * AI Agent (Now Assist AI Agents) execution observability. Read-only: Tier 0.
 * Strategic for an MCP product — surface how ServiceNow's own agents ran.
 *
 * Tables (Now Assist AI Agents, sn_aia scope; availability depends on release/plugins):
 *   sn_aia_execution_plan       — agent execution plans/runs
 *   sn_aia_execution_task       — tasks/tool calls within a plan (execution_plan, order)
 *   sn_aia_usecase              — AI Agent Studio use cases
 */
import type { ServiceNowClient } from '../servicenow/client.js';
import { ServiceNowError } from '../utils/errors.js';

export function getAiAgentExecToolDefinitions() {
  return [
    {
      name: 'list_ai_agent_executions',
      description: 'List recent Now Assist AI Agent execution plans (sn_aia_execution_plan)',
      inputSchema: {
        type: 'object',
        properties: {
          status: { type: 'string', description: 'Filter by execution status' },
          query: { type: 'string', description: 'Encoded query for additional filtering' },
          limit: { type: 'number', description: 'Max records (default 25)' },
        },
        required: [],
      },
    },
    {
      name: 'get_ai_agent_execution',
      description: 'Get an AI Agent execution plan with its steps/tool calls (sn_aia_execution_plan + sn_aia_execution_task)',
      inputSchema: {
        type: 'object',
        properties: {
          sys_id: { type: 'string', description: 'sys_id of the execution plan' },
        },
        required: ['sys_id'],
      },
    },
    {
      name: 'list_agent_use_cases',
      description: 'List AI Agent Studio use cases (sn_aia_usecase) and their configuration',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search use cases by name' },
          limit: { type: 'number', description: 'Max records (default 50)' },
        },
        required: [],
      },
    },
  ];
}

export async function executeAiAgentExecToolCall(
  client: ServiceNowClient,
  name: string,
  args: Record<string, any>,
): Promise<any> {
  switch (name) {
    case 'list_ai_agent_executions': {
      const parts: string[] = [];
      if (args.status) parts.push(`status=${args.status}`);
      if (args.query) parts.push(args.query);
      return await client.queryRecords({
        table: 'sn_aia_execution_plan',
        query: parts.join('^') + (parts.length ? '^' : '') + 'ORDERBYDESCsys_created_on',
        limit: args.limit ?? 25,
      });
    }
    case 'get_ai_agent_execution': {
      if (!args.sys_id) throw new ServiceNowError('sys_id is required', 'INVALID_REQUEST');
      const plan = await client.getRecord('sn_aia_execution_plan', args.sys_id);
      const steps = await client
        .queryRecords({ table: 'sn_aia_execution_task', query: `execution_plan=${args.sys_id}^ORDERBYorder`, limit: 200 })
        .catch(() => ({ records: [] }));
      return { execution_plan: plan, steps: (steps as any).records };
    }
    case 'list_agent_use_cases': {
      const query = args.query ? `nameCONTAINS${args.query}` : '';
      return await client.queryRecords({ table: 'sn_aia_usecase', query, limit: args.limit ?? 50 });
    }
    default:
      return null;
  }
}

/**
 * Flow Designer tools — list, inspect, trigger, and monitor flows and subflows.
 * Read tools: Tier 0. Trigger/create tools: Tier 1 (WRITE_ENABLED=true).
 */
import type { ServiceNowClient } from '../servicenow/client.js';
import { ServiceNowError } from '../utils/errors.js';
import { requireWrite, requireScripting } from '../utils/permissions.js';

export function getFlowToolDefinitions() {
  return [
    {
      name: 'list_flows',
      description: 'List Flow Designer flows with optional filter by name, category, or active status',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search flows by name or description' },
          active: { type: 'boolean', description: 'Filter to active flows only (default true)' },
          category: { type: 'string', description: 'Filter by category (e.g., "ITSM", "HR", "Security")' },
          limit: { type: 'number', description: 'Max records to return (default 50)' },
        },
        required: [],
      },
    },
    {
      name: 'get_flow',
      description: 'Get full details of a Flow Designer flow including its actions and trigger',
      inputSchema: {
        type: 'object',
        properties: {
          name_or_sysid: { type: 'string', description: 'Flow name or sys_id' },
        },
        required: ['name_or_sysid'],
      },
    },
    {
      name: 'trigger_flow',
      description: 'Trigger a Flow Designer flow with optional input parameters (requires WRITE_ENABLED=true)',
      inputSchema: {
        type: 'object',
        properties: {
          flow_sys_id: { type: 'string', description: 'sys_id of the flow to trigger' },
          inputs: { type: 'object', description: 'Key-value pairs for flow input variables' },
        },
        required: ['flow_sys_id'],
      },
    },
    {
      name: 'get_flow_execution',
      description: 'Get the status and details of a specific flow execution',
      inputSchema: {
        type: 'object',
        properties: {
          execution_sysid: { type: 'string', description: 'sys_id of the flow execution to inspect' },
        },
        required: ['execution_sysid'],
      },
    },
    {
      name: 'list_flow_executions',
      description: 'List recent executions of a flow with status (completed, error, running)',
      inputSchema: {
        type: 'object',
        properties: {
          flow_sys_id: { type: 'string', description: 'sys_id of the parent flow' },
          status: { type: 'string', description: 'Filter by status: running, complete, error, cancelled' },
          limit: { type: 'number', description: 'Max records to return (default 25)' },
        },
        required: ['flow_sys_id'],
      },
    },
    {
      name: 'list_subflows',
      description: 'List available subflows that can be reused across flows',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search subflows by name' },
          active: { type: 'boolean', description: 'Filter to active subflows only (default true)' },
          limit: { type: 'number', description: 'Max records to return (default 50)' },
        },
        required: [],
      },
    },
    {
      name: 'get_subflow',
      description: 'Get full details of a subflow including its inputs, outputs, and actions',
      inputSchema: {
        type: 'object',
        properties: {
          name_or_sysid: { type: 'string', description: 'Subflow name or sys_id' },
        },
        required: ['name_or_sysid'],
      },
    },
    {
      name: 'list_action_instances',
      description: 'List reusable Flow Designer action instances available in the environment',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search actions by name or category' },
          category: { type: 'string', description: 'Filter by action category (e.g., "ServiceNow Core", "Integrations")' },
          limit: { type: 'number', description: 'Max records to return (default 50)' },
        },
        required: [],
      },
    },
    {
      name: 'get_process_automation',
      description: 'Get details of a Process Automation Designer playbook or process',
      inputSchema: {
        type: 'object',
        properties: {
          name_or_sysid: { type: 'string', description: 'Playbook or process name or sys_id' },
        },
        required: ['name_or_sysid'],
      },
    },
    {
      name: 'list_process_automations',
      description: 'List Process Automation Designer playbooks and processes',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search by name or description' },
          active: { type: 'boolean', description: 'Filter to active processes only (default true)' },
          limit: { type: 'number', description: 'Max records to return (default 50)' },
        },
        required: [],
      },
    },
    // ─── Flow Authoring ───────────────────────────────────────────────
    {
      name: 'create_flow',
      description: 'Create a new Flow Designer flow. **[Write]**',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Flow name' },
          description: { type: 'string', description: 'Flow description' },
          trigger_type: { type: 'string', description: 'Trigger type: record, schedule, inbound_email, rest (default record)' },
          trigger_table: { type: 'string', description: 'Trigger table (for record triggers)' },
          scope: { type: 'string', description: 'Application scope' },
        },
        required: ['name'],
      },
    },
    {
      name: 'create_subflow',
      description: 'Create a new reusable subflow. **[Write]**',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Subflow name' },
          description: { type: 'string', description: 'Subflow description' },
          inputs: { type: 'array', items: { type: 'object' }, description: 'Input variable definitions [{name, type, mandatory}]' },
          scope: { type: 'string', description: 'Application scope' },
        },
        required: ['name'],
      },
    },
    {
      name: 'create_flow_action',
      description: 'Create a custom Flow Designer action. **[Scripting]**',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Action name' },
          description: { type: 'string', description: 'Action description' },
          inputs: { type: 'array', items: { type: 'object' }, description: 'Input definitions [{name, type, mandatory}]' },
          outputs: { type: 'array', items: { type: 'object' }, description: 'Output definitions [{name, type}]' },
          script: { type: 'string', description: 'Action script body' },
        },
        required: ['name'],
      },
    },
    {
      name: 'publish_flow',
      description: 'Publish (activate) a draft flow or subflow. **[Write]**',
      inputSchema: {
        type: 'object',
        properties: {
          flow_sys_id: { type: 'string', description: 'Flow or subflow sys_id to publish' },
          type: { type: 'string', description: 'Type: flow or subflow (default flow)' },
        },
        required: ['flow_sys_id'],
      },
    },
    {
      name: 'test_flow',
      description: 'Execute a flow in test mode with sample inputs. **[Write]**',
      inputSchema: {
        type: 'object',
        properties: {
          flow_sys_id: { type: 'string', description: 'Flow sys_id to test' },
          test_inputs: { type: 'object', description: 'Test input values' },
        },
        required: ['flow_sys_id'],
      },
    },
    {
      name: 'get_flow_error_log',
      description: 'Get detailed error logs for failed flow executions',
      inputSchema: {
        type: 'object',
        properties: {
          flow_sys_id: { type: 'string', description: 'Flow sys_id' },
          days: { type: 'number', description: 'Look-back period in days (default 7)' },
          limit: { type: 'number', description: 'Max records (default 25)' },
        },
        required: ['flow_sys_id'],
      },
    },
  ];
}

export async function executeFlowToolCall(
  client: ServiceNowClient,
  name: string,
  args: Record<string, any>
): Promise<any> {
  switch (name) {
    case 'list_flows': {
      const parts: string[] = [];
      if (args.active !== false) parts.push('active=true');
      if (args.category) parts.push(`category=${args.category}`);
      if (args.query) parts.push(`nameCONTAINS${args.query}^ORdescriptionCONTAINS${args.query}`);
      return await client.queryRecords({ table: 'sys_hub_flow', query: parts.join('^') || '', limit: args.limit ?? 50 });
    }
    case 'get_flow': {
      if (!args.name_or_sysid) throw new ServiceNowError('name_or_sysid is required', 'INVALID_REQUEST');
      if (/^[0-9a-f]{32}$/i.test(args.name_or_sysid)) {
        return await client.getRecord('sys_hub_flow', args.name_or_sysid);
      }
      const resp = await client.queryRecords({ table: 'sys_hub_flow', query: `nameCONTAINS${args.name_or_sysid}`, limit: 1 });
      if (resp.count === 0) throw new ServiceNowError(`Flow not found: ${args.name_or_sysid}`, 'NOT_FOUND');
      return resp.records[0];
    }
    case 'trigger_flow': {
      requireWrite();
      if (!args.flow_sys_id) throw new ServiceNowError('flow_sys_id is required', 'INVALID_REQUEST');
      const payload = { sys_id: args.flow_sys_id, inputs: args.inputs ?? {} };
      const result = await client.createRecord('sys_hub_flow_trigger', payload);
      return { ...result, summary: `Triggered flow ${args.flow_sys_id}` };
    }
    case 'get_flow_execution': {
      if (!args.execution_sysid) throw new ServiceNowError('execution_sysid is required', 'INVALID_REQUEST');
      return await client.getRecord('sys_flow_context', args.execution_sysid);
    }
    case 'list_flow_executions': {
      if (!args.flow_sys_id) throw new ServiceNowError('flow_sys_id is required', 'INVALID_REQUEST');
      const parts = [`flow=${args.flow_sys_id}`];
      if (args.status) parts.push(`status=${args.status}`);
      return await client.queryRecords({ table: 'sys_flow_context', query: parts.join('^'), limit: args.limit ?? 25 });
    }
    case 'list_subflows': {
      const parts: string[] = [];
      if (args.active !== false) parts.push('active=true');
      if (args.query) parts.push(`nameCONTAINS${args.query}`);
      return await client.queryRecords({ table: 'sys_hub_subflow', query: parts.join('^') || '', limit: args.limit ?? 50 });
    }
    case 'get_subflow': {
      if (!args.name_or_sysid) throw new ServiceNowError('name_or_sysid is required', 'INVALID_REQUEST');
      if (/^[0-9a-f]{32}$/i.test(args.name_or_sysid)) {
        return await client.getRecord('sys_hub_subflow', args.name_or_sysid);
      }
      const resp = await client.queryRecords({ table: 'sys_hub_subflow', query: `nameCONTAINS${args.name_or_sysid}`, limit: 1 });
      if (resp.count === 0) throw new ServiceNowError(`Subflow not found: ${args.name_or_sysid}`, 'NOT_FOUND');
      return resp.records[0];
    }
    case 'list_action_instances': {
      const parts: string[] = [];
      if (args.category) parts.push(`category=${args.category}`);
      if (args.query) parts.push(`nameCONTAINS${args.query}`);
      return await client.queryRecords({ table: 'sys_hub_action_instance', query: parts.join('^') || '', limit: args.limit ?? 50 });
    }
    case 'get_process_automation': {
      if (!args.name_or_sysid) throw new ServiceNowError('name_or_sysid is required', 'INVALID_REQUEST');
      if (/^[0-9a-f]{32}$/i.test(args.name_or_sysid)) {
        return await client.getRecord('pa_process', args.name_or_sysid);
      }
      const resp = await client.queryRecords({ table: 'pa_process', query: `nameCONTAINS${args.name_or_sysid}`, limit: 1 });
      if (resp.count === 0) throw new ServiceNowError(`Process automation not found: ${args.name_or_sysid}`, 'NOT_FOUND');
      return resp.records[0];
    }
    case 'list_process_automations': {
      const parts: string[] = [];
      if (args.active !== false) parts.push('active=true');
      if (args.query) parts.push(`nameCONTAINS${args.query}^ORdescriptionCONTAINS${args.query}`);
      return await client.queryRecords({ table: 'pa_process', query: parts.join('^') || '', limit: args.limit ?? 50 });
    }
    case 'create_flow': {
      requireWrite();
      if (!args.name) throw new ServiceNowError('name is required', 'INVALID_REQUEST');
      const result = await client.createRecord('sys_hub_flow', { name: args.name, active: 'false', ...(args.description ? { description: args.description } : {}), ...(args.trigger_type ? { trigger_type: args.trigger_type } : {}), ...(args.trigger_table ? { trigger_table: args.trigger_table } : {}), ...(args.scope ? { sys_scope: args.scope } : {}) });
      return { action: 'created', ...result };
    }
    case 'create_subflow': {
      requireWrite();
      if (!args.name) throw new ServiceNowError('name is required', 'INVALID_REQUEST');
      const result = await client.createRecord('sys_hub_subflow', { name: args.name, active: 'false', ...(args.description ? { description: args.description } : {}), ...(args.scope ? { sys_scope: args.scope } : {}) });
      return { action: 'created', ...result };
    }
    case 'create_flow_action': {
      requireScripting();
      if (!args.name) throw new ServiceNowError('name is required', 'INVALID_REQUEST');
      const result = await client.createRecord('sys_hub_action_type_definition', { name: args.name, ...(args.description ? { description: args.description } : {}), ...(args.script ? { script: args.script } : {}) });
      return { action: 'created', ...result };
    }
    case 'publish_flow': {
      requireWrite();
      if (!args.flow_sys_id) throw new ServiceNowError('flow_sys_id is required', 'INVALID_REQUEST');
      const table = args.type === 'subflow' ? 'sys_hub_subflow' : 'sys_hub_flow';
      const result = await client.updateRecord(table, args.flow_sys_id, { active: 'true' });
      return { action: 'published', ...result };
    }
    case 'test_flow': {
      requireWrite();
      if (!args.flow_sys_id) throw new ServiceNowError('flow_sys_id is required', 'INVALID_REQUEST');
      const result = await client.createRecord('sys_hub_flow_trigger', { sys_id: args.flow_sys_id, inputs: args.test_inputs ?? {}, test_mode: 'true' });
      return { action: 'test_triggered', ...result };
    }
    case 'get_flow_error_log': {
      if (!args.flow_sys_id) throw new ServiceNowError('flow_sys_id is required', 'INVALID_REQUEST');
      const days = args.days || 7;
      const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 19).replace('T', ' ');
      return await client.queryRecords({ table: 'sys_flow_context', query: `flow=${args.flow_sys_id}^status=error^sys_created_on>=${since}`, limit: args.limit ?? 25 });
    }
    default:
      return null;
  }
}

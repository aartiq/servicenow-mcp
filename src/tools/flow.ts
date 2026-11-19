/**
 * Flow Designer tools — list, inspect, trigger, and monitor flows and subflows.
 * Read tools: Tier 0. Trigger/create tools: Tier 1 (WRITE_ENABLED=true).
 */
import type { ServiceNowClient } from '../servicenow/client.js';
import { ServiceNowError } from '../utils/errors.js';
import { requireWrite, requireScripting, isScriptingEnabled } from '../utils/permissions.js';

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
      description: 'Trigger a published Flow Designer flow or subflow in the background with optional inputs, via the server-side sn_fd.FlowAPI runner (requires WRITE_ENABLED=true and SCRIPTING_ENABLED=true; ServiceNow has no REST endpoint for this)',
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
      description: 'List Flow Designer action instances. Pass flow_id to scope to a single flow\'s steps (recommended); otherwise lists across the environment.',
      inputSchema: {
        type: 'object',
        properties: {
          flow_id: { type: 'string', description: 'Parent flow sys_id (sys_hub_flow). Returns only that flow\'s action instances.' },
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
      description: 'Publish a draft flow or subflow (compiles and activates it via sn_fd.FlowAPI.publish; needs SCRIPTING_ENABLED). **[Write]**',
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
      name: 'update_flow',
      description:
        'Update a flow or subflow\'s METADATA only (activate/deactivate, name, description, run-as). **[Write]** ' +
        'NOTE: this cannot safely insert or edit flow STEPS. Flow Designer executes a compiled snapshot, and ' +
        'writing action-instance rows over REST does not recompile the flow, which would desync/corrupt it. ' +
        'Edit steps in the Flow Designer UI.',
      inputSchema: {
        type: 'object',
        properties: {
          flow_sys_id: { type: 'string', description: 'Flow or subflow sys_id' },
          type: { type: 'string', description: 'Type: flow or subflow (default flow)' },
          active: { type: 'boolean', description: 'Activate (true) or deactivate (false)' },
          name: { type: 'string', description: 'New name' },
          description: { type: 'string', description: 'New description' },
          run_as: { type: 'string', description: 'run_as value (e.g. user_who_triggers, system_user)' },
        },
        required: ['flow_sys_id'],
      },
    },
    {
      name: 'test_flow',
      description: 'Run a published flow or subflow synchronously (foreground) with sample inputs and return its context id and outputs (needs SCRIPTING_ENABLED). **[Write]**',
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

function requireFlowScripting(what: string): void {
  if (!isScriptingEnabled()) {
    throw new ServiceNowError(
      `${what} has no REST endpoint in ServiceNow; it runs through the server-side sn_fd.FlowAPI, which NowAIKit calls as a one-time server script. Set SCRIPTING_ENABLED=true (with WRITE_ENABLED=true).`,
      'SCRIPTING_NOT_ENABLED',
    );
  }
}

/** Run a published flow/subflow through sn_fd.FlowAPI (background for trigger, foreground for test). */
async function runFlow(client: ServiceNowClient, flowSysId: string, inputs: Record<string, any>, foreground: boolean): Promise<any> {
  requireFlowScripting('Running a flow');
  const script =
    `var gr = new GlideRecord('sys_hub_flow');\n` +
    `if (!gr.get(${JSON.stringify(String(flowSysId))})) throw 'Flow not found: ${String(flowSysId).replace(/[^0-9a-zA-Z]/g, '')}';\n` +
    `var name = gr.sys_scope.scope + '.' + gr.getValue('internal_name');\n` +
    `var type = gr.getValue('type') || 'flow';\n` +
    `var runner = sn_fd.FlowAPI.getRunner();\n` +
    `runner = (type == 'subflow') ? runner.subflow(name) : (type == 'action' ? runner.action(name) : runner.flow(name));\n` +
    `var res = runner.${foreground ? 'inForeground()' : 'inBackground()'}.withInputs(${JSON.stringify(inputs)}).run();\n` +
    `var outputs = null; try { outputs = JSON.parse(JSON.stringify(res.getOutputs())); } catch (e) {}\n` +
    `return { flow: name, type: type, context_id: '' + res.getContextId(), outputs: outputs };`;
  const exec = await client.executeScript(script);
  if (exec && exec.ok === false) {
    const msg = String(exec.error || '');
    throw new ServiceNowError(`Flow run failed: ${msg}${/not been published/i.test(msg) ? ' (publish it first with publish_flow)' : ''}`, 'FLOW_RUN_FAILED');
  }
  return exec?.result ?? exec;
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
      const result = await runFlow(client, args.flow_sys_id, args.inputs ?? {}, false);
      return { ...result, summary: `Triggered ${result.type} ${result.flow} (context ${result.context_id})` };
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
      return await client.queryRecords({
        table: 'sys_hub_flow',
        query: ['type=subflow', ...parts].join('^'),
        limit: args.limit ?? 50,
        fields: 'sys_id,name,internal_name,description,active,status,category,run_as,sys_scope,sys_updated_on',
      });
    }
    case 'get_subflow': {
      if (!args.name_or_sysid) throw new ServiceNowError('name_or_sysid is required', 'INVALID_REQUEST');
      if (/^[0-9a-f]{32}$/i.test(args.name_or_sysid)) {
        const rec = await client.getRecord('sys_hub_flow', args.name_or_sysid);
        if ((rec as any).type && (rec as any).type !== 'subflow') throw new ServiceNowError(`${args.name_or_sysid} is a ${(rec as any).type}, not a subflow. Use get_flow for flows.`, 'INVALID_REQUEST');
        return rec;
      }
      const resp = await client.queryRecords({ table: 'sys_hub_flow', query: `type=subflow^nameCONTAINS${args.name_or_sysid}^ORinternal_name=${args.name_or_sysid}`, limit: 1 });
      if (resp.count === 0) throw new ServiceNowError(`Subflow not found: ${args.name_or_sysid}`, 'NOT_FOUND');
      return resp.records[0];
    }
    case 'list_action_instances': {
      const parts: string[] = [];
      if (args.flow_id) parts.push(`flow=${args.flow_id}`);
      if (args.category) parts.push(`category=${args.category}`);
      if (args.query) parts.push(`nameCONTAINS${args.query}`);
      return await client.queryRecords({ table: 'sys_hub_action_instance', query: parts.join('^') || '', limit: args.limit ?? 50, orderBy: 'order' });
    }
    case 'get_process_automation': {
      if (!args.name_or_sysid) throw new ServiceNowError('name_or_sysid is required', 'INVALID_REQUEST');
      if (/^[0-9a-f]{32}$/i.test(args.name_or_sysid)) {
        return await client.getRecord('sys_pd_process_definition', args.name_or_sysid);
      }
      const resp = await client.queryRecords({ table: 'sys_pd_process_definition', query: `nameCONTAINS${args.name_or_sysid}^ORlabelCONTAINS${args.name_or_sysid}`, limit: 1 });
      if (resp.count === 0) throw new ServiceNowError(`Process automation not found: ${args.name_or_sysid}`, 'NOT_FOUND');
      return resp.records[0];
    }
    case 'list_process_automations': {
      const parts: string[] = [];
      if (args.active !== false) parts.push('active=true');
      if (args.query) parts.push(`nameCONTAINS${args.query}^ORlabelCONTAINS${args.query}^ORdescriptionCONTAINS${args.query}`);
      return await client.queryRecords({
        table: 'sys_pd_process_definition',
        query: parts.join('^') || '',
        limit: args.limit ?? 50,
        fields: 'sys_id,name,label,description,active,status,process_type,execution_type,sys_scope,sys_updated_on',
      });
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
      const result = await client.createRecord('sys_hub_flow', { name: args.name, type: 'subflow', active: 'false', ...(args.description ? { description: args.description } : {}), ...(args.scope ? { sys_scope: args.scope } : {}) });
      return { action: 'created', ...result };
    }
    case 'create_flow_action': {
      requireScripting();
      if (!args.name) throw new ServiceNowError('name is required', 'INVALID_REQUEST');
      // sys_hub_action_type_definition has no script column (script steps are separate step instances),
      // so the action is created as a draft definition to finish in Flow Designer.
      const result = await client.createRecord('sys_hub_action_type_definition', { name: args.name, state: 'draft', active: 'true', access: 'public', ...(args.description ? { description: args.description } : {}) });
      return {
        action: 'created', ...result,
        ...(args.script || args.inputs || args.outputs ? { note: 'Inputs, outputs and the script step are not created over REST; add them in Flow Designer (Action Designer), then publish the action.' } : {}),
      };
    }
    case 'publish_flow': {
      requireWrite();
      if (!args.flow_sys_id) throw new ServiceNowError('flow_sys_id is required', 'INVALID_REQUEST');
      // Setting active=true on sys_hub_flow does NOT publish: Flow Designer runs a compiled snapshot.
      // The supported path is the server-side sn_fd.FlowAPI.publish(), run as a one-time server script.
      requireFlowScripting('Publishing a flow');
      const script =
        `var res = sn_fd.FlowAPI.publish(${JSON.stringify(String(args.flow_sys_id))});\n` +
        `var gr = new GlideRecord('sys_hub_flow'); gr.get(${JSON.stringify(String(args.flow_sys_id))});\n` +
        `var parsed = null; try { parsed = JSON.parse(res); } catch (e) {}\n` +
        `return { status: gr.getValue('status'), active: gr.getValue('active'), error: parsed ? (parsed.errorMessage || '') : '' };`;
      const exec = await client.executeScript(script);
      if (exec && exec.ok === false) throw new ServiceNowError(`Publish failed: ${exec.error}`, 'PUBLISH_FAILED');
      const out = exec?.result ?? {};
      if (out.error || out.status !== 'published') {
        throw new ServiceNowError(`Flow ${args.flow_sys_id} was not published${out.error ? `: ${out.error}` : ` (status ${out.status})`}`, 'PUBLISH_FAILED');
      }
      return { action: 'published', sys_id: args.flow_sys_id, status: out.status, active: out.active };
    }
    case 'update_flow': {
      requireWrite();
      if (!args.flow_sys_id) throw new ServiceNowError('flow_sys_id is required', 'INVALID_REQUEST');
      const table = 'sys_hub_flow'; // flows and subflows share sys_hub_flow (type=flow|subflow)
      // Metadata-only, safe fields. Step editing is intentionally not supported (see the
      // tool description): it would desync the compiled flow snapshot.
      const fields: Record<string, unknown> = {};
      if (args.active !== undefined) fields.active = args.active ? 'true' : 'false';
      if (args.name !== undefined) fields.name = args.name;
      if (args.description !== undefined) fields.description = args.description;
      if (args.run_as !== undefined) fields.run_as = args.run_as;
      if (Object.keys(fields).length === 0) throw new ServiceNowError('Nothing to update: provide active, name, description, or run_as.', 'INVALID_REQUEST');
      const result = await client.updateRecord(table, args.flow_sys_id, fields);
      return { action: 'updated', ...result };
    }
    case 'test_flow': {
      requireWrite();
      if (!args.flow_sys_id) throw new ServiceNowError('flow_sys_id is required', 'INVALID_REQUEST');
      const result = await runFlow(client, args.flow_sys_id, args.test_inputs ?? {}, true);
      return { action: 'test_executed', ...result };
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

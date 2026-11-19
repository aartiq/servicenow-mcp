/**
 * Decision Builder tools — author and inspect ServiceNow Decision Tables
 * (Decision Builder / Workflow Studio). Read tools: Tier 0. Create tools: Tier 1
 * (WRITE_ENABLED=true).
 *
 * Tables:
 *   sys_decision         — the Decision Table (metadata)
 *   sys_decision_input    — inputs to a decision (referenced by `model`)
 *   sys_decision_question — rows of a decision table, each with its answer (referenced by `decision_table`)
 */
import type { ServiceNowClient } from '../servicenow/client.js';
import { ServiceNowError } from '../utils/errors.js';
import { requireWrite } from '../utils/permissions.js';

export function getDecisionToolDefinitions() {
  return [
    {
      name: 'list_decision_tables',
      description: 'List Decision Builder decision tables (sys_decision), optionally filtered by name or active status',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search decision tables by name or description' },
          active: { type: 'boolean', description: 'Filter to active decision tables only' },
          limit: { type: 'number', description: 'Max records to return (default 50)' },
        },
        required: [],
      },
    },
    {
      name: 'get_decision_table',
      description: 'Get a decision table with its inputs and answer rows, by name or sys_id',
      inputSchema: {
        type: 'object',
        properties: {
          name_or_sysid: { type: 'string', description: 'Decision table name or sys_id' },
        },
        required: ['name_or_sysid'],
      },
    },
    {
      name: 'list_decision_inputs',
      description: 'List the inputs of a decision table',
      inputSchema: {
        type: 'object',
        properties: {
          decision_sys_id: { type: 'string', description: 'sys_id of the decision table (sys_decision)' },
        },
        required: ['decision_sys_id'],
      },
    },
    {
      name: 'list_decision_answers',
      description: 'List the answer/result rows of a decision table',
      inputSchema: {
        type: 'object',
        properties: {
          decision_sys_id: { type: 'string', description: 'sys_id of the decision table (sys_decision)' },
          limit: { type: 'number', description: 'Max records to return (default 100)' },
        },
        required: ['decision_sys_id'],
      },
    },
    {
      name: 'create_decision_table',
      description: 'Create a Decision Builder decision table (sys_decision). Requires WRITE_ENABLED=true',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Decision table name' },
          description: { type: 'string', description: 'Description of what the decision returns' },
          active: { type: 'boolean', description: 'Whether the decision table is active (default true)' },
          answer_table: { type: 'string', description: 'Table whose records are the answers (e.g. sys_user_group); needed before the decision can be used' },
          fields: { type: 'object', description: 'Additional sys_decision field values to set' },
        },
        required: ['name'],
      },
    },
    {
      name: 'create_decision_input',
      description: 'Add an input to a decision table (sys_decision_input). Requires WRITE_ENABLED=true',
      inputSchema: {
        type: 'object',
        properties: {
          decision_sys_id: { type: 'string', description: 'sys_id of the parent decision table (sys_decision)' },
          name: { type: 'string', description: 'Input name/label' },
          type: { type: 'string', description: 'Input data type (e.g., string, integer, reference, boolean)' },
          order: { type: 'number', description: 'Display order of the input' },
          fields: { type: 'object', description: 'Additional sys_decision_input field values to set' },
        },
        required: ['decision_sys_id', 'name'],
      },
    },
    {
      name: 'publish_decision_table',
      description: 'Publish a Decision Builder decision table — sets sys_decision.status to "published". Requires WRITE_ENABLED=true',
      inputSchema: {
        type: 'object',
        properties: {
          decision_sys_id: { type: 'string', description: 'sys_id of the decision table (sys_decision)' },
        },
        required: ['decision_sys_id'],
      },
    },
  ];
}

export async function executeDecisionToolCall(
  client: ServiceNowClient,
  name: string,
  args: Record<string, any>,
): Promise<any> {
  switch (name) {
    case 'list_decision_tables': {
      const parts: string[] = [];
      if (args.active !== undefined) parts.push(`active=${args.active ? 'true' : 'false'}`);
      if (args.query) parts.push(`nameCONTAINS${args.query}^ORdescriptionCONTAINS${args.query}`);
      return await client.queryRecords({ table: 'sys_decision', query: parts.join('^'), limit: args.limit ?? 50 });
    }
    case 'get_decision_table': {
      if (!args.name_or_sysid) throw new ServiceNowError('name_or_sysid is required', 'INVALID_REQUEST');
      let decision;
      if (/^[0-9a-f]{32}$/i.test(args.name_or_sysid)) {
        decision = await client.getRecord('sys_decision', args.name_or_sysid);
      } else {
        const resp = await client.queryRecords({ table: 'sys_decision', query: `nameCONTAINS${args.name_or_sysid}`, limit: 1 });
        if (resp.count === 0) throw new ServiceNowError(`Decision table not found: ${args.name_or_sysid}`, 'NOT_FOUND');
        decision = resp.records[0];
      }
      const sysId = (decision as any).sys_id;
      const inputs = await client.queryRecords({ table: 'sys_decision_input', query: `model=${sysId}`, limit: 100 }).catch(() => ({ records: [] }));
      const answers = await client.queryRecords({ table: 'sys_decision_question', query: `decision_table=${sysId}`, limit: 100, orderBy: 'order' }).catch(() => ({ records: [] }));
      return { decision, inputs: (inputs as any).records, answers: (answers as any).records };
    }
    case 'list_decision_inputs': {
      if (!args.decision_sys_id) throw new ServiceNowError('decision_sys_id is required', 'INVALID_REQUEST');
      return await client.queryRecords({ table: 'sys_decision_input', query: `model=${args.decision_sys_id}`, limit: 100 });
    }
    case 'list_decision_answers': {
      if (!args.decision_sys_id) throw new ServiceNowError('decision_sys_id is required', 'INVALID_REQUEST');
      // Each decision table row (sys_decision_question) holds its conditions and the answer it returns.
      return await client.queryRecords({
        table: 'sys_decision_question',
        query: `decision_table=${args.decision_sys_id}`,
        limit: args.limit ?? 100,
        orderBy: 'order',
        fields: 'sys_id,label,order,answer,default_answer,condition,active,decision_table',
      });
    }
    case 'create_decision_table': {
      requireWrite();
      if (!args.name) throw new ServiceNowError('name is required', 'INVALID_REQUEST');
      const payload = { name: args.name, label: args.name, description: args.description ?? '', active: args.active === false ? 'false' : 'true', ...(args.answer_table ? { answer_table: args.answer_table } : {}), ...(args.fields ?? {}) };
      const result = await client.createRecord('sys_decision', payload);
      return {
        ...result,
        summary: `Created decision table "${args.name}"`,
        ...(args.answer_table || args.fields?.answer_table ? {} : { note: 'No answer_table set: choose the answer table (update the record or Decision Builder) before adding rows.' }),
      };
    }
    case 'create_decision_input': {
      requireWrite();
      if (!args.decision_sys_id) throw new ServiceNowError('decision_sys_id is required', 'INVALID_REQUEST');
      if (!args.name) throw new ServiceNowError('name is required', 'INVALID_REQUEST');
      // sys_decision_input extends var_dictionary: the column is "element", the display name "label",
      // and the data type "internal_type" (there are no name/type columns).
      const element = String(args.name).trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'input';
      const payload: Record<string, any> = { model: args.decision_sys_id, element, label: args.name, column_label: args.name, internal_type: args.type ?? 'string', ...(args.fields ?? {}) };
      if (args.order !== undefined) payload.order = args.order;
      const result = await client.createRecord('sys_decision_input', payload);
      return { ...result, summary: `Added input "${args.name}" to decision ${args.decision_sys_id}` };
    }
    case 'publish_decision_table': {
      requireWrite();
      if (!args.decision_sys_id) throw new ServiceNowError('decision_sys_id is required', 'INVALID_REQUEST');
      // Verified on a live instance: sys_decision.status is a choice of draft|published.
      const result = await client.updateRecord('sys_decision', args.decision_sys_id, { status: 'published', enable_publishing: 'true' });
      return { ...result, summary: `Published decision table ${args.decision_sys_id}` };
    }
    default:
      return null;
  }
}

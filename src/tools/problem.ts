/**
 * Problem Management tools.
 * Read tools: Tier 0. Write tools: Tier 1 (WRITE_ENABLED=true).
 */
import type { ServiceNowClient } from '../servicenow/client.js';
import { ServiceNowError } from '../utils/errors.js';
import { isScriptingEnabled, requireWrite } from '../utils/permissions.js';

export function getProblemToolDefinitions() {
  return [
    {
      name: 'create_problem',
      description: 'Create a new problem record (requires WRITE_ENABLED=true)',
      inputSchema: {
        type: 'object',
        properties: {
          short_description: { type: 'string', description: 'Brief description of the problem' },
          description: { type: 'string', description: 'Detailed description' },
          assignment_group: { type: 'string', description: 'Assignment group name or sys_id' },
          priority: { type: 'number', description: '1=Critical, 2=High, 3=Moderate, 4=Low' },
        },
        required: ['short_description'],
      },
    },
    {
      name: 'get_problem',
      description: 'Get full details of a problem by number (PRB...) or sys_id',
      inputSchema: {
        type: 'object',
        properties: {
          number_or_sysid: { type: 'string', description: 'Problem number (PRB...) or sys_id' },
        },
        required: ['number_or_sysid'],
      },
    },
    {
      name: 'update_problem',
      description: 'Update fields on an existing problem (requires WRITE_ENABLED=true)',
      inputSchema: {
        type: 'object',
        properties: {
          sys_id: { type: 'string', description: 'System ID of the problem' },
          fields: { type: 'object', description: 'Key-value pairs to update' },
        },
        required: ['sys_id', 'fields'],
      },
    },
    {
      name: 'resolve_problem',
      description: 'Resolve a problem with root cause and resolution notes (requires WRITE_ENABLED=true)',
      inputSchema: {
        type: 'object',
        properties: {
          sys_id: { type: 'string', description: 'System ID of the problem' },
          root_cause: { type: 'string', description: 'Root cause of the problem' },
          resolution_notes: { type: 'string', description: 'How the problem was resolved' },
          resolution_code: { type: 'string', description: 'Resolution code (default fix_applied)' },
          assigned_to: { type: 'string', description: 'Assignee sys_id (the problem model needs one to leave New)' },
        },
        required: ['sys_id', 'root_cause', 'resolution_notes'],
      },
    },
  ];
}

export async function executeProblemToolCall(
  client: ServiceNowClient,
  name: string,
  args: Record<string, any>
): Promise<any> {
  switch (name) {
    case 'create_problem': {
      requireWrite();
      if (!args.short_description) throw new ServiceNowError('short_description is required', 'INVALID_REQUEST');
      const result = await client.createRecord('problem', args);
      const pSid = typeof result.sys_id === 'object' ? result.sys_id?.value : result.sys_id;
      const pUrl = pSid && typeof (client as any).recordUrl === 'function' ? (client as any).recordUrl('problem', pSid) : undefined;
      return { ...result, url: pUrl, summary: `Created problem ${result.number || pSid}` };
    }
    case 'get_problem': {
      if (!args.number_or_sysid) throw new ServiceNowError('number_or_sysid is required', 'INVALID_REQUEST');
      if (/^[0-9a-f]{32}$/i.test(args.number_or_sysid)) {
        return await client.getRecord('problem', args.number_or_sysid);
      }
      const resp = await client.queryRecords({ table: 'problem', query: `number=${args.number_or_sysid}^ORsys_id=${args.number_or_sysid}`, limit: 1 });
      if (resp.count === 0) throw new ServiceNowError(`Problem not found: ${args.number_or_sysid}`, 'NOT_FOUND');
      return resp.records[0];
    }
    case 'update_problem': {
      requireWrite();
      if (!args.sys_id || !args.fields) throw new ServiceNowError('sys_id and fields are required', 'INVALID_REQUEST');
      const result = await client.updateRecord('problem', args.sys_id, args.fields);
      return { ...result, summary: `Updated problem ${args.sys_id}` };
    }
    case 'resolve_problem': {
      requireWrite();
      if (!args.sys_id || !args.root_cause || !args.resolution_notes)
        throw new ServiceNowError('sys_id, root_cause, and resolution_notes are required', 'INVALID_REQUEST');
      // Problem state is governed by the problem model (New > Assess > Root Cause Analysis > Fix in
      // Progress > Resolved) and is read-only for direct Table API writes, so a single state=107 write is
      // silently ignored. Fill the fields each transition needs, then walk the model.
      const fields: Record<string, any> = {
        cause_notes: args.root_cause,
        fix_notes: args.resolution_notes,
        close_notes: args.resolution_notes,
        resolution_code: args.resolution_code || 'fix_applied',
      };
      if (args.assigned_to) fields.assigned_to = args.assigned_to;
      await client.updateRecord('problem', args.sys_id, fields);
      const path = ['102', '103', '104', '106'];
      const stateOf = async () => String((await client.getRecord('problem', args.sys_id, 'state') as any).state);
      let state = await stateOf();
      for (const step of path) {
        if (Number(step) <= Number(state) || state === '106' || state === '107') continue;
        await client.updateRecord('problem', args.sys_id, { state: step }).catch(() => undefined);
        state = await stateOf();
      }
      let method = 'table_api';
      if (state !== '106' && state !== '107' && isScriptingEnabled()) {
        method = 'server_script';
        await client.executeScript(
          // Reload the record for every step: the model checks each transition against the previous
          // state, which is stale on a reused GlideRecord after update().
          `var path = ${JSON.stringify(path)}, gr;\n` +
          `for (var i = 0; i < path.length; i++) {\n` +
          `  gr = new GlideRecord('problem');\n` +
          `  if (!gr.get(${JSON.stringify(args.sys_id)})) break;\n` +
          `  if (parseInt(path[i], 10) <= parseInt(gr.getValue('state'), 10)) continue;\n` +
          `  if (path[i] === '106') { var f = ${JSON.stringify(fields)}; for (var k in f) gr.setValue(k, f[k]); }\n` +
          `  gr.setValue('state', path[i]); gr.update();\n` +
          `}\n` +
          `return { ok: true };`,
        );
        state = await stateOf();
      }
      if (state !== '106' && state !== '107') {
        throw new ServiceNowError(
          `Problem ${args.sys_id} could not be moved to Resolved (it is in state ${state}). The problem model only allows ` +
          'New > Assess > Root Cause Analysis > Fix in Progress > Resolved with an assignee, cause notes and fix notes, and ' +
          'Table API state writes are blocked on this instance. Enable SCRIPTING_ENABLED so NowAIKit can run the transitions server-side, or resolve it in the UI.',
          'INVALID_STATE',
        );
      }
      const result = await client.getRecord('problem', args.sys_id);
      return { ...result, method, summary: `Resolved problem ${args.sys_id}` };
    }
    default:
      return null;
  }
}

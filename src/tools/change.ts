/**
 * Change Request Management tools.
 * Read tools: Tier 0. Write tools: Tier 1 (WRITE_ENABLED=true).
 */
import type { ServiceNowClient } from '../servicenow/client.js';
import { ServiceNowError } from '../utils/errors.js';
import { requireWrite } from '../utils/permissions.js';

export function getChangeToolDefinitions() {
  return [
    {
      name: 'create_change_request',
      description: 'Create a new change request (requires WRITE_ENABLED=true)',
      inputSchema: {
        type: 'object',
        properties: {
          short_description: { type: 'string', description: 'Brief description of the change' },
          description: { type: 'string', description: 'Detailed description and justification' },
          type: { type: 'string', description: 'Change type: "normal", "standard", "emergency"' },
          category: { type: 'string', description: 'Change category (e.g. "Software", "Hardware", "Network")' },
          risk: { type: 'string', description: 'Risk level: "1"=High, "2"=Medium, "3"=Low, "4"=Very Low' },
          impact: { type: 'string', description: 'Impact: "1"=High, "2"=Medium, "3"=Low' },
          priority: { type: 'string', description: 'Priority: "1"=Critical, "2"=High, "3"=Moderate, "4"=Low' },
          assignment_group: { type: 'string', description: 'Assignment group name or sys_id' },
          assigned_to: { type: 'string', description: 'Assignee username or sys_id' },
          start_date: { type: 'string', description: 'Planned start date (ISO: YYYY-MM-DD HH:MM:SS)' },
          end_date: { type: 'string', description: 'Planned end date (ISO: YYYY-MM-DD HH:MM:SS)' },
          implementation_plan: { type: 'string', description: 'Step-by-step implementation plan' },
          backout_plan: { type: 'string', description: 'Rollback plan if change fails' },
          test_plan: { type: 'string', description: 'Testing and validation steps' },
          cmdb_ci: { type: 'string', description: 'Affected CI sys_id' },
        },
        required: ['short_description', 'type'],
      },
    },
    {
      name: 'get_change_request',
      description: 'Get full details of a change request by number (CHG...) or sys_id',
      inputSchema: {
        type: 'object',
        properties: {
          number_or_sysid: { type: 'string', description: 'Change number (CHG...) or sys_id' },
        },
        required: ['number_or_sysid'],
      },
    },
    {
      name: 'update_change_request',
      description: 'Update fields on a change request (requires WRITE_ENABLED=true)',
      inputSchema: {
        type: 'object',
        properties: {
          sys_id: { type: 'string', description: 'System ID of the change request' },
          fields: { type: 'object', description: 'Key-value pairs to update' },
        },
        required: ['sys_id', 'fields'],
      },
    },
    {
      name: 'list_change_requests',
      description: 'List change requests with optional filtering by state or query',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Encoded query filter' },
          state: { type: 'string', description: 'Change state (e.g., "-5"=Requested, "-4"=Draft, "0"=Open)' },
          limit: { type: 'number', description: 'Max records (default: 10)' },
        },
        required: [],
      },
    },
    {
      name: 'submit_change_for_approval',
      description: 'Move a change request to "Requested" state for approval (requires WRITE_ENABLED=true)',
      inputSchema: {
        type: 'object',
        properties: {
          sys_id: { type: 'string', description: 'System ID of the change request' },
        },
        required: ['sys_id'],
      },
    },
    {
      name: 'close_change_request',
      description: 'Close a change request with close code and notes (requires WRITE_ENABLED=true)',
      inputSchema: {
        type: 'object',
        properties: {
          sys_id: { type: 'string', description: 'System ID of the change request' },
          close_code: { type: 'string', description: 'Close code (e.g., "successful", "unsuccessful")' },
          close_notes: { type: 'string', description: 'Closure notes' },
        },
        required: ['sys_id', 'close_code', 'close_notes'],
      },
    },
    {
      name: 'schedule_cab_meeting',
      description: '[Write] Schedule a Change Advisory Board (CAB) meeting',
      inputSchema: {
        type: 'object',
        properties: {
          change_id: { type: 'string', description: 'Change request number (CHG...) or sys_id' },
          date: { type: 'string', description: 'ISO date for the CAB meeting' },
          duration_minutes: { type: 'number', description: 'Meeting duration in minutes' },
          attendees: { type: 'string', description: 'Comma-separated group names' },
        },
        required: ['change_id', 'date'],
      },
    },
  ];
}

export async function executeChangeToolCall(
  client: ServiceNowClient,
  name: string,
  args: Record<string, any>
): Promise<any> {
  switch (name) {
    case 'create_change_request': {
      requireWrite();
      if (!args.short_description || !args.type)
        throw new ServiceNowError('short_description and type are required', 'INVALID_REQUEST');
      const data: Record<string, any> = {
        short_description: args.short_description,
        type: args.type,
      };
      if (args.description) data.description = args.description;
      if (args.category) data.category = args.category;
      if (args.risk) data.risk = args.risk;
      if (args.impact) data.impact = args.impact;
      if (args.priority) data.priority = args.priority;
      if (args.assignment_group) data.assignment_group = args.assignment_group;
      if (args.assigned_to) data.assigned_to = args.assigned_to;
      if (args.start_date) data.start_date = args.start_date;
      if (args.end_date) data.end_date = args.end_date;
      if (args.implementation_plan) data.implementation_plan = args.implementation_plan;
      if (args.backout_plan) data.backout_plan = args.backout_plan;
      if (args.test_plan) data.test_plan = args.test_plan;
      if (args.cmdb_ci) data.cmdb_ci = args.cmdb_ci;
      const result = await client.createRecord('change_request', data);
      return { ...result, summary: `Created change request: ${result.number || result.sys_id}` };
    }
    case 'get_change_request': {
      if (!args.number_or_sysid) throw new ServiceNowError('number_or_sysid is required', 'INVALID_REQUEST');
      if (/^[0-9a-f]{32}$/i.test(args.number_or_sysid)) {
        return await client.getRecord('change_request', args.number_or_sysid);
      }
      const resp = await client.queryRecords({ table: 'change_request', query: `number=${args.number_or_sysid}^ORsys_id=${args.number_or_sysid}`, limit: 1 });
      if (resp.count === 0) throw new ServiceNowError(`Change request not found: ${args.number_or_sysid}`, 'NOT_FOUND');
      return resp.records[0];
    }
    case 'update_change_request': {
      requireWrite();
      if (!args.sys_id || !args.fields) throw new ServiceNowError('sys_id and fields are required', 'INVALID_REQUEST');
      const result = await client.updateRecord('change_request', args.sys_id, args.fields);
      return { ...result, summary: `Updated change request ${args.sys_id}` };
    }
    case 'list_change_requests': {
      let query = args.query || '';
      if (args.state) query = query ? `${query}^state=${args.state}` : `state=${args.state}`;
      const resp = await client.queryRecords({ table: 'change_request', query: query || undefined, limit: args.limit || 10 });
      return { count: resp.count, records: resp.records };
    }
    case 'submit_change_for_approval': {
      requireWrite();
      if (!args.sys_id) throw new ServiceNowError('sys_id is required', 'INVALID_REQUEST');
      const result = await client.updateRecord('change_request', args.sys_id, { state: '-5' });
      return { ...result, summary: `Submitted change request ${args.sys_id} for approval` };
    }
    case 'close_change_request': {
      requireWrite();
      if (!args.sys_id || !args.close_code || !args.close_notes)
        throw new ServiceNowError('sys_id, close_code, and close_notes are required', 'INVALID_REQUEST');
      const result = await client.updateRecord('change_request', args.sys_id, {
        state: '3',
        close_code: args.close_code,
        close_notes: args.close_notes,
      });
      return { ...result, summary: `Closed change request ${args.sys_id}` };
    }
    case 'schedule_cab_meeting': {
      requireWrite();
      if (!args.change_id || !args.date)
        throw new ServiceNowError('change_id and date are required', 'INVALID_REQUEST');
      let sysId = args.change_id;
      if (!/^[0-9a-f]{32}$/i.test(args.change_id)) {
        const resp = await client.queryRecords({ table: 'change_request', query: `number=${args.change_id}^ORsys_id=${args.change_id}`, limit: 1 });
        if (resp.count === 0) throw new ServiceNowError(`Change request not found: ${args.change_id}`, 'NOT_FOUND');
        sysId = resp.records[0].sys_id;
      }
      const workNote = 'CAB meeting scheduled for ' + args.date
        + (args.duration_minutes ? ', duration: ' + args.duration_minutes + ' minutes' : '')
        + (args.attendees ? ', attendees: ' + args.attendees : '');
      const result = await client.updateRecord('change_request', sysId, {
        cab_date: args.date,
        cab_required: 'true',
        work_notes: workNote,
      });
      return { ...result, summary: `Scheduled CAB meeting for change ${args.change_id} on ${args.date}` };
    }
    default:
      return null;
  }
}

/**
 * Incident Management tools — full ITSM incident lifecycle.
 * Read tools: Tier 0. Write tools: Tier 1 (WRITE_ENABLED=true).
 */
import type { ServiceNowClient } from '../servicenow/client.js';
import { ServiceNowError } from '../utils/errors.js';
import { requireWrite } from '../utils/permissions.js';

export function getIncidentToolDefinitions() {
  return [
    {
      name: 'create_incident',
      description: 'Create a new incident record (requires WRITE_ENABLED=true)',
      inputSchema: {
        type: 'object',
        properties: {
          short_description: { type: 'string', description: 'Brief description of the issue' },
          urgency: { type: 'number', description: '1=High, 2=Medium, 3=Low' },
          impact: { type: 'number', description: '1=High, 2=Medium, 3=Low' },
          priority: { type: 'number', description: '1=Critical, 2=High, 3=Moderate, 4=Low' },
          description: { type: 'string', description: 'Detailed description' },
          assignment_group: { type: 'string', description: 'Assignment group name or sys_id' },
          caller_id: { type: 'string', description: 'Caller user name or sys_id' },
          category: { type: 'string', description: 'Incident category' },
          subcategory: { type: 'string', description: 'Incident subcategory' },
        },
        required: ['short_description'],
      },
    },
    {
      name: 'get_incident',
      description: 'Get full details of an incident by number (e.g. INC0012345) or sys_id',
      inputSchema: {
        type: 'object',
        properties: {
          number_or_sysid: { type: 'string', description: 'Incident number (INC...) or sys_id' },
        },
        required: ['number_or_sysid'],
      },
    },
    {
      name: 'update_incident',
      description: 'Update fields on an existing incident (requires WRITE_ENABLED=true)',
      inputSchema: {
        type: 'object',
        properties: {
          sys_id: { type: 'string', description: 'System ID of the incident' },
          fields: { type: 'object', description: 'Key-value pairs to update (e.g., {"state": "2", "urgency": "1"})' },
        },
        required: ['sys_id', 'fields'],
      },
    },
    {
      name: 'resolve_incident',
      description: 'Resolve an incident with resolution code and notes (requires WRITE_ENABLED=true)',
      inputSchema: {
        type: 'object',
        properties: {
          sys_id: { type: 'string', description: 'System ID of the incident' },
          resolution_code: { type: 'string', description: 'Resolution code (e.g., "Solved (Permanently)")' },
          resolution_notes: { type: 'string', description: 'Details of how the incident was resolved' },
        },
        required: ['sys_id', 'resolution_code', 'resolution_notes'],
      },
    },
    {
      name: 'close_incident',
      description: 'Close a resolved incident (requires WRITE_ENABLED=true)',
      inputSchema: {
        type: 'object',
        properties: {
          sys_id: { type: 'string', description: 'System ID of the incident' },
        },
        required: ['sys_id'],
      },
    },
    {
      name: 'add_work_note',
      description: 'Add an internal work note to any ITSM record (requires WRITE_ENABLED=true)',
      inputSchema: {
        type: 'object',
        properties: {
          table: { type: 'string', description: 'Table name (e.g., "incident", "change_request")' },
          sys_id: { type: 'string', description: 'System ID of the record' },
          note: { type: 'string', description: 'Work note text (internal, not visible to end user)' },
        },
        required: ['table', 'sys_id', 'note'],
      },
    },
    {
      name: 'add_comment',
      description: 'Add a customer-visible comment to any ITSM record (requires WRITE_ENABLED=true)',
      inputSchema: {
        type: 'object',
        properties: {
          table: { type: 'string', description: 'Table name (e.g., "incident")' },
          sys_id: { type: 'string', description: 'System ID of the record' },
          comment: { type: 'string', description: 'Comment text (visible to end user/caller)' },
        },
        required: ['table', 'sys_id', 'comment'],
      },
    },
  ];
}


export async function executeIncidentToolCall(
  client: ServiceNowClient,
  name: string,
  args: Record<string, any>
): Promise<any> {
  switch (name) {
    case 'create_incident': {
      requireWrite();
      if (!args.short_description) throw new ServiceNowError('short_description is required', 'INVALID_REQUEST');
      const result = await client.createRecord('incident', args);
      return { ...result, summary: `Created incident ${result.number || result.sys_id}` };
    }
    case 'get_incident': {
      if (!args.number_or_sysid) throw new ServiceNowError('number_or_sysid is required', 'INVALID_REQUEST');
      if (/^[0-9a-f]{32}$/i.test(args.number_or_sysid)) {
        return await client.getRecord('incident', args.number_or_sysid);
      }
      const resp = await client.queryRecords({ table: 'incident', query: `number=${args.number_or_sysid}^ORsys_id=${args.number_or_sysid}`, limit: 1 });
      if (resp.count === 0) throw new ServiceNowError(`Incident not found: ${args.number_or_sysid}`, 'NOT_FOUND');
      return resp.records[0];
    }
    case 'update_incident': {
      requireWrite();
      if (!args.sys_id || !args.fields) throw new ServiceNowError('sys_id and fields are required', 'INVALID_REQUEST');
      const result = await client.updateRecord('incident', args.sys_id, args.fields);
      return { ...result, summary: `Updated incident ${args.sys_id}` };
    }
    case 'resolve_incident': {
      requireWrite();
      if (!args.sys_id || !args.resolution_code || !args.resolution_notes)
        throw new ServiceNowError('sys_id, resolution_code, and resolution_notes are required', 'INVALID_REQUEST');
      const result = await client.updateRecord('incident', args.sys_id, {
        state: '6',
        close_code: args.resolution_code,
        close_notes: args.resolution_notes,
        resolved_at: new Date().toISOString(),
      });
      return { ...result, summary: `Resolved incident ${args.sys_id}` };
    }
    case 'close_incident': {
      requireWrite();
      if (!args.sys_id) throw new ServiceNowError('sys_id is required', 'INVALID_REQUEST');
      const result = await client.updateRecord('incident', args.sys_id, { state: '7' });
      return { ...result, summary: `Closed incident ${args.sys_id}` };
    }
    case 'add_work_note': {
      requireWrite();
      if (!args.table || !args.sys_id || !args.note) throw new ServiceNowError('table, sys_id, and note are required', 'INVALID_REQUEST');
      const result = await client.updateRecord(args.table, args.sys_id, { work_notes: args.note });
      return { ...result, summary: `Added work note to ${args.table} ${args.sys_id}` };
    }
    case 'add_comment': {
      requireWrite();
      if (!args.table || !args.sys_id || !args.comment) throw new ServiceNowError('table, sys_id, and comment are required', 'INVALID_REQUEST');
      const result = await client.updateRecord(args.table, args.sys_id, { comments: args.comment });
      return { ...result, summary: `Added comment to ${args.table} ${args.sys_id}` };
    }
    default:
      return null;
  }
}

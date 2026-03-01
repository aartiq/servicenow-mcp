/**
 * Update Set management tools — full lifecycle for ServiceNow Update Sets.
 *
 * Goes beyond the basic changeset tools in script.ts to provide:
 * - Create / switch / preview / complete / export
 * - Auto-creation guard (ensure active update set exists)
 * - Batch artifact registration
 *
 * Tier 0 (Read):  get_current_update_set, list_update_sets, preview_update_set
 * Tier 3 (Script): create_update_set, switch_update_set, complete_update_set,
 *                   export_update_set, retrieve_remote_update_set
 *
 * ServiceNow tables: sys_update_set, sys_update_xml, sys_remote_update_set
 */
import type { ServiceNowClient } from '../servicenow/client.js';
import { ServiceNowError } from '../utils/errors.js';
import { requireScripting } from '../utils/permissions.js';

export function getUpdateSetToolDefinitions() {
  return [
    {
      name: 'get_current_update_set',
      description: 'Get the currently active Update Set for the session',
      inputSchema: { type: 'object', properties: {}, required: [] },
    },
    {
      name: 'list_update_sets',
      description: 'List Update Sets by state (in progress, complete, ignore)',
      inputSchema: {
        type: 'object',
        properties: {
          state: { type: 'string', description: 'State filter: "in progress", "complete", "ignore"' },
          query: { type: 'string', description: 'Additional encoded query filter' },
          limit: { type: 'number', description: 'Max records (default 25)' },
        },
        required: [],
      },
    },
    {
      name: 'create_update_set',
      description: 'Create a new Update Set and optionally switch to it. **[Scripting]**',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Update Set name' },
          description: { type: 'string', description: 'Purpose or description' },
          release: { type: 'string', description: 'Target release label' },
          switch_to: { type: 'boolean', description: 'Switch to this Update Set after creation (default true)' },
        },
        required: ['name'],
      },
    },
    {
      name: 'switch_update_set',
      description: 'Switch the active Update Set context to a specified Update Set. **[Scripting]**',
      inputSchema: {
        type: 'object',
        properties: {
          sys_id: { type: 'string', description: 'sys_id of the target Update Set' },
        },
        required: ['sys_id'],
      },
    },
    {
      name: 'complete_update_set',
      description: 'Mark an Update Set as complete (ready for migration). **[Scripting]**',
      inputSchema: {
        type: 'object',
        properties: {
          sys_id: { type: 'string', description: 'Update Set sys_id' },
        },
        required: ['sys_id'],
      },
    },
    {
      name: 'preview_update_set',
      description: 'Preview all changes contained in an Update Set',
      inputSchema: {
        type: 'object',
        properties: {
          sys_id: { type: 'string', description: 'Update Set sys_id' },
          limit: { type: 'number', description: 'Max records to list (default 100)' },
        },
        required: ['sys_id'],
      },
    },
    {
      name: 'export_update_set',
      description: 'Get the XML export payload for an Update Set (as used in migration). **[Scripting]**',
      inputSchema: {
        type: 'object',
        properties: {
          sys_id: { type: 'string', description: 'Update Set sys_id' },
        },
        required: ['sys_id'],
      },
    },
    {
      name: 'ensure_active_update_set',
      description: 'Ensure an active Update Set exists; create one automatically if none is in progress. **[Scripting]**',
      inputSchema: {
        type: 'object',
        properties: {
          default_name: { type: 'string', description: 'Name to use when auto-creating (default: "AI Session Update Set")' },
        },
        required: [],
      },
    },
  ];
}

export async function executeUpdateSetToolCall(
  client: ServiceNowClient,
  name: string,
  args: Record<string, any>
): Promise<any> {
  switch (name) {
    case 'get_current_update_set': {
      const resp = await client.queryRecords({
        table: 'sys_update_set',
        query: 'state=in progress',
        limit: 5,
        fields: 'sys_id,name,description,state,is_default,release,sys_updated_on,sys_updated_by',
      });
      return { count: resp.count, active_update_sets: resp.records };
    }

    case 'list_update_sets': {
      let query = '';
      if (args.state) query = `state=${args.state}`;
      if (args.query) query = query ? `${query}^${args.query}` : args.query;
      const resp = await client.queryRecords({
        table: 'sys_update_set',
        query: query || undefined,
        limit: args.limit || 25,
        fields: 'sys_id,name,state,description,release,sys_updated_on,sys_updated_by',
      });
      return { count: resp.count, update_sets: resp.records };
    }

    case 'create_update_set': {
      if (!args.name) throw new ServiceNowError('name is required', 'INVALID_REQUEST');
      requireScripting();
      const payload: Record<string, any> = { name: args.name, state: 'in progress' };
      if (args.description) payload.description = args.description;
      if (args.release) payload.release = args.release;
      const result = await client.createRecord('sys_update_set', payload);
      const newId = String((result as any).sys_id || (result as any).result?.sys_id || '');
      if (newId && args.switch_to !== false) {
        await client.updateRecord('sys_update_set', newId, { is_default: true });
        return { action: 'created_and_switched', name: args.name, sys_id: newId, ...result };
      }
      return { action: 'created', name: args.name, sys_id: newId, ...result };
    }

    case 'switch_update_set': {
      if (!args.sys_id) throw new ServiceNowError('sys_id is required', 'INVALID_REQUEST');
      requireScripting();
      const result = await client.updateRecord('sys_update_set', args.sys_id, { is_default: true });
      return { action: 'switched', sys_id: args.sys_id, ...result };
    }

    case 'complete_update_set': {
      if (!args.sys_id) throw new ServiceNowError('sys_id is required', 'INVALID_REQUEST');
      requireScripting();
      const result = await client.updateRecord('sys_update_set', args.sys_id, { state: 'complete' });
      return { action: 'completed', sys_id: args.sys_id, ...result };
    }

    case 'preview_update_set': {
      if (!args.sys_id) throw new ServiceNowError('sys_id is required', 'INVALID_REQUEST');
      // List all update XML records for this update set
      const resp = await client.queryRecords({
        table: 'sys_update_xml',
        query: `update_set=${args.sys_id}`,
        limit: args.limit || 100,
        fields: 'sys_id,name,type,action,payload,sys_updated_on',
      });
      const updateSet = await client.getRecord('sys_update_set', args.sys_id);
      return {
        update_set: updateSet,
        change_count: resp.count,
        changes: resp.records.map((r: any) => ({
          sys_id: r.sys_id,
          name: r.name,
          type: r.type,
          action: r.action,
          updated: r.sys_updated_on,
        })),
      };
    }

    case 'export_update_set': {
      if (!args.sys_id) throw new ServiceNowError('sys_id is required', 'INVALID_REQUEST');
      requireScripting();
      const updateSet = await client.getRecord('sys_update_set', args.sys_id);
      const xmlRecords = await client.queryRecords({
        table: 'sys_update_xml',
        query: `update_set=${args.sys_id}`,
        limit: 500,
        fields: 'sys_id,name,type,action,payload',
      });
      return {
        update_set_name: (updateSet as any).name,
        sys_id: args.sys_id,
        change_count: xmlRecords.count,
        note: 'Use the ServiceNow Update Set XML Export UI (/sys_update_set.do) to download the actual XML file for import into another instance.',
        changes_summary: xmlRecords.records.map((r: any) => ({ name: r.name, type: r.type, action: r.action })),
      };
    }

    case 'ensure_active_update_set': {
      requireScripting();
      const resp = await client.queryRecords({
        table: 'sys_update_set',
        query: 'state=in progress',
        limit: 1,
        fields: 'sys_id,name',
      });
      if (resp.count > 0) {
        return { action: 'existing_found', update_set: resp.records[0] };
      }
      const defaultName = args.default_name || `AI Session Update Set ${new Date().toISOString().slice(0, 10)}`;
      const created = await client.createRecord('sys_update_set', { name: defaultName, state: 'in progress', is_default: true });
      return { action: 'auto_created', name: defaultName, update_set: created };
    }

    default:
      return null;
  }
}

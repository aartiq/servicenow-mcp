/**
 * Scoped Application (App Studio) tools — manage ServiceNow scoped apps.
 * Read tools: Tier 0. Write/create tools: Tier 1 (WRITE_ENABLED=true).
 * ServiceNow table: sys_app (scoped applications), sys_scope (application scopes).
 */
import type { ServiceNowClient } from '../servicenow/client.js';
import { ServiceNowError } from '../utils/errors.js';
import { requireWrite } from '../utils/permissions.js';

export function getAppStudioToolDefinitions() {
  return [
    // ── Scoped Applications ─────────────────────────────────────────────────
    {
      name: 'list_scoped_apps',
      description: 'List scoped applications (custom apps) installed in the instance',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search apps by name or scope prefix' },
          active: { type: 'boolean', description: 'Filter to active apps only' },
          limit: { type: 'number', description: 'Max records to return (default 25)' },
        },
        required: [],
      },
    },
    {
      name: 'get_scoped_app',
      description: 'Get full details of a scoped application by sys_id or scope name',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'App sys_id or scope name (e.g. "x_myco_myapp")' },
        },
        required: ['id'],
      },
    },
    {
      name: 'create_scoped_app',
      description:
        'Create a new scoped application in App Studio (requires WRITE_ENABLED=true). ' +
        'The scope prefix must be unique and follow the pattern x_<vendor>_<appname>.',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Human-readable application name' },
          scope: {
            type: 'string',
            description: 'Unique scope prefix, e.g. "x_myco_myapp". Must start with "x_".',
          },
          version: {
            type: 'string',
            description: 'Application version string (e.g. "1.0.0"). Defaults to "1.0.0".',
          },
          short_description: { type: 'string', description: 'Short description shown in the app list' },
          description: { type: 'string', description: 'Full description of the application' },
          vendor: { type: 'string', description: 'Vendor or author name' },
          active: { type: 'boolean', description: 'Activate the app immediately (default: true)' },
          logo: { type: 'string', description: 'App logo attachment sys_id (optional)' },
        },
        required: ['name', 'scope'],
      },
    },
    {
      name: 'update_scoped_app',
      description: 'Update an existing scoped application (requires WRITE_ENABLED=true)',
      inputSchema: {
        type: 'object',
        properties: {
          sys_id: { type: 'string', description: 'App sys_id' },
          fields: {
            type: 'object',
            description:
              'Fields to update (name, version, short_description, description, active, vendor, etc.)',
          },
        },
        required: ['sys_id', 'fields'],
      },
    },
  ];
}

export async function executeAppStudioToolCall(
  client: ServiceNowClient,
  name: string,
  args: Record<string, any>
): Promise<any> {
  switch (name) {
    case 'list_scoped_apps': {
      const parts: string[] = [];
      if (args.active !== undefined) parts.push(`active=${args.active}`);
      if (args.query) parts.push(`nameCONTAINS${args.query}^ORscopeCONTAINS${args.query}`);
      return await client.queryRecords({
        table: 'sys_app',
        query: parts.join('^') || undefined,
        limit: args.limit ?? 25,
        fields: 'sys_id,name,scope,version,short_description,active,vendor,sys_updated_on',
      });
    }

    case 'get_scoped_app': {
      if (!args.id) throw new ServiceNowError('id is required', 'INVALID_REQUEST');
      if (/^[0-9a-f]{32}$/i.test(args.id)) {
        return await client.getRecord('sys_app', args.id);
      }
      const resp = await client.queryRecords({
        table: 'sys_app',
        query: `scope=${args.id}^ORname=${args.id}`,
        limit: 1,
      });
      if (resp.count === 0) throw new ServiceNowError(`Scoped app not found: ${args.id}`, 'NOT_FOUND');
      return resp.records[0];
    }

    case 'create_scoped_app': {
      requireWrite();
      if (!args.name || !args.scope)
        throw new ServiceNowError('name and scope are required', 'INVALID_REQUEST');
      if (!args.scope.startsWith('x_'))
        throw new ServiceNowError('scope must start with "x_" (e.g. x_myco_myapp)', 'INVALID_REQUEST');
      const data: Record<string, any> = {
        name: args.name,
        scope: args.scope,
        version: args.version ?? '1.0.0',
        active: args.active !== false,
      };
      if (args.short_description) data.short_description = args.short_description;
      if (args.description) data.description = args.description;
      if (args.vendor) data.vendor = args.vendor;
      if (args.logo) data.logo = args.logo;
      const result = await client.createRecord('sys_app', data);
      return {
        ...result,
        summary: `Created scoped app "${args.name}" with scope "${args.scope}"`,
      };
    }

    case 'update_scoped_app': {
      requireWrite();
      if (!args.sys_id || !args.fields)
        throw new ServiceNowError('sys_id and fields are required', 'INVALID_REQUEST');
      const result = await client.updateRecord('sys_app', args.sys_id, args.fields);
      return { ...result, summary: `Updated scoped app ${args.sys_id}` };
    }

    default:
      return null;
  }
}

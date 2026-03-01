/**
 * Scripting Management tools — latest release (ES2021/ES12 support).
 * All tools require SCRIPTING_ENABLED=true (Tier 3).
 * Note: ServiceNow supports Promises, async/await, optional chaining.
 * GlideEncrypter is deprecated in recent releases.
 */
import type { ServiceNowClient } from '../servicenow/client.js';
import { ServiceNowError } from '../utils/errors.js';
import { requireScripting } from '../utils/permissions.js';

export function getScriptToolDefinitions() {
  return [
    {
      name: 'list_business_rules',
      description: 'List business rules (requires SCRIPTING_ENABLED=true)',
      inputSchema: {
        type: 'object',
        properties: {
          table: { type: 'string', description: 'Filter by table name' },
          active: { type: 'boolean', description: 'Filter to active rules only' },
          limit: { type: 'number', description: 'Max results (default: 20)' },
        },
        required: [],
      },
    },
    {
      name: 'get_business_rule',
      description: 'Get full details and script body of a business rule (requires SCRIPTING_ENABLED=true)',
      inputSchema: {
        type: 'object',
        properties: {
          sys_id: { type: 'string', description: 'System ID of the business rule' },
        },
        required: ['sys_id'],
      },
    },
    {
      name: 'create_business_rule',
      description: 'Create a new business rule (requires SCRIPTING_ENABLED=true). ServiceNow supports ES2021 async/await in scripts.',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Rule name' },
          table: { type: 'string', description: 'Table this rule applies to' },
          when: { type: 'string', description: '"before" | "after" | "async" | "display"' },
          script: { type: 'string', description: 'Server-side JavaScript. ServiceNow supports ES2021 (async/await, ?., ??).' },
          condition: { type: 'string', description: 'Optional condition script' },
          active: { type: 'boolean', description: 'Whether to activate the rule (default: true)' },
          order: { type: 'number', description: 'Execution order (default: 100)' },
        },
        required: ['name', 'table', 'when', 'script'],
      },
    },
    {
      name: 'update_business_rule',
      description: 'Update a business rule (requires SCRIPTING_ENABLED=true)',
      inputSchema: {
        type: 'object',
        properties: {
          sys_id: { type: 'string', description: 'System ID of the rule' },
          fields: { type: 'object', description: 'Key-value pairs to update (name, script, active, condition, etc.)' },
        },
        required: ['sys_id', 'fields'],
      },
    },
    {
      name: 'list_script_includes',
      description: 'List script includes (requires SCRIPTING_ENABLED=true)',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Filter (e.g., "nameLIKEUtil")' },
          active: { type: 'boolean', description: 'Filter to active includes' },
          limit: { type: 'number', description: 'Max results (default: 20)' },
        },
        required: [],
      },
    },
    {
      name: 'get_script_include',
      description: 'Get full script body of a script include (requires SCRIPTING_ENABLED=true)',
      inputSchema: {
        type: 'object',
        properties: {
          sys_id_or_name: { type: 'string', description: 'Script include sys_id or api_name' },
        },
        required: ['sys_id_or_name'],
      },
    },
    {
      name: 'create_script_include',
      description: 'Create a new script include (requires SCRIPTING_ENABLED=true)',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Script include name' },
          script: { type: 'string', description: 'Script body (class definition). ServiceNow supports ES2021.' },
          api_name: { type: 'string', description: 'API name used to call this from other scripts' },
          access: { type: 'string', description: '"public" or "package_private" (default: "public")' },
          active: { type: 'boolean', description: 'Whether to activate (default: true)' },
        },
        required: ['name', 'script'],
      },
    },
    {
      name: 'update_script_include',
      description: 'Update a script include (requires SCRIPTING_ENABLED=true)',
      inputSchema: {
        type: 'object',
        properties: {
          sys_id: { type: 'string', description: 'System ID of the script include' },
          fields: { type: 'object', description: 'Key-value pairs to update' },
        },
        required: ['sys_id', 'fields'],
      },
    },
    {
      name: 'list_client_scripts',
      description: 'List client scripts (requires SCRIPTING_ENABLED=true)',
      inputSchema: {
        type: 'object',
        properties: {
          table: { type: 'string', description: 'Filter by table name' },
          type: { type: 'string', description: '"onLoad" | "onChange" | "onSubmit" | "onCellEdit"' },
          active: { type: 'boolean', description: 'Filter to active scripts' },
          limit: { type: 'number', description: 'Max results (default: 20)' },
        },
        required: [],
      },
    },
    {
      name: 'get_client_script',
      description: 'Get full details and script body of a client script (requires SCRIPTING_ENABLED=true)',
      inputSchema: {
        type: 'object',
        properties: {
          sys_id: { type: 'string', description: 'System ID of the client script' },
        },
        required: ['sys_id'],
      },
    },
    {
      name: 'list_changesets',
      description: 'List update sets (changesets) (requires SCRIPTING_ENABLED=true)',
      inputSchema: {
        type: 'object',
        properties: {
          state: { type: 'string', description: 'Filter by state: "in progress", "complete", "ignore"' },
          limit: { type: 'number', description: 'Max results (default: 20)' },
        },
        required: [],
      },
    },
    {
      name: 'get_changeset',
      description: 'Get details of an update set (requires SCRIPTING_ENABLED=true)',
      inputSchema: {
        type: 'object',
        properties: {
          sys_id_or_name: { type: 'string', description: 'Update set sys_id or name' },
        },
        required: ['sys_id_or_name'],
      },
    },
    {
      name: 'commit_changeset',
      description: 'Commit an update set (requires SCRIPTING_ENABLED=true)',
      inputSchema: {
        type: 'object',
        properties: {
          sys_id: { type: 'string', description: 'System ID of the update set' },
        },
        required: ['sys_id'],
      },
    },
    {
      name: 'publish_changeset',
      description: 'Publish/export an update set to XML for deployment (requires SCRIPTING_ENABLED=true)',
      inputSchema: {
        type: 'object',
        properties: {
          sys_id: { type: 'string', description: 'System ID of the update set' },
        },
        required: ['sys_id'],
      },
    },
    // ── Client Script CRUD ───────────────────────────────────────────────────
    {
      name: 'create_client_script',
      description: 'Create a new client script (onLoad, onChange, onSubmit, onCellEdit) (requires SCRIPTING_ENABLED=true)',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Script name' },
          table: { type: 'string', description: 'Table this client script applies to' },
          type: { type: 'string', description: '"onLoad" | "onChange" | "onSubmit" | "onCellEdit"' },
          script: { type: 'string', description: 'Client-side JavaScript. Use g_form, g_user, etc.' },
          field_name: { type: 'string', description: 'Field name (required for onChange/onCellEdit)' },
          active: { type: 'boolean', description: 'Whether to activate the script (default: true)' },
          global: { type: 'boolean', description: 'Run script globally (default: false)' },
        },
        required: ['name', 'table', 'type', 'script'],
      },
    },
    {
      name: 'update_client_script',
      description: 'Update an existing client script (requires SCRIPTING_ENABLED=true)',
      inputSchema: {
        type: 'object',
        properties: {
          sys_id: { type: 'string', description: 'Client script sys_id' },
          fields: { type: 'object', description: 'Fields to update (script, active, name, type, etc.)' },
        },
        required: ['sys_id', 'fields'],
      },
    },
    // ── UI Policies ──────────────────────────────────────────────────────────
    {
      name: 'list_ui_policies',
      description: 'List UI Policies for a table (field visibility, mandatory, read-only rules) (requires SCRIPTING_ENABLED=true)',
      inputSchema: {
        type: 'object',
        properties: {
          table: { type: 'string', description: 'Filter by table name' },
          active: { type: 'boolean', description: 'Filter to active policies only' },
          limit: { type: 'number', description: 'Max results (default: 25)' },
        },
        required: [],
      },
    },
    {
      name: 'get_ui_policy',
      description: 'Get full details and conditions of a UI Policy (requires SCRIPTING_ENABLED=true)',
      inputSchema: {
        type: 'object',
        properties: {
          sys_id: { type: 'string', description: 'UI Policy sys_id' },
        },
        required: ['sys_id'],
      },
    },
    {
      name: 'create_ui_policy',
      description: 'Create a new UI Policy to control field behavior dynamically (requires SCRIPTING_ENABLED=true)',
      inputSchema: {
        type: 'object',
        properties: {
          short_description: { type: 'string', description: 'Policy description' },
          table: { type: 'string', description: 'Table to apply this policy on' },
          conditions: { type: 'string', description: 'Encoded query conditions that trigger the policy' },
          script: { type: 'string', description: 'Optional script to run when conditions are met' },
          active: { type: 'boolean', description: 'Whether to activate immediately (default: true)' },
          run_scripts: { type: 'boolean', description: 'Run script in addition to UI actions (default: false)' },
        },
        required: ['short_description', 'table'],
      },
    },
    // ── UI Actions ───────────────────────────────────────────────────────────
    {
      name: 'list_ui_actions',
      description: 'List UI Actions (buttons, context menus, related links) for a table (requires SCRIPTING_ENABLED=true)',
      inputSchema: {
        type: 'object',
        properties: {
          table: { type: 'string', description: 'Filter by table name' },
          type: { type: 'string', description: 'Filter by type: button, context_menu, related_link, list_link, list_button, list_context_menu' },
          active: { type: 'boolean', description: 'Filter to active actions only' },
          limit: { type: 'number', description: 'Max results (default: 25)' },
        },
        required: [],
      },
    },
    {
      name: 'get_ui_action',
      description: 'Get full details and script of a UI Action (requires SCRIPTING_ENABLED=true)',
      inputSchema: {
        type: 'object',
        properties: {
          sys_id: { type: 'string', description: 'UI Action sys_id' },
        },
        required: ['sys_id'],
      },
    },
    {
      name: 'create_ui_action',
      description: 'Create a new UI Action (button or link) on a form (requires SCRIPTING_ENABLED=true)',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Button/link label visible to users' },
          table: { type: 'string', description: 'Table to add this action on' },
          action_name: { type: 'string', description: 'Internal action name (no spaces)' },
          script: { type: 'string', description: 'Server-side script to execute when clicked' },
          type: { type: 'string', description: '"button" | "context_menu" | "related_link" | "list_button"' },
          condition: { type: 'string', description: 'Condition to show/hide the action' },
          active: { type: 'boolean', description: 'Whether to activate immediately (default: true)' },
          form_button: { type: 'boolean', description: 'Show on form (default: true)' },
          list_button: { type: 'boolean', description: 'Show on list (default: false)' },
        },
        required: ['name', 'table', 'action_name'],
      },
    },
    {
      name: 'update_ui_action',
      description: 'Update an existing UI Action (requires SCRIPTING_ENABLED=true)',
      inputSchema: {
        type: 'object',
        properties: {
          sys_id: { type: 'string', description: 'UI Action sys_id' },
          fields: { type: 'object', description: 'Fields to update (name, script, active, condition, etc.)' },
        },
        required: ['sys_id', 'fields'],
      },
    },
    // ── ACL Management ───────────────────────────────────────────────────────
    {
      name: 'list_acls',
      description: 'List Access Control rules (ACLs) — who can read/write/create/delete records (requires SCRIPTING_ENABLED=true)',
      inputSchema: {
        type: 'object',
        properties: {
          table: { type: 'string', description: 'Filter ACLs by table name' },
          operation: { type: 'string', description: 'Filter by operation: read, write, create, delete, execute' },
          active: { type: 'boolean', description: 'Filter to active ACLs only' },
          limit: { type: 'number', description: 'Max results (default: 25)' },
        },
        required: [],
      },
    },
    {
      name: 'get_acl',
      description: 'Get full details of an ACL rule including its script and role requirements (requires SCRIPTING_ENABLED=true)',
      inputSchema: {
        type: 'object',
        properties: {
          sys_id: { type: 'string', description: 'ACL sys_id' },
        },
        required: ['sys_id'],
      },
    },
    {
      name: 'create_acl',
      description: 'Create a new ACL rule to control access to a table or field (requires SCRIPTING_ENABLED=true)',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'ACL name (typically "table.field" or "table.*")' },
          type: { type: 'string', description: '"record" | "field" | "rest_endpoint" | "soap_endpoint"' },
          operation: { type: 'string', description: '"read" | "write" | "create" | "delete" | "execute"' },
          admin_overrides: { type: 'boolean', description: 'Allow admin to override (default: true)' },
          active: { type: 'boolean', description: 'Whether to activate immediately (default: true)' },
          script: { type: 'string', description: 'Optional condition script (return true to allow)' },
          roles: { type: 'string', description: 'Comma-separated roles required (e.g. "admin,itil")' },
          description: { type: 'string', description: 'Description of this access rule' },
        },
        required: ['name', 'operation'],
      },
    },
    {
      name: 'update_acl',
      description: 'Update an existing ACL rule (requires SCRIPTING_ENABLED=true)',
      inputSchema: {
        type: 'object',
        properties: {
          sys_id: { type: 'string', description: 'ACL sys_id' },
          fields: { type: 'object', description: 'Fields to update (active, script, roles, condition, etc.)' },
        },
        required: ['sys_id', 'fields'],
      },
    },
  ];
}

export async function executeScriptToolCall(
  client: ServiceNowClient,
  name: string,
  args: Record<string, any>
): Promise<any> {
  requireScripting();

  switch (name) {
    case 'list_business_rules': {
      let query = '';
      if (args.active !== undefined) query = `active=${args.active}`;
      if (args.table) query = query ? `${query}^collection=${args.table}` : `collection=${args.table}`;
      const resp = await client.queryRecords({ table: 'sys_script', query: query || undefined, limit: args.limit || 20, fields: 'sys_id,name,collection,when,active,order,sys_updated_on' });
      return { count: resp.count, business_rules: resp.records, note: 'ServiceNow supports ES2021 (async/await, ?., ??) in script bodies' };
    }
    case 'get_business_rule': {
      if (!args.sys_id) throw new ServiceNowError('sys_id is required', 'INVALID_REQUEST');
      return await client.getRecord('sys_script', args.sys_id);
    }
    case 'create_business_rule': {
      if (!args.name || !args.table || !args.when || !args.script)
        throw new ServiceNowError('name, table, when, and script are required', 'INVALID_REQUEST');
      const data = { name: args.name, collection: args.table, when: args.when, script: args.script, condition: args.condition, active: args.active !== false, order: args.order || 100 };
      const result = await client.createRecord('sys_script', data);
      return { ...result, summary: `Created business rule ${args.name}`, note: 'GlideEncrypter is deprecated in recent releases; use new sn_si.Vault or keystore APIs instead' };
    }
    case 'update_business_rule': {
      if (!args.sys_id || !args.fields) throw new ServiceNowError('sys_id and fields are required', 'INVALID_REQUEST');
      const result = await client.updateRecord('sys_script', args.sys_id, args.fields);
      return { ...result, summary: `Updated business rule ${args.sys_id}` };
    }
    case 'list_script_includes': {
      let query = '';
      if (args.active !== undefined) query = `active=${args.active}`;
      if (args.query) query = query ? `${query}^${args.query}` : args.query;
      const resp = await client.queryRecords({ table: 'sys_script_include', query: query || undefined, limit: args.limit || 20, fields: 'sys_id,name,api_name,active,access,sys_updated_on' });
      return { count: resp.count, script_includes: resp.records };
    }
    case 'get_script_include': {
      if (!args.sys_id_or_name) throw new ServiceNowError('sys_id_or_name is required', 'INVALID_REQUEST');
      if (/^[0-9a-f]{32}$/i.test(args.sys_id_or_name)) {
        return await client.getRecord('sys_script_include', args.sys_id_or_name);
      }
      const resp = await client.queryRecords({ table: 'sys_script_include', query: `api_name=${args.sys_id_or_name}^ORname=${args.sys_id_or_name}`, limit: 1 });
      if (resp.count === 0) throw new ServiceNowError(`Script include not found: ${args.sys_id_or_name}`, 'NOT_FOUND');
      return resp.records[0];
    }
    case 'create_script_include': {
      if (!args.name || !args.script) throw new ServiceNowError('name and script are required', 'INVALID_REQUEST');
      const data = { name: args.name, script: args.script, api_name: args.api_name || args.name, access: args.access || 'public', active: args.active !== false };
      const result = await client.createRecord('sys_script_include', data);
      return { ...result, summary: `Created script include ${args.name}`, note: 'ES2021 (async/await, ?., ??) supported in the latest release' };
    }
    case 'update_script_include': {
      if (!args.sys_id || !args.fields) throw new ServiceNowError('sys_id and fields are required', 'INVALID_REQUEST');
      return await client.updateRecord('sys_script_include', args.sys_id, args.fields);
    }
    case 'list_client_scripts': {
      let query = '';
      if (args.active !== undefined) query = `active=${args.active}`;
      if (args.table) query = query ? `${query}^table=${args.table}` : `table=${args.table}`;
      if (args.type) query = query ? `${query}^type=${args.type}` : `type=${args.type}`;
      const resp = await client.queryRecords({ table: 'sys_script_client', query: query || undefined, limit: args.limit || 20, fields: 'sys_id,name,table,type,active,sys_updated_on' });
      return { count: resp.count, client_scripts: resp.records };
    }
    case 'get_client_script': {
      if (!args.sys_id) throw new ServiceNowError('sys_id is required', 'INVALID_REQUEST');
      return await client.getRecord('sys_script_client', args.sys_id);
    }
    case 'list_changesets': {
      let query = '';
      if (args.state) query = `state=${args.state}`;
      const resp = await client.queryRecords({ table: 'sys_update_set', query: query || undefined, limit: args.limit || 20, fields: 'sys_id,name,state,description,application,sys_updated_on' });
      return { count: resp.count, changesets: resp.records, note: 'Latest ReleaseOps provides automated deployment pipelines for changesets' };
    }
    case 'get_changeset': {
      if (!args.sys_id_or_name) throw new ServiceNowError('sys_id_or_name is required', 'INVALID_REQUEST');
      if (/^[0-9a-f]{32}$/i.test(args.sys_id_or_name)) {
        return await client.getRecord('sys_update_set', args.sys_id_or_name);
      }
      const resp = await client.queryRecords({ table: 'sys_update_set', query: `name=${args.sys_id_or_name}^ORsys_id=${args.sys_id_or_name}`, limit: 1 });
      if (resp.count === 0) throw new ServiceNowError(`Changeset not found: ${args.sys_id_or_name}`, 'NOT_FOUND');
      return resp.records[0];
    }
    case 'commit_changeset': {
      if (!args.sys_id) throw new ServiceNowError('sys_id is required', 'INVALID_REQUEST');
      const result = await client.updateRecord('sys_update_set', args.sys_id, { state: 'complete' });
      return { ...result, summary: `Committed changeset ${args.sys_id}` };
    }
    case 'publish_changeset': {
      if (!args.sys_id) throw new ServiceNowError('sys_id is required', 'INVALID_REQUEST');
      const result = await client.updateRecord('sys_update_set', args.sys_id, { state: 'complete' });
      return { ...result, summary: `Published changeset ${args.sys_id}` };
    }
    // ── Client Script CRUD ───────────────────────────────────────────────────
    case 'create_client_script': {
      if (!args.name || !args.table || !args.type || !args.script)
        throw new ServiceNowError('name, table, type, and script are required', 'INVALID_REQUEST');
      const data: Record<string, any> = {
        name: args.name,
        table: args.table,
        type: args.type,
        script: args.script,
        active: args.active !== false,
        global: args.global ?? false,
      };
      if (args.field_name) data.field_name = args.field_name;
      const result = await client.createRecord('sys_script_client', data);
      return { ...result, summary: `Created client script "${args.name}" (${args.type}) on table "${args.table}"` };
    }
    case 'update_client_script': {
      if (!args.sys_id || !args.fields) throw new ServiceNowError('sys_id and fields are required', 'INVALID_REQUEST');
      const result = await client.updateRecord('sys_script_client', args.sys_id, args.fields);
      return { ...result, summary: `Updated client script ${args.sys_id}` };
    }
    // ── UI Policies ──────────────────────────────────────────────────────────
    case 'list_ui_policies': {
      let query = '';
      if (args.active !== undefined) query = `active=${args.active}`;
      if (args.table) query = query ? `${query}^model_table=${args.table}` : `model_table=${args.table}`;
      const resp = await client.queryRecords({
        table: 'sys_ui_policy',
        query: query || undefined,
        limit: args.limit || 25,
        fields: 'sys_id,short_description,model_table,active,conditions,sys_updated_on',
      });
      return { count: resp.count, ui_policies: resp.records };
    }
    case 'get_ui_policy': {
      if (!args.sys_id) throw new ServiceNowError('sys_id is required', 'INVALID_REQUEST');
      return await client.getRecord('sys_ui_policy', args.sys_id);
    }
    case 'create_ui_policy': {
      if (!args.short_description || !args.table)
        throw new ServiceNowError('short_description and table are required', 'INVALID_REQUEST');
      const data: Record<string, any> = {
        short_description: args.short_description,
        model_table: args.table,
        active: args.active !== false,
        run_scripts: args.run_scripts ?? false,
      };
      if (args.conditions) data.conditions = args.conditions;
      if (args.script) data.script = args.script;
      const result = await client.createRecord('sys_ui_policy', data);
      return { ...result, summary: `Created UI policy "${args.short_description}" on table "${args.table}"` };
    }
    // ── UI Actions ───────────────────────────────────────────────────────────
    case 'list_ui_actions': {
      let query = '';
      if (args.active !== undefined) query = `active=${args.active}`;
      if (args.table) query = query ? `${query}^table=${args.table}` : `table=${args.table}`;
      if (args.type) query = query ? `${query}^action_type=${args.type}` : `action_type=${args.type}`;
      const resp = await client.queryRecords({
        table: 'sys_ui_action',
        query: query || undefined,
        limit: args.limit || 25,
        fields: 'sys_id,name,table,action_type,active,form_button,list_button,sys_updated_on',
      });
      return { count: resp.count, ui_actions: resp.records };
    }
    case 'get_ui_action': {
      if (!args.sys_id) throw new ServiceNowError('sys_id is required', 'INVALID_REQUEST');
      return await client.getRecord('sys_ui_action', args.sys_id);
    }
    case 'create_ui_action': {
      if (!args.name || !args.table || !args.action_name)
        throw new ServiceNowError('name, table, and action_name are required', 'INVALID_REQUEST');
      const data: Record<string, any> = {
        name: args.name,
        table: args.table,
        action_name: args.action_name,
        active: args.active !== false,
        form_button: args.form_button !== false,
        list_button: args.list_button ?? false,
      };
      if (args.script) data.script = args.script;
      if (args.condition) data.condition = args.condition;
      if (args.type) data.action_type = args.type;
      const result = await client.createRecord('sys_ui_action', data);
      return { ...result, summary: `Created UI action "${args.name}" on table "${args.table}"` };
    }
    case 'update_ui_action': {
      if (!args.sys_id || !args.fields) throw new ServiceNowError('sys_id and fields are required', 'INVALID_REQUEST');
      const result = await client.updateRecord('sys_ui_action', args.sys_id, args.fields);
      return { ...result, summary: `Updated UI action ${args.sys_id}` };
    }
    // ── ACL Management ───────────────────────────────────────────────────────
    case 'list_acls': {
      let query = '';
      if (args.active !== undefined) query = `active=${args.active}`;
      if (args.table) query = query ? `${query}^name=${args.table}.*^ORname=${args.table}` : `nameLIKE${args.table}`;
      if (args.operation) query = query ? `${query}^operation=${args.operation}` : `operation=${args.operation}`;
      const resp = await client.queryRecords({
        table: 'sys_security_acl',
        query: query || undefined,
        limit: args.limit || 25,
        fields: 'sys_id,name,type,operation,active,admin_overrides,sys_updated_on',
      });
      return { count: resp.count, acls: resp.records };
    }
    case 'get_acl': {
      if (!args.sys_id) throw new ServiceNowError('sys_id is required', 'INVALID_REQUEST');
      return await client.getRecord('sys_security_acl', args.sys_id);
    }
    case 'create_acl': {
      if (!args.name || !args.operation) throw new ServiceNowError('name and operation are required', 'INVALID_REQUEST');
      const data: Record<string, any> = {
        name: args.name,
        operation: args.operation,
        type: args.type || 'record',
        active: args.active !== false,
        admin_overrides: args.admin_overrides !== false,
      };
      if (args.script) data.script = args.script;
      if (args.description) data.description = args.description;
      const result = await client.createRecord('sys_security_acl', data);
      return { ...result, summary: `Created ACL "${args.name}" for operation "${args.operation}"` };
    }
    case 'update_acl': {
      if (!args.sys_id || !args.fields) throw new ServiceNowError('sys_id and fields are required', 'INVALID_REQUEST');
      const result = await client.updateRecord('sys_security_acl', args.sys_id, args.fields);
      return { ...result, summary: `Updated ACL ${args.sys_id}` };
    }
    default:
      return null;
  }
}

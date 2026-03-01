/**
 * Workspace & UI Builder tools — next-gen configurable workspaces, UIB pages,
 * components, data brokers, and UX framework configuration.
 *
 * NOTE: Does NOT duplicate existing portal.ts tools (list_portals, create_portal,
 * list_portal_widgets, etc.). These tools focus on the newer UI Builder (UIB) and
 * Configurable Workspace frameworks.
 *
 * ServiceNow tables: sys_ux_page, sys_ux_page_registry, sys_ux_macroponent,
 *   sys_ux_data_broker, sys_ux_client_script, sys_ux_client_state_parameter,
 *   sys_aw_workspace, sys_aw_list, sys_aw_form, aw_agent_workspace
 */
import type { ServiceNowClient } from '../servicenow/client.js';
import { ServiceNowError } from '../utils/errors.js';
import { requireWrite, requireScripting } from '../utils/permissions.js';

export function getWorkspaceToolDefinitions() {
  return [
    // ─── UIB Pages ─────────────────────────────────────────────────
    {
      name: 'list_uib_pages',
      description: 'List UI Builder pages and their route configurations',
      inputSchema: { type: 'object', properties: { limit: { type: 'number', description: 'Max records (default 25)' }, app: { type: 'string', description: 'Filter by UX app sys_id' } }, required: [] },
    },
    {
      name: 'get_uib_page',
      description: 'Get details of a specific UI Builder page including layout and child elements',
      inputSchema: { type: 'object', properties: { sys_id: { type: 'string', description: 'UIB page sys_id' } }, required: ['sys_id'] },
    },
    {
      name: 'create_uib_page',
      description: 'Create a new UI Builder page with route registration. **[Write]**',
      inputSchema: { type: 'object', properties: { title: { type: 'string', description: 'Page title' }, path: { type: 'string', description: 'URL path segment' }, app: { type: 'string', description: 'Parent UX app sys_id' }, layout: { type: 'string', description: 'Layout type: single, sidebar, tabbed (default single)' } }, required: ['title', 'path'] },
    },
    {
      name: 'update_uib_page',
      description: 'Update an existing UI Builder page. **[Write]**',
      inputSchema: { type: 'object', properties: { sys_id: { type: 'string', description: 'UIB page sys_id' }, title: { type: 'string' }, path: { type: 'string' }, layout: { type: 'string' } }, required: ['sys_id'] },
    },
    {
      name: 'delete_uib_page',
      description: 'Delete a UI Builder page. **[Write]**',
      inputSchema: { type: 'object', properties: { sys_id: { type: 'string', description: 'UIB page sys_id' } }, required: ['sys_id'] },
    },
    // ─── UIB Components ────────────────────────────────────────────
    {
      name: 'list_uib_components',
      description: 'List available UI Builder components (macroponents) in the instance',
      inputSchema: { type: 'object', properties: { limit: { type: 'number', description: 'Max records (default 50)' }, scope: { type: 'string', description: 'Filter by scope/app' } }, required: [] },
    },
    {
      name: 'create_uib_component',
      description: 'Create a custom UI Builder component (macroponent). **[Scripting]**',
      inputSchema: { type: 'object', properties: { name: { type: 'string', description: 'Component name' }, label: { type: 'string', description: 'Display label' }, description: { type: 'string' }, category: { type: 'string', description: 'Component category' } }, required: ['name', 'label'] },
    },
    {
      name: 'update_uib_component',
      description: 'Update a UI Builder component. **[Scripting]**',
      inputSchema: { type: 'object', properties: { sys_id: { type: 'string', description: 'Component sys_id' }, label: { type: 'string' }, description: { type: 'string' } }, required: ['sys_id'] },
    },
    // ─── UIB Data Brokers ──────────────────────────────────────────
    {
      name: 'list_uib_data_brokers',
      description: 'List UI Builder data brokers (data sources for pages)',
      inputSchema: { type: 'object', properties: { page_sys_id: { type: 'string', description: 'Filter by page' }, limit: { type: 'number' } }, required: [] },
    },
    {
      name: 'create_uib_data_broker',
      description: 'Create a UI Builder data broker to feed data to a page. **[Scripting]**',
      inputSchema: { type: 'object', properties: { name: { type: 'string', description: 'Broker name' }, table: { type: 'string', description: 'Source table' }, query: { type: 'string', description: 'Encoded query filter' }, page: { type: 'string', description: 'Target page sys_id' } }, required: ['name', 'table'] },
    },
    // ─── Configurable Workspaces ───────────────────────────────────
    {
      name: 'list_workspaces',
      description: 'List all configurable agent workspaces',
      inputSchema: { type: 'object', properties: { active: { type: 'boolean', description: 'Filter active (default true)' }, limit: { type: 'number' } }, required: [] },
    },
    {
      name: 'get_workspace',
      description: 'Get details of a configurable agent workspace including tabs and lists',
      inputSchema: { type: 'object', properties: { sys_id: { type: 'string', description: 'Workspace sys_id' } }, required: ['sys_id'] },
    },
    {
      name: 'create_workspace',
      description: 'Create a new configurable agent workspace. **[Write]**',
      inputSchema: { type: 'object', properties: { name: { type: 'string', description: 'Workspace name' }, description: { type: 'string' }, table: { type: 'string', description: 'Primary table (e.g. incident)' }, icon: { type: 'string', description: 'Workspace icon name' } }, required: ['name', 'table'] },
    },
    {
      name: 'configure_workspace_list',
      description: 'Add or update a list view in an agent workspace. **[Write]**',
      inputSchema: { type: 'object', properties: { workspace_sys_id: { type: 'string', description: 'Workspace sys_id' }, table: { type: 'string', description: 'List table' }, title: { type: 'string', description: 'List title' }, query: { type: 'string', description: 'Encoded query filter' }, columns: { type: 'string', description: 'Comma-separated field names' } }, required: ['workspace_sys_id', 'table', 'title'] },
    },
    // ─── UX App Configuration ──────────────────────────────────────
    {
      name: 'create_ux_app_route',
      description: 'Register a new route (URL path) in a UX app. **[Write]**',
      inputSchema: { type: 'object', properties: { app_sys_id: { type: 'string', description: 'UX app sys_id' }, path: { type: 'string', description: 'Route path' }, page_sys_id: { type: 'string', description: 'Target UIB page sys_id' }, title: { type: 'string', description: 'Route title' } }, required: ['app_sys_id', 'path', 'page_sys_id'] },
    },
    {
      name: 'create_ux_experience',
      description: 'Create a new UX Experience (app shell) configuration. **[Write]**',
      inputSchema: { type: 'object', properties: { name: { type: 'string', description: 'Experience name' }, app_sys_id: { type: 'string', description: 'UX app sys_id' }, landing_page: { type: 'string', description: 'Landing page sys_id' } }, required: ['name', 'app_sys_id'] },
    },
  ];
}

export async function executeWorkspaceToolCall(
  client: ServiceNowClient,
  name: string,
  args: Record<string, any>
): Promise<any> {
  switch (name) {
    case 'list_uib_pages': {
      let query = '';
      if (args.app) query = `application=${args.app}`;
      const resp = await client.queryRecords({ table: 'sys_ux_page', query: query || undefined, limit: args.limit || 25, fields: 'sys_id,title,path,application,sys_updated_on' });
      return { count: resp.count, pages: resp.records };
    }
    case 'get_uib_page': {
      if (!args.sys_id) throw new ServiceNowError('sys_id is required', 'INVALID_REQUEST');
      return await client.getRecord('sys_ux_page', args.sys_id);
    }
    case 'create_uib_page': {
      requireWrite();
      if (!args.title || !args.path) throw new ServiceNowError('title and path are required', 'INVALID_REQUEST');
      const result = await client.createRecord('sys_ux_page', { title: args.title, path: args.path, ...(args.app ? { application: args.app } : {}) });
      return { action: 'created', ...result };
    }
    case 'update_uib_page': {
      requireWrite();
      if (!args.sys_id) throw new ServiceNowError('sys_id is required', 'INVALID_REQUEST');
      const { sys_id, ...fields } = args;
      const result = await client.updateRecord('sys_ux_page', sys_id, fields);
      return { action: 'updated', ...result };
    }
    case 'delete_uib_page': {
      requireWrite();
      if (!args.sys_id) throw new ServiceNowError('sys_id is required', 'INVALID_REQUEST');
      await client.deleteRecord('sys_ux_page', args.sys_id);
      return { action: 'deleted', sys_id: args.sys_id };
    }
    case 'list_uib_components': {
      const resp = await client.queryRecords({ table: 'sys_ux_macroponent', query: args.scope ? `sys_scope=${args.scope}` : undefined, limit: args.limit || 50, fields: 'sys_id,name,label,category,sys_scope,sys_updated_on' });
      return { count: resp.count, components: resp.records };
    }
    case 'create_uib_component': {
      requireScripting();
      if (!args.name || !args.label) throw new ServiceNowError('name and label are required', 'INVALID_REQUEST');
      const result = await client.createRecord('sys_ux_macroponent', { name: args.name, label: args.label, ...(args.description ? { description: args.description } : {}), ...(args.category ? { category: args.category } : {}) });
      return { action: 'created', ...result };
    }
    case 'update_uib_component': {
      requireScripting();
      if (!args.sys_id) throw new ServiceNowError('sys_id is required', 'INVALID_REQUEST');
      const { sys_id, ...fields } = args;
      const result = await client.updateRecord('sys_ux_macroponent', sys_id, fields);
      return { action: 'updated', ...result };
    }
    case 'list_uib_data_brokers': {
      const resp = await client.queryRecords({ table: 'sys_ux_data_broker_transform', query: args.page_sys_id ? `page=${args.page_sys_id}` : undefined, limit: args.limit || 25, fields: 'sys_id,name,table,page,sys_updated_on' });
      return { count: resp.count, data_brokers: resp.records };
    }
    case 'create_uib_data_broker': {
      requireScripting();
      if (!args.name || !args.table) throw new ServiceNowError('name and table are required', 'INVALID_REQUEST');
      const result = await client.createRecord('sys_ux_data_broker_transform', { name: args.name, table: args.table, ...(args.query ? { query: args.query } : {}), ...(args.page ? { page: args.page } : {}) });
      return { action: 'created', ...result };
    }
    case 'list_workspaces': {
      const resp = await client.queryRecords({ table: 'sys_aw_workspace', query: args.active !== false ? 'active=true' : undefined, limit: args.limit || 25, fields: 'sys_id,name,description,table,active,icon,sys_updated_on' });
      return { count: resp.count, workspaces: resp.records };
    }
    case 'get_workspace': {
      if (!args.sys_id) throw new ServiceNowError('sys_id is required', 'INVALID_REQUEST');
      const ws = await client.getRecord('sys_aw_workspace', args.sys_id);
      const lists = await client.queryRecords({ table: 'sys_aw_list', query: `workspace=${args.sys_id}`, limit: 50, fields: 'sys_id,title,table,query,columns' });
      return { ...ws, lists: lists.records };
    }
    case 'create_workspace': {
      requireWrite();
      if (!args.name || !args.table) throw new ServiceNowError('name and table are required', 'INVALID_REQUEST');
      const result = await client.createRecord('sys_aw_workspace', { name: args.name, table: args.table, active: 'true', ...(args.description ? { description: args.description } : {}), ...(args.icon ? { icon: args.icon } : {}) });
      return { action: 'created', ...result };
    }
    case 'configure_workspace_list': {
      requireWrite();
      if (!args.workspace_sys_id || !args.table || !args.title) throw new ServiceNowError('workspace_sys_id, table, and title are required', 'INVALID_REQUEST');
      const result = await client.createRecord('sys_aw_list', { workspace: args.workspace_sys_id, table: args.table, title: args.title, ...(args.query ? { query: args.query } : {}), ...(args.columns ? { columns: args.columns } : {}) });
      return { action: 'created', ...result };
    }
    case 'create_ux_app_route': {
      requireWrite();
      if (!args.app_sys_id || !args.path || !args.page_sys_id) throw new ServiceNowError('app_sys_id, path, and page_sys_id required', 'INVALID_REQUEST');
      const result = await client.createRecord('sys_ux_app_route', { application: args.app_sys_id, path: args.path, page: args.page_sys_id, ...(args.title ? { title: args.title } : {}) });
      return { action: 'created', ...result };
    }
    case 'create_ux_experience': {
      requireWrite();
      if (!args.name || !args.app_sys_id) throw new ServiceNowError('name and app_sys_id are required', 'INVALID_REQUEST');
      const result = await client.createRecord('sys_ux_app_config', { name: args.name, application: args.app_sys_id, ...(args.landing_page ? { landing_page: args.landing_page } : {}) });
      return { action: 'created', ...result };
    }
    default:
      return null;
  }
}

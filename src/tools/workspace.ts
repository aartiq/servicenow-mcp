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
      description: 'List UI Builder pages (app routes with their screen collections) and their route configurations',
      inputSchema: { type: 'object', properties: { limit: { type: 'number', description: 'Max records (default 25)' }, app: { type: 'string', description: 'Filter by UX app config (sys_ux_app_config) or experience (sys_ux_page_registry) sys_id' } }, required: [] },
    },
    {
      name: 'get_uib_page',
      description: 'Get details of a specific UI Builder page (screen collection) including its routes and screen variants',
      inputSchema: { type: 'object', properties: { sys_id: { type: 'string', description: 'UIB page sys_id (screen collection, sys_ux_screen_type)' } }, required: ['sys_id'] },
    },
    {
      name: 'create_uib_page',
      description: 'Create a new UI Builder page: a screen collection (sys_ux_screen_type) plus, when app is given, its route (sys_ux_app_route). Build the page content in UI Builder. **[Write]**',
      inputSchema: { type: 'object', properties: { title: { type: 'string', description: 'Page title' }, path: { type: 'string', description: 'URL path segment (route)' }, app: { type: 'string', description: 'UX app config (sys_ux_app_config) or experience (sys_ux_page_registry) sys_id to register the route in' }, layout: { type: 'string', description: 'Layout type (informational; layout is set in UI Builder)' } }, required: ['title', 'path'] },
    },
    {
      name: 'update_uib_page',
      description: 'Update an existing UI Builder page (title and/or route path). **[Write]**',
      inputSchema: { type: 'object', properties: { sys_id: { type: 'string', description: 'UIB page sys_id' }, title: { type: 'string' }, path: { type: 'string' }, layout: { type: 'string' } }, required: ['sys_id'] },
    },
    {
      name: 'delete_uib_page',
      description: 'Delete a UI Builder page (screen collection) with its routes and screen variants. **[Write]**',
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
      inputSchema: { type: 'object', properties: { name: { type: 'string', description: 'Component name' }, label: { type: 'string', description: 'Display label (macroponents have no label field, so it is used as the description when none is given)' }, description: { type: 'string' }, category: { type: 'string', description: 'Component category (e.g. component, page, primitives)' } }, required: ['name', 'label'] },
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
      description: 'Create a UI Builder transform data broker (server script) that returns records from a table. Add it to a page in UI Builder; it needs a ux_data_broker execute ACL. **[Scripting]**',
      inputSchema: { type: 'object', properties: { name: { type: 'string', description: 'Broker name' }, table: { type: 'string', description: 'Source table' }, query: { type: 'string', description: 'Encoded query filter' }, page: { type: 'string', description: 'Target page sys_id (informational; brokers are added to pages in UI Builder)' }, fields: { type: 'string', description: 'Comma-separated fields to return (default: sys_id + display value)' } }, required: ['name', 'table'] },
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
      description: 'Create a new configurable workspace config (sys_aw_master_config) with a default list for its primary table. The UI Builder experience itself is generated in Workspace Builder. **[Write]**',
      inputSchema: { type: 'object', properties: { name: { type: 'string', description: 'Workspace name' }, description: { type: 'string' }, table: { type: 'string', description: 'Primary table (e.g. incident); a default list for it is added' }, icon: { type: 'string', description: 'Workspace icon name (not stored on the workspace config; kept for compatibility)' }, url: { type: 'string', description: 'Workspace URL path segment (default: derived from name)' }, navigation_type: { type: 'string', description: 'tab (default) or breadcrumb' }, columns: { type: 'string', description: 'Columns for the default list (default number,short_description,state,sys_updated_on)' } }, required: ['name', 'table'] },
    },
    {
      name: 'configure_workspace_list',
      description: 'Add or update a list view in an agent workspace. **[Write]**',
      inputSchema: { type: 'object', properties: { workspace_sys_id: { type: 'string', description: 'Workspace sys_id (sys_aw_master_config)' }, table: { type: 'string', description: 'List table' }, title: { type: 'string', description: 'List title' }, query: { type: 'string', description: 'Encoded query filter (stored in the list condition)' }, columns: { type: 'string', description: 'Comma-separated field names' }, category: { type: 'string', description: 'List category sys_id or title (default: the workspace\'s first category, created if none)' }, order: { type: 'number', description: 'List order (default 100)' } }, required: ['workspace_sys_id', 'table', 'title'] },
    },
    // ─── UX App Configuration ──────────────────────────────────────
    {
      name: 'create_ux_app_route',
      description: 'Register a new route (URL path) in a UX app. **[Write]**',
      inputSchema: { type: 'object', properties: { app_sys_id: { type: 'string', description: 'UX app config (sys_ux_app_config) or experience (sys_ux_page_registry) sys_id' }, path: { type: 'string', description: 'Route path' }, page_sys_id: { type: 'string', description: 'Target UIB page (screen collection) sys_id' }, title: { type: 'string', description: 'Route title' } }, required: ['app_sys_id', 'path', 'page_sys_id'] },
    },
    {
      name: 'create_ux_experience',
      description: 'Create a new UX Experience (app shell) configuration. **[Write]**',
      inputSchema: { type: 'object', properties: { name: { type: 'string', description: 'Experience name' }, app_sys_id: { type: 'string', description: 'UX parent application (sys_ux_app) sys_id' }, landing_page: { type: 'string', description: 'Landing route path (default home)' }, path: { type: 'string', description: 'Experience URL path (default: derived from name)' } }, required: ['name', 'app_sys_id'] },
    },
  ];
}

function refValue(v: any): string {
  return v && typeof v === 'object' ? String(v.value ?? '') : String(v ?? '');
}

/** Accept an app config sys_id, or an experience (sys_ux_page_registry) sys_id and use its admin panel app config. */
async function resolveAppConfig(client: ServiceNowClient, id: string): Promise<string> {
  const reg = await client.queryRecords({ table: 'sys_ux_page_registry', query: `sys_id=${id}`, limit: 1, fields: 'admin_panel,admin_panel_table' });
  if (reg.count) {
    const r = reg.records[0] as any;
    const panel = refValue(r.admin_panel);
    if (panel && (!r.admin_panel_table || r.admin_panel_table === 'sys_ux_app_config')) return panel;
  }
  return id;
}

/** Find (or create) a list category on a workspace; sys_aw_list.category is mandatory. */
async function ensureListCategory(client: ServiceNowClient, workspace: string, category?: string): Promise<string> {
  if (category && /^[0-9a-f]{32}$/i.test(category)) return category;
  const q = category ? `workspace=${workspace}^title=${category}` : `workspace=${workspace}^ORDERBYorder`;
  const found = await client.queryRecords({ table: 'sys_aw_list_category', query: q, limit: 1, fields: 'sys_id' });
  if (found.count) return (found.records[0] as any).sys_id;
  const created = await client.createRecord('sys_aw_list_category', { workspace, title: category || 'Lists', order: '100', active: 'true' });
  return String(created.sys_id);
}

async function createWorkspaceList(client: ServiceNowClient, workspace: string, args: Record<string, any>): Promise<any> {
  const category = await ensureListCategory(client, workspace, args.category);
  const data: Record<string, any> = {
    workspace,
    category,
    table: args.table,
    title: args.title,
    columns: args.columns || 'number,short_description,state,sys_updated_on',
    order: String(args.order ?? 100),
    active: 'true',
  };
  const condition = args.condition ?? args.query;
  if (condition) data.condition = condition;
  return client.createRecord('sys_aw_list', data);
}

export async function executeWorkspaceToolCall(
  client: ServiceNowClient,
  name: string,
  args: Record<string, any>
): Promise<any> {
  switch (name) {
    case 'list_uib_pages': {
      // A UI Builder page is a route (sys_ux_app_route) pointing at a screen collection (sys_ux_screen_type).
      const appConfig = args.app ? await resolveAppConfig(client, args.app) : undefined;
      const resp = await client.queryRecords({ table: 'sys_ux_app_route', query: appConfig ? `app_config=${appConfig}` : undefined, limit: args.limit || 25, fields: 'sys_id,name,route_type,app_config,screen_type,parent_macroponent,sys_updated_on' });
      return { count: resp.count, pages: resp.records.map((r: any) => ({ ...r, path: r.route_type, title: r.name })) };
    }
    case 'get_uib_page': {
      if (!args.sys_id) throw new ServiceNowError('sys_id is required', 'INVALID_REQUEST');
      let collection: any;
      try {
        collection = await client.getRecord('sys_ux_screen_type', args.sys_id);
      } catch (e) {
        // Also accept a route sys_id, or a legacy app shell page (sys_ux_page).
        if (!(e instanceof ServiceNowError) || e.code !== 'NOT_FOUND') throw e;
        try {
          const route = await client.getRecord('sys_ux_app_route', args.sys_id);
          const st = refValue((route as any).screen_type);
          collection = st ? await client.getRecord('sys_ux_screen_type', st) : { sys_id: null };
        } catch (e2) {
          if (!(e2 instanceof ServiceNowError) || e2.code !== 'NOT_FOUND') throw e2;
          return await client.getRecord('sys_ux_page', args.sys_id);
        }
      }
      const id = collection.sys_id;
      const [routes, screens] = id
        ? await Promise.all([
          client.queryRecords({ table: 'sys_ux_app_route', query: `screen_type=${id}`, limit: 50, fields: 'sys_id,name,route_type,app_config,parent_macroponent' }),
          client.queryRecords({ table: 'sys_ux_screen', query: `screen_type=${id}`, limit: 50, fields: 'sys_id,name,macroponent,app_config,order,active' }),
        ])
        : [{ records: [] }, { records: [] }];
      return { ...collection, routes: routes.records, screens: screens.records };
    }
    case 'create_uib_page': {
      requireWrite();
      if (!args.title || !args.path) throw new ServiceNowError('title and path are required', 'INVALID_REQUEST');
      const collection = await client.createRecord('sys_ux_screen_type', { name: args.title });
      let route: any;
      if (args.app) {
        try {
          const appConfig = await resolveAppConfig(client, args.app);
          route = await client.createRecord('sys_ux_app_route', { name: args.title, route_type: args.path, app_config: appConfig, screen_type: collection.sys_id });
        } catch (e) {
          await client.deleteRecord('sys_ux_screen_type', String(collection.sys_id)).catch(() => undefined);
          throw e;
        }
      }
      return {
        action: 'created', ...collection, title: args.title, path: args.path,
        ...(route ? { route_sys_id: route.sys_id } : { note: 'No app given, so no route was registered. Pass app (UX app config or experience sys_id) to register the path.' }),
      };
    }
    case 'update_uib_page': {
      requireWrite();
      if (!args.sys_id) throw new ServiceNowError('sys_id is required', 'INVALID_REQUEST');
      const { sys_id, title, path, layout: _layout, ...rest } = args;
      const fields: Record<string, any> = { ...rest };
      if (title) fields.name = title;
      const result = Object.keys(fields).length ? await client.updateRecord('sys_ux_screen_type', sys_id, fields) : await client.getRecord('sys_ux_screen_type', sys_id);
      const routeFields: Record<string, any> = {};
      if (title) routeFields.name = title;
      if (path) routeFields.route_type = path;
      let routesUpdated = 0;
      if (Object.keys(routeFields).length) {
        const routes = await client.queryRecords({ table: 'sys_ux_app_route', query: `screen_type=${sys_id}`, limit: 50, fields: 'sys_id' });
        for (const r of routes.records as any[]) { await client.updateRecord('sys_ux_app_route', r.sys_id, routeFields); routesUpdated++; }
      }
      return { action: 'updated', ...result, routes_updated: routesUpdated };
    }
    case 'delete_uib_page': {
      requireWrite();
      if (!args.sys_id) throw new ServiceNowError('sys_id is required', 'INVALID_REQUEST');
      const deleted: string[] = [];
      for (const table of ['sys_ux_app_route', 'sys_ux_screen']) {
        const rows = await client.queryRecords({ table, query: `screen_type=${args.sys_id}`, limit: 100, fields: 'sys_id' });
        for (const r of rows.records as any[]) { await client.deleteRecord(table, r.sys_id); deleted.push(`${table}:${r.sys_id}`); }
      }
      await client.deleteRecord('sys_ux_screen_type', args.sys_id);
      return { action: 'deleted', sys_id: args.sys_id, also_deleted: deleted };
    }
    case 'list_uib_components': {
      const resp = await client.queryRecords({ table: 'sys_ux_macroponent', query: args.scope ? `sys_scope=${args.scope}` : undefined, limit: args.limit || 50, fields: 'sys_id,name,label,category,sys_scope,sys_updated_on' });
      return { count: resp.count, components: resp.records };
    }
    case 'create_uib_component': {
      requireScripting();
      if (!args.name || !args.label) throw new ServiceNowError('name and label are required', 'INVALID_REQUEST');
      // sys_ux_macroponent has no label column; schema_version is mandatory.
      const result = await client.createRecord('sys_ux_macroponent', { name: args.name, schema_version: '1.0.0', category: args.category || 'component', description: args.description || args.label });
      return { action: 'created', ...result, label: args.label };
    }
    case 'update_uib_component': {
      requireScripting();
      if (!args.sys_id) throw new ServiceNowError('sys_id is required', 'INVALID_REQUEST');
      const { sys_id, label, ...fields } = args;
      if (label && !fields.description) fields.description = label;
      const result = await client.updateRecord('sys_ux_macroponent', sys_id, fields);
      return { action: 'updated', ...result };
    }
    case 'list_uib_data_brokers': {
      const resp = await client.queryRecords({ table: 'sys_ux_data_broker_transform', limit: args.limit || 25, fields: 'sys_id,name,description,props,mutates_server_data,sys_scope,sys_updated_on' });
      return {
        count: resp.count,
        data_brokers: resp.records,
        ...(args.page_sys_id ? { note: 'Data brokers are attached to pages inside the page macroponent definition, so the page filter was not applied.' } : {}),
      };
    }
    case 'create_uib_data_broker': {
      requireScripting();
      if (!args.name || !args.table) throw new ServiceNowError('name and table are required', 'INVALID_REQUEST');
      if (!/^[a-z0-9_]+$/i.test(args.table)) throw new ServiceNowError('table must be a table name', 'INVALID_REQUEST');
      const fieldList = String(args.fields || '').split(',').map((f: string) => f.trim()).filter((f: string) => /^[a-z0-9_.]+$/i.test(f));
      const script = [
        'function transform(input) {',
        `  var gr = new GlideRecordSecure(${JSON.stringify(args.table)});`,
        ...(args.query ? [`  gr.addEncodedQuery(${JSON.stringify(args.query)});`] : []),
        '  gr.setLimit(input.limit || 50);',
        '  gr.query();',
        '  var rows = [];',
        '  while (gr.next()) {',
        fieldList.length
          ? `    var row = { sys_id: gr.getUniqueValue() };
    ${JSON.stringify(fieldList)}.forEach(function (f) { row[f] = gr.getDisplayValue(f); });
    rows.push(row);`
          : '    rows.push({ sys_id: gr.getUniqueValue(), display: gr.getDisplayValue() });',
        '  }',
        '  return rows;',
        '}',
      ].join('\n');
      const props = JSON.stringify([{ name: 'limit', label: 'Limit', description: 'Max rows to return', readOnly: false, fieldType: 'integer', mandatory: false, defaultValue: 50 }]);
      const result = await client.createRecord('sys_ux_data_broker_transform', { name: args.name, schema_version: '1.0.0', script, props, mutates_server_data: 'false', description: `Returns ${args.table} records${args.query ? ` matching ${args.query}` : ''}` });
      return { action: 'created', ...result, note: 'Add the broker to a page in UI Builder. Transform brokers also need an execute ACL of type ux_data_broker naming this broker.' };
    }
    case 'list_workspaces': {
      // Configurable (Next Experience) and Agent Workspaces share one config record per workspace: sys_aw_master_config.
      const resp = await client.queryRecords({ table: 'sys_aw_master_config', query: args.active !== false ? 'active=true' : undefined, limit: args.limit || 25, fields: 'sys_id,name,description,active,workspace_url,primary_color,sys_scope,sys_updated_on' });
      return { count: resp.count, workspaces: resp.records };
    }
    case 'get_workspace': {
      if (!args.sys_id) throw new ServiceNowError('sys_id is required', 'INVALID_REQUEST');
      const ws = await client.getRecord('sys_aw_master_config', args.sys_id);
      const lists = await client.queryRecords({ table: 'sys_aw_list', query: `workspace=${args.sys_id}`, limit: 50, fields: 'sys_id,title,table,condition,columns,category,active,order' });
      return { ...ws, lists: lists.records };
    }
    case 'create_workspace': {
      requireWrite();
      if (!args.name || !args.table) throw new ServiceNowError('name and table are required', 'INVALID_REQUEST');
      // global_search and global_search_data are mandatory references: reuse the ones an existing workspace uses.
      const tmpl = await client.queryRecords({ table: 'sys_aw_master_config', query: 'global_searchISNOTEMPTY^global_search_dataISNOTEMPTY^ORDERBYDESCactive', limit: 1, fields: 'global_search,global_search_data' });
      const ref = (v: any) => (v && typeof v === 'object' ? v.value : v);
      const url = String(args.url || args.name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
      const data: Record<string, any> = { name: args.name, workspace_url: url, navigation_type: args.navigation_type || 'tab', active: 'true' };
      if (args.description) data.description = args.description;
      if (tmpl.count) {
        data.global_search = ref((tmpl.records[0] as any).global_search);
        data.global_search_data = ref((tmpl.records[0] as any).global_search_data);
      }
      const ws = await client.createRecord('sys_aw_master_config', data);
      const list = await createWorkspaceList(client, String(ws.sys_id), { table: args.table, title: `All ${args.table}`, columns: args.columns });
      return { action: 'created', ...ws, default_list: list, note: 'This is the workspace config record. Generate the UI Builder experience (pages and routes) in Workspace Builder.' };
    }
    case 'configure_workspace_list': {
      requireWrite();
      if (!args.workspace_sys_id || !args.table || !args.title) throw new ServiceNowError('workspace_sys_id, table, and title are required', 'INVALID_REQUEST');
      const result = await createWorkspaceList(client, args.workspace_sys_id, args);
      return { action: 'created', ...result };
    }
    case 'create_ux_app_route': {
      requireWrite();
      if (!args.app_sys_id || !args.path || !args.page_sys_id) throw new ServiceNowError('app_sys_id, path, and page_sys_id required', 'INVALID_REQUEST');
      // Routes live on the app config and point at a screen collection (the UIB page).
      const appConfig = await resolveAppConfig(client, args.app_sys_id);
      const result = await client.createRecord('sys_ux_app_route', { name: args.title || args.path, route_type: args.path, app_config: appConfig, screen_type: args.page_sys_id });
      return { action: 'created', ...result };
    }
    case 'create_ux_experience': {
      requireWrite();
      if (!args.name || !args.app_sys_id) throw new ServiceNowError('name and app_sys_id are required', 'INVALID_REQUEST');
      // An experience is a UX application (sys_ux_page_registry) with its app config (sys_ux_app_config) as admin panel.
      const slug = String(args.path || args.name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
      const config = await client.createRecord('sys_ux_app_config', { name: args.name, landing_path: args.landing_page || 'home', active: 'true' });
      try {
        const parent = await client.queryRecords({ table: 'sys_ux_app', query: `sys_id=${args.app_sys_id}`, limit: 1, fields: 'sys_id' });
        const registry = await client.createRecord('sys_ux_page_registry', {
          title: args.name,
          path: slug,
          active: 'true',
          admin_panel_table: 'sys_ux_app_config',
          admin_panel: config.sys_id,
          ...(parent.count ? { parent_app: args.app_sys_id } : {}),
        });
        return {
          action: 'created', ...registry, app_config_sys_id: config.sys_id,
          ...(parent.count ? {} : { note: `app_sys_id ${args.app_sys_id} is not a UX parent application (sys_ux_app), so it was not linked.` }),
        };
      } catch (e) {
        await client.deleteRecord('sys_ux_app_config', String(config.sys_id)).catch(() => undefined);
        throw e;
      }
    }
    default:
      return null;
  }
}

/**
 * ServiceNow Mobile tools — mobile app configuration, layout management,
 * push notifications, offline sync, and mobile analytics.
 *
 * ServiceNow tables: sys_sg_native_client (app configs), sys_sg_screen (applets),
 *   sys_sg_view_config (cards/layouts), sys_sg_push_notification, sys_sg_offline_sync
 */
import type { ServiceNowClient } from '../servicenow/client.js';
import { ServiceNowError } from '../utils/errors.js';
import { requireWrite } from '../utils/permissions.js';

export function getMobileToolDefinitions() {
  return [
    {
      name: 'list_mobile_app_configs',
      description: 'List ServiceNow mobile app configurations',
      inputSchema: { type: 'object', properties: { active: { type: 'boolean', description: 'Filter active (default true)' }, limit: { type: 'number' } }, required: [] },
    },
    {
      name: 'get_mobile_app_config',
      description: 'Get details of a specific mobile app configuration',
      inputSchema: { type: 'object', properties: { sys_id: { type: 'string', description: 'Mobile app config sys_id' } }, required: ['sys_id'] },
    },
    {
      name: 'create_mobile_app_config',
      description: 'Create a new mobile app configuration. **[Write]**',
      inputSchema: { type: 'object', properties: { name: { type: 'string', description: 'App name' }, description: { type: 'string', description: 'Not stored (sys_sg_native_client has no description); kept for compatibility' }, branding_color: { type: 'string', description: 'Primary colour hex (set on the app navigation bar)' }, navigation: { type: 'string', description: 'Existing navigation bar (sys_sg_navigation) sys_id; a new one is created if omitted' }, type: { type: 'string', description: 'App type, e.g. request (Now Mobile) or agent (Mobile Agent)' } }, required: ['name'] },
    },
    {
      name: 'list_mobile_applets',
      description: 'List mobile applets (mini-apps within the mobile experience)',
      inputSchema: { type: 'object', properties: { app_config: { type: 'string', description: 'Filter by app config sys_id' }, limit: { type: 'number' } }, required: [] },
    },
    {
      name: 'create_mobile_applet',
      description: 'Create a mobile applet in a mobile app. **[Write]**',
      inputSchema: { type: 'object', properties: { name: { type: 'string', description: 'Applet name' }, table: { type: 'string', description: 'Applet data table (a data item is created for it)' }, icon: { type: 'string', description: 'Applet icon (sys_sg_icon sys_id or name; default: a list icon)' }, app_config: { type: 'string', description: 'Parent app config sys_id (screens are reached via launchers, so this is not stored)' }, query: { type: 'string', description: 'Encoded query for the data item' }, description: { type: 'string' } }, required: ['name', 'table'] },
    },
    {
      name: 'list_mobile_layouts',
      description: 'List mobile layout configurations',
      inputSchema: { type: 'object', properties: { limit: { type: 'number' } }, required: [] },
    },
    {
      name: 'create_mobile_layout',
      description: 'Create a mobile layout for a specific view. **[Write]**',
      inputSchema: { type: 'object', properties: { name: { type: 'string', description: 'Layout name' }, table: { type: 'string', description: 'Target table' }, type: { type: 'string', description: 'Layout type: list, form, detail (informational; cards are used by all of them)' }, template: { type: 'string', description: 'Card template (sys_sg_view_template sys_id or name; default: the first active template)' }, description: { type: 'string' } }, required: ['name', 'table'] },
    },
    {
      name: 'configure_offline_sync',
      description: 'Configure which records of a table are available offline in mobile: sets the data item offline query condition, and optionally marks a screen available offline and enables offline on an app config. **[Write]**',
      inputSchema: { type: 'object', properties: { table: { type: 'string', description: 'Table to sync offline' }, query: { type: 'string', description: 'Filter query for sync scope (the data item offline query condition)' }, max_records: { type: 'number', description: 'Not stored (mobile offline has no per-table record cap); kept for compatibility' }, data_item: { type: 'string', description: 'Existing data item (sys_sg_data_item) sys_id to configure; a new offline data item for the table is created if omitted' }, screen: { type: 'string', description: 'Optional screen (sys_sg_screen) sys_id to mark available offline' }, app_config: { type: 'string', description: 'Optional mobile app config (sys_sg_native_client) sys_id to enable offline on' } }, required: ['table'] },
    },
    {
      name: 'send_push_notification',
      description: 'Send a push notification to mobile app users. **[Write]**',
      inputSchema: { type: 'object', properties: { user: { type: 'string', description: 'Target user sys_id' }, group: { type: 'string', description: 'Target group sys_id (alternative to user)' }, title: { type: 'string', description: 'Notification title' }, body: { type: 'string', description: 'Notification body text' }, action_url: { type: 'string', description: 'Deep link URL on tap' } }, required: ['title', 'body'] },
    },
    {
      name: 'get_mobile_analytics',
      description: 'Get mobile app usage analytics — sessions, active users, popular applets',
      inputSchema: { type: 'object', properties: { days: { type: 'number', description: 'Analysis period in days (default 30)' } }, required: [] },
    },
  ];
}

/** Resolve a sys_id-or-name reference; when no value is given, pick the first record matching fallbackQuery. */
async function resolveRef(client: ServiceNowClient, table: string, value: string | undefined, fallbackQuery: string): Promise<string> {
  if (value && /^[0-9a-f]{32}$/i.test(value)) return value;
  const query = value ? `name=${value}` : fallbackQuery;
  let found = await client.queryRecords({ table, query, limit: 1, fields: 'sys_id' });
  if (!found.count && !value) found = await client.queryRecords({ table, limit: 1, fields: 'sys_id' });
  if (!found.count) throw new ServiceNowError(`${table} not found: ${value ?? '(default)'}`, 'NOT_FOUND');
  return (found.records[0] as any).sys_id;
}

export async function executeMobileToolCall(
  client: ServiceNowClient,
  name: string,
  args: Record<string, any>
): Promise<any> {
  switch (name) {
    case 'list_mobile_app_configs': {
      // Mobile app configs live in sys_sg_native_client (no active flag, so the active filter is a no-op).
      const resp = await client.queryRecords({ table: 'sys_sg_native_client', limit: args.limit || 25, orderBy: 'order', fields: 'sys_id,name,type,offline_enabled,required_roles,access_control_type,order,sys_scope,sys_updated_on' });
      return { count: resp.count, configs: resp.records };
    }
    case 'get_mobile_app_config': {
      if (!args.sys_id) throw new ServiceNowError('sys_id is required', 'INVALID_REQUEST');
      return await client.getRecord('sys_sg_native_client', args.sys_id);
    }
    case 'create_mobile_app_config': {
      requireWrite();
      if (!args.name) throw new ServiceNowError('name is required', 'INVALID_REQUEST');
      // sys_sg_native_client requires a navigation bar (sys_sg_navigation).
      let navigation = args.navigation;
      let createdNavigation: string | undefined;
      if (!navigation) {
        const nav = await client.createRecord('sys_sg_navigation', { name: `${args.name} navigation`, ...(args.branding_color ? { color: args.branding_color } : {}) });
        navigation = createdNavigation = String(nav.sys_id);
      }
      try {
        const result = await client.createRecord('sys_sg_native_client', { name: args.name, navigation, ...(args.type ? { type: args.type } : {}) });
        return { action: 'created', ...result, navigation_sys_id: navigation };
      } catch (e) {
        if (createdNavigation) await client.deleteRecord('sys_sg_navigation', createdNavigation).catch(() => undefined);
        throw e;
      }
    }
    case 'list_mobile_applets': {
      // Applets are mobile screens (sys_sg_screen and its list/form/details/... subclasses). Screens are not
      // tied to an app config directly (they're reached through launchers and navigation), so app_config is not applied.
      const resp = await client.queryRecords({ table: 'sys_sg_screen', limit: args.limit || 25, fields: 'sys_id,name,description,icon,sys_class_name,available_offline,roles_override,sys_scope,sys_updated_on' });
      return {
        count: resp.count,
        applets: resp.records,
        ...(args.app_config ? { note: 'Mobile screens are not linked to an app config directly, so the app_config filter was not applied.' } : {}),
      };
    }
    case 'create_mobile_applet': {
      requireWrite();
      if (!args.name || !args.table) throw new ServiceNowError('name and table are required', 'INVALID_REQUEST');
      // An applet is a list screen (sys_sg_list_screen) backed by a data item (sys_sg_data_item) for the table.
      const icon = await resolveRef(client, 'sys_sg_icon', args.icon, 'nameLIKElist');
      const dataItem = await client.createRecord('sys_sg_data_item', { name: `${args.name} data`, table: args.table, ...(args.query ? { query_condition: args.query } : {}) });
      try {
        const screen = await client.createRecord('sys_sg_list_screen', { name: args.name, icon, ...(args.description ? { description: args.description } : {}) });
        return {
          action: 'created', ...screen, data_item_sys_id: dataItem.sys_id,
          note: 'Add the screen to a launcher or navigation tab in Mobile App Builder to make it reachable in an app.',
        };
      } catch (e) {
        await client.deleteRecord('sys_sg_data_item', String(dataItem.sys_id)).catch(() => undefined);
        throw e;
      }
    }
    case 'list_mobile_layouts': {
      // Mobile record layouts are cards (sys_sg_view_config): a table plus a card template.
      const resp = await client.queryRecords({ table: 'sys_sg_view_config', limit: args.limit || 25, fields: 'sys_id,name,table,template,description,active,sys_updated_on' });
      return { count: resp.count, layouts: resp.records };
    }
    case 'create_mobile_layout': {
      requireWrite();
      if (!args.name || !args.table) throw new ServiceNowError('name and table are required', 'INVALID_REQUEST');
      // Mobile layouts are cards (sys_sg_view_config); template is a mandatory card template reference.
      const template = await resolveRef(client, 'sys_sg_view_template', args.template, 'active=true');
      const result = await client.createRecord('sys_sg_view_config', { name: args.name, table: args.table, template, active: 'true', ...(args.description ? { description: args.description } : {}) });
      return { action: 'created', ...result };
    }
    case 'configure_offline_sync': {
      requireWrite();
      if (!args.table) throw new ServiceNowError('table is required', 'INVALID_REQUEST');
      // Offline scope is configured on data items (offline_query_condition), screens (available_offline)
      // and app configs (offline_enabled). sys_sg_offline_sync is a runtime log, not configuration.
      const condition = args.query || '';
      let dataItem: any;
      if (args.data_item) {
        dataItem = await client.updateRecord('sys_sg_data_item', args.data_item, { offline_query_condition: condition });
      } else {
        dataItem = await client.createRecord('sys_sg_data_item', { name: `${args.table} offline`, table: args.table, ...(condition ? { query_condition: condition, offline_query_condition: condition } : {}) });
      }
      const updated: Record<string, any> = { data_item: dataItem.sys_id };
      if (args.screen) { await client.updateRecord('sys_sg_screen', args.screen, { available_offline: 'true' }); updated.screen = args.screen; }
      if (args.app_config) { await client.updateRecord('sys_sg_native_client', args.app_config, { offline_enabled: 'true' }); updated.app_config = args.app_config; }
      return {
        action: 'configured', table: args.table, query: condition, ...updated,
        data_item_created: !args.data_item,
        ...(args.max_records ? { note: 'max_records is not stored: mobile offline has no per-table record cap, so scope it with the query.' } : {}),
      };
    }
    case 'send_push_notification': {
      requireWrite();
      if (!args.title || !args.body) throw new ServiceNowError('title and body are required', 'INVALID_REQUEST');
      // ServiceNow sends push messages from a notification (sysevent_email_action with push enabled and a
      // sys_push_notif_msg message) when its event fires. sys_push_notification is a runtime log, so writing
      // to it sends nothing. Refuse clearly instead of pretending it was sent.
      throw new ServiceNowError(
        'Direct push sends are not available over the REST API. Create a notification with push enabled ' +
          '(create_notification) and trigger it with fire_event, or use the Push Notification Message records in ServiceNow.',
        'NOT_SUPPORTED',
      );
    }
    case 'get_mobile_analytics': {
      const days = args.days || 30;
      const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 19).replace('T', ' ');
      // There is no mobile session table. Mobile app traffic goes through the /api/now/sg/ API,
      // so usage is read from the transaction log (syslog_transaction), grouped by user.
      const byUser = await client.runStats('syslog_transaction', {
        query: `urlSTARTSWITH/api/now/sg/^sys_created_on>=${since}`,
        groupBy: 'sys_created_by',
      });
      const users = byUser
        .map((g: any) => ({ user: g.groupby_fields?.[0]?.value, requests: Number(g.stats?.count || 0) }))
        .filter((u: any) => u.user)
        .sort((a: any, b: any) => b.requests - a.requests);
      const totalRequests = users.reduce((n: number, u: any) => n + u.requests, 0);
      const configs = await client.queryRecords({ table: 'sys_sg_native_client', limit: 100, fields: 'sys_id,name,type' });
      return {
        period_days: days,
        total_sessions: totalRequests,
        total_requests: totalRequests,
        active_users: users.length,
        top_users: users.slice(0, 10),
        active_apps: configs.count,
        apps: configs.records,
        note: 'Usage counts mobile API transactions (/api/now/sg/) in syslog_transaction, which only holds recent history (transaction log rotation).',
      };
    }
    default:
      return null;
  }
}

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
      inputSchema: { type: 'object', properties: { name: { type: 'string', description: 'App name' }, description: { type: 'string' }, branding_color: { type: 'string', description: 'Primary colour hex' } }, required: ['name'] },
    },
    {
      name: 'list_mobile_applets',
      description: 'List mobile applets (mini-apps within the mobile experience)',
      inputSchema: { type: 'object', properties: { app_config: { type: 'string', description: 'Filter by app config sys_id' }, limit: { type: 'number' } }, required: [] },
    },
    {
      name: 'create_mobile_applet',
      description: 'Create a mobile applet in a mobile app. **[Write]**',
      inputSchema: { type: 'object', properties: { name: { type: 'string', description: 'Applet name' }, table: { type: 'string', description: 'Applet data table' }, icon: { type: 'string', description: 'Applet icon' }, app_config: { type: 'string', description: 'Parent app config sys_id' } }, required: ['name', 'table'] },
    },
    {
      name: 'list_mobile_layouts',
      description: 'List mobile layout configurations',
      inputSchema: { type: 'object', properties: { limit: { type: 'number' } }, required: [] },
    },
    {
      name: 'create_mobile_layout',
      description: 'Create a mobile layout for a specific view. **[Write]**',
      inputSchema: { type: 'object', properties: { name: { type: 'string', description: 'Layout name' }, table: { type: 'string', description: 'Target table' }, type: { type: 'string', description: 'Layout type: list, form, detail' } }, required: ['name', 'table'] },
    },
    {
      name: 'configure_offline_sync',
      description: 'Configure which tables/records are available offline in mobile. **[Write]**',
      inputSchema: { type: 'object', properties: { table: { type: 'string', description: 'Table to sync offline' }, query: { type: 'string', description: 'Filter query for sync scope' }, max_records: { type: 'number', description: 'Max offline records (default 500)' } }, required: ['table'] },
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
      const result = await client.createRecord('sys_sg_mobile_app_config', { name: args.name, active: 'true', ...(args.description ? { description: args.description } : {}), ...(args.branding_color ? { branding_color: args.branding_color } : {}) });
      return { action: 'created', ...result };
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
      const result = await client.createRecord('sys_sg_mobile_applet', { name: args.name, table: args.table, ...(args.icon ? { icon: args.icon } : {}), ...(args.app_config ? { app_config: args.app_config } : {}) });
      return { action: 'created', ...result };
    }
    case 'list_mobile_layouts': {
      // Mobile record layouts are cards (sys_sg_view_config): a table plus a card template.
      const resp = await client.queryRecords({ table: 'sys_sg_view_config', limit: args.limit || 25, fields: 'sys_id,name,table,template,description,active,sys_updated_on' });
      return { count: resp.count, layouts: resp.records };
    }
    case 'create_mobile_layout': {
      requireWrite();
      if (!args.name || !args.table) throw new ServiceNowError('name and table are required', 'INVALID_REQUEST');
      const result = await client.createRecord('sys_sg_mobile_layout', { name: args.name, table: args.table, ...(args.type ? { type: args.type } : {}) });
      return { action: 'created', ...result };
    }
    case 'configure_offline_sync': {
      requireWrite();
      if (!args.table) throw new ServiceNowError('table is required', 'INVALID_REQUEST');
      const result = await client.createRecord('sys_sg_offline_sync', { table: args.table, max_records: String(args.max_records || 500), ...(args.query ? { query: args.query } : {}) });
      return { action: 'configured', table: args.table, ...result };
    }
    case 'send_push_notification': {
      requireWrite();
      if (!args.title || !args.body) throw new ServiceNowError('title and body are required', 'INVALID_REQUEST');
      const result = await client.createRecord('sys_push_notification', { title: args.title, body: args.body, ...(args.user ? { user: args.user } : {}), ...(args.group ? { group: args.group } : {}), ...(args.action_url ? { action_url: args.action_url } : {}) });
      return { action: 'sent', ...result };
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

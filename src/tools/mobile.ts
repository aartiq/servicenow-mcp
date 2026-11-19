/**
 * ServiceNow Mobile tools — mobile app configuration, layout management,
 * push notifications, offline sync, and mobile analytics.
 *
 * ServiceNow tables: sys_sg_native_client (app configs), sys_sg_screen (applets),
 *   sys_sg_view_config (cards/layouts), sys_sg_offline_sync; push goes through sysevent_email_action +
 *   sys_push_notif_msg for a sys_push_application, fired by the nowaikit.push event
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
      description:
        'Send a push notification to ServiceNow mobile app users (Now Mobile / Mobile Agent) the way ServiceNow does it: an event fires a ' +
        'push-only notification whose push message carries the text. The first call per table sets up, and later calls reuse, ' +
        'an event "nowaikit.push", a push message "NowAIKit push (<push app>)" and a notification "NowAIKit push (<table>)". ' +
        'Only users signed in to the mobile app with push enabled receive it; the result says how many recipients have a ' +
        'registered device. **[Write]**',
      inputSchema: {
        type: 'object',
        properties: {
          user: { type: 'string', description: 'Target user sys_id or user_name' },
          group: { type: 'string', description: 'Target group sys_id or name (its active members receive it)' },
          users: { type: 'array', items: { type: 'string' }, description: 'More target users (sys_id or user_name)' },
          groups: { type: 'array', items: { type: 'string' }, description: 'More target groups (sys_id or name)' },
          title: { type: 'string', description: 'Notification title (first line of the message)' },
          body: { type: 'string', description: 'Notification body text' },
          action_url: { type: 'string', description: 'Link appended to the message' },
          table: { type: 'string', description: 'Table of the record the notification is about (tapping opens it in the app). Default: sys_user, the first recipient' },
          record_sys_id: { type: 'string', description: 'sys_id of that record (required with table)' },
          push_app: { type: 'string', description: 'Push application (sys_push_application) name or sys_id. Default SkyNowPushApp (Now Mobile / Mobile Agent); SkyNowRequestPushApp for Now Mobile request app' },
          setup_only: { type: 'boolean', description: 'Create or check the event, push message and notification without sending anything' },
        },
        required: ['title', 'body'],
      },
    },
    {
      name: 'get_mobile_analytics',
      description: 'Get mobile app usage analytics — sessions, active users, popular applets',
      inputSchema: { type: 'object', properties: { days: { type: 'number', description: 'Analysis period in days (default 30)' } }, required: [] },
    },
  ];
}

const SYS_ID = /^[0-9a-f]{32}$/i;
export const PUSH_EVENT = 'nowaikit.push';
const MAX_PUSH_RECIPIENTS = 120; // event parm1 holds 4000 characters of comma-separated sys_ids

function fv(r: any, f: string): string {
  const v = r?.[f];
  if (v && typeof v === 'object') return String(v.value ?? '');
  return v === undefined || v === null ? '' : String(v);
}

function clean(v: unknown): string {
  return String(v ?? '').replace(/[\^\n\r,]/g, ' ').trim();
}

/** The text ServiceNow pushes: the push message is "${event.parm2}", so the title, body and link travel in parm2. */
export function pushMessageText(title: string, body: string, link?: string): string {
  return [title.trim(), body.trim(), (link || '').trim()].filter(Boolean).join('\n').slice(0, 4000);
}

async function resolveUsers(client: ServiceNowClient, refs: string[]): Promise<string[]> {
  const out: string[] = [];
  for (const ref of refs.map(clean).filter(Boolean)) {
    const query = SYS_ID.test(ref) ? `sys_id=${ref}` : `user_name=${ref}`;
    const r = (await client.queryRecords({ table: 'sys_user', query, fields: 'sys_id,user_name,active', limit: 1 })).records[0] as any;
    if (!r || (fv(r, 'sys_id') !== ref && fv(r, 'user_name') !== ref)) throw new ServiceNowError(`User not found: ${ref}`, 'NOT_FOUND');
    out.push(fv(r, 'sys_id'));
  }
  return out;
}

async function resolveGroupMembers(client: ServiceNowClient, refs: string[]): Promise<{ groups: string[]; members: string[] }> {
  const groups: string[] = [];
  const members: string[] = [];
  for (const ref of refs.map(clean).filter(Boolean)) {
    const query = SYS_ID.test(ref) ? `sys_id=${ref}` : `name=${ref}`;
    const g = (await client.queryRecords({ table: 'sys_user_group', query, fields: 'sys_id,name', limit: 1 })).records[0] as any;
    if (!g || (fv(g, 'sys_id') !== ref && fv(g, 'name') !== ref)) throw new ServiceNowError(`Group not found: ${ref}`, 'NOT_FOUND');
    const gid = fv(g, 'sys_id');
    groups.push(gid);
    const m = await client.queryRecords({ table: 'sys_user_grmember', query: `group=${gid}^user.active=true`, fields: 'user,group', limit: 1000 });
    for (const r of m.records as any[]) if (fv(r, 'group') === gid && fv(r, 'user')) members.push(fv(r, 'user'));
  }
  return { groups, members };
}

/** Find a record by exact name (re-checked client-side), or create it. */
async function ensureRecord(client: ServiceNowClient, table: string, match: Record<string, string>, data: Record<string, string>, created: Array<{ table: string; sys_id: string; name: string }>): Promise<any> {
  const query = Object.entries(match).map(([k, v]) => `${k}=${v}`).join('^');
  const existing = ((await client.queryRecords({ table, query, fields: ['sys_id', ...Object.keys(match), ...Object.keys(data)].join(','), limit: 5 })).records as any[])
    .find((r) => Object.entries(match).every(([k, v]) => fv(r, k) === v));
  if (existing) return existing;
  const rec = await client.createRecord(table, { ...match, ...data });
  created.push({ table, sys_id: String(rec.sys_id), name: Object.values(match)[0]! });
  return rec;
}

/**
 * Push in ServiceNow = notification (sysevent_email_action, push_message_only) + push message (sys_push_notif_msg) for a
 * push application, fired by an event. sys_push_notification is only the outbound log, so writing there sends nothing.
 */
export async function sendPushNotification(client: ServiceNowClient, args: Record<string, any>): Promise<any> {
  const title = String(args.title || '').trim();
  const body = String(args.body || '').trim();
  if (!title || !body) throw new ServiceNowError('title and body are required', 'INVALID_REQUEST');
  if (args.action_url && !/^(https?:\/\/|\/)/i.test(String(args.action_url))) throw new ServiceNowError('action_url must be an http(s) URL or an instance path', 'INVALID_REQUEST');
  const userRefs = [args.user, ...(Array.isArray(args.users) ? args.users : [])].filter(Boolean).map(String);
  const groupRefs = [args.group, ...(Array.isArray(args.groups) ? args.groups : [])].filter(Boolean).map(String);
  if (!args.setup_only && !userRefs.length && !groupRefs.length) throw new ServiceNowError('Give at least one recipient: user, users, group or groups', 'INVALID_REQUEST');
  if (args.table && !/^[a-z0-9_]{1,80}$/.test(String(args.table))) throw new ServiceNowError('table must be a table name', 'INVALID_REQUEST');
  if (args.table && !SYS_ID.test(String(args.record_sys_id || ''))) throw new ServiceNowError('record_sys_id (32-character sys_id) is required with table', 'INVALID_REQUEST');

  // 1. Is push usable on this instance at all?
  const prop = (await client.queryRecords({ table: 'sys_properties', query: 'name=glide.push.enabled', fields: 'name,value', limit: 1 })).records[0] as any;
  if (prop && fv(prop, 'value') === 'false') {
    throw new ServiceNowError('Push is switched off on this instance (glide.push.enabled=false). Set it to true in System Properties, then retry.', 'NOT_CONFIGURED');
  }
  const appRef = clean(args.push_app || 'SkyNowPushApp');
  const app = ((await client.queryRecords({
    table: 'sys_push_application', query: SYS_ID.test(appRef) ? `sys_id=${appRef}` : `name=${appRef}`, fields: 'sys_id,name,display_name,push', limit: 1,
  })).records as any[]).find((r) => fv(r, 'sys_id') === appRef || fv(r, 'name') === appRef);
  if (!app) {
    const any = await client.queryRecords({ table: 'sys_push_application', fields: 'name', limit: 20 });
    throw new ServiceNowError(
      `No push application "${appRef}" on this instance. ${any.records.length ? `Available: ${(any.records as any[]).map((r) => fv(r, 'name')).join(', ')}. ` : ''}` +
        'Mobile push needs the ServiceNow mobile apps with a push application (System Mobile > Push > Push Applications) and ' +
        'users signed in to the app with notifications allowed. Configure that first, then retry.',
      'NOT_CONFIGURED',
    );
  }
  const appId = fv(app, 'sys_id');

  // 2. Recipients (groups expanded to active members, so delivery does not depend on parm1 group handling).
  const users = await resolveUsers(client, userRefs);
  const { groups, members } = await resolveGroupMembers(client, groupRefs);
  const recipients = [...new Set([...users, ...members])];
  if (!args.setup_only && !recipients.length) throw new ServiceNowError('The groups have no active members, so nobody would receive the push.', 'INVALID_REQUEST');
  if (recipients.length > MAX_PUSH_RECIPIENTS) {
    throw new ServiceNowError(`${recipients.length} recipients is more than one push event can carry (${MAX_PUSH_RECIPIENTS}). Split the send.`, 'INVALID_REQUEST');
  }

  // 3. The record the push is about. Default: the first recipient's user record.
  const table = args.table ? String(args.table) : 'sys_user';
  const recordId = args.table ? String(args.record_sys_id) : (recipients[0] || '');
  if (recordId) {
    try { await client.getRecord(table, recordId, 'sys_id'); } catch { throw new ServiceNowError(`Record ${recordId} not found in ${table}`, 'NOT_FOUND'); }
  }

  // 4. One-time setup, reused on later calls.
  const created: Array<{ table: string; sys_id: string; name: string }> = [];
  const evt = await ensureRecord(client, 'sysevent_register', { event_name: PUSH_EVENT }, { description: 'NowAIKit: send a mobile push message (parm1 = recipients, parm2 = text)', fired_by: 'NowAIKit send_push_notification' }, created);
  const msgName = `NowAIKit push (${fv(app, 'name')})`;
  const msg = await ensureRecord(client, 'sys_push_notif_msg', { name: msgName, push_app: appId }, { message_string: '${event.parm2}', type: 'push' }, created);
  const msgId = fv(msg, 'sys_id');
  const notifName = `NowAIKit push (${table})`;
  const notif = await ensureRecord(client, 'sysevent_email_action', { name: notifName, collection: table }, {
    event_name: PUSH_EVENT, generation_type: 'event', event_parm_1: 'true', push_message_only: 'true', send_self: 'true',
    active: 'true', subscribable: 'false', message_list: msgId, description: 'Created by NowAIKit send_push_notification. Push only, recipients come from event parm1.',
  }, created);
  const list = fv(notif, 'message_list').split(',').filter(Boolean);
  const fixes: Record<string, string> = {};
  if (!list.includes(msgId)) fixes.message_list = [...list, msgId].join(',');
  if (fv(notif, 'active') === 'false') fixes.active = 'true';
  if (fv(notif, 'event_name') && fv(notif, 'event_name') !== PUSH_EVENT) fixes.event_name = PUSH_EVENT;
  if (Object.keys(fixes).length) await client.updateRecord('sysevent_email_action', fv(notif, 'sys_id'), fixes);
  const setup = {
    event: { sys_id: fv(evt, 'sys_id'), name: PUSH_EVENT },
    push_message: { sys_id: msgId, name: msgName, push_app: fv(app, 'name') },
    notification: { sys_id: fv(notif, 'sys_id'), name: notifName, table },
    created,
  };

  // 5. Who can actually get it: users with an active push device for this app (or one of its variants, e.g. Intune builds).
  let withDevice = 0;
  if (recipients.length) {
    const variants = ((await client.queryRecords({ table: 'sys_push_application', query: `parent_app=${appId}`, fields: 'sys_id,parent_app', limit: 50 })).records as any[])
      .filter((r) => fv(r, 'parent_app') === appId).map((r) => fv(r, 'sys_id'));
    const apps = [appId, ...variants];
    const devices = await client.queryRecords({
      table: 'cmn_notif_device', query: `type=Push^active=true^push_appIN${apps.join(',')}^userIN${recipients.join(',')}`, fields: 'user,push_app', limit: 1000,
    });
    withDevice = new Set((devices.records as any[]).filter((d) => recipients.includes(fv(d, 'user')) && apps.includes(fv(d, 'push_app'))).map((d) => fv(d, 'user'))).size;
  }
  if (args.setup_only) {
    return { action: 'setup', setup, push_app: fv(app, 'name'), recipients: recipients.length, recipients_with_device: withDevice };
  }

  // 6. Fire the event (the REST equivalent of gs.eventQueue: a ready row in the event queue).
  const event = await client.createRecord('sysevent', {
    name: PUSH_EVENT, table, instance: recordId, parm1: recipients.join(','), parm2: pushMessageText(title, body, args.action_url), state: 'ready',
  });
  return {
    action: 'queued',
    event_sys_id: event.sys_id,
    push_app: fv(app, 'name'),
    recipients: recipients.length,
    groups_expanded: groups.length,
    recipients_with_device: withDevice,
    target: { table, sys_id: recordId },
    setup,
    note: withDevice
      ? `Queued. ${withDevice} of ${recipients.length} recipient(s) have the app registered for push. Check delivery with list_event_log (event ${PUSH_EVENT}).`
      : `Queued, but none of the ${recipients.length} recipient(s) has a registered push device for ${fv(app, 'name')}, so ServiceNow will process the event and deliver nothing. ` +
        'Recipients need to sign in to the ServiceNow mobile app and allow notifications.',
  };
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
      return sendPushNotification(client, args);
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

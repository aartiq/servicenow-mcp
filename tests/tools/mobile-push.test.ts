/** send_push_notification: event + push-only notification + push message, against a mocked client. */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { executeMobileToolCall, getMobileToolDefinitions, pushMessageText, PUSH_EVENT } from '../../src/tools/mobile.js';
import type { ServiceNowClient } from '../../src/servicenow/client.js';

const APP = 'a'.repeat(32);
const USER = 'b'.repeat(32);
const USER2 = 'c'.repeat(32);
const GROUP = 'd'.repeat(32);
const MSG = 'e'.repeat(32);
const NOTIF = 'f'.repeat(32);
const INC = '1'.repeat(32);

type Handler = (table: string, query: string) => Record<string, any>[] | undefined;

function makeClient(handler: Handler) {
  let n = 0;
  const client = {
    instanceUrl: 'https://acme.service-now.com',
    queryRecords: vi.fn(async (p: any) => {
      const records = handler(p.table, p.query || '') || [];
      return { count: records.length, records };
    }),
    createRecord: vi.fn(async (table: string, data: any) => ({ sys_id: String(++n).padEnd(32, '0'), sys_class_name: table, ...data })),
    updateRecord: vi.fn(async (_t: string, sys_id: string, data: any) => ({ sys_id, ...data })),
    deleteRecord: vi.fn(async () => undefined),
    getRecord: vi.fn(async (_t: string, sys_id: string) => ({ sys_id })),
  };
  return client as typeof client & ServiceNowClient;
}

/** An instance with push on, Now Mobile's push app, one user, and (optionally) existing setup. */
function instance(opts: { setup?: boolean; device?: boolean; pushOff?: boolean; noApp?: boolean } = {}): Handler {
  return (table, query) => {
    switch (table) {
      case 'sys_properties': return [{ name: 'glide.push.enabled', value: opts.pushOff ? 'false' : 'true' }];
      case 'sys_push_application':
        if (opts.noApp) return [];
        if (query.startsWith('parent_app=')) return [];
        return [{ sys_id: APP, name: 'SkyNowPushApp', display_name: 'ServiceNow Mobile Application' }];
      case 'sys_user':
        if (query === 'user_name=jdoe' || query === `sys_id=${USER}`) return [{ sys_id: USER, user_name: 'jdoe' }];
        return [];
      case 'sys_user_group': return query === 'name=Service Desk' ? [{ sys_id: GROUP, name: 'Service Desk' }] : [];
      case 'sys_user_grmember': return [{ user: USER, group: GROUP }, { user: USER2, group: GROUP }];
      case 'sysevent_register': return opts.setup ? [{ sys_id: '9'.repeat(32), event_name: PUSH_EVENT }] : [];
      case 'sys_push_notif_msg': return opts.setup ? [{ sys_id: MSG, name: 'NowAIKit push (SkyNowPushApp)', push_app: APP }] : [];
      case 'sysevent_email_action':
        return opts.setup ? [{ sys_id: NOTIF, name: query.includes('collection=incident') ? 'NowAIKit push (incident)' : 'NowAIKit push (sys_user)', collection: query.includes('collection=incident') ? 'incident' : 'sys_user', message_list: MSG, active: 'true', event_name: PUSH_EVENT }] : [];
      case 'cmn_notif_device': return opts.device ? [{ user: USER, push_app: APP }] : [];
      default: return [];
    }
  };
}

beforeEach(() => { process.env.WRITE_ENABLED = 'true'; });
afterEach(() => { delete process.env.WRITE_ENABLED; });

describe('definition', () => {
  const def = getMobileToolDefinitions().find((d) => d.name === 'send_push_notification')!;
  it('keeps the original inputs', () => {
    for (const k of ['user', 'group', 'title', 'body', 'action_url']) expect(def.inputSchema.properties).toHaveProperty(k);
    expect(def.inputSchema.required).toEqual(['title', 'body']);
  });
});

describe('pushMessageText', () => {
  it('joins title, body and link on separate lines and caps at 4000', () => {
    expect(pushMessageText(' Hi ', 'there', 'https://x')).toBe('Hi\nthere\nhttps://x');
    expect(pushMessageText('a', 'b')).toBe('a\nb');
    expect(pushMessageText('t', 'x'.repeat(5000))).toHaveLength(4000);
  });
});

describe('send_push_notification validation', () => {
  it('needs WRITE_ENABLED', async () => {
    delete process.env.WRITE_ENABLED;
    const client = makeClient(instance());
    await expect(executeMobileToolCall(client, 'send_push_notification', { title: 't', body: 'b', user: 'jdoe' })).rejects.toMatchObject({ code: 'WRITE_NOT_ENABLED' });
    expect(client.queryRecords).not.toHaveBeenCalled();
  });

  it.each([
    [{ body: 'b', user: 'jdoe' }, 'INVALID_REQUEST'],
    [{ title: 't', body: 'b' }, 'INVALID_REQUEST'],
    [{ title: 't', body: 'b', user: 'jdoe', table: 'incident' }, 'INVALID_REQUEST'],
    [{ title: 't', body: 'b', user: 'jdoe', table: 'bad table', record_sys_id: INC }, 'INVALID_REQUEST'],
    [{ title: 't', body: 'b', user: 'jdoe', action_url: 'javascript:alert(1)' }, 'INVALID_REQUEST'],
  ])('rejects %j', async (args, code) => {
    const client = makeClient(instance());
    await expect(executeMobileToolCall(client, 'send_push_notification', args)).rejects.toMatchObject({ code });
    expect(client.createRecord).not.toHaveBeenCalled();
  });

  it('says what to configure when push is off or no push app exists', async () => {
    await expect(executeMobileToolCall(makeClient(instance({ pushOff: true })), 'send_push_notification', { title: 't', body: 'b', user: 'jdoe' }))
      .rejects.toMatchObject({ code: 'NOT_CONFIGURED', message: expect.stringMatching(/glide\.push\.enabled/) });
    await expect(executeMobileToolCall(makeClient(instance({ noApp: true })), 'send_push_notification', { title: 't', body: 'b', user: 'jdoe' }))
      .rejects.toMatchObject({ code: 'NOT_CONFIGURED', message: expect.stringMatching(/Push Applications/) });
  });

  it('fails on unknown users and groups before writing', async () => {
    const client = makeClient(instance());
    await expect(executeMobileToolCall(client, 'send_push_notification', { title: 't', body: 'b', user: 'ghost' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(executeMobileToolCall(client, 'send_push_notification', { title: 't', body: 'b', group: 'Nobody' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(client.createRecord).not.toHaveBeenCalled();
  });
});

describe('send_push_notification', () => {
  it('first call creates event, push message and notification, then fires the event', async () => {
    const client = makeClient(instance());
    const out = await executeMobileToolCall(client, 'send_push_notification', { title: 'Heads up', body: 'P1 open', user: 'jdoe', action_url: 'https://acme.example/x' });
    const tables = client.createRecord.mock.calls.map((c) => c[0]);
    expect(tables).toEqual(['sysevent_register', 'sys_push_notif_msg', 'sysevent_email_action', 'sysevent']);
    expect(client.createRecord.mock.calls[1]![1]).toMatchObject({ push_app: APP, message_string: '${event.parm2}', type: 'push' });
    const msgId = (await client.createRecord.mock.results[1]!.value).sys_id;
    expect(client.createRecord.mock.calls[2]![1]).toMatchObject({
      name: 'NowAIKit push (sys_user)', collection: 'sys_user', event_name: PUSH_EVENT, generation_type: 'event',
      event_parm_1: 'true', push_message_only: 'true', message_list: msgId, active: 'true',
    });
    expect(client.createRecord.mock.calls[3]![1]).toEqual({
      name: PUSH_EVENT, table: 'sys_user', instance: USER, parm1: USER, parm2: 'Heads up\nP1 open\nhttps://acme.example/x', state: 'ready',
    });
    expect(out).toMatchObject({ action: 'queued', recipients: 1, recipients_with_device: 0 });
    expect(out.note).toMatch(/deliver nothing/);
  });

  it('reuses existing setup, targets a record, expands groups and counts devices', async () => {
    const client = makeClient(instance({ setup: true, device: true }));
    const out = await executeMobileToolCall(client, 'send_push_notification', {
      title: 't', body: 'b', group: 'Service Desk', users: ['jdoe'], table: 'incident', record_sys_id: INC,
    });
    expect(client.createRecord.mock.calls.map((c) => c[0])).toEqual(['sysevent']);
    const evt = client.createRecord.mock.calls[0]![1];
    expect(evt).toMatchObject({ table: 'incident', instance: INC });
    expect(evt.parm1.split(',').sort()).toEqual([USER, USER2].sort());
    expect(client.getRecord).toHaveBeenCalledWith('incident', INC, 'sys_id');
    expect(out).toMatchObject({ recipients: 2, groups_expanded: 1, recipients_with_device: 1, setup: { created: [] } });
    const deviceQuery = client.queryRecords.mock.calls.find((c) => c[0].table === 'cmn_notif_device')![0].query;
    expect(deviceQuery).toContain(`push_appIN${APP}`);
    expect(deviceQuery).toContain('type=Push^active=true');
  });

  it('repairs a reused notification that lost its push message', async () => {
    const base = instance({ setup: true });
    const client = makeClient((t, q) => (t === 'sysevent_email_action'
      ? [{ sys_id: NOTIF, name: 'NowAIKit push (sys_user)', collection: 'sys_user', message_list: '', active: 'false', event_name: PUSH_EVENT }]
      : base(t, q)));
    await executeMobileToolCall(client, 'send_push_notification', { title: 't', body: 'b', user: USER });
    expect(client.updateRecord).toHaveBeenCalledWith('sysevent_email_action', NOTIF, { message_list: MSG, active: 'true' });
  });

  it('setup_only prepares without firing anything', async () => {
    const client = makeClient(instance());
    const out = await executeMobileToolCall(client, 'send_push_notification', { title: 't', body: 'b', setup_only: true });
    expect(client.createRecord.mock.calls.map((c) => c[0])).not.toContain('sysevent');
    expect(out.action).toBe('setup');
  });

  it('caps recipients at what one event can carry', async () => {
    const many = Array.from({ length: 121 }, (_, i) => ({ user: i.toString(16).padStart(32, '0'), group: GROUP }));
    const base = instance();
    const client = makeClient((t, q) => (t === 'sys_user_grmember' ? many : base(t, q)));
    await expect(executeMobileToolCall(client, 'send_push_notification', { title: 't', body: 'b', group: 'Service Desk' })).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    expect(client.createRecord).not.toHaveBeenCalled();
  });
});

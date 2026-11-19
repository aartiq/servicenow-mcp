import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  executeOttoToolCall, getOttoToolDefinitions, moveworksBase, moveworksReplyText,
} from '../../src/tools/otto.js';
import type { ServiceNowClient } from '../../src/servicenow/client.js';

const mockClient = {
  instanceUrl: 'https://example.service-now.com',
  queryRecords: vi.fn(),
  updateRecord: vi.fn(),
  createRecord: vi.fn(),
  apiRequest: vi.fn(),
  authorizationHeader: vi.fn(),
} as unknown as ServiceNowClient;

const q = mockClient.queryRecords as ReturnType<typeof vi.fn>;
const upd = mockClient.updateRecord as ReturnType<typeof vi.fn>;
const api = mockClient.apiRequest as ReturnType<typeof vi.fn>;

const AGENT = 'a'.repeat(32);
const CFG = 'c'.repeat(32);
const ASSET = 'd'.repeat(32);
const USER = 'e'.repeat(32);
const ACL = 'f'.repeat(32);
const SKILL = '1'.repeat(32);

/** Route queryRecords calls by table to canned rows. */
function tables(map: Record<string, any[] | ((p: any) => any[])>) {
  q.mockImplementation(async (p: any) => {
    const v = map[p.table];
    const rows = typeof v === 'function' ? v(p) : v ?? [];
    return { count: rows.length, records: rows };
  });
}

const agentRow = { sys_id: AGENT, name: 'Triage agent', sys_scope: { value: 'scope1', display_value: 'ITSM agents' }, 'sys_scope.scope': 'sn_itsm_aia' };

const ENV_KEYS = ['WRITE_ENABLED', 'NOWAIKIT_OTTO_AGENT', 'MOVEWORKS_API_BASE', 'MOVEWORKS_API_TOKEN', 'MOVEWORKS_ASSISTANT_NAME', 'NOWAIKIT_SN_MCP_TOKEN', 'NOWAIKIT_OTTO_POLL_MS'];
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  vi.resetAllMocks();
  for (const k of ENV_KEYS) { saved[k] = process.env[k]; delete process.env[k]; }
});
afterEach(() => {
  for (const k of ENV_KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  vi.unstubAllGlobals();
});

describe('getOttoToolDefinitions', () => {
  const defs = getOttoToolDefinitions();
  it('exposes the Otto tools with explicit annotations', () => {
    expect(defs.map((d) => d.name)).toEqual(['ask_otto', 'ai_kill_switch', 'test_agent_access', 'list_ai_policies']);
    for (const d of defs) {
      expect(d.inputSchema.type).toBe('object');
      expect(d.annotations).toBeDefined();
      expect(d.description).not.toMatch(/[–—]/);
    }
    expect(defs.find((d) => d.name === 'test_agent_access')!.annotations.readOnlyHint).toBe(true);
    expect(defs.find((d) => d.name === 'ai_kill_switch')!.annotations.destructiveHint).toBe(true);
    expect(defs.find((d) => d.name === 'ask_otto')!.description).toMatch(/not verified against a live tenant/);
  });
});

describe('executeOttoToolCall', () => {
  it('returns null for unknown tools', async () => {
    expect(await executeOttoToolCall(mockClient, 'nope', {})).toBeNull();
  });

  describe('ai_kill_switch', () => {
    it('reads status without needing write access', async () => {
      tables({
        sn_aia_agent: [agentRow],
        sn_aia_agent_config: [{ sys_id: CFG, active: 'true', public: 'false', run_as_user: '', sys_scope: 'scope1' }],
        alm_ai_digital_asset: [{ sys_id: ASSET, display_name: 'Triage agent' }],
      });
      const r = await executeOttoToolCall(mockClient, 'ai_kill_switch', { action: 'status', target: 'Triage agent' });
      expect(r.active).toBe(true);
      expect(r.switch.table).toBe('sn_aia_agent_config');
      expect(r.ai_asset.sys_id).toBe(ASSET);
      expect(upd).not.toHaveBeenCalled();
    });

    it('needs WRITE_ENABLED, confirm=true and a reason to contain', async () => {
      await expect(executeOttoToolCall(mockClient, 'ai_kill_switch', { action: 'contain', target: AGENT, reason: 'x', confirm: true })).rejects.toThrow(/WRITE_ENABLED/);
      process.env.WRITE_ENABLED = 'true';
      await expect(executeOttoToolCall(mockClient, 'ai_kill_switch', { action: 'contain', target: AGENT, reason: 'x' })).rejects.toThrow(/confirm=true/);
      await expect(executeOttoToolCall(mockClient, 'ai_kill_switch', { action: 'contain', target: AGENT, confirm: true })).rejects.toThrow(/reason is required/);
      expect(upd).not.toHaveBeenCalled();
    });

    it('contains an agent, re-reads it and writes the reason on the AI asset', async () => {
      process.env.WRITE_ENABLED = 'true';
      let active = 'true';
      upd.mockImplementation(async (table: string, _id: string, data: any) => { if (table === 'sn_aia_agent_config') active = data.active; return {}; });
      tables({
        sn_aia_agent: [agentRow],
        sn_aia_agent_config: () => [{ sys_id: CFG, active, public: 'false', run_as_user: '' }],
        alm_ai_digital_asset: [{ sys_id: ASSET, display_name: 'Triage agent' }],
      });
      const r = await executeOttoToolCall(mockClient, 'ai_kill_switch', { action: 'contain', target: AGENT, reason: 'bad output', confirm: true });
      expect(r).toMatchObject({ changed: true, active: false, previous_active: true });
      expect(upd).toHaveBeenCalledWith('sn_aia_agent_config', CFG, { active: 'false' });
      const note = upd.mock.calls.find((c) => c[0] === 'alm_ai_digital_asset')!;
      expect(note[1]).toBe(ASSET);
      expect(note[2].work_notes).toMatch(/Contained AI agent "Triage agent".*Reason: bad output/);
      expect(r.undo).toMatchObject({ action: 'restore', target: AGENT });
    });

    it('does nothing when the target is already in the requested state', async () => {
      process.env.WRITE_ENABLED = 'true';
      tables({ sn_aia_agent: [agentRow], sn_aia_agent_config: [{ sys_id: CFG, active: 'true' }], alm_ai_digital_asset: [] });
      const r = await executeOttoToolCall(mockClient, 'ai_kill_switch', { action: 'restore', target: AGENT, reason: 'ok', confirm: true });
      expect(r.changed).toBe(false);
      expect(upd).not.toHaveBeenCalled();
    });

    it('reports when the update did not stick', async () => {
      process.env.WRITE_ENABLED = 'true';
      upd.mockResolvedValue({});
      tables({ sn_aia_agent: [agentRow], sn_aia_agent_config: [{ sys_id: CFG, active: 'true' }], alm_ai_digital_asset: [] });
      await expect(executeOttoToolCall(mockClient, 'ai_kill_switch', { action: 'contain', target: AGENT, reason: 'x', confirm: true }))
        .rejects.toThrow(/still true/);
    });

    it('uses the workflow activation record and refuses when there is none', async () => {
      process.env.WRITE_ENABLED = 'true';
      tables({ sn_aia_usecase: [{ sys_id: AGENT, name: 'Resolve flow', 'sys_scope.scope': 'x' }], sn_aia_usecase_config_override: [] });
      await expect(executeOttoToolCall(mockClient, 'ai_kill_switch', { action: 'contain', target_type: 'workflow', target: AGENT, reason: 'x', confirm: true }))
        .rejects.toThrow(/no activation record/);
    });

    it('rejects an unknown target_type', async () => {
      await expect(executeOttoToolCall(mockClient, 'ai_kill_switch', { action: 'status', target_type: 'robot', target: AGENT })).rejects.toThrow(/target_type/);
    });

    it('asks for a precise name when several agents match', async () => {
      tables({ sn_aia_agent: (p: any) => (p.query.startsWith('name=') ? [] : [agentRow, { ...agentRow, sys_id: CFG, name: 'Triage agent two' }]) });
      await expect(executeOttoToolCall(mockClient, 'ai_kill_switch', { action: 'status', target: 'Triage' })).rejects.toThrow(/more than one/);
    });
  });

  describe('test_agent_access', () => {
    const acl = {
      sys_id: ACL, name: 'global.sn_itsm_aia.Triage agent', decision_type: 'allow', admin_overrides: 'true', condition: '', script: '', advanced: 'false',
      'security_attribute.name': 'sn_itsm_aia__ACL_x', 'security_attribute.condition': 'UserIsAuthenticated=true',
    };
    const base = (roles: string[], extra: Record<string, any> = {}) => tables({
      sn_aia_agent: [agentRow],
      sys_user: [{ sys_id: USER, user_name: 'abel.tuter', name: 'Abel Tuter', active: 'true', locked_out: 'false' }],
      sys_user_has_role: roles.map((r) => ({ 'role.name': r })),
      sn_aia_agent_config: [{ sys_id: CFG, active: 'true', run_as_user: '' }],
      sys_security_acl: [acl, { ...acl, sys_id: '2'.repeat(32), name: 'global.other_sn_itsm_aia.Triage agent' }],
      sys_security_acl_role: [{ sys_security_acl: ACL, 'sys_user_role.name': 'itil' }],
      sys_agent_access_role_configuration: [{ action: 'limit_to_roles', role_list: { value: 'x', display_value: 'itil, sn_incident_write' }, allow_all_session_roles: 'false' }],
      ...extra,
    });

    it('denies a user without the ACL role and explains why', async () => {
      base(['snc_internal']);
      const r = await executeOttoToolCall(mockClient, 'test_agent_access', { user: 'abel.tuter', target: 'Triage agent' });
      expect(r.verdict).toBe('denied');
      expect(r.reasons.join(' ')).toMatch(/needs one of roles: itil/);
      // the ENDSWITH query also matched a longer scope; only the exact <domain>.<scope>.<name> ACL counts
      expect(r.acls).toHaveLength(1);
      expect(r.data_access.role_masking.effective_roles_for_user).toEqual([]);
      const aclQuery = q.mock.calls.find((c) => c[0].table === 'sys_security_acl')![0].query;
      expect(aclQuery).toContain('type.name=gen_ai_agent^operation=execute^active=true^nameENDSWITH.sn_itsm_aia.Triage agent^ORname=*');
    });

    it('allows a user with the role, and admin via admin overrides', async () => {
      base(['itil']);
      expect((await executeOttoToolCall(mockClient, 'test_agent_access', { user: USER, target: AGENT })).verdict).toBe('allowed');
      base(['admin']);
      const r = await executeOttoToolCall(mockClient, 'test_agent_access', { user: USER, target: AGENT });
      expect(r.verdict).toBe('allowed');
      expect(r.reasons.join(' ')).toMatch(/Admin overrides/);
    });

    it('denies everyone when the agent is inactive', async () => {
      base(['itil'], { sn_aia_agent_config: [{ sys_id: CFG, active: 'false' }] });
      const r = await executeOttoToolCall(mockClient, 'test_agent_access', { user: USER, target: AGENT });
      expect(r.verdict).toBe('denied');
      expect(r.reasons[0]).toMatch(/inactive/);
    });

    it('falls back to the wildcard rule and honours a Never attribute', async () => {
      base(['itil'], { sys_security_acl: [{ sys_id: ACL, name: '*', decision_type: 'allow', 'security_attribute.name': 'Never' }], sys_security_acl_role: [] });
      const r = await executeOttoToolCall(mockClient, 'test_agent_access', { user: USER, target: AGENT });
      expect(r.verdict).toBe('denied');
      expect(r.reasons.join(' ')).toMatch(/Never/);
    });

    it('is undetermined when an ACL condition cannot be evaluated', async () => {
      base(['itil'], { sys_security_acl: [{ ...acl, condition: 'active=true' }] });
      const r = await executeOttoToolCall(mockClient, 'test_agent_access', { user: USER, target: AGENT });
      expect(r.verdict).toBe('undetermined');
      expect(r.not_evaluated[0]).toMatch(/condition not evaluated/);
    });

    it('matches skill ACLs by the skill config sys_id and applies the skill role filter', async () => {
      tables({
        sn_nowassist_skill_config: [{ sys_id: SKILL, name: 'Incident assist', active: 'true', in_product_roles: 'itil' }],
        sys_user: [{ sys_id: USER, user_name: 'abel.tuter', active: 'true', locked_out: 'false' }],
        sys_user_has_role: [{ 'role.name': 'snc_internal' }],
        sys_security_acl: [{ sys_id: ACL, name: `incident_assist.${SKILL}`, decision_type: 'allow' }],
        sys_security_acl_role: [],
      });
      const r = await executeOttoToolCall(mockClient, 'test_agent_access', { user: USER, target_type: 'skill', target: SKILL });
      expect(r.verdict).toBe('denied');
      expect(r.reasons.join(' ')).toMatch(/limited to roles: itil/);
      const aclQuery = q.mock.calls.find((c) => c[0].table === 'sys_security_acl')![0].query;
      expect(aclQuery).toContain(`type.name=gen_ai_skill^operation=execute^active=true^nameENDSWITH.${SKILL}`);
    });
  });

  describe('list_ai_policies', () => {
    it('collects filters and properties and notes missing tables', async () => {
      q.mockImplementation(async (p: any) => {
        if (p.table.startsWith('sn_ai_governance_') || p.table === 'sn_aia_guardrail') throw new Error('Invalid table ' + p.table);
        if (p.table === 'sys_gen_ai_filter') return { count: 1, records: [{ sys_id: ACL, filter_name: 'Personal issues', active: 'true', filter_type: 'Sensitive' }] };
        if (p.table === 'sys_properties') return { count: 1, records: [{ name: 'sn_aia.external_agent_guardian_check', value: 'true' }] };
        return { count: 0, records: [] };
      });
      const r = await executeOttoToolCall(mockClient, 'list_ai_policies', {});
      expect(r.sensitive_topic_filters.rows[0]).toMatchObject({ name: 'Personal issues', active: true });
      expect(r.guardrail_properties['sn_aia.external_agent_guardian_check']).toBe('true');
      expect(r.notes).toContain('sn_ai_governance_policy is not on this instance');
    });
  });

  describe('ask_otto', () => {
    it('needs WRITE_ENABLED and a message', async () => {
      await expect(executeOttoToolCall(mockClient, 'ask_otto', { message: 'hi' })).rejects.toThrow(/WRITE_ENABLED/);
      process.env.WRITE_ENABLED = 'true';
      await expect(executeOttoToolCall(mockClient, 'ask_otto', { message: ' ' })).rejects.toThrow(/message is required/);
    });

    it('explains the fix when no agent is open to A2A', async () => {
      process.env.WRITE_ENABLED = 'true';
      tables({ sn_aia_agent_config: [] });
      await expect(executeOttoToolCall(mockClient, 'ask_otto', { message: 'hi' })).rejects.toThrow(/NOWAIKIT_OTTO_AGENT/);
    });

    it('sends over A2A to the exposed agent that looks like a front door', async () => {
      process.env.WRITE_ENABLED = 'true';
      process.env.NOWAIKIT_SN_MCP_TOKEN = 'a.b.c';
      tables({
        sn_aia_agent_config: [
          { agent: { value: CFG, display_value: 'Change risk agent' } },
          { agent: { value: AGENT, display_value: 'Otto orchestrator' } },
        ],
        sn_aia_agent: (p: any) => [{ sys_id: p.query.includes(AGENT) ? AGENT : CFG, name: 'Otto orchestrator' }],
      });
      api.mockImplementation(async (method: string, path: string, body: any) => {
        if (method === 'GET') return { result: { defaultOutputModes: ['text/plain'] } };
        expect(path).toBe(`/api/sn_aia/a2a/v2/agent/id/${AGENT}`);
        expect(body.method).toBe('message/send');
        return { result: { kind: 'message', parts: [{ kind: 'text', text: 'Hello from Otto' }], contextId: 'ctx1' } };
      });
      const r = await executeOttoToolCall(mockClient, 'ask_otto', { message: 'hi' });
      expect(r).toMatchObject({ route: 'a2a', reply: 'Hello from Otto', context_id: 'ctx1', state: 'completed' });
      expect(r.agent_chosen_by).toMatch(/orchestrator/);
      expect(r.other_candidates).toHaveLength(2);
    });

    it('handles an instance that runs A2A asynchronously: registers the callback, resends and polls', async () => {
      process.env.WRITE_ENABLED = 'true';
      process.env.NOWAIKIT_SN_MCP_TOKEN = 'a.b.c';
      process.env.NOWAIKIT_OTTO_AGENT = AGENT;
      tables({ sn_aia_agent: [{ sys_id: AGENT, name: 'Otto' }], sn_aia_external_agent_callback_registry: [] });
      const create = mockClient.createRecord as ReturnType<typeof vi.fn>;
      create.mockResolvedValue({ sys_id: 'cb' });
      let posts = 0;
      api.mockImplementation(async (method: string, _path: string, body: any) => {
        if (method === 'GET') return { result: { defaultOutputModes: ['text/plain'] } };
        posts++;
        if (posts === 1) throw new Error('Invalid method parameters: Push Notification URL is required for asynchronous requests');
        expect(body.params.configuration.pushNotificationConfig.url).toMatch(/\.invalid\//);
        return { result: { id: 't1', status: { state: 'completed', message: { parts: [{ kind: 'text', text: 'All done' }] } } } };
      });
      const r = await executeOttoToolCall(mockClient, 'ask_otto', { message: 'hi' });
      expect(create).toHaveBeenCalledWith('sn_aia_external_agent_callback_registry', expect.objectContaining({ state: 'verified' }));
      expect(r).toMatchObject({ route: 'a2a', reply: 'All done', state: 'completed', mode: 'async (polled)' });
    });

    it('prefers NOWAIKIT_OTTO_AGENT over Moveworks in auto mode', async () => {
      process.env.WRITE_ENABLED = 'true';
      process.env.NOWAIKIT_SN_MCP_TOKEN = 'a.b.c';
      process.env.NOWAIKIT_OTTO_AGENT = AGENT;
      process.env.MOVEWORKS_API_BASE = 'https://api.moveworks.ai';
      process.env.MOVEWORKS_API_TOKEN = 'mwt_x';
      tables({ sn_aia_agent: [{ sys_id: AGENT, name: 'Otto' }] });
      api.mockResolvedValue({ result: { kind: 'message', parts: [{ kind: 'text', text: 'ok' }] } });
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
      const r = await executeOttoToolCall(mockClient, 'ask_otto', { message: 'hi' });
      expect(r.route).toBe('a2a');
      expect(r.agent_chosen_by).toBe('NOWAIKIT_OTTO_AGENT');
      expect(fetchMock).not.toHaveBeenCalled();
    });

    describe('moveworks route (request shape only, not verified against a live tenant)', () => {
      const json = (status: number, body: unknown) => ({ ok: status < 400, status, statusText: '', text: async () => JSON.stringify(body) });

      beforeEach(() => {
        process.env.WRITE_ENABLED = 'true';
        process.env.MOVEWORKS_API_BASE = 'https://api.moveworks.ai/';
        process.env.MOVEWORKS_API_TOKEN = 'mwt_token';
        process.env.MOVEWORKS_ASSISTANT_NAME = 'otto-bot';
        process.env.NOWAIKIT_OTTO_POLL_MS = '10';
      });

      it('creates a conversation, posts the message and polls until COMPLETED', async () => {
        const calls: Array<{ url: string; init: any }> = [];
        const fetchMock = vi.fn(async (url: string, init: any) => {
          calls.push({ url, init });
          if (url.endsWith('/rest/v1/conversations')) return json(201, { conversation_id: 'conv_1' });
          if (url.endsWith('/conversations/conv_1/responses')) return json(202, { response_id: 'resp_1', status: 'IN_PROGRESS' });
          return json(200, {
            response_id: 'resp_1', status: 'COMPLETED',
            outputs: [
              { type: 'REASONING_MESSAGE', reasoning_message: { text: 'thinking' } },
              { type: 'MESSAGE', message: { actor: 'ASSISTANT', content: { type: 'MARKDOWN_TEXT', markdown_text: { text: 'Your laptop ships Friday.' } } } },
            ],
          });
        });
        vi.stubGlobal('fetch', fetchMock);
        const r = await executeOttoToolCall(mockClient, 'ask_otto', { message: 'Where is my laptop?' });
        expect(r).toMatchObject({ route: 'moveworks', reply: 'Your laptop ships Friday.', state: 'completed', conversation_id: 'conv_1' });
        expect(r.verified).toMatch(/not verified/);
        expect(calls[0]!.init.method).toBe('POST');
        expect(calls[0]!.init.headers).toMatchObject({ Authorization: 'Bearer mwt_token', 'Assistant-Name': 'otto-bot' });
        expect(JSON.parse(calls[1]!.init.body)).toEqual({ input: { chat: { text: 'Where is my laptop?' } } });
        expect(calls[2]!.url).toBe('https://api.moveworks.ai/rest/v1/conversations/conv_1/responses/resp_1');
        expect(calls[2]!.init.method).toBe('GET');
        expect(q).not.toHaveBeenCalled();
      });

      it('continues an existing conversation without creating a new one', async () => {
        const fetchMock = vi.fn(async () => json(202, { response_id: 'resp_2', status: 'COMPLETED', outputs: [] }));
        vi.stubGlobal('fetch', fetchMock);
        await executeOttoToolCall(mockClient, 'ask_otto', { message: 'and now?', conversation_id: 'conv_9', route: 'moveworks' });
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect((fetchMock.mock.calls[0] as any)[0]).toBe('https://api.moveworks.ai/rest/v1/conversations/conv_9/responses');
      });

      it('turns Moveworks errors into a fix', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => json(401, { error: { code: 'UNAUTHORIZED', message: 'bad token' } })));
        await expect(executeOttoToolCall(mockClient, 'ask_otto', { message: 'x', route: 'moveworks' })).rejects.toThrow(/UNAUTHORIZED.*oauth\/v1\/token/);
      });

      it('requires the assistant name', async () => {
        delete process.env.MOVEWORKS_ASSISTANT_NAME;
        await expect(executeOttoToolCall(mockClient, 'ask_otto', { message: 'x', route: 'moveworks' })).rejects.toThrow(/MOVEWORKS_ASSISTANT_NAME/);
      });
    });
  });
});

describe('moveworks helpers', () => {
  it('normalises the base URL and requires https', () => {
    expect(moveworksBase('https://api.am-eu-central.moveworks.ai')).toBe('https://api.am-eu-central.moveworks.ai/rest/v1');
    expect(moveworksBase('https://api.moveworks.ai/rest/v1/')).toBe('https://api.moveworks.ai/rest/v1');
    expect(() => moveworksBase('http://api.moveworks.ai')).toThrow(/https/);
  });
  it('reads assistant text in the documented content shapes', () => {
    expect(moveworksReplyText([
      { type: 'MESSAGE', message: { actor: 'USER', content: { plain_text: 'question' } } },
      { type: 'MESSAGE', message: { actor: 'ASSISTANT', content: { type: 'PLAIN_TEXT', plain_text: 'a' } } },
      { type: 'MESSAGE', message: { actor: 'ASSISTANT', content: { type: 'COMMONMARK_TEXT', commonmark_text: { text: 'b' } } } },
    ])).toBe('a\n\nb');
    expect(moveworksReplyText(undefined)).toBe('');
  });
});

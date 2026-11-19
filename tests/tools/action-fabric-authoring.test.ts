/**
 * MCP Server Console authoring (sn_mcp_create_server / add_tool / remove_tool / delete_server) and the MCP client
 * registry (sn_mcp_list_registry / register / unregister), against a mocked client.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { executeActionFabricToolCall, getActionFabricToolDefinitions, serverFootprint, slugName } from '../../src/tools/action-fabric.js';
import type { ServiceNowClient } from '../../src/servicenow/client.js';

const INSTANCE = 'https://acme.service-now.com';
const SERVER = '1'.repeat(32);
const TOOL_A = 'a'.repeat(32);
const TOOL_B = 'b'.repeat(32);
const SKILL = 'c'.repeat(32);
const CAP = 'd'.repeat(32);
const OP = 'e'.repeat(32);
const ALIAS = 'f'.repeat(32);

type Rows = Record<string, any>[];
type Handler = (table: string, query: string, params: any) => Rows | undefined;

function makeClient(handler: Handler) {
  let n = 0;
  const client = {
    instanceUrl: INSTANCE,
    queryRecords: vi.fn(async (params: any) => {
      const records = handler(params.table, params.query || '', params) || [];
      return { count: records.length, records };
    }),
    createRecord: vi.fn(async (table: string, data: any) => ({ sys_id: `${String(++n).padStart(2, '0')}`.padEnd(32, '9'), sys_class_name: table, ...data })),
    updateRecord: vi.fn(async (_t: string, sys_id: string, data: any) => ({ sys_id, ...data })),
    deleteRecord: vi.fn(async () => undefined),
    getRecord: vi.fn(async () => ({ sys_id: SERVER })),
  };
  return client as typeof client & ServiceNowClient;
}

const serverRow = (over: Record<string, any> = {}) => ({
  sys_id: SERVER, name: 'acme_tools', label: 'Acme tools', status: 'active', tools: TOOL_A,
  url: `${INSTANCE}/sncapps/mcp-server/mcp/acme_tools`, sys_scope: 'global', ...over,
});

beforeEach(() => { process.env.WRITE_ENABLED = 'true'; });
afterEach(() => { delete process.env.WRITE_ENABLED; });

describe('definitions', () => {
  const defs = getActionFabricToolDefinitions();
  const byName = Object.fromEntries(defs.map((d) => [d.name, d]));
  it('adds the authoring and registry tools with explicit annotations', () => {
    for (const n of ['sn_mcp_create_server', 'sn_mcp_delete_server', 'sn_mcp_add_tool', 'sn_mcp_remove_tool', 'sn_mcp_list_registry',
      'sn_mcp_register_external_server', 'sn_mcp_unregister_external_server']) {
      expect(byName[n], n).toBeDefined();
      expect(byName[n]!.annotations).toBeDefined();
    }
    expect(byName.sn_mcp_list_registry!.annotations.readOnlyHint).toBe(true);
    expect((byName.sn_mcp_delete_server!.annotations as any).destructiveHint).toBe(true);
    expect((byName.sn_mcp_remove_tool!.annotations as any).destructiveHint).toBe(true);
  });
  it('explains the auto-created OAuth / ACL records in the create description', () => {
    expect(byName.sn_mcp_create_server!.description).toMatch(/OAuth client/);
    expect(byName.sn_mcp_create_server!.description).toMatch(/execute ACL/);
  });
});

describe('slugName', () => {
  it('follows the MCP Server Console naming rule', () => {
    expect(slugName('NowAIKit test 2026!')).toBe('nowaikit_test_2026');
    expect(slugName('  --Service Desk--  ')).toBe('service_desk');
  });
});

describe('write gating', () => {
  const client = makeClient(() => []);
  it.each([
    ['sn_mcp_create_server', { label: 'x' }],
    ['sn_mcp_delete_server', { server: 'x' }],
    ['sn_mcp_add_tool', { server: 'x', tool: 'y' }],
    ['sn_mcp_remove_tool', { server: 'x', tool: 'y' }],
    ['sn_mcp_register_external_server', { name: 'x', url: 'https://x' }],
    ['sn_mcp_unregister_external_server', { server: 'x' }],
  ])('%s needs WRITE_ENABLED', async (name, args) => {
    delete process.env.WRITE_ENABLED;
    await expect(executeActionFabricToolCall(client, name, args)).rejects.toMatchObject({ code: 'WRITE_NOT_ENABLED' });
    expect(client.createRecord).not.toHaveBeenCalled();
  });
});

describe('sn_mcp_create_server', () => {
  it('creates a draft server with a derived name, endpoint URL and attached tools', async () => {
    const client = makeClient((table, query) => {
      if (table === 'sn_mcp_tool_definition') return [{ sys_id: TOOL_A, name: 'sn_mcp_server.incident_summarization', servers: '' }];
      return [];
    });
    const out = await executeActionFabricToolCall(client, 'sn_mcp_create_server', { label: 'Acme Tools', tools: ['sn_mcp_server.incident_summarization'] });
    expect(client.createRecord).toHaveBeenCalledWith('sn_mcp_server_registry', {
      label: 'Acme Tools', name: 'acme_tools', status: 'draft', url: `${INSTANCE}/sncapps/mcp-server/mcp/acme_tools`,
      short_description: 'Acme Tools', tools: TOOL_A,
    });
    expect(out.endpoint).toBe(`${INSTANCE}/sncapps/mcp-server/mcp/acme_tools`);
    expect(out.auto_created).toBeUndefined();
    // the clash check looks at both name and URL
    expect(client.queryRecords.mock.calls[0]![0].query).toBe(`name=acme_tools^ORurl=${INSTANCE}/sncapps/mcp-server/mcp/acme_tools`);
  });

  it('maps dotted names to underscores in the endpoint', async () => {
    const client = makeClient(() => []);
    const out = await executeActionFabricToolCall(client, 'sn_mcp_create_server', { label: 'X', name: 'x_acme.tools' });
    expect(out.endpoint).toBe(`${INSTANCE}/sncapps/mcp-server/mcp/x_acme_tools`);
  });

  it('rejects bad names, long labels and existing servers', async () => {
    const client = makeClient((table) => (table === 'sn_mcp_server_registry' ? [{ sys_id: SERVER, name: 'acme_tools' }] : []));
    await expect(executeActionFabricToolCall(client, 'sn_mcp_create_server', {})).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    await expect(executeActionFabricToolCall(client, 'sn_mcp_create_server', { label: 'x', name: 'Bad Name' })).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    await expect(executeActionFabricToolCall(client, 'sn_mcp_create_server', { label: 'x'.repeat(51) })).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    await expect(executeActionFabricToolCall(client, 'sn_mcp_create_server', { label: 'Acme tools' })).rejects.toMatchObject({ code: 'ALREADY_EXISTS' });
    expect(client.createRecord).not.toHaveBeenCalled();
  });

  it('fails before writing when a tool to attach does not exist', async () => {
    const client = makeClient(() => []);
    await expect(executeActionFabricToolCall(client, 'sn_mcp_create_server', { label: 'x', tools: ['nope'] })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(client.createRecord).not.toHaveBeenCalled();
  });

  it('returns the auto-created records for an active server', async () => {
    const client = makeClient((table, query) => {
      if (table === 'oauth_entity' && query === 'name=acme') return [{ sys_id: '2'.repeat(32), name: 'acme' }];
      if (table === 'sys_security_acl') return [{ sys_id: '3'.repeat(32), name: 'acme', operation: 'execute' }];
      return [];
    });
    const out = await executeActionFabricToolCall(client, 'sn_mcp_create_server', { label: 'Acme', status: 'active' });
    expect(out.auto_created.map((f: any) => f.table).sort()).toEqual(['oauth_entity', 'sys_security_acl']);
    expect(out.note).toMatch(/OAuth client "acme"/);
  });
});

describe('serverFootprint', () => {
  it('drops rows that do not really match (ServiceNow ignores unknown query fields and returns everything)', async () => {
    const stranger = { sys_id: '4'.repeat(32), name: 'someone_else', mcp_url: 'https://other', servicenow_ref_id: 'x', oauth_resource: 'https://other' };
    const client = makeClient(() => [stranger]);
    const out = await serverFootprint(client, { sys_id: SERVER, name: 'acme' });
    expect(out).toEqual([]);
  });

  it('collects the AutoGen alias chain', async () => {
    const client = makeClient((table, query) => {
      if (table === 'sys_alias' && query.startsWith('nameSTARTSWITHAutoGen-acme-')) return [{ sys_id: ALIAS, name: 'AutoGen-acme-1-OAuthProviderAlias' }];
      if (table === 'sys_connection') return [{ sys_id: '5'.repeat(32), name: 'conn', credential: '6'.repeat(32), connection_alias: ALIAS }];
      if (table === 'discovery_credentials') return [{ sys_id: '6'.repeat(32), name: 'cred' }];
      return [];
    });
    const out = await serverFootprint(client, { sys_id: SERVER, name: 'acme' });
    expect(out.map((f) => f.table)).toEqual(['sys_alias', 'http_connection', 'discovery_credentials']);
  });
});

describe('sn_mcp_add_tool', () => {
  it('needs exactly one source', async () => {
    const client = makeClient((t) => (t === 'sn_mcp_server_registry' ? [serverRow()] : []));
    await expect(executeActionFabricToolCall(client, 'sn_mcp_add_tool', { server: 'acme_tools' })).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    await expect(executeActionFabricToolCall(client, 'sn_mcp_add_tool', { server: 'acme_tools', tool: 'x', skill: 'y' })).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
  });

  it('attaches an existing definition without creating one', async () => {
    const client = makeClient((t) => {
      if (t === 'sn_mcp_server_registry') return [serverRow()];
      if (t === 'sn_mcp_tool_definition') return [{ sys_id: TOOL_B, name: 'acme.lookup', label: 'Lookup', servers: '' }];
      return [];
    });
    const out = await executeActionFabricToolCall(client, 'sn_mcp_add_tool', { server: 'acme_tools', tool: 'acme.lookup' });
    expect(out.attached).toBe(true);
    expect(client.updateRecord).toHaveBeenCalledWith('sn_mcp_server_registry', SERVER, { tools: `${TOOL_A},${TOOL_B}` });
    expect(client.createRecord).not.toHaveBeenCalled();
  });

  it('creates a skill tool with the chosen skill inputs, static values fixed', async () => {
    const client = makeClient((t, query) => {
      if (t === 'sn_mcp_server_registry') return [serverRow()];
      if (t === 'sn_nowassist_skill_config' && query === 'name=Incident summarization') return [{ sys_id: SKILL, name: 'Incident summarization', description: '<p>Summarize</p>', skill_id: CAP }];
      if (t === 'sys_one_extend_definition_attribute') return [
        { sys_id: '7'.repeat(32), name: 'sysid', description: '', capability: CAP },
        { sys_id: '8'.repeat(32), name: 'tablename', description: '', capability: CAP },
        { sys_id: '9'.repeat(32), name: 'priority', description: 'Priority', capability: CAP },
      ];
      return [];
    });
    const out = await executeActionFabricToolCall(client, 'sn_mcp_add_tool', {
      server: 'acme_tools', skill: 'Incident summarization', inputs: [{ name: 'tablename', value: 'incident' }, { name: 'sysid', value: 'incident.number' }],
    });
    expect(client.createRecord).toHaveBeenCalledWith('sn_mcp_ai_skill_tool_definition', {
      label: 'Incident summarization', tool: SKILL, description: 'Summarize', name: 'incident_summarization', category: 'ai_skill',
    });
    const inputCalls = client.createRecord.mock.calls.filter((c) => c[0] === 'sn_mcp_ai_skill_tool_input');
    expect(inputCalls).toHaveLength(2);
    expect(inputCalls.find((c) => c[1].tool_input === '8'.repeat(32))![1]).toMatchObject({ static_value: 'true', value: 'incident', enabled: 'true' });
    expect(out.inputs.map((i: any) => i.name).sort()).toEqual(['sysid', 'tablename']);
    expect(client.updateRecord).toHaveBeenCalledWith('sn_mcp_server_registry', SERVER, { tools: `${TOOL_A},${out.tool.sys_id}` });
  });

  it('rejects skill inputs the skill does not have', async () => {
    const client = makeClient((t) => {
      if (t === 'sn_mcp_server_registry') return [serverRow()];
      if (t === 'sn_nowassist_skill_config') return [{ sys_id: SKILL, name: 'S', skill_id: CAP }];
      if (t === 'sys_one_extend_definition_attribute') return [{ sys_id: '7'.repeat(32), name: 'sysid', capability: CAP }];
      return [];
    });
    await expect(executeActionFabricToolCall(client, 'sn_mcp_add_tool', { server: 'acme_tools', skill: SKILL, inputs: [{ name: 'bogus' }] }))
      .rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    expect(client.createRecord).not.toHaveBeenCalled();
  });

  it('creates a Scripted REST tool, puts the category back to rest_api and adds typed inputs', async () => {
    const client = makeClient((t, query) => {
      if (t === 'sn_mcp_server_registry') return [serverRow()];
      if (t === 'sys_ws_operation') {
        expect(query).toBe('operation_uri=/api/acme/lookup/get^http_method=POST^active=true');
        return [{ sys_id: OP, name: 'Lookup records', http_method: 'POST', operation_uri: '/api/acme/lookup/get' }];
      }
      return [];
    });
    // the platform's "Default Label and Category" rule forces ai_skill on insert
    client.createRecord.mockImplementationOnce(async (table: string, data: any) => ({ sys_id: TOOL_B, ...data, category: 'ai_skill' }));
    const out = await executeActionFabricToolCall(client, 'sn_mcp_add_tool', {
      server: 'acme_tools', rest_operation: 'post /api/acme/lookup/get', inputs: [{ name: 'table', value: 'incident' }, { name: 'limit', type: 'number', mandatory: true }],
    });
    expect(client.createRecord.mock.calls[0]![0]).toBe('sn_mcp_scripted_rest_tool_definition');
    expect(client.createRecord.mock.calls[0]![1]).toMatchObject({ tool: OP, category: 'rest_api', name: 'lookup_records' });
    expect(client.updateRecord).toHaveBeenCalledWith('sn_mcp_scripted_rest_tool_definition', TOOL_B, { category: 'rest_api' });
    const limit = client.createRecord.mock.calls.find((c) => c[0] === 'sn_mcp_scripted_rest_input' && c[1].name === 'limit')!;
    expect(limit[1]).toMatchObject({ type: 'number', mandatory: 'true', static_value: 'false' });
    expect(out.tool.operation).toBe('POST /api/acme/lookup/get');
  });

  it('rejects unknown REST input types and duplicate names', async () => {
    const client = makeClient((t) => {
      if (t === 'sn_mcp_server_registry') return [serverRow()];
      if (t === 'sys_ws_operation') return [{ sys_id: OP, name: 'Lookup', http_method: 'POST', operation_uri: '/api/x' }];
      if (t === 'sn_mcp_tool_definition') return [{ sys_id: TOOL_B, name: 'lookup' }];
      return [];
    });
    await expect(executeActionFabricToolCall(client, 'sn_mcp_add_tool', { server: 'acme_tools', rest_operation: OP, inputs: [{ name: 'a', type: 'float' }] }))
      .rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    await expect(executeActionFabricToolCall(client, 'sn_mcp_add_tool', { server: 'acme_tools', rest_operation: OP }))
      .rejects.toMatchObject({ code: 'ALREADY_EXISTS' });
  });

  it('rolls back the definition when an input fails', async () => {
    const client = makeClient((t) => {
      if (t === 'sn_mcp_server_registry') return [serverRow()];
      if (t === 'sys_ws_operation') return [{ sys_id: OP, name: 'Lookup', http_method: 'POST', operation_uri: '/api/x' }];
      return [];
    });
    client.createRecord
      .mockImplementationOnce(async (_t: string, data: any) => ({ sys_id: TOOL_B, ...data }))
      .mockImplementationOnce(async () => { throw new Error('boom'); });
    await expect(executeActionFabricToolCall(client, 'sn_mcp_add_tool', { server: 'acme_tools', rest_operation: OP, inputs: [{ name: 'a' }] })).rejects.toThrow('boom');
    expect(client.deleteRecord).toHaveBeenCalledWith('sn_mcp_scripted_rest_tool_definition', TOOL_B);
  });
});

describe('sn_mcp_remove_tool', () => {
  it('detaches and, when asked, deletes an unshared global definition with its inputs', async () => {
    const client = makeClient((t) => {
      if (t === 'sn_mcp_server_registry') return [serverRow({ tools: `${TOOL_A},${TOOL_B}` })];
      if (t === 'sn_mcp_tool_definition') return [{ sys_id: TOOL_B, name: 'acme.lookup', servers: SERVER, sys_scope: 'global', sys_class_name: 'sn_mcp_scripted_rest_tool_definition' }];
      if (t === 'sys_scope') return [{ scope: 'global' }];
      if (t === 'sn_mcp_tool_input') return [{ sys_id: '7'.repeat(32), tool_definition: TOOL_B }, { sys_id: '8'.repeat(32), tool_definition: 'other' }];
      return [];
    });
    const out = await executeActionFabricToolCall(client, 'sn_mcp_remove_tool', { server: 'acme_tools', tool: 'acme.lookup', delete_definition: true });
    expect(client.updateRecord).toHaveBeenCalledWith('sn_mcp_server_registry', SERVER, { tools: TOOL_A });
    expect(client.deleteRecord).toHaveBeenCalledWith('sn_mcp_tool_input', '7'.repeat(32));
    expect(client.deleteRecord).not.toHaveBeenCalledWith('sn_mcp_tool_input', '8'.repeat(32));
    expect(client.deleteRecord).toHaveBeenCalledWith('sn_mcp_scripted_rest_tool_definition', TOOL_B);
    expect(out).toMatchObject({ detached: true, deleted: true, inputs_deleted: 1 });
  });

  it('keeps definitions other servers use or that ship with an app', async () => {
    const shared = makeClient((t) => {
      if (t === 'sn_mcp_server_registry') return [serverRow()];
      if (t === 'sn_mcp_tool_definition') return [{ sys_id: TOOL_A, name: 'x', servers: `${SERVER},${'2'.repeat(32)}`, sys_scope: 'global' }];
      return [{ scope: 'global' }];
    });
    expect((await executeActionFabricToolCall(shared, 'sn_mcp_remove_tool', { server: 'acme_tools', tool: 'x', delete_definition: true })).deleted).toBe(false);
    const oob = makeClient((t) => {
      if (t === 'sn_mcp_server_registry') return [serverRow()];
      if (t === 'sn_mcp_tool_definition') return [{ sys_id: TOOL_A, name: 'x', servers: SERVER, sys_scope: '5'.repeat(32) }];
      return [{ scope: 'sn_mcp_server' }];
    });
    const out = await executeActionFabricToolCall(oob, 'sn_mcp_remove_tool', { server: 'acme_tools', tool: 'x', delete_definition: true });
    expect(out.deleted).toBe(false);
    expect(out.note).toMatch(/sn_mcp_server/);
    expect(oob.deleteRecord).not.toHaveBeenCalled();
  });
});

describe('sn_mcp_delete_server', () => {
  it('refuses out-of-box servers', async () => {
    const client = makeClient((t) => (t === 'sn_mcp_server_registry' ? [serverRow({ sys_scope: '5'.repeat(32) })] : [{ scope: 'sn_mcp_server' }]));
    await expect(executeActionFabricToolCall(client, 'sn_mcp_delete_server', { server: 'acme_tools' })).rejects.toMatchObject({ code: 'NOT_ALLOWED' });
    expect(client.deleteRecord).not.toHaveBeenCalled();
  });

  it('deletes the server and footprint, reporting an ACL it cannot delete', async () => {
    const ACL = '3'.repeat(32);
    const client = makeClient((t, query) => {
      if (t === 'sn_mcp_server_registry') return [serverRow()];
      if (t === 'sys_scope') return [{ scope: 'global' }];
      if (t === 'oauth_entity' && query === 'name=acme_tools') return [{ sys_id: '2'.repeat(32), name: 'acme_tools' }];
      if (t === 'sys_security_acl') return [{ sys_id: ACL, name: 'acme_tools' }];
      return [];
    });
    client.deleteRecord.mockImplementation(async (table: string) => {
      if (table === 'sys_security_acl') throw new Error('Delete was rejected: INSUFFICIENT_PRIVILEGES ACL');
    });
    const out = await executeActionFabricToolCall(client, 'sn_mcp_delete_server', { server: 'acme_tools' });
    expect(client.deleteRecord.mock.calls[0]).toEqual(['sn_mcp_server_registry', SERVER]);
    expect(out.auto_created_deleted.map((d: any) => d.table)).toEqual(['oauth_entity']);
    expect(out.leftover).toEqual([expect.objectContaining({ table: 'sys_security_acl', sys_id: ACL, reason: expect.stringMatching(/security_admin/) })]);
  });
});

describe('MCP client registry', () => {
  it('lists registered servers with URL from http_connection and the agent property', async () => {
    const client = makeClient((t) => {
      if (t === 'sn_mcp_server') return [{ sys_id: SERVER, name: 'NowAIKit', connection_alias: ALIAS }];
      if (t === 'http_connection') return [{ connection_alias: ALIAS, connection_url: 'https://mcp.nowaikit.com/mcp', credential: '6'.repeat(32), 'credential.sys_class_name': 'api_key_credentials' }];
      if (t === 'sn_aia_tool') return [{ sys_id: '7'.repeat(32), name: 'NowAIKit lookup', target_document: SERVER }];
      if (t === 'sys_properties') return [{ value: 'false' }];
      return [];
    });
    const out = await executeActionFabricToolCall(client, 'sn_mcp_list_registry', {});
    expect(out.servers[0]).toMatchObject({ name: 'NowAIKit', url: 'https://mcp.nowaikit.com/mcp', auth: 'api_key_credentials', agent_tools: ['NowAIKit lookup'] });
    expect(out.mcp_tools_enabled_for_agents).toBe(false);
    expect(out.note).toMatch(/sn_aia.enable_mcp_tool/);
  });

  it('registers alias, API key credential, connection and server in order', async () => {
    const client = makeClient(() => []);
    const out = await executeActionFabricToolCall(client, 'sn_mcp_register_external_server', {
      name: 'NowAIKit', url: 'https://mcp.nowaikit.com/mcp', api_key: 'k',
    });
    expect(client.createRecord.mock.calls.map((c) => c[0])).toEqual(['sys_alias', 'api_key_credentials', 'http_connection', 'sn_mcp_server']);
    expect(client.createRecord.mock.calls[1]![1]).toMatchObject({ api_key: 'k', api_key_header_name: 'x-nowaikit-key' });
    expect(client.createRecord.mock.calls[2]![1]).toMatchObject({ connection_url: 'https://mcp.nowaikit.com/mcp', credential: out.created[1].sys_id });
    expect(out.server.table).toBe('sn_mcp_server');
  });

  it('validates the URL and rolls back on failure', async () => {
    const client = makeClient(() => []);
    await expect(executeActionFabricToolCall(client, 'sn_mcp_register_external_server', { name: 'x', url: 'http://plain' })).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    await expect(executeActionFabricToolCall(client, 'sn_mcp_register_external_server', { name: 'x', url: 'not a url' })).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    client.createRecord.mockImplementation(async (table: string, data: any) => {
      if (table === 'sn_mcp_server') throw new Error('denied');
      return { sys_id: `${table.length}`.padEnd(32, '0'), ...data };
    });
    await expect(executeActionFabricToolCall(client, 'sn_mcp_register_external_server', { name: 'x', url: 'https://mcp.nowaikit.com/mcp' })).rejects.toThrow('denied');
    expect(client.deleteRecord.mock.calls.map((c) => c[0])).toEqual(['http_connection', 'sys_alias']);
  });

  it('refuses to unregister a server AI agents use, otherwise removes its connection chain', async () => {
    const used = makeClient((t) => {
      if (t === 'sn_mcp_server') return [{ sys_id: SERVER, name: 'NowAIKit', connection_alias: ALIAS }];
      if (t === 'sn_aia_tool') return [{ sys_id: '7'.repeat(32), name: 'tool', target_document: SERVER }];
      return [];
    });
    await expect(executeActionFabricToolCall(used, 'sn_mcp_unregister_external_server', { server: 'NowAIKit' })).rejects.toMatchObject({ code: 'IN_USE' });
    expect(used.deleteRecord).not.toHaveBeenCalled();

    let deletedServer = false;
    const free = makeClient((t) => {
      if (t === 'sn_mcp_server') return deletedServer ? [] : [{ sys_id: SERVER, name: 'NowAIKit', connection_alias: ALIAS }];
      if (t === 'sys_connection') return [{ sys_id: '5'.repeat(32), name: 'conn', credential: '6'.repeat(32), connection_alias: ALIAS }];
      if (t === 'discovery_credentials') return [{ sys_id: '6'.repeat(32), name: 'cred' }];
      if (t === 'sys_alias') return [{ sys_id: ALIAS, name: 'NowAIKit MCP' }];
      return [];
    });
    free.deleteRecord.mockImplementation(async (table: string) => { if (table === 'sn_mcp_server') deletedServer = true; });
    const out = await executeActionFabricToolCall(free, 'sn_mcp_unregister_external_server', { server: 'NowAIKit' });
    expect(free.deleteRecord.mock.calls.map((c) => c[0])).toEqual(['sn_mcp_server', 'http_connection', 'discovery_credentials', 'sys_alias']);
    expect(out.leftover).toEqual([]);
  });
});

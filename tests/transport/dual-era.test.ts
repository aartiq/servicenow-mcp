/**
 * Dual-era protocol coverage: the built server (dist/server.js) must serve 2025-era clients
 * (initialize handshake, the v1 SDK client) and 2026-07-28 clients (server/discover + per-request
 * envelope, the v2 SDK client) over both stdio and Streamable HTTP.
 *
 * No live ServiceNow: SERVICENOW_INSTANCE_URL points at a local stub that answers the few REST calls
 * these tools make and records them, so destructive calls never leave the machine.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, execSync, type ChildProcess } from 'node:child_process';
import { createServer, type Server as HttpServer } from 'node:http';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { AddressInfo } from 'node:net';
import { Client as LegacyClient } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport as LegacyStdioTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport as LegacyHttpTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { SSEClientTransport as LegacySseTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { ElicitRequestSchema, ToolListChangedNotificationSchema } from '@modelcontextprotocol/sdk/types.js';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { hasLegacyProtocolClaim } from '../../src/transport/index.js';

const ROOT = resolve(__dirname, '../..');
const SERVER_JS = join(ROOT, 'dist', 'server.js');
const UI_EXTENSION = 'io.modelcontextprotocol/ui';
const APP_MIME = 'text/html;profile=mcp-app';
const CATALOG_FORM_URI = 'ui://nowaikit/catalog-form.html';
const SYS_ID = 'a'.repeat(32);
const TIMEOUT = 60_000;

// ─── Fake ServiceNow ─────────────────────────────────────────────────────────

interface StubRequest { method: string; path: string; auth?: string }
interface Stub { url: string; requests: StubRequest[]; close: () => Promise<void> }

async function startStub(): Promise<Stub> {
  const requests: StubRequest[] = [];
  const server: HttpServer = createServer((req, res) => {
    requests.push({ method: req.method || 'GET', path: req.url || '/', auth: req.headers.authorization });
    req.resume();
    if (req.method === 'DELETE') { res.writeHead(204); res.end(); return; }
    res.setHeader('Content-Type', 'application/json');
    if ((req.url || '').startsWith('/api/now/stats/')) {
      res.end(JSON.stringify({ result: { stats: { count: '42' } } }));
      return;
    }
    res.setHeader('X-Total-Count', '0');
    res.end(JSON.stringify({ result: [] }));
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address() as AddressInfo;
  return { url: `http://127.0.0.1:${port}`, requests, close: () => new Promise((r) => server.close(() => r())) };
}

// ─── Server processes ────────────────────────────────────────────────────────

let stub: Stub;
let home: string;
const children: ChildProcess[] = [];

function serverEnv(extra: Record<string, string> = {}): Record<string, string> {
  return {
    PATH: process.env.PATH || '',
    HOME: home, // no ~/.config/nowaikit/instances.json: only the stub instance exists
    SERVICENOW_INSTANCE_URL: stub.url,
    SERVICENOW_USERNAME: 'fake-user',
    SERVICENOW_PASSWORD: 'fake-pass',
    WRITE_ENABLED: 'true',
    NOWAIKIT_AUDIT_DISABLED: 'true',
    ...extra,
  };
}

async function freePort(): Promise<number> {
  const s = createServer();
  await new Promise<void>((r) => s.listen(0, '127.0.0.1', r));
  const { port } = s.address() as AddressInfo;
  await new Promise<void>((r) => s.close(() => r()));
  return port;
}

/** Start `node dist/server.js` over HTTP (TRANSPORT=http unless overridden) and wait until /health answers. */
async function startHttpServer(extra: Record<string, string> = {}): Promise<string> {
  const port = await freePort();
  const child = spawn(process.execPath, [SERVER_JS], {
    cwd: home,
    env: serverEnv({ TRANSPORT: 'http', HOST: '127.0.0.1', PORT: String(port), ...extra }),
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  let stderr = '';
  child.stderr?.on('data', (d) => { stderr += String(d); });
  children.push(child);
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 200; i++) {
    try {
      const r = await fetch(`${base}/health`);
      if (r.ok) return `${base}/mcp`;
    } catch { /* not up yet */ }
    if (child.exitCode !== null) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`HTTP server did not start:\n${stderr}`);
}

// ─── Clients ─────────────────────────────────────────────────────────────────

/** The surface both SDK generations share, as these tests use it. */
interface McpLike {
  listTools(): Promise<{ tools: Array<{ name: string }> }>;
  callTool(params: { name: string; arguments?: Record<string, unknown> }): Promise<any>;
  readResource(params: { uri: string }): Promise<any>;
  close(): Promise<void>;
}

type ElicitAnswer = { action: 'accept' | 'decline' | 'cancel'; content?: Record<string, unknown> };

interface TestClient {
  client: McpLike;
  elicitations: number;
  answer: ElicitAnswer;
  listChanged: number;
}

const APPS_CAPS = { elicitation: {}, extensions: { [UI_EXTENSION]: { mimeTypes: [APP_MIME] } } };

type Transport = { kind: 'stdio' } | { kind: 'http' | 'sse'; url: string; headers?: Record<string, string> };

/** A 2025-era client: the v1 SDK, initialize handshake. */
async function legacyClient(t: Transport, caps: Record<string, unknown> = APPS_CAPS): Promise<TestClient & { sessionId?: string }> {
  const state: TestClient & { sessionId?: string } = { client: undefined as unknown as McpLike, elicitations: 0, answer: { action: 'decline' }, listChanged: 0 };
  const client = new LegacyClient({ name: 'legacy-test', version: '1.0.0' }, { capabilities: caps });
  if ('elicitation' in caps) {
    client.setRequestHandler(ElicitRequestSchema, async () => { state.elicitations++; return state.answer; });
  }
  client.setNotificationHandler(ToolListChangedNotificationSchema, async () => { state.listChanged++; });
  if (t.kind === 'stdio') {
    await client.connect(new LegacyStdioTransport({ command: process.execPath, args: [SERVER_JS], env: serverEnv(), cwd: home, stderr: 'ignore' }));
  } else if (t.kind === 'sse') {
    await client.connect(new LegacySseTransport(new URL(t.url)));
  } else {
    const transport = new LegacyHttpTransport(new URL(t.url), { requestInit: { headers: t.headers || {} } });
    await client.connect(transport);
    state.sessionId = transport.sessionId;
  }
  expect(client.getServerVersion()?.name).toBeTruthy();
  state.client = client as unknown as McpLike;
  return state;
}

/** A 2026-07-28 client: the v2 SDK with version negotiation (Claude Code's default posture). */
async function modernClient(t: Transport, caps: Record<string, unknown> = APPS_CAPS): Promise<TestClient> {
  const state: TestClient = { client: undefined as unknown as McpLike, elicitations: 0, answer: { action: 'decline' }, listChanged: 0 };
  const client = new Client({ name: 'modern-test', version: '1.0.0' }, {
    capabilities: caps,
    versionNegotiation: { mode: 'auto' },
  });
  if ('elicitation' in caps) {
    client.setRequestHandler('elicitation/create', async () => { state.elicitations++; return state.answer; });
  }
  if (t.kind === 'stdio') {
    await client.connect(new StdioClientTransport({ command: process.execPath, args: [SERVER_JS], env: serverEnv(), cwd: home, stderr: 'ignore' }));
  } else {
    await client.connect(new StreamableHTTPClientTransport(new URL(t.url), { requestInit: { headers: t.headers || {} } }));
  }
  expect(client.getProtocolEra()).toBe('modern');
  state.client = client as unknown as McpLike;
  return state;
}

function text(result: any): string {
  return String(result?.content?.[0]?.text ?? '');
}

// ─── Shared feature checks ───────────────────────────────────────────────────

async function checkCoreFeatures(c: TestClient): Promise<void> {
  const { tools } = await c.client.listTools();
  const names = tools.map((t) => t.name);
  expect(names).toContain('get_table_record_count');
  expect(names).toContain('delete_record');
  // MCP Apps: the client declared the io.modelcontextprotocol/ui extension.
  expect(names).toContain('app_submit_catalog_form');

  const count = await c.client.callTool({ name: 'get_table_record_count', arguments: { table: 'incident' } });
  expect(count.isError).toBeFalsy();
  expect(text(count)).toContain('42');
  expect(count.structuredContent).toMatchObject({ table: 'incident', record_count: '42' });

  const form = await c.client.readResource({ uri: CATALOG_FORM_URI });
  expect(form.contents[0].uri).toBe(CATALOG_FORM_URI);
  expect(form.contents[0].mimeType).toBe(APP_MIME);
  expect(String(form.contents[0].text)).toMatch(/<html|<!doctype/i);
}

async function checkElicitation(c: TestClient): Promise<void> {
  const deletes = () => stub.requests.filter((r) => r.method === 'DELETE').length;
  const before = deletes();

  c.answer = { action: 'decline' };
  const declined = await c.client.callTool({ name: 'delete_record', arguments: { table: 'incident', sys_id: SYS_ID } });
  expect(text(declined)).toContain('Cancelled: delete_record was not confirmed.');
  expect(c.elicitations).toBe(1);
  expect(deletes()).toBe(before);

  c.answer = { action: 'accept', content: { confirm: false } };
  const unconfirmed = await c.client.callTool({ name: 'delete_record', arguments: { table: 'incident', sys_id: SYS_ID } });
  expect(text(unconfirmed)).toContain('Cancelled');
  expect(c.elicitations).toBe(2);
  expect(deletes()).toBe(before);

  c.answer = { action: 'accept', content: { confirm: true } };
  const accepted = await c.client.callTool({ name: 'delete_record', arguments: { table: 'incident', sys_id: SYS_ID } });
  expect(accepted.isError).toBeFalsy();
  expect(accepted.structuredContent).toMatchObject({ action: 'deleted', table: 'incident', sys_id: SYS_ID });
  expect(c.elicitations).toBe(3);
  expect(deletes()).toBe(before + 1);

  // dry_run never asks.
  const dry = await c.client.callTool({ name: 'delete_record', arguments: { table: 'incident', sys_id: SYS_ID, dry_run: true } });
  expect(dry.structuredContent).toMatchObject({ action: 'dry_run' });
  expect(c.elicitations).toBe(3);
}

// ─── Suite ───────────────────────────────────────────────────────────────────

beforeAll(async () => {
  if (!existsSync(SERVER_JS)) execSync('npx tsc', { cwd: ROOT, stdio: 'ignore' });
  stub = await startStub();
  home = mkdtempSync(join(tmpdir(), 'nowaikit-dual-era-'));
}, 180_000);

afterAll(async () => {
  for (const child of children) child.kill();
  await stub?.close();
  if (home) rmSync(home, { recursive: true, force: true });
});

describe('hasLegacyProtocolClaim (#3159 routing guard)', () => {
  it('treats pre-2026 _meta claims as legacy and modern/absent claims as not', () => {
    const msg = (v?: unknown) => ({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: v === undefined ? {} : { _meta: { 'io.modelcontextprotocol/protocolVersion': v } } });
    expect(hasLegacyProtocolClaim(msg('2025-06-18'))).toBe(true);
    expect(hasLegacyProtocolClaim([msg(), msg('2025-11-25')])).toBe(true);
    expect(hasLegacyProtocolClaim(msg('2026-07-28'))).toBe(false);
    expect(hasLegacyProtocolClaim(msg())).toBe(false);
    expect(hasLegacyProtocolClaim(msg('garbage'))).toBe(false);
    expect(hasLegacyProtocolClaim({})).toBe(false);
  });
});

describe('stdio: both eras', () => {
  it('2025-era client (v1 SDK, initialize): tools, call, ui:// resource, elicitation', async () => {
    const c = await legacyClient({ kind: 'stdio' });
    try {
      await checkCoreFeatures(c);
      await checkElicitation(c);
    } finally {
      await c.client.close();
    }
  }, TIMEOUT);

  it('2026-07-28 client (v2 SDK, server/discover): tools, call, ui:// resource, input_required elicitation', async () => {
    const c = await modernClient({ kind: 'stdio' });
    try {
      await checkCoreFeatures(c);
      await checkElicitation(c);
    } finally {
      await c.client.close();
    }
  }, TIMEOUT);

  it('client without elicitation: destructive call goes straight to the normal gates', async () => {
    const c = await legacyClient({ kind: 'stdio' }, {});
    try {
      const before = stub.requests.filter((r) => r.method === 'DELETE').length;
      const res = await c.client.callTool({ name: 'delete_record', arguments: { table: 'incident', sys_id: SYS_ID } });
      expect(res.structuredContent).toMatchObject({ action: 'deleted' });
      expect(stub.requests.filter((r) => r.method === 'DELETE').length).toBe(before + 1);
      // No MCP Apps extension → no app tools.
      const { tools } = await c.client.listTools();
      expect(tools.map((t) => t.name)).not.toContain('app_submit_catalog_form');
    } finally {
      await c.client.close();
    }
  }, TIMEOUT);
});

describe('Streamable HTTP: both eras', () => {
  let url: string;
  beforeAll(async () => { url = await startHttpServer(); }, TIMEOUT);

  it('2025-era client (v1 SDK, sessionful): tools, call, ui:// resource, elicitation', async () => {
    const c = await legacyClient({ kind: 'http', url });
    try {
      expect(c.sessionId).toBeTruthy();
      await checkCoreFeatures(c);
      await checkElicitation(c);
    } finally {
      await c.client.close();
    }
  }, TIMEOUT);

  it('2026-07-28 client (v2 SDK, per request): tools, call, ui:// resource, input_required elicitation', async () => {
    const c = await modernClient({ kind: 'http', url });
    try {
      await checkCoreFeatures(c);
      await checkElicitation(c);
    } finally {
      await c.client.close();
    }
  }, TIMEOUT);

  it('two concurrent 2025-era clients get separate sessions and their own capabilities', async () => {
    const [a, b] = await Promise.all([legacyClient({ kind: 'http', url }), legacyClient({ kind: 'http', url }, {})]);
    try {
      expect(a.sessionId).toBeTruthy();
      expect(b.sessionId).toBeTruthy();
      expect(a.sessionId).not.toBe(b.sessionId);
      const [la, lb, ca, cb] = await Promise.all([
        a.client.listTools(),
        b.client.listTools(),
        a.client.callTool({ name: 'get_table_record_count', arguments: { table: 'incident' } }),
        b.client.callTool({ name: 'get_table_record_count', arguments: { table: 'problem' } }),
      ]);
      expect(la.tools.map((t) => t.name)).toContain('app_submit_catalog_form');
      expect(lb.tools.map((t) => t.name)).not.toContain('app_submit_catalog_form');
      expect(ca.structuredContent).toMatchObject({ table: 'incident', record_count: '42' });
      expect(cb.structuredContent).toMatchObject({ table: 'problem', record_count: '42' });
    } finally {
      await Promise.all([a.client.close(), b.client.close()]);
    }
  }, TIMEOUT);

  it('a 2025-era session and a 2026 client work side by side', async () => {
    const [legacy, modern] = await Promise.all([legacyClient({ kind: 'http', url }), modernClient({ kind: 'http', url })]);
    try {
      const [l, m] = await Promise.all([
        legacy.client.callTool({ name: 'get_table_record_count', arguments: { table: 'incident' } }),
        modern.client.callTool({ name: 'get_table_record_count', arguments: { table: 'incident' } }),
      ]);
      expect(text(l)).toContain('42');
      expect(text(m)).toContain('42');
    } finally {
      await Promise.all([legacy.client.close(), modern.client.close()]);
    }
  }, TIMEOUT);

  /** Read one JSON-RPC response from a JSON or SSE body. */
  async function rpcBody(res: Response): Promise<any> {
    const body = await res.text();
    if ((res.headers.get('content-type') || '').includes('text/event-stream')) {
      const data = body.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim()).filter(Boolean);
      return JSON.parse(data[data.length - 1]!);
    }
    return JSON.parse(body);
  }

  it('#3159: a 2025-era request carrying a pre-2026 _meta protocol claim is served, not rejected', async () => {
    const headers = { 'content-type': 'application/json', accept: 'application/json, text/event-stream' };
    const init = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'raw', version: '1' } } }),
    });
    expect(init.status).toBe(200);
    const sid = init.headers.get('mcp-session-id')!;
    expect(sid).toBeTruthy();
    expect((await rpcBody(init)).result.protocolVersion).toBe('2025-06-18');
    const session = { ...headers, 'mcp-session-id': sid, 'mcp-protocol-version': '2025-06-18' };
    const initialized = await fetch(url, { method: 'POST', headers: session, body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) });
    expect(initialized.status).toBe(202);

    const claim = { 'io.modelcontextprotocol/protocolVersion': '2025-06-18' };
    const list = await fetch(url, { method: 'POST', headers: session, body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: { _meta: claim } }) });
    expect(list.status).toBe(200);
    expect((await rpcBody(list)).result.tools.length).toBeGreaterThan(100);

    const call = await fetch(url, {
      method: 'POST',
      headers: session,
      body: JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'get_table_record_count', arguments: { table: 'incident' }, _meta: claim } }),
    });
    expect(call.status).toBe(200);
    expect((await rpcBody(call)).result.content[0].text).toContain('42');
  }, TIMEOUT);

  it('a modern request naming an unsupported revision gets -32022 from the modern path', async () => {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'mcp-protocol-version': '2099-01-01', 'mcp-method': 'tools/list' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
        params: {
          _meta: {
            'io.modelcontextprotocol/protocolVersion': '2099-01-01',
            'io.modelcontextprotocol/clientInfo': { name: 'raw', version: '1' },
            'io.modelcontextprotocol/clientCapabilities': {},
          },
        },
      }),
    });
    expect(res.status).toBe(400);
    const body = await rpcBody(res);
    expect(body.error.code).toBe(-32022);
    expect(body.error.data.supported).toContain('2026-07-28');
  }, TIMEOUT);

  it('without a session or initialize, a 2025-era request is refused as before', async () => {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    });
    expect(res.status).toBe(400);
    const unknown = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'mcp-session-id': 'nope' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    });
    expect(unknown.status).toBe(404);
  }, TIMEOUT);
});

describe('SSE (2024-11-05 transport, frozen server-legacy copy)', () => {
  let url: string;
  beforeAll(async () => { url = (await startHttpServer({ TRANSPORT: 'sse' })).replace(/\/mcp$/, '/sse'); }, TIMEOUT);

  it('2025-era SSE client: tools, call, ui:// resource, elicitation', async () => {
    const c = await legacyClient({ kind: 'sse', url });
    try {
      await checkCoreFeatures(c);
      await checkElicitation(c);
    } finally {
      await c.client.close();
    }
  }, TIMEOUT);
});

describe('Streamable HTTP: lean discovery', () => {
  let url: string;
  beforeAll(async () => { url = await startHttpServer({ MCP_TOOL_DISCOVERY: 'lean' }); }, TIMEOUT);

  it('2025-era session: search_tools adds tools and sends tools/list_changed', async () => {
    const c = await legacyClient({ kind: 'http', url });
    try {
      const before = (await c.client.listTools()).tools.map((t) => t.name);
      expect(before).not.toContain('list_update_sets');
      const res = await c.client.callTool({ name: 'search_tools', arguments: { query: 'list update sets' } });
      expect(res.structuredContent.hint).toContain('now available to call directly');
      await new Promise((r) => setTimeout(r, 200));
      expect(c.listChanged).toBeGreaterThan(0);
      const after = (await c.client.listTools()).tools.map((t) => t.name);
      expect(after).toContain('list_update_sets');
      const call = await c.client.callTool({ name: 'list_update_sets', arguments: {} });
      expect(call.isError).toBeFalsy();
    } finally {
      await c.client.close();
    }
  }, TIMEOUT);

  it('2026 per-request client: falls back to run_tool / direct catalog calls', async () => {
    const c = await modernClient({ kind: 'http', url });
    try {
      const res = await c.client.callTool({ name: 'search_tools', arguments: { query: 'list update sets' } });
      expect(res.structuredContent.hint).toContain('run_tool');
      const direct = await c.client.callTool({ name: 'list_update_sets', arguments: {} });
      expect(direct.isError).toBeFalsy();
      const viaRunTool = await c.client.callTool({ name: 'run_tool', arguments: { name: 'list_update_sets', arguments: {} } });
      expect(viaRunTool.isError).toBeFalsy();
    } finally {
      await c.client.close();
    }
  }, TIMEOUT);
});

describe('Streamable HTTP: strict delegated auth wraps both eras', () => {
  let url: string;
  const delegated = { 'x-nowaikit-gateway-secret': 'gw-secret', 'x-servicenow-token': 'delegated-token' };
  beforeAll(async () => { url = await startHttpServer({ DELEGATED_AUTH: 'strict', NOWAIKIT_DELEGATED_SECRET: 'gw-secret' }); }, TIMEOUT);

  for (const era of ['legacy', 'modern'] as const) {
    it(`${era}: calls run as the delegated user; calls without a token are refused`, async () => {
      const make = era === 'legacy' ? legacyClient : modernClient;
      const withToken = await make({ kind: 'http', url, headers: delegated });
      const without = await make({ kind: 'http', url });
      try {
        const seen = stub.requests.length;
        const ok = await withToken.client.callTool({ name: 'get_table_record_count', arguments: { table: 'incident' } });
        expect(ok.isError).toBeFalsy();
        expect(text(ok)).toContain('42');
        expect(stub.requests.slice(seen).some((r) => r.auth === 'Bearer delegated-token')).toBe(true);

        const refused = await without.client.callTool({ name: 'get_table_record_count', arguments: { table: 'incident' } });
        expect(refused.isError).toBe(true);
        expect(text(refused)).toContain('DELEGATION_REQUIRED');
      } finally {
        await Promise.all([withToken.client.close(), without.client.close()]);
      }
    }, TIMEOUT);
  }
});

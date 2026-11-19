/**
 * Action Fabric talks to ServiceNow's own MCP servers, which speak the 2025-06-18 revision. The v2 client
 * must keep doing the plain initialize handshake against them. Here a v1-SDK server stands in for the
 * instance's MCP endpoint (same path layout, 2025-era only).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Server as V1Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport as V1HttpTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { executeActionFabricToolCall } from '../../src/tools/action-fabric.js';
import type { ServiceNowClient } from '../../src/servicenow/client.js';

let http: HttpServer;
let instanceUrl: string;
const seen: Array<{ path: string; auth?: string; protocolVersion?: string; method?: string }> = [];

beforeAll(async () => {
  http = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : undefined;
    seen.push({ path: req.url || '', auth: req.headers.authorization, method: body?.method, protocolVersion: body?.params?.protocolVersion });
    // Stateless 2025-era server, one per request, like a simple hosted MCP endpoint.
    const server = new V1Server({ name: 'sn-mcp-stand-in', version: '1.0.0' }, { capabilities: { tools: {} } });
    server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [{ name: 'sn_lookup', description: 'Look something up', inputSchema: { type: 'object', properties: { q: { type: 'string' } } }, annotations: { readOnlyHint: true } }],
    }));
    server.setRequestHandler(CallToolRequestSchema, async (r) => ({
      content: [{ type: 'text', text: `looked up ${String(r.params.arguments?.['q'])}` }],
    }));
    const transport = new V1HttpTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    await server.connect(transport);
    await transport.handleRequest(req, res, body);
  });
  await new Promise<void>((r) => http.listen(0, '127.0.0.1', r));
  instanceUrl = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
  process.env.NOWAIKIT_SN_MCP_TOKEN = 'a.b.c';
});

afterAll(async () => {
  delete process.env.NOWAIKIT_SN_MCP_TOKEN;
  await new Promise<void>((r) => http.close(() => r()));
});

describe('Action Fabric MCP client (v2 SDK) against a 2025-era ServiceNow MCP server', () => {
  const client = () => ({ instanceUrl }) as unknown as ServiceNowClient;

  it('lists tools over the initialize handshake', async () => {
    const out = await executeActionFabricToolCall(client(), 'sn_mcp_list_tools', { server: 'sn_mcp_server_default' });
    expect(out.count).toBe(1);
    expect(out.tools[0].name).toBe('sn_lookup');
    const init = seen.find((s) => s.method === 'initialize');
    expect(init?.path).toBe('/sncapps/mcp-server/mcp/sn_mcp_server_default');
    expect(init?.auth).toBe('Bearer a.b.c');
    expect(init?.protocolVersion).toMatch(/^2025-/);
    // Default negotiation never probes with server/discover, so 2025-only endpoints see v1-identical traffic.
    expect(seen.some((s) => s.method === 'server/discover')).toBe(false);
  });

  it('calls a read-only tool', async () => {
    const out = await executeActionFabricToolCall(client(), 'sn_mcp_call_tool', { server: 'sn_mcp_server_default', tool: 'sn_lookup', arguments: { q: 'INC001' } });
    expect(out.content[0].text).toBe('looked up INC001');
  });
});

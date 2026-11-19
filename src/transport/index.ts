/**
 * Transport factory — selects and configures the MCP transport based on TRANSPORT env var.
 *
 * Supported transports:
 *   stdio (default) — Standard I/O (child process pipes)
 *   sse             — Server-Sent Events over HTTP (2024-11-05 transport, kept for older clients)
 *   http            — Streamable HTTP
 *
 * Every transport serves both protocol eras from one server factory:
 *   - 2025-era clients (initialize handshake: VS Code, Claude Desktop, Cursor, Copilot Studio, ChatGPT,
 *     and anything on the v1 SDK) get the same sessionful behaviour as before, including
 *     server→client elicitation and tools/list_changed.
 *   - 2026-07-28 clients (server/discover + per-request `_meta` envelope) are served per request.
 */
import type { Server } from '@modelcontextprotocol/server';
import { logger } from '../utils/logging.js';
import { VERSION, SERVER_NAME } from '../utils/version.js';
import { createHttpServer, type NowAIKitHttpServer } from './http-server.js';
import { isDelegatedAuthEnabled, parseDelegatedAuthHeaders, runWithDelegatedAuth } from '../utils/request-context.js';

export type TransportType = 'stdio' | 'sse' | 'http';

/** Builds a fresh server. `perRequest` is set for instances that serve exactly one 2026-era HTTP request. */
export type ServerFactory = (options?: { perRequest?: boolean }) => Server;

export function getTransportType(): TransportType {
  const transport = (process.env.TRANSPORT || 'stdio').toLowerCase();
  if (transport === 'sse' || transport === 'http') return transport;
  return 'stdio';
}

/**
 * Connect the MCP server factory to the selected transport.
 * Returns the HTTP server instance if using SSE/HTTP transport (for mounting API routes).
 */
export async function connectTransport(factory: ServerFactory, toolCount: number): Promise<NowAIKitHttpServer | null> {
  const transportType = getTransportType();

  if (transportType === 'stdio') {
    // serveStdio owns the era decision: an `initialize` opening pins a 2025-era instance (served
    // exactly as a hand-wired StdioServerTransport), a `server/discover` opening pins 2026-07-28.
    const { serveStdio } = await import('@modelcontextprotocol/server/stdio');
    serveStdio(() => factory(), {
      legacy: 'serve',
      onerror: (error) => logger.debug(`stdio: ${error.message}`),
    });
    logger.info(`NowAIKit server running on stdio [${toolCount} tools]`);
    return null;
  }

  // HTTP-based transports (SSE or Streamable HTTP)
  const httpServer = createHttpServer();

  if (transportType === 'sse') {
    await setupSseTransport(factory, httpServer);
  } else {
    await setupStreamableHttpTransport(factory, httpServer);
  }

  logger.info(`NowAIKit server running on ${transportType} [${toolCount} tools]`);
  return httpServer;
}

type NodeReq = { headers: Record<string, string | string[] | undefined>; method?: string; url?: string };

/** DELEGATED_AUTH: bind the per-user identity/policy from headers for the lifetime of `fn`. */
function withDelegatedAuth<T>(req: NodeReq, fn: () => Promise<T>): Promise<T> {
  if (!isDelegatedAuthEnabled()) return fn();
  return runWithDelegatedAuth(parseDelegatedAuthHeaders(req.headers), fn);
}

/**
 * SSE Transport — GET /sse opens an SSE stream, POST /messages sends client messages.
 * The SSE transport was removed from the v2 SDK; this uses its frozen v1 copy.
 */
async function setupSseTransport(factory: ServerFactory, httpServer: NowAIKitHttpServer): Promise<void> {
  const { SSEServerTransport } = await import('@modelcontextprotocol/server-legacy/sse');

  const sessions = new Map<string, InstanceType<typeof SSEServerTransport>>();

  httpServer.get('/sse', async (req, res) => {
    const transport = new SSEServerTransport('/messages', res);
    const sessionId = transport.sessionId;
    sessions.set(sessionId, transport);

    req.on('close', () => {
      sessions.delete(sessionId);
      logger.info(`SSE session closed: ${sessionId}`);
    });

    // The frozen transport implements the same Transport contract; its bundled types are a separate copy.
    await factory().connect(transport as unknown as Parameters<Server['connect']>[0]);
    logger.info(`SSE session connected: ${sessionId}`);
  }, true);

  httpServer.post('/messages', async (req, res) => {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const sessionId = url.searchParams.get('sessionId');

    if (!sessionId || !sessions.has(sessionId)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid or missing sessionId' }));
      return;
    }

    const transport = sessions.get(sessionId)!;
    // Pass the already-parsed body (the HTTP server drained the stream) — same
    // reason as the streamable-HTTP path below.
    await withDelegatedAuth(req, () => transport.handlePostMessage(req, res, (req as { body?: unknown }).body));
  }, true);

  // Health endpoint (no auth required)
  addHealthRoute(httpServer);
  await httpServer.start();
}

const PROTOCOL_VERSION_META_KEY = 'io.modelcontextprotocol/protocolVersion';
const FIRST_MODERN_REVISION = '2026-07-28';

/**
 * True when a body carries a per-request `_meta` protocol claim naming a pre-2026 revision. Such a
 * request is 2025-era traffic, but the v2 classifier sends any claim to the modern path, which answers
 * 400 (typescript-sdk #3159). Revision ids are ISO dates, so string order is chronological.
 */
export function hasLegacyProtocolClaim(body: unknown): boolean {
  const messages = Array.isArray(body) ? body : [body];
  return messages.some((m) => {
    const meta = (m as { params?: { _meta?: Record<string, unknown> } } | null)?.params?._meta;
    const v = meta?.[PROTOCOL_VERSION_META_KEY];
    return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && v < FIRST_MODERN_REVISION;
  });
}

/**
 * Streamable HTTP Transport — POST/GET/DELETE /mcp for all MCP communication.
 *
 * 2025-era requests (initialize, or anything carrying an Mcp-Session-Id) go to a per-session
 * NodeStreamableHTTPServerTransport, so many clients can connect at once and server→client
 * requests (elicitation) and list_changed keep working. 2026-07-28 requests go to a strict
 * modern handler that builds one server per request.
 */
async function setupStreamableHttpTransport(factory: ServerFactory, httpServer: NowAIKitHttpServer): Promise<void> {
  const { NodeStreamableHTTPServerTransport, toNodeHandler, toWebRequest } = await import('@modelcontextprotocol/node');
  const { createMcpHandler, isInitializeRequest, isLegacyRequest } = await import('@modelcontextprotocol/server');
  const { randomUUID } = await import('crypto');

  // One transport + server per MCP session, so any number of clients can connect at once.
  const sessions = new Map<string, InstanceType<typeof NodeStreamableHTTPServerTransport>>();

  const onerror = (error: Error) => logger.debug(`mcp http: ${error.message}`);
  const modern = toNodeHandler(createMcpHandler(() => factory({ perRequest: true }), { legacy: 'reject', onerror }), { onerror });

  const headerSession = (req: NodeReq) => {
    const v = req.headers['mcp-session-id'];
    return Array.isArray(v) ? String(v[0]) : v ? String(v) : undefined;
  };

  const sendError = (res: any, status: number, message: string) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message }, id: null }));
  };

  /** Which era serves this POST. 2026-07-28 has no sessions, so a session id always means 2025-era. */
  const isLegacy = async (req: NodeReq, body: unknown): Promise<boolean> => {
    if (headerSession(req)) return true;
    if (hasLegacyProtocolClaim(body)) return true;
    return isLegacyRequest(await toWebRequest(req as Parameters<typeof toWebRequest>[0], body), body);
  };

  /** The transport for this request, creating a new session on initialize. */
  const transportFor = async (req: NodeReq, body: unknown) => {
    const sid = headerSession(req);
    if (sid) return sessions.get(sid);
    const messages = Array.isArray(body) ? body : [body];
    if (!messages.some((m) => isInitializeRequest(m))) return undefined;
    const transport: InstanceType<typeof NodeStreamableHTTPServerTransport> = new NodeStreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (id: string) => { sessions.set(id, transport); },
    });
    transport.onclose = () => { if (transport.sessionId) sessions.delete(transport.sessionId); };
    await factory().connect(transport);
    return transport;
  };

  // Mount transport on /mcp
  httpServer.post('/mcp', async (req, res) => {
    // The HTTP server already drains + parses the POST body into req.body, so the
    // stream is consumed by the time we get here. Pass that parsed body through to
    // the MCP transport — otherwise it re-reads an empty stream and the
    // request fails with a JSON-RPC parse error (-32700).
    const parsedBody = (req as { body?: unknown }).body;
    await withDelegatedAuth(req, async () => {
      if (!(await isLegacy(req, parsedBody))) {
        await modern(req as unknown as Parameters<typeof modern>[0], res, parsedBody);
        return;
      }
      const transport = await transportFor(req, parsedBody);
      if (!transport) {
        sendError(res, headerSession(req) ? 404 : 400, headerSession(req) ? 'Session not found. Start a new session with initialize.' : 'Bad Request: no session. Send initialize first.');
        return;
      }
      await transport.handleRequest(req, res, parsedBody);
    });
  }, true);

  // GET (standalone SSE stream) and DELETE (session end) are 2025-era session operations.
  const bySession = async (req: any, res: any) => {
    const transport = sessions.get(headerSession(req) || '');
    if (!transport) { sendError(res, 404, 'Session not found.'); return; }
    await transport.handleRequest(req, res);
  };
  httpServer.get('/mcp', bySession, true);
  httpServer.delete('/mcp', bySession, true);

  addHealthRoute(httpServer);
  await httpServer.start();
}

/** Shared health endpoint — no auth required. */
function addHealthRoute(httpServer: NowAIKitHttpServer): void {
  const health = async (_req: unknown, res: { writeHead: (s: number, h: Record<string, string>) => void; end: (b: string) => void }) => {
    const { getTools } = await import('../tools/index.js');
    const tools = getTools();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      name: SERVER_NAME,
      version: VERSION,
      transport: getTransportType(),
      tools_count: tools.length,
      timestamp: new Date().toISOString(),
    }));
  };
  httpServer.get('/health', health as any, false);
  httpServer.get('/api/health', health as any, false); // alias used in older docs
}

export { NowAIKitHttpServer } from './http-server.js';

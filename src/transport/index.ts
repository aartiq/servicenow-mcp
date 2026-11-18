/**
 * Transport factory — selects and configures the MCP transport based on TRANSPORT env var.
 *
 * Supported transports:
 *   stdio (default) — Standard I/O (child process pipes)
 *   sse             — Server-Sent Events over HTTP
 *   http            — Streamable HTTP (MCP 2025-03-26 spec)
 */
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { logger } from '../utils/logging.js';
import { VERSION, SERVER_NAME } from '../utils/version.js';
import { createHttpServer, type NowAIKitHttpServer } from './http-server.js';
import { isDelegatedAuthEnabled, parseDelegatedAuthHeaders, runWithDelegatedAuth } from '../utils/request-context.js';

export type TransportType = 'stdio' | 'sse' | 'http';

export function getTransportType(): TransportType {
  const transport = (process.env.TRANSPORT || 'stdio').toLowerCase();
  if (transport === 'sse' || transport === 'http') return transport;
  return 'stdio';
}

/**
 * Connect the MCP server to the selected transport.
 * Returns the HTTP server instance if using SSE/HTTP transport (for mounting API routes).
 */
export async function connectTransport(
  server: Server,
  toolCount: number,
  /** Builds a fresh server per HTTP/SSE session. Without it every session shares `server` (one client only). */
  createSession?: () => Server,
): Promise<NowAIKitHttpServer | null> {
  const transportType = getTransportType();

  if (transportType === 'stdio') {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    logger.info(`NowAIKit server running on stdio [${toolCount} tools]`);
    return null;
  }

  // HTTP-based transports (SSE or Streamable HTTP)
  const httpServer = createHttpServer();

  const factory = createSession || (() => server);
  if (transportType === 'sse') {
    await setupSseTransport(factory, httpServer);
  } else {
    await setupStreamableHttpTransport(factory, httpServer);
  }

  logger.info(`NowAIKit server running on ${transportType} [${toolCount} tools]`);
  return httpServer;
}

/**
 * SSE Transport — GET /sse opens an SSE stream, POST /messages sends client messages.
 */
async function setupSseTransport(factory: () => Server, httpServer: NowAIKitHttpServer): Promise<void> {
  const { SSEServerTransport } = await import('@modelcontextprotocol/sdk/server/sse.js');

  const sessions = new Map<string, InstanceType<typeof SSEServerTransport>>();

  httpServer.get('/sse', async (req, res) => {
    const transport = new SSEServerTransport('/messages', res);
    const sessionId = transport.sessionId;
    sessions.set(sessionId, transport);

    req.on('close', () => {
      sessions.delete(sessionId);
      logger.info(`SSE session closed: ${sessionId}`);
    });

    await factory().connect(transport);
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
    await transport.handlePostMessage(req, res, (req as { body?: unknown }).body);
  }, true);

  // Health endpoint (no auth required)
  addHealthRoute(httpServer);
  await httpServer.start();
}

/**
 * Streamable HTTP Transport — POST/GET/DELETE /mcp for all MCP communication.
 */
async function setupStreamableHttpTransport(factory: () => Server, httpServer: NowAIKitHttpServer): Promise<void> {
  const { StreamableHTTPServerTransport } = await import('@modelcontextprotocol/sdk/server/streamableHttp.js');
  const { isInitializeRequest } = await import('@modelcontextprotocol/sdk/types.js');
  const { randomUUID } = await import('crypto');

  // One transport + server per MCP session, so any number of clients can connect at once.
  const sessions = new Map<string, InstanceType<typeof StreamableHTTPServerTransport>>();

  const headerSession = (req: { headers: Record<string, unknown> }) => {
    const v = req.headers['mcp-session-id'];
    return Array.isArray(v) ? String(v[0]) : v ? String(v) : undefined;
  };

  const sendError = (res: any, status: number, message: string) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message }, id: null }));
  };

  /** The transport for this request, creating a new session on initialize. */
  const transportFor = async (req: any, body: unknown) => {
    const sid = headerSession(req);
    if (sid) return sessions.get(sid);
    const messages = Array.isArray(body) ? body : [body];
    if (!messages.some((m) => isInitializeRequest(m))) return undefined;
    const transport: InstanceType<typeof StreamableHTTPServerTransport> = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (id: string) => { sessions.set(id, transport); },
    });
    transport.onclose = () => { if (transport.sessionId) sessions.delete(transport.sessionId); };
    await factory().connect(transport);
    return transport;
  };

  // Mount transport on /mcp
  httpServer.post('/mcp', async (req, res) => {
    // DELEGATED_AUTH: bind the per-user identity/policy from headers for this
    // request's lifetime (used by the ServiceNow client + permission checks).
    // The HTTP server already drains + parses the POST body into req.body, so the
    // stream is consumed by the time we get here. Pass that parsed body through to
    // the MCP transport (3rd arg) — otherwise it re-reads an empty stream and the
    // request fails with a JSON-RPC parse error (-32700).
    const parsedBody = (req as { body?: unknown }).body;
    const transport = await transportFor(req, parsedBody);
    if (!transport) {
      sendError(res, headerSession(req) ? 404 : 400, headerSession(req) ? 'Session not found. Start a new session with initialize.' : 'Bad Request: no session. Send initialize first.');
      return;
    }
    if (isDelegatedAuthEnabled()) {
      const ctx = parseDelegatedAuthHeaders(req.headers as Record<string, string | string[] | undefined>);
      await runWithDelegatedAuth(ctx, () => transport.handleRequest(req, res, parsedBody));
    } else {
      await transport.handleRequest(req, res, parsedBody);
    }
  }, true);

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

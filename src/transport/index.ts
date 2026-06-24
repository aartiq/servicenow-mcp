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

  if (transportType === 'sse') {
    await setupSseTransport(server, httpServer);
  } else {
    await setupStreamableHttpTransport(server, httpServer);
  }

  logger.info(`NowAIKit server running on ${transportType} [${toolCount} tools]`);
  return httpServer;
}

/**
 * SSE Transport — GET /sse opens an SSE stream, POST /messages sends client messages.
 */
async function setupSseTransport(server: Server, httpServer: NowAIKitHttpServer): Promise<void> {
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

    await server.connect(transport);
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
    await transport.handlePostMessage(req, res);
  }, true);

  // Health endpoint (no auth required)
  addHealthRoute(httpServer);
  await httpServer.start();
}

/**
 * Streamable HTTP Transport — POST/GET/DELETE /mcp for all MCP communication.
 */
async function setupStreamableHttpTransport(server: Server, httpServer: NowAIKitHttpServer): Promise<void> {
  const { StreamableHTTPServerTransport } = await import('@modelcontextprotocol/sdk/server/streamableHttp.js');
  const { randomUUID } = await import('crypto');

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
  });

  // Mount transport on /mcp
  httpServer.post('/mcp', async (req, res) => {
    await transport.handleRequest(req, res);
  }, true);

  httpServer.get('/mcp', async (req, res) => {
    await transport.handleRequest(req, res);
  }, true);

  httpServer.delete('/mcp', async (req, res) => {
    await transport.handleRequest(req, res);
  }, true);

  addHealthRoute(httpServer);
  await server.connect(transport);
  await httpServer.start();
}

/** Shared health endpoint — no auth required. */
function addHealthRoute(httpServer: NowAIKitHttpServer): void {
  httpServer.get('/health', async (_req, res) => {
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
  }, false);
}

export { NowAIKitHttpServer } from './http-server.js';

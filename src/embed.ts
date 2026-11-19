/**
 * Embed API — run the NowAIKit MCP core in-process (no HTTP transport).
 *
 * Lets a trusted host (e.g. the NowAIKit Gateway running serverless) execute MCP
 * tool calls directly instead of proxying over HTTP — so the whole thing can be a
 * single serverless unit with no standing core to host.
 *
 * Additive and dependency-free of any transport: it reuses the existing
 * `getTools` / `executeTool`, the per-user `ServiceNowClient.withUser()`, and the
 * delegated-auth context. Behaviour (result shape, permission gating) matches the
 * HTTP server's CallTool handler.
 */
import { modelText } from './utils/model-output.js';
import { getTools, executeTool } from './tools/index.js';
import { ServiceNowClient } from './servicenow/client.js';
import { runWithDelegatedAuth, getDelegatedAuth, type DelegatedAuth } from './utils/request-context.js';
import { VERSION, SERVER_NAME } from './utils/version.js';
import { ServiceNowError } from './utils/errors.js';

export { getTools, executeTool, ServiceNowClient, runWithDelegatedAuth, getDelegatedAuth };
export type { DelegatedAuth };
export type { ServiceNowConfig } from './servicenow/types.js';

interface JsonRpcMessage {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
}

/** 2025-era revisions negotiated through `initialize` (newest first). */
const LEGACY_PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05', '2024-10-07'];
/** Answer for an initialize that names no version (unchanged from earlier releases). */
const DEFAULT_LEGACY_PROTOCOL_VERSION = '2025-06-18';
/** 2026-era revisions served per request (`server/discover` + the `_meta` envelope). */
const MODERN_PROTOCOL_VERSIONS = ['2026-07-28'];
const PROTOCOL_VERSION_META_KEY = 'io.modelcontextprotocol/protocolVersion';
const SERVER_INFO_META_KEY = 'io.modelcontextprotocol/serverInfo';
/** JSON-RPC error for a protocol revision this server does not serve (2026-07-28). */
const UNSUPPORTED_PROTOCOL_VERSION = -32022;

/**
 * Format a tool result like the server's CallTool handler (compact text for the model). Embedders read
 * the structured object programmatically, so it is always attached here.
 */
function formatToolResult(result: unknown): Record<string, unknown> {
  const structured =
    typeof result === 'object' && result !== null && !Array.isArray(result)
      ? { structuredContent: result as Record<string, unknown> }
      : {};
  return {
    content: [
      { type: 'text', text: modelText(result) },
    ],
    ...structured,
  };
}

/**
 * Handle a single MCP JSON-RPC message in-process.
 *
 * Serves both protocol eras: 2025-era clients open with `initialize`; 2026-07-28 clients open with
 * `server/discover` and name the revision in every request's `_meta` envelope.
 *
 * @param message the JSON-RPC request (initialize / server/discover / tools/list / tools/call / notifications/*)
 * @param ctx     the per-user ServiceNow client (already `.withUser(token)`) and the
 *                resolved delegated policy (drives permission gating)
 * @returns the JSON-RPC response object, or `undefined` for notifications (no reply)
 */
export async function handleEmbeddedMcp(
  message: JsonRpcMessage,
  ctx: { client: ServiceNowClient; delegated?: DelegatedAuth },
): Promise<Record<string, unknown> | undefined> {
  const { id = null, method, params } = message;
  if (!method || method.startsWith('notifications/')) return undefined;

  // 2026-07-28 requests name their revision in a per-request `_meta` claim. A claim naming a 2025-era
  // revision is ordinary legacy traffic; anything else that is not a served modern revision is refused.
  const claim = (params?.['_meta'] as Record<string, unknown> | undefined)?.[PROTOCOL_VERSION_META_KEY];
  const modern = typeof claim === 'string' && !LEGACY_PROTOCOL_VERSIONS.includes(claim);
  if (modern && method !== 'server/discover' && !MODERN_PROTOCOL_VERSIONS.includes(claim)) {
    return {
      jsonrpc: '2.0',
      id,
      error: {
        code: UNSUPPORTED_PROTOCOL_VERSION,
        message: `Unsupported protocol version: ${claim}`,
        data: { supported: MODERN_PROTOCOL_VERSIONS, requested: claim },
      },
    };
  }
  const serverInfo = { name: SERVER_NAME, version: VERSION };
  /** A successful response; 2026-era results carry resultType and the server identity stamp. */
  const ok = (result: Record<string, unknown>, cacheable = false) => ({
    jsonrpc: '2.0',
    id,
    result: modern
      ? {
          ...result,
          resultType: 'complete',
          ...(cacheable ? { ttlMs: 0, cacheScope: 'private' } : {}),
          _meta: { ...(result['_meta'] as Record<string, unknown> | undefined), [SERVER_INFO_META_KEY]: serverInfo },
        }
      : result,
  });

  if (method === 'initialize') {
    // Answer with a revision we actually speak: the client's when we support it, never an arbitrary echo.
    const requested = params?.['protocolVersion'];
    const protocolVersion = typeof requested === 'string'
      ? (LEGACY_PROTOCOL_VERSIONS.includes(requested) ? requested : LEGACY_PROTOCOL_VERSIONS[0])
      : DEFAULT_LEGACY_PROTOCOL_VERSION;
    return {
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion,
        capabilities: { tools: {} },
        serverInfo,
      },
    };
  }

  if (method === 'server/discover') {
    // The 2026-07-28 opening: which modern revisions we serve and what we offer. Answered whatever the
    // probe's claim, so a client can pick a mutually supported revision from supportedVersions.
    return {
      jsonrpc: '2.0',
      id,
      result: {
        supportedVersions: MODERN_PROTOCOL_VERSIONS,
        capabilities: { tools: {} },
        resultType: 'complete',
        ttlMs: 0,
        cacheScope: 'private',
        _meta: { [SERVER_INFO_META_KEY]: serverInfo },
      },
    };
  }

  // ping exists only in the 2025 era (2026-07-28 removed it).
  if (method === 'ping' && !modern) {
    return ok({});
  }

  if (method === 'tools/list') {
    return ok({ tools: getTools() }, true);
  }

  if (method === 'tools/call') {
    const name = String(params?.['name'] ?? '');
    const args = (params?.['arguments'] as Record<string, unknown>) ?? {};
    const run = async () => formatToolResult(await executeTool(ctx.client, name, args));
    try {
      const result = ctx.delegated ? await runWithDelegatedAuth(ctx.delegated, run) : await run();
      return ok(result);
    } catch (err) {
      const text =
        err instanceof ServiceNowError
          ? `Error: ${err.message} (Code: ${err.code})`
          : `Error executing tool: ${err instanceof Error ? err.message : 'Unknown error'}`;
      // MCP convention: tool errors come back as a result with isError, not a protocol error.
      return ok({ content: [{ type: 'text', text }], isError: true });
    }
  }

  return { jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } };
}

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

/** Format a tool result exactly like the HTTP server's CallTool handler. */
function formatToolResult(result: unknown): Record<string, unknown> {
  const structured =
    typeof result === 'object' && result !== null && !Array.isArray(result)
      ? { structuredContent: result as Record<string, unknown> }
      : {};
  return {
    content: [
      { type: 'text', text: typeof result === 'string' ? result : JSON.stringify(result, null, 2) },
    ],
    ...structured,
  };
}

/**
 * Handle a single MCP JSON-RPC message in-process.
 *
 * @param message the JSON-RPC request (initialize / tools/list / tools/call / notifications/*)
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

  if (method === 'initialize') {
    return {
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: (params?.['protocolVersion'] as string) ?? '2025-06-18',
        capabilities: { tools: {} },
        serverInfo: { name: SERVER_NAME, version: VERSION },
      },
    };
  }

  if (method === 'tools/list') {
    return { jsonrpc: '2.0', id, result: { tools: getTools() } };
  }

  if (method === 'tools/call') {
    const name = String(params?.['name'] ?? '');
    const args = (params?.['arguments'] as Record<string, unknown>) ?? {};
    const run = async () => formatToolResult(await executeTool(ctx.client, name, args));
    try {
      const result = ctx.delegated ? await runWithDelegatedAuth(ctx.delegated, run) : await run();
      return { jsonrpc: '2.0', id, result };
    } catch (err) {
      const text =
        err instanceof ServiceNowError
          ? `Error: ${err.message} (Code: ${err.code})`
          : `Error executing tool: ${err instanceof Error ? err.message : 'Unknown error'}`;
      // MCP convention: tool errors come back as a result with isError, not a protocol error.
      return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text }], isError: true } };
    }
  }

  return { jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } };
}

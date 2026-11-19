#!/usr/bin/env node
import { compatNotes } from './bootstrap-env.js';
import {
  Server,
  ProtocolError,
  ProtocolErrorCode,
  CLIENT_CAPABILITIES_META_KEY,
  CLIENT_INFO_META_KEY,
  acceptedContent,
  inputRequired,
  inputResponse,
  type ClientCapabilities,
  type Implementation,
  type ServerContext,
  type Tool,
} from '@modelcontextprotocol/server';
import { instanceManager } from './servicenow/instances.js';
import { getTools, getAppToolsFor, getCatalogTool, isLeanDiscovery } from './tools/index.js';
import { clientSupportsApps, getAppResources, isAppResourceUri, readAppResource } from './apps/index.js';
import { getResources, getResourceTemplates, readResource } from './resources/index.js';
import { getPrompts, resolvePromptAsync } from './prompts/index.js';
import { logger } from './utils/logging.js';
import { ServiceNowError } from './utils/errors.js';
import { connectTransport, getTransportType } from './transport/index.js';
import { enableLocalFileAccess } from './utils/local-files.js';
import { getDelegatedAuth, strictDelegationViolation } from './utils/request-context.js';
import { VERSION, SERVER_NAME } from './utils/version.js';
import { isLongRunningTool, runLongRunningTool, startToolJob, type ToolExecutor } from './tools/jobs.js';
import {
  TaskAwareServer,
  TASK_CAPABILITIES,
  createTaskResult,
  notifyLegacyTaskStatus,
  registerTaskHandlers,
  returnTaskResult,
  taskRequestFor,
  toolResult,
} from './utils/tasks.js';

// .env and documented aliases (SN_INSTANCE_URL, --allow-write, SN_PERSONA, ...) were applied by bootstrap-env.
for (const note of compatNotes) logger.warn(note);

// Require at least one instance to be configured
const hasLegacy = !!process.env.SERVICENOW_INSTANCE_URL;
const hasMulti = Object.keys(process.env).some(k => /^SN_INSTANCE_[A-Z0-9_]+_URL$/.test(k));
const hasConfig = !!process.env.SN_INSTANCES_CONFIG;
if (!hasLegacy && !hasMulti && !hasConfig) {
  logger.error('No ServiceNow instance configured. Set SERVICENOW_INSTANCE_URL or SN_INSTANCES_CONFIG.');
  process.exit(1);
}

// ─── Create MCP Server ───────────────────────────────────────────────────────

/** Tools whose real (non-dry-run) execution destroys or hard-publishes data. */
const DESTRUCTIVE_TOOLS = new Set([
  'delete_record', 'delete_attachment', 'delete_system_property', 'delete_uib_page',
  'retire_asset', 'retire_knowledge_article', 'rollback_deployment', 'execute_background_script',
]);
function isDestructiveTool(name: string): boolean {
  return DESTRUCTIVE_TOOLS.has(name) || /^delete_|^retire_/.test(name);
}

// Tools that can take a while (src/tools/jobs.ts LONG_RUNNING_TOOLS) emit MCP progress notifications
// when the client supplies a progressToken, accept `async: true`, switch to a background job when a
// call runs past NOWAIKIT_AUTO_ASYNC_MS, and run as MCP tasks for clients that support them.

export interface CreateServerOptions {
  /**
   * The instance serves a single request and is then discarded (2026-07-28 Streamable HTTP via
   * createMcpHandler). Session state such as the lean-discovery set cannot persist there, so lean
   * mode lets catalog tools be called by name directly instead.
   */
  perRequest?: boolean;
}

/**
 * The client's declared capabilities and identity for this request. 2026-07-28 requests carry them in
 * the per-request `_meta` envelope; 2025-era connections declared them once at `initialize`.
 */
function clientIdentity(server: Server, ctx: ServerContext): { caps?: ClientCapabilities; info?: Implementation } {
  const envelope = ctx.mcpReq.envelope as Record<string, unknown> | undefined;
  // getClientCapabilities/getClientVersion are deprecated in v2 but remain the 2025-era (initialize) source.
  return {
    caps: (envelope?.[CLIENT_CAPABILITIES_META_KEY] as ClientCapabilities | undefined) ?? server.getClientCapabilities(),
    info: (envelope?.[CLIENT_INFO_META_KEY] as Implementation | undefined) ?? server.getClientVersion(),
  };
}

export function createServer(options: CreateServerOptions = {}): Server {
  const server = new TaskAwareServer(
    {
      name: SERVER_NAME,
      version: VERSION,
    },
    {
      capabilities: {
        // listChanged: lean sessions grow their tool list as search_tools finds tools.
        tools: { listChanged: true },
        resources: {},
        prompts: {},
        // Long-running tools run as MCP tasks: the 2025-11-25 `tasks` capability and the 2026-07-28
        // io.modelcontextprotocol/tasks extension, each shown only to its own era.
        ...TASK_CAPABILITIES,
      },
      // 2026-07-28 cache fields (ignored on 2025-era responses). Private: lists depend on the
      // client's capabilities (MCP Apps) and, behind the gateway, on the caller. Lean tool lists grow
      // during a session, so they are never cached; resources/read is live record data (default 0).
      cacheHints: {
        'tools/list': { ttlMs: isLeanDiscovery() ? 0 : 60_000, cacheScope: 'private' },
        'prompts/list': { ttlMs: 300_000, cacheScope: 'private' },
        'resources/list': { ttlMs: 300_000, cacheScope: 'private' },
        'resources/templates/list': { ttlMs: 300_000, cacheScope: 'private' },
        'server/discover': { ttlMs: 300_000, cacheScope: 'private' },
      },
    }
  );

  const tools = getTools();

  // ─── Tools ──────────────────────────────────────────────────────────────────

  /** MCP Apps views and their app-only tools, for clients that can render them. */
  const appsEnabled = (ctx: ServerContext) => {
    const { caps, info } = clientIdentity(server, ctx);
    return clientSupportsApps(caps, info?.name);
  };

  // Lean discovery: tools that search_tools found in this session are added to the list, so the model
  // can call them directly. Clients that ignore tools/list_changed can still use run_tool.
  const discovered = new Set<string>();
  const MAX_DISCOVERED = 60;

  server.setRequestHandler('tools/list', async (_request, ctx) => {
    const listed = getTools();
    const have = new Set(listed.map((t) => t.name));
    const extra = [...discovered].filter((n) => !have.has(n)).map((n) => getCatalogTool(n)).filter((t): t is NonNullable<typeof t> => !!t);
    const all = [...listed, ...extra];
    // Tool definitions are plain JSON-schema literals; the SDK types them as the spec Tool shape.
    const withApps = appsEnabled(ctx) ? [...all, ...getAppToolsFor(all)] : all;
    return { tools: withApps as unknown as Tool[] };
  });

  server.setRequestHandler('tools/call', async (request, ctx) => {
    const { name, arguments: args } = request.params;

    logger.info(`Tool called: ${name}`);

    try {
      const tool = tools.find(t => t.name === name)
        || getAppToolsFor(tools).find(t => t.name === name)
        || (discovered.has(name) || (options.perRequest && isLeanDiscovery()) ? getCatalogTool(name) : undefined);
      if (!tool) {
        throw new ServiceNowError(`Unknown tool: ${name}`, 'UNKNOWN_TOOL');
      }

      const instanceName = (args as Record<string, unknown>)?.['instance'] as string | undefined;
      // DELEGATED_AUTH: run as the per-request identity AND (for multi-tenant
      // hosting) against the caller's own instance, both carried in the delegated
      // context headers. When a token is present we also honour its instanceUrl,
      // so one shared server serves many customers with no per-customer config.
      // No-op in normal single-user mode.
      const delegatedAuth = getDelegatedAuth();

      // Strict delegated-auth: refuse to run without a valid delegated token (never fall back to base
      // credentials), and refuse the instance-manager tools that bypass per-request delegation.
      const violation = strictDelegationViolation(name);
      if (violation === 'DELEGATION_REQUIRED') {
        throw new ServiceNowError(
          'Delegation required: strict delegated-auth mode is on, so every tool call must carry a valid delegated token from the trusted gateway. The server will not fall back to base credentials.',
          'DELEGATION_REQUIRED',
        );
      }
      if (violation === 'DELEGATION_INCOMPATIBLE_TOOL') {
        throw new ServiceNowError(
          `Tool "${name}" is unavailable under strict delegated-auth: it operates on server-configured instances, not the delegated per-request identity.`,
          'DELEGATION_INCOMPATIBLE_TOOL',
        );
      }

      const baseClient = instanceManager.getClient(instanceName);
      const client = delegatedAuth?.bearerToken
        ? baseClient.withUser({ bearerToken: delegatedAuth.bearerToken, instanceUrl: delegatedAuth.instanceUrl })
        : baseClient;
      const toolArgs = (args || {}) as Record<string, unknown>;

      // ─── Elicitation: confirm destructive ops when the client supports it ──────
      // Only triggers for real (non-dry-run) destructive operations and only when
      // the connected client advertised the elicitation capability. Falls back to
      // the existing WRITE_ENABLED/guardrail gates when unsupported.
      // Written once in the 2026-07-28 multi-round-trip form: 2026 clients answer the input_required
      // result and retry; on 2025-era connections (stdio, sessionful HTTP) the SDK's legacy shim sends
      // a real elicitation/create and re-enters this handler with the answer.
      if (isDestructiveTool(name) && !toolArgs['dry_run'] && clientIdentity(server, ctx).caps?.elicitation) {
        const answer = inputResponse(ctx.mcpReq.inputResponses, 'confirm');
        if (answer.kind === 'missing') {
          return inputRequired({
            inputRequests: {
              confirm: inputRequired.elicit({
                message: `Confirm ${name} on table "${String(toolArgs['table'] ?? '?')}"${toolArgs['sys_id'] ? ` (sys_id ${String(toolArgs['sys_id'])})` : ''} on instance "${instanceManager.getCurrentName()}". This is a destructive write.`,
                requestedSchema: {
                  type: 'object',
                  properties: { confirm: { type: 'boolean', description: 'Proceed with this destructive operation?' } },
                  required: ['confirm'],
                },
              }),
            },
          });
        }
        if (acceptedContent<{ confirm?: unknown }>(ctx.mcpReq.inputResponses, 'confirm')?.confirm !== true) {
          return { content: [{ type: 'text' as const, text: `Cancelled: ${name} was not confirmed.` }] };
        }
      }

      const { executeTool } = await import('./tools/index.js');
      const execute: ToolExecutor = (c, n, a) => executeTool(c, n, a);

      // Long-running tools, called directly or through run_tool (lean mode).
      const viaRunTool = name === 'run_tool';
      const target = viaRunTool ? String(toolArgs['name'] || '').trim() : name;
      const longRunning = isLongRunningTool(target);
      const targetArgs = (viaRunTool
        ? (toolArgs['arguments'] && typeof toolArgs['arguments'] === 'object' ? toolArgs['arguments'] : {})
        : toolArgs) as Record<string, unknown>;
      const { async: asyncFlag, ...jobArgs } = targetArgs;

      // MCP tasks: a 2026 request that declared the tasks extension, or a 2025 request with params.task.
      const taskRequest = taskRequestFor(request.params as Record<string, unknown>, ctx);
      if (taskRequest?.era === 'legacy' && !longRunning) {
        throw new ProtocolError(ProtocolErrorCode.MethodNotFound, `Tool "${name}" does not support task-augmented execution`);
      }
      if (taskRequest && longRunning) {
        const job = startToolJob(client, target, jobArgs, execute, {
          origin: 'task',
          ttlMs: taskRequest.era === 'legacy' ? taskRequest.ttlMs : undefined,
        });
        logger.info(`Tool ${target} runs as task ${job.id}`);
        if (taskRequest.era === 'legacy' && !options.perRequest) notifyLegacyTaskStatus(server, job);
        return returnTaskResult(createTaskResult(job, taskRequest.era));
      }

      // MCP progress notifications: if the client passed a progressToken and this
      // is a long-running tool, emit periodic heartbeats so the UI shows activity.
      // Purely additive — when no token is sent the path below behaves as before.
      const progressToken = ctx.mcpReq._meta?.progressToken;
      const trackProgress = progressToken !== undefined && longRunning;
      let heartbeat: ReturnType<typeof setInterval> | undefined;
      if (trackProgress) {
        let pct = 0;
        // Request-related, so it rides this call's own stream (2025 sessionful HTTP and 2026 HTTP).
        const sendProgress = (progress: number, message: string) =>
          ctx.mcpReq.notify({
            method: 'notifications/progress',
            params: { progressToken, progress, total: 100, message },
          }).catch(() => { /* client may not track this token; ignore */ });
        await sendProgress(0, `Starting ${name}…`);
        heartbeat = setInterval(() => {
          pct = Math.min(pct + 7, 92);
          void sendProgress(pct, `Running ${name}…`);
        }, 1500);
      }

      let result: unknown;
      try {
        // Long-running tools return a job id for `async: true`, or once they run past the auto-async
        // threshold. Anything that finishes in time returns exactly what it always did.
        result = longRunning
          ? await runLongRunningTool(client, target, jobArgs, execute, asyncFlag === true)
          : await executeTool(client, name, toolArgs);
      } finally {
        if (heartbeat) clearInterval(heartbeat);
        if (trackProgress) {
          await ctx.mcpReq.notify({
            method: 'notifications/progress',
            params: { progressToken, progress: 100, total: 100, message: `${name} complete` },
          }).catch(() => { /* ignore */ });
        }
      }

      // Lean discovery: expose what the search found and tell the client its tool list changed.
      // A per-request (2026 HTTP) instance has no session to remember the set, so there every catalog
      // tool is callable by name and the hint points at run_tool for clients that only call listed tools.
      if (name === 'search_tools' && isLeanDiscovery() && result && typeof result === 'object') {
        const found = ((result as { tools?: Array<{ name: string }> }).tools || []).slice(0, 10).map((t) => t.name);
        if (options.perRequest) {
          if (found.length) (result as Record<string, unknown>).hint = 'Call these tools through run_tool { name, arguments }, or by name if your client allows unlisted tools.';
        } else {
          const before = discovered.size;
          for (const n of found) if (discovered.size < MAX_DISCOVERED && getCatalogTool(n)) discovered.add(n);
          if (discovered.size > before) {
            try {
              await server.sendToolListChanged();
            } catch { /* client may not support list_changed */ }
            (result as Record<string, unknown>).hint = 'These tools are now available to call directly. If your client does not refresh its tool list, call them through run_tool { name, arguments }.';
          }
        }
      }

      // Structured output: include the raw object so capable clients get typed
      // content, while keeping the text block for backward compatibility.
      return toolResult(result) as { content: Array<{ type: 'text'; text: string }> };
    } catch (error) {
      // Protocol-level errors (a task request for a tool without task support) stay JSON-RPC errors.
      if (error instanceof ProtocolError) throw error;
      logger.error(`Tool execution error: ${name}`, error);

      if (error instanceof ServiceNowError) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Error: ${error.message} (Code: ${error.code})`,
            },
          ],
          isError: true,
        };
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: `Error executing tool: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
        isError: true,
      };
    }
  });

  // ─── Tasks (tasks/get, tasks/update, tasks/cancel, and 2025's tasks/result, tasks/list) ─────

  registerTaskHandlers(server);

  // ─── Resources (@ mentions) ─────────────────────────────────────────────────

  server.setRequestHandler('resources/list', async () => {
    return { resources: [...getResources(), ...getAppResources()] };
  });

  server.setRequestHandler('resources/templates/list', async () => {
    return { resourceTemplates: getResourceTemplates() };
  });

  server.setRequestHandler('resources/read', async (request) => {
    const { uri } = request.params;

    // MCP Apps views are static HTML and need no instance connection.
    if (isAppResourceUri(uri)) return readAppResource(uri)!;

    try {
      // Same identity rules as tool calls: a delegated per-user token wins over base credentials.
      if (strictDelegationViolation('read_resource') === 'DELEGATION_REQUIRED') {
        throw new ServiceNowError('Delegation required: strict delegated-auth mode is on and this request carries no delegated token.', 'DELEGATION_REQUIRED');
      }
      const delegatedAuth = getDelegatedAuth();
      const baseClient = instanceManager.getClient();
      const client = delegatedAuth?.bearerToken
        ? baseClient.withUser({ bearerToken: delegatedAuth.bearerToken, instanceUrl: delegatedAuth.instanceUrl })
        : baseClient;
      const result = await readResource(client, uri);
      const mimeType = uri === 'servicenow://query-syntax' ? 'text/markdown' : 'application/json';
      const text = typeof result === 'string' ? result : JSON.stringify(result, null, 2);

      return {
        contents: [{ uri, mimeType, text }],
      };
    } catch (error) {
      logger.error(`Resource read error: ${uri}`, error);
      throw error;
    }
  });

  // ─── Prompts (/ slash commands) ─────────────────────────────────────────────

  server.setRequestHandler('prompts/list', async () => {
    return { prompts: getPrompts() };
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  server.setRequestHandler('prompts/get', async (request): Promise<any> => {
    const { name, arguments: args } = request.params;

    const result = await resolvePromptAsync(name, args as Record<string, string> | undefined);
    if (!result) {
      throw new Error(`Unknown prompt: ${name}`);
    }

    return result;
  });

  return server;
}

// ─── Start ────────────────────────────────────────────────────────────────────

async function main() {
  // Running as a local stdio server means we are on the user's own machine, so upload_attachment may
  // read local files (file_path). HTTP mode stays off unless NOWAIKIT_LOCAL_FILES=true.
  if (getTransportType() === 'stdio') enableLocalFileAccess();
  const tools = getTools();
  const httpServer = await connectTransport(createServer, tools.length);

  // If HTTP-based transport, mount API routes and A2A
  if (httpServer) {
    const { mountApiRoutes } = await import('./api/index.js');
    mountApiRoutes(httpServer);

    const { mountA2ARoutes } = await import('./a2a/index.js');
    mountA2ARoutes(httpServer);

    const { mountDashboard } = await import('./dashboard/index.js');
    mountDashboard(httpServer);

    logger.info(`REST API available at http://${process.env.HOST || '0.0.0.0'}:${process.env.PORT || '3000'}/api`);
    logger.info(`A2A agent card at http://${process.env.HOST || '0.0.0.0'}:${process.env.PORT || '3000'}/.well-known/agent.json`);
    logger.info(`Dashboard at http://${process.env.HOST || '0.0.0.0'}:${process.env.PORT || '3000'}/`);
  }
}

main().catch((error) => {
  logger.error('Server startup failed', error);
  process.exit(1);
});

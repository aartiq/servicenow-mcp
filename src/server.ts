#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import dotenv from 'dotenv';
import { instanceManager } from './servicenow/instances.js';
import { getTools } from './tools/index.js';
import { getResources, readResource } from './resources/index.js';
import { getPrompts, resolvePromptAsync } from './prompts/index.js';
import { logger } from './utils/logging.js';
import { ServiceNowError } from './utils/errors.js';
import { connectTransport } from './transport/index.js';
import { getDelegatedAuth } from './utils/request-context.js';
import { VERSION, SERVER_NAME } from './utils/version.js';

dotenv.config();

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

// Tools that can take a while — emit MCP progress notifications (only when the
// client supplies a progressToken; otherwise nothing changes).
const LONG_RUNNING_TOOLS = new Set([
  'run_discovery_scan', 'run_atf_suite', 'run_atf_test', 'cmdb_reconcile', 'cmdb_impact_analysis',
  'bulk_create_records', 'import_cmdb_data', 'run_transform_map', 'scan_vulnerabilities',
  'run_security_playbook', 'execute_playbook', 'compare_instances',
  'export_update_set', 'preview_update_set', 'check_table_completeness', 'analyze_data_quality',
  'ml_train_incident_classifier', 'ml_train_change_risk', 'ml_train_anomaly_detector', 'ml_forecast_incidents',
]);

export function createServer(): Server {
  const server = new Server(
    {
      name: SERVER_NAME,
      version: VERSION,
    },
    {
      capabilities: {
        tools: {},
        resources: {},
        prompts: {},
      },
    }
  );

  const tools = getTools();

  // ─── Tools ──────────────────────────────────────────────────────────────────

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: getTools() };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    logger.info(`Tool called: ${name}`);

    try {
      const tool = tools.find(t => t.name === name);
      if (!tool) {
        throw new ServiceNowError(`Unknown tool: ${name}`, 'UNKNOWN_TOOL');
      }

      const instanceName = (args as Record<string, unknown>)?.['instance'] as string | undefined;
      const baseClient = instanceManager.getClient(instanceName);
      // DELEGATED_AUTH: run as the per-request identity AND (for multi-tenant
      // hosting) against the caller's own instance, both carried in the delegated
      // context headers. When a token is present we also honour its instanceUrl,
      // so one shared server serves many customers with no per-customer config.
      // No-op in normal single-user mode.
      const delegatedAuth = getDelegatedAuth();
      const client = delegatedAuth?.bearerToken
        ? baseClient.withUser({ bearerToken: delegatedAuth.bearerToken, instanceUrl: delegatedAuth.instanceUrl })
        : baseClient;
      const toolArgs = (args || {}) as Record<string, unknown>;

      // ─── Elicitation: confirm destructive ops when the client supports it ──────
      // Only triggers for real (non-dry-run) destructive operations and only when
      // the connected client advertised the elicitation capability. Falls back to
      // the existing WRITE_ENABLED/guardrail gates when unsupported.
      if (isDestructiveTool(name) && !toolArgs['dry_run'] && server.getClientCapabilities()?.elicitation) {
        try {
          const confirm = await server.elicitInput({
            message: `Confirm ${name} on table "${String(toolArgs['table'] ?? '?')}"${toolArgs['sys_id'] ? ` (sys_id ${String(toolArgs['sys_id'])})` : ''} on instance "${instanceManager.getCurrentName()}". This is a destructive write.`,
            requestedSchema: {
              type: 'object',
              properties: { confirm: { type: 'boolean', description: 'Proceed with this destructive operation?' } },
              required: ['confirm'],
            },
          });
          if (confirm.action !== 'accept' || !(confirm.content as Record<string, unknown> | undefined)?.['confirm']) {
            return { content: [{ type: 'text' as const, text: `Cancelled: ${name} was not confirmed.` }] };
          }
        } catch {
          // Elicitation failed/declined by transport — fall through to normal gates.
        }
      }

      const { executeTool } = await import('./tools/index.js');

      // MCP progress notifications: if the client passed a progressToken and this
      // is a long-running tool, emit periodic heartbeats so the UI shows activity.
      // Purely additive — when no token is sent the path below behaves as before.
      const progressToken = (request.params as { _meta?: { progressToken?: string | number } })._meta?.progressToken;
      const trackProgress = progressToken !== undefined && LONG_RUNNING_TOOLS.has(name);
      let heartbeat: ReturnType<typeof setInterval> | undefined;
      if (trackProgress) {
        let pct = 0;
        const sendProgress = (progress: number, message: string) =>
          server.notification({
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
        result = await executeTool(client, name, toolArgs);
      } finally {
        if (heartbeat) clearInterval(heartbeat);
        if (trackProgress) {
          await server.notification({
            method: 'notifications/progress',
            params: { progressToken, progress: 100, total: 100, message: `${name} complete` },
          }).catch(() => { /* ignore */ });
        }
      }

      // Structured output: include the raw object so capable clients get typed
      // content, while keeping the text block for backward compatibility.
      const structured = typeof result === 'object' && result !== null && !Array.isArray(result)
        ? { structuredContent: result as Record<string, unknown> }
        : {};
      return {
        content: [
          {
            type: 'text' as const,
            text: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
          },
        ],
        ...structured,
      };
    } catch (error) {
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

  // ─── Resources (@ mentions) ─────────────────────────────────────────────────

  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    return { resources: getResources() };
  });

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { uri } = request.params;

    try {
      const client = instanceManager.getClient();
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

  server.setRequestHandler(ListPromptsRequestSchema, async () => {
    return { prompts: getPrompts() };
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  server.setRequestHandler(GetPromptRequestSchema, async (request): Promise<any> => {
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
  const server = createServer();
  const tools = getTools();
  const httpServer = await connectTransport(server, tools.length);

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

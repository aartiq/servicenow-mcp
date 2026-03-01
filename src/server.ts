#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
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
import { getPrompts, resolvePrompt } from './prompts/index.js';
import { logger } from './utils/logging.js';
import { ServiceNowError } from './utils/errors.js';

dotenv.config();

// Require at least one instance to be configured
const hasLegacy = !!process.env.SERVICENOW_INSTANCE_URL;
const hasMulti = Object.keys(process.env).some(k => /^SN_INSTANCE_[A-Z0-9_]+_URL$/.test(k));
const hasConfig = !!process.env.SN_INSTANCES_CONFIG;
if (!hasLegacy && !hasMulti && !hasConfig) {
  logger.error('No ServiceNow instance configured. Set SERVICENOW_INSTANCE_URL or SN_INSTANCES_CONFIG.');
  process.exit(1);
}

const server = new Server(
  {
    name: 'servicenow-mcp',
    version: '1.0.0',
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

// ─── Tools ────────────────────────────────────────────────────────────────────

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  logger.info(`Tool called: ${name}`);

  try {
    const tool = tools.find(t => t.name === name);
    if (!tool) {
      throw new ServiceNowError(`Unknown tool: ${name}`, 'UNKNOWN_TOOL');
    }

    // Resolve client: use named instance if specified, otherwise current active instance
    const instanceName = (args as Record<string, unknown>)?.['instance'] as string | undefined;
    const client = instanceManager.getClient(instanceName);

    const { executeTool } = await import('./tools/index.js');
    const result = await executeTool(client, name, args || {});

    return {
      content: [
        {
          type: 'text' as const,
          text: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
        },
      ],
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

// ─── Resources (@ mentions) ───────────────────────────────────────────────────

server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return { resources: getResources() };
});

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;

  try {
    const client = instanceManager.getClient();
    const content = await readResource(client, uri);
    return {
      contents: [
        {
          uri,
          mimeType: 'application/json',
          text: JSON.stringify(content, null, 2),
        },
      ],
    };
  } catch (error) {
    logger.error(`Resource read error: ${uri}`, error);
    throw error;
  }
});

// ─── Prompts (/ slash commands) ───────────────────────────────────────────────

server.setRequestHandler(ListPromptsRequestSchema, async () => {
  return { prompts: getPrompts() };
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
server.setRequestHandler(GetPromptRequestSchema, async (request): Promise<any> => {
  const { name, arguments: args } = request.params;

  const result = resolvePrompt(name, args as Record<string, string> | undefined);
  if (!result) {
    throw new Error(`Unknown prompt: ${name}`);
  }

  return result;
});

// ─── Start ────────────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info(`servicenow-mcp server running on stdio [${tools.length} tools]`);
}

main().catch((error) => {
  logger.error('Server startup failed', error);
  process.exit(1);
});

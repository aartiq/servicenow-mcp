/**
 * REST API routes — HTTP wrapper around MCP tools, resources, and prompts.
 *
 * Endpoints:
 *   GET  /api/tools          — List all available tools
 *   GET  /api/tools/:name    — Get single tool schema
 *   POST /api/tool           — Execute a tool
 *   GET  /api/resources      — List MCP resources
 *   GET  /api/resource       — Read a resource by URI (?uri=...)
 *   GET  /api/prompts        — List prompts
 *   GET  /api/instances      — List configured ServiceNow instances
 *   POST /api/instances/switch — Switch active instance
 */
import type { NowAIKitHttpServer } from '../transport/http-server.js';
import { getTools, executeTool } from '../tools/index.js';
import { getResources, readResource } from '../resources/index.js';
import { getPrompts } from '../prompts/index.js';
import { instanceManager } from '../servicenow/instances.js';
import { ServiceNowError } from '../utils/errors.js';
import { logger } from '../utils/logging.js';

export function mountApiRoutes(httpServer: NowAIKitHttpServer): void {
  // List all tools
  httpServer.get('/api/tools', async (_req, res) => {
    const tools = getTools();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ count: tools.length, tools }));
  });

  // Get single tool by name
  httpServer.get('/api/tools/:name', async (req, res) => {
    const name = (req as any).params.name;
    const tool = getTools().find(t => t.name === name);
    if (!tool) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: `Tool not found: ${name}` }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(tool));
  });

  // Execute a tool
  httpServer.post('/api/tool', async (req, res) => {
    const body = (req as any).body || {};
    const { name, arguments: args, instance } = body;

    if (!name) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing required field: name' }));
      return;
    }

    try {
      const client = instanceManager.getClient(instance);
      const result = await executeTool(client, name, args || {});
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ result }));
    } catch (error) {
      logger.error(`API tool execution error: ${name}`, error);
      const status = error instanceof ServiceNowError ? 400 : 500;
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: message }));
    }
  });

  // List resources
  httpServer.get('/api/resources', async (_req, res) => {
    const resources = getResources();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ count: resources.length, resources }));
  });

  // Read a resource
  httpServer.get('/api/resource', async (req, res) => {
    const uri = (req as any).query?.uri;
    if (!uri) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing query parameter: uri' }));
      return;
    }
    try {
      const client = instanceManager.getClient();
      const result = await readResource(client, uri);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ result }));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }));
    }
  });

  // List prompts
  httpServer.get('/api/prompts', async (_req, res) => {
    const prompts = getPrompts();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ count: prompts.length, prompts }));
  });

  // List instances
  httpServer.get('/api/instances', async (_req, res) => {
    const instances = instanceManager.listAll();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ instances }));
  });

  // Switch active instance
  httpServer.post('/api/instances/switch', async (req, res) => {
    const body = (req as any).body || {};
    const { name } = body;
    if (!name) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing required field: name' }));
      return;
    }
    try {
      instanceManager.switch(name);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, active: name }));
    } catch (error) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }));
    }
  });
}

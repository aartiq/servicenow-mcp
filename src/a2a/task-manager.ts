/**
 * A2A Task Manager — handles the lifecycle of A2A tasks.
 * Maps incoming A2A messages to NowAIKit tool invocations.
 */
import { randomUUID } from 'crypto';
import type { Task, SendTaskRequest, SendTaskResponse, Message, Artifact, TextPart, DataPart } from './types.js';
import { getTools, executeTool } from '../tools/index.js';
import { instanceManager } from '../servicenow/instances.js';
import { logger } from '../utils/logging.js';

class TaskManager {
  private tasks = new Map<string, Task>();

  /** Send a task synchronously — execute and return the result. */
  async sendTask(request: SendTaskRequest): Promise<SendTaskResponse> {
    const taskId = request.id || randomUUID();
    const sessionId = request.sessionId || randomUUID();

    const task: Task = {
      id: taskId,
      sessionId,
      status: { state: 'submitted', timestamp: new Date().toISOString() },
      history: [request.message],
      artifacts: [],
    };
    this.tasks.set(taskId, task);

    // Update to working
    task.status = { state: 'working', timestamp: new Date().toISOString() };

    try {
      // Parse the message to determine tool and arguments
      const { toolName, toolArgs } = this.parseMessage(request.message);

      if (!toolName) {
        // No specific tool found — return a helpful response
        task.status = {
          state: 'completed',
          message: { role: 'agent', parts: [{ type: 'text', text: this.getHelpText() }] },
          timestamp: new Date().toISOString(),
        };
        this.tasks.set(taskId, task);
        return { id: taskId, sessionId, status: task.status };
      }

      // Execute the tool
      const client = instanceManager.getClient();
      const result = await executeTool(client, toolName, toolArgs);

      const artifact: Artifact = {
        name: toolName,
        description: `Result from ${toolName}`,
        parts: [{ type: 'data', data: result, mimeType: 'application/json' } as DataPart],
        index: 0,
      };
      task.artifacts = [artifact];

      task.status = {
        state: 'completed',
        message: {
          role: 'agent',
          parts: [
            { type: 'text', text: typeof result === 'string' ? result : JSON.stringify(result, null, 2) } as TextPart,
          ],
        },
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      logger.error(`A2A task failed: ${taskId}`, error);
      task.status = {
        state: 'failed',
        message: {
          role: 'agent',
          parts: [{ type: 'text', text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}` } as TextPart],
        },
        timestamp: new Date().toISOString(),
      };
    }

    this.tasks.set(taskId, task);
    return { id: taskId, sessionId, status: task.status, artifacts: task.artifacts };
  }

  /** Get a task by ID. */
  getTask(taskId: string): Task | undefined {
    return this.tasks.get(taskId);
  }

  /** Cancel a task. */
  cancelTask(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) return false;
    if (task.status.state === 'completed' || task.status.state === 'failed') return false;

    task.status = { state: 'canceled', timestamp: new Date().toISOString() };
    this.tasks.set(taskId, task);
    return true;
  }

  /**
   * Parse an A2A message to determine which tool to call.
   * Strategy: look for tool name in the text, or match keywords to tools.
   */
  private parseMessage(message: Message): { toolName: string | null; toolArgs: Record<string, any> } {
    const tools = getTools();
    const textParts = message.parts.filter(p => p.type === 'text') as TextPart[];
    const dataParts = message.parts.filter(p => p.type === 'data') as DataPart[];
    const text = textParts.map(p => p.text).join(' ').toLowerCase();

    // Check if data part contains explicit tool name and args
    for (const part of dataParts) {
      if (part.data && typeof part.data === 'object') {
        const data = part.data as Record<string, any>;
        if (data.tool_name && tools.find(t => t.name === data.tool_name)) {
          return { toolName: data.tool_name, toolArgs: data.arguments || {} };
        }
      }
    }

    // Try exact tool name match in text
    for (const tool of tools) {
      if (text.includes(tool.name)) {
        return { toolName: tool.name, toolArgs: this.extractArgsFromText(text, tool.name) };
      }
    }

    // Keyword matching for common operations
    if (text.includes('incident') && (text.includes('create') || text.includes('new'))) return { toolName: 'create_incident', toolArgs: {} };
    if (text.includes('incident') && text.includes('list')) return { toolName: 'query_records', toolArgs: { table: 'incident', query: 'active=true', limit: 20 } };
    if (text.includes('change') && text.includes('list')) return { toolName: 'list_change_requests', toolArgs: {} };
    if (text.includes('knowledge') && text.includes('search')) return { toolName: 'search_knowledge', toolArgs: { query: text } };
    if (text.includes('cmdb') && text.includes('health')) return { toolName: 'cmdb_health_dashboard', toolArgs: {} };

    return { toolName: null, toolArgs: {} };
  }

  private extractArgsFromText(text: string, _toolName: string): Record<string, any> {
    // Simple extraction — look for key=value patterns
    const args: Record<string, any> = {};
    const kvPattern = /(\w+)\s*[=:]\s*["']?([^"',\s]+)["']?/g;
    let match;
    while ((match = kvPattern.exec(text)) !== null) {
      if (match[1] !== _toolName.split('_')[0]) {
        args[match[1]!] = match[2];
      }
    }
    return args;
  }

  private getHelpText(): string {
    const tools = getTools();
    return `I'm NowAIKit, a ServiceNow AI agent with ${tools.length}+ tools. ` +
      `You can send me tasks like:\n` +
      `- "List active incidents"\n` +
      `- "Search knowledge for VPN setup"\n` +
      `- "CMDB health dashboard"\n` +
      `- Or specify a tool directly: { "tool_name": "query_records", "arguments": { "table": "incident" } }`;
  }
}

export const taskManager = new TaskManager();

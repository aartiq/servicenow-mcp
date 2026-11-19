/**
 * MCP tasks, backed by the job store.
 *
 * Two wire forms are served, chosen by the protocol era of each request:
 *
 * - 2026-07-28, the `io.modelcontextprotocol/tasks` extension (SEP-2663). The server decides. When a
 *   tools/call for a long-running tool carries the extension in that request's client capabilities,
 *   the result is a flat CreateTaskResult (`resultType: "task"`). The client polls `tasks/get`, which
 *   returns the CallToolResult inline once completed. `tasks/update` and `tasks/cancel` are acks.
 *   The capability is advertised under `capabilities.extensions` in server/discover.
 * - 2025-11-25 experimental tasks. The client asks with `params.task` on tools/call for a tool whose
 *   `execution.taskSupport` allows it. The result is `{ task }`; `tasks/get`, `tasks/result` (waits for
 *   the end), `tasks/list` and `tasks/cancel` are served, plus optional `notifications/tasks/status`.
 *   The capability is the `tasks` server capability in the initialize result.
 *
 * The v2 SDK (2.4.0) has no tasks runtime: its tools/call result validation rejects task results. The
 * TaskAwareServer subclass lets a handler hand a task result past that check through a per-request
 * slot, while every other tools/call result is validated as before.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import * as z from 'zod';
import {
  Server,
  ProtocolError,
  ProtocolErrorCode,
  CLIENT_CAPABILITIES_META_KEY,
  PROTOCOL_VERSION_META_KEY,
  RELATED_TASK_META_KEY,
  type JSONRPCRequest,
  type Result,
  type ServerCapabilities,
  type ServerContext,
} from '@modelcontextprotocol/server';
import { jobOwner, jobStore, TERMINAL, type Job } from './jobs.js';

export const TASKS_EXTENSION = 'io.modelcontextprotocol/tasks';
const FIRST_MODERN_REVISION = '2026-07-28';

/** Capabilities to merge into the server's: the 2025 `tasks` block and the 2026 extension. */
export const TASK_CAPABILITIES: ServerCapabilities = {
  // 2025-11-25. The 2026-07-28 discover encoder drops this deleted field on its own.
  tasks: { list: {}, cancel: {}, requests: { tools: { call: {} } } },
  // 2026-07-28. Removed from 2025-era initialize results by TaskAwareServer.getCapabilities().
  extensions: { [TASKS_EXTENSION]: {} },
};

// ─── Server subclass ────────────────────────────────────────────────────────

interface Slot { result?: Record<string, unknown> }
type Handler = (request: JSONRPCRequest, ctx: ServerContext) => Promise<Result>;
const slots = new AsyncLocalStorage<Slot>();

/** Placeholder the validated tools/call path sees when a task result is handed over through the slot. */
const PLACEHOLDER = { content: [{ type: 'text' as const, text: 'task created' }] };

export class TaskAwareServer extends Server {
  protected override _wrapHandler(method: string, handler: Handler): Handler {
    const wrapped = super._wrapHandler(method, handler);
    if (method !== 'tools/call') return wrapped;
    return async (request, ctx) => {
      const slot: Slot = {};
      const result = await slots.run(slot, () => wrapped(request, ctx));
      return (slot.result as Result | undefined) ?? result;
    };
  }

  /** Each era sees only its own task vocabulary: 2025-era initialize never names the 2026 extension. */
  override getCapabilities(): ServerCapabilities {
    const caps = super.getCapabilities();
    const version = this.getNegotiatedProtocolVersion();
    if (version && version < FIRST_MODERN_REVISION && caps.extensions?.[TASKS_EXTENSION]) {
      const extensions = { ...caps.extensions };
      delete extensions[TASKS_EXTENSION];
      const out: ServerCapabilities = { ...caps, extensions };
      if (!Object.keys(extensions).length) delete out.extensions;
      return out;
    }
    return caps;
  }
}

/**
 * Return a task result from a tools/call handler. Must be called inside a TaskAwareServer tools/call;
 * the return value is what the handler should return (the slot carries the real result).
 */
export function returnTaskResult(result: Record<string, unknown>): typeof PLACEHOLDER {
  const slot = slots.getStore();
  if (!slot) throw new ProtocolError(ProtocolErrorCode.InternalError, 'Task results need a TaskAwareServer');
  slot.result = result;
  return PLACEHOLDER;
}

// ─── Era and request detection ──────────────────────────────────────────────

type Envelope = Record<string, unknown> | undefined;
const envelopeOf = (ctx: ServerContext): Envelope => ctx.mcpReq.envelope as Envelope;

/** True when this request was served on the 2026-07-28 (or later) protocol. */
export function isModernRequest(ctx: ServerContext): boolean {
  const v = envelopeOf(ctx)?.[PROTOCOL_VERSION_META_KEY];
  return typeof v === 'string' && v >= FIRST_MODERN_REVISION;
}

/** True when this 2026-era request declared the tasks extension in its own client capabilities. */
export function requestDeclaresTasks(ctx: ServerContext): boolean {
  const caps = envelopeOf(ctx)?.[CLIENT_CAPABILITIES_META_KEY] as { extensions?: Record<string, unknown> } | undefined;
  return !!caps?.extensions && TASKS_EXTENSION in caps.extensions;
}

export type TaskRequest = { era: 'modern' } | { era: 'legacy'; ttlMs?: number };

/**
 * Whether this tools/call can be answered with a task: on 2026 when the request declares the
 * extension, on 2025 when the client sent `params.task`.
 */
export function taskRequestFor(params: Record<string, unknown> | undefined, ctx: ServerContext): TaskRequest | undefined {
  if (isModernRequest(ctx)) return requestDeclaresTasks(ctx) ? { era: 'modern' } : undefined;
  const task = params?.['task'];
  if (task && typeof task === 'object') {
    const ttl = Number((task as { ttl?: unknown }).ttl);
    return { era: 'legacy', ttlMs: Number.isFinite(ttl) && ttl > 0 ? ttl : undefined };
  }
  return undefined;
}

// ─── Shapes ─────────────────────────────────────────────────────────────────

/** The CallToolResult a finished job stands for (same shape the synchronous call would return). */
export function callToolResultFor(job: Job): Record<string, unknown> {
  if (job.status === 'completed') return toolResult(job.result);
  if (job.status === 'cancelled') return { content: [{ type: 'text', text: `Cancelled: ${job.tool} was cancelled.` }], isError: true };
  const e = job.error ?? { message: 'Unknown error' };
  return { content: [{ type: 'text', text: e.code ? `Error: ${e.message} (Code: ${e.code})` : `Error executing tool: ${e.message}` }], isError: true };
}

/** Text plus structured content, as server.ts returns for every tool. */
export function toolResult(result: unknown): Record<string, unknown> {
  const structured = typeof result === 'object' && result !== null && !Array.isArray(result)
    ? { structuredContent: result as Record<string, unknown> }
    : {};
  return {
    content: [{ type: 'text', text: typeof result === 'string' ? result : JSON.stringify(result, null, 2) }],
    ...structured,
  };
}

function statusMessage(job: Job): string | undefined {
  const { percent, message } = job.progress;
  if (!message && percent === undefined) return undefined;
  return percent !== undefined && job.status === 'running' ? `${message ?? job.tool} (${percent}%)` : message;
}

const iso = (ms: number) => new Date(ms).toISOString();

/** 2025-11-25 Task. A tool error is a failed task there. */
export function legacyTask(job: Job): Record<string, unknown> {
  const status = job.status === 'running' ? 'working' : job.status;
  const out: Record<string, unknown> = {
    taskId: job.id,
    status,
    ttl: job.ttlMs,
    createdAt: iso(job.createdAt),
    lastUpdatedAt: iso(job.updatedAt),
    pollInterval: job.pollIntervalMs,
  };
  const msg = statusMessage(job);
  if (msg) out.statusMessage = msg;
  return out;
}

/**
 * 2026-07-28 DetailedTask. A tool error is still a `completed` task whose result has isError; only a
 * job the server itself gave up on (time limit) is `failed`, with a JSON-RPC error.
 */
export function modernTask(job: Job, detailed: boolean): Record<string, unknown> {
  const internalFailure = job.status === 'failed' && job.error?.code === 'JOB_TIMEOUT';
  const status = job.status === 'running' ? 'working' : job.status === 'failed' && !internalFailure ? 'completed' : job.status;
  const out: Record<string, unknown> = {
    taskId: job.id,
    status,
    createdAt: iso(job.createdAt),
    lastUpdatedAt: iso(job.updatedAt),
    ttlMs: job.ttlMs,
    pollIntervalMs: job.pollIntervalMs,
  };
  const msg = statusMessage(job);
  if (msg) out.statusMessage = msg;
  if (detailed) {
    if (status === 'completed') out.result = callToolResultFor(job);
    if (status === 'failed') out.error = { code: ProtocolErrorCode.InternalError, message: job.error?.message ?? 'Task failed' };
  }
  return out;
}

export function createTaskResult(job: Job, era: TaskRequest['era']): Record<string, unknown> {
  return era === 'modern' ? { resultType: 'task', ...modernTask(job, false) } : { task: legacyTask(job) };
}

// ─── Handlers ───────────────────────────────────────────────────────────────

const TaskIdParams = z.looseObject({ taskId: z.string() });
const ListParams = z.looseObject({ cursor: z.string().optional() });
const UpdateParams = z.looseObject({ taskId: z.string(), inputResponses: z.record(z.string(), z.unknown()).optional() });

const notFound = (id: string) => new ProtocolError(ProtocolErrorCode.InvalidParams, `Task not found: ${id}`);
const methodNotFound = () => new ProtocolError(ProtocolErrorCode.MethodNotFound, 'Method not found');

/** The 2026 rule: tasks/* from a request that did not declare the extension get -32021. */
function requireExtension(ctx: ServerContext): void {
  if (!requestDeclaresTasks(ctx)) {
    throw new ProtocolError(ProtocolErrorCode.MissingRequiredClientCapability, `This request needs the ${TASKS_EXTENSION} extension in clientCapabilities`, {
      requiredCapabilities: { extensions: { [TASKS_EXTENSION]: {} } },
    });
  }
}

/**
 * Register tasks/get, tasks/update, tasks/cancel (2026 extension) and tasks/get, tasks/result,
 * tasks/list, tasks/cancel (2025-11-25). One handler per method serves both eras. The SDK already
 * answers -32601 for tasks/result and tasks/list on 2026 requests.
 */
export function registerTaskHandlers(server: Server): void {
  const owner = () => jobOwner();

  server.setRequestHandler('tasks/get', { params: TaskIdParams }, async (params, ctx) => {
    if (isModernRequest(ctx)) {
      requireExtension(ctx);
      const job = jobStore.get(params.taskId, owner());
      if (!job) throw notFound(params.taskId);
      return { resultType: 'complete', ...modernTask(job, true) };
    }
    const job = jobStore.get(params.taskId, owner());
    if (!job) throw notFound(params.taskId);
    return legacyTask(job);
  });

  server.setRequestHandler('tasks/cancel', { params: TaskIdParams }, async (params, ctx) => {
    const modern = isModernRequest(ctx);
    if (modern) requireExtension(ctx);
    const job = jobStore.get(params.taskId, owner());
    if (!job) throw notFound(params.taskId);
    if (modern) {
      // Cooperative and eventually consistent: a task that already finished stays finished.
      if (job.status === 'running') await jobStore.cancel(job.id, owner());
      return { resultType: 'complete' };
    }
    if (TERMINAL.has(job.status)) {
      throw new ProtocolError(ProtocolErrorCode.InvalidParams, `Cannot cancel task ${job.id}: it is already ${job.status}`);
    }
    const cancelled = await jobStore.cancel(job.id, owner());
    return legacyTask(cancelled ?? job);
  });

  server.setRequestHandler('tasks/update', { params: UpdateParams }, async (params, ctx) => {
    if (!isModernRequest(ctx)) throw methodNotFound();
    requireExtension(ctx);
    const job = jobStore.get(params.taskId, owner());
    if (!job) throw notFound(params.taskId);
    // NowAIKit tasks never enter input_required, so there is nothing to answer; unknown keys are ignored.
    return { resultType: 'complete' };
  });

  server.setRequestHandler('tasks/result', { params: TaskIdParams }, async (params, ctx) => {
    if (isModernRequest(ctx)) throw methodNotFound();
    let job = jobStore.get(params.taskId, owner());
    if (!job) throw notFound(params.taskId);
    // Blocks until the task is finished, as the 2025-11-25 spec requires.
    while (job && job.status === 'running') {
      if (ctx.mcpReq.signal?.aborted) throw new ProtocolError(ProtocolErrorCode.InternalError, 'Request cancelled');
      job = await jobStore.wait(job.id, owner(), 30_000);
    }
    if (!job) throw notFound(params.taskId);
    const result = callToolResultFor(job);
    return { ...result, _meta: { [RELATED_TASK_META_KEY]: { taskId: job.id } } };
  });

  server.setRequestHandler('tasks/list', { params: ListParams }, async (_params, ctx) => {
    if (isModernRequest(ctx)) throw methodNotFound();
    return { tasks: jobStore.list(owner()).slice(0, 100).map(legacyTask) };
  });
}

/**
 * 2025 sessions: push `notifications/tasks/status` when the job changes (optional in the spec; clients
 * still poll). Status messages carry the job's progress text.
 */
export function notifyLegacyTaskStatus(server: Server, job: Job): void {
  let last = '';
  const off = jobStore.onChange((j) => {
    if (j.id !== job.id) return;
    const task = legacyTask(j);
    const key = `${task.status}|${task.statusMessage ?? ''}`;
    if (key !== last) {
      last = key;
      server.notification({ method: 'notifications/tasks/status', params: task } as never).catch(() => { /* client may be gone */ });
    }
    if (TERMINAL.has(j.status)) off();
  });
}

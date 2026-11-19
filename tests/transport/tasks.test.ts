/**
 * Long-running operations end to end against the built server (dist/server.js):
 * - the portable job pattern (`async: true` + get_job) with the 2025-era v1 client,
 * - 2025-11-25 experimental tasks (params.task, tasks/get, tasks/result, tasks/list, tasks/cancel),
 * - the 2026-07-28 tasks extension (io.modelcontextprotocol/tasks: resultType "task", tasks/get,
 *   tasks/update, tasks/cancel) over Streamable HTTP.
 *
 * ServiceNow is a local stub with a CI/CD API that runs an "ATF suite" over a few polls.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, execSync, type ChildProcess } from 'node:child_process';
import { createServer, type Server as HttpServer } from 'node:http';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { AddressInfo } from 'node:net';
import * as z from 'zod';
import { Client as LegacyClient } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport as LegacyStdioTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { CallToolResultSchema, CreateTaskResultSchema } from '@modelcontextprotocol/sdk/types.js';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

const ROOT = resolve(__dirname, '../..');
const SERVER_JS = join(ROOT, 'dist', 'server.js');
const TASKS_EXT = 'io.modelcontextprotocol/tasks';
const SUITE = 'f'.repeat(32);
const TIMEOUT = 60_000;

// ─── Fake ServiceNow with a CI/CD test-suite runner ─────────────────────────

interface Stub { url: string; calls: string[]; close: () => Promise<void> }

async function startStub(): Promise<Stub> {
  const calls: string[] = [];
  const runs = new Map<string, { polls: number; cancelled: boolean }>();
  let next = 0;
  const server: HttpServer = createServer((req, res) => {
    const path = (req.url || '/').split('?')[0]!;
    calls.push(`${req.method} ${path}`);
    req.resume();
    res.setHeader('Content-Type', 'application/json');
    const send = (body: unknown) => res.end(JSON.stringify(body));
    if (req.method === 'POST' && path === '/api/sn_cicd/testsuite/run') {
      const id = `prog${++next}`;
      runs.set(id, { polls: 0, cancelled: false });
      return send({ result: { links: { progress: { id } }, status: '0', status_label: 'Pending', percent_complete: 0 } });
    }
    const prog = path.match(/^\/api\/sn_cicd\/progress\/([^/]+)(\/cancel)?$/);
    if (prog) {
      const run = runs.get(prog[1]!);
      if (!run) { res.statusCode = 404; return send({ error: { message: 'not found' } }); }
      if (prog[2]) { run.cancelled = true; return send({ result: { status: '4', status_label: 'Canceled' } }); }
      run.polls++;
      if (run.cancelled) return send({ result: { status: '4', status_label: 'Canceled', percent_complete: 50 } });
      // A "slow" run (id prog-slow) never finishes; the others finish on the third poll.
      if (run.polls < 3) return send({ result: { status: '1', status_label: 'Running', percent_complete: run.polls * 30, status_message: 'Running tests' } });
      return send({ result: { status: '2', status_label: 'Successful', percent_complete: 100, status_message: 'Done', links: { results: { id: `res-${prog[1]}` } } } });
    }
    const results = path.match(/^\/api\/sn_cicd\/testsuite\/results\/(.+)$/);
    if (results) {
      return send({ result: { test_suite_status: 'success', test_suite_duration: '3 Seconds', rolledup_test_success_count: 2, rolledup_test_failure_count: 0, rolledup_test_error_count: 0, rolledup_test_skip_count: 0, links: { results: { id: `suite-${results[1]}` } } } });
    }
    if (path.startsWith('/api/now/stats/')) return send({ result: { stats: { count: '42' } } });
    res.setHeader('X-Total-Count', '0');
    send({ result: [] });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address() as AddressInfo;
  return { url: `http://127.0.0.1:${port}`, calls, close: () => new Promise((r) => server.close(() => r())) };
}

let stub: Stub;
let home: string;
const children: ChildProcess[] = [];

function serverEnv(extra: Record<string, string> = {}): Record<string, string> {
  return {
    PATH: process.env.PATH || '',
    HOME: home,
    SERVICENOW_INSTANCE_URL: stub.url,
    SERVICENOW_USERNAME: 'fake-user',
    SERVICENOW_PASSWORD: 'fake-pass',
    ATF_ENABLED: 'true',
    NOWAIKIT_JOB_POLL_MS: '100',
    NOWAIKIT_AUDIT_DISABLED: 'true',
    ...extra,
  };
}

async function freePort(): Promise<number> {
  const s = createServer();
  await new Promise<void>((r) => s.listen(0, '127.0.0.1', r));
  const { port } = s.address() as AddressInfo;
  await new Promise<void>((r) => s.close(() => r()));
  return port;
}

async function startHttpServer(): Promise<string> {
  const port = await freePort();
  const child = spawn(process.execPath, [SERVER_JS], {
    cwd: home,
    env: serverEnv({ TRANSPORT: 'http', HOST: '127.0.0.1', PORT: String(port) }),
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  let stderr = '';
  child.stderr?.on('data', (d) => { stderr += String(d); });
  children.push(child);
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 200; i++) {
    try {
      if ((await fetch(`${base}/health`)).ok) return `${base}/mcp`;
    } catch { /* not up yet */ }
    if (child.exitCode !== null) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`HTTP server did not start:\n${stderr}`);
}

async function legacyStdio(): Promise<LegacyClient> {
  const client = new LegacyClient({ name: 'legacy-tasks', version: '1.0.0' }, { capabilities: {} });
  await client.connect(new LegacyStdioTransport({ command: process.execPath, args: [SERVER_JS], env: serverEnv(), cwd: home, stderr: 'ignore' }));
  return client;
}

beforeAll(async () => {
  if (!existsSync(SERVER_JS)) execSync('npx tsc', { cwd: ROOT, stdio: 'ignore' });
  stub = await startStub();
  home = mkdtempSync(join(tmpdir(), 'nowaikit-tasks-'));
}, 180_000);

afterAll(async () => {
  for (const child of children) child.kill();
  await stub?.close();
  if (home) rmSync(home, { recursive: true, force: true });
});

// ─── Portable job pattern ───────────────────────────────────────────────────

describe('portable jobs (any client): async: true + get_job', () => {
  it('2025-era v1 client: run_atf_suite async, then get_job to completion', async () => {
    const client = await legacyStdio();
    try {
      const { tools } = await client.listTools();
      const atf = tools.find((t) => t.name === 'run_atf_suite') as any;
      expect(atf.inputSchema.properties.async).toBeTruthy();
      expect(tools.find((t) => t.name === 'get_job')?.annotations?.readOnlyHint).toBe(true);

      const started = await client.callTool({ name: 'run_atf_suite', arguments: { sys_id: SUITE, async: true } }) as any;
      expect(started.isError).toBeFalsy();
      expect(started.structuredContent).toMatchObject({ status: 'running', poll_with: 'get_job', tool: 'run_atf_suite' });
      const jobId = started.structuredContent.job_id as string;

      let job: any;
      for (let i = 0; i < 10; i++) {
        job = (await client.callTool({ name: 'get_job', arguments: { job_id: jobId, wait_seconds: 5 } }) as any).structuredContent;
        if (job.status !== 'running') break;
      }
      expect(job.status).toBe('completed');
      expect(job.result.outcome).toMatchObject({ status: 'successful', passed: 2, failed: 0 });

      const list = (await client.callTool({ name: 'list_jobs', arguments: {} }) as any).structuredContent;
      expect(list.jobs.map((j: any) => j.job_id)).toContain(jobId);
    } finally {
      await client.close();
    }
  }, TIMEOUT);

  it('without async, run_atf_suite returns the same immediate start result as before', async () => {
    const client = await legacyStdio();
    try {
      const res = await client.callTool({ name: 'run_atf_suite', arguments: { sys_id: SUITE } }) as any;
      expect(res.structuredContent).toMatchObject({ action: 'suite_run_started', sys_id: SUITE });
      expect(res.structuredContent.job_id).toBeUndefined();
      const count = await client.callTool({ name: 'get_table_record_count', arguments: { table: 'incident' } }) as any;
      expect(count.structuredContent).toMatchObject({ record_count: '42' });
    } finally {
      await client.close();
    }
  }, TIMEOUT);
});

// ─── 2025-11-25 experimental tasks ──────────────────────────────────────────

describe('2025-11-25 tasks (v1 SDK client, stdio)', () => {
  it('advertises the tasks capability and per-tool taskSupport, not the 2026 extension', async () => {
    const client = await legacyStdio();
    try {
      const caps = client.getServerCapabilities() as any;
      expect(caps.tasks).toMatchObject({ list: {}, cancel: {}, requests: { tools: { call: {} } } });
      expect(caps.extensions?.[TASKS_EXT]).toBeUndefined();
      const { tools } = await client.listTools();
      expect((tools.find((t) => t.name === 'run_atf_suite') as any).execution).toEqual({ taskSupport: 'optional' });
      expect((tools.find((t) => t.name === 'get_record') as any).execution).toBeUndefined();
    } finally {
      await client.close();
    }
  }, TIMEOUT);

  it('callToolStream: task created, polled, result delivered through tasks/result', async () => {
    const client = await legacyStdio();
    try {
      const seen: string[] = [];
      let taskId = '';
      let final: any;
      for await (const msg of client.experimental.tasks.callToolStream({ name: 'run_atf_suite', arguments: { sys_id: SUITE } }, CallToolResultSchema, { task: { ttl: 120_000 } })) {
        seen.push(msg.type);
        if (msg.type === 'taskCreated') taskId = msg.task.taskId;
        if (msg.type === 'result') final = msg.result;
        if (msg.type === 'error') throw msg.error;
      }
      expect(seen[0]).toBe('taskCreated');
      expect(seen[seen.length - 1]).toBe('result');
      expect(taskId).toMatch(/^job_/);
      expect(final.structuredContent.outcome).toMatchObject({ status: 'successful', passed: 2 });

      const task = await client.experimental.tasks.getTask(taskId);
      expect(task).toMatchObject({ taskId, status: 'completed', ttl: 120_000 });
      const { tasks } = await client.experimental.tasks.listTasks();
      expect(tasks.map((t) => t.taskId)).toContain(taskId);
      // Cancelling a finished task is an error in 2025-11-25.
      await expect(client.experimental.tasks.cancelTask(taskId)).rejects.toThrow(/already completed/);
    } finally {
      await client.close();
    }
  }, TIMEOUT);

  it('tasks/cancel stops a running task and calls the ServiceNow cancel API', async () => {
    const client = await legacyStdio();
    try {
      const created = await client.request({ method: 'tools/call', params: { name: 'run_atf_suite', arguments: { sys_id: SUITE }, task: {} } }, CreateTaskResultSchema);
      const id = created.task.taskId;
      expect(created.task.status).toBe('working');
      const cancelled = await client.experimental.tasks.cancelTask(id);
      expect(cancelled.status).toBe('cancelled');
      // The cancel can land before ServiceNow answered the start call; the CI/CD cancel follows it.
      const sawCancel = () => stub.calls.some((c) => /^POST \/api\/sn_cicd\/progress\/prog\d+\/cancel$/.test(c));
      for (let i = 0; i < 40 && !sawCancel(); i++) await new Promise((r) => setTimeout(r, 50));
      expect(sawCancel()).toBe(true);
      const result = await client.experimental.tasks.getTaskResult(id, CallToolResultSchema);
      expect(result.isError).toBe(true);
    } finally {
      await client.close();
    }
  }, TIMEOUT);

  it('a task request for a tool without task support is refused with -32601', async () => {
    const client = await legacyStdio();
    try {
      await expect(client.request({ method: 'tools/call', params: { name: 'get_table_record_count', arguments: { table: 'incident' }, task: {} } }, CreateTaskResultSchema))
        .rejects.toMatchObject({ code: -32601 });
    } finally {
      await client.close();
    }
  }, TIMEOUT);
});

// ─── 2026-07-28 tasks extension ─────────────────────────────────────────────

const Any = z.looseObject({});

async function modernHttp(url: string, extension: boolean): Promise<Client> {
  const client = new Client({ name: 'modern-tasks', version: '1.0.0' }, {
    capabilities: extension ? { extensions: { [TASKS_EXT]: {} } } : {},
    versionNegotiation: { mode: 'auto' },
  });
  await client.connect(new StreamableHTTPClientTransport(new URL(url)));
  expect(client.getProtocolEra()).toBe('modern');
  return client;
}

/** Read one JSON-RPC response from a JSON or SSE body. */
async function rpcBody(res: Response): Promise<any> {
  const body = await res.text();
  if ((res.headers.get('content-type') || '').includes('text/event-stream')) {
    const data = body.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim()).filter(Boolean);
    return JSON.parse(data[data.length - 1]!);
  }
  return JSON.parse(body);
}

/**
 * A raw 2026-07-28 tools/call. The v2 SDK client (2.4.0) has no tasks support and refuses a
 * `resultType: "task"` result, so the create step is sent by hand, as a tasks-capable client would.
 */
async function modernCall(url: string, name: string, args: Record<string, unknown>, extension: boolean): Promise<any> {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      'mcp-protocol-version': '2026-07-28',
      'mcp-method': 'tools/call',
      'mcp-name': name,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name,
        arguments: args,
        _meta: {
          'io.modelcontextprotocol/protocolVersion': '2026-07-28',
          'io.modelcontextprotocol/clientInfo': { name: 'raw-tasks', version: '1' },
          'io.modelcontextprotocol/clientCapabilities': extension ? { extensions: { [TASKS_EXT]: {} } } : {},
        },
      },
    }),
  });
  expect(res.status).toBe(200);
  return rpcBody(res);
}

describe('2026-07-28 tasks extension (io.modelcontextprotocol/tasks)', () => {
  let url: string;
  beforeAll(async () => { url = await startHttpServer(); }, TIMEOUT);

  it('server/discover advertises the extension and no 2025 tasks capability; tools carry no execution field', async () => {
    const client = await modernHttp(url, true);
    try {
      const caps = client.getServerCapabilities() as any;
      expect(caps.extensions?.[TASKS_EXT]).toEqual({});
      expect(caps.tasks).toBeUndefined();
      const { tools } = await client.listTools();
      const atf = tools.find((t) => t.name === 'run_atf_suite') as any;
      expect(atf.execution).toBeUndefined();
      expect(atf.inputSchema.properties.async).toBeTruthy();
    } finally {
      await client.close();
    }
  }, TIMEOUT);

  it('stdio: the 2026 era advertises the extension too', async () => {
    const client = new Client({ name: 'modern-stdio', version: '1.0.0' }, { capabilities: { extensions: { [TASKS_EXT]: {} } }, versionNegotiation: { mode: 'auto' } });
    await client.connect(new StdioClientTransport({ command: process.execPath, args: [SERVER_JS], env: serverEnv(), cwd: home, stderr: 'ignore' }));
    try {
      expect(client.getProtocolEra()).toBe('modern');
      expect((client.getServerCapabilities() as any).extensions?.[TASKS_EXT]).toEqual({});
    } finally {
      await client.close();
    }
  }, TIMEOUT);

  it('round trip: tools/call returns a task, tasks/get polls it to completed with the result inline', async () => {
    const created = await modernCall(url, 'run_atf_suite', { sys_id: SUITE }, true);
    expect(created.result).toMatchObject({ resultType: 'task', status: 'working' });
    expect(created.result.task).toBeUndefined(); // flat, not the 2025 wrapper
    const taskId = created.result.taskId as string;
    expect(taskId).toMatch(/^job_/);
    expect(created.result.ttlMs).toBeGreaterThan(0);
    expect(created.result.pollIntervalMs).toBeGreaterThan(0);

    const client = await modernHttp(url, true);
    try {
      let task: any;
      for (let i = 0; i < 50; i++) {
        task = await client.request({ method: 'tasks/get', params: { taskId } } as any, Any);
        if (task.status !== 'working') break;
        expect(task.statusMessage).toBeTruthy();
        await new Promise((r) => setTimeout(r, 100));
      }
      expect(task.status).toBe('completed');
      expect(task.result.structuredContent.outcome).toMatchObject({ status: 'successful', passed: 2 });
      expect(task.result.isError).toBeFalsy();

      // tasks/update is an ack (NowAIKit tasks never ask for input); unknown keys are ignored.
      expect(await client.request({ method: 'tasks/update', params: { taskId, inputResponses: { nope: {} } } } as any, Any)).toBeTruthy();
      // tasks/cancel on a finished task is an ack; the task stays completed.
      await client.request({ method: 'tasks/cancel', params: { taskId } } as any, Any);
      expect((await client.request({ method: 'tasks/get', params: { taskId } } as any, Any) as any).status).toBe('completed');
      // Unknown task ids are -32602.
      await expect(client.request({ method: 'tasks/get', params: { taskId: 'job_missing' } } as any, Any)).rejects.toMatchObject({ code: -32602 });
    } finally {
      await client.close();
    }
  }, TIMEOUT);

  it('tasks/cancel stops a running task', async () => {
    const created = await modernCall(url, 'run_atf_suite', { sys_id: SUITE }, true);
    const taskId = created.result.taskId as string;
    const client = await modernHttp(url, true);
    try {
      await client.request({ method: 'tasks/cancel', params: { taskId } } as any, Any);
      const task = await client.request({ method: 'tasks/get', params: { taskId } } as any, Any) as any;
      expect(task.status).toBe('cancelled');
    } finally {
      await client.close();
    }
  }, TIMEOUT);

  it('tasks/* without the extension in the request capabilities is -32021', async () => {
    const created = await modernCall(url, 'run_atf_suite', { sys_id: SUITE }, true);
    const client = await modernHttp(url, false);
    try {
      await expect(client.request({ method: 'tasks/get', params: { taskId: created.result.taskId } } as any, Any)).rejects.toMatchObject({ code: -32021 });
    } finally {
      await client.close();
    }
  }, TIMEOUT);

  it('without the extension, the same call is answered synchronously as before', async () => {
    const res = await modernCall(url, 'run_atf_suite', { sys_id: SUITE }, false);
    expect(res.result.resultType).toBe('complete');
    expect(res.result.structuredContent).toMatchObject({ action: 'suite_run_started', sys_id: SUITE });
    // and a quick tool with the extension declared is never turned into a task
    const quick = await modernCall(url, 'get_table_record_count', { table: 'incident' }, true);
    expect(quick.result.resultType).toBe('complete');
    expect(quick.result.structuredContent).toMatchObject({ record_count: '42' });
  }, TIMEOUT);

  it('the 2026 v2 client can follow a job with get_job (portable path)', async () => {
    const client = await modernHttp(url, false);
    try {
      const started = await client.callTool({ name: 'run_atf_suite', arguments: { sys_id: SUITE, async: true } }) as any;
      const jobId = started.structuredContent.job_id;
      const done = await client.callTool({ name: 'get_job', arguments: { job_id: jobId, wait_seconds: 10 } }) as any;
      expect(done.structuredContent).toMatchObject({ status: 'completed', result: { outcome: { status: 'successful' } } });
    } finally {
      await client.close();
    }
  }, TIMEOUT);
});

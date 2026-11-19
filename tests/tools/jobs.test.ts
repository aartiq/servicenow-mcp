import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import type { ServiceNowClient } from '../../src/servicenow/client.js';

// The job store reads its poll interval at import, so set it before loading the modules.
let jobs: typeof import('../../src/tools/jobs.js');
let store: typeof import('../../src/utils/jobs.js');
let tools: typeof import('../../src/tools/index.js');
let ctx: typeof import('../../src/utils/request-context.js');

beforeAll(async () => {
  process.env.NOWAIKIT_JOB_POLL_MS = '10';
  jobs = await import('../../src/tools/jobs.js');
  store = await import('../../src/utils/jobs.js');
  tools = await import('../../src/tools/index.js');
  ctx = await import('../../src/utils/request-context.js');
});

function mockClient() {
  return {
    instanceHost: 'test.service-now.com',
    apiRequest: vi.fn(),
    callNowAssist: vi.fn(),
    getRecord: vi.fn(),
    executeScript: vi.fn(),
    queryRecords: vi.fn(),
  } as unknown as ServiceNowClient & Record<string, ReturnType<typeof vi.fn>>;
}

const execute = (c: ServiceNowClient, n: string, a: Record<string, any>) => tools.executeTool(c, n, a);

describe('long-running tools as jobs', () => {
  beforeEach(() => {
    process.env.ATF_ENABLED = 'true';
    store.jobStore.clear();
  });
  afterEach(() => {
    delete process.env.ATF_ENABLED;
    delete process.env.NOWAIKIT_AUTO_ASYNC_MS;
  });

  it('run_atf_suite with async: true returns a job id, follows the CI/CD progress API and reports the suite outcome', async () => {
    const client = mockClient();
    client.callNowAssist.mockResolvedValue({ result: { links: { progress: { id: 'prog1' } }, status: '0', status_label: 'Pending' } });
    const progress = [
      { result: { status: '1', percent_complete: 40, status_message: 'Running tests' } },
      { result: { status: '2', percent_complete: 100, status_message: 'Done', links: { results: { id: 'res1' } } } },
    ];
    client.apiRequest.mockImplementation(async (method: string, path: string) => {
      if (method === 'GET' && path === '/api/sn_cicd/progress/prog1') return progress.shift() ?? progress[0];
      if (method === 'GET' && path === '/api/sn_cicd/testsuite/results/res1') {
        return { result: { test_suite_status: 'success', test_suite_duration: '12 Seconds', rolledup_test_success_count: 3, rolledup_test_failure_count: 0, rolledup_test_error_count: 0, rolledup_test_skip_count: 0, links: { results: { id: 'suiteresult1' } } } };
      }
      throw new Error(`unexpected ${method} ${path}`);
    });

    const started = await jobs.runLongRunningTool(client, 'run_atf_suite', { sys_id: 'a'.repeat(32) }, execute, true) as any;
    expect(started).toMatchObject({ status: 'running', tool: 'run_atf_suite', poll_with: 'get_job' });
    expect(started.job_id).toMatch(/^job_/);

    const done = await tools.executeTool(client, 'get_job', { job_id: started.job_id, wait_seconds: 5 });
    expect(done.status).toBe('completed');
    expect(done.result).toMatchObject({
      action: 'suite_run_started',
      outcome: { status: 'successful', suite_result_sys_id: 'suiteresult1', passed: 3, failed: 0, test_suite_status: 'success' },
    });
    expect(client.callNowAssist).toHaveBeenCalledTimes(1);
  });

  it('cancel_job calls the CI/CD cancel API for an ATF run', async () => {
    const client = mockClient();
    client.callNowAssist.mockResolvedValue({ result: { links: { progress: { id: 'prog2' } }, status: '0' } });
    client.apiRequest.mockImplementation(async (method: string, path: string) => {
      if (method === 'GET') return { result: { status: '1', percent_complete: 10 } };
      if (method === 'POST' && path === '/api/sn_cicd/progress/prog2/cancel') return { result: { status: '4' } };
      throw new Error(`unexpected ${method} ${path}`);
    });
    const started = await jobs.runLongRunningTool(client, 'run_atf_suite', { sys_id: 'b'.repeat(32) }, execute, true) as any;
    await new Promise((r) => setTimeout(r, 40));
    const running = await tools.executeTool(client, 'get_job', { job_id: started.job_id });
    expect(running.status).toBe('running');
    expect(running.progress.message).toContain('ATF suite running');

    const cancelled = await tools.executeTool(client, 'cancel_job', { job_id: started.job_id });
    expect(cancelled).toMatchObject({ status: 'cancelled', servicenow_cancelled: true });
    expect(cancelled.summary).toContain('ServiceNow was asked to stop');
    expect(client.apiRequest).toHaveBeenCalledWith('POST', '/api/sn_cicd/progress/prog2/cancel', {});
  });

  it('a call that finishes under the auto-async threshold returns its normal result unchanged', async () => {
    const client = mockClient();
    const result = { action: 'suite_run_started', sys_id: 'x' };
    const fast = vi.fn().mockResolvedValue(result);
    const out = await jobs.runLongRunningTool(client, 'run_transform_map', {}, fast, false);
    expect(out).toBe(result);
    expect(store.jobStore.size).toBe(0);
  });

  it('a call that runs past the threshold becomes a job and its result arrives through get_job', async () => {
    process.env.NOWAIKIT_AUTO_ASYNC_MS = '30';
    const client = mockClient();
    const slow = vi.fn(() => new Promise((r) => setTimeout(() => r({ inserts: 10 }), 120)));
    const out = await jobs.runLongRunningTool(client, 'run_transform_map', { a: 1 }, slow, false) as any;
    expect(out.status).toBe('running');
    expect(out.summary).toContain('still running');
    expect(slow).toHaveBeenCalledTimes(1); // the in-flight call is adopted, not restarted
    const done = await tools.executeTool(client, 'get_job', { job_id: out.job_id, wait_seconds: 5 });
    expect(done).toMatchObject({ status: 'completed', result: { inserts: 10 } });
    expect(slow).toHaveBeenCalledTimes(1);
  });

  it('NOWAIKIT_AUTO_ASYNC_MS=0 turns auto-async off', async () => {
    process.env.NOWAIKIT_AUTO_ASYNC_MS = '0';
    const slow = vi.fn(() => new Promise((r) => setTimeout(() => r('ok'), 30)));
    expect(await jobs.runLongRunningTool(mockClient(), 'run_transform_map', {}, slow, false)).toBe('ok');
  });

  it('a failing tool fails the job with its error code', async () => {
    const client = mockClient();
    // ATF disabled: the tool's own permission check fails inside the job.
    delete process.env.ATF_ENABLED;
    const started = await jobs.runLongRunningTool(client, 'run_atf_suite', { sys_id: 'c'.repeat(32) }, execute, true) as any;
    const done = await tools.executeTool(client, 'get_job', { job_id: started.job_id, wait_seconds: 5 });
    expect(done.status).toBe('failed');
    expect(done.error.message).toMatch(/ATF/);
  });

  it('follows a triggered flow until its context completes', async () => {
    const client = mockClient();
    const states = ['QUEUED', 'IN_PROGRESS', 'COMPLETE'];
    client.getRecord.mockImplementation(async () => ({ state: states.shift() ?? 'COMPLETE', run_time: '2' }));
    const fakeStart = vi.fn().mockResolvedValue({ flow: 'global.x', type: 'flow', context_id: 'd'.repeat(32) });
    const job = jobs.startToolJob(client, 'trigger_flow', {}, fakeStart, { origin: 'async' });
    await store.jobStore.wait(job.id, 'local', 5000);
    expect(job.status).toBe('completed');
    expect(job.result).toMatchObject({ context_id: 'd'.repeat(32), outcome: { status: 'complete' } });
    expect(client.getRecord).toHaveBeenCalledWith('sys_flow_context', 'd'.repeat(32), expect.any(String));
  });

  it('jobs are invisible to other delegated identities', async () => {
    const client = mockClient();
    const fake = vi.fn(() => new Promise((r) => setTimeout(() => r('x'), 50)));
    const started = await ctx.runWithDelegatedAuth({ bearerToken: 'alice', flags: {} }, () =>
      jobs.runLongRunningTool(client, 'run_transform_map', {}, fake, true)) as any;
    const asBob = ctx.runWithDelegatedAuth({ bearerToken: 'bob', flags: {} }, () =>
      tools.executeTool(client, 'get_job', { job_id: started.job_id }));
    await expect(asBob).rejects.toThrow(/Job not found/);
    const bobList = await ctx.runWithDelegatedAuth({ bearerToken: 'bob', flags: {} }, () => tools.executeTool(client, 'list_jobs', {}));
    expect(bobList.count).toBe(0);
    const asAlice = await ctx.runWithDelegatedAuth({ bearerToken: 'alice', flags: {} }, () =>
      tools.executeTool(client, 'get_job', { job_id: started.job_id, wait_seconds: 2 }));
    expect(asAlice.status).toBe('completed');
    // And not from the local (non-delegated) scope either.
    await expect(tools.executeTool(client, 'get_job', { job_id: started.job_id })).rejects.toThrow(/Job not found/);
  });

  it('list_jobs lists the caller\'s jobs without their results', async () => {
    const client = mockClient();
    await jobs.runLongRunningTool(client, 'run_transform_map', {}, vi.fn().mockResolvedValue({ big: 'payload' }), true);
    await new Promise((r) => setTimeout(r, 10));
    const list = await tools.executeTool(client, 'list_jobs', {});
    expect(list.count).toBe(1);
    expect(list.jobs[0]).toMatchObject({ tool: 'run_transform_map', status: 'completed' });
    expect(list.jobs[0]).not.toHaveProperty('result');
  });

  it('get_job and cancel_job need a job_id', async () => {
    await expect(tools.executeTool(mockClient(), 'get_job', {})).rejects.toThrow(/job_id is required/);
    await expect(tools.executeTool(mockClient(), 'cancel_job', { job_id: 'job_nope' })).rejects.toThrow(/Job not found/);
  });
});

describe('job tool definitions', () => {
  afterEach(() => {
    delete process.env.MCP_TOOL_PACKAGE;
    delete process.env.MCP_TOOL_DISCOVERY;
  });

  it('long-running tools accept async and declare optional task support; others do not', () => {
    const all = tools.getTools() as Array<any>;
    const atf = all.find((t) => t.name === 'run_atf_suite');
    expect(atf.inputSchema.properties.async.type).toBe('boolean');
    expect(atf.inputSchema.properties.sys_id).toBeTruthy();
    expect(atf.inputSchema.required).toEqual(['sys_id']);
    expect(atf.execution).toEqual({ taskSupport: 'optional' });
    const count = all.find((t) => t.name === 'run_aggregate_query');
    expect(count.inputSchema.properties.async).toBeUndefined();
    expect(count.execution).toBeUndefined();
  });

  it('annotations: get_job and list_jobs are read-only, cancel_job writes but is not destructive', () => {
    const all = tools.getTools() as Array<any>;
    const byName = (n: string) => all.find((t) => t.name === n);
    expect(byName('get_job').annotations.readOnlyHint).toBe(true);
    expect(byName('list_jobs').annotations.readOnlyHint).toBe(true);
    expect(byName('cancel_job').annotations).toMatchObject({ readOnlyHint: false, destructiveHint: false });
  });

  it('get_job is in the lean core set and in the packages that have long-running tools', () => {
    process.env.MCP_TOOL_DISCOVERY = 'lean';
    expect(tools.getTools().map((t) => t.name)).toContain('get_job');
    delete process.env.MCP_TOOL_DISCOVERY;
    for (const pkg of ['platform_developer', 'itom_engineer', 'system_administrator', 'integration_engineer', 'devops_engineer', 'ai_developer']) {
      process.env.MCP_TOOL_PACKAGE = pkg;
      const names = tools.getTools().map((t) => t.name);
      expect(names, pkg).toEqual(expect.arrayContaining(['get_job', 'list_jobs', 'cancel_job']));
    }
  });
});

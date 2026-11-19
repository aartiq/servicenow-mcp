import { describe, it, expect, afterEach } from 'vitest';
import { JobStore, jobOwner, describeJob } from '../../src/utils/jobs.js';
import { runWithDelegatedAuth } from '../../src/utils/request-context.js';

const tick = () => new Promise((r) => setTimeout(r, 0));
const deferred = <T = unknown>() => {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

describe('JobStore', () => {
  it('runs a job to completion and keeps the result', async () => {
    const store = new JobStore();
    const job = store.start('alice', 'run_atf_suite', async (ctx) => {
      ctx.progress({ percent: 40, message: 'halfway' });
      return { ok: true };
    });
    expect(job.id).toMatch(/^job_[0-9a-f-]{36}$/);
    expect(job.status).toBe('running');
    await store.wait(job.id, 'alice', 1000);
    expect(job.status).toBe('completed');
    expect(job.result).toEqual({ ok: true });
    expect(job.progress.percent).toBe(100);
    const view = describeJob(job);
    expect(view).toMatchObject({ job_id: job.id, status: 'completed', result: { ok: true } });
    expect(view).not.toHaveProperty('owner');
    expect(view).not.toHaveProperty('poll_with');
  });

  it('records failures with the error code', async () => {
    const store = new JobStore();
    const job = store.start('alice', 't', async () => { throw Object.assign(new Error('boom'), { code: 'ATF_RUN_FAILED' }); });
    await store.wait(job.id, 'alice', 1000);
    expect(job.status).toBe('failed');
    expect(job.error).toEqual({ message: 'boom', code: 'ATF_RUN_FAILED' });
  });

  it('scopes jobs to their owner: another owner sees nothing', async () => {
    const store = new JobStore();
    const d = deferred();
    const job = store.start('alice', 't', () => d.promise);
    expect(store.get(job.id, 'alice')).toBe(job);
    expect(store.get(job.id, 'bob')).toBeUndefined();
    expect(store.list('bob')).toEqual([]);
    expect(await store.cancel(job.id, 'bob')).toBeUndefined();
    expect(job.status).toBe('running');
    expect(store.list('alice').map((j) => j.id)).toEqual([job.id]);
    d.resolve('done');
  });

  it('expires finished jobs after their TTL, never running ones', async () => {
    let now = 1_000_000;
    const store = new JobStore({ ttlMs: 60_000, now: () => now });
    const slow = deferred();
    const running = store.start('a', 'slow', () => slow.promise);
    const done = store.start('a', 'fast', async () => 1);
    await store.wait(done.id, 'a', 1000);
    expect(done.status).toBe('completed');
    now += 59_000;
    expect(store.get(done.id, 'a')).toBe(done);
    now += 2_000;
    expect(store.get(done.id, 'a')).toBeUndefined();
    expect(store.get(running.id, 'a')).toBe(running);
    slow.resolve(0);
  });

  it('caps the store: evicts the oldest finished job, refuses when all are running', async () => {
    const store = new JobStore({ maxJobs: 2, maxRunningPerOwner: 10 });
    const first = store.start('a', 'one', async () => 1);
    await store.wait(first.id, 'a', 1000);
    const blocker = deferred();
    const second = store.start('a', 'two', () => blocker.promise);
    const third = store.start('a', 'three', () => blocker.promise); // evicts `first`
    expect(store.get(first.id, 'a')).toBeUndefined();
    expect(store.size).toBe(2);
    expect(() => store.start('a', 'four', () => blocker.promise)).toThrow(/full of running jobs/);
    blocker.resolve(0);
    await Promise.all([store.wait(second.id, 'a', 1000), store.wait(third.id, 'a', 1000)]);
  });

  it('limits running jobs per owner', () => {
    const store = new JobStore({ maxRunningPerOwner: 1 });
    const d = deferred();
    store.start('a', 'one', () => d.promise);
    expect(() => store.start('a', 'two', () => d.promise)).toThrow(/Too many running jobs/);
    expect(() => store.start('b', 'two', () => d.promise)).not.toThrow();
    d.resolve(0);
  });

  it('cancel aborts the runner, calls the ServiceNow cancel hook and keeps the job cancelled', async () => {
    const store = new JobStore();
    let hookCalls = 0;
    let aborted = false;
    const d = deferred();
    const job = store.start('a', 'run_atf_suite', async (ctx) => {
      ctx.onCancel(async () => { hookCalls++; });
      ctx.signal.addEventListener('abort', () => { aborted = true; });
      await d.promise;
      return 'late result';
    });
    await tick();
    const out = await store.cancel(job.id, 'a');
    expect(out?.status).toBe('cancelled');
    expect(out?.remoteCancelled).toBe(true);
    expect(hookCalls).toBe(1);
    expect(aborted).toBe(true);
    d.resolve(0); // the runner finishing later does not undo the cancel
    await tick();
    expect(job.status).toBe('cancelled');
    expect(job.result).toBeUndefined();
    // Cancelling again is a no-op.
    expect((await store.cancel(job.id, 'a'))?.status).toBe('cancelled');
    expect(hookCalls).toBe(1);
  });

  it('cancel without a ServiceNow API reports that only the wait stopped', async () => {
    const store = new JobStore();
    const d = deferred();
    const job = store.start('a', 't', () => d.promise);
    const out = await store.cancel(job.id, 'a');
    expect(out?.remoteCancelled).toBe(false);
    d.resolve(0);
  });

  it('stops jobs that run past the time limit', async () => {
    const store = new JobStore({ maxRunMs: 30 });
    const job = store.start('a', 'slow', (ctx) => new Promise((_r, reject) => ctx.signal.addEventListener('abort', () => reject(new Error('aborted')))));
    await new Promise((r) => setTimeout(r, 80));
    expect(job.status).toBe('failed');
    expect(job.error?.code).toBe('JOB_TIMEOUT');
  });

  it('wait returns early when the job finishes and times out otherwise', async () => {
    const store = new JobStore();
    const d = deferred();
    const job = store.start('a', 't', () => d.promise);
    const t0 = Date.now();
    await store.wait(job.id, 'a', 50);
    expect(Date.now() - t0).toBeGreaterThanOrEqual(40);
    expect(job.status).toBe('running');
    setTimeout(() => d.resolve('x'), 10);
    await store.wait(job.id, 'a', 5000);
    expect(job.status).toBe('completed');
  });

  it('notifies listeners on progress and completion', async () => {
    const store = new JobStore();
    const seen: string[] = [];
    const off = store.onChange((j) => seen.push(`${j.status}:${j.progress.percent ?? ''}`));
    const job = store.start('a', 't', async (ctx) => { ctx.progress({ percent: 50 }); return 1; });
    await store.wait(job.id, 'a', 1000);
    off();
    expect(seen).toContain('running:50');
    expect(seen[seen.length - 1]).toBe('completed:100');
  });
});

describe('jobOwner', () => {
  const saved = process.env.NOWAIKIT_DELEGATED_SECRET;
  afterEach(() => {
    if (saved === undefined) delete process.env.NOWAIKIT_DELEGATED_SECRET;
    else process.env.NOWAIKIT_DELEGATED_SECRET = saved;
  });

  it('is one local scope without delegation', () => {
    expect(jobOwner()).toBe('local');
  });

  it('keys on the hashed token and instance under delegation, never the raw token', () => {
    delete process.env.NOWAIKIT_DELEGATED_SECRET;
    const a = runWithDelegatedAuth({ bearerToken: 'tok-a', instanceUrl: 'https://acme.service-now.com' }, () => jobOwner());
    const b = runWithDelegatedAuth({ bearerToken: 'tok-b', instanceUrl: 'https://acme.service-now.com' }, () => jobOwner());
    const other = runWithDelegatedAuth({ bearerToken: 'tok-a', instanceUrl: 'https://other.service-now.com' }, () => jobOwner());
    expect(a).not.toBe(b);
    expect(a).not.toBe(other);
    expect(a).not.toContain('tok-a');
    expect(a).toMatch(/@acme\.service-now\.com$/);
  });

  it('keys on the gateway user when the gateway secret is configured, so a refreshed token keeps its jobs', () => {
    process.env.NOWAIKIT_DELEGATED_SECRET = 's';
    const before = runWithDelegatedAuth({ bearerToken: 'old', user: 'u1', instanceUrl: 'https://acme.service-now.com' }, () => jobOwner());
    const after = runWithDelegatedAuth({ bearerToken: 'new', user: 'u1', instanceUrl: 'https://acme.service-now.com' }, () => jobOwner());
    const someoneElse = runWithDelegatedAuth({ bearerToken: 'new', user: 'u2', instanceUrl: 'https://acme.service-now.com' }, () => jobOwner());
    expect(before).toBe(after);
    expect(after).not.toBe(someoneElse);
  });

  it('ignores a user header without the gateway secret (it could be forged)', () => {
    delete process.env.NOWAIKIT_DELEGATED_SECRET;
    const a = runWithDelegatedAuth({ bearerToken: 't1', user: 'u1' }, () => jobOwner());
    const b = runWithDelegatedAuth({ bearerToken: 't2', user: 'u1' }, () => jobOwner());
    expect(a).not.toBe(b);
  });
});

describe('JobStore cancel during the start call', () => {
  it('runs a cancel hook registered after the job was cancelled', async () => {
    const store = new JobStore();
    const start = deferred();
    let hook = 0;
    const job = store.start('a', 'run_atf_suite', async (ctx) => {
      await start.promise; // ServiceNow has not answered the start call yet
      ctx.onCancel(async () => { hook++; });
      return 'started';
    });
    await store.cancel(job.id, 'a');
    expect(job.remoteCancelled).toBe(false);
    start.resolve(0);
    await new Promise((r) => setTimeout(r, 10));
    expect(hook).toBe(1);
    expect(job.remoteCancelled).toBe(true);
    expect(job.status).toBe('cancelled');
  });
});

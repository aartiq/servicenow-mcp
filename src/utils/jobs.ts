/**
 * In-process job store for long-running tool calls.
 *
 * A job wraps one tool run (plus, where ServiceNow does the work asynchronously, a watcher that polls
 * ServiceNow's own status until the work finishes). Clients poll it with get_job, or through the MCP
 * tasks methods when they support them. Both views read the same store.
 *
 * - Jobs are scoped to an owner key (the delegated user or token plus instance, or the local instance),
 *   and every lookup checks it, so one caller can never read or cancel another caller's job. A job
 *   owned by someone else looks exactly like a job that does not exist.
 * - Finished jobs are kept for a TTL, then dropped. The store holds at most `maxJobs` jobs, evicting
 *   the oldest finished ones first, and refuses new work when it is full of running jobs.
 * - A running job that exceeds `maxRunMs` is aborted and marked failed.
 * - State lives in memory only: a restart forgets every job. ServiceNow-side work (an ATF run, a
 *   discovery scan) keeps going on the instance regardless.
 */
import { randomUUID, createHash } from 'node:crypto';
import { ServiceNowError } from './errors.js';
import { getDelegatedAuth } from './request-context.js';

export type JobStatus = 'running' | 'completed' | 'failed' | 'cancelled';

export interface JobProgress {
  /** 0 to 100 when known. */
  percent?: number;
  message?: string;
}

/** How the job was started: `async: true`, automatically after the sync threshold, or an MCP task. */
export type JobOrigin = 'async' | 'auto' | 'task';

export interface Job {
  id: string;
  owner: string;
  tool: string;
  origin: JobOrigin;
  status: JobStatus;
  createdAt: number;
  updatedAt: number;
  finishedAt?: number;
  ttlMs: number;
  pollIntervalMs: number;
  progress: JobProgress;
  result?: unknown;
  error?: { message: string; code?: string };
  /** True when cancel_job reached a ServiceNow cancel API, false when it could only stop waiting. */
  remoteCancelled?: boolean;
}

export interface JobContext {
  /** Aborted when the job is cancelled or runs past its time limit. */
  signal: AbortSignal;
  progress(update: JobProgress): void;
  /** Register a best-effort ServiceNow-side cancel (for example the CI/CD progress cancel API). */
  onCancel(fn: () => Promise<unknown> | unknown): void;
}

export type JobRunner = (ctx: JobContext) => Promise<unknown>;

export interface JobStoreOptions {
  maxJobs?: number;
  maxRunningPerOwner?: number;
  ttlMs?: number;
  maxRunMs?: number;
  pollIntervalMs?: number;
  now?: () => number;
}

interface Entry {
  job: Job;
  abort: AbortController;
  cancelHooks: Array<() => Promise<unknown> | unknown>;
  done: Promise<void>;
  timer?: ReturnType<typeof setTimeout>;
}

const envInt = (name: string, fallback: number): number => {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
};

export const TERMINAL: ReadonlySet<JobStatus> = new Set(['completed', 'failed', 'cancelled']);

export class JobStore {
  private entries = new Map<string, Entry>();
  private listeners = new Set<(job: Job) => void>();
  readonly maxJobs: number;
  readonly maxRunningPerOwner: number;
  readonly ttlMs: number;
  readonly maxRunMs: number;
  readonly pollIntervalMs: number;
  private now: () => number;

  constructor(options: JobStoreOptions = {}) {
    this.maxJobs = options.maxJobs ?? 200;
    this.maxRunningPerOwner = options.maxRunningPerOwner ?? 20;
    this.ttlMs = options.ttlMs ?? 60 * 60 * 1000;
    this.maxRunMs = options.maxRunMs ?? 2 * 60 * 60 * 1000;
    this.pollIntervalMs = options.pollIntervalMs ?? 5000;
    this.now = options.now ?? Date.now;
  }

  /** Start a job. The runner begins immediately; the returned job is a live snapshot reference. */
  start(owner: string, tool: string, run: JobRunner, opts: { origin?: JobOrigin; ttlMs?: number } = {}): Job {
    this.sweep();
    const running = [...this.entries.values()].filter((e) => e.job.owner === owner && e.job.status === 'running').length;
    if (running >= this.maxRunningPerOwner) {
      throw new ServiceNowError(`Too many running jobs (${running}). Wait for one to finish or cancel one with cancel_job.`, 'JOB_LIMIT');
    }
    if (this.entries.size >= this.maxJobs) this.evictFinished(this.entries.size - this.maxJobs + 1);
    if (this.entries.size >= this.maxJobs) {
      throw new ServiceNowError('The job store is full of running jobs. Try again when some finish.', 'JOB_LIMIT');
    }

    const t = this.now();
    const ttl = Math.min(Math.max(opts.ttlMs ?? this.ttlMs, 60_000), 24 * 60 * 60 * 1000);
    const job: Job = {
      id: `job_${randomUUID()}`,
      owner,
      tool,
      origin: opts.origin ?? 'async',
      status: 'running',
      createdAt: t,
      updatedAt: t,
      ttlMs: ttl,
      pollIntervalMs: this.pollIntervalMs,
      progress: { message: `Running ${tool}` },
    };
    const abort = new AbortController();
    const entry: Entry = { job, abort, cancelHooks: [], done: Promise.resolve() };
    this.entries.set(job.id, entry);

    const ctx: JobContext = {
      signal: abort.signal,
      progress: (update) => {
        if (job.status !== 'running') return;
        const percent = update.percent === undefined ? job.progress.percent : Math.max(0, Math.min(100, Math.round(update.percent)));
        job.progress = { percent, message: update.message ?? job.progress.message };
        this.touch(job);
      },
      onCancel: (fn) => {
        // Cancelled while the start call was still in flight: stop the ServiceNow side now.
        if (job.status === 'cancelled') {
          void Promise.resolve().then(fn).then(() => { job.remoteCancelled = true; }, () => { /* best effort */ });
          return;
        }
        entry.cancelHooks.push(fn);
      },
    };

    entry.timer = setTimeout(() => {
      if (job.status !== 'running') return;
      abort.abort(new Error('time limit'));
      this.finish(job, 'failed', undefined, { message: `${tool} ran longer than ${Math.round(this.maxRunMs / 60000)} minutes and was stopped. Work already started in ServiceNow may still finish there.`, code: 'JOB_TIMEOUT' });
    }, this.maxRunMs);
    entry.timer.unref?.();

    entry.done = (async () => {
      try {
        const result = await run(ctx);
        this.finish(job, 'completed', result);
      } catch (err) {
        if (abort.signal.aborted && job.status !== 'running') return; // cancelled or timed out already
        const e = err as { message?: string; code?: string };
        this.finish(job, 'failed', undefined, { message: e?.message || String(err), code: e?.code });
      }
    })();
    return job;
  }

  /** The job if it exists, has not expired and belongs to `owner`. */
  get(id: string, owner: string): Job | undefined {
    this.sweep();
    const entry = this.entries.get(id);
    return entry && entry.job.owner === owner ? entry.job : undefined;
  }

  /** The owner's jobs, newest first. */
  list(owner: string, status?: JobStatus): Job[] {
    this.sweep();
    return [...this.entries.values()]
      .map((e) => e.job)
      .filter((j) => j.owner === owner && (!status || j.status === status))
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  /** Cancel a running job (best effort on the ServiceNow side). Finished jobs are returned unchanged. */
  async cancel(id: string, owner: string): Promise<Job | undefined> {
    const job = this.get(id, owner);
    if (!job) return undefined;
    if (job.status !== 'running') return job;
    const entry = this.entries.get(id)!;
    this.finish(job, 'cancelled', undefined, { message: 'Cancelled by request.', code: 'CANCELLED' });
    entry.abort.abort(new Error('cancelled'));
    let remote = false;
    for (const hook of entry.cancelHooks) {
      try {
        await hook();
        remote = true;
      } catch { /* best effort: the local job is cancelled either way */ }
    }
    job.remoteCancelled = remote;
    return job;
  }

  /** Wait up to `ms` for the job to finish. Resolves with the job (finished or not). */
  async wait(id: string, owner: string, ms: number): Promise<Job | undefined> {
    const job = this.get(id, owner);
    if (!job || job.status !== 'running' || ms <= 0) return job;
    const entry = this.entries.get(id)!;
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      entry.done,
      new Promise<void>((r) => { timer = setTimeout(r, ms); }),
      new Promise<void>((r) => entry.abort.signal.addEventListener('abort', () => r(), { once: true })),
    ]);
    if (timer) clearTimeout(timer);
    return job;
  }

  /** Called on every job change (status, progress). Returns an unsubscribe function. */
  onChange(listener: (job: Job) => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  /** Drop finished jobs whose TTL has passed. */
  sweep(): void {
    const t = this.now();
    for (const [id, e] of this.entries) {
      if (e.job.finishedAt !== undefined && t - e.job.finishedAt > e.job.ttlMs) this.entries.delete(id);
    }
  }

  get size(): number {
    return this.entries.size;
  }

  /** Test helper: forget everything. */
  clear(): void {
    for (const e of this.entries.values()) {
      if (e.timer) clearTimeout(e.timer);
      e.abort.abort(new Error('cleared'));
    }
    this.entries.clear();
  }

  private evictFinished(count: number): void {
    const finished = [...this.entries.values()]
      .filter((e) => e.job.status !== 'running')
      .sort((a, b) => (a.job.finishedAt ?? 0) - (b.job.finishedAt ?? 0));
    for (const e of finished.slice(0, count)) this.entries.delete(e.job.id);
  }

  private finish(job: Job, status: JobStatus, result?: unknown, error?: Job['error']): void {
    if (job.status !== 'running') return;
    const t = this.now();
    job.status = status;
    job.finishedAt = t;
    if (status === 'completed') {
      job.result = result;
      job.progress = { percent: 100, message: `${job.tool} finished` };
    } else {
      job.error = error;
      job.progress = { ...job.progress, message: error?.message ?? status };
    }
    const entry = this.entries.get(job.id);
    if (entry?.timer) clearTimeout(entry.timer);
    this.touch(job, t);
  }

  private touch(job: Job, t = this.now()): void {
    job.updatedAt = t;
    for (const l of this.listeners) {
      try { l(job); } catch { /* listeners never break a job */ }
    }
  }
}

/** The process-wide store, sized from the environment. */
export const jobStore = new JobStore({
  maxJobs: envInt('NOWAIKIT_JOBS_MAX', 200),
  maxRunningPerOwner: envInt('NOWAIKIT_JOBS_PER_USER', 20),
  ttlMs: envInt('NOWAIKIT_JOB_TTL_MS', 60 * 60 * 1000),
  maxRunMs: envInt('NOWAIKIT_JOB_MAX_RUN_MS', 2 * 60 * 60 * 1000),
  pollIntervalMs: envInt('NOWAIKIT_JOB_POLL_MS', 5000),
});

const short = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 32);

/**
 * The owner key for jobs started in the current request, always paired with the delegated instance.
 * Behind a gateway that proves itself with NOWAIKIT_DELEGATED_SECRET, the gateway's user id names the
 * owner (so a refreshed token still sees its jobs). Otherwise the delegated token is the identity
 * (hashed, never stored). Without delegation every caller runs as the server's own configured
 * credentials, so they share one scope, across all configured instances.
 */
export function jobOwner(): string {
  const d = getDelegatedAuth();
  const host = d?.instanceUrl ? safeHost(d.instanceUrl) : '';
  if (d?.user && process.env.NOWAIKIT_DELEGATED_SECRET && d.bearerToken) return `user:${short(d.user)}@${host}`;
  if (d?.bearerToken) return `token:${short(d.bearerToken)}@${host}`;
  return 'local';
}

function safeHost(url: string): string {
  try { return new URL(url).host.toLowerCase(); } catch { return ''; }
}

/** The client-facing view of a job (never includes the owner key). */
export function describeJob(job: Job, now = Date.now()): Record<string, unknown> {
  const end = job.finishedAt ?? now;
  const out: Record<string, unknown> = {
    job_id: job.id,
    tool: job.tool,
    status: job.status,
    progress: job.progress,
    elapsed_seconds: Math.round((end - job.createdAt) / 100) / 10,
    created_at: new Date(job.createdAt).toISOString(),
    updated_at: new Date(job.updatedAt).toISOString(),
  };
  if (job.finishedAt !== undefined) {
    out.finished_at = new Date(job.finishedAt).toISOString();
    out.expires_at = new Date(job.finishedAt + job.ttlMs).toISOString();
  }
  if (job.status === 'running') {
    out.poll_with = 'get_job';
    out.poll_after_seconds = Math.round(job.pollIntervalMs / 1000);
  }
  if (job.status === 'completed') out.result = job.result;
  if (job.error) out.error = job.error;
  if (job.remoteCancelled !== undefined) out.servicenow_cancelled = job.remoteCancelled;
  return out;
}

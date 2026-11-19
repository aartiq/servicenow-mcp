/**
 * Long-running operations: the job tools (get_job, list_jobs, cancel_job), the list of tools that may
 * run as jobs, and the watchers that follow ServiceNow's own status for work the instance runs in the
 * background (ATF suites, discovery, flows, scheduled and PA jobs).
 *
 * The same job store backs the portable `async: true` / auto-async pattern and the MCP tasks methods.
 */
import type { ServiceNowClient } from '../servicenow/client.js';
import { ServiceNowError } from '../utils/errors.js';
import { describeJob, jobOwner, jobStore, type Job, type JobContext, type JobOrigin, type JobStatus } from '../utils/jobs.js';
import { isScriptingEnabled } from '../utils/permissions.js';

/**
 * Tools that can take a while. They accept `async: true`, may switch to a job automatically after the
 * auto-async threshold, emit progress notifications when the client sends a progressToken, and can
 * run as MCP tasks.
 */
export const LONG_RUNNING_TOOLS: ReadonlySet<string> = new Set([
  // Testing
  'run_atf_suite', 'run_atf_test', 'test_flow', 'test_now_assist_skill', 'run_control_test',
  // ITOM / CMDB
  'run_discovery_scan', 'cmdb_reconcile', 'cmdb_impact_analysis', 'cmdb_health_dashboard',
  'cmdb_find_duplicates', 'cmdb_find_orphans', 'cmdb_find_stale', 'import_cmdb_data',
  // Data movement
  'bulk_create_records', 'run_transform_map', 'batch_request', 'export_report_data',
  // Jobs, flows, scripts
  'trigger_scheduled_job', 'trigger_flow', 'run_fix_script', 'execute_playbook', 'run_security_playbook',
  'scan_vulnerabilities',
  // Instance-wide analysis
  'compare_instances', 'export_update_set', 'preview_update_set', 'check_table_completeness',
  'analyze_data_quality', 'get_instance_scan_findings',
  // Predictive Intelligence
  'ml_train_incident_classifier', 'ml_train_change_risk', 'ml_train_anomaly_detector', 'ml_forecast_incidents',
  // ServiceNow SDK (spawns now-sdk; installs, builds and CI/CD runs take minutes)
  'fluent_build', 'fluent_install', 'fluent_download', 'fluent_transform', 'fluent_dependencies',
  'fluent_pack', 'fluent_exec', 'fluent_cicd',
]);

export function isLongRunningTool(name: string): boolean {
  return LONG_RUNNING_TOOLS.has(name);
}

/** Schema property added to every long-running tool. */
export const ASYNC_ARG_SCHEMA = {
  type: 'boolean',
  description: 'Run as a background job and return a job_id at once. Poll it with get_job. Calls that take longer than about 20 seconds switch to a job on their own.',
};

/** Milliseconds a long-running call may block before it returns a job instead (0 turns this off). */
export function autoAsyncAfterMs(): number {
  const raw = process.env.NOWAIKIT_AUTO_ASYNC_MS;
  if (raw === undefined || raw === '') return 20_000;
  const v = Number(raw);
  return Number.isFinite(v) && v >= 0 ? v : 20_000;
}

// ─── Tool definitions ─────────────────────────────────────────────────────────

export function getJobToolDefinitions() {
  return [
    {
      name: 'get_job',
      description: 'Check a background job started by a long-running tool (async: true, or a call that ran past about 20 seconds). Returns status (running, completed, failed, cancelled), progress, elapsed time and, once finished, the tool result. Pass wait_seconds to wait for it to finish.',
      inputSchema: {
        type: 'object',
        properties: {
          job_id: { type: 'string', description: 'The job_id a long-running tool returned' },
          wait_seconds: { type: 'number', description: 'Wait up to this many seconds (max 25) for the job to finish before answering. Default 0.' },
        },
        required: ['job_id'],
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    {
      name: 'list_jobs',
      description: 'List your background jobs (newest first) with their status and progress. Finished jobs are kept for an hour.',
      inputSchema: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['running', 'completed', 'failed', 'cancelled'], description: 'Only jobs with this status' },
          limit: { type: 'number', description: 'Max jobs to return (default 20)' },
        },
        required: [],
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    {
      name: 'cancel_job',
      description: 'Cancel a running background job. NowAIKit stops waiting at once and, where ServiceNow has a cancel API (ATF suite runs through CI/CD, flows), asks the instance to stop too. Work ServiceNow has already done is not rolled back.',
      inputSchema: {
        type: 'object',
        properties: {
          job_id: { type: 'string', description: 'The job_id to cancel' },
        },
        required: ['job_id'],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
  ];
}

export const JOB_TOOL_NAMES: ReadonlySet<string> = new Set(['get_job', 'list_jobs', 'cancel_job']);

export async function executeJobToolCall(_client: ServiceNowClient, name: string, args: Record<string, any>): Promise<any> {
  if (!JOB_TOOL_NAMES.has(name)) return null;
  const owner = jobOwner();
  switch (name) {
    case 'get_job': {
      const id = String(args.job_id || '').trim();
      if (!id) throw new ServiceNowError('job_id is required', 'INVALID_REQUEST');
      const wait = Math.min(Math.max(Number(args.wait_seconds) || 0, 0), 25);
      const job = await jobStore.wait(id, owner, wait * 1000);
      if (!job) throw new ServiceNowError(`Job not found: ${id}. Jobs are kept for an hour after they finish, and are lost if the server restarts.`, 'NOT_FOUND');
      return describeJob(job);
    }
    case 'list_jobs': {
      const status = typeof args.status === 'string' ? args.status as JobStatus : undefined;
      const limit = Math.min(Math.max(Number(args.limit) || 20, 1), 100);
      const jobs = jobStore.list(owner, status);
      return {
        count: jobs.length,
        jobs: jobs.slice(0, limit).map((j) => {
          const view = describeJob(j);
          delete view.result; // keep the list small; get_job returns the result
          return view;
        }),
      };
    }
    case 'cancel_job': {
      const id = String(args.job_id || '').trim();
      if (!id) throw new ServiceNowError('job_id is required', 'INVALID_REQUEST');
      const before = jobStore.get(id, owner)?.status;
      const job = await jobStore.cancel(id, owner);
      if (!job) throw new ServiceNowError(`Job not found: ${id}`, 'NOT_FOUND');
      const out = describeJob(job);
      out.summary = before !== 'running'
        ? `Job ${id} had already ${job.status}. Nothing to cancel.`
        : job.remoteCancelled
          ? `Cancelled ${job.tool}. ServiceNow was asked to stop the run too.`
          : `Stopped waiting for ${job.tool}. ServiceNow has no cancel API for this work, so anything already running on the instance may still finish.`;
      return out;
    }
  }
  return null;
}

// ─── Running a tool as a job ──────────────────────────────────────────────────

export type ToolExecutor = (client: ServiceNowClient, name: string, args: Record<string, any>) => Promise<unknown>;

const sleep = (ms: number, signal: AbortSignal) => new Promise<void>((resolve, reject) => {
  if (signal.aborted) { reject(signal.reason); return; }
  const t = setTimeout(resolve, ms);
  signal.addEventListener('abort', () => { clearTimeout(t); reject(signal.reason); }, { once: true });
});

const unwrap = (body: any) => (body && typeof body === 'object' && 'result' in body ? body.result : body);

interface WatchOptions { pollMs: number }

/**
 * Follow work ServiceNow runs in the background, from the tool's start result to the final outcome.
 * Returns the value to merge into the job result as `outcome`, or undefined when there is nothing to
 * follow (the start result is already final).
 */
type Watcher = (client: ServiceNowClient, start: any, ctx: JobContext, opts: WatchOptions) => Promise<Record<string, unknown> | undefined>;

const CICD_STATUS: Record<string, string> = { '0': 'pending', '1': 'running', '2': 'successful', '3': 'failed', '4': 'canceled' };

const WATCHERS: Record<string, Watcher> = {
  /** CI/CD API: poll /api/sn_cicd/progress/{id}, then read the suite result summary. */
  async run_atf_suite(client, start, ctx, { pollMs }) {
    // run_atf_suite returns { action, sys_id, result: <CI/CD body> }.
    const progressId = (start?.result ?? start)?.links?.progress?.id;
    if (!progressId) return undefined;
    ctx.onCancel(() => client.apiRequest('POST', `/api/sn_cicd/progress/${encodeURIComponent(progressId)}/cancel`, {}));
    if (ctx.signal.aborted) return undefined;
    for (;;) {
      const p = unwrap(await client.apiRequest('GET', `/api/sn_cicd/progress/${encodeURIComponent(progressId)}`));
      const status = CICD_STATUS[String(p?.status)] ?? String(p?.status_label || p?.status || 'unknown').toLowerCase();
      ctx.progress({ percent: Number(p?.percent_complete) || undefined, message: `ATF suite ${status}${p?.status_message ? `: ${p.status_message}` : ''}` });
      if (['successful', 'failed', 'canceled'].includes(status)) {
        const resultId = p?.links?.results?.id;
        let summary: any;
        if (resultId) {
          try { summary = unwrap(await client.apiRequest('GET', `/api/sn_cicd/testsuite/results/${encodeURIComponent(resultId)}`)); } catch { /* summary is optional */ }
        }
        return {
          status,
          status_message: p?.status_message || undefined,
          error: p?.error || undefined,
          suite_result_sys_id: summary?.links?.results?.id || resultId,
          test_suite_status: summary?.test_suite_status,
          test_suite_duration: summary?.test_suite_duration,
          passed: summary?.rolledup_test_success_count,
          failed: summary?.rolledup_test_failure_count,
          errors: summary?.rolledup_test_error_count,
          skipped: summary?.rolledup_test_skip_count,
          details: 'Use list_atf_test_results with suite_result_sys_id for each test.',
        };
      }
      await sleep(pollMs, ctx.signal);
    }
  },

  /** discovery_status.state goes Starting, Active, then Completed or Cancelled. */
  async run_discovery_scan(client, start, ctx, { pollMs }) {
    const id = start?.sys_id;
    if (!id) return undefined;
    for (;;) {
      const rec: any = await client.getRecord('discovery_status', id, 'sys_id,state,started,completed,description');
      const state = String(rec?.state || '');
      ctx.progress({ message: `Discovery ${state || 'pending'}${rec?.started ? ` (started ${rec.started}, completed probes ${rec.completed || 0})` : ''}` });
      if (/^(completed|cancel)/i.test(state)) return { status: state, started: rec.started, completed: rec.completed };
      await sleep(pollMs, ctx.signal);
    }
  },

  /** sys_flow_context.state: QUEUED, IN_PROGRESS, WAITING, then COMPLETE, CANCELLED or ERROR. */
  async trigger_flow(client, start, ctx, { pollMs }) {
    const id = start?.context_id;
    if (!id || !/^[0-9a-f]{32}$/i.test(String(id))) return undefined;
    if (isScriptingEnabled()) {
      ctx.onCancel(() => client.executeScript(`sn_fd.FlowAPI.cancel('${id}', 'Cancelled from NowAIKit');\nreturn { cancelled: true };`));
    }
    if (ctx.signal.aborted) return undefined;
    for (;;) {
      const rec: any = await client.getRecord('sys_flow_context', id, 'sys_id,state,status,name,error_message,run_time');
      const state = String(rec?.state || rec?.status || '').toUpperCase();
      ctx.progress({ message: `Flow ${state.toLowerCase() || 'queued'}` });
      if (['COMPLETE', 'CANCELLED', 'ERROR'].includes(state)) {
        return { status: state.toLowerCase(), error_message: rec.error_message || undefined, run_time: rec.run_time || undefined };
      }
      if (state === 'WAITING') return { status: 'waiting', note: 'The flow is waiting (for an approval, a timer or an event). It will continue in ServiceNow; check it later with get_flow_execution.' };
      await sleep(pollMs, ctx.signal);
    }
  },

  /** gs.executeNow() returns a run-once sys_trigger that the scheduler deletes when the job has run. */
  async trigger_scheduled_job(client, start, ctx, { pollMs }) {
    const id = start?.trigger_sys_id;
    if (!id || !/^[0-9a-f]{32}$/i.test(String(id))) return undefined;
    for (;;) {
      try {
        const rec: any = await client.getRecord('sys_trigger', id, 'sys_id,state,next_action');
        const state = String(rec?.state ?? '');
        ctx.progress({ message: state === '1' ? 'Scheduled job running' : 'Scheduled job queued' });
      } catch (e) {
        if (e instanceof ServiceNowError && e.code === 'NOT_FOUND') {
          return { status: 'finished', note: 'The scheduler ran the job and removed its run-once trigger. Use list_job_run_history for timings.' };
        }
        throw e;
      }
      await sleep(pollMs, ctx.signal);
    }
  },
};

/** A watcher exists for this tool, so a job follows ServiceNow's status, not just the start call. */
export function hasWatcher(name: string): boolean {
  return name in WATCHERS;
}

export interface ToolJobOptions {
  origin: JobOrigin;
  ttlMs?: number;
  /** An in-flight tool call to adopt instead of starting one (auto-async hands over a slow call). */
  running?: Promise<unknown>;
}

/**
 * Start a job for one tool call. The job runs the tool and, for tools ServiceNow runs asynchronously,
 * keeps polling ServiceNow until the work is done. The job result is the tool's own result, with the
 * final ServiceNow status under `outcome` when there was something to follow.
 */
export function startToolJob(client: ServiceNowClient, name: string, args: Record<string, any>, execute: ToolExecutor, opts: ToolJobOptions): Job {
  const owner = jobOwner();
  const pollMs = jobStore.pollIntervalMs;
  return jobStore.start(owner, name, async (ctx) => {
    ctx.progress({ percent: 0, message: `Starting ${name}` });
    const started = await (opts.running ?? execute(client, name, args));
    const watcher = WATCHERS[name];
    if (!watcher) return started;
    ctx.progress({ message: `${name} started in ServiceNow, waiting for it to finish` });
    const outcome = await watcher(client, started, ctx, { pollMs });
    if (!outcome) return started;
    return started && typeof started === 'object' && !Array.isArray(started)
      ? { ...(started as Record<string, unknown>), outcome }
      : { started, outcome };
  }, { origin: opts.origin, ttlMs: opts.ttlMs });
}

/** The tool result a client sees when a call becomes a job. */
export function jobStartedResult(job: Job, reason: 'async' | 'auto'): Record<string, unknown> {
  return {
    job_id: job.id,
    status: job.status,
    tool: job.tool,
    poll_with: 'get_job',
    poll_after_seconds: Math.round(job.pollIntervalMs / 1000),
    summary: reason === 'auto'
      ? `${job.tool} is still running, so it continues as background job ${job.id}. Call get_job with this job_id (wait_seconds up to 25) to follow it, or cancel_job to stop it.`
      : `${job.tool} started as background job ${job.id}. Call get_job with this job_id (wait_seconds up to 25) to follow it, or cancel_job to stop it.`,
  };
}

/**
 * Run a long-running tool for a normal (non-task) call.
 * - `async: true`: start a job and return its id at once.
 * - Otherwise run inline. If it is still running after the auto-async threshold, hand the in-flight
 *   call to a job and return the job id instead of blocking (or timing out in the client).
 * Calls that finish under the threshold return exactly what they always returned.
 */
export async function runLongRunningTool(client: ServiceNowClient, name: string, args: Record<string, any>, execute: ToolExecutor, wantsAsync: boolean): Promise<unknown> {
  if (wantsAsync) return jobStartedResult(startToolJob(client, name, args, execute, { origin: 'async' }), 'async');
  const threshold = autoAsyncAfterMs();
  if (threshold <= 0) return execute(client, name, args);
  const running = execute(client, name, args);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = Symbol('timeout');
  const first = await Promise.race([running, new Promise<typeof timedOut>((r) => { timer = setTimeout(() => r(timedOut), threshold); })])
    .finally(() => { if (timer) clearTimeout(timer); });
  if (first !== timedOut) return first;
  // Hand the in-flight call to a job. If the store is full, keep waiting inline as before.
  let job: Job;
  try {
    job = startToolJob(client, name, args, execute, { origin: 'auto', running });
  } catch {
    return running;
  }
  return jobStartedResult(job, 'auto');
}

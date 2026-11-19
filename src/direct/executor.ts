/**
 * NowAIKit — Direct Execution Engine
 *
 * Executes capabilities without MCP by using the ServiceNow client directly.
 * Gathers data from ServiceNow, builds context, sends to LLM.
 *
 * Token savings: ~83% reduction vs MCP mode (no tool schemas sent).
 */
import { ServiceNowClient } from '../servicenow/client.js';
import { loadConfig } from '../cli/config-store.js';
import type { LlmConfig, LlmMessage, LlmResponse } from './llm-client.js';
import { callLlm } from './llm-client.js';
import { resolvePromptAsync, getCapabilities } from '../prompts/index.js';
import type { CapabilityDefinition } from '../prompts/types.js';
import { getInstanceScanSummary, isScanCategory, parseScanSpec, startInstanceScan, waitForInstanceScan } from '../servicenow/instance-scan.js';
import { executeTool, getCatalogTool } from '../tools/index.js';
import { DATA_PLANS, gatherPlan, type CoverageEntry } from './data-plans.js';

const SYS_ID_RE = /^[0-9a-f]{32}$/i;

/** Add record_url to each record that has a sys_id, so reports can link to the real record. */
function withUrls<T extends { records?: any[] }>(client: ServiceNowClient, table: string, resp: T): T {
  if (!resp || !Array.isArray(resp.records)) return resp;
  for (const r of resp.records) {
    const id = r && typeof r.sys_id === 'object' ? r.sys_id?.value : r?.sys_id;
    if (id && SYS_ID_RE.test(String(id)) && !r.record_url && typeof (client as any).recordUrl === 'function') r.record_url = client.recordUrl(r.sys_class_name && typeof r.sys_class_name === 'string' && /^[a-z0-9_]+$/.test(r.sys_class_name) ? r.sys_class_name : table, String(id));
  }
  return resp;
}

/** A clickable list view for a table and encoded query. */
function listLink(client: ServiceNowClient, table: string, query: string): string {
  return `${String((client as any).instanceUrl ?? '').replace(/\/$/, '')}/${table}_list.do?sysparm_query=${encodeURIComponent(query)}`;
}

/** A record link, or undefined when the client cannot build one. */
function recLink(client: ServiceNowClient, table: string, id: string): string | undefined {
  return typeof (client as any).recordUrl === 'function' ? client.recordUrl(table, id) : undefined;
}


export interface DirectExecutionOptions {
  capability: string;
  args?: Record<string, string>;
  instance?: string;
  llmConfig: LlmConfig;
  output?: string;
  /** Progress messages for long steps (for example a fresh Instance Scan). */
  onProgress?: (message: string) => void;
}

export interface DirectExecutionResult {
  content: string;
  model: string;
  usage?: { input_tokens: number; output_tokens: number };
  dataGathered: number;
}

/**
 * Map of tool names to SDK methods and their parameters.
 * Covers the most commonly used tools in capabilities.
 */
/**
 * Instance Scan data, split into small sections so each one fits the per-section size limit.
 * `compact` keeps it to the overview and findings (for capabilities where scan data is one input of many).
 */
export async function gatherInstanceScanData(
  client: ServiceNowClient,
  args: Record<string, string>,
  categories: string[] | undefined,
  compact: boolean,
): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  const s = await getInstanceScanSummary(client, {
    categories,
    result: args.result || undefined,
    compact,
    topChecks: compact ? 15 : 25,
    maxResults: compact ? 4 : 6,
  });
  out['instance_scan_runs'] = { scope: s.scope, runs: s.runs.slice(0, compact ? 8 : 15) };
  const latest = s.analysed_results[0]?.result_sys_id as string | undefined;
  out['instance_scan_analysed_results'] = s.analysed_results.map((r) => ({
    ...r,
    record_url: r.result_sys_id ? recLink(client, 'scan_result', String(r.result_sys_id)) : undefined,
    findings_list_url: r.result_sys_id ? listLink(client, 'scan_finding', `result=${r.result_sys_id}^muted=false`) : undefined,
  }));
  s.top_checks = s.top_checks.map((c) => ({
    ...c,
    check_url: c.check_sys_id ? recLink(client, 'scan_check', String(c.check_sys_id)) : undefined,
    findings_list_url: c.check_sys_id ? listLink(client, 'scan_finding', `check=${c.check_sys_id}${latest ? `^result=${latest}` : ''}^muted=false`) : undefined,
  }));
  if (s.sample_findings) {
    s.sample_findings = s.sample_findings.map((f) => ({
      ...f,
      record_url: typeof f.table === 'string' && /^[a-z0-9_]+$/.test(f.table) && typeof f.record === 'string' && SYS_ID_RE.test(f.record) ? recLink(client, f.table, f.record) : undefined,
    }));
  }
  out['instance_scan_findings_by_category_and_priority'] = { by_category: s.by_category, by_priority: s.by_priority, notes: s.notes };
  if (compact) {
    out['instance_scan_top_checks'] = s.top_checks.map(({ check_sys_id: _id, documentation_url: _u, description: _d, ...rest }) => rest);
  } else {
    // Small chunks so the remediation text is not cut off.
    for (let i = 0; i < s.top_checks.length; i += 8) out[`instance_scan_top_checks_${i / 8 + 1}`] = s.top_checks.slice(i, i + 8);
  }
  out['instance_scan_trend_resolved_checks'] = s.resolved_checks;
  out['instance_scan_by_table_and_app'] = { by_table: s.by_table, by_app: s.by_app };
  if (s.inventory) out['instance_scan_inventory'] = s.inventory;
  if (s.ai_coverage) out['instance_scan_ai_agent_coverage'] = s.ai_coverage;
  if (s.sample_findings) out['instance_scan_sample_findings'] = s.sample_findings;
  return out;
}

/** Instance Scan sections (sent as compact JSON) may run longer than other data before they are cut. */
function sectionLimit(key: string, planLimits: Record<string, number> = {}): number {
  if (key.startsWith('instance_scan')) return 9000;
  if (key === 'data_coverage') return 6000;
  return planLimits[key] ?? 5000;
}

/** True when a catalog tool only reads (its MCP annotation says so). */
export function isReadOnlyTool(name: string): boolean {
  const t = getCatalogTool(name) as { annotations?: { readOnlyHint?: boolean } } | undefined;
  return !!t?.annotations?.readOnlyHint;
}

/** Tools the hand-written gatherer above still serves (Instance Scan, with its fresh-run option). */
const SCAN_TOOLS = new Set(['run_instance_scan', 'get_instance_scan_summary', 'get_instance_scan_findings']);

/**
 * Gather everything a capability needs: its data plan (read-only tool calls, queries and counts),
 * plus Instance Scan data when it uses scan findings. Capabilities without a plan fall back to the
 * older gatherer. The result starts with a data_coverage section listing what could not be gathered.
 */
export async function gatherCapabilityData(
  client: ServiceNowClient,
  capability: string,
  recommendedTools: string[],
  args: Record<string, string>,
  cap?: CapabilityDefinition,
  onProgress?: (message: string) => void,
  runTool: (name: string, a: Record<string, unknown>) => Promise<unknown> = (name, a) => executeTool(client, name, a as Record<string, any>),
): Promise<{ data: Record<string, unknown>; limits: Record<string, number> }> {
  const plan = DATA_PLANS[capability];
  if (!plan) return { data: await gatherData(client, recommendedTools, args, cap, onProgress), limits: {} };
  const scopeIsTable = !!args.scope && args.scope !== 'instance' && !isScanCategory(args.scope) && /^[a-z0-9_]+$/i.test(args.scope);
  const table = args.table || (scopeIsTable ? args.scope! : '');
  onProgress?.(`Gathering ${plan.length} data sections`);
  const scanData = await gatherData(client, recommendedTools.filter((t) => SCAN_TOOLS.has(t)), args, cap, onProgress);
  const { results, coverage, limits } = await gatherPlan(client, capability, { args, table }, { runTool, isReadOnlyTool });
  for (const k of Object.keys(scanData)) {
    coverage.push({ key: k, status: k.endsWith('_error') ? 'failed' : 'gathered', detail: k.endsWith('_error') ? String(scanData[k]) : 'Instance Scan' });
  }
  const missing = coverage.filter((c) => c.status !== 'gathered');
  const data: Record<string, unknown> = {
    data_coverage: {
      gathered: coverage.filter((c) => c.status === 'gathered').map((c) => c.key),
      not_gathered: missing.map((c: CoverageEntry) => ({ section: c.key, status: c.status, reason: c.detail })),
      rule: 'Report every section listed in not_gathered as "not available" (with the reason) in a short "Data coverage" note. Never fill a missing section with assumptions.',
    },
    ...scanData,
    ...results,
  };
  return { data, limits };
}

async function gatherData(
  client: ServiceNowClient,
  recommendedTools: string[],
  args: Record<string, string>,
  cap?: CapabilityDefinition,
  onProgress?: (message: string) => void,
): Promise<Record<string, unknown>> {
  const results: Record<string, unknown> = {};
  // -s is a table for some skills, but "instance" (whole instance) and scan categories are not tables.
  const scopeIsTable = !!args.scope && args.scope !== 'instance' && !isScanCategory(args.scope);
  const table = args.table || (scopeIsTable ? args.scope! : '');

  // A fresh Instance Scan, only when asked for (--run-scan). The summary then focuses on its result.
  if (args.run_scan && recommendedTools.includes('run_instance_scan')) {
    try {
      const spec = parseScanSpec(args.run_scan);
      onProgress?.(`Starting ${spec.scan_type} scan`);
      const started = await startInstanceScan(client, spec);
      if (!started.progress_id) throw new Error(`The CI/CD API did not return a progress id (status ${started.status}${started.status_message ? `: ${started.status_message}` : ''})`);
      const outcome = await waitForInstanceScan(client, started.progress_id, {
        timeoutMs: Number(process.env.NOWAIKIT_SCAN_TIMEOUT_MS) || 15 * 60_000,
        onProgress: (p) => onProgress?.(`Instance scan ${p.status}${p.percent !== undefined ? ` ${p.percent}%` : ''}${p.message ? `: ${p.message}` : ''}`),
      });
      results['instance_scan_fresh_run'] = { scan_type: spec.scan_type, suite: started.suite, progress_id: started.progress_id, ...outcome };
      if (typeof outcome.scan_result_sys_id === 'string') args = { ...args, result: outcome.scan_result_sys_id };
    } catch (error) {
      results['instance_scan_fresh_run_error'] = error instanceof Error ? error.message : 'Failed';
    }
  }

  for (const tool of recommendedTools) {
    try {
      switch (tool) {
        case 'query_records': {
          if (table) {
            const data = withUrls(client, table, await client.queryRecords({ table, limit: 50 }));
            results[`${table}_records`] = { count: data.count, sample: data.records.slice(0, 10) };
          }
          break;
        }
        case 'get_table_schema': {
          if (table) {
            results[`${table}_schema`] = await client.getTableSchema(table);
          }
          break;
        }
        case 'list_business_rules': {
          const brs = await client.queryRecords({
            table: 'sys_script',
            query: table ? `collection=${table}^active=true` : 'active=true',
            fields: 'sys_id,name,collection,when,order,active',
            limit: 50,
          });
          results['business_rules'] = withUrls(client, 'sys_script', brs);
          break;
        }
        case 'list_flows': {
          const flows = await client.queryRecords({
            table: 'sys_hub_flow',
            query: 'active=true',
            fields: 'sys_id,name,trigger_type,active,description',
            limit: 50,
          });
          results['flows'] = withUrls(client, 'sys_hub_flow', flows);
          break;
        }
        case 'list_client_scripts': {
          const cs = await client.queryRecords({
            table: 'sys_script_client',
            query: table ? `table=${table}^active=true` : 'active=true',
            fields: 'sys_id,name,table,type,active',
            limit: 50,
          });
          results['client_scripts'] = withUrls(client, 'sys_script_client', cs);
          break;
        }
        case 'list_scheduled_jobs': {
          const jobs = await client.queryRecords({
            table: 'sysauto_script',
            fields: 'sys_id,name,active,run_as,next_action',
            limit: 50,
          });
          results['scheduled_jobs'] = withUrls(client, 'sysauto_script', jobs);
          break;
        }
        case 'get_sys_log': {
          const logs = await client.queryRecords({
            table: 'syslog',
            query: 'level=2^ORlevel=3',
            fields: 'sys_id,level,message,source',
            limit: 20,
          });
          results['sys_logs'] = withUrls(client, 'syslog', logs);
          break;
        }
        case 'list_system_properties': {
          const props = await client.queryRecords({
            table: 'sys_properties',
            query: 'nameLIKEglide.buildtag^ORnameLIKEglide.war^ORnameLIKEglide.product',
            fields: 'sys_id,name,value',
            limit: 20,
          });
          results['system_properties'] = props;
          break;
        }
        case 'search_cmdb_ci': {
          const cis = await client.searchCmdbCi(undefined, 20);
          results['cmdb_cis'] = withUrls(client, 'cmdb_ci', cis);
          break;
        }
        case 'cmdb_health_dashboard': {
          results['cmdb_health'] = await client.cmdbHealthDashboard();
          break;
        }
        case 'run_aggregate_query': {
          if (table) {
            const stats = await client.runAggregateQuery(table, 'state');
            results[`${table}_stats`] = stats;
          }
          break;
        }
        case 'list_portal_widgets': {
          const widgets = await client.queryRecords({
            table: 'sp_widget',
            query: 'active=true',
            fields: 'sys_id,name,id,template',
            limit: 30,
          });
          results['portal_widgets'] = withUrls(client, 'sp_widget', widgets);
          break;
        }
        case 'list_catalog_items': {
          const items = await client.queryRecords({
            table: 'sc_cat_item',
            query: 'active=true',
            fields: 'sys_id,name,category,short_description,active',
            limit: 30,
          });
          results['catalog_items'] = withUrls(client, 'sc_cat_item', items);
          break;
        }
        case 'get_instance_scan_summary': {
          // Full Instance Scan view (scan-instance). -s <category> narrows it to one or more categories.
          const categories = args.categories
            ? args.categories.split(',')
            : (isScanCategory(args.scope) ? args.scope!.split(',') : cap?.instanceScanCategories);
          Object.assign(results, await gatherInstanceScanData(client, args, categories, false));
          break;
        }
        case 'get_instance_scan_findings': {
          // Instance Scan findings as one input among others (scan-health, scan-security, scan-debt, scan-upgrade).
          if (recommendedTools.includes('get_instance_scan_summary')) break;
          Object.assign(results, await gatherInstanceScanData(client, args, cap?.instanceScanCategories, true));
          break;
        }
        default:
          break;
      }
    } catch (error) {
      results[`${tool}_error`] = error instanceof Error ? error.message : 'Failed';
    }
  }

  return results;
}

/**
 * Create a ServiceNowClient from the config store for a named instance.
 */
function createClientFromConfig(instanceName?: string): { client: ServiceNowClient; name: string } {
  const config = loadConfig();

  const name = instanceName || config.defaultInstance;
  if (!name) {
    throw new Error('No instance specified and no default instance configured. Run `nowaikit setup` first.');
  }

  const inst = config.instances[name];
  if (!inst) {
    const available = Object.keys(config.instances).join(', ');
    throw new Error(`Instance "${name}" not found. Available: ${available || 'none — run nowaikit setup'}`);
  }

  const client = new ServiceNowClient({
    instanceUrl: inst.instanceUrl,
    authMethod: inst.authMethod,
    ...(inst.authMethod === 'oauth'
      ? { oauth: { clientId: inst.clientId, clientSecret: inst.clientSecret, username: inst.username, password: inst.password } }
      : { basic: { username: inst.username, password: inst.password } }
    ),
  });

  return { client, name };
}

/**
 * Execute a capability in direct mode (no MCP).
 *
 * Flow:
 * 1. Load capability prompt
 * 2. Gather data from ServiceNow via client
 * 3. Build LLM messages: capability prompt + gathered data
 * 4. Send to LLM and return response
 */
export async function executeDirectly(options: DirectExecutionOptions): Promise<DirectExecutionResult> {
  // 1. Resolve capability
  const prompt = await resolvePromptAsync(options.capability, options.args);
  if (!prompt) {
    const caps = await getCapabilities();
    const available = caps.map(c => c.name).join(', ');
    throw new Error(`Unknown capability: "${options.capability}". Available: ${available}`);
  }

  // Get recommended tools for data gathering
  const caps = await getCapabilities();
  const cap = caps.find(c => c.name === options.capability);
  const recommendedTools = cap?.recommendedTools || [];

  // 2. Connect to ServiceNow
  const { client, name: instanceName } = createClientFromConfig(options.instance);

  // 3. Gather data from ServiceNow
  const { data, limits } = await gatherCapabilityData(client, options.capability, recommendedTools, options.args || {}, cap, options.onProgress);
  const dataCount = Object.keys(data).length;

  // 4. Build LLM messages
  const messages: LlmMessage[] = [];

  // System message with capability context
  const capabilityPrompt = prompt.messages.map(m => m.content.text).join('\n\n');
  messages.push({
    role: 'system',
    content: [
      `You are NowAIKit, an expert ServiceNow platform consultant.`,
      `You are analyzing the "${instanceName}" instance (${client.instanceUrl}).`,
      ``,
      `CAPABILITY: ${prompt.description}`,
      ``,
      capabilityPrompt,
    ].join('\n'),
  });

  // User message with gathered data
  const dataContext = Object.entries(data)
    .map(([key, value]) => `### ${key}\n\`\`\`json\n${JSON.stringify(value).substring(0, sectionLimit(key, limits))}\n\`\`\``)
    .join('\n\n');

  messages.push({
    role: 'user',
    content: [
      `Here is the data gathered from the ServiceNow instance:`,
      ``,
      dataContext,
      ``,
      `Based on this data, execute the capability and provide the full report/output as instructed.`,
    ].join('\n'),
  });

  // 5. Call LLM
  const response: LlmResponse = await callLlm(options.llmConfig, messages);

  return {
    content: response.content,
    model: response.model,
    usage: response.usage,
    dataGathered: dataCount,
  };
}

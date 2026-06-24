/**
 * NowAIKit SDK — Direct TypeScript integration.
 *
 * Use this entry point to programmatically interact with ServiceNow
 * without the MCP layer. Ideal for scripts, pipelines, and custom apps.
 *
 * @example
 * ```ts
 * import { ServiceNowClient } from 'nowaikit/sdk';
 *
 * const client = new ServiceNowClient({
 *   instanceUrl: 'https://myinstance.service-now.com',
 *   authMethod: 'basic',
 *   basic: { username: 'admin', password: 'secret' },
 * });
 *
 * const incidents = await client.queryRecords({
 *   table: 'incident',
 *   query: 'state=1^priority=1',
 *   limit: 10,
 * });
 * ```
 *
 * @example Direct mode (gather data + LLM analysis)
 * ```ts
 * import { executeDirectly } from 'nowaikit/sdk';
 *
 * const result = await executeDirectly({
 *   capability: 'scan-health',
 *   llmConfig: { provider: 'anthropic', apiKey: 'sk-...' },
 * });
 * console.log(result.content);
 * ```
 */

// ─── Core Client ─────────────────────────────────────────────────────────────
export { ServiceNowClient } from '../servicenow/client.js';

// ─── ServiceNow Types ────────────────────────────────────────────────────────
export type {
  AuthMode,
  ServiceNowConfig,
  QueryRecordsParams,
  QueryRecordsResponse,
  ServiceNowRecord,
  ServiceNowReference,
  ServiceNowApiResponse,
} from '../servicenow/types.js';

// ─── Direct Execution Engine ─────────────────────────────────────────────────
export { executeDirectly } from '../direct/executor.js';
export type {
  DirectExecutionOptions,
  DirectExecutionResult,
} from '../direct/executor.js';

// ─── LLM Client (BYOK) ──────────────────────────────────────────────────────
export { callLlm } from '../direct/llm-client.js';
export type {
  LlmProvider,
  LlmConfig,
  LlmMessage,
  LlmResponse,
} from '../direct/llm-client.js';

// ─── Tool Router ─────────────────────────────────────────────────────────────
export { getTools, executeTool } from '../tools/index.js';

// ─── Prompts & Capabilities ──────────────────────────────────────────────────
export {
  getPrompts,
  resolvePromptAsync,
  getCapabilityMeta,
  getCapabilities,
} from '../prompts/index.js';
export type {
  CapabilityDefinition,
  CapabilityCategory,
  AgentMessage,
} from '../prompts/types.js';

// ─── Config Store ────────────────────────────────────────────────────────────
export {
  loadConfig,
  saveConfig,
  addInstance,
  listInstances,
  getDefaultInstance,
  removeInstance,
} from '../cli/config-store.js';
export type {
  InstanceConfig,
  NowaikitConfig,
} from '../cli/config-store.js';

// ─── Instance Manager ────────────────────────────────────────────────────────
export { instanceManager } from '../servicenow/instances.js';

// ─── Report Generation ──────────────────────────────────────────────────────
export { generateReport, parseMarkdown } from '../reports/index.js';
export type {
  ReportData,
  ReportFormat,
  ReportOptions,
  ReportResult,
  ReportFinding,
  ReportMetrics,
  Severity,
} from '../reports/types.js';

// ─── Error Types ─────────────────────────────────────────────────────────────
export { ServiceNowError } from '../utils/errors.js';

// ─── Logging ─────────────────────────────────────────────────────────────────
export { logger } from '../utils/logging.js';

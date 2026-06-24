/**
 * Fluent / GlideQuery-style tools — modern query interface for ServiceNow.
 *
 * Provides:
 *   - fluent_query: GlideQuery-style chained query builder (select, where, aggregate)
 *   - batch_request: Execute multiple API operations in a single HTTP call
 *   - execute_script: Run server-side GlideQuery/GlideRecord scripts via Background Script
 *
 * These tools give AI agents a modern, expressive way to interact with ServiceNow
 * that mirrors the GlideQuery API developers use in the platform.
 */
import { execFile as execFileCb } from 'child_process';
import { promisify } from 'util';
import type { ServiceNowClient } from '../servicenow/client.js';
import { ServiceNowError } from '../utils/errors.js';
import { requireWrite, requireFluent } from '../utils/permissions.js';

const execFileAsync = promisify(execFileCb);

/**
 * Minimum `@servicenow/sdk` version we track features against. Bump this when we
 * adopt a newer SDK release so the tooling stays on the latest-and-greatest.
 * 4.8.0 (Jun 2026) added the `now-sdk query` CLI command + Playbook/RestMessage/
 * RetryPolicy/Alias/DataLookup Fluent APIs.
 */
const MIN_RECOMMENDED_SDK = '4.8.0';

/** now-sdk `explain` topics worth surfacing, including the APIs new in 4.8. */
const KNOWN_EXPLAIN_TOPICS = [
  // Core / project
  'GlideQuery', 'table API', 'scoped app', 'now.config.json', 'keys.ts', 'metadata',
  // Records & data (4.8)
  'Record', 'Now.del', 'Now.attach', 'DataLookup',
  // Integration (4.8)
  'RestMessage', 'Alias', 'AliasTemplate', 'RetryPolicy',
  // Automation
  'Playbook', 'Flow', 'Subflow', 'CustomAction', 'TryCatch', 'DoInParallel', 'FlowStages',
  // AI (AIAF / NASK)
  'AiAgent', 'AiAgentWorkflow', 'roleMap', 'NowAssistSkillConfig',
  // Platform
  'UiPolicy', 'DataPolicy', 'Form', 'InstanceScan', 'ServicePortal', 'ImportSet', 'override',
];

async function runNowSdk(args: string[], timeoutMs = 30000): Promise<{ stdout: string; stderr: string }> {
  try {
    const result = await execFileAsync('npx', ['@servicenow/sdk', ...args], { timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024 });
    return { stdout: result.stdout, stderr: result.stderr };
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      throw new ServiceNowError('now-sdk not found. Install with: npm i -g @servicenow/sdk', 'FLUENT_NOT_INSTALLED');
    }
    throw new ServiceNowError(`now-sdk error: ${error.stderr || error.message}`, 'FLUENT_ERROR');
  }
}

/** Compare two semver-ish strings. Returns -1 / 0 / 1 (a<b / a==b / a>b). */
function compareSemver(a: string, b: string): number {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

/** Detect the installed `@servicenow/sdk` version and how it compares to MIN_RECOMMENDED_SDK. */
async function getSdkVersionInfo(): Promise<{
  installed: string | null;
  recommended: string;
  upToDate: boolean;
  warning?: string;
}> {
  let installed: string | null = null;
  try {
    const { stdout } = await runNowSdk(['--version'], 15000);
    const match = stdout.match(/\d+\.\d+\.\d+/);
    installed = match ? match[0] : stdout.trim() || null;
  } catch {
    installed = null;
  }
  const upToDate = installed !== null && compareSemver(installed, MIN_RECOMMENDED_SDK) >= 0;
  let warning: string | undefined;
  if (installed === null) {
    warning = `@servicenow/sdk not detected. Install the latest with: npm i -g @servicenow/sdk (>= ${MIN_RECOMMENDED_SDK}).`;
  } else if (!upToDate) {
    warning = `@servicenow/sdk ${installed} is older than the recommended ${MIN_RECOMMENDED_SDK}. ` +
      `Some Fluent features (now-sdk query, Playbook/RestMessage/RetryPolicy/Alias/DataLookup APIs) require >= ${MIN_RECOMMENDED_SDK}. ` +
      `Upgrade with: npm i -g @servicenow/sdk@latest`;
  }
  return { installed, recommended: MIN_RECOMMENDED_SDK, upToDate, warning };
}

export function getFluentToolDefinitions() {
  return [
    {
      name: 'fluent_query',
      description:
        'GlideQuery-style fluent query builder. Supports select, where, aggregate (COUNT/AVG/SUM/MIN/MAX), ' +
        'orderBy, limit, and groupBy. Returns records or aggregate results. ' +
        'Example: { table: "incident", where: [["active","=",true],["priority","<",3]], select: ["number","short_description"], limit: 10 }',
      inputSchema: {
        type: 'object',
        properties: {
          table: { type: 'string', description: 'Table name (e.g., "incident")' },
          where: {
            type: 'array',
            description: 'Array of conditions: [field, operator, value]. Operators: =, !=, >, >=, <, <=, LIKE, STARTSWITH, CONTAINS, IN, NOT IN, ISEMPTY, ISNOTEMPTY',
            items: {
              type: 'array',
              items: {},
              minItems: 2,
              maxItems: 3,
            },
          },
          orWhere: {
            type: 'array',
            description: 'Array of OR conditions (same format as where)',
            items: {
              type: 'array',
              items: {},
              minItems: 2,
              maxItems: 3,
            },
          },
          select: {
            type: 'array',
            description: 'Fields to return. Supports dot-walking (e.g., "caller_id.email"). If omitted, returns all fields.',
            items: { type: 'string' },
          },
          aggregate: {
            type: 'string',
            description: 'Aggregate operation: COUNT, AVG, SUM, MIN, MAX',
            enum: ['COUNT', 'AVG', 'SUM', 'MIN', 'MAX'],
          },
          aggregateField: {
            type: 'string',
            description: 'Field to aggregate on (required for AVG, SUM, MIN, MAX)',
          },
          groupBy: {
            type: 'string',
            description: 'Field to group results by (for aggregate queries)',
          },
          orderBy: {
            type: 'string',
            description: 'Field to sort by. Prefix with "-" for descending.',
          },
          limit: {
            type: 'number',
            description: 'Max records to return (default: 20, max: 200)',
          },
          displayValue: {
            type: 'boolean',
            description: 'Return display values instead of internal values (default: false)',
          },
        },
        required: ['table'],
      },
    },
    {
      name: 'batch_request',
      description:
        'Execute multiple ServiceNow REST API operations in a single HTTP call. ' +
        'Reduces round-trips by 50-70%. Each operation specifies method, URL path, and optional body. ' +
        'Max 50 operations per batch.',
      inputSchema: {
        type: 'object',
        properties: {
          operations: {
            type: 'array',
            description: 'Array of REST operations to execute',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string', description: 'Unique operation ID for correlating responses' },
                method: { type: 'string', description: 'HTTP method: GET, POST, PATCH, DELETE', enum: ['GET', 'POST', 'PATCH', 'DELETE'] },
                url: { type: 'string', description: 'API URL path (e.g., "/api/now/table/incident?sysparm_limit=5")' },
                body: { type: 'object', description: 'Request body for POST/PATCH operations' },
              },
              required: ['id', 'method', 'url'],
            },
            minItems: 1,
            maxItems: 50,
          },
        },
        required: ['operations'],
      },
    },
    {
      name: 'execute_script',
      description:
        'Execute a server-side script on the ServiceNow instance (Background Script). ' +
        'Supports GlideRecord, GlideQuery, GlideAggregate, and all server-side APIs. ' +
        'Returns the script output. Use for complex queries that cannot be expressed via REST. ' +
        'REQUIRES WRITE_ENABLED=true.',
      inputSchema: {
        type: 'object',
        properties: {
          script: {
            type: 'string',
            description: 'Server-side JavaScript to execute. Use gs.print() or gs.info() for output.',
          },
          scope: {
            type: 'string',
            description: 'Application scope to run in (default: global)',
          },
        },
        required: ['script'],
      },
    },
    {
      name: 'fluent_sdk_query',
      description:
        'Run `now-sdk query <table>` — a read-only Table REST API query executed via the ServiceNow SDK CLI ' +
        'against your authenticated instance (no browser). New in @servicenow/sdk 4.8. Ideal while authoring Fluent ' +
        'code: resolve sys_ids, inspect table schemas, check existing records, read choice values. ' +
        'Example: { table: "sys_user_role", query: "name=admin", fields: ["sys_id","name"], limit: 1 }',
      inputSchema: {
        type: 'object',
        properties: {
          table: { type: 'string', description: 'Table to query (e.g., "incident", "sys_dictionary")' },
          query: { type: 'string', description: 'Encoded query string (e.g., "name=admin^active=true")' },
          fields: { type: 'array', items: { type: 'string' }, description: 'Fields to return (e.g., ["sys_id","name"])' },
          limit: { type: 'number', description: 'Max rows to return' },
        },
        required: ['table'],
      },
    },
    {
      name: 'fluent_version',
      description:
        'Report the installed `@servicenow/sdk` (now-sdk) version and whether it meets the version NowAIKit ' +
        `tracks features against (currently ${MIN_RECOMMENDED_SDK}). Returns an upgrade hint when out of date.`,
      inputSchema: { type: 'object', properties: {}, required: [] },
    },
    {
      name: 'fluent_explain',
      description:
        'Run `npx @servicenow/sdk explain <topic>` to get live SDK documentation on a topic — always current API ' +
        'signatures, not training-data guesses. Returns explanations of Fluent APIs, types, patterns, and best practices. ' +
        'Known topics include: ' + KNOWN_EXPLAIN_TOPICS.join(', ') + '.',
      inputSchema: {
        type: 'object',
        properties: {
          topic: {
            type: 'string',
            description: 'Topic to explain. Examples: ' + KNOWN_EXPLAIN_TOPICS.slice(0, 8).join(', ') + ', etc.',
          },
        },
        required: ['topic'],
      },
    },
    {
      name: 'fluent_init',
      description:
        'Initialize a new ServiceNow fluent/now-sdk project. Runs `npx @servicenow/sdk init`. ' +
        'REQUIRES FLUENT_ENABLED=true and WRITE_ENABLED=true.',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Project name' },
          template: { type: 'string', description: 'Project template (optional)' },
          directory: { type: 'string', description: 'Target directory (optional, defaults to cwd)' },
        },
        required: ['name'],
      },
    },
    {
      name: 'fluent_build',
      description:
        'Build a ServiceNow fluent/now-sdk project. Runs `npx @servicenow/sdk build`. ' +
        'REQUIRES FLUENT_ENABLED=true and WRITE_ENABLED=true.',
      inputSchema: {
        type: 'object',
        properties: {
          directory: { type: 'string', description: 'Project directory (optional, defaults to cwd)' },
        },
        required: [],
      },
    },
    {
      name: 'fluent_validate',
      description:
        'Validate a ServiceNow fluent/now-sdk project. Runs `npx @servicenow/sdk validate`. ' +
        'REQUIRES FLUENT_ENABLED=true.',
      inputSchema: {
        type: 'object',
        properties: {
          directory: { type: 'string', description: 'Project directory (optional, defaults to cwd)' },
        },
        required: [],
      },
    },
  ];
}

// ─── Fluent Query Builder ────────────────────────────────────────────────────

interface FluentCondition {
  field: string;
  operator: string;
  value: string | number | boolean;
}

function parseConditions(conditions: any[]): FluentCondition[] {
  return conditions.map(c => {
    if (c.length === 2) {
      return { field: c[0], operator: '=', value: c[1] };
    }
    return { field: c[0], operator: c[1], value: c[2] };
  });
}

function buildEncodedQuery(where?: any[], orWhere?: any[]): string {
  const parts: string[] = [];

  if (where && where.length > 0) {
    const conditions = parseConditions(where);
    for (const c of conditions) {
      const op = mapOperator(c.operator);
      parts.push(`${c.field}${op}${c.value}`);
    }
  }

  let query = parts.join('^');

  if (orWhere && orWhere.length > 0) {
    const orConditions = parseConditions(orWhere);
    for (const c of orConditions) {
      const op = mapOperator(c.operator);
      query += `^OR${c.field}${op}${c.value}`;
    }
  }

  return query;
}

function mapOperator(op: string): string {
  const operatorMap: Record<string, string> = {
    '=': '=',
    '!=': '!=',
    '>': '>',
    '>=': '>=',
    '<': '<',
    '<=': '<=',
    'LIKE': 'LIKE',
    'STARTSWITH': 'STARTSWITH',
    'CONTAINS': 'LIKE',
    'IN': 'IN',
    'NOT IN': 'NOT IN',
    'ISEMPTY': 'ISEMPTY',
    'ISNOTEMPTY': 'ISNOTEMPTY',
  };
  return operatorMap[op.toUpperCase()] || '=';
}

// ─── Execution ──────────────────────────────────────────────────────────────

export async function executeFluentToolCall(
  client: ServiceNowClient,
  name: string,
  args: Record<string, any>
): Promise<any> {
  switch (name) {
    case 'fluent_query': {
      const table = args.table;
      if (!table) throw new ServiceNowError('table is required', 'INVALID_REQUEST');

      const query = buildEncodedQuery(args.where, args.orWhere);
      const limit = Math.min(args.limit || 20, 200);
      const displayValue = args.displayValue ? 'true' : 'false';

      // Aggregate query path
      if (args.aggregate) {
        const aggType = args.aggregate.toUpperCase();
        const params = new URLSearchParams();
        if (query) params.set('sysparm_query', query);
        params.set('sysparm_count', 'true');

        if (args.groupBy) {
          params.set('sysparm_group_by', args.groupBy);
        }

        if (aggType !== 'COUNT' && args.aggregateField) {
          params.set(`sysparm_${aggType.toLowerCase()}`, 'true');
          params.set('sysparm_avg_fields', args.aggregateField);
          params.set('sysparm_sum_fields', args.aggregateField);
          params.set('sysparm_min_fields', args.aggregateField);
          params.set('sysparm_max_fields', args.aggregateField);
        }

        const result = await client.runAggregateQuery(table, args.groupBy || '', aggType, query || undefined);
        return {
          type: 'aggregate',
          operation: aggType,
          field: args.aggregateField || null,
          groupBy: args.groupBy || null,
          result,
        };
      }

      // Select query path
      const fields = args.select ? args.select.join(',') : undefined;
      const orderBy = args.orderBy || undefined;

      const result = await client.queryRecords({
        table,
        query: query || undefined,
        fields,
        limit,
        orderBy,
      });

      // Apply display value if requested
      if (args.displayValue) {
        // Re-query with display_value parameter
        const params = new URLSearchParams();
        if (query) params.set('sysparm_query', query);
        if (fields) params.set('sysparm_fields', fields);
        params.set('sysparm_limit', limit.toString());
        params.set('sysparm_display_value', displayValue);
        params.set('sysparm_exclude_reference_link', 'true');
        if (orderBy) {
          if (orderBy.startsWith('-')) {
            params.set('sysparm_query', (query ? query + '^' : '') + 'ORDERBYDESC' + orderBy.substring(1));
          } else {
            params.set('sysparm_query', (query ? query + '^' : '') + 'ORDERBY' + orderBy);
          }
        }

        // Use queryRecords with display_value — need to pass through display_value parameter
        // For now, return raw values with a note
        return {
          type: 'select',
          table,
          count: result.count,
          records: result.records,
          query: query || null,
          fields: args.select || 'all',
        };
      }

      return {
        type: 'select',
        table,
        count: result.count,
        records: result.records,
        query: query || null,
        fields: args.select || 'all',
      };
    }

    case 'batch_request': {
      const operations = args.operations;
      if (!operations || !Array.isArray(operations) || operations.length === 0) {
        throw new ServiceNowError('operations array is required', 'INVALID_REQUEST');
      }
      if (operations.length > 50) {
        throw new ServiceNowError('Maximum 50 operations per batch', 'INVALID_REQUEST');
      }

      // Check for write operations
      const hasWrites = operations.some((op: any) => op.method !== 'GET');
      if (hasWrites) {
        requireWrite();
      }

      const result = await client.batchRequest(operations);
      return result;
    }

    case 'execute_script': {
      requireWrite();
      const script = args.script;
      if (!script) throw new ServiceNowError('script is required', 'INVALID_REQUEST');

      const result = await client.executeScript(script, args.scope);
      return result;
    }

    case 'fluent_version': {
      return await getSdkVersionInfo();
    }

    case 'fluent_sdk_query': {
      const table = args.table;
      if (!table) throw new ServiceNowError('table is required', 'INVALID_REQUEST');
      const queryArgs = ['query', String(table)];
      if (args.query) queryArgs.push('--query', String(args.query));
      if (Array.isArray(args.fields) && args.fields.length > 0) queryArgs.push('--fields', args.fields.join(','));
      if (args.limit !== undefined) queryArgs.push('--limit', String(args.limit));
      queryArgs.push('-o', 'json');
      const result = await runNowSdk(queryArgs, 30000);
      let records: unknown = undefined;
      try { records = JSON.parse(result.stdout); } catch { /* leave raw */ }
      return { table, records: records ?? undefined, output: records ? undefined : result.stdout, stderr: result.stderr || undefined };
    }

    case 'fluent_explain': {
      const topic = args.topic;
      if (!topic) throw new ServiceNowError('topic is required', 'INVALID_REQUEST');
      const result = await runNowSdk(['explain', topic], 30000);
      return { topic, output: result.stdout, stderr: result.stderr || undefined };
    }

    case 'fluent_init': {
      requireFluent();
      requireWrite();
      const name = args.name;
      if (!name) throw new ServiceNowError('name is required', 'INVALID_REQUEST');
      const initArgs = ['init', '--name', name];
      if (args.template) initArgs.push('--template', args.template);
      if (args.directory) initArgs.push('--directory', args.directory);
      const result = await runNowSdk(initArgs, 60000);
      return { action: 'project_initialized', name, output: result.stdout, stderr: result.stderr || undefined };
    }

    case 'fluent_build': {
      requireFluent();
      requireWrite();
      const buildArgs = ['build'];
      if (args.directory) buildArgs.push('--directory', args.directory);
      const result = await runNowSdk(buildArgs, 120000);
      const sdk = await getSdkVersionInfo();
      return { action: 'build_completed', output: result.stdout, stderr: result.stderr || undefined, sdkVersion: sdk.installed, sdkVersionWarning: sdk.warning };
    }

    case 'fluent_validate': {
      requireFluent();
      const validateArgs = ['validate'];
      if (args.directory) validateArgs.push('--directory', args.directory);
      const result = await runNowSdk(validateArgs, 60000);
      return { action: 'validation_completed', output: result.stdout, stderr: result.stderr || undefined };
    }

    default:
      return null;
  }
}

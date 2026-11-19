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
import { requireWrite, requireFluent, requireScripting } from '../utils/permissions.js';

const execFileAsync = promisify(execFileCb);

/**
 * Minimum `@servicenow/sdk` version we track features against. Bump this when we
 * adopt a newer SDK release so the tooling stays on the latest-and-greatest.
 * 4.14.2 (Nov 2026): fuzzy `explain --range`, `exec`, encrypted credential store
 * (4.14.0 cannot read keys written by 4.14.2, so every project should be on 4.14.2+).
 */
const MIN_RECOMMENDED_SDK = '4.14.2';

/** now-sdk `explain` topics worth surfacing. `explain --list` returns the full (~300) set. */
const KNOWN_EXPLAIN_TOPICS = [
  // Core / project
  'GlideQuery', 'table API', 'scoped app', 'now.config.json', 'keys.ts', 'metadata',
  'Table', 'Record', 'List', 'ChoiceSet', 'Property', 'Role', 'Acl', 'CrossScopePrivilege', 'ApplicationMenu',
  'Now.del', 'Now.attach', 'DataLookup', 'DatabaseView',
  // Scripts & UI
  'BusinessRule', 'ClientScript', 'ScriptInclude', 'ScriptAction', 'UiAction', 'UiPolicy', 'UiPage', 'UiMacro',
  'DataPolicy', 'Form', 'StateModel', 'override',
  // Service Catalog (4.3+)
  'CatalogItem', 'CatalogItemRecordProducer', 'VariableSet', 'CatalogClientScript', 'CatalogUiPolicy', 'UserCriteria',
  // Integration
  'RestApi', 'GraphQLApi', 'RestMessage', 'Alias', 'AliasTemplate', 'RetryPolicy', 'ImportSet', 'InboundEmailAction',
  // Automation
  'Flow', 'Subflow', 'Action', 'CustomAction', 'TryCatch', 'DoInParallel', 'FlowStages', 'Playbook',
  'ScheduledScript', 'Sla', 'EmailNotification',
  // AI (AIAF / NASK)
  'AiAgent', 'AiAgenticWorkflow', 'roleMap', 'NowAssistSkillConfig',
  // Experience
  'ServicePortal', 'SPWidget', 'SPPage', 'SPTheme', 'SPMenu', 'SPHeaderFooter', 'Workspace', 'Dashboard',
  // Quality & governance
  'Test', 'TestSuite', 'InstanceScan', 'Assessment', 'RiskAssessment',
  // CI/CD
  'cicd',
];

async function runNowSdk(args: string[], timeoutMs = 30000, cwd?: string): Promise<{ stdout: string; stderr: string }> {
  try {
    const result = await execFileAsync('npx', ['@servicenow/sdk', ...args], {
      timeout: timeoutMs,
      maxBuffer: 10 * 1024 * 1024,
      cwd: cwd || undefined,
      // NO_COLOR keeps ANSI codes out of the output the model reads.
      env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
    });
    return { stdout: result.stdout, stderr: result.stderr };
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      throw new ServiceNowError('now-sdk not found. Install with: npm i -g @servicenow/sdk', 'FLUENT_NOT_INSTALLED');
    }
    // Node deprecation warnings land on stderr too; drop them so the real CLI error shows.
    const stderr = String(error.stderr || '').split('\n').filter((l: string) => l && !/DeprecationWarning|--trace-deprecation/.test(l)).join('\n');
    const detail = [stderr, String(error.stdout || '').trim()].filter(Boolean).join('\n') || error.message;
    throw new ServiceNowError(`now-sdk error: ${detail.slice(0, 4000)}`, 'FLUENT_ERROR');
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
      `Newer features (exec, UiMacro and reusable ATF tests in 4.14, DatabaseView in 4.13, Assessment in 4.12, ` +
      `TestSuite and GraphQLApi in 4.11, cicd and StateModel in 4.10) need a current SDK, and 4.14.0 cannot read credentials written by 4.14.2. ` +
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
        'Run `now-sdk query <table>`: a read-only Table API query through the ServiceNow SDK CLI using its saved ' +
        'credentials (no browser). Ideal while authoring Fluent code: resolve sys_ids, inspect schemas, check existing ' +
        'records, read choice values. Example: { table: "sys_user_role", query: "name=admin", fields: ["sys_id","name"], limit: 1 }',
      inputSchema: {
        type: 'object',
        properties: {
          table: { type: 'string', description: 'Table to query (e.g., "incident", "sys_dictionary")' },
          query: { type: 'string', description: 'Encoded query (e.g., "name=admin^active=true"). Defaults to all records.' },
          fields: { type: 'array', items: { type: 'string' }, description: 'Fields to return (e.g., ["sys_id","name"])' },
          limit: { type: 'number', description: 'Max rows per page (default 100)' },
          offset: { type: 'number', description: 'Starting offset for paging' },
          display_value: { type: 'string', enum: ['true', 'false', 'all'], description: 'Return display values, raw values, or both' },
          auth: { type: 'string', description: 'now-sdk credential alias (optional, defaults to the SDK default)' },
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
        'Live ServiceNow SDK documentation from `now-sdk explain`: current Fluent API signatures, guides and examples ' +
        '(about 300 topics), not training-data guesses. Fuzzy search is supported, so a keyword like "catalog variable" works. ' +
        'Use list=true to list topics, peek=true for a short summary. Known topics include: ' + KNOWN_EXPLAIN_TOPICS.join(', ') + '.',
      inputSchema: {
        type: 'object',
        properties: {
          topic: { type: 'string', description: 'Topic name or keyword. Optional when list=true.' },
          list: { type: 'boolean', description: 'List matching topic names instead of showing a document' },
          peek: { type: 'boolean', description: 'Show a brief summary instead of the full document' },
          range: { type: 'string', description: 'Ranked results to show for a fuzzy search, e.g. "5" or "3-7"' },
        },
        required: [],
      },
    },
    {
      name: 'fluent_init',
      description:
        'Create a new Fluent (now-sdk) application, apply a template to an existing one, or convert a legacy scoped app ' +
        'into Fluent source (from = app sys_id on the instance, or a local folder). Runs `now-sdk init` in the given directory. ' +
        'REQUIRES FLUENT_ENABLED=true and WRITE_ENABLED=true.',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Application name (--appName)' },
          package_name: { type: 'string', description: 'npm package name (--packageName). Defaults to a slug of name.' },
          scope: { type: 'string', description: 'Scope name, e.g. x_acme_app (max 18 chars, vendor prefix if applicable)' },
          template: {
            type: 'string',
            enum: ['base', 'javascript.basic', 'javascript.react', 'typescript.basic', 'typescript.react', 'typescript.vue', 'javascript.aiux', 'javascript.aiux-extension'],
            description: 'Project template',
          },
          from: { type: 'string', description: 'Convert a legacy app: its sys_app sys_id on the instance, or a local folder path' },
          directory: { type: 'string', description: 'Directory to create the project in (defaults to the server working directory)' },
          auth: { type: 'string', description: 'now-sdk credential alias (optional)' },
        },
        required: [],
      },
    },
    {
      name: 'fluent_build',
      description:
        'Compile a Fluent (now-sdk) project into installable app files. Runs `now-sdk build`. ' +
        'Set frozen_keys=true in CI to fail when keys/sys_ids are out of date. REQUIRES FLUENT_ENABLED=true and WRITE_ENABLED=true.',
      inputSchema: {
        type: 'object',
        properties: {
          directory: { type: 'string', description: 'Project directory (contains package.json). Defaults to the working directory.' },
          frozen_keys: { type: 'boolean', description: 'Fail if keys/sys_ids are not up to date (CI builds)' },
          source_map: { type: 'boolean', description: 'Write source-manifest.json mapping build output back to source' },
          error_on_conflict: { type: 'boolean', description: 'Treat Fluent vs XML sys_id conflicts as errors' },
        },
        required: [],
      },
    },
    {
      name: 'fluent_validate',
      description:
        'Check that a Fluent (now-sdk) project compiles cleanly without installing it: runs `now-sdk build --frozenKeys ' +
        '--errorOnConflict`, so type errors, unknown properties, stale keys and sys_id conflicts all fail. REQUIRES FLUENT_ENABLED=true.',
      inputSchema: {
        type: 'object',
        properties: {
          directory: { type: 'string', description: 'Project directory (contains package.json). Defaults to the working directory.' },
        },
        required: [],
      },
    },
    {
      name: 'fluent_install',
      description:
        'Install or update a built Fluent app on the instance (`now-sdk install`). info=true only reports the most recent ' +
        'install. reinstall=true uninstalls first and DISCARDS on-instance metadata not present locally. ' +
        'REQUIRES FLUENT_ENABLED=true and WRITE_ENABLED=true.',
      inputSchema: {
        type: 'object',
        properties: {
          directory: { type: 'string', description: 'Project directory (contains package.json). Defaults to the working directory.' },
          info: { type: 'boolean', description: 'Only show information about the most recent install of this app' },
          reinstall: { type: 'boolean', description: 'Uninstall and reinstall (on-instance-only metadata is lost)' },
          skip_flow_activation: { type: 'boolean', description: 'Do not publish flows after install' },
          demo_data: { type: 'boolean', description: 'Install demo data (default true)' },
          auth: { type: 'string', description: 'now-sdk credential alias (optional)' },
        },
        required: [],
      },
    },
    {
      name: 'fluent_download',
      description:
        'Download an application\'s metadata from the instance into a local folder (`now-sdk download`). ' +
        'Uses the SDK\'s default credential (the download command has no alias flag; switch with `now-sdk auth --use <alias>`). ' +
        'REQUIRES FLUENT_ENABLED=true and WRITE_ENABLED=true (writes local files).',
      inputSchema: {
        type: 'object',
        properties: {
          target: { type: 'string', description: 'Folder to download the metadata into' },
          directory: { type: 'string', description: 'Project directory (contains package.json). Defaults to the working directory.' },
          incremental: { type: 'boolean', description: 'Only download changes since the last download' },
        },
        required: ['target'],
      },
    },
    {
      name: 'fluent_transform',
      description:
        'Convert XML records from the instance (by table) or from local XML files into Fluent source code ' +
        '(`now-sdk transform`). REQUIRES FLUENT_ENABLED=true and WRITE_ENABLED=true (writes local files).',
      inputSchema: {
        type: 'object',
        properties: {
          tables: { type: 'array', items: { type: 'string' }, description: 'Tables to transform by hierarchy, e.g. ["sys_script_include"]' },
          from: { type: 'string', description: 'Local XML file or folder to transform instead of the instance' },
          force: { type: 'boolean', description: 'Allow descendant tables without their parent hierarchy' },
          directory: { type: 'string', description: 'Project directory (contains package.json). Defaults to the working directory.' },
          auth: { type: 'string', description: 'now-sdk credential alias (optional)' },
        },
        required: [],
      },
    },
    {
      name: 'fluent_dependencies',
      description:
        'Download the dependencies declared in now.config.json plus TypeScript type definitions (Script Include types, ' +
        'glide.*.d.ts, ChoiceSets). Use add + scope to register new dependency records. Runs `now-sdk dependencies`. ' +
        'REQUIRES FLUENT_ENABLED=true and WRITE_ENABLED=true (writes local files).',
      inputSchema: {
        type: 'object',
        properties: {
          directory: { type: 'string', description: 'Project directory (contains package.json). Defaults to the working directory.' },
          add: { type: 'string', description: 'Table of dependency items to add, e.g. sys_security_acl, actions, triggers' },
          sys_ids: { type: 'array', items: { type: 'string' }, description: 'sys_ids to add (with add)' },
          scope: { type: 'string', description: 'Scope of the added dependencies (required with add), e.g. global' },
          type_defs_only: { type: 'boolean', description: 'Only download script type definitions' },
          fluent_only: { type: 'boolean', description: 'Only download Fluent types from now.config.json dependencies' },
          auth: { type: 'string', description: 'now-sdk credential alias (optional)' },
        },
        required: [],
      },
    },
    {
      name: 'fluent_pack',
      description: 'Zip a built Fluent app into an installable artifact (`now-sdk pack`). REQUIRES FLUENT_ENABLED=true.',
      inputSchema: {
        type: 'object',
        properties: {
          directory: { type: 'string', description: 'Project directory (contains package.json). Defaults to the working directory.' },
          skip_package_inventory: { type: 'boolean', description: 'Do not generate package_inventory.csv' },
        },
        required: [],
      },
    },
    {
      name: 'fluent_exec',
      description:
        'Run a server-side script on the instance through the SDK (`now-sdk exec`, 4.14+). Unlike a plain background ' +
        'script, the run is recorded on a Script Execution History record with your reason, and record changes can be ' +
        'rolled back from there. REQUIRES FLUENT_ENABLED=true and SCRIPTING_ENABLED=true.',
      inputSchema: {
        type: 'object',
        properties: {
          script: { type: 'string', description: 'Server-side JavaScript to run' },
          reason: { type: 'string', description: 'Why the script is being run (stored on the execution history record)' },
          scope: { type: 'string', description: 'Scope to run in: app sys_id, scope name or "global"' },
          record_for_rollback: { type: 'boolean', description: 'Create a rollback context (default true)' },
          server_logs: { type: 'boolean', description: 'Include the instance session log, with stack traces' },
          directory: { type: 'string', description: 'Fluent project directory, used for the default scope (optional)' },
          auth: { type: 'string', description: 'now-sdk credential alias (optional)' },
        },
        required: ['script', 'reason'],
      },
    },
    {
      name: 'fluent_cicd',
      description:
        'Run ServiceNow CI/CD operations via the SDK (`now-sdk cicd`): install an app version from the app repository, ' +
        'publish an app to it, roll an app back, or run an ATF test or test suite (optionally on the ATF Cloud Runner). ' +
        'REQUIRES FLUENT_ENABLED=true and WRITE_ENABLED=true.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['install', 'publish', 'rollback', 'testsuite', 'test'],
            description: 'install / publish / rollback an app, or run an ATF test suite or a single ATF test',
          },
          appSysId: { type: 'string', description: 'App sys_id (install, publish, rollback). Use this or scope.' },
          scope: { type: 'string', description: 'App scope, e.g. x_acme_app (install, publish, rollback). Use this or appSysId.' },
          appVersion: { type: 'string', description: 'App version, e.g. 1.0.0 (install, publish, rollback)' },
          testSuiteName: { type: 'string', description: 'ATF test suite name (testsuite). Use this or testSuiteSysId.' },
          testSuiteSysId: { type: 'string', description: 'ATF test suite sys_id (testsuite)' },
          testName: { type: 'string', description: 'ATF test name (test). Use this or testSysId.' },
          testSysId: { type: 'string', description: 'ATF test sys_id (test)' },
          runInCloud: { type: 'boolean', description: 'Run UI steps on the ATF Cloud Runner (testsuite, test)' },
          browserName: { type: 'string', description: 'Browser for UI tests, e.g. chrome (testsuite, test)' },
          directory: { type: 'string', description: 'Fluent project directory, used for default app sys_id/version (optional)' },
          auth: { type: 'string', description: 'now-sdk credential alias (optional)' },
        },
        required: ['action'],
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
      // `-q` is required by the CLI; default to every record.
      const queryArgs = ['query', String(table), '--query', String(args.query || 'sys_idISNOTEMPTY')];
      if (Array.isArray(args.fields) && args.fields.length > 0) queryArgs.push('--fields', args.fields.join(','));
      if (args.limit !== undefined) queryArgs.push('--limit', String(args.limit));
      if (args.offset !== undefined) queryArgs.push('--offset', String(args.offset));
      if (args.display_value) queryArgs.push('--display-value', String(args.display_value));
      pushAuth(queryArgs, args);
      queryArgs.push('-o', 'json');
      const result = await runNowSdk(queryArgs, 60000);
      let records: unknown = undefined;
      try { records = JSON.parse(result.stdout); } catch { /* leave raw */ }
      return { table, records: records ?? undefined, output: records ? undefined : result.stdout, stderr: result.stderr || undefined };
    }

    case 'fluent_explain': {
      if (!args.topic && !args.list) throw new ServiceNowError('topic is required (or set list=true)', 'INVALID_REQUEST');
      const explainArgs = ['explain'];
      if (args.topic) explainArgs.push(String(args.topic));
      if (args.list) explainArgs.push('--list');
      if (args.peek) explainArgs.push('--peek');
      if (args.range) explainArgs.push('--range', String(args.range));
      explainArgs.push('--format', 'raw');
      const result = await runNowSdk(explainArgs, 60000);
      return { topic: args.topic || null, output: result.stdout, stderr: result.stderr || undefined };
    }

    case 'fluent_init': {
      requireFluent();
      requireWrite();
      if (!args.name && !args.from) throw new ServiceNowError('name is required (or from, to convert a legacy app)', 'INVALID_REQUEST');
      const initArgs = ['init'];
      if (args.name) initArgs.push('--appName', String(args.name));
      const pkg = args.package_name || (args.name ? String(args.name).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') : '');
      if (pkg) initArgs.push('--packageName', pkg);
      if (args.scope) initArgs.push('--scopeName', String(args.scope));
      if (args.template) initArgs.push('--template', String(args.template));
      if (args.from) initArgs.push('--from', String(args.from));
      pushAuth(initArgs, args);
      const result = await runNowSdk(initArgs, 600000, args.directory);
      return { action: 'project_initialized', name: args.name || null, directory: args.directory || process.cwd(), output: result.stdout, stderr: result.stderr || undefined };
    }

    case 'fluent_build': {
      requireFluent();
      requireWrite();
      const buildArgs = ['build'];
      if (args.directory) buildArgs.push(String(args.directory));
      if (args.frozen_keys) buildArgs.push('--frozenKeys');
      if (args.source_map) buildArgs.push('--sourceMap');
      if (args.error_on_conflict) buildArgs.push('--errorOnConflict');
      const result = await runNowSdk(buildArgs, 300000);
      const sdk = await getSdkVersionInfo();
      return { action: 'build_completed', output: result.stdout, stderr: result.stderr || undefined, sdkVersion: sdk.installed, sdkVersionWarning: sdk.warning };
    }

    case 'fluent_validate': {
      requireFluent();
      // The CLI has no separate validate command: a strict build is the check.
      const validateArgs = ['build'];
      if (args.directory) validateArgs.push(String(args.directory));
      validateArgs.push('--frozenKeys', '--errorOnConflict');
      const result = await runNowSdk(validateArgs, 300000);
      return { action: 'validation_completed', valid: true, output: result.stdout, stderr: result.stderr || undefined };
    }

    case 'fluent_install': {
      requireFluent();
      requireWrite();
      const installArgs = ['install'];
      if (args.directory) installArgs.push('--source', String(args.directory));
      if (args.info) installArgs.push('--info');
      if (args.reinstall) installArgs.push('--reinstall');
      if (args.skip_flow_activation) installArgs.push('--skip-flow-activation');
      if (args.demo_data === false) installArgs.push('--demoData=false');
      pushAuth(installArgs, args);
      const result = await runNowSdk(installArgs, 900000);
      return { action: args.info ? 'install_info' : 'install_completed', output: result.stdout, stderr: result.stderr || undefined };
    }

    case 'fluent_download': {
      requireFluent();
      requireWrite();
      if (!args.target) throw new ServiceNowError('target is required', 'INVALID_REQUEST');
      const dlArgs = ['download', String(args.target)];
      if (args.directory) dlArgs.push('--source', String(args.directory));
      if (args.incremental) dlArgs.push('--incremental');
      const result = await runNowSdk(dlArgs, 900000);
      return { action: 'download_completed', target: args.target, output: result.stdout, stderr: result.stderr || undefined };
    }

    case 'fluent_transform': {
      requireFluent();
      requireWrite();
      const tables = Array.isArray(args.tables) ? args.tables.map(String).filter(Boolean) : [];
      if (!tables.length && !args.from) throw new ServiceNowError('tables or from is required', 'INVALID_REQUEST');
      const tArgs = ['transform'];
      if (tables.length) tArgs.push('--table', tables.join(','));
      if (args.from) tArgs.push('--from', String(args.from));
      if (args.force) tArgs.push('--force');
      if (args.directory) tArgs.push('--directory', String(args.directory));
      pushAuth(tArgs, args);
      const result = await runNowSdk(tArgs, 900000);
      return { action: 'transform_completed', output: result.stdout, stderr: result.stderr || undefined };
    }

    case 'fluent_dependencies': {
      requireFluent();
      requireWrite();
      if (args.add && !args.scope) throw new ServiceNowError('scope is required with add', 'INVALID_REQUEST');
      const dArgs = ['dependencies'];
      if (Array.isArray(args.sys_ids)) dArgs.push(...args.sys_ids.map(String));
      if (args.directory) dArgs.push('--directory', String(args.directory));
      if (args.add) dArgs.push('--add', String(args.add), '--scope', String(args.scope));
      if (args.type_defs_only) dArgs.push('--type-defs-only');
      if (args.fluent_only) dArgs.push('--fluent-only');
      pushAuth(dArgs, args);
      const result = await runNowSdk(dArgs, 600000);
      return { action: 'dependencies_downloaded', output: result.stdout, stderr: result.stderr || undefined };
    }

    case 'fluent_pack': {
      requireFluent();
      const pArgs = ['pack'];
      if (args.directory) pArgs.push(String(args.directory));
      if (args.skip_package_inventory) pArgs.push('--skip-package-inventory');
      const result = await runNowSdk(pArgs, 300000);
      return { action: 'pack_completed', output: result.stdout, stderr: result.stderr || undefined };
    }

    case 'fluent_exec': {
      requireFluent();
      requireScripting();
      if (!args.script) throw new ServiceNowError('script is required', 'INVALID_REQUEST');
      if (!args.reason) throw new ServiceNowError('reason is required: it is recorded on the Script Execution History record', 'INVALID_REQUEST');
      const eArgs = ['exec', String(args.script), '--reason', String(args.reason)];
      if (args.scope) eArgs.push('--scope', String(args.scope));
      if (args.record_for_rollback === false) eArgs.push('--record-for-rollback=false');
      if (args.server_logs) eArgs.push('--server-logs');
      pushAuth(eArgs, args);
      eArgs.push('-o', 'json');
      const result = await runNowSdk(eArgs, 330000, args.directory);
      let parsed: unknown = undefined;
      try { parsed = JSON.parse(result.stdout); } catch { /* leave raw */ }
      return { action: 'script_executed', result: parsed ?? undefined, output: parsed ? undefined : result.stdout, stderr: result.stderr || undefined };
    }

    case 'fluent_cicd': {
      requireFluent();
      requireWrite();
      const action = args.action;
      const cicdArgs = ['cicd'];
      const pushApp = () => {
        if (args.appSysId) cicdArgs.push('--app-sys-id', String(args.appSysId));
        else if (args.scope) cicdArgs.push('--scope', String(args.scope));
        if (args.appVersion) cicdArgs.push('--app-version', String(args.appVersion));
      };
      const pushRunner = () => {
        if (args.runInCloud) cicdArgs.push('--run-in-cloud');
        if (args.browserName) cicdArgs.push('--browser-name', String(args.browserName));
      };
      if (action === 'install' || action === 'publish' || action === 'rollback') {
        if (!args.appSysId && !args.scope && !args.directory) {
          throw new ServiceNowError(`appSysId or scope is required for action=${action} (or directory of a Fluent project)`, 'INVALID_REQUEST');
        }
        cicdArgs.push(action);
        pushApp();
      } else if (action === 'testsuite') {
        if (!args.testSuiteName && !args.testSuiteSysId) throw new ServiceNowError('testSuiteName or testSuiteSysId is required for action=testsuite', 'INVALID_REQUEST');
        cicdArgs.push('testsuite', 'run');
        if (args.testSuiteSysId) cicdArgs.push('--test-suite-sys-id', String(args.testSuiteSysId));
        else cicdArgs.push('--test-suite-name', String(args.testSuiteName));
        pushRunner();
      } else if (action === 'test') {
        if (!args.testName && !args.testSysId) throw new ServiceNowError('testName or testSysId is required for action=test', 'INVALID_REQUEST');
        cicdArgs.push('test', 'run');
        if (args.testSysId) cicdArgs.push('--test-sys-id', String(args.testSysId));
        else cicdArgs.push('--test-name', String(args.testName));
        pushRunner();
      } else {
        throw new ServiceNowError('action must be one of: install, publish, rollback, testsuite, test', 'INVALID_REQUEST');
      }
      pushAuth(cicdArgs, args);
      const result = await runNowSdk(cicdArgs, 960000, args.directory);
      return { action: `cicd_${action}`, output: result.stdout, stderr: result.stderr || undefined };
    }

    default:
      return null;
  }
}

/** Pass a now-sdk credential alias through when one is given. */
function pushAuth(cliArgs: string[], args: Record<string, any>): void {
  if (args.auth) cliArgs.push('--auth', String(args.auth));
}

import type { CapabilityDefinition } from '../types.js';

const capability: CapabilityDefinition = {
  name: 'scan-health',
  title: 'Instance Health Scan',
  description:
    'Complete instance health assessment \u2014 plugins, scheduled jobs, logs, quotas, system diagnostics',
  category: 'scan',

  arguments: [
    {
      name: 'scope',
      description:
        'Health scan scope: "full" (default), "plugins", "jobs", or "logs"',
      required: false,
    },
  ],

  recommendedTools: [
    'query_records',
    'get_sys_log',
    'list_scheduled_jobs',
    'get_scheduled_job',
    'get_system_property',
    'list_system_properties',
    'check_table_completeness',
    'get_table_record_count',
  ],

  buildPrompt(args) {
    const scope = args?.scope ?? 'full';

    const scopeLabel: Record<string, string> = {
      full: 'Full instance health scan',
      plugins: 'Plugin health scan',
      jobs: 'Scheduled job health scan',
      logs: 'System log analysis',
    };

    const scopeDescription = scopeLabel[scope] ?? `Scoped health scan: ${scope}`;

    const systemPropertiesSection = [
      '## 1. System Properties & Instance Info',
      '',
      'Use `list_system_properties` and `get_system_property` to collect:',
      '- Instance version and build tag (`glide.buildtag`, `glide.war`)',
      '- Instance name and environment type (dev/test/prod)',
      '- Time zone and locale settings',
      '- Licensing info (`glide.product.*`)',
      '- Node configuration (`glide.cluster.*`)',
      '- Key feature flags and toggles',
      '',
      '**Output:** Instance identity card with version, environment, and config summary',
    ];

    const pluginSection = [
      '## 2. Plugin Status',
      '',
      'Use `query_records` on `v_plugin` and `sys_plugins` to check:',
      '- Count of active vs inactive plugins',
      '- Plugins in "demo" status that should not be active in production',
      '- Version mismatches between related plugin families',
      '- Recently activated or deactivated plugins (last 30 days)',
      '- Plugins with known deprecation notices',
      '- Orphaned plugin dependencies (required plugin inactive but dependant active)',
      '',
      '**Output:** Plugin inventory table — name, version, status, last modified, risk notes',
    ];

    const jobSection = [
      '## 3. Scheduled Job Health',
      '',
      'Use `list_scheduled_jobs` and `get_scheduled_job` to assess:',
      '- Jobs in "error" or "cancelled" state',
      '- Jobs that have not run in their expected window (overdue)',
      '- Long-running jobs (last execution time > 2x average)',
      '- Critical system jobs that are disabled (e.g., clean-up, replication, mid-server heartbeat)',
      '- Jobs running as admin that should use a service account',
      '- Conflicting schedules (multiple heavy jobs overlapping)',
      '- Custom jobs with no run-as user',
      '',
      '**Output:** Job status table with severity for each finding',
    ];

    const logSection = [
      '## 4. System Log Analysis',
      '',
      'Use `get_sys_log` and `query_records` on `syslog`, `syslog_transaction`, and `sys_email_log` to analyze:',
      '- Error and warning frequency over the last 24h/7d',
      '- Top 10 error sources (by script/table/source field)',
      '- Recurring error patterns (same message repeating)',
      '- Transaction quota violations',
      '- Slow query and transaction warnings',
      '- Email delivery failures and bounce rates',
      '- Authentication failures and lockouts',
      '',
      '**Output:** Log summary with error trend, top offenders, and severity ratings',
    ];

    const tableHealthSection = [
      '## 5. Table Health',
      '',
      'Use `check_table_completeness`, `get_table_record_count`, and `query_records` to evaluate:',
      '- Record counts for core tables (incident, task, cmdb_ci, sys_audit, syslog)',
      '- Tables with abnormal growth (>10% increase in 30 days)',
      '- Attachment table size and orphaned attachments',
      '- Audit/journal table bloat',
      '- Tables approaching row count thresholds',
      '- Data completeness (mandatory fields with null values)',
      '',
      '**Output:** Table health matrix with row counts, growth indicators, and warnings',
    ];

    const queueSection = [
      '## 6. Queue Sizes & Backlogs',
      '',
      'Use `query_records` and `get_table_record_count` to inspect:',
      '- Event queue depth (`sysevent` — unprocessed events)',
      '- Email queue (`sys_email` — ready/send-failed counts)',
      '- Import set queue (`sys_import_set_row` — pending rows)',
      '- Scheduled job queue (`sys_trigger` — pending triggers)',
      '- ECC queue depth (`ecc_queue` — pending input/output)',
      '- Transform queue backlog',
      '- Workflow context queue (`wf_context` — active/waiting)',
      '',
      '**Output:** Queue status table with current depth, trend direction, and risk level',
    ];

    const performanceSection = [
      '## 7. Performance Indicators',
      '',
      'Use `query_records` and `list_system_properties` to gather:',
      '- Transaction response time properties and thresholds',
      '- Semaphore and concurrency settings',
      '- Cache hit/miss ratios (if available via properties)',
      '- Business rule execution counts (heavy tables)',
      '- Long-running transaction settings and violations',
      '- Session timeout and concurrency limits',
      '',
      '**Output:** Performance summary with indicator values and recommended thresholds',
    ];

    const nodeSection = [
      '## 8. Node & Cluster Status',
      '',
      'Use `query_records` on `sys_cluster_state` and `list_system_properties` for:',
      '- Number of active application nodes',
      '- Node roles and load distribution',
      '- Last heartbeat times per node',
      '- MID Server connectivity (`ecc_agent` — status, last run)',
      '- Cluster replication lag',
      '- Node-specific errors or warnings',
      '',
      '**Output:** Cluster topology summary with node status and connectivity',
    ];

    // Build sections based on scope
    let sections: string[][];
    switch (scope) {
      case 'plugins':
        sections = [systemPropertiesSection, pluginSection];
        break;
      case 'jobs':
        sections = [jobSection];
        break;
      case 'logs':
        sections = [logSection];
        break;
      default:
        sections = [
          systemPropertiesSection,
          pluginSection,
          jobSection,
          logSection,
          tableHealthSection,
          queueSection,
          performanceSection,
          nodeSection,
        ];
    }

    const reportFormat = [
      '## Health Report Format',
      '',
      'Compile all findings into a structured report:',
      '',
      '```',
      'INSTANCE HEALTH REPORT',
      '======================',
      'Instance: [name]  |  Version: [version]  |  Scan scope: [scope]',
      'Scan date: [current date]',
      '',
      'EXECUTIVE SUMMARY',
      '- Critical issues: X',
      '- Warnings: X',
      '- Informational: X',
      '- Overall health: [Healthy / Degraded / Critical]',
      '',
      'FINDINGS BY CATEGORY',
      '--------------------',
      'Each finding includes:',
      '  [SEVERITY] CATEGORY — Description',
      '  Evidence: [data/metric that triggered the finding]',
      '  Impact: [what happens if ignored]',
      '  Recommendation: [actionable fix]',
      '',
      'SEVERITY LEGEND',
      '  CRITICAL — Immediate action required; service impact likely',
      '  HIGH     — Action needed within 24-48 hours',
      '  MEDIUM   — Plan remediation within 1-2 weeks',
      '  LOW      — Housekeeping; address during next maintenance window',
      '  INFO     — No action required; noted for awareness',
      '',
      'TREND INDICATORS',
      '  Improving / Stable / Degrading',
      '```',
    ];

    return [
      {
        role: 'assistant' as const,
        content: {
          type: 'text' as const,
          text: [
            '# Capability: Instance Health Scan',
            '',
            `**Scope:** ${scopeDescription}`,
            '',
            'This capability performs a comprehensive health assessment of the ServiceNow instance.',
            'Each section gathers data, analyzes it against best-practice thresholds, and produces',
            'findings with severity ratings.',
            '',
            ...sections.flatMap(s => [...s, '']),
            ...reportFormat,
            '',
            '---',
            '',
            `Starting health scan with scope: **${scope}**.`,
            '',
            'After presenting your analysis, offer to generate a branded PDF or PPTX report by calling the `generate_report` tool with your full analysis.',
          ].join('\n'),
        },
      },
      {
        role: 'user' as const,
        content: {
          type: 'text' as const,
          text:
            scope === 'full'
              ? 'Run a full health scan on my ServiceNow instance. Check every category and give me a structured report with severity ratings.'
              : `Run a ${scope} health scan on my ServiceNow instance. Give me a structured report with severity ratings.`,
        },
      },
    ];
  },
};

export default capability;

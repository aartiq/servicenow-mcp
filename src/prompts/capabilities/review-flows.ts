import type { CapabilityDefinition } from '../types.js';

const capability: CapabilityDefinition = {
  name: 'review-flows',
  title: 'Flow Designer Audit',
  description:
    'Flow audit — dead paths, missing error handlers, async issues, performance bottlenecks, best practices',
  category: 'review',
  arguments: [
    {
      name: 'scope',
      description:
        'Application scope to audit (e.g. "x_myapp"), or "all" for instance-wide. Default: all',
      required: false,
    },
    {
      name: 'focus',
      description:
        'Audit focus area: "errors", "performance", "security", or "all" (default)',
      required: false,
    },
  ],
  recommendedTools: [
    'query_records',
    'list_flows',
    'get_flow',
    'list_subflows',
    'get_subflow',
    'list_flow_executions',
    'get_flow_execution',
    'get_flow_error_log',
  ],

  buildPrompt(args) {
    const scope = args?.scope ?? 'all';
    const focus = args?.focus ?? 'all';

    const scopeLabel =
      scope === 'all'
        ? 'Instance-wide (all scopes)'
        : `Application scope: \`${scope}\``;

    const focusLabel: Record<string, string> = {
      all: 'Full audit — errors, performance, security, best practices',
      errors: 'Error handling and failure paths',
      performance: 'Performance bottlenecks and resource consumption',
      security: 'Security, role checks, and data exposure',
    };

    const focusDescription = focusLabel[focus] ?? `Custom focus: ${focus}`;

    // ─── Section 1: Inventory ────────────────────────────────────────────────

    const inventorySection = [
      '## 1. Flow Inventory',
      '',
      'Use `list_flows`, `list_subflows`, and `query_records` to build a complete inventory:',
      '',
      '### Flows (sys_hub_flow)',
      '- Count by status: active, inactive, draft',
      '- Count by trigger type: record-based, schedule-based, application-based, inbound email, REST',
      scope !== 'all'
        ? `- Filter to scope \`${scope}\` — also note any global flows that affect tables in this scope`
        : '- Group by application scope',
      '- Identify flows with no trigger (manually invoked only)',
      '- Identify flows created but never executed',
      '',
      '### Subflows (sys_hub_sub_flow)',
      '- Count of subflows, grouped by scope',
      '- Subflows that are never referenced by any parent flow (orphaned)',
      '- Subflows used by 5+ parent flows (shared utilities — verify they are robust)',
      '',
      '### Legacy Workflows (wf_workflow)',
      '- Count of active legacy workflows — flag for migration to Flow Designer',
      '- Workflows with Run Script activities (security review needed)',
      '',
      '**Output:** Inventory table',
      '| Name | Type | Scope | Trigger | Status | Last Executed | Execution Count |',
      '|------|------|-------|---------|--------|---------------|-----------------|',
    ];

    // ─── Section 2: Error Handling ───────────────────────────────────────────

    const errorSection = [
      '## 2. Error Handling Audit',
      '',
      'Use `get_flow`, `get_subflow`, and `get_flow_error_log` to inspect each flow:',
      '',
      '### Missing Error Handlers',
      '- Flows with **no Try/Catch blocks** — any action failure crashes the entire flow',
      '- Flows where Try blocks exist but Catch blocks are empty (swallowed errors)',
      '- Flows with error handling that only logs but takes no corrective action',
      '- Subflows without error outputs — parent flow cannot detect failure',
      '',
      '### Missing Rollback Logic',
      '- Flows that create/update multiple records but have no rollback on partial failure',
      '- Example: Flow creates a record in table A, then tries to create in table B. If B fails,',
      '  the record in A is orphaned. The Catch block should clean up A.',
      '- Flows that call external APIs without handling non-2xx responses',
      '',
      '### Unhandled Error Paths',
      '- If/Else branches where only the "If" path has actions (missing Else handling)',
      '- Decision tables with no default/fallback branch',
      '- Flows that call subflows without checking the subflow\'s return status',
      '',
      '### Error Notification Gaps',
      '- Flows that fail silently — no email notification, no event, no log entry',
      '- Flows that should alert admins on failure but have no notification action in Catch',
      '',
      '**Output per finding:**',
      '| Flow Name | Issue Type | Severity | Details | Recommendation |',
      '|-----------|------------|----------|---------|----------------|',
    ];

    // ─── Section 3: Performance ──────────────────────────────────────────────

    const performanceSection = [
      '## 3. Performance Analysis',
      '',
      'Use `get_flow`, `list_flow_executions`, `get_flow_execution`, and `query_records` to analyze:',
      '',
      '### Action Count Bloat',
      '- Flows with more than **20 actions** — Flow Designer has a practical limit of ~100 actions',
      '  but performance degrades well before that. Recommend breaking into subflows.',
      '- Subflows with more than **15 actions** — should be further decomposed',
      '- Flows with deeply nested subflow calls (depth > 3 levels, max platform limit is 500)',
      '',
      '### Loop Performance',
      '- **For Each loops** iterating over unbounded record sets — must have `setLimit()` or a',
      '  reasonable filter to prevent processing millions of records',
      '- Nested loops (loop inside a loop) — O(n^2) complexity, major performance risk',
      '- Loops containing GlideRecord queries — each iteration fires a separate query (N+1 pattern)',
      '- Loops with Update Record actions — each iteration is a separate database write',
      '',
      '### Query Performance',
      '- Flows using **Look Up Records** without filters or with very broad filters',
      '- Flows querying large tables (task, sys_audit, syslog) without date or scope filters',
      '- Multiple sequential Look Up Records actions that could be combined into one query',
      '- Flows using dot-walked fields extensively — each dot-walk is an additional query',
      '',
      '### Execution Duration',
      '- Flows with average execution time > 30 seconds (should be async)',
      '- Flows with average execution time > 5 minutes (investigate bottleneck)',
      '- Flows with high variance in execution time (sometimes fast, sometimes slow)',
      '',
      '### Resource Consumption',
      '- Flows triggered on high-frequency tables (sys_audit, syslog) — can overwhelm the system',
      '- Flows with record-based triggers that fire on every update (no condition filter)',
      '- Multiple flows triggered on the same table+operation — cumulative impact',
      '',
      '**Output per finding:**',
      '| Flow Name | Metric | Value | Threshold | Severity | Recommendation |',
      '|-----------|--------|-------|-----------|----------|----------------|',
    ];

    // ─── Section 4: Dead Paths ───────────────────────────────────────────────

    const deadPathSection = [
      '## 4. Dead Path Detection',
      '',
      'Analyze flow logic for unreachable or redundant paths:',
      '',
      '### Unreachable Conditions',
      '- If/Else branches where the condition is always true or always false',
      '  (e.g., checking `current.state == "resolved"` in a flow triggered only on insert)',
      '- Decision tables where a row\'s condition is a subset of a previous row\'s condition',
      '  (the later row is never reached due to first-match semantics)',
      '- Conditions that reference fields not present on the trigger table',
      '',
      '### Redundant Actions',
      '- Actions that set a field value, followed by another action that overwrites the same field',
      '- Look Up Records actions whose results are never used by subsequent actions',
      '- Log actions left from debugging that serve no production purpose',
      '',
      '### Orphaned Branches',
      '- If/Else structures where one branch has no actions (empty branch)',
      '- Parallel branches where one branch always completes instantly (no-op)',
      '- Flow stages with no actions between them',
      '',
      '### Inactive Elements',
      '- Actions within a flow that are individually disabled/inactive',
      '- Subflow calls where the target subflow is inactive',
      '- Trigger conditions that can never match (contradictory filters)',
      '',
      '**Output per finding:**',
      '| Flow Name | Dead Path Type | Location | Evidence | Recommendation |',
      '|-----------|---------------|----------|----------|----------------|',
    ];

    // ─── Section 5: Async Issues ─────────────────────────────────────────────

    const asyncSection = [
      '## 5. Async Issues',
      '',
      'Analyze synchronous vs. asynchronous execution patterns:',
      '',
      '### Should Be Async But Is Not',
      '- Flows with **REST/SOAP callouts** running synchronously — external API latency blocks the user',
      '- Flows with **email/notification** actions running synchronously — SMTP delays affect response time',
      '- Flows with **heavy GlideRecord operations** (updating 100+ records) running synchronously',
      '- Flows triggered by user actions (form submit) that take > 5 seconds to complete',
      '',
      '### Should Be Sync But Is Async',
      '- Flows that set field values on the triggering record but run asynchronously — the values',
      '  will not be available when the record is saved (race condition)',
      '- Flows that validate data and should abort the transaction but run async (validation is skipped)',
      '- Flows that must complete before downstream processes depend on their output',
      '',
      '### Async Ordering Issues',
      '- Multiple async flows on the same table — execution order is not guaranteed',
      '- Async flows that depend on each other\'s output but have no sequencing mechanism',
      '- Async flows competing for the same record (concurrent update conflicts)',
      '',
      '### Wait/Timer Misuse',
      '- Flows using Wait For Condition with no timeout — can wait indefinitely',
      '- Timer triggers with intervals < 1 minute (excessive system load)',
      '- Flows combining timers with record queries in a polling pattern (use events instead)',
      '',
      '**Output per finding:**',
      '| Flow Name | Async Issue | Current Mode | Recommended Mode | Impact | Recommendation |',
      '|-----------|-------------|--------------|------------------|--------|----------------|',
    ];

    // ─── Section 6: Security ─────────────────────────────────────────────────

    const securitySection = [
      '## 6. Security Review',
      '',
      'Analyze flows for security risks:',
      '',
      '### Missing Role Checks',
      '- Flows triggered by record changes on sensitive tables (sys_user, sys_user_has_role,',
      '  sys_security_acl) without verifying the actor\'s role',
      '- Flows that modify security-related tables (ACLs, roles, users) without admin checks',
      '- Flows invocable via REST trigger without authentication requirements',
      '',
      '### Data Exposure',
      '- Notification actions in flows that include sensitive fields in email body (password,',
      '  SSN, salary, credit card, API keys)',
      '- Flows that log sensitive data via Log actions (visible in flow execution history)',
      '- Flows that pass sensitive data to external systems without encryption',
      '',
      '### Privilege Escalation',
      '- Flows running as "System" that could be exploited to perform admin-level operations',
      '  triggered by non-admin users',
      '- Subflows with elevated privileges called from flows with lower privilege requirements',
      '- Flows that create or modify user roles, group memberships, or ACLs',
      '',
      '### Script Actions in Flows',
      '- Inline Script steps with `eval()`, `GlideEvaluator`, or `Packages.java.*`',
      '- Script steps with hardcoded credentials or sys_ids',
      '- Script steps using `setWorkflow(false)` to bypass other business rules',
      '',
      '**Output per finding:**',
      '| Flow Name | Security Issue | Severity | Evidence | Risk | Recommendation |',
      '|-----------|---------------|----------|----------|------|----------------|',
    ];

    // ─── Section 7: Best Practices ───────────────────────────────────────────

    const bestPracticesSection = [
      '## 7. Best Practices Audit',
      '',
      '### Naming Conventions',
      '- Flows without a clear naming pattern — recommend: `[Scope] - [Table] - [Trigger] - [Purpose]`',
      '  (e.g., `ITSM - Incident - Before Save - Set Priority`)',
      '- Subflows without the "Subflow" or "SF" prefix/suffix for easy identification',
      '- Actions with generic names like "Script Step 1", "Do Something"',
      '',
      '### Documentation',
      '- Flows without descriptions — the description field should explain the business purpose',
      '- Flows with undocumented inline scripts (no comments explaining logic)',
      '- Complex decision logic without comments on what each branch handles',
      '',
      '### Version Control',
      '- Flows not captured in an update set or source control',
      '- Flows with many versions but no clear changelog',
      '- Flows modified directly in production without a change record',
      '',
      '### Subflow Reuse',
      '- Repeated action sequences (3+ identical actions) that should be extracted into subflows',
      '- Flows duplicating logic that already exists in a subflow',
      '- Subflows that are too specific — contain hardcoded values instead of accepting inputs',
      '',
      '### Trigger Hygiene',
      '- Flows with overly broad triggers (e.g., "on update" with no condition — fires on EVERY update)',
      '- Flows with conditions that should use "Run Trigger Once" to prevent re-firing',
      '- Multiple flows with the same trigger and condition (candidates for merging)',
      '',
      '**Output per finding:**',
      '| Flow Name | Best Practice Violation | Category | Recommendation |',
      '|-----------|------------------------|----------|----------------|',
    ];

    // ─── Section 8: Execution History ────────────────────────────────────────

    const executionSection = [
      '## 8. Execution History Analysis',
      '',
      'Use `list_flow_executions`, `get_flow_execution`, and `get_flow_error_log` to analyze:',
      '',
      '### Failure Rates',
      '- Flows with failure rate > 5% over the last 30 days — investigate root cause',
      '- Flows with failure rate > 25% — likely broken, should be disabled pending fix',
      '- Flows that started failing recently (new failures in last 7 days)',
      '- Subflows that are a common failure point across multiple parent flows',
      '',
      '### Duration Analysis',
      '- Average, median, and P95 execution time per flow',
      '- Flows where execution time has increased > 50% over the last 30 days (degrading)',
      '- Flows that frequently hit the platform timeout (300 seconds for sync, 900 for async)',
      '',
      '### Resource Consumption',
      '- Flows with the highest execution counts (top 10 most-executed)',
      '- Total flow execution volume per day — are we approaching platform limits?',
      '- Flows consuming the most total execution time (count * average duration)',
      '',
      '### Error Patterns',
      '- Most common error messages across all flows',
      '- Errors correlated with time of day (batch processing conflicts)',
      '- Errors correlated with specific users or integrations',
      '',
      '**Output:**',
      '| Flow Name | Executions (30d) | Failures (30d) | Failure Rate | Avg Duration | P95 Duration | Trend |',
      '|-----------|------------------|----------------|--------------|--------------|--------------|-------|',
    ];

    // ─── Build sections based on focus ───────────────────────────────────────

    let sections: string[][];
    switch (focus) {
      case 'errors':
        sections = [inventorySection, errorSection, deadPathSection, executionSection];
        break;
      case 'performance':
        sections = [inventorySection, performanceSection, asyncSection, executionSection];
        break;
      case 'security':
        sections = [inventorySection, securitySection];
        break;
      default:
        sections = [
          inventorySection,
          errorSection,
          performanceSection,
          deadPathSection,
          asyncSection,
          securitySection,
          bestPracticesSection,
          executionSection,
        ];
    }

    // ─── Report Format ───────────────────────────────────────────────────────

    const reportFormat = [
      '## Flow Audit Report Format',
      '',
      'Compile ALL findings into this structure:',
      '',
      '```',
      'FLOW DESIGNER AUDIT REPORT',
      '==========================',
      `Scope: ${scopeLabel}`,
      `Focus: ${focusDescription}`,
      'Date: [current date]',
      '',
      'EXECUTIVE SUMMARY',
      '- Total flows audited: X',
      '- Total subflows audited: X',
      '- Critical findings: X',
      '- High findings: X',
      '- Medium findings: X',
      '- Low findings: X',
      '- Overall health: [Healthy / Needs Attention / Critical]',
      '',
      'DETAILED FINDINGS',
      '-----------------',
      'Each finding MUST include:',
      '  Finding ID:      FLOW-XXXX',
      '  Severity:        Critical / High / Medium / Low',
      '  Category:        Error Handling / Performance / Dead Path / Async / Security / Best Practice',
      '  Flow:            [name] (sys_id)',
      '  Details:         [specific issue found]',
      '  Evidence:        [action name, execution log, or configuration detail]',
      '  Impact:          [what happens if ignored]',
      '  Recommendation:  [specific fix]',
      '',
      'SEVERITY DEFINITIONS',
      '  CRITICAL — Flow failure causes data loss or business process outage',
      '  HIGH     — Flow has errors/performance issues affecting users',
      '  MEDIUM   — Flow works but violates best practices or has hidden risks',
      '  LOW      — Cosmetic or hygiene issue; address during next maintenance',
      '```',
    ];

    return [
      {
        role: 'assistant' as const,
        content: {
          type: 'text' as const,
          text: [
            '# Capability: Flow Designer Audit',
            '',
            `**Scope:** ${scopeLabel}`,
            `**Focus:** ${focusDescription}`,
            '',
            'This capability performs a comprehensive audit of Flow Designer flows and subflows.',
            'I analyze flow structure, error handling, performance characteristics, execution history,',
            'and adherence to best practices. The audit covers both Flow Designer (sys_hub_flow) and',
            'legacy Workflow Editor (wf_workflow) artifacts.',
            '',
            '**Platform Knowledge:**',
            '- Flow Designer execution limit: ~100 actions per flow, 500 subflow call depth',
            '- Flows execute AFTER business rules in the save pipeline',
            '- Synchronous flows block the user transaction; async flows run in the background',
            '- Flow Designer replaced Workflow Editor starting in Madrid; legacy workflows should be migrated',
            '- Subflows can be reused across flows but add execution overhead per invocation',
            '- Flow execution history is stored in `sys_flow_context` and `sys_hub_action_execution`',
            '',
            ...sections.flatMap(s => [...s, '']),
            ...reportFormat,
            '',
            '---',
            '',
            'Beginning flow audit. Every finding must include its Finding ID, severity,',
            'category, concrete evidence, and a specific recommendation.',
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
            scope === 'all'
              ? `Run a comprehensive Flow Designer audit across the entire instance. Focus: ${focus}. Analyze every flow and subflow and give me a structured report with severity ratings.`
              : `Run a Flow Designer audit for scope \`${scope}\`. Focus: ${focus}. Analyze every flow and subflow in this scope and give me a structured report with severity ratings.`,
        },
      },
    ];
  },
};

export default capability;

import type { CapabilityDefinition } from '../types.js';

const capability: CapabilityDefinition = {
  name: 'scan-instance',
  title: 'Instance Scan Report',
  description:
    'Instance Scan report: latest results and findings by category, priority, check, table and app, trend against the previous run, AI and agent check coverage, remediation, and an optional fresh scan',
  category: 'scan',

  arguments: [
    {
      name: 'scope',
      description:
        'Categories to report: "all" (default), or a comma list of security, performance, upgradability, manageability, user_experience',
      required: false,
    },
    {
      name: 'result',
      description: 'Report on one scan result (sys_id, SR number or CI/CD progress id) instead of the latest run of every saved scan',
      required: false,
    },
    {
      name: 'run_scan',
      description:
        'Run a scan first: "full", "suite:<name or sys_id>", "combo:<sys_id>", "point:<table>:<sys_id>", "apps:<suite>:<scope ids>" or "update-sets:<suite>:<ids>"',
      required: false,
    },
  ],

  recommendedTools: [
    'run_instance_scan',
    'get_instance_scan_summary',
    'get_instance_scan_findings',
    'list_scan_suites',
    'get_job',
  ],

  buildPrompt(args) {
    const scope = args?.scope && args.scope !== 'all' ? args.scope : 'all categories';
    const runScan = args?.run_scan;
    const result = args?.result;

    const gather = [
      '## 1. Gather the scan data',
      '',
      runScan
        ? `A fresh scan was requested (\`${runScan}\`). Start it with \`run_instance_scan\` using \`async: true\`, follow the job with \`get_job\` until it finishes, then use its scan result for the rest of the report. If the scan fails or cannot start, say so plainly and report on the latest existing results instead.`
        : 'Do not start a scan. Report on the results that already exist.',
      '',
      result
        ? `Call \`get_instance_scan_summary\` with \`result: "${result}"\`.`
        : 'Call `get_instance_scan_summary` (no result argument) to get the latest and previous run of every saved scan.',
      ...(scope !== 'all categories' ? [`Limit the analysis to these categories: ${scope}.`] : []),
      'Use `get_instance_scan_findings` (filter by result, check, category, priority or table) when you need more records for a check, and `list_scan_suites` to name the suites that exist.',
      '',
      'In direct mode the data below already holds these sections: `instance_scan_runs`, `instance_scan_analysed_results`, `instance_scan_findings_by_category_and_priority`, `instance_scan_top_checks_*`, `instance_scan_trend_resolved_checks`, `instance_scan_by_table_and_app`, `instance_scan_inventory`, `instance_scan_ai_agent_coverage`, `instance_scan_sample_findings` and, when a scan was run, `instance_scan_fresh_run`.',
    ];

    const analysis = [
      '## 2. Analyse',
      '',
      '- **Scan coverage.** Which saved scans (suites) ran, when, how often in the last 30 days, and whether any failed. Note suites that exist but never run, and say if no full scan has run recently.',
      '- **Scores.** Quote the overall and per-category scores from `scan_score` for the latest run and the previous one.',
      '- **Findings by category and priority.** Use the grouped counts. Priority 1 is critical, 2 high, 3 moderate, 4 low.',
      '- **Top checks.** For each of the most important checks give the finding count, the trend against the previous run (new, worse, better, same) and the affected tables.',
      '- **Trend.** Call out checks that are new since the previous run, and checks that are now resolved. Say clearly when there is no previous run to compare with.',
      '- **Where the findings sit.** Use the table and application groupings to say which areas carry most of the debt.',
      '- **AI and agent checks.** Report how many checks cover Now Assist, AI agents, Virtual Agent or generative AI, whether any of them raised findings, and how that compares with the number of AI agents and Now Assist skills on the instance. If no check covers them, say so and recommend a custom suite or AI Control Tower review rather than inventing findings.',
      '- **Muted findings and mute rules.** Mention them if they are present, as they hide risk.',
    ];

    const remediation = [
      '## 3. Remediation',
      '',
      'For each top check, turn the check\'s own resolution details (and documentation link, when present) into a concrete fix: what to change, where, who usually owns it, and the effort (small, medium, large). Group the fixes into:',
      '',
      '1. Fix now: priority 1 and 2 security findings, and anything new since the previous run.',
      '2. Plan: performance and upgradability findings that affect upgrades or user experience.',
      '3. Housekeeping: manageability and low-priority items.',
      '',
      'Where a check flags many records of the same kind, recommend one systematic fix rather than a long list. Where a finding looks like a false positive, say how to confirm it and suggest a mute rule with a reason, not deletion.',
    ];

    const format = [
      '## Report format',
      '',
      '```',
      'INSTANCE SCAN REPORT',
      '====================',
      'Instance: [name]  |  Release: [from inventory or properties if known]  |  Categories: [scope]',
      '',
      'SUMMARY',
      '- Scans analysed, latest run date, overall score and change since the previous run',
      '- Findings: total, by priority, new and resolved',
      '- Three most important actions',
      '',
      'SCAN COVERAGE        table of saved scans: suite, latest run, findings, change, runs in 30 days',
      'FINDINGS BY CATEGORY table: category, findings, checks, previous findings',
      'TOP CHECKS           table: check, category, priority, findings, trend, main tables',
      'AI AND AGENT CHECKS  what is covered and what is not',
      'REMEDIATION PLAN     fix now / plan / housekeeping, each with owner and effort',
      'APPENDIX             sample findings with table and record',
      '```',
      '',
      'Write in plain British English, use sentence-case headings, and quote only numbers that appear in the data. Never invent findings, scores or checks.',
    ];

    return [
      {
        role: 'assistant' as const,
        content: {
          type: 'text' as const,
          text: [
            '# Capability: Instance Scan report',
            '',
            `**Categories:** ${scope}${result ? `  |  **Result:** ${result}` : ''}${runScan ? `  |  **Fresh scan:** ${runScan}` : ''}`,
            '',
            'This capability reads ServiceNow Instance Scan results (scan_result, scan_finding, scan_check, scan_score) and turns them into a prioritised, evidence-based report.',
            '',
            ...gather,
            '',
            ...analysis,
            '',
            ...remediation,
            '',
            ...format,
            '',
            '---',
            '',
            'After presenting your analysis, offer to generate a branded PDF or PPTX report by calling the `generate_report` tool with your full analysis.',
          ].join('\n'),
        },
      },
      {
        role: 'user' as const,
        content: {
          type: 'text' as const,
          text: runScan
            ? `Run the Instance Scan "${runScan}" on my ServiceNow instance, then give me the Instance Scan report for ${scope}.`
            : `Give me the Instance Scan report for my ServiceNow instance, covering ${scope}.`,
        },
      },
    ];
  },
};

export default capability;

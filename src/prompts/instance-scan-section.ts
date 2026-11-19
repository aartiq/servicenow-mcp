/**
 * Shared prompt section that folds ServiceNow Instance Scan findings into the scan-* capabilities.
 * Direct mode gathers the data (sections named instance_scan_*); in MCP mode the model calls the tools.
 */
export function instanceScanSection(categories: string[], focus: string[]): string[] {
  const cats = categories.join(', ');
  return [
    '## Instance Scan findings',
    '',
    `ServiceNow's own Instance Scan checks already flag many of these issues. Call \`get_instance_scan_summary\` with \`categories: "${cats}"\` (or \`get_instance_scan_findings\` filtered by category) and use the results as evidence alongside your own checks. In direct mode this data is in the \`instance_scan_*\` sections.`,
    '',
    ...focus.map((f) => `- ${f}`),
    '- Quote the scan result number and run date you rely on, and the finding count per check. Give the trend against the previous run where the data has one.',
    '- Use each check\'s resolution details as the starting point for the recommendation, and avoid listing the same issue twice when your own analysis and a scan check find it.',
    '- If no saved scan covers these categories, or the latest run is old, say so and recommend running the relevant suite (for example with the scan-instance skill and `--run-scan`).',
    '',
    '**Output:** Instance Scan evidence table: check, category, priority, findings, trend, recommendation',
  ];
}

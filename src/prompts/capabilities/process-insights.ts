import type { CapabilityDefinition } from '../types.js';
import { assessmentPrompt } from '../skill-template.js';

const capability: CapabilityDefinition = {
  name: 'process-insights',
  title: 'Process Insights',
  description:
    'Process improvement report from Process Mining (Process Intelligence) projects and findings plus task reassignment, reopen and volume data: top bottlenecks with evidence, automation candidates and a plan',
  category: 'ops',
  arguments: [
    { name: 'table', description: 'Task table to profile (default incident)', required: false },
    { name: 'project', description: 'One Process Mining project (number, name or sys_id)', required: false },
  ],
  recommendedTools: ['list_process_mining_projects', 'get_process_mining_findings', 'run_aggregate_query', 'query_records'],
  buildPrompt(args) {
    const table = args?.table || 'incident';
    return assessmentPrompt({
      title: 'Process insights',
      context: [`**Table:** ${table}${args?.project ? `  |  **Project:** ${args.project}` : ''}`],
      purpose: 'This report turns Process Mining results and task data into a short, evidence-based improvement plan for a process owner or continual improvement manager.',
      gather: [
        '`list_process_mining_projects` for the projects, whether each has been mined, and their finding counts.',
        '`get_process_mining_findings` for automated findings (rework, ping-pong, extra steps, extreme durations) with the KPIs they affect.',
        `\`run_aggregate_query\` on \`${table}\` for the last 90 days: average reassignment and reopen count by assignment group, volume by category and the state mix.`,
        `\`query_records\` on \`${table}\` for the most reassigned records (reassignment_count >= 3).`,
      ],
      directSections: ['process_mining_projects', 'process_mining_findings', 'reassignment_by_group_90d', 'volume_by_category_90d', 'state_mix_90d', 'most_reassigned'],
      analyse: [
        'Which projects were never mined or are templates only. Say plainly when Process Mining has no mined results, and base the bottlenecks on the task data instead.',
        'The top five bottlenecks: groups with the highest average reassignment or reopen counts and enough volume to matter, and the automated findings that point at the same steps.',
        'Automation candidates: categories with high volume and repeated hand-offs.',
        'For each bottleneck, the evidence (numbers and record links) and the expected effect of fixing it, in words, without invented percentages.',
      ],
      scoring: [
        'Flow efficiency 40 points (reassignment and reopen against volume), Process Mining adoption 30 (projects mined, findings reviewed), data quality for mining 30 (category and assignment group filled in).',
      ],
      sections: ['Executive summary with the score', 'Process Mining status', 'Top five bottlenecks', 'Automation candidates', 'Findings register', 'Improvement plan (30, 60, 90 days)', 'Data coverage'],
      ask: `Give me a process insights report for ${table} on my ServiceNow instance.`,
    });
  },
};

export default capability;

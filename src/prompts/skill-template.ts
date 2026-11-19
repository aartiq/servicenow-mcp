/**
 * Shared prompt shape for the assessment-style Apex skills: what to gather, what to analyse, the
 * report layout and the score. The data plans in src/direct/data-plans.ts gather the same data in
 * direct mode; in MCP mode the model calls the listed tools itself.
 */
import type { AgentMessage } from './types.js';

export interface AssessmentPromptSpec {
  title: string;
  /** One paragraph: what this assessment answers and for whom. */
  purpose: string;
  /** Tool calls to make in MCP mode, in order, each with why. */
  gather: string[];
  /** Direct-mode section names the data arrives under. */
  directSections: string[];
  /** What to check, as short bullet lines. */
  analyse: string[];
  /** How the 0 to 100 score is worked out. */
  scoring: string[];
  /** Report sections in order. */
  sections: string[];
  /** The user's ask. */
  ask: string;
  /** Extra context lines shown under the title (arguments in use). */
  context?: string[];
}

export function assessmentPrompt(spec: AssessmentPromptSpec): AgentMessage[] {
  const text = [
    `# Capability: ${spec.title}`,
    '',
    ...(spec.context?.length ? [...spec.context, ''] : []),
    spec.purpose,
    '',
    '## 1. Gather the data (read-only)',
    '',
    ...spec.gather.map((g, i) => `${i + 1}. ${g}`),
    '',
    `In direct mode the data below already holds these sections: ${spec.directSections.map((s) => `\`${s}\``).join(', ')}, plus \`data_coverage\`, which lists anything that could not be gathered and why.`,
    '',
    '## 2. Analyse',
    '',
    ...spec.analyse.map((a) => `- ${a}`),
    '',
    '## 3. Score',
    '',
    'Give one overall score from 0 to 100 on its own line as `Score: NN/100`, then one line per area as `Area score: <area> NN/100`. Work the score out from the data like this:',
    ...spec.scoring.map((s) => `- ${s}`),
    'Lower the score only for problems the data shows. When a section could not be gathered, say so and leave that area unscored rather than guessing.',
    '',
    '## 4. Report',
    '',
    'Use these sections, in this order, with sentence-case headings:',
    ...spec.sections.map((s, i) => `${i + 1}. ${s}`),
    '',
    'Number each finding with a stable ID made from the area and a number, for example `[HIGH] AIG-03 Agents with no execute ACL - ...`, and keep the same ID for the same check across runs. Give each finding an effort line (`Effort: S (under a day), M (1 to 3 days) or L (more than 3 days)`) after its Recommendation line.',
    '',
    'Write in plain British English. Quote only numbers that appear in the data. Never invent records, links, scores or counts.',
    '',
    'After presenting your analysis, offer to generate a branded PDF or PPTX report by calling the `generate_report` tool with your full analysis.',
  ].join('\n');
  return [
    { role: 'assistant', content: { type: 'text', text } },
    { role: 'user', content: { type: 'text', text: spec.ask } },
  ];
}

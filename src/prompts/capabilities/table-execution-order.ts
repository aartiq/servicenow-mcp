import type { CapabilityDefinition } from '../types.js';
import { assessmentPrompt } from '../skill-template.js';

const capability: CapabilityDefinition = {
  name: 'table-execution-order',
  title: 'What Runs When',
  description:
    'Everything that fires for one table operation, in order: Deny Unless and Allow If ACLs, data policies, before business rules, the write, after rules, engines, notifications, async rules, flows and legacy workflows, with a Mermaid diagram and the risks',
  category: 'review',
  arguments: [
    { name: 'table', description: 'Table to trace (default incident)', required: false },
    { name: 'operation', description: 'insert, update, delete or query (default: update, plus insert)', required: false },
  ],
  recommendedTools: ['trace_table_operation', 'list_business_rules', 'get_business_rule', 'list_flows'],
  buildPrompt(args) {
    const table = args?.table || 'incident';
    const op = args?.operation || 'update';
    return assessmentPrompt({
      title: 'What runs when',
      context: [`**Table:** ${table}  |  **Operation:** ${op}`],
      purpose: 'This report explains, in run order, every piece of server-side logic that fires when a record is written or read, so developers and admins can debug side effects and see conflicts before changing anything.',
      gather: [
        `\`trace_table_operation\` with table \`${table}\` and operation \`${op}\` (and insert as well when no operation is given). It returns ordered steps with links and a Mermaid diagram, including rules inherited from parent tables.`,
        '`get_business_rule` for any rule whose behaviour you need to explain in detail.',
        'Business rules grouped by when and order, to spot rules sharing the same order.',
      ],
      directSections: ['trace', 'trace_insert', 'same_order_collisions'],
      analyse: [
        'Walk through the stages in order and say in one line what each group does.',
        'Same-order collisions: two or more rules with the same when and order, whose relative order ServiceNow does not guarantee.',
        'Rules inherited from parent tables (for example task) that people often forget.',
        'Async work and flows that run after the transaction, and which of them update the same record again.',
        'Deny Unless ACLs that will block the operation unless their roles or conditions pass.',
      ],
      scoring: [
        'Predictability 50 points (no same-order collisions, few unconditioned rules), performance 30 (count of synchronous before and after rules), maintainability 20 (inactive or duplicated logic).',
      ],
      sections: ['Summary with the score', 'Mermaid diagram (copy the diagram from the data inside a mermaid code block)', 'Step by step, in order, with links', 'Risks and collisions', 'Findings register', 'Recommendations', 'Data coverage'],
      ask: `Explain everything that runs when a ${table} record is ${op === 'query' ? 'queried' : `${op}d`} on my ServiceNow instance.`,
    });
  },
};

export default capability;

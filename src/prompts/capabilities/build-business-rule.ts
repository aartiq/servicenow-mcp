import type { CapabilityDefinition } from '../types.js';

const capability: CapabilityDefinition = {
  name: 'build-business-rule',
  title: 'Build Business Rule',
  description:
    'Guided business rule creation — understand requirement, check existing rules, generate, review, create, and test',
  category: 'build',
  arguments: [
    {
      name: 'description',
      description: 'what the business rule should do in plain language',
      required: true,
    },
    {
      name: 'table',
      description: 'target table e.g. incident, change_request',
      required: true,
    },
    {
      name: 'when',
      description: 'before, after, async, display. Default: before',
      required: false,
    },
  ],
  recommendedTools: [
    'create_business_rule',
    'list_business_rules',
    'get_business_rule',
    'get_table_schema',
    'create_script_include',
    'query_records',
  ],
  buildPrompt(args = {}) {
    const desc = args.description ?? '<not provided>';
    const table = args.table ?? '<not provided>';
    const when = args.when ?? 'before';

    return [
      {
        role: 'user',
        content: {
          type: 'text',
          text: [
            `Build a business rule for the **${table}** table.`,
            `**When:** ${when}`,
            `**Requirement:** ${desc}`,
            '',
            'Follow these steps exactly:',
            '',
            '### Step 1 — Understand the Requirement',
            `Restate the requirement in your own words. Identify the trigger event (insert, update, delete, query), the "when" timing (${when}), and any conditions that should gate execution. Call out ambiguities and ask for clarification if needed.`,
            '',
            '### Step 2 — Check Existing Rules on the Table',
            `Use **list_business_rules** filtered to table="${table}" to retrieve all active business rules. Summarize them in a table (name, when, order, description). Flag any that overlap with or could conflict with the new requirement. If a conflict exists, recommend a resolution strategy (modify existing vs. create new, adjust execution order).`,
            '',
            '### Step 3 — Check Table Schema',
            `Use **get_table_schema** for "${table}". Verify every field name referenced in the requirement actually exists. List field types and max lengths for fields the script will read or write. If a referenced field does not exist, stop and report the issue.`,
            '',
            '### Step 4 — Generate the Script',
            'Write the business rule script applying these patterns:',
            '- **Recursion guard** (after rules): wrap in `if (current.update()) { ... }` is NOT enough — use `current.autoSysFields(false)` or a scratchpad flag (`gs.getSession().getClientData(...)`) to prevent infinite loops.',
            '- **Abort action** (before rules for validation): use `current.setAbortAction(true)` and `gs.addErrorMessage(...)` for user-facing validation.',
            '- **Async** for heavy work: if the logic involves web-service callouts, large queries, or email sends, recommend an async business rule or an event + Script Include pattern.',
            '- Use `gs.log()` / `gs.debug()` for troubleshooting, never `gs.print()`.',
            '- Always scope field access with `current.getValue(\'field\')` / `current.setValue(\'field\', value)` for clarity.',
            '- Include JSDoc-style comment block at the top: purpose, author, date, related requirement.',
            '',
            '### Step 5 — Review for Security & Performance',
            'Audit the generated script:',
            '- No GlideRecord queries inside loops (N+1 anti-pattern).',
            '- No hardcoded sys_ids — use properties or sys_properties.',
            '- No `eval()` or dynamic script execution.',
            '- Validate that `gs.hasRole()` checks are present if the rule should be role-gated.',
            '- Confirm the execution order is appropriate relative to existing rules found in Step 2.',
            '',
            '### Step 6 — Create the Business Rule',
            `Use **create_business_rule** with the final script, table="${table}", when="${when}", and appropriate conditions. Report the sys_id and name of the created artifact.`,
            '',
            '### Step 7 — Suggest Test Scenarios',
            'Provide a test matrix:',
            '| # | Scenario | Setup | Expected Result |',
            '|---|----------|-------|-----------------|',
            'Include at minimum:',
            '- Happy-path insert/update that triggers the rule.',
            '- Edge case where condition is NOT met (rule should not fire).',
            '- Boundary / null-field scenario.',
            '- Role-based test if applicable.',
            '- Conflict test with the rules identified in Step 2.',
            '',
            'After presenting your analysis, offer to generate a branded PDF or PPTX report by calling the `generate_report` tool with your full analysis.',
          ].join('\n'),
        },
      },
    ];
  },
};

export default capability;

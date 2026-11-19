---
name: servicenow-what-runs-when
description: Explain everything that fires when a record on a ServiceNow table is inserted, updated, deleted or queried, in execution order, using NowAIKit MCP tools. Covers business rules, flows, ACLs and async work, with a Mermaid diagram. Use when the user asks what runs when a record is saved, why a field changes on its own, what fires on a table, or about execution order or side effects.
license: MIT
compatibility: Needs the NowAIKit MCP server (nowaikit 5.0 or later)
---

# ServiceNow what runs when

Show the full chain of logic for one table operation so the user can see order and side effects.

## Workflow

1. **Pin the operation.** Confirm the table and the operation: insert, update, delete or query. Ask if the user means a specific field change.
2. **Trace.** `trace_table_operation` with the table and operation. It returns ordered steps (ACLs, before rules, engines, after rules, async rules, flows) with record links and a Mermaid diagram.
3. **Show the diagram.** Put the Mermaid diagram in the answer as a fenced `mermaid` block, then explain the steps in order in plain words.
4. **Call out problems.**
   - Same-order collisions: two or more rules with the same order value, where run order is not guaranteed.
   - Async work: async business rules and flows run later, outside the user's transaction, so their effects appear after the save.
   - Rules that call current.update() or update other records, which can trigger further chains.
5. **Drill in when asked.** `get_business_rule` for a rule's script and condition, `get_flow` for a flow's trigger and steps, `list_acls` for the table's ACLs.

## Rules
- Read-only. Tracing does not change any record.
- Only describe steps the trace returns. If a step's condition is unclear, read it rather than guess.
- Treat an unknown instance as production.
- Link every rule, flow and ACL using the `record_url` the tools return. Never invent URLs.

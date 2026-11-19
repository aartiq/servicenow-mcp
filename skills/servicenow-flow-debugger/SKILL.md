---
name: servicenow-flow-debugger
description: Diagnose a failing, stuck or slow ServiceNow Flow Designer flow using NowAIKit MCP tools. Read executions, error logs and the flow definition, and find other logic firing on the same record. Use when the user says a flow failed, errored, did not trigger, is slow, ran twice, or asks to debug or troubleshoot a flow.
license: MIT
compatibility: Needs the NowAIKit MCP server (nowaikit 5.0 or later)
---

# ServiceNow flow debugger

Find the root cause of a flow problem from its executions and logs, then propose a fix.

## Workflow

1. **Identify the flow.** `list_flows` to find it by name, then `get_flow` for the trigger, conditions, steps and published state. An unpublished or inactive flow explains "did not trigger".
2. **Recent runs.** `list_flow_executions` for the flow. Look at state, duration and how often it fails. Pick a failing or slow run.
3. **Drill in.** `get_flow_execution` for step-by-step status and timing, then `get_flow_error_log` for the error messages and the step that threw them.
4. **Look around the record.** `trace_table_operation` on the trigger table and operation to see business rules, other flows and ACLs that fire on the same record. Duplicate runs, aborted updates and changed field values often come from here.
5. **Reproduce.** If the cause is still unclear and the instance is not production, run `test_flow` with a test record and compare the result.
6. **Fix.** Explain the root cause, the evidence, and the proposed change. Do not edit the flow without the user's go-ahead.

## Rules
- Read-only first. Executions, logs and traces never change anything.
- `test_flow` runs the flow for real: it needs `WRITE_ENABLED=true`, confirmation, and a non-production instance. Treat an unknown instance as production.
- Any change to the flow goes through an update set and a shown plan first.
- Link flows, executions and records using the `record_url` the tools return. Never invent URLs.

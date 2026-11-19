---
name: servicenow-change-risk-review
description: Review a ServiceNow change request before CAB using NowAIKit MCP tools. Check readiness, predicted risk, affected services and clashing changes, then give a go or no-go view. Use when the user asks to review a change, assess change risk, prepare for CAB, check if a change is ready, or find what a change could break.
license: MIT
compatibility: Needs the NowAIKit MCP server (nowaikit 5.0 or later)
---

# ServiceNow change risk review

Build a short, evidence-based risk view of a change so CAB can decide quickly.

## Workflow

1. **Load the change.** `get_change_request` for the record, then `change_readiness` for missing fields, approvals, test and backout plans, and schedule problems.
2. **Predict risk.** `ml_predict_change_risk` for the model's risk score and the factors behind it. Compare it with the risk the requester set and call out any mismatch.
3. **Blast radius.** For each affected CI, run `cmdb_services_for_ci` to find the business and application services that depend on it, and `cmdb_impact_analysis` to see upstream and downstream CIs.
4. **Clashes.** `list_change_requests` with an encoded query for changes on the same CIs or services in an overlapping window (for example `start_date<=<end>^end_date>=<start>`). Flag collisions and freeze periods.
5. **Verdict.** Summarise as ready, ready with conditions, or not ready. List each gap with the fix and who owns it.
6. **CAB (optional).** Only if the user asks, show the planned meeting details and then call `schedule_cab_meeting` after they confirm.

## Rules
- This is a read-only review. Do not update, approve or close the change.
- `schedule_cab_meeting` is a write: it needs `WRITE_ENABLED=true` and explicit confirmation first.
- Treat an unknown instance as production.
- Base the verdict on tool output, not assumptions. Say when data is missing (for example no CIs on the change).
- Link the change, CIs and services using the `record_url` the tools return. Never invent URLs.

---
name: servicenow-update-set-review
description: Review a ServiceNow update set before it is promoted, using NowAIKit MCP tools. Preview collisions, run instance scan checks on the changed records and inspect risky scripts. Use when the user asks to review an update set, check if an update set is safe to promote, look for preview problems, or do a code review before go-live.
license: MIT
compatibility: Needs the NowAIKit MCP server (nowaikit 5.0 or later)
---

# ServiceNow update set review

Give a clear promote or hold recommendation for one update set, with the evidence behind it.

## Workflow

1. **Find the set.** `list_update_sets` (filter by name or state) and confirm the exact set with the user. Confirm the instance with `get_current_instance`.
2. **Preview.** `preview_update_set` to list the records in the set and any collisions, missing dependencies or skipped updates. Each problem needs a decision before promotion.
3. **Scan.** `get_instance_scan_findings` for existing findings on the changed records. If needed, start a point scan with `run_instance_scan`; it runs async, so poll with `get_job` until it finishes, then read the findings again.
4. **Read the code.** For each business rule or script include in the set, read it with `get_business_rule` or `get_script_include`. Look for current.update() in before rules, unbounded GlideRecord queries, hard-coded sys_ids and missing scope checks.
5. **Check callers.** `find_script_references` on changed script includes and functions to see what else depends on them and might break.
6. **Report.** Promote or hold, with a table of issues (record, severity, why, suggested fix).

## Rules
- Review only. Do not complete, commit or edit the update set from this skill. Use servicenow-safe-deployment for promotion.
- Running a scan writes a scan result record: it needs `WRITE_ENABLED=true`. Say so before starting one.
- Treat an unknown instance as production.
- Link every record using the `record_url` the tools return. Never invent URLs.

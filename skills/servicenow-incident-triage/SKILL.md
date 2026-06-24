---
name: servicenow-incident-triage
description: Triage a ServiceNow incident or a queue of incidents using NowAIKit MCP tools — gather context, find similar past incidents, suggest a resolution, set priority, and assign. Use when the user asks to triage, investigate, prioritize, or work an incident (by number or as a batch).
---

# ServiceNow Incident Triage

Drive triage through the NowAIKit MCP tools. Discover tools with `search_tools` if a name is unknown.

## Workflow

1. **Scope.** If given an incident number, fetch it (`get_incident`). For a queue, `query_records` on `incident` with an encoded query (validate it first with `validate_query`), e.g. `active=true^assignment_group=<grp>^priority<=2`.
2. **Context.** Pull the caller, CI, and recent activity. For grounding, use `generate_summary` and `ml_similar_incidents` (or `ai_search`) to find prior resolutions.
3. **Classify.** Use `categorize_incident` / `ml_auto_categorize` to confirm category and `suggest_resolution` for a candidate fix.
4. **Act safely.** Propose field changes (priority, assignment_group, work notes) and apply with `update_record`. **Always run with `dry_run: true` first** and show the before→after diff before applying for real. Add context with `add_work_note`.
5. **Summarize.** Report what changed, the suggested resolution, and links to the similar incidents you used.

## Rules
- Never set priority/assignment without showing the dry-run diff first.
- Requires `WRITE_ENABLED=true` for any update; if disabled, output the proposed changes instead of applying.
- Encoded queries use `^` (AND) and `^OR` (OR), never SQL `AND`/`OR`. Validate with `validate_query`.
- Writes are recorded in the NowAIKit audit log automatically.

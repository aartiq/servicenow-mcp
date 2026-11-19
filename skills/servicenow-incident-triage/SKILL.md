---
name: servicenow-incident-triage
description: Triage a ServiceNow incident or a queue of incidents using NowAIKit MCP tools. Gather context, find similar past incidents, suggest a resolution, set priority, and assign. Use when the user asks to triage, investigate, prioritize, or work an incident (by number or as a batch).
---

# ServiceNow Incident Triage

Drive triage through the NowAIKit MCP tools. Discover tools with `search_tools` if a name is unknown.

## Workflow

1. **Scope.** If given an incident number, start with `investigate_incident`: one call returns the incident, similar recent incidents, the affected CI with its relationships and related knowledge articles. For a queue, `query_records` on `incident` with an encoded query (validate it first with `validate_query`), e.g. `active=true^assignment_group=<grp>^priority<=2`.
2. **Context.** For a readable summary of the record and its activity use `summarize_record` (table `incident`). For more prior resolutions use `ml_similar_incidents` or `ai_search`.
3. **Classify.** Use `categorize_incident` / `ml_auto_categorize` to confirm category. Base the candidate fix on the resolved similar incidents and knowledge articles from steps 1 and 2.
4. **Act safely.** Propose field changes (priority, assignment_group) and apply with `update_record` (or `update_incident`). **Always run `update_record` with `dry_run: true` first** and show the before and after diff before applying for real. Add context with `add_work_note`.
5. **Summarize.** Report what changed, the suggested resolution, and links to the similar incidents you used.

## Rules
- Never set priority or assignment without showing the dry-run diff first.
- Requires `WRITE_ENABLED=true` for any update; if disabled, output the proposed changes instead of applying.
- Encoded queries use `^` (AND) and `^OR` (OR), never SQL `AND`/`OR`. Validate with `validate_query`.
- Writes are recorded in the NowAIKit audit log automatically.

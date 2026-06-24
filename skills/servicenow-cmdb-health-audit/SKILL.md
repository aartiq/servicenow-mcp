---
name: servicenow-cmdb-health-audit
description: Audit ServiceNow CMDB health using NowAIKit MCP tools — find duplicate, orphaned, and stale CIs, score completeness, and propose remediation. Use when the user asks to check CMDB health, data quality, CSDM conformance, or clean up the CMDB.
---

# ServiceNow CMDB Health Audit

Use the NowAIKit CMDB tools to assess and remediate. Discover exact tool names with `search_tools` (e.g. "cmdb health", "find duplicates").

## Workflow

1. **Snapshot.** Run `cmdb_health_dashboard` for the overall score and class breakdown.
2. **Find issues in parallel:** `cmdb_find_duplicates`, `cmdb_find_orphans`, `cmdb_find_stale`, and `analyze_data_quality` / `check_table_completeness` for key classes (cmdb_ci_server, cmdb_ci_appl, business apps).
3. **Assess impact** before any change with `cmdb_impact_analysis` on candidate CIs.
4. **CSDM lens.** Check that Application Services, Business Applications, and Service Offerings exist and are related per CSDM 4.0; flag gaps.
5. **Remediate safely.** For merges/retirements/updates, call write tools with **`dry_run: true` first**, present the diff, then apply. Prefer `cmdb_reconcile` for authoritative-source conflicts.
6. **Report.** Counts by issue type, the health score delta you expect, and a prioritized remediation list (highest blast-radius first).

## Rules
- Never merge or retire a CI without showing impact analysis + dry-run diff.
- CMDB writes require `WRITE_ENABLED=true` and `CMDB_WRITE_ENABLED=true`.
- CI relationships must have both parent and child defined (CSDM).
- All writes are captured in the NowAIKit audit log.

---
name: servicenow-cmdb-health-audit
description: Audit ServiceNow CMDB health using NowAIKit MCP tools. Find duplicate, orphaned and stale CIs, score completeness and CSDM 5 conformance, and propose remediation. Use when the user asks to check CMDB health, data quality, CSDM conformance, Data Foundations scores, or to clean up or retire CIs.
license: MIT
compatibility: Needs the NowAIKit MCP server (nowaikit 5.0 or later)
---

# ServiceNow CMDB health audit

Use the NowAIKit CMDB tools to assess and remediate. Discover exact tool names with `search_tools` (for example "cmdb health" or "find duplicates").

## Workflow

1. **Snapshot.** Run `cmdb_health_dashboard` for the overall score and class breakdown. Add `get_cmdb_data_foundations` for ServiceNow's own Data Foundations scores, each with a link to the matching KB playbook.
2. **CSDM 5 lens.** Run `get_csdm_health` for scores per CSDM 5 domain. Check that Business Applications, Application Services and Service Offerings exist and are related, and flag the weakest domains.
3. **Find issues in parallel:** `cmdb_find_duplicates`, `cmdb_find_orphans`, `cmdb_find_stale` (pass `lifecycle_model` if the instance tracks CSDM life cycle stage rather than install_status), and `analyze_data_quality` / `check_table_completeness` for key classes (cmdb_ci_server, cmdb_ci_appl, business applications).
4. **Assess impact** before any change with `cmdb_impact_analysis` on candidate CIs.
5. **Remediate safely.** For merges, retirements and updates, call write tools with **`dry_run: true` first**, present the diff, then apply. Use `cmdb_reconcile` for authoritative-source conflicts and retirements. Its `retire_using` option is `install_status` by default, or `life_cycle` to set the CSDM life cycle stage to End of Life / Retired. Match whatever the instance already uses.
6. **Report.** Counts by issue type, CSDM 5 and Data Foundations scores, the health score change you expect, and a prioritised remediation list (highest blast radius first). Link every CI using the `record_url` the tools return.

## Rules
- Read-only first. Never merge or retire a CI without showing impact analysis and a dry-run diff.
- CMDB writes require `WRITE_ENABLED=true` and `CMDB_WRITE_ENABLED=true`.
- CI relationships must have both parent and child defined (CSDM).
- Treat an unknown instance as production.
- Link records with the `record_url` the tools return. Never build or guess URLs.
- All writes are captured in the NowAIKit audit log.

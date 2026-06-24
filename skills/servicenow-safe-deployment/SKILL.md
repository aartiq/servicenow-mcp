---
name: servicenow-safe-deployment
description: Safely build and deploy ServiceNow artifacts (business rules, scripts, flows, catalog items) across instances using NowAIKit MCP tools, with update sets, dry-run previews, and ATF verification. Use when the user asks to deploy, promote, build, or move changes between dev/test/prod.
---

# ServiceNow Safe Deployment

Orchestrate build → verify → promote through NowAIKit MCP tools. Use `search_tools` to find exact names (e.g. "update set", "run atf", "create business rule").

## Workflow

1. **Capture scope.** Ensure an active update set: `ensure_active_update_set` (or create one). Confirm the target instance with `get_current_instance` — never assume prod.
2. **Build.** Create artifacts (`create_business_rule`, `create_script_include`, `create_flow`, `create_catalog_item`, …). For raw table writes, preview with `dry_run: true` and show the payload/diff before applying.
3. **Verify.** Run ATF: `run_atf_suite` / `run_atf_test` and read results (`get_atf_suite_result`, `get_atf_failure_insight`). Do not promote on failures.
4. **Review the set.** `preview_update_set` and list changes; check for collisions.
5. **Promote.** Move to the next environment with `switch_instance`, then `commit_update_set` / deployment tools. **Confirm explicitly before any prod commit.**
6. **Report.** Artifacts created, ATF pass/fail, update set name, and the promotion path taken.

## Rules
- Scripting writes require `WRITE_ENABLED=true` + `SCRIPTING_ENABLED=true`; ATF needs `ATF_ENABLED=true`.
- Always dry-run writes and run ATF before promoting.
- Treat any instance that is not an explicit dev/test as production — stop and confirm.
- New development goes in scoped apps (`x_vendor_app`), never global.
- All writes are captured in the NowAIKit audit log.

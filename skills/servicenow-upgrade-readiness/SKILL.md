---
name: servicenow-upgrade-readiness
description: Check how ready a ServiceNow instance is for the next family release using NowAIKit MCP tools. Read the current release, known breaking changes with live counts, upgradability scan findings, legacy dashboards, ACLs with missing roles and Basic auth integrations. Use when the user asks about upgrade readiness, preparing for Brazil, what will break in the next release, or an upgrade checklist.
license: MIT
compatibility: Needs the NowAIKit MCP server (nowaikit 5.0 or later)
---

# ServiceNow upgrade readiness

Turn the known changes in the next family release into a checklist sized to this instance.

## Workflow

1. **Where are we.** `get_release_info` reads `glide.buildtag.last` to find the current family (for example Australia) and the next one (Brazil). It returns the known breaking changes with live counts from this instance and list links for each.
2. **Upgradability.** `get_instance_scan_findings` filtered to the upgradability category, for customisations that will be skipped or need review.
3. **Dashboards.** `get_dashboard_migration_status` for legacy Performance Analytics dashboards still to move to Platform Analytics.
4. **Access.** `get_acl_posture` for ACLs that reference roles that do not exist. In Brazil these deny everyone, so they are a priority fix (see servicenow-acl-auditor).
5. **Integrations.** `get_integration_auth_posture` for inbound and outbound integrations still on Basic auth, which the release restricts. List each with its owner and the move to OAuth or another supported method.
6. **Report.** A checklist grouped by area with counts, effort (small, medium, large) and order. Put items that block users or integrations first.

## Rules
- This skill is read-only. Do not fix anything from here; hand items to the matching skill or the user.
- Use the counts and links the tools return. Do not invent release notes or numbers.
- If the instance is already on the latest family, say so and report only the open findings.
- Treat an unknown instance as production.
- Link every record and list using the `record_url` or list link the tools return. Never invent URLs.

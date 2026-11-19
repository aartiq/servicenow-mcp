---
name: servicenow-acl-auditor
description: Audit ServiceNow access controls with NowAIKit MCP tools. Explain who can read, write, create or delete on a table, find deny-unless ACLs and ACLs that reference roles which no longer exist, and plan safe fixes. Use when the user asks who can access a table, why a user is blocked, to audit ACLs or security rules, or to check ACL readiness for an upgrade.
license: MIT
compatibility: Needs the NowAIKit MCP server (nowaikit 5.0 or later)
---

# ServiceNow ACL auditor

Answer "who can do what" on a table from the actual ACLs, and fix problems carefully.

## Workflow

1. **Posture.** `get_acl_posture` for an instance-wide view: ACLs with missing roles, deny-unless rules and other risky patterns.
2. **Table view.** `list_acls` for the table (and its fields). Use the `decision_type` filter to separate allow ACLs from deny-unless ACLs. Deny-unless rules are checked first and can block users that an allow rule would let in.
3. **Detail.** `get_acl` on each relevant ACL. Read `required_roles` and any `role_warning`, which flags roles that do not exist on the instance.
4. **Missing roles matter.** From the Brazil release, an ACL that references a role that does not exist denies everyone (property `glide.security.acl_with_invalid_roles_strict_deny`). List every such ACL as a priority fix.
5. **In context.** `trace_table_operation` with the table and operation shows ACLs alongside the business rules and flows that run, which helps explain "why can't this user save".
6. **Fix plan.** Show the planned change for each ACL (operation, `decision_type` allow or deny, roles, condition) before calling `create_acl` or `update_acl`. Roles must already exist.
7. **Report.** A table of who can do what, the issues found and the planned fixes.

## Rules
- Read-only first. Never change an ACL without showing the planned change and getting confirmation.
- ACL writes need `WRITE_ENABLED=true` and `SCRIPTING_ENABLED=true`, and the connecting account may also need an active security_admin role on the instance.
- Never create an ACL with a role that does not exist.
- Treat an unknown instance as production. Do ACL changes in an update set.
- Link every ACL using the `record_url` the tools return. Never invent URLs.

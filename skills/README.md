# NowAIKit agent skills

Cross-platform [Agent Skills](https://www.anthropic.com/news/skills) that orchestrate the NowAIKit MCP tools for common ServiceNow workflows. Each skill is a folder with a `SKILL.md` (YAML frontmatter `name` and `description` for progressive disclosure, then concise instructions).

They work with any agent runtime that supports the Agent Skills format (**Claude Code, Cursor, OpenAI Codex, GitHub Copilot, Windsurf**) alongside the NowAIKit MCP server (nowaikit 5.0 or later).

## Skills

| Skill | Use it when |
|-------|-------------|
| `servicenow-incident-triage` | Triage, investigate or prioritise an incident or a queue |
| `servicenow-cmdb-health-audit` | Check CMDB health, data quality, CSDM 5 conformance or Data Foundations scores, or clean up and retire CIs |
| `servicenow-safe-deployment` | Build and promote artifacts across instances with update sets and ATF |
| `servicenow-change-risk-review` | Assess a change before CAB: readiness, predicted risk, affected services and clashing changes |
| `servicenow-update-set-review` | Review an update set before promotion: preview problems, scan findings and risky scripts |
| `servicenow-flow-debugger` | Diagnose a failing, stuck or slow flow from its executions and error logs |
| `servicenow-acl-auditor` | Work out who can do what on a table, find deny-unless ACLs and ACLs with missing roles |
| `servicenow-ai-governance` | Inventory Otto (Now Assist) skills, AI agents, model providers, access and MCP exposure, and use the AI kill switch |
| `servicenow-upgrade-readiness` | Get ready for the next family release: breaking changes, upgradability findings, dashboards, ACLs and Basic auth |
| `servicenow-what-runs-when` | Explain every rule, flow and ACL that fires for one table operation, in order, with a diagram |
| `servicenow-atf-coverage` | Find scripts with no ATF coverage, run suites and explain failures |

## Install

**Claude Code:** copy a skill folder into `~/.claude/skills/` (global) or `.claude/skills/` (project), or point your skills path at this directory.

**Cursor / Codex / others:** add this folder to the agent's skills/rules path per that tool's docs.

## Safety

All skills assume the NowAIKit MCP server is connected. The tools work in read-only mode by default, and any write needs `WRITE_ENABLED=true` (plus `SCRIPTING_ENABLED`, `CMDB_WRITE_ENABLED` or `ATF_ENABLED` where relevant).

The skills lean on the safety features built into NowAIKit: `dry_run` previews, the write audit log and write guardrails. They never apply destructive changes without showing a dry run or a plan first, they treat an unknown instance as production, and they link records with the `record_url` the tools return rather than building URLs.

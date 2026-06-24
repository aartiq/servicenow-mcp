# NowAIKit Agent Skills

Cross-platform [Agent Skills](https://www.anthropic.com/news/skills) that orchestrate the NowAIKit MCP tools for common ServiceNow workflows. Each skill is a folder with a `SKILL.md` (YAML frontmatter `name` + `description` for progressive disclosure, then concise instructions).

They work with any agent runtime that supports the Agent Skills format — **Claude Code, Cursor, OpenAI Codex, GitHub Copilot, Windsurf** — alongside the NowAIKit MCP server.

## Skills

| Skill | Use it when |
|-------|-------------|
| `servicenow-incident-triage` | Triage/investigate/prioritize an incident or a queue |
| `servicenow-cmdb-health-audit` | Check CMDB health, data quality, CSDM conformance, or clean up CIs |
| `servicenow-safe-deployment` | Build and promote artifacts across instances with update sets + ATF |

## Install

**Claude Code:** copy a skill folder into `~/.claude/skills/` (global) or `.claude/skills/` (project), or point your skills path at this directory.

**Cursor / Codex / others:** add this folder to the agent's skills/rules path per that tool's docs.

All three skills assume the NowAIKit MCP server is connected. They lean on the safety features built into NowAIKit: `dry_run` previews, the write audit log, and write guardrails. Skills never apply destructive changes without showing a dry-run diff first.

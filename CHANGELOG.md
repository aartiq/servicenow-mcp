# Changelog

All notable changes to this project will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.0] — 2026-03-01

### Initial Release

The most comprehensive ServiceNow MCP server — 400+ tools across all modules.

#### Core
- **400+ MCP tools** covering 31+ ServiceNow modules
- **Multi-instance support** — connect to unlimited instances (dev, staging, prod, customer tenants) simultaneously
- **Role-based tool packages** — 14 persona-specific packages (service_desk, platform_developer, system_administrator, etc.)
- **5-tier permission system** — read-only by default; write, CMDB, scripting, Now Assist, and ATF each require explicit opt-in
- **OAuth 2.0 and Basic Auth** support

#### CLI
- **`servicenow-mcp setup`** — interactive wizard detects AI clients and writes config automatically
- **`servicenow-mcp auth login/logout/whoami`** — per-user OAuth flow
- **`servicenow-mcp instances list/remove`** — manage configured instances

#### MCP Features
- **11 slash commands** (`/morning-standup`, `/p1-alerts`, `/my-tickets`, `/create-incident`, etc.)
- **6 @ mention resources** (`@my-incidents`, `@open-changes`, `@sla-breaches`, etc.)
- **Custom commands** via `servicenow-mcp.commands.json`

#### Module Coverage
ITSM, ITOM, CMDB, HRSD, CSM, SecOps, GRC, Agile, ATF, Flow Designer, Scripting, Now Assist, Service Portal, UI Builder, Integration Hub, Notifications, Attachments, Performance Analytics, System Properties, Update Sets, Virtual Agent, ITAM, DevOps, Scoped Applications, and more.

#### AI Client Support
Claude Desktop, Claude Code, Cursor, VS Code, Windsurf, Zed, GitHub Copilot, Continue.dev, Cline, JetBrains, Amazon Q, Google AI Studio, ChatGPT, Gemini, Grok, Ollama, and any MCP-compatible client.

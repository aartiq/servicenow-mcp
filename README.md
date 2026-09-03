<div align="center">

<img src="https://raw.githubusercontent.com/aartiq/servicenow-mcp/main/docs/assets/banner.png" alt="NowAIKit ServiceNow MCP Server" width="100%"/>

[![npm](https://img.shields.io/npm/v/nowaikit?style=flat-square&color=00D4AA&label=npm)](https://www.npmjs.com/package/nowaikit)
[![Tools](https://img.shields.io/badge/450%2B%20tools-all%20modules-0F4C81?style=flat-square)](docs/TOOLS.md)
[![MCP](https://img.shields.io/badge/MCP-Model%20Context%20Protocol-0F4C81?style=flat-square)](https://modelcontextprotocol.io)
[![License: Source Available](https://img.shields.io/badge/license-Source%20Available-f59e0b?style=flat-square)](LICENSE)

# NowAIKit: ServiceNow MCP Server

**Connect Claude, ChatGPT, Gemini, Cursor, Copilot, or any AI, to ServiceNow.**

450+ tools across ITSM, ITOM, CMDB, HRSD, CSM, Flow Designer, scripting & portal. Read, build, query and automate any instance in plain English.

New in 4.4 to 4.7: **impact analysis** to see what depends on a table, field, or script before you change it (`list_table_config`, `find_field_references`, `find_script_references`), **Local Sync** to pull widgets and scripts to local files, edit, and push them back, and **`aggregate_report`** for server-side reports (count plus averages, no 1,000-row truncation) with chart-ready output for Copilot and Teams.

</div>

---

## 🚀 Get started (2 minutes)

> Requires **Node.js 20+**.

**1. Install and run the wizard.** It connects you to ServiceNow and writes your AI client's config for you.

```bash
npm install -g nowaikit
nowaikit setup
```

For OAuth the wizard signs in once, detects an existing OAuth app, or creates one for you (with an admin sign-in), or falls back to username/password. No manual OAuth app steps. On newer ServiceNow releases it creates a public client with PKCE (no secret).

**2. Sign in as yourself (per-user OAuth only).** Each user runs this once; the browser opens, you approve, and your queries then run in your own ServiceNow permission context.

```bash
nowaikit auth login
```

**3. Restart your AI client** (Claude Desktop, Cursor, …) and start asking. Done.

**Keeping it up to date:** NowAIKit checks on startup and, when a newer version is out, asks a single **"Update now?"**. Say yes and it updates itself. You can also run `nowaikit update` any time, or `npm install -g nowaikit@latest`.

> Prefer a UI? Run `npx nowaikit web` for a local dashboard (chat, instance manager, tool browser, audit log), all on your machine.

---

## 🔌 Manual setup (skip the wizard)

Add this to your client's MCP config (Claude Desktop `claude_desktop_config.json`, Cursor `~/.cursor/mcp.json`, etc.):

```json
{
  "mcpServers": {
    "nowaikit": {
      "command": "npx",
      "args": ["-y", "nowaikit"],
      "env": {
        "SERVICENOW_INSTANCE_URL": "https://yourcompany.service-now.com",
        "SERVICENOW_BASIC_USERNAME": "your_username",
        "SERVICENOW_BASIC_PASSWORD": "your_password"
      }
    }
  }
}
```

OAuth, multiple instances, and per-client steps → **[Client setup](docs/CLIENT_SETUP.md)** · **[OAuth setup](docs/SERVICENOW_OAUTH_SETUP.md)**.

> **CLI binary overrides:** when using `--provider claude-cli` or `--provider codex-cli`, set `NOWAIKIT_CLAUDE_BIN` or `NOWAIKIT_CODEX_BIN` to point at a non-default executable path.

No instance? Grab a free Personal Developer Instance at **[developer.servicenow.com](https://developer.servicenow.com)**.

---

## 💬 Use it — just ask

- *"How many active P1 incidents are open right now?"*
- *"Show me the 5 most recent changes and their risk."*
- *"Create a business rule on the incident table that…"*
- *"Run the ATF suite for the HR onboarding flow."*
- *"What's the CMDB health for our prod CIs?"*
- *"Look up GlideRecord.addEncodedQuery in the ServiceNow docs and show the syntax."*

**Read-only by default.** Write, scripting and CMDB changes are opt-in flags — prod can't be modified by accident.

---

## 📚 Docs

| | |
|---|---|
| [Installation](docs/INSTALLATION.md) · [Client setup](docs/CLIENT_SETUP.md) | [All 450+ tools](docs/TOOLS.md) · [Tool packages](docs/TOOL_PACKAGES.md) |
| [Multi-instance](docs/MULTI_INSTANCE.md) · [OAuth](docs/SERVICENOW_OAUTH_SETUP.md) | [Scripting](docs/SCRIPTING.md) · [ATF](docs/ATF.md) · [Reporting](docs/REPORTING.md) |
| [Skills & branded reports](docs/SKILLS_AND_REPORTS.md) | [Use your own Claude/Codex subscription](docs/SKILLS_AND_REPORTS.md#using-your-own-claude-code-or-codex-subscription) |

Full guides & product home → **[nowaikit.com](https://nowaikit.com)**

---

## 🧩 Part of the NowAIKit suite

- 🌐 **[nowaikit.com](https://nowaikit.com)** — docs, guides & product home
- 🖥️ **Web UI** — run `npx nowaikit web` for a local dashboard, no cloud account needed
- 📦 **[`nowaikit-sdk`](https://www.npmjs.com/package/nowaikit-sdk)** — TypeScript ServiceNow client library
- 🧰 **NowAIKit Builder** (VS Code) · **NowAIKit Utils** (browser extension)

> **⚠️ Official distribution only:** install from **npm (`nowaikit`)** or **[nowaikit.com](https://nowaikit.com)**. NowAIKit is never shipped as a downloadable GitHub `.zip` — beware copycat "download" repos.

---

## Maintainer & continuity

Built and maintained by **AARTIQ Ltd** (United Kingdom), and shipped often, usually several releases a month (see [CHANGELOG](CHANGELOG.md)). It is a single-vendor open project: one accountable team owns quality and support, with community contributions welcome on top.

You are not tied to that team continuing: the source is available under the Elastic License 2.0, and you get **perpetual self-host and fork rights**, so a deployed copy keeps working no matter what, and you could fork and carry on if you ever needed to. Commercial support and an SLA are available for production use. Details in [GOVERNANCE.md](GOVERNANCE.md). Contributions: [CONTRIBUTING.md](CONTRIBUTING.md).

---

## Licensing

NowAIKit is free to use and source available under the [Elastic License 2.0](LICENSE). Read it, run it, fork it, and use it inside your organisation, including to deliver ServiceNow work for clients, at no charge.

Providing NowAIKit as a hosted or managed service, reselling it, or embedding it in a paid product needs a commercial agreement. For that, or for enterprise hosting, support and consulting, contact **enterprise@nowaikit.com**. See [NOTICE](NOTICE).

---

© 2026 NowAIKit · Source available under the [Elastic License 2.0](LICENSE)

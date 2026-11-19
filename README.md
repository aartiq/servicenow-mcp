<div align="center">

<img src="https://raw.githubusercontent.com/aartiq/servicenow-mcp/main/docs/assets/banner.png" alt="NowAIKit ServiceNow MCP Server" width="100%"/>

[![npm](https://img.shields.io/npm/v/nowaikit?style=flat-square&color=00D4AA&label=npm)](https://www.npmjs.com/package/nowaikit)
[![Tools](https://img.shields.io/badge/500%2B%20tools-all%20modules-0F4C81?style=flat-square)](docs/TOOLS.md)
[![MCP](https://img.shields.io/badge/MCP-Model%20Context%20Protocol-0F4C81?style=flat-square)](https://modelcontextprotocol.io)
[![License: Source Available](https://img.shields.io/badge/license-Source%20Available-f59e0b?style=flat-square)](LICENSE)

# NowAIKit: ServiceNow MCP Server

**Connect Claude, ChatGPT, Gemini, Cursor, Copilot, or any AI, to ServiceNow.**

500+ tools across ITSM, ITOM, CMDB, HRSD, CSM, Flow Designer, scripting & portal. Read, build, query and automate any instance in plain English.

500+ does not mean a heavy context. Your AI does not load every tool. It finds the right one on demand with `search_tools`, you can expose a role package instead of the full set, and clients that load tools only when needed pull just what a task requires, so token cost stays low.

</div>

---

## What's new in 5.0

- **Interactive forms in the chat.** In Claude, ChatGPT and VS Code, `open_catalog_form` renders a real catalog item form (variables, variable sets, reference lookups, catalog UI policies), `open_record_form` opens any table's form with its layout and dependent choices, and `open_approvals` lets you approve or reject in place. Set `NOWAIKIT_MCP_APPS=false` to turn the forms off.
- **ServiceNow Action Fabric.** Work with the instance's own MCP servers (MCP Server Console and the out-of-box ITSM, ITOM, CMDB and SPM servers) through `sn_mcp_status`, `sn_mcp_list_servers`, `sn_mcp_list_tools`, `sn_mcp_call_tool` and `sn_mcp_activate_server`, and talk to ServiceNow AI agents over A2A with `sn_a2a_list_agents`, `sn_a2a_get_agent_card`, `sn_a2a_send_message`, `sn_a2a_get_task` and `sn_a2a_expose_agent`. These need an OAuth sign-in with JWT tokens. `nowaikit setup` now creates the OAuth app that way, so one sign-in covers REST, MCP and A2A. A2A also needs the instance's A2A channel in synchronous mode (AI Agent Studio > Settings > External AI agents > Discoverability > Communication mode).
- **AI Agent Studio, AI Control Tower and Knowledge Graph tools.** Agent tools, triggers, versions, memory, execution traces, evaluations and external agents, plus AI inventory, governance, usage and Otto status.
- **ServiceNow SDK 4.14.2 coverage.** The `fluent_*` tools match the current SDK CLI, with new `fluent_install`, `fluent_download`, `fluent_transform`, `fluent_dependencies`, `fluent_pack` and `fluent_exec`.
- **`nowaikit doctor`** checks Node, your version, instance reachability (including hibernating PDIs), login, roles, release, permissions, configured AI clients and the SDK, and tells you how to fix each problem. **`nowaikit serve`** runs the HTTP server and **`nowaikit mcp`** runs stdio.
- **Older config names now work.** The `SN_*` names, `SN_PERSONA`, `HTTP_PORT` and the `--allow-*` launch flags from older docs are all honoured now, and every documented v4 setting keeps working.
- **Better HTTP and lean mode.** HTTP mode serves many clients at once, and in lean mode `search_tools` adds what it finds to your tool list.
- **Fixes across about 40 tools** that pointed at the wrong tables (AI agents, subflows, ATF results, workspaces, mobile, Now Assist skills, PA jobs, Virtual Agent, DevOps and more).

Full list in the [changelog](CHANGELOG.md).

---

## Get started (2 minutes)

> Requires **Node.js 20+**.

**1. Install and run the wizard.** It connects you to ServiceNow and writes your AI client's config for you.

```bash
npm install -g nowaikit
nowaikit setup
```

For OAuth the wizard signs in once, detects an existing OAuth app or creates one for you (with an admin sign-in), or falls back to username and password. No manual OAuth app steps. It creates the app with JWT tokens and the scopes ServiceNow's MCP servers and A2A agents expect, and on newer releases it uses a public client with PKCE (no secret).

**2. Check everything.**

```bash
nowaikit doctor
```

It tests your instance, login, roles and AI client configs and prints a fix for anything that's wrong.

**3. Sign in as yourself (per-user OAuth only).** Each user runs this once. The browser opens, you approve, and your queries run in your own ServiceNow permission context. If port 8765 is busy it falls back to 8766 or 8767.

```bash
nowaikit auth login
```

**4. Restart your AI client** (Claude Desktop, Cursor, VS Code and so on) and start asking.

**Keeping it up to date:** NowAIKit checks on startup and, when a newer version is out, asks a single **"Update now?"**. Say yes and it updates itself. You can also run `nowaikit update` any time, or `npm install -g nowaikit@latest`.

> Prefer a UI? Run `npx nowaikit web` for a local dashboard (chat, instance manager, tool browser, audit log), all on your machine.

---

## Manual setup (skip the wizard)

Add this to your client's MCP config (Claude Desktop `claude_desktop_config.json`, Cursor `~/.cursor/mcp.json` and so on):

```json
{
  "mcpServers": {
    "nowaikit": {
      "command": "npx",
      "args": ["-y", "nowaikit"],
      "env": {
        "SERVICENOW_INSTANCE_URL": "https://yourcompany.service-now.com",
        "SERVICENOW_BASIC_USERNAME": "your_username",
        "SERVICENOW_BASIC_PASSWORD": "your_password",
        "MCP_TOOL_DISCOVERY": "lean"
      }
    }
  }
}
```

The main settings:

| Variable | What it does |
|----------|--------------|
| `SERVICENOW_INSTANCE_URL` | Your instance, for example `https://yourcompany.service-now.com` |
| `SERVICENOW_AUTH_METHOD` | `basic` (default) or `oauth` |
| `SERVICENOW_BASIC_USERNAME` / `SERVICENOW_BASIC_PASSWORD` | Basic-auth credentials |
| `SERVICENOW_OAUTH_CLIENT_ID` / `SERVICENOW_OAUTH_CLIENT_SECRET` | OAuth app credentials |
| `WRITE_ENABLED`, `CMDB_WRITE_ENABLED`, `SCRIPTING_ENABLED`, `ATF_ENABLED`, `NOW_ASSIST_ENABLED` | Opt-in permission tiers, all `false` by default |
| `MCP_TOOL_DISCOVERY` | `lean` (small core plus `search_tools`), `core`, or unset for every tool |
| `MCP_TOOL_PACKAGE` | A role package, see below |
| `SN_INSTANCES_CONFIG` / `SN_INSTANCE_<NAME>_URL` | Several instances, see [Multi-instance](docs/MULTI_INSTANCE.md) |

The short names from older docs work too: `SN_INSTANCE_URL`, `SN_USERNAME`, `SN_PASSWORD`, `SN_OAUTH_CLIENT_ID`, `SN_OAUTH_CLIENT_SECRET`, `SN_PERSONA` and `HTTP_PORT`. When both are set, the `SERVICENOW_*` name wins. Every variable is in the **[configuration reference](docs/CONFIGURATION.md)**.

You can also pass launch flags in `args` instead of env vars: `--allow-write`, `--allow-cmdb`, `--allow-scripting`, `--allow-atf`, `--allow-agentic`, `--allow-all`, `--read-only`, `--lean`, `--persona <name>`, `--package <name>`, `--instance <name>`, `--transport <stdio|sse|http>` and `--port <n>`. For example `"args": ["-y", "nowaikit", "--allow-write", "--persona", "itsm"]`.

OAuth, multiple instances and per-client steps: **[Client setup](docs/CLIENT_SETUP.md)** and **[OAuth setup](docs/SERVICENOW_OAUTH_SETUP.md)**.

> **CLI binary overrides:** when using `--provider claude-cli` or `--provider codex-cli`, set `NOWAIKIT_CLAUDE_BIN` or `NOWAIKIT_CODEX_BIN` to point at a non-default executable path.

No instance? Grab a free Personal Developer Instance at **[developer.servicenow.com](https://developer.servicenow.com)**.

### Personas and role packages

Set `SN_PERSONA` (or `--persona`) to a short name, or `MCP_TOOL_PACKAGE` to the package directly. Counts include `search_tools`. Details in [Tool packages](docs/TOOL_PACKAGES.md).

| `SN_PERSONA` | `MCP_TOOL_PACKAGE` | Tools |
|--------------|--------------------|------:|
| `full` | `full` (default) | 558 |
| `itsm` | `service_desk` | 27 |
| `change` | `change_coordinator` | 21 |
| `knowledge` | `knowledge_author` | 14 |
| `catalog` | `catalog_builder` | 17 |
| `admin` | `system_administrator` | 87 |
| `developer` | `platform_developer` | 70 |
| `itom` | `itom_engineer` | 25 |
| `agile` | `agile_manager` | 14 |
| `ai` | `ai_developer` | 61 |
| `portal` | `portal_developer` | 38 |
| `integration` | `integration_engineer` | 33 |
| `devops` | `devops_engineer` | 28 |
| `itam` | `itam_analyst` | 13 |

---

## Use it, just ask

- *"How many active P1 incidents are open right now?"*
- *"Show me the 5 most recent changes and their risk."*
- *"Open the new laptop request form."*
- *"Create a business rule on the incident table that..."*
- *"Run the ATF suite for the HR onboarding flow."*
- *"What's the CMDB health for our prod CIs?"*
- *"Look up GlideRecord.addEncodedQuery in the ServiceNow docs and show the syntax."*

**Read-only by default.** Write, scripting and CMDB changes are opt-in, so prod can't be modified by accident.

---

## Docs

Start at the **[documentation index](docs/README.md)**. Highlights:

| | |
|---|---|
| [Installation](docs/INSTALLATION.md), [Client setup](docs/CLIENT_SETUP.md) | [All tools](docs/TOOLS.md), [Tool packages and discovery](docs/TOOL_PACKAGES.md) |
| [Configuration reference](docs/CONFIGURATION.md), [Multi-instance](docs/MULTI_INSTANCE.md) | [OAuth setup](docs/SERVICENOW_OAUTH_SETUP.md), [Delegated auth](docs/DELEGATED_AUTH.md) |
| [Scripting](docs/SCRIPTING.md), [ATF](docs/ATF.md), [Reporting](docs/REPORTING.md) | [Skills and branded reports](docs/SKILLS_AND_REPORTS.md), [Now Assist](docs/NOW_ASSIST.md) |

Full guides and product home: **[nowaikit.com](https://nowaikit.com)**

---

## Part of the NowAIKit suite

- **[nowaikit.com](https://nowaikit.com)**: docs, guides and product home
- **Web UI**: run `npx nowaikit web` for a local dashboard, no cloud account needed
- **[`nowaikit-sdk`](https://www.npmjs.com/package/nowaikit-sdk)**: TypeScript ServiceNow client library
- **NowAIKit Builder** (VS Code) and **NowAIKit Utils** (browser extension)

> **Official distribution only:** install from **npm (`nowaikit`)** or **[nowaikit.com](https://nowaikit.com)**. NowAIKit is never shipped as a downloadable GitHub `.zip`, so beware copycat "download" repos.

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

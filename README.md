<div align="center">

<img src="docs/assets/banner.svg" alt="NowAIKit — ServiceNow MCP Server" width="100%"/>

[![npm](https://img.shields.io/npm/v/nowaikit?style=flat-square&color=00D4AA&label=npm)](https://www.npmjs.com/package/nowaikit)
[![Tools](https://img.shields.io/badge/450%2B%20tools-all%20modules-0F4C81?style=flat-square)](docs/TOOLS.md)
[![MCP](https://img.shields.io/badge/MCP-Model%20Context%20Protocol-0F4C81?style=flat-square)](https://modelcontextprotocol.io)
[![License: Source Available](https://img.shields.io/badge/license-Source%20Available-f59e0b?style=flat-square)](LICENSE)

# NowAIKit — ServiceNow MCP Server

**Connect Claude, ChatGPT, Gemini, Cursor, Copilot — or any AI — to ServiceNow.**

450+ tools across ITSM, ITOM, CMDB, HRSD, CSM, Flow Designer, scripting & portal. Read, build, query and automate any instance in plain English.

</div>

---

## 🚀 Install (2 minutes)

> Requires **Node.js 20+**.

```bash
# 1 — install
npm install -g nowaikit

# 2 — run the wizard: it detects your AI clients and writes their config for you
npx nowaikit setup
```

Restart your AI client (Claude Desktop, Cursor, …) and start asking. Done.

> Prefer a UI? `npx nowaikit web` for a local dashboard — or use **[NowAIKit Cloud](https://cloud.nowaikit.com)** (nothing to install).

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

No instance? Grab a free Personal Developer Instance at **[developer.servicenow.com](https://developer.servicenow.com)**.

---

## 💬 Use it — just ask

- *"How many active P1 incidents are open right now?"*
- *"Show me the 5 most recent changes and their risk."*
- *"Create a business rule on the incident table that…"*
- *"Run the ATF suite for the HR onboarding flow."*
- *"What's the CMDB health for our prod CIs?"*

**Read-only by default.** Write, scripting and CMDB changes are opt-in flags — prod can't be modified by accident.

---

## 📚 Docs

| | |
|---|---|
| [Installation](docs/INSTALLATION.md) · [Client setup](docs/CLIENT_SETUP.md) | [All 450+ tools](docs/TOOLS.md) · [Tool packages](docs/TOOL_PACKAGES.md) |
| [Multi-instance](docs/MULTI_INSTANCE.md) · [OAuth](docs/SERVICENOW_OAUTH_SETUP.md) | [Scripting](docs/SCRIPTING.md) · [ATF](docs/ATF.md) · [Reporting](docs/REPORTING.md) |

Full guides & product home → **[nowaikit.com](https://nowaikit.com)**

---

## 🧩 Part of the NowAIKit suite

- 🌐 **[nowaikit.com](https://nowaikit.com)** — docs, guides & product home
- ☁️ **[NowAIKit Cloud](https://cloud.nowaikit.com)** — the toolkit in your browser, no install
- 📦 **[`nowaikit-sdk`](https://www.npmjs.com/package/nowaikit-sdk)** — TypeScript ServiceNow client library
- 🧰 **NowAIKit Builder** (VS Code) · **NowAIKit Utils** (browser extension)

> **⚠️ Official distribution only:** install from **npm (`nowaikit`)** or **[nowaikit.com](https://nowaikit.com)**. NowAIKit is never shipped as a downloadable GitHub `.zip` — beware copycat "download" repos.

---

© 2026 AartiQ (Hardik Benani) · [NowAIKit Source Available License](LICENSE)

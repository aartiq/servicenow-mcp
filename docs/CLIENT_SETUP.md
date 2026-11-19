# Client setup guide

Step-by-step setup for connecting NowAIKit to each supported AI client.

## The quick way

```bash
npm install -g nowaikit
nowaikit setup     # connects to ServiceNow and writes your AI client's config
nowaikit doctor    # checks the instance, login, roles and every configured client
```

The wizard configures Claude Desktop, Claude Code, Cursor, VS Code (GitHub Copilot), Windsurf,
Continue.dev, Cline, Gemini CLI and Antigravity, and prints the steps for ChatGPT Desktop. Use the
manual steps below if you'd rather edit the config yourself.

## Prerequisites for manual setup

1. **Node.js 20+** installed
2. A ServiceNow instance URL and credentials

Every example runs the published package with `npx -y nowaikit`, so there is nothing to build. If you
work from a clone of the repository instead, run `npm install && npm run build` and replace
`npx -y nowaikit` with `node /absolute/path/to/nowaikit/dist/server.js`.

Permission tiers can be set as env vars (`WRITE_ENABLED=true` and so on) or as launch flags in `args`
(`--allow-write`, `--allow-cmdb`, `--allow-scripting`, `--allow-atf`, `--allow-agentic`). The short env
names from older docs (`SN_INSTANCE_URL`, `SN_USERNAME`, `SN_PASSWORD`, `SN_PERSONA`) also work. Full
list: [configuration reference](CONFIGURATION.md).

---

## Claude Code

Claude Code adds MCP servers with `claude mcp add`. Everything after `--` is the command it runs.

### Basic auth

```bash
claude mcp add nowaikit \
  -e SERVICENOW_INSTANCE_URL=https://yourinstance.service-now.com \
  -e SERVICENOW_AUTH_METHOD=basic \
  -e SERVICENOW_BASIC_USERNAME=your_username \
  -e SERVICENOW_BASIC_PASSWORD=your_password \
  -e MCP_TOOL_DISCOVERY=lean \
  -- npx -y nowaikit
```

### OAuth

```bash
claude mcp add nowaikit \
  -e SERVICENOW_INSTANCE_URL=https://yourinstance.service-now.com \
  -e SERVICENOW_AUTH_METHOD=oauth \
  -e SERVICENOW_OAUTH_CLIENT_ID=your_client_id \
  -e SERVICENOW_OAUTH_CLIENT_SECRET=your_client_secret \
  -e MCP_TOOL_DISCOVERY=lean \
  -- npx -y nowaikit
```

Then run `nowaikit auth login` once to sign in as yourself. Add `--allow-write` after `nowaikit` to
enable writes.

### Test

```
# In a Claude Code session:
List my 5 most recent open incidents
```

See the full guide: [clients/claude-code/SETUP.md](../clients/claude-code/SETUP.md)

---

## Claude Desktop

### Config file location

| OS | Path |
|----|------|
| macOS | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Windows | `%APPDATA%\Claude\claude_desktop_config.json` (Microsoft Store build: open **Settings > Developer > Edit Config** to find it) |
| Linux | `~/.config/Claude/claude_desktop_config.json` |

### Basic auth config

```json
{
  "mcpServers": {
    "nowaikit": {
      "command": "npx",
      "args": ["-y", "nowaikit"],
      "env": {
        "SERVICENOW_INSTANCE_URL": "https://yourinstance.service-now.com",
        "SERVICENOW_AUTH_METHOD": "basic",
        "SERVICENOW_BASIC_USERNAME": "your_username",
        "SERVICENOW_BASIC_PASSWORD": "your_password",
        "MCP_TOOL_PACKAGE": "service_desk"
      }
    }
  }
}
```

### OAuth config

```json
{
  "mcpServers": {
    "nowaikit": {
      "command": "npx",
      "args": ["-y", "nowaikit"],
      "env": {
        "SERVICENOW_INSTANCE_URL": "https://yourinstance.service-now.com",
        "SERVICENOW_AUTH_METHOD": "oauth",
        "SERVICENOW_OAUTH_CLIENT_ID": "your_client_id",
        "SERVICENOW_OAUTH_CLIENT_SECRET": "your_client_secret",
        "MCP_TOOL_DISCOVERY": "lean"
      }
    }
  }
}
```

With a client ID and no username, run `nowaikit auth login` to sign in as yourself. For a service
account using the password grant, add `SERVICENOW_OAUTH_USERNAME` and `SERVICENOW_OAUTH_PASSWORD`.

Claude Desktop renders the interactive forms (`open_catalog_form`, `open_record_form`,
`open_approvals`) inline. Set `NOWAIKIT_MCP_APPS=false` if you don't want them.

Example files (in the GitHub repository): [`clients/claude-desktop/`](../clients/claude-desktop/)

**Verify**: open Claude Desktop > Settings > Developer. `nowaikit` should show as running.

---

## ChatGPT

ChatGPT connects to MCP servers over HTTPS, so it needs NowAIKit running as an HTTP server that
ChatGPT can reach:

```bash
NOWAIKIT_API_KEY=choose-a-long-random-key nowaikit serve --host 0.0.0.0 --port 3000
```

Put it behind HTTPS (a reverse proxy or tunnel), then add the `https://your-host/mcp` URL as a
connector in ChatGPT. ChatGPT renders the interactive forms as Apps. See
[Installation: HTTP server](INSTALLATION.md#http-server) for the endpoints.

---

## OpenAI Codex (Python wrapper)

The repository includes a Python wrapper that spawns the MCP server and turns its tool schemas into
OpenAI function definitions. It lives in the GitHub repository (`clients/codex`), not the npm package.

### Setup

```bash
cd clients/codex
pip install openai python-dotenv

# Copy and fill in credentials
cp .env.basic.example .env
# or
cp .env.oauth.example .env
```

Edit `.env`:
```env
SERVICENOW_INSTANCE_URL=https://yourinstance.service-now.com
SERVICENOW_AUTH_METHOD=basic
SERVICENOW_BASIC_USERNAME=your_username
SERVICENOW_BASIC_PASSWORD=your_password
WRITE_ENABLED=false
OPENAI_API_KEY=your_openai_api_key
```

### Run

```bash
python servicenow_openai_client.py
```

See the full guide: [clients/codex/SETUP.md](../clients/codex/SETUP.md)

---

## Google Gemini

The simplest route is Gemini CLI, which `nowaikit setup` configures for you. The repository also has a
Python sample in `clients/gemini`.

### Python sample

```bash
cd clients/gemini
pip install google-generativeai python-dotenv

cp .env.basic.example .env
```

Edit `.env`:
```env
SERVICENOW_INSTANCE_URL=https://yourinstance.service-now.com
SERVICENOW_AUTH_METHOD=basic
SERVICENOW_BASIC_USERNAME=your_username
SERVICENOW_BASIC_PASSWORD=your_password
WRITE_ENABLED=false
GEMINI_API_KEY=your_gemini_api_key
```

```bash
python servicenow_gemini_client.py
```

For Vertex AI, authenticate with `gcloud auth application-default login` or set
`GOOGLE_APPLICATION_CREDENTIALS` (used by the Python sample only, not by the server). ServiceNow
credentials are still passed through the env vars above.

See the full guide: [clients/gemini/SETUP.md](../clients/gemini/SETUP.md)

---

## Cursor

Create `.cursor/mcp.json` in your project (or `~/.cursor/mcp.json` for every project):

```json
{
  "mcpServers": {
    "nowaikit": {
      "command": "npx",
      "args": ["-y", "nowaikit"],
      "env": {
        "SERVICENOW_INSTANCE_URL": "https://yourinstance.service-now.com",
        "SERVICENOW_AUTH_METHOD": "basic",
        "SERVICENOW_BASIC_USERNAME": "your_username",
        "SERVICENOW_BASIC_PASSWORD": "your_password",
        "MCP_TOOL_DISCOVERY": "lean"
      }
    }
  }
}
```

For OAuth, swap the basic-auth lines for `SERVICENOW_AUTH_METHOD=oauth`, `SERVICENOW_OAUTH_CLIENT_ID`
and `SERVICENOW_OAUTH_CLIENT_SECRET`, as in the Claude Desktop example. Example files are in the
repository at `clients/cursor/.cursor/mcp.basic.json` and `mcp.oauth.json`.

**Verify**: open Cursor > Settings > MCP. `nowaikit` should appear in the list.

See the full guide: [clients/cursor/SETUP.md](../clients/cursor/SETUP.md)

---

## VS Code

VS Code supports MCP servers in GitHub Copilot Chat agent mode. Create `.vscode/mcp.json` in your
workspace (note the `servers` key and `"type": "stdio"`):

```json
{
  "servers": {
    "nowaikit": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "nowaikit"],
      "env": {
        "SERVICENOW_INSTANCE_URL": "https://yourinstance.service-now.com",
        "SERVICENOW_AUTH_METHOD": "basic",
        "SERVICENOW_BASIC_USERNAME": "your_username",
        "SERVICENOW_BASIC_PASSWORD": "your_password",
        "MCP_TOOL_DISCOVERY": "lean"
      }
    }
  }
}
```

`nowaikit setup` can write this to your VS Code user profile instead, so it applies to every workspace.
VS Code renders the interactive forms inline.

**Verify**: open Copilot Chat in agent mode and check the tools list for NowAIKit.

See the full guide: [clients/vscode/SETUP.md](../clients/vscode/SETUP.md)

---

## Windsurf, Cline, Continue.dev and others

Any client that launches stdio MCP servers works with the same `command` / `args` / `env` block shown
for Cursor. `nowaikit setup` writes the config for Windsurf, Cline, Continue.dev, Gemini CLI and
Antigravity automatically.

---

## Troubleshooting

Start with `nowaikit doctor`. It checks the instance, login, roles, permission tiers and each
configured client, and prints the fix.

| Problem | Solution |
|---------|----------|
| Server won't start | Check Node.js is 20 or newer (`node --version`) and run `nowaikit doctor` |
| Authentication failed | Check the instance URL has no trailing slash and the credentials are right. For OAuth run `nowaikit auth test` |
| No tools showing | Check the MCP server logs in your client. When running from a clone, the path to `dist/server.js` must be absolute |
| Tool call refused | Check the `WRITE_ENABLED`, `SCRIPTING_ENABLED`, `ATF_ENABLED` and `NOW_ASSIST_ENABLED` settings, or the matching `--allow-*` flags |
| `sn_mcp_*` or `sn_a2a_*` tools fail | They need an OAuth sign-in with JWT tokens. Run `nowaikit setup` and pick browser OAuth, or set the OAuth app's Token Format to JWT and run `nowaikit auth login` again |
| OAuth token errors | Check the client ID and secret and that the OAuth app is active in ServiceNow |

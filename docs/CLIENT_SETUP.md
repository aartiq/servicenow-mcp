# Client Setup Guide

Step-by-step setup for connecting servicenow-mcp to each supported AI client.

## Prerequisites

All clients require:

1. **Node.js 20+** installed
2. The server built: `npm install && npm run build`
3. A ServiceNow instance URL and credentials

---

## Claude Code

Claude Code discovers MCP servers via the `claude mcp add` command.

### Basic Auth

```bash
claude mcp add servicenow \
  --command "node /absolute/path/to/servicenow-mcp/dist/server.js" \
  --env SERVICENOW_INSTANCE_URL=https://yourinstance.service-now.com \
  --env SERVICENOW_AUTH_METHOD=basic \
  --env SERVICENOW_BASIC_USERNAME=your_username \
  --env SERVICENOW_BASIC_PASSWORD=your_password \
  --env WRITE_ENABLED=false
```

### OAuth

```bash
claude mcp add servicenow \
  --command "node /absolute/path/to/servicenow-mcp/dist/server.js" \
  --env SERVICENOW_INSTANCE_URL=https://yourinstance.service-now.com \
  --env SERVICENOW_AUTH_METHOD=oauth \
  --env SERVICENOW_OAUTH_CLIENT_ID=your_client_id \
  --env SERVICENOW_OAUTH_CLIENT_SECRET=your_client_secret \
  --env SERVICENOW_OAUTH_USERNAME=your_username \
  --env SERVICENOW_OAUTH_PASSWORD=your_password \
  --env WRITE_ENABLED=false
```

### Test

```
# In Claude Code session:
List my 5 most recent open incidents
```

See full guide: [clients/claude-code/SETUP.md](../clients/claude-code/SETUP.md)

---

## Claude Desktop

### Config File Location

| OS | Path |
|----|------|
| macOS | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Windows | `%APPDATA%\Claude\claude_desktop_config.json` |
| Linux | `~/.config/Claude/claude_desktop_config.json` |

### Basic Auth Config

```json
{
  "mcpServers": {
    "servicenow": {
      "command": "node",
      "args": ["/absolute/path/to/servicenow-mcp/dist/server.js"],
      "env": {
        "SERVICENOW_INSTANCE_URL": "https://yourinstance.service-now.com",
        "SERVICENOW_AUTH_METHOD": "basic",
        "SERVICENOW_BASIC_USERNAME": "your_username",
        "SERVICENOW_BASIC_PASSWORD": "your_password",
        "WRITE_ENABLED": "false",
        "MCP_TOOL_PACKAGE": "service_desk"
      }
    }
  }
}
```

### OAuth Config

```json
{
  "mcpServers": {
    "servicenow": {
      "command": "node",
      "args": ["/absolute/path/to/servicenow-mcp/dist/server.js"],
      "env": {
        "SERVICENOW_INSTANCE_URL": "https://yourinstance.service-now.com",
        "SERVICENOW_AUTH_METHOD": "oauth",
        "SERVICENOW_OAUTH_CLIENT_ID": "your_client_id",
        "SERVICENOW_OAUTH_CLIENT_SECRET": "your_client_secret",
        "SERVICENOW_OAUTH_USERNAME": "your_username",
        "SERVICENOW_OAUTH_PASSWORD": "your_password",
        "WRITE_ENABLED": "false"
      }
    }
  }
}
```

Ready-to-edit files: [`clients/claude-desktop/`](../clients/claude-desktop/)

**Verify**: Open Claude Desktop → Settings → Developer → MCP Servers → `servicenow` should show green.

---

## OpenAI Codex

The Codex integration uses a Python wrapper that spawns the MCP server and translates MCP tool schemas to OpenAI function definitions.

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

See full guide: [clients/codex/SETUP.md](../clients/codex/SETUP.md)

---

## Google Gemini / Vertex AI

### Gemini API Setup

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

### Run

```bash
python servicenow_gemini_client.py
```

### Vertex AI Setup

For Vertex AI, authenticate with a service account:
```bash
gcloud auth application-default login
# or set GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
```

ServiceNow credentials are still passed via the env vars above.

See full guide: [clients/gemini/SETUP.md](../clients/gemini/SETUP.md)

---

## Cursor

### Setup

Copy the appropriate config file to your project's `.cursor/` directory:

```bash
mkdir -p .cursor
cp /path/to/servicenow-mcp/clients/cursor/.cursor/mcp.basic.json .cursor/mcp.json
```

Edit `.cursor/mcp.json`:
```json
{
  "mcpServers": {
    "servicenow": {
      "command": "node",
      "args": ["/absolute/path/to/servicenow-mcp/dist/server.js"],
      "env": {
        "SERVICENOW_INSTANCE_URL": "https://yourinstance.service-now.com",
        "SERVICENOW_AUTH_METHOD": "basic",
        "SERVICENOW_BASIC_USERNAME": "your_username",
        "SERVICENOW_BASIC_PASSWORD": "your_password",
        "WRITE_ENABLED": "false"
      }
    }
  }
}
```

### OAuth Config

```bash
cp /path/to/servicenow-mcp/clients/cursor/.cursor/mcp.oauth.json .cursor/mcp.json
```

**Verify**: Open Cursor → Settings → MCP → `servicenow` should appear in the list.

See full guide: [clients/cursor/SETUP.md](../clients/cursor/SETUP.md)

---

## VS Code

VS Code MCP support requires the GitHub Copilot extension or Claude for VS Code.

### Setup

Copy the MCP config to your workspace `.vscode/` directory:

```bash
mkdir -p .vscode
cp /path/to/servicenow-mcp/clients/vscode/.vscode/mcp.basic.json .vscode/mcp.json
```

Edit `.vscode/mcp.json`:
```json
{
  "servers": {
    "servicenow": {
      "type": "stdio",
      "command": "node",
      "args": ["${workspaceFolder}/../../servicenow-mcp/dist/server.js"],
      "env": {
        "SERVICENOW_INSTANCE_URL": "https://yourinstance.service-now.com",
        "SERVICENOW_AUTH_METHOD": "basic",
        "SERVICENOW_BASIC_USERNAME": "your_username",
        "SERVICENOW_BASIC_PASSWORD": "your_password",
        "WRITE_ENABLED": "false"
      }
    }
  }
}
```

**Verify**: Open VS Code Copilot Chat or Claude extension → ServiceNow tools should be available.

See full guide: [clients/vscode/SETUP.md](../clients/vscode/SETUP.md)

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Server won't start | Run `npm run build` first; check Node.js version (`node --version`) |
| Authentication failed | Verify instance URL has no trailing slash; check credentials |
| No tools showing | Check the MCP server logs; verify the path to `dist/server.js` is absolute |
| Tool call errors | Check `WRITE_ENABLED`, `SCRIPTING_ENABLED`, `ATF_ENABLED` flags |
| OAuth token errors | Verify client ID/secret; ensure OAuth app is created in ServiceNow |

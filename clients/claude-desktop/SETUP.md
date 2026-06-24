# Claude Desktop Setup Guide

Configure the ServiceNow MCP server with Claude Desktop.

## Prerequisites

- Node.js 20+ (`node --version`)
- Claude Desktop installed ([download here](https://claude.ai/download))
- ServiceNow instance URL and credentials

## Step 1: Build the Server

```bash
git clone https://github.com/aartiq/nowaikit.git
cd nowaikit
npm install
npm run build
```

Note the absolute path to `dist/server.js` — you'll need it below.

## Step 2: Find Your Config File

| OS | Config File Location |
|----|---------------------|
| macOS | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Windows | `%APPDATA%\Claude\claude_desktop_config.json` |
| Linux | `~/.config/Claude/claude_desktop_config.json` |

## Step 3: Add the ServiceNow Server

Open the config file and add the `servicenow` entry under `mcpServers`.

### Basic Auth

Use the ready-to-edit file at [`claude_desktop_config.basic.json`](claude_desktop_config.basic.json):

```json
{
  "mcpServers": {
    "nowaikit": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/TO/servicenow-mcp/dist/server.js"],
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

### OAuth (Recommended for Production)

Use the ready-to-edit file at [`claude_desktop_config.oauth.json`](claude_desktop_config.oauth.json):

```json
{
  "mcpServers": {
    "nowaikit": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/TO/servicenow-mcp/dist/server.js"],
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

> **Important**: Replace `/ABSOLUTE/PATH/TO` with the real path on your system. On macOS this might be `/Users/yourname/projects/servicenow-mcp/dist/server.js`.

## Step 4: Restart Claude Desktop

Fully quit and reopen Claude Desktop.

## Step 5: Verify

Open Claude Desktop → Settings (gear icon) → Developer → MCP Servers.

You should see `servicenow` listed with a **green** status indicator.

## Step 6: Test It

Start a new chat and try:

```
List my 5 most recent open incidents
```

```
Search the knowledge base for "VPN reset"
```

## Enable Writes

To create and update records, set `WRITE_ENABLED` to `"true"` in the config, then restart Claude Desktop:

```json
"WRITE_ENABLED": "true"
```

## OAuth Setup in ServiceNow

1. Navigate to: **System OAuth → Application Registry → New**
2. Select: **Create an OAuth API endpoint for external clients**
3. Fill in:
   - Name: `MCP Server`
   - Redirect URL: `https://localhost/oauth_callback` (not used, but required)
4. Save and note down the **Client ID** and **Client Secret**

Full OAuth guide: [../../docs/SERVICENOW_OAUTH_SETUP.md](../../docs/SERVICENOW_OAUTH_SETUP.md)

## Available Packages

Set `MCP_TOOL_PACKAGE` to limit which tools are visible:

| Package | Best For |
|---------|----------|
| `service_desk` | Help desk agents |
| `change_coordinator` | Change managers |
| `platform_developer` | Developers |
| `full` | All tools (default) |

See [../../docs/TOOL_PACKAGES.md](../../docs/TOOL_PACKAGES.md) for the full list.

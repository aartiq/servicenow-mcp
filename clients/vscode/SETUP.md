# VS Code Setup Guide

Configure the ServiceNow MCP server with VS Code using GitHub Copilot or Claude for VS Code.

## Prerequisites

- Node.js 20+ and the server built (`npm install && npm run build` from repo root)
- VS Code with one of:
  - [GitHub Copilot](https://marketplace.visualstudio.com/items?itemName=GitHub.copilot) extension
  - [Claude for VS Code](https://marketplace.visualstudio.com/items?itemName=Anthropic.claude-vscode) extension (if available)

## Step 1: Create the MCP Config

Copy the config file to your workspace `.vscode/` directory:

```bash
mkdir -p .vscode

# Basic Auth
cp /path/to/servicenow-mcp/clients/vscode/.vscode/mcp.basic.json .vscode/mcp.json

# OR: OAuth
cp /path/to/servicenow-mcp/clients/vscode/.vscode/mcp.oauth.json .vscode/mcp.json
```

## Step 2: Edit the Config

### Basic Auth

Edit `.vscode/mcp.json`:
```json
{
  "servers": {
    "servicenow": {
      "type": "stdio",
      "command": "node",
      "args": ["/ABSOLUTE/PATH/TO/servicenow-mcp/dist/server.js"],
      "env": {
        "SERVICENOW_INSTANCE_URL": "https://yourinstance.service-now.com",
        "SERVICENOW_AUTH_METHOD": "basic",
        "SERVICENOW_BASIC_USERNAME": "your_username",
        "SERVICENOW_BASIC_PASSWORD": "your_password",
        "WRITE_ENABLED": "false",
        "MCP_TOOL_PACKAGE": "full"
      }
    }
  }
}
```

### OAuth

```json
{
  "servers": {
    "servicenow": {
      "type": "stdio",
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

> **Note**: The VS Code MCP config format uses `"servers"` (not `"mcpServers"`) and requires `"type": "stdio"`.

## Step 3: Install Recommended Extensions

Copy the extensions recommendation file:
```bash
cp /path/to/servicenow-mcp/clients/vscode/.vscode/extensions.json .vscode/extensions.json
```

VS Code will prompt you to install: GitHub Copilot, GitHub Copilot Chat.

## Step 4: Verify

With the Copilot extension installed:
1. Open VS Code Copilot Chat (Ctrl+Shift+I or Cmd+Shift+I)
2. The chat interface should now have access to ServiceNow tools
3. If using Claude extension: open the Claude chat panel

## Step 5: Test

In Copilot Chat or Claude chat, try:

```
@servicenow List my open incidents
```

```
@servicenow Search the knowledge base for VPN troubleshooting
```

## Using Workspace Variables

You can use VS Code workspace variables in the config:

```json
"args": ["${workspaceFolder}/dist/server.js"]
```

This is useful if the servicenow-mcp repo is the workspace root.

## Using Environment Variables for Credentials

Reference system environment variables:
```json
"SERVICENOW_BASIC_USERNAME": "${env:SN_USERNAME}",
"SERVICENOW_BASIC_PASSWORD": "${env:SN_PASSWORD}"
```

Set these in your shell profile (`~/.zshrc`, `~/.bashrc`):
```bash
export SN_USERNAME=your_username
export SN_PASSWORD=your_password
```

## Troubleshooting

| Problem | Solution |
|---------|----------|
| MCP server not found | Check the absolute path to `dist/server.js` |
| Auth errors | Verify instance URL has no trailing slash |
| Tools not available | Restart VS Code after editing `.vscode/mcp.json` |
| Extension not working | Ensure GitHub Copilot subscription is active |

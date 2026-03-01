# Cursor Setup Guide

Configure the ServiceNow MCP server with Cursor IDE.

## Prerequisites

- Node.js 20+ and the server built (`npm install && npm run build` from repo root)
- Cursor IDE installed ([cursor.sh](https://cursor.sh))

## Step 1: Create the MCP Config

Copy the appropriate config file into your project:

```bash
mkdir -p .cursor

# Basic Auth
cp /path/to/servicenow-mcp/clients/cursor/.cursor/mcp.basic.json .cursor/mcp.json

# OR: OAuth
cp /path/to/servicenow-mcp/clients/cursor/.cursor/mcp.oauth.json .cursor/mcp.json
```

## Step 2: Edit the Config

### Basic Auth

Edit `.cursor/mcp.json`:
```json
{
  "mcpServers": {
    "servicenow": {
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
  "mcpServers": {
    "servicenow": {
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

> **Important**: Use the absolute path to `dist/server.js` — relative paths may not work.

## Step 3: Add Cursor Rules (Optional)

Copy the `.cursorrules` file to help Cursor understand when to use ServiceNow tools:

```bash
cp /path/to/servicenow-mcp/clients/cursor/.cursorrules .cursorrules
```

This instructs Cursor to use ServiceNow tools when you ask about incidents, changes, knowledge, or IT operations.

## Step 4: Verify

Open Cursor → Settings → MCP (in the left sidebar).

You should see `servicenow` listed with a connected status.

## Step 5: Test

Open Cursor's AI chat (Ctrl+L or Cmd+L) and try:

```
List my open incidents
```

```
Show me the CMDB health dashboard
```

## Using Environment Variables for Credentials

To avoid putting credentials directly in the config file, you can reference environment variables:

```json
"SERVICENOW_BASIC_USERNAME": "${env:SN_USERNAME}",
"SERVICENOW_BASIC_PASSWORD": "${env:SN_PASSWORD}"
```

Then set in your shell profile:
```bash
export SN_USERNAME=your_username
export SN_PASSWORD=your_password
```

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Server not connecting | Check absolute path to `dist/server.js` |
| Auth errors | Verify instance URL has no trailing slash |
| No MCP option in settings | Update Cursor to the latest version |
| Tools not appearing | Restart Cursor after editing the config |

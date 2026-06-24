# Claude Code Setup Guide

Set up the ServiceNow MCP server with Claude Code (the CLI).

## Prerequisites

- Node.js 20+ (`node --version`)
- Claude Code installed (`npm install -g @anthropic-ai/claude-code` or via package manager)
- ServiceNow instance URL and credentials

## Step 1: Build the Server

```bash
git clone https://github.com/aartiq/nowaikit.git
cd nowaikit
npm install
npm run build
```

## Step 2: Register with Claude Code

### Basic Auth

```bash
claude mcp add servicenow \
  --command "node" \
  --args "/absolute/path/to/nowaikit/dist/server.js" \
  --env SERVICENOW_INSTANCE_URL="https://yourinstance.service-now.com" \
  --env SERVICENOW_AUTH_METHOD="basic" \
  --env SERVICENOW_BASIC_USERNAME="your_username" \
  --env SERVICENOW_BASIC_PASSWORD="your_password" \
  --env WRITE_ENABLED="false"
```

### OAuth (Recommended for Production)

```bash
claude mcp add servicenow \
  --command "node" \
  --args "/absolute/path/to/nowaikit/dist/server.js" \
  --env SERVICENOW_INSTANCE_URL="https://yourinstance.service-now.com" \
  --env SERVICENOW_AUTH_METHOD="oauth" \
  --env SERVICENOW_OAUTH_CLIENT_ID="your_client_id" \
  --env SERVICENOW_OAUTH_CLIENT_SECRET="your_client_secret" \
  --env SERVICENOW_OAUTH_USERNAME="your_username" \
  --env SERVICENOW_OAUTH_PASSWORD="your_password" \
  --env WRITE_ENABLED="false"
```

## Step 3: Verify

```bash
claude mcp list
# Should show: servicenow — node dist/server.js
```

## Step 4: Test in a Session

Start Claude Code in a directory and try:

```
List my 5 most recent open incidents
```

```
Search the knowledge base for "password reset"
```

```
Show me all active P1 and P2 incidents
```

## Enable Write Operations

To create and update records:

```bash
claude mcp remove servicenow
claude mcp add servicenow \
  --command "node" \
  --args "/absolute/path/to/nowaikit/dist/server.js" \
  --env SERVICENOW_INSTANCE_URL="https://yourinstance.service-now.com" \
  --env SERVICENOW_AUTH_METHOD="basic" \
  --env SERVICENOW_BASIC_USERNAME="your_username" \
  --env SERVICENOW_BASIC_PASSWORD="your_password" \
  --env WRITE_ENABLED="true"
```

## Role-Based Tool Packages

Use `MCP_TOOL_PACKAGE` to load only the tools relevant to your workflow:

```bash
# Service desk tools only
--env MCP_TOOL_PACKAGE="service_desk"

# Platform developer tools (scripting + ATF)
--env MCP_TOOL_PACKAGE="platform_developer" \
--env SCRIPTING_ENABLED="true" \
--env ATF_ENABLED="true"

# Now Assist / AI tools
--env MCP_TOOL_PACKAGE="ai_developer" \
--env NOW_ASSIST_ENABLED="true"
```

See [../../docs/TOOL_PACKAGES.md](../../docs/TOOL_PACKAGES.md) for all packages.

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `command not found: claude` | Install Claude Code first |
| MCP server not found | Use absolute path to `dist/server.js` |
| Auth errors | Check instance URL (no trailing slash) and credentials |
| No tools shown | Run `npm run build` to compile the server |

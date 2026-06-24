# nowaikit — Installation Guide

Complete setup instructions for connecting nowaikit to ServiceNow and any AI client.

**Estimated Time**: 5 minutes (wizard) or 20-30 minutes (manual)
**Difficulty**: Beginner-friendly

---

## Table of Contents

- [Option A: Interactive Setup Wizard (Recommended)](#option-a-interactive-setup-wizard)
- [Option B: Desktop App](#option-b-desktop-app)
- [Option C: Manual Setup](#option-c-manual-setup)
- [System Prerequisites](#system-prerequisites)
- [ServiceNow OAuth 2.0 Setup](#servicenow-oauth-20-setup)
- [Enterprise Configuration](#enterprise-configuration)
  - [SSO / OIDC](#sso--oidc)
  - [Audit Logging](#audit-logging)
  - [Org / Team Policy](#org--team-policy)
- [HTTP API Server](#http-api-server)
- [Verification and Testing](#verification-and-testing)
- [Troubleshooting](#troubleshooting)
- [Environment Variables Reference](#environment-variables-reference)
- [Next Steps](#next-steps)

---

## Option A: Interactive Setup Wizard

The fastest way to get started — no config file editing required.

```bash
# Install globally (Node.js 20+ required)
npm install -g nowaikit

# Run the wizard
npx nowaikit setup
```

The wizard walks you through:

```
Welcome to nowaikit
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Step 1/5 — ServiceNow Instance
  > Instance URL: https://yourcompany.service-now.com
  > Auth method: (1) Basic  (2) OAuth 2.0  [1]

Step 2/5 — Credentials
  > Username: admin
  > Password: ••••••••

Step 3/5 — Testing connection...
  ✓ Connected to yourcompany.service-now.com (Yokohama)
  ✓ User: admin (System Administrator)

Step 4/5 — Permissions & Role
  > Tool package: (1) full  (2) service_desk  (3) platform_developer  ... [1]
  > Enable writes? (y/N): n

Step 5/5 — Install into AI client
  Detected: ✓ Claude Desktop  ✓ Cursor  ✗ VS Code (not found)
  > Install into: (1) Claude Desktop  (2) Cursor  (3) Both  (4) .env only
  ✓ Written: ~/Library/Application Support/Claude/claude_desktop_config.json
  ✓ Restart Claude Desktop to activate
```

**Additional commands:**

```bash
nowaikit setup --add         # Add a second instance
nowaikit instances list      # List configured instances
nowaikit instances remove dev # Remove an instance
nowaikit auth login          # Per-user OAuth login
nowaikit auth whoami         # Show active ServiceNow user
```

---

## Option B: Desktop App

Download the **nowaikit Desktop** app — includes an 8-step visual wizard, instance manager, tool browser, and audit log viewer. The bundled server starts automatically.

| Platform | Download |
|----------|----------|
| **macOS** | [nowaikit.dmg](https://github.com/aartiq/nowaikit/releases/latest) |
| **Windows** | [nowaikit-Setup.exe](https://github.com/aartiq/nowaikit/releases/latest) |
| **Linux** | [nowaikit.AppImage](https://github.com/aartiq/nowaikit/releases/latest) · [nowaikit.deb](https://github.com/aartiq/nowaikit/releases/latest) |

The app auto-updates when new releases are published.

For building from source, see [desktop/BUILDING.md](../desktop/BUILDING.md).

---

## Option C: Manual Setup

### Step 1: Clone and build

```bash
git clone https://github.com/aartiq/nowaikit.git
cd nowaikit
npm install
npm run build
```

### Step 2: Configure

```bash
cp .env.example .env
```

Edit `.env` with your ServiceNow credentials (minimum required):

```env
SERVICENOW_INSTANCE_URL=https://yourcompany.service-now.com
SERVICENOW_AUTH_METHOD=basic
SERVICENOW_BASIC_USERNAME=your_username
SERVICENOW_BASIC_PASSWORD=your_password
```

### Step 3: Point your AI client at the server

Add to your AI client config (`dist/server.js` is the MCP entry point):

```json
{
  "mcpServers": {
    "nowaikit": {
      "command": "node",
      "args": ["/absolute/path/to/nowaikit/dist/server.js"],
      "env": {
        "SERVICENOW_INSTANCE_URL": "https://yourcompany.service-now.com",
        "SERVICENOW_AUTH_METHOD": "basic",
        "SERVICENOW_BASIC_USERNAME": "admin",
        "SERVICENOW_BASIC_PASSWORD": "your_password"
      }
    }
  }
}
```

Config file locations by client:

| Client | Config path |
|--------|------------|
| Claude Desktop (macOS) | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Claude Desktop (Windows) | `%APPDATA%\Claude\claude_desktop_config.json` |
| Claude Desktop (Linux) | `~/.config/Claude/claude_desktop_config.json` |
| Cursor | `~/.cursor/mcp.json` |
| VS Code | `.vscode/mcp.json` (use `"servers"` key + `"type": "stdio"`) |
| Windsurf | `~/.codeium/windsurf/mcp_config.json` |
| Continue.dev | `~/.continue/config.json` |

Full per-client guides → [docs/CLIENT_SETUP.md](CLIENT_SETUP.md)

---

## System Prerequisites

- **Node.js 20.0.0 or higher** — [nodejs.org](https://nodejs.org/)
- A ServiceNow instance (admin access for OAuth setup)
- macOS: Homebrew `brew install node`; Linux: use your package manager

---

## ServiceNow OAuth 2.0 Setup

OAuth 2.0 is the recommended authentication method for production deployments.

**Full OAuth setup guide → [SERVICENOW_OAUTH_SETUP.md](SERVICENOW_OAUTH_SETUP.md)**

### Quick Setup

1. In ServiceNow: **System OAuth > Application Registry > New > Create an OAuth API endpoint for external clients**
2. Set **Name**: `nowaikit`, **Refresh Token Lifespan**: `8640000`, **Access Token Lifespan**: `1800`
3. Enable **Password Grant** and **Refresh Token** grant types
4. Copy the **Client ID** and **Client Secret** (shown only once)

Test it:

```bash
curl -X POST "https://YOUR-INSTANCE.service-now.com/oauth_token.do" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=password&client_id=CLIENT_ID&client_secret=CLIENT_SECRET&username=admin&password=PASSWORD"
```

---

## Enterprise Configuration

### SSO / OIDC

Connect to Okta, Azure AD (Entra), Ping Identity, or any OIDC-compatible IdP. On login, nowaikit exchanges the OIDC ID token for a ServiceNow OAuth token automatically.

Add to `.env`:

```env
OIDC_ISSUER=https://yourco.okta.com
OIDC_CLIENT_ID=your-oidc-client-id
OIDC_CLIENT_SECRET=your-oidc-client-secret
OIDC_REDIRECT_URI=http://localhost:3100/auth/callback
```

Start the HTTP server and open `http://localhost:3100/auth/login` — users are redirected to your IdP and then back to the dashboard.

For IdP setup: register nowaikit as an OAuth client with redirect URI `http://localhost:3100/auth/callback` and scopes `openid profile email`.

### Audit Logging

Every tool call, resource read, and prompt resolve is automatically logged.

```env
AUDIT_ENABLED=true

# JSONL log file (default: ~/.config/nowaikit/audit.jsonl)
AUDIT_LOG_PATH=/var/log/nowaikit/audit.jsonl

# Webhook for SIEM / Splunk / Datadog integration
AUDIT_WEBHOOK_URL=https://your-siem.example.com/nowaikit/audit

# Also write to stdout
AUDIT_LOG_STDOUT=false
```

Log record format:

```json
{
  "ts": "2026-02-22T10:15:30.123Z",
  "event": "tool_call",
  "tool": "list_incidents",
  "instance": "prod",
  "authMode": "service-account",
  "user": "admin",
  "success": true,
  "durationMs": 342
}
```

### Org / Team Policy

Admins can deploy a `nowaikit.org.json` file via MDM, GPO, or configuration management to enforce policy across all team members:

```json
{
  "org_name": "Acme Corp",
  "allowed_instance_urls": ["https://acme.service-now.com"],
  "locked_tool_package": "service_desk",
  "max_permission_tier": "write",
  "require_sso": true,
  "oidc_issuer": "https://acme.okta.com",
  "write_enabled": false,
  "max_records": 50,
  "audit_enabled": true,
  "audit_webhook_url": "https://siem.acme.com/nowaikit"
}
```

Search order: `NOWAIKIT_ORG_CONFIG` env var → `/etc/nowaikit/org.json` → `./nowaikit.org.json`

---

## HTTP API Server

Use `nowaikit serve` to expose all tools as a REST API for web apps:

```bash
npm run serve
# or: node dist/http-server.js --port 3100

# With API key auth:
NOWAIKIT_API_KEY=my-secret-key npm run serve
```

Open `http://localhost:3100` for the web dashboard.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/` | Web dashboard |
| `GET` | `/api/health` | Health + instance info |
| `GET` | `/api/tools` | List all tools |
| `POST` | `/api/tool` | `{ "tool": "list_incidents", "params": {} }` |
| `GET` | `/api/resources` | List @ resources |
| `GET` | `/api/prompts` | List slash commands |
| `GET` | `/auth/login` | SSO redirect to IdP |
| `GET` | `/auth/callback` | OIDC code exchange |

Full app builder guide → [../clients/lovable/SETUP.md](../clients/lovable/SETUP.md)

---

## Verification and Testing

### Using the wizard

After `npx nowaikit setup` completes, restart your AI client and test:

```
List my 5 most recent open incidents
```

The AI should call `list_incidents` and return results.

### Manual verification

1. Restart your AI client (Claude Desktop, Cursor, etc.)
2. Ask: *"Get the schema for the incident table"* — should call `get_table_schema`
3. Ask: *"Show me 5 open P1 incidents"* — should call `query_records`
4. Ask: *"Create a test incident"* — should fail if `WRITE_ENABLED=false` (expected)

### Verify slash commands and @ mentions

In Claude Desktop or Cursor, type `/` — you should see the nowaikit slash commands appear in the command palette.

Type `@my-incidents` in a message to pull your open incidents into context.

---

## Troubleshooting

### Issue 1: "Cannot find module 'dist/server.js'"

**Cause**: Incorrect path or build not completed

**Solution**:
1. Navigate to repository:
   ```bash
   cd /path/to/nowaikit
   ```
2. Rebuild:
   ```bash
   npm run build
   ```
3. Get absolute path:
   ```bash
   pwd
   ```
4. Update `args` in configuration with correct absolute path

### Issue 2: "AUTHENTICATION_FAILED"

**Cause**: Invalid OAuth credentials

**Solution**:
1. Verify Client ID and Client Secret are correct
2. Test OAuth with curl command (see OAuth Setup section)
3. Check username and password are correct
4. Verify OAuth application is **Active** in ServiceNow
5. Ensure **Password Grant** is enabled in OAuth application

### Issue 3: "TABLE_NOT_ALLOWED"

**Cause**: Table not in default allowlist

**Solution**:

**Option A**: Allow any table (use with caution)
```json
"env": {
  ...
  "ALLOW_ANY_TABLE": "true"
}
```

**Option B**: Add specific table to allowlist
```json
"env": {
  ...
  "ALLOWED_TABLES": "incident,change_request,cmdb_ci"
}
```

### Issue 4: MCP Server Not Showing in Claude Desktop

**Cause**: Configuration file syntax error or wrong location

**Solution**:
1. **Validate JSON syntax**: Use https://jsonlint.com/
2. **Check file location**: Ensure `claude_desktop_config.json` is in correct directory
3. **Check for trailing commas**: JSON doesn't allow trailing commas
4. **Restart completely**: Fully quit and relaunch Claude Desktop
5. **Check logs**: Look for error messages in Claude Desktop console

### Issue 5: "WRITE_NOT_ENABLED" When Creating Records

**Cause**: Write operations disabled by default (expected behavior)

**Solution**:
- This is **expected** for read-only mode
- To enable write operations: Set `WRITE_ENABLED=true` in configuration
- **Warning**: Only use in dev/test environments, not production

### Issue 6: "Request timeout" or Slow Responses

**Cause**: Network latency or complex queries

**Solution**:
```json
"env": {
  ...
  "REQUEST_TIMEOUT_MS": "60000",  // Increase to 60 seconds
  "MAX_RETRIES": "5"               // Increase retry attempts
}
```

---

## Next Steps

- Browse 120+ examples: [EXAMPLES.md](../EXAMPLES.md)
- Full client setup for every AI tool: [CLIENT_SETUP.md](CLIENT_SETUP.md)
- App builder (Lovable/Bolt/v0): [../clients/lovable/SETUP.md](../clients/lovable/SETUP.md)
- Desktop app build guide: [../desktop/BUILDING.md](../desktop/BUILDING.md)
- Issues: https://github.com/aartiq/nowaikit/issues

---

## Environment Variables Reference

Full reference also in `.env.example`.

### ServiceNow Connection (required)

| Variable | Description | Example |
|----------|-------------|---------|
| `SERVICENOW_INSTANCE_URL` | Instance URL (no trailing slash) | `https://yourco.service-now.com` |
| `SERVICENOW_AUTH_METHOD` | `basic` or `oauth` | `basic` |

### Basic Auth

| Variable | Description |
|----------|-------------|
| `SERVICENOW_BASIC_USERNAME` | Username |
| `SERVICENOW_BASIC_PASSWORD` | Password |

### OAuth 2.0

| Variable | Description |
|----------|-------------|
| `SERVICENOW_OAUTH_CLIENT_ID` | OAuth Client ID |
| `SERVICENOW_OAUTH_CLIENT_SECRET` | OAuth Client Secret |
| `SERVICENOW_OAUTH_USERNAME` | Service account username |
| `SERVICENOW_OAUTH_PASSWORD` | Service account password |

### Permission Tiers

| Variable | Default | Description |
|----------|---------|-------------|
| `WRITE_ENABLED` | `false` | Create/update/delete operations |
| `CMDB_WRITE_ENABLED` | `false` | CMDB CI write (requires WRITE_ENABLED) |
| `SCRIPTING_ENABLED` | `false` | Business rules, script includes (requires WRITE_ENABLED) |
| `NOW_ASSIST_ENABLED` | `false` | Now Assist / Generative AI tools |
| `ATF_ENABLED` | `false` | ATF test execution |

### Tool Packaging

| Variable | Default | Description |
|----------|---------|-------------|
| `MCP_TOOL_PACKAGE` | `full` | `full`, `service_desk`, `platform_developer`, `portal_developer`, `integration_engineer`, `itom_engineer`, `agile_manager`, `ai_developer`, `devops_engineer`, `itam_analyst`, ... |

### Multi-Instance

| Variable | Description |
|----------|-------------|
| `SN_INSTANCES_CONFIG` | Path to `instances.json` |
| `SN_INSTANCE_<NAME>_URL` | Instance URL (env-var multi-instance) |
| `SN_INSTANCE_<NAME>_AUTH_METHOD` | Auth method for named instance |

### HTTP API Server

| Variable | Default | Description |
|----------|---------|-------------|
| `HTTP_PORT` | `3100` | HTTP server port |
| `HTTP_HOST` | `127.0.0.1` | Bind address |
| `NOWAIKIT_API_KEY` | (none) | Bearer token for API auth |
| `CORS_ORIGIN` | `*` | Allowed CORS origin |

### Audit Logging

| Variable | Default | Description |
|----------|---------|-------------|
| `AUDIT_ENABLED` | `true` | Enable/disable audit logging |
| `AUDIT_LOG_PATH` | `~/.config/nowaikit/audit.jsonl` | JSONL file path |
| `AUDIT_WEBHOOK_URL` | (none) | POST audit records to SIEM |
| `AUDIT_LOG_STDOUT` | `false` | Also write to stdout |

### SSO / OIDC

| Variable | Description |
|----------|-------------|
| `OIDC_ISSUER` | IdP issuer URL (Okta, Entra, etc.) |
| `OIDC_CLIENT_ID` | OAuth client ID registered in IdP |
| `OIDC_CLIENT_SECRET` | OAuth client secret |
| `OIDC_REDIRECT_URI` | Callback URL (e.g. `http://localhost:3100/auth/callback`) |

### Org Policy

| Variable | Description |
|----------|-------------|
| `NOWAIKIT_ORG_CONFIG` | Path to `nowaikit.org.json` |

---

**Need help?** Check [Troubleshooting](#troubleshooting) above or file an issue at https://github.com/aartiq/nowaikit/issues

# NowAIKit installation guide

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
- [Audit log and write guardrails](#audit-log-and-write-guardrails)
- [HTTP server](#http-server)
- [Enterprise features](#enterprise-features)
- [Verification and Testing](#verification-and-testing)
- [Troubleshooting](#troubleshooting)
- [Environment Variables Reference](#environment-variables-reference)
- [Next Steps](#next-steps)

---

## Option A: Interactive Setup Wizard

The fastest way to get started, with no config file editing.

```bash
# Install globally (Node.js 20+ required)
npm install -g nowaikit

# Run the wizard
nowaikit setup

# Then check the whole setup
nowaikit doctor
```

`nowaikit doctor` checks Node, your NowAIKit version, that the instance is reachable (and tells you if a
developer instance is hibernating), your login and roles, the ServiceNow release, the permission tiers,
the AI clients you have configured and the ServiceNow SDK. Every problem comes with the fix. Add
`--instance <name>` to check one instance or `--json` for scripts.

The wizard walks you through:

```
Welcome to nowaikit
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Step 1/5: ServiceNow instance
  > Instance URL: https://yourcompany.service-now.com
  > Auth method: (1) Basic  (2) OAuth 2.0  [1]

Step 2/5: Credentials
  > Username: admin
  > Password: ••••••••

Step 3/5: Testing connection...
  ✓ Connected to yourcompany.service-now.com (Brazil)
  ✓ User: admin (System Administrator)

Step 4/5: Permissions and role
  > Tool package: (1) full  (2) service_desk  (3) platform_developer  ... [1]
  > Enable writes? (y/N): n

Step 5/5: Install into AI client
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
nowaikit auth login          # Per-user OAuth login (falls back to port 8766 or 8767 if 8765 is busy)
nowaikit auth whoami         # Show active ServiceNow user
nowaikit auth test           # Check the stored token, a live API call and OAuth refresh
nowaikit auth logout         # Remove the stored token
nowaikit doctor              # Check the whole setup and print fixes
nowaikit serve               # Run the HTTP server (see below)
nowaikit mcp                 # Run the MCP server over stdio (what AI clients launch)
```

When you choose OAuth, the wizard creates the ServiceNow OAuth app with the JWT token format and, where
the instance has them, the `useraccount` and `a2aauthscope` scopes. That one sign-in then works for the
REST API, ServiceNow's own MCP servers and its A2A agents.

### Updating NowAIKit

NowAIKit checks npm on startup. When a newer version is out it asks a single **"Update now?"** (default yes). Say yes and it installs the update and re-runs your command on the new version. Nothing to copy.

```bash
nowaikit update                    # update on demand
npm install -g nowaikit@latest     # or update manually
nowaikit --version                 # what you have now
```

On `npx nowaikit@latest ...` there's nothing to update, the `@latest` tag always pulls the current version. In CI or piped shells the CLI only prints a one-line notice and never blocks; set `NOWAIKIT_NO_UPDATE_CHECK=1` to silence it entirely.

---

## Option B: Desktop App

Download the **NowAIKit Desktop** app. It includes an 8-step visual wizard, instance manager, tool browser, and audit log viewer. The bundled server starts automatically.

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

Full per-client guides: [CLIENT_SETUP.md](CLIENT_SETUP.md)

---

## System Prerequisites

- **Node.js 20.0.0 or higher**: [nodejs.org](https://nodejs.org/)
- A ServiceNow instance (admin access for OAuth setup)
- macOS: Homebrew `brew install node`; Linux: use your package manager

---

## ServiceNow OAuth 2.0 Setup

OAuth 2.0 is the recommended authentication method for production deployments.

**Full OAuth setup guide: [SERVICENOW_OAUTH_SETUP.md](SERVICENOW_OAUTH_SETUP.md)**

The easiest route is `nowaikit setup`, which creates the OAuth app for you. The manual steps below are for a service account using the password grant.

### Quick Setup

1. In ServiceNow: **System OAuth > Application Registry > New > Create an OAuth API endpoint for external clients**
2. Set **Name**: `nowaikit`, **Refresh Token Lifespan**: `8640000`, **Access Token Lifespan**: `1800`
3. Enable **Password Grant** and **Refresh Token** grant types
4. Set **Token Format** to **JWT** if you want the Action Fabric tools (`sn_mcp_*`, `sn_a2a_*`), since ServiceNow's MCP servers and A2A agents only accept JWT tokens
5. Copy the **Client ID** and **Client Secret**

Test it:

```bash
curl -X POST "https://YOUR-INSTANCE.service-now.com/oauth_token.do" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=password&client_id=CLIENT_ID&client_secret=CLIENT_SECRET&username=admin&password=PASSWORD"
```

---

## Audit log and write guardrails

Every write call (create, update, delete and the other mutating tools) is appended to a local JSONL audit
log. Field names are kept in the clear and field values are hashed, so the log is safe to keep.

```env
# Default: ~/.config/nowaikit/audit.jsonl
NOWAIKIT_AUDIT_LOG=/var/log/nowaikit/audit.jsonl
# NOWAIKIT_AUDIT_DISABLED=true
```

A record looks like this:

```json
{
  "ts": "2026-11-19T10:15:30.123Z",
  "instance": "prod",
  "tool": "update_incident",
  "action": "update",
  "table": "incident",
  "sys_id": "9d385017c611228701d22104cc95c371",
  "field_names": ["priority", "assignment_group"],
  "payload_hash": "3f1c...",
  "dry_run": false,
  "result": "ok"
}
```

To ship it to a SIEM, point your log forwarder at the file.

Write guardrails block writes before they reach ServiceNow:

```env
NOWAIKIT_TABLE_DENYLIST=sys_user,sys_properties
NOWAIKIT_FIELD_DENYLIST=incident.caller_id
NOWAIKIT_WRITE_SCOPE_PREFIX=x_acme_
```

Credential fields are always blocked. See the [configuration reference](CONFIGURATION.md) for details.

---

## HTTP server

`nowaikit serve` runs NowAIKit over HTTP for web apps, gateways and clients that connect to a URL.

```bash
nowaikit serve                      # http://127.0.0.1:3000
nowaikit serve --port 8080 --host 0.0.0.0

# Require an API key (do this on anything reachable from a network)
NOWAIKIT_API_KEY=my-secret-key nowaikit serve
```

The same thing without the CLI: `TRANSPORT=http PORT=3000 npx -y nowaikit`. `HTTP_PORT` works as an
alias for `PORT`. Each connected client gets its own MCP session, so many clients can share one server.

| Method | Path | Description |
|--------|------|-------------|
| `POST` / `GET` / `DELETE` | `/mcp` | Streamable HTTP MCP endpoint |
| `GET` | `/sse` | SSE transport (when `TRANSPORT=sse`) |
| `GET` | `/health` (also `/api/health`) | Health, version, transport and tool count |
| `GET` | `/api/tools` | List all tools |
| `GET` | `/api/tools/:name` | One tool's schema |
| `POST` | `/api/tool` | Run a tool: `{ "name": "query_records", "arguments": { "table": "incident", "limit": 5 } }` |
| `GET` | `/api/resources` | List @ resources |
| `GET` | `/api/resource?uri=...` | Read a resource |
| `GET` | `/api/prompts` | List slash commands |
| `GET` | `/api/instances` | List configured instances |
| `POST` | `/api/instances/switch` | Switch the active instance |
| `GET` | `/.well-known/agent.json` | A2A agent card |
| `GET` | `/` | Web dashboard |

Send the key as `Authorization: Bearer <NOWAIKIT_API_KEY>`. App builder guide:
[../clients/lovable/SETUP.md](../clients/lovable/SETUP.md)

---

## Enterprise features

This npm package covers everything above. Single sign-on through your identity provider, central
policy and per-user access in Microsoft 365 Copilot are handled by the hosted NowAIKit gateway, which is
a separate enterprise offering and not part of this package. Contact **enterprise@nowaikit.com**.

---

## Verification and Testing

### Using the wizard

After `nowaikit setup` completes, run `nowaikit doctor`, restart your AI client and test:

```
List my 5 most recent open incidents
```

The AI should call `query_records` on the `incident` table and return results.

### Manual verification

1. Restart your AI client (Claude Desktop, Cursor, etc.)
2. Ask: *"Get the schema for the incident table"*. It should call `get_table_schema`
3. Ask: *"Show me 5 open P1 incidents"*. It should call `query_records`
4. Ask: *"Create a test incident"*. It should be refused while `WRITE_ENABLED=false` (expected)

### Verify slash commands and @ mentions

In Claude Desktop or Cursor, type `/` and you should see the nowaikit slash commands appear in the command palette.

Type `@my-incidents` in a message to pull the incidents assigned to you into context.

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

### Issue 3: Not sure what's wrong

Run `nowaikit doctor`. It checks the instance, login, roles, permission tiers and your AI client configs,
and prints the fix for each failure.

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
- Or add `--allow-write` to the server's `args`
- **Warning**: only use writes in dev/test environments, not production

### Issue 6: "Request timeout" or Slow Responses

**Cause**: Network latency or complex queries

**Solution**:
Raise the timeout to 60 seconds and allow more retries:

```json
"env": {
  "REQUEST_TIMEOUT_MS": "60000",
  "MAX_RETRIES": "5"
}
```

If a developer instance stopped answering, it may be hibernating. `nowaikit doctor` detects that.

---

## Next Steps

- Browse examples: [EXAMPLES.md](../EXAMPLES.md)
- Full client setup for every AI tool: [CLIENT_SETUP.md](CLIENT_SETUP.md)
- App builder (Lovable/Bolt/v0): [../clients/lovable/SETUP.md](../clients/lovable/SETUP.md)
- Desktop app build guide: [../desktop/BUILDING.md](../desktop/BUILDING.md)
- Issues: https://github.com/aartiq/nowaikit/issues

---

## Environment Variables Reference

The complete list is in the [configuration reference](CONFIGURATION.md). The short names from older docs (`SN_INSTANCE_URL`, `SN_USERNAME`, `SN_PASSWORD`, `SN_OAUTH_CLIENT_ID`, `SN_OAUTH_CLIENT_SECRET`, `SN_PERSONA`, `HTTP_PORT`) also work.

### ServiceNow Connection (required)

| Variable | Description | Example |
|----------|-------------|---------|
| `SERVICENOW_INSTANCE_URL` | Instance URL (no trailing slash) | `https://yourco.service-now.com` |
| `SERVICENOW_AUTH_METHOD` | `basic` (default) or `oauth` | `basic` |

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
| `SCRIPTING_ENABLED` | `false` | Changes to business rules, script includes and other scripts (requires WRITE_ENABLED). Reads never need it |
| `NOW_ASSIST_ENABLED` | `false` | Now Assist / Generative AI tools |
| `ATF_ENABLED` | `false` | ATF test execution |
| `FLUENT_ENABLED` | `false` | Local ServiceNow SDK commands behind the `fluent_*` tools |

### Tool Packaging

| Variable | Default | Description |
|----------|---------|-------------|
| `MCP_TOOL_PACKAGE` | `full` | `full`, `service_desk`, `change_coordinator`, `knowledge_author`, `catalog_builder`, `system_administrator`, `platform_developer`, `itom_engineer`, `agile_manager`, `ai_developer`, `portal_developer`, `integration_engineer`, `devops_engineer`, `itam_analyst` |
| `SN_PERSONA` | | Short alias for a package, e.g. `itsm`, `developer`, `admin`. See [Tool packages](TOOL_PACKAGES.md) |
| `MCP_TOOL_DISCOVERY` | | `lean`, `core`, or unset for every tool |

### LLM Provider CLI Overrides

| Variable | Default | Description |
|----------|---------|-------------|
| `NOWAIKIT_CLAUDE_BIN` | `claude` | Path to the `claude` executable when using `--provider claude-cli` |
| `NOWAIKIT_CODEX_BIN` | `codex` | Path to the `codex` executable when using `--provider codex-cli` |

### Multi-Instance

| Variable | Description |
|----------|-------------|
| `SN_INSTANCES_CONFIG` | Path to `instances.json` |
| `SN_INSTANCE_<NAME>_URL` | Instance URL (env-var multi-instance) |
| `SN_INSTANCE_<NAME>_AUTH` | `basic` (default) or `oauth` for that instance |
| `SN_INSTANCE_<NAME>_USERNAME` / `_PASSWORD` / `_CLIENT_ID` / `_CLIENT_SECRET` | Credentials for that instance |
| `SN_DEFAULT_INSTANCE` | Instance to start on |

### HTTP server

| Variable | Default | Description |
|----------|---------|-------------|
| `TRANSPORT` | `stdio` | `stdio`, `sse` or `http` |
| `PORT` (or `HTTP_PORT`) | `3000` | HTTP server port |
| `HOST` | `0.0.0.0` (`127.0.0.1` with `nowaikit serve`) | Bind address |
| `NOWAIKIT_API_KEY` | (none) | Bearer key(s) for the HTTP endpoints |
| `CORS_ORIGIN` | `*` | Allowed CORS origin |

### Audit log

| Variable | Default | Description |
|----------|---------|-------------|
| `NOWAIKIT_AUDIT_LOG` | `~/.config/nowaikit/audit.jsonl` | JSONL file path |
| `NOWAIKIT_AUDIT_DISABLED` | `false` | `true` turns the audit log off |

---

**Need help?** Check [Troubleshooting](#troubleshooting) above or file an issue at https://github.com/aartiq/nowaikit/issues

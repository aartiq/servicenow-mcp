# Multi-Instance Setup Guide

Connect to multiple ServiceNow instances — dev, staging, prod, or multiple customer tenants — from a single MCP session.

## How It Works

Each tool call can target a specific instance by name. The instance manager loads all configured instances at startup and routes calls to the correct `ServiceNowClient`. You can also switch the default instance mid-session using `switch_instance`.

---

## Configuration

### Option 1: `instances.json` File (Recommended)

Create `instances.json` in the project root (or any path — set `SN_INSTANCES_CONFIG`):

```json
{
  "default_instance": "dev",
  "instances": {
    "dev": {
      "instance_url": "https://yourcompany-dev.service-now.com",
      "auth_method": "basic",
      "username": "admin",
      "password": "your_dev_password"
    },
    "staging": {
      "instance_url": "https://yourcompany-stg.service-now.com",
      "auth_method": "oauth",
      "client_id": "your_client_id",
      "client_secret": "your_client_secret",
      "username": "svc_account",
      "password": "svc_password"
    },
    "prod": {
      "instance_url": "https://yourcompany.service-now.com",
      "auth_method": "oauth",
      "client_id": "your_client_id",
      "client_secret": "your_client_secret",
      "username": "svc_prod",
      "password": "svc_password"
    },
    "customer_a": {
      "instance_url": "https://customera.service-now.com",
      "auth_method": "basic",
      "username": "admin",
      "password": "password"
    }
  }
}
```

Point to the file:

```env
SN_INSTANCES_CONFIG=/path/to/instances.json
```

**Add to `.gitignore`** — this file contains credentials:
```
instances.json
```

---

### Option 2: Environment Variables

Define as many instances as needed using the `SN_INSTANCE_<NAME>_*` pattern:

```env
# Dev instance
SN_INSTANCE_DEV_URL=https://yourcompany-dev.service-now.com
SN_INSTANCE_DEV_AUTH=basic
SN_INSTANCE_DEV_USERNAME=admin
SN_INSTANCE_DEV_PASSWORD=dev_password

# Staging instance
SN_INSTANCE_STAGING_URL=https://yourcompany-stg.service-now.com
SN_INSTANCE_STAGING_AUTH=oauth
SN_INSTANCE_STAGING_CLIENT_ID=your_client_id
SN_INSTANCE_STAGING_CLIENT_SECRET=your_secret
SN_INSTANCE_STAGING_USERNAME=svc_account
SN_INSTANCE_STAGING_PASSWORD=svc_password

# Production instance
SN_INSTANCE_PROD_URL=https://yourcompany.service-now.com
SN_INSTANCE_PROD_AUTH=oauth
SN_INSTANCE_PROD_CLIENT_ID=prod_client_id
SN_INSTANCE_PROD_CLIENT_SECRET=prod_secret
SN_INSTANCE_PROD_USERNAME=svc_prod
SN_INSTANCE_PROD_PASSWORD=prod_password

# Set default active instance
SN_DEFAULT_INSTANCE=dev
```

---

### Option 3: Single Instance (Default / Backwards-Compatible)

The original single-instance setup still works — it registers as the `default` instance:

```env
SERVICENOW_INSTANCE_URL=https://yourinstance.service-now.com
SERVICENOW_AUTH_METHOD=basic
SERVICENOW_BASIC_USERNAME=admin
SERVICENOW_BASIC_PASSWORD=password
```

---

## Instance Management Tools

Three built-in core tools manage multi-instance sessions:

### `list_instances`
Shows all configured instances and which one is currently active.

```
You: "Which instances are configured?"
AI uses: list_instances
→ { "current": "dev", "instances": [
    { "name": "dev", "url": "https://yourcompany-dev.service-now.com", "active": true },
    { "name": "prod", "url": "https://yourcompany.service-now.com", "active": false }
  ]}
```

### `switch_instance`
Changes the active instance for the session.

```
You: "Switch to prod"
AI uses: switch_instance { "name": "prod" }
→ { "action": "switched", "active_instance": "prod", "url": "https://yourcompany.service-now.com" }
```

### `get_current_instance`
Shows which instance is currently active.

---

## Per-Call Instance Override

Pass `instance` to any tool to target a specific instance without switching:

```
You: "Get incident INC0001234 from prod but list open P1s from staging"
AI uses: get_incident { "number_or_sysid": "INC0001234", "instance": "prod" }
AI uses: query_records { "table": "incident", "query": "priority=1^state!=6", "instance": "staging" }
```

---

## Multi-Customer / MSP Setup

For managed service providers or consultants working across multiple customer ServiceNow tenants:

```json
{
  "default_instance": "internal",
  "instances": {
    "internal": { "instance_url": "https://mycompany.service-now.com", "auth_method": "basic", ... },
    "client_acme": { "instance_url": "https://acme.service-now.com", "auth_method": "oauth", ... },
    "client_globex": { "instance_url": "https://globex.service-now.com", "auth_method": "oauth", ... }
  }
}
```

```
You: "Compare open P1 incident counts between client_acme and client_globex"
AI uses: query_records { "table": "incident", "query": "priority=1^state!=6", "instance": "client_acme" }
AI uses: query_records { "table": "incident", "query": "priority=1^state!=6", "instance": "client_globex" }
→ { Acme: 3, Globex: 7 }
```

---

## Security Notes

- Add `instances.json` to `.gitignore` — never commit credentials
- Use **OAuth** for production and customer instances — Basic Auth is for dev/PDI only
- `WRITE_ENABLED` and `SCRIPTING_ENABLED` apply globally; set carefully when targeting prod
- Consider running separate NowAIKit processes per customer for strict isolation

---

## See Also

- [CLIENT_SETUP.md](CLIENT_SETUP.md) — AI client configuration for Claude, Cursor, VS Code, etc.
- [docs/TOOLS.md](TOOLS.md) — Full tool reference

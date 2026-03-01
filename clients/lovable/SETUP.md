# Lovable + servicenow-mcp Setup Guide

Connect your ServiceNow instance to apps you build in [Lovable](https://lovable.dev), [Bolt](https://bolt.new), [v0](https://v0.dev), or [Replit](https://replit.com).

## Two Integration Modes

### Mode 1 — servicenow-mcp as data source for built apps (HTTP proxy)

Your Lovable app calls servicenow-mcp's local HTTP API instead of ServiceNow directly. This keeps your credentials safe (no browser exposure) and eliminates CORS issues.

#### Step 1: Start the HTTP server

```bash
# Install servicenow-mcp
git clone https://github.com/aartiq/servicenow-mcp.git && cd servicenow-mcp
npm install && npm run build
cp .env.example .env  # fill in your ServiceNow credentials

# Start the HTTP API server
node dist/http-server.js
# Listening on http://127.0.0.1:3100
```

#### Step 2: Set an API key (optional but recommended)

```bash
# Add to .env:
SERVICENOW_MCP_API_KEY=my-secret-key
HTTP_PORT=3100
```

#### Step 3: Call from your Lovable app

In your Lovable app's code, call the servicenow-mcp proxy:

```typescript
// lib/servicenow.ts
const SERVICENOW_MCP_URL = import.meta.env.VITE_SERVICENOW_MCP_URL || 'http://localhost:3100';
const SERVICENOW_MCP_KEY = import.meta.env.VITE_SERVICENOW_MCP_KEY || '';

export async function callTool<T>(tool: string, params: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(`${SERVICENOW_MCP_URL}/api/tool`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(SERVICENOW_MCP_KEY ? { Authorization: `Bearer ${SERVICENOW_MCP_KEY}` } : {}),
    },
    body: JSON.stringify({ tool, params }),
  });
  const data = await res.json() as { result?: T; error?: string };
  if (!res.ok || data.error) throw new Error(data.error || 'Tool call failed');
  return data.result as T;
}

// Usage:
const incidents = await callTool('list_incidents', { limit: 10, state: 'open' });
```

#### Available API endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health` | Health check + instance info |
| `GET` | `/api/tools` | List all 400+ available tools |
| `POST` | `/api/tool` | Call a tool: `{ "tool": "list_incidents", "params": {} }` |
| `GET` | `/api/resources` | List @ mention resources |
| `GET` | `/api/resource?uri=servicenow://my-incidents` | Read a resource |

---

### Mode 2 — servicenow-mcp as MCP server inside the builder (build-time)

If Lovable/Replit exposes MCP server configuration, add servicenow-mcp so the AI assistant has real ServiceNow schema awareness while generating your app code.

The AI can then:
- Query your actual table schemas to generate correct field names
- Look up real records for realistic UI states
- Validate generated API calls against your live instance

Follow the [Claude Desktop setup](../claude-desktop/SETUP.md) or [Cursor setup](../cursor/SETUP.md) — the same MCP config format works in any compatible builder.

---

## Supabase Edge Function (for deployed Lovable apps)

For apps deployed to production via Lovable's Supabase backend, use this Edge Function to proxy ServiceNow calls server-side:

```typescript
// supabase/functions/servicenow-proxy/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const SERVICENOW_MCP_URL = Deno.env.get('SERVICENOW_MCP_URL') || '';
const SERVICENOW_MCP_KEY = Deno.env.get('SERVICENOW_MCP_API_KEY') || '';

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }

  const body = await req.json() as { tool: string; params?: Record<string, unknown> };

  const upstream = await fetch(`${SERVICENOW_MCP_URL}/api/tool`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SERVICENOW_MCP_KEY}`,
    },
    body: JSON.stringify(body),
  });

  const data = await upstream.json();
  return new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    status: upstream.status,
  });
});
```

Deploy to Supabase Edge Functions and set the `SERVICENOW_MCP_URL` and `SERVICENOW_MCP_API_KEY` secrets.

---

## Environment Variables Reference

| Variable | Description | Default |
|----------|-------------|---------|
| `HTTP_PORT` | Port for the HTTP server | `3100` |
| `HTTP_HOST` | Host to bind (use `0.0.0.0` for network access) | `127.0.0.1` |
| `SERVICENOW_MCP_API_KEY` | Bearer token required on all API requests | (none — no auth) |
| `CORS_ORIGIN` | Allowed CORS origin | `*` |

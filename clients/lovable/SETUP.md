# Lovable and NowAIKit setup guide

Connect your ServiceNow instance to apps you build in [Lovable](https://lovable.dev), [Bolt](https://bolt.new), [v0](https://v0.dev), or [Replit](https://replit.com).

## Two Integration Modes

### Mode 1: NowAIKit as a data source for built apps (HTTP proxy)

Your Lovable app calls nowaikit's local HTTP API instead of ServiceNow directly. This keeps your credentials safe (no browser exposure) and eliminates CORS issues.

#### Step 1: Start the HTTP server

```bash
# Install NowAIKit and connect it to ServiceNow
npm install -g nowaikit
nowaikit setup

# Start the HTTP API server
nowaikit serve
# Listening on http://127.0.0.1:3000
```

#### Step 2: Set an API key (optional but recommended)

```bash
# Add to .env:
NOWAIKIT_API_KEY=my-secret-key
PORT=3000
```

#### Step 3: Call from your Lovable app

In your Lovable app's code, call the nowaikit proxy:

```typescript
// lib/servicenow.ts
const NOWAIKIT_URL = import.meta.env.VITE_NOWAIKIT_URL || 'http://localhost:3000';
const NOWAIKIT_KEY = import.meta.env.VITE_NOWAIKIT_KEY || '';

export async function callTool<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(`${NOWAIKIT_URL}/api/tool`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(NOWAIKIT_KEY ? { Authorization: `Bearer ${NOWAIKIT_KEY}` } : {}),
    },
    body: JSON.stringify({ name, arguments: args }),
  });
  const data = await res.json() as { result?: T; error?: string };
  if (!res.ok || data.error) throw new Error(data.error || 'Tool call failed');
  return data.result as T;
}

// Usage:
const incidents = await callTool('query_records', { table: 'incident', query: 'active=true', limit: 10 });
```

#### Available API endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Health check, version and tool count |
| `GET` | `/api/tools` | List all 500+ available tools |
| `POST` | `/api/tool` | Call a tool: `{ "name": "query_records", "arguments": { "table": "incident" } }` |
| `GET` | `/api/resources` | List @ mention resources |
| `GET` | `/api/resource?uri=servicenow://my-incidents` | Read a resource |

---

### Mode 2: NowAIKit as an MCP server inside the builder (build-time)

If Lovable/Replit exposes MCP server configuration, add nowaikit so the AI assistant has real ServiceNow schema awareness while generating your app code.

The AI can then:
- Query your actual table schemas to generate correct field names
- Look up real records for realistic UI states
- Validate generated API calls against your live instance

Follow the [Claude Desktop setup](../claude-desktop/SETUP.md) or [Cursor setup](../cursor/SETUP.md). The same MCP config format works in any compatible builder.

---

## Supabase Edge Function (for deployed Lovable apps)

For apps deployed to production via Lovable's Supabase backend, use this Edge Function to proxy ServiceNow calls server-side:

```typescript
// supabase/functions/servicenow-proxy/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const NOWAIKIT_URL = Deno.env.get('NOWAIKIT_URL') || '';
const NOWAIKIT_KEY = Deno.env.get('NOWAIKIT_API_KEY') || '';

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

  const body = await req.json() as { name: string; arguments?: Record<string, unknown> };

  const upstream = await fetch(`${NOWAIKIT_URL}/api/tool`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${NOWAIKIT_KEY}`,
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

Deploy to Supabase Edge Functions and set the `NOWAIKIT_URL` and `NOWAIKIT_API_KEY` secrets.

---

## Environment Variables Reference

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` (or `HTTP_PORT`) | Port for the HTTP server | `3000` |
| `HOST` | Host to bind (use `0.0.0.0` for network access) | `127.0.0.1` with `nowaikit serve` |
| `NOWAIKIT_API_KEY` | Bearer token required on all API requests | (none, no auth) |
| `CORS_ORIGIN` | Allowed CORS origin | `*` |

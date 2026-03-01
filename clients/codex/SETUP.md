# OpenAI Codex / GPT-4.1 Setup Guide

Integrate the ServiceNow MCP server with OpenAI Codex or GPT-4.1 using function calling.

## How It Works

The Python client in this directory:
1. Spawns the MCP server as a subprocess
2. Fetches all tool definitions and converts them to OpenAI function schemas
3. Sends your query to GPT-4.1 with the tools available
4. Executes any tool calls the model makes against the live MCP server
5. Returns the final answer

## Prerequisites

- Node.js 20+ and the server built (`npm install && npm run build` from repo root)
- Python 3.9+
- OpenAI API key

## Step 1: Install Python Dependencies

```bash
cd clients/codex
pip install openai python-dotenv
```

## Step 2: Configure Credentials

### Basic Auth

```bash
cp .env.basic.example .env
```

Edit `.env`:
```env
SERVICENOW_INSTANCE_URL=https://yourinstance.service-now.com
SERVICENOW_AUTH_METHOD=basic
SERVICENOW_BASIC_USERNAME=your_username
SERVICENOW_BASIC_PASSWORD=your_password
WRITE_ENABLED=false
OPENAI_API_KEY=your_openai_api_key

# Path to the built MCP server (relative to this directory)
MCP_SERVER_PATH=../../dist/server.js
```

### OAuth

```bash
cp .env.oauth.example .env
```

Edit `.env`:
```env
SERVICENOW_INSTANCE_URL=https://yourinstance.service-now.com
SERVICENOW_AUTH_METHOD=oauth
SERVICENOW_OAUTH_CLIENT_ID=your_client_id
SERVICENOW_OAUTH_CLIENT_SECRET=your_client_secret
SERVICENOW_OAUTH_USERNAME=your_username
SERVICENOW_OAUTH_PASSWORD=your_password
WRITE_ENABLED=false
OPENAI_API_KEY=your_openai_api_key
MCP_SERVER_PATH=../../dist/server.js
```

## Step 3: Run

```bash
python servicenow_openai_client.py
```

The client will prompt you to enter a query, then use GPT-4.1 with ServiceNow tools to answer it.

## Example Queries

```
List my top 5 open P1 incidents
Show me the last 10 change requests
Search the knowledge base for password reset procedures
Summarize incident INC0001234
```

## Enable Writes

Set `WRITE_ENABLED=true` in `.env` to allow creating and updating records:

```env
WRITE_ENABLED=true
```

Then queries like the following will work:
```
Create a P3 incident: "Printer on floor 3 is not working"
```

## Tool Package Selection

Set `MCP_TOOL_PACKAGE` in `.env` to load only role-relevant tools:

```env
MCP_TOOL_PACKAGE=service_desk
```

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `ModuleNotFoundError` | Run `pip install openai python-dotenv` |
| Server not found | Check `MCP_SERVER_PATH` in `.env`; run `npm run build` |
| Auth errors | Verify instance URL and credentials |
| No tool calls | Try a more specific question about ServiceNow records |

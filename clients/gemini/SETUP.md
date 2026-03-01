# Google Gemini / Vertex AI Setup Guide

Integrate the ServiceNow MCP server with Google Gemini (API) or Vertex AI using function calling.

## How It Works

The Python client in this directory:
1. Spawns the MCP server as a subprocess
2. Converts MCP tool schemas to Gemini function declarations
3. Sends your query to Gemini with the tools available
4. Executes tool calls the model makes against the live MCP server
5. Returns the final answer

## Prerequisites

- Node.js 20+ and the server built (`npm install && npm run build` from repo root)
- Python 3.9+
- Gemini API key (for Gemini API) or GCP project (for Vertex AI)

## Gemini API Setup

### Step 1: Install Dependencies

```bash
cd clients/gemini
pip install google-generativeai python-dotenv
```

### Step 2: Configure Credentials

#### Basic Auth

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
GEMINI_API_KEY=your_gemini_api_key
MCP_SERVER_PATH=../../dist/server.js
```

#### OAuth

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
GEMINI_API_KEY=your_gemini_api_key
MCP_SERVER_PATH=../../dist/server.js
```

### Step 3: Run

```bash
python servicenow_gemini_client.py
```

---

## Vertex AI Setup

For Vertex AI, GCP handles authentication — ServiceNow credentials still come from env vars.

### Step 1: Install Dependencies

```bash
pip install google-cloud-aiplatform python-dotenv
```

### Step 2: Authenticate with GCP

```bash
# Option A: User authentication (development)
gcloud auth application-default login

# Option B: Service account (production)
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account-key.json
```

### Step 3: Configure

Add to `.env`:
```env
GCP_PROJECT_ID=your_gcp_project_id
GCP_LOCATION=us-central1

# ServiceNow credentials (same as above)
SERVICENOW_INSTANCE_URL=https://yourinstance.service-now.com
SERVICENOW_AUTH_METHOD=basic
SERVICENOW_BASIC_USERNAME=your_username
SERVICENOW_BASIC_PASSWORD=your_password
WRITE_ENABLED=false
```

### Step 4: Run

The `servicenow_gemini_client.py` file supports both Gemini API and Vertex AI. Set `USE_VERTEX=true` in `.env` to switch to Vertex AI mode.

---

## Example Queries

```
Show me all critical incidents from the last 24 hours
List pending change requests for this weekend
Search knowledge base for network troubleshooting guides
What are the top 5 assignment groups by open incident count?
```

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `google.generativeai not found` | Run `pip install google-generativeai` |
| API key errors | Check `GEMINI_API_KEY` in `.env` |
| Vertex auth errors | Run `gcloud auth application-default login` |
| Server not found | Check `MCP_SERVER_PATH`; run `npm run build` |

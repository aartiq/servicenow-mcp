# Now Assist / AI Integration Guide (Latest Release)

This guide covers the 10 Now Assist and AI tools available when `NOW_ASSIST_ENABLED=true`. These tools use ServiceNow's latest release AI APIs.

## Prerequisites

1. ServiceNow latest release instance
2. Now Assist license activated on the instance
3. `NOW_ASSIST_ENABLED=true` in your environment

```env
NOW_ASSIST_ENABLED=true
```

## Available Tools

### Natural Language Query (NLQ)

`nlq_query` translates plain English questions into ServiceNow queries and returns results.

```
# Ask the AI assistant:
How many P1 incidents were opened this week?
→ Uses nlq_query internally, returns structured results
```

API: `POST /api/sn_nl_text_to_value/text_query`

### AI Search

`ai_search` performs semantic search across knowledge base, catalog, incidents, and other sources.

```
ai_search: "how to reset VPN access" across KB and catalog
→ Returns semantically ranked results
```

API: `GET /api/now/ai_search/search`

### Generate Summary

`generate_summary` creates an AI-written summary of any record.

```
Summarize incident INC0001234
→ AI generates natural language summary of the incident history, impact, and current status
```

API: `POST /api/sn_assist/skill/invoke` (summarization skill)

### Suggest Resolution

`suggest_resolution` analyzes an incident and recommends resolution steps based on similar past incidents.

```
Suggest resolution for incident INC0001234
→ Returns recommendation with confidence score and similar incidents
```

### Categorize Incident (Predictive Intelligence)

`categorize_incident` uses the Predictive Intelligence engine to predict category, assignment group, and priority.

```
Categorize: "Outlook won't open emails since Windows update"
→ {category: "Email", assignment_group: "Desktop Support", priority: 3, confidence: 0.89}
```

API: `POST /api/sn_ml/solution/{id}/predict` (LightGBM algorithm)

### Agentic Playbooks

`trigger_agentic_playbook` invokes a Now Assist Agentic Playbook — context-aware AI agents that can take multi-step actions.

```
trigger_agentic_playbook: playbook_sys_id="<sys_id>", context={incident_sys_id: "..."}
```

API: `POST /api/sn_assist/playbook/trigger`

This is a latest release feature. Agentic Playbooks allow Now Assist to autonomously handle workflows like incident triage, change advisory, and HR case management.

### Microsoft Copilot 365 Integration

`get_ms_copilot_topics` lists Virtual Agent topics exposed to Microsoft Copilot 365 via the Custom Engine Agent bridge.

### Virtual Agent Streaming

`get_virtual_agent_stream` gets streaming Virtual Agent responses using the ServiceNow Streaming API.

### Predictive Intelligence Models

`get_pi_models` lists available Predictive Intelligence solutions/models on your instance.

## Configuration Example

```env
# .env for Now Assist developer
SERVICENOW_INSTANCE_URL=https://yourinstance.service-now.com
SERVICENOW_AUTH_METHOD=oauth
SERVICENOW_OAUTH_CLIENT_ID=your_client_id
SERVICENOW_OAUTH_CLIENT_SECRET=your_client_secret
SERVICENOW_OAUTH_USERNAME=your_username
SERVICENOW_OAUTH_PASSWORD=your_password

NOW_ASSIST_ENABLED=true
MCP_TOOL_PACKAGE=ai_developer
```

## Latest API References

| API | Endpoint | Purpose |
|-----|----------|---------|
| Now Assist Skills | `POST /api/sn_assist/skill/invoke` | Generative AI skills |
| Agentic Playbooks | `POST /api/sn_assist/playbook/trigger` | Multi-step AI agents  |
| AI Search | `GET /api/now/ai_search/search` | Semantic search |
| Predictive Intelligence | `POST /api/sn_ml/solution/{id}/predict` | Classification / prediction |
| NLQ | `POST /api/sn_nl_text_to_value/text_query` | Natural language queries |
| MS Copilot Bridge | `/api/sn_assist/copilot/topics` | Copilot 365 integration  |
| VA Streaming | `/api/sn_cs/stream` | Streaming VA responses  |

## Notes

- Predictive Intelligence models must be trained on your instance before use
- Agentic Playbooks require Now Assist Pro license on the latest release
- AI Search indexes are updated asynchronously — newly created records may not appear immediately
- `generate_summary` and `suggest_resolution` may be rate-limited depending on your Now Assist subscription tier

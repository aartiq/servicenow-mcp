# Now Assist (Otto) and AI guide

NowAIKit covers ServiceNow's AI platform from several angles: the Now Assist (Otto) APIs, Now Assist
skills, AI agents in AI Agent Studio, AI Control Tower governance, Knowledge Graph, and the instance's
own MCP servers and A2A agents (Action Fabric). This page lists the tools by area and what each one
needs. Every tool and its parameters are in the [tool reference](TOOLS.md).

## What you need

| Area | Needs |
|------|-------|
| Now Assist APIs, skills, playbooks | `NOW_ASSIST_ENABLED=true` (or `--allow-agentic`) and the matching licence on the instance |
| AI agent reads, AI Control Tower, Knowledge Graph, Otto status | Nothing extra: these are read-only |
| Anything that changes the instance (create skill or agent, attach tool, expose agent) | `WRITE_ENABLED=true` as well |
| Action Fabric (`sn_mcp_*`, `sn_a2a_*`) | An OAuth sign-in with JWT tokens, see below |

```env
NOW_ASSIST_ENABLED=true
MCP_TOOL_PACKAGE=ai_developer   # or SN_PERSONA=ai
```

## Now Assist APIs

All of these need `NOW_ASSIST_ENABLED=true`.

| Tool | What it does |
|------|--------------|
| `nlq_query` | Ask a plain-English question and get structured data back (ServiceNow NLQ API) |
| `ai_search` | Semantic search across knowledge, catalog and incidents (AI Search) |
| `categorize_incident` | Suggest category, assignment group and priority from similar resolved incidents |
| `get_virtual_agent_topics` | List Virtual Agent topics |
| `get_ms_copilot_topics` | List the Virtual Agent topics behind a Microsoft Copilot integration |
| `get_pi_models` | List Predictive Intelligence solutions |

## Summaries, sentiment and drafted replies

These use the matching Now Assist skill when the instance has it. When it doesn't, they return the
assembled record and activity so your AI can do the work itself.

| Tool | What it does |
|------|--------------|
| `summarize_record` | Summarize an incident, case or other record |
| `get_case_sentiment` | Customer sentiment on a CSM case |
| `generate_case_activity_response` | Draft an agent reply for a CSM case |
| `generate_csm_resolution_notes` | Draft CSM resolution notes |
| `check_hr_eligibility` | Check an employee's eligibility for an HR service |

For incident work, `investigate_incident` returns the incident, similar recent incidents, the affected
CI and related knowledge in one call, and `ml_similar_incidents` finds past incidents to base a fix on.

## Now Assist skills

| Tool | What it does |
|------|--------------|
| `list_now_assist_skills`, `get_now_assist_skill` | Read skill definitions |
| `create_now_assist_skill` | Create a draft skill (also needs `WRITE_ENABLED`) |
| `test_now_assist_skill` | Run a skill with test input |

## AI agents and AI Agent Studio

| Tool | What it does |
|------|--------------|
| `list_ai_agents`, `get_ai_agent` | Agents (`sn_aia_agent`) with config, tools, versions and ACLs |
| `list_agent_use_cases` | Agentic workflows (`sn_aia_usecase`) |
| `create_ai_agent`, `create_agentic_workflow` | Create agents and workflows (`NOW_ASSIST_ENABLED` and `WRITE_ENABLED`) |
| `list_agent_tools`, `attach_agent_tool`, `detach_agent_tool` | The tools an agent can call (attach and detach need `WRITE_ENABLED`) |
| `list_agent_triggers` | Record, scheduled and channel triggers |
| `get_agent_versions` | Version history |
| `list_agent_memory` | Long-term memory entries |
| `list_ai_agent_executions`, `get_ai_agent_execution`, `get_agent_execution_trace` | Execution plans and a step-by-step trace of a run |
| `list_agent_evaluations`, `get_evaluation_results` | Evaluation runs and per-metric results |
| `list_external_agents` | Third-party agents registered for A2A |

## Playbooks

| Tool | What it does |
|------|--------------|
| `list_playbooks` | List playbook definitions |
| `create_playbook` | Create a playbook that chains tool calls (`NOW_ASSIST_ENABLED` and `WRITE_ENABLED`) |
| `execute_playbook` | Run a playbook step by step, with `dry_run` support (`NOW_ASSIST_ENABLED`) |

## AI Control Tower, Knowledge Graph and Otto status

All read-only.

| Tool | What it does |
|------|--------------|
| `get_otto_status` | One report of what AI is installed and switched on |
| `list_otto_channels` | Where Otto is deployed (panel, Virtual Agent, voice) |
| `list_ai_assets`, `get_ai_asset` | AI Control Tower inventory with governance, lifecycle and risk |
| `list_ai_approval_requests` | AI assessment and approval requests |
| `get_ai_usage` | AI usage counts |
| `list_ai_modified_records` | Records changed by AI |
| `list_kg_context_configs`, `describe_kg_schema` | Knowledge Graph configuration and schema |

## Action Fabric: the instance's MCP servers and A2A agents

NowAIKit can act as a client to ServiceNow's own MCP servers (MCP Server Console and the out-of-box
ITSM, ITOM, CMDB and SPM servers) and talk to ServiceNow AI agents over A2A.

| Tool | What it does |
|------|--------------|
| `sn_mcp_status` | Check endpoint health and whether your sign-in is ready (start here) |
| `sn_mcp_list_servers` | MCP servers defined on the instance |
| `sn_mcp_list_tools` | The tools a server exposes |
| `sn_mcp_call_tool` | Call one of those tools |
| `sn_mcp_activate_server` | Turn a server on or off and attach tools (`WRITE_ENABLED`) |
| `sn_a2a_list_agents` | AI agents and whether each is exposed over A2A |
| `sn_a2a_get_agent_card` | An agent's A2A card |
| `sn_a2a_send_message`, `sn_a2a_get_task` | Talk to an agent and follow up on its task |
| `sn_a2a_expose_agent` | Allow or block third-party access to an agent (`WRITE_ENABLED`) |

**Sign-in.** ServiceNow's MCP and A2A endpoints only accept JWT access tokens from an OAuth sign-in.
`nowaikit setup` creates the OAuth app with the JWT token format and, where the instance has them, the
`useraccount` and `a2aauthscope` scopes. Then `nowaikit auth login` gives you one token that works for
the REST API, MCP and A2A. If you made the OAuth app yourself, set its **Token Format** to **JWT** and
sign in again. Basic auth can't reach these endpoints.

**A2A mode.** A2A works in both of the instance's modes: in synchronous mode the agent answers directly; in asynchronous mode (the default) NowAIKit registers a callback address that never resolves, so no data leaves the instance, and polls for the answer. Set NOWAIKIT_A2A_CALLBACK_URL to use your own callback endpoint instead.

## Configuration example

```env
SERVICENOW_INSTANCE_URL=https://yourinstance.service-now.com
SERVICENOW_AUTH_METHOD=oauth
SERVICENOW_OAUTH_CLIENT_ID=your_client_id
SERVICENOW_OAUTH_CLIENT_SECRET=your_client_secret

NOW_ASSIST_ENABLED=true
MCP_TOOL_PACKAGE=ai_developer
```

Then run `nowaikit auth login` once, and `nowaikit doctor` to check it.

## Notes

- Predictive Intelligence solutions must be trained on your instance before they predict anything.
- AI Search indexes update asynchronously, so new records may not show up straight away.
- Generative tools may be rate-limited by your Now Assist subscription.

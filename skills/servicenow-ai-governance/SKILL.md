---
name: servicenow-ai-governance
description: Inventory and govern AI on a ServiceNow instance with NowAIKit MCP tools. List Otto (Now Assist) skills, AI agents, model providers, who can run each agent, runtime usage, AI policies and MCP exposure, and use the AI kill switch safely. Use when the user asks about AI governance, an AI inventory, which LLM a skill uses, who can run an agent, AI usage, or how to switch AI off in an incident.
license: MIT
compatibility: Needs the NowAIKit MCP server (nowaikit 5.0 or later)
---

# ServiceNow AI governance

Build a governance view of every AI asset on the instance, then act only where the user asks.

## Workflow

1. **Status.** `get_otto_status` for what is installed and switched on. Run `ai_kill_switch` in status mode to see if AI is currently contained.
2. **Inventory.** `list_ai_assets` for skills, agents and related assets. `list_ai_inventory_cis` compares them with the AI inventory CIs and shows mode gaps (assets missing from inventory or recorded with the wrong mode).
3. **Providers.** `get_ai_model_providers` for the LLM behind each skill: Now LLM, Azure OpenAI, Anthropic Claude or Gemini. Flag skills that send data to an external provider.
4. **Access.** `get_agent_access_matrix` for who can run each agent (roles, groups, users). Look for agents open to everyone.
5. **Usage.** `get_ai_runtime_metrics` for run counts, failures and trends. Unused or failing assets are review candidates.
6. **Controls.** `list_ai_policies` for guardrail and data policies, `list_ai_approval_requests` for pending approvals, and `get_mcp_exposure` for what the instance exposes through MCP and to whom.
7. **Report.** One table per area, then the top risks (external providers with sensitive data, open agents, missing policies, inventory gaps) with a suggested owner.

## Kill switch
- Reading status is safe at any time.
- `contain` and `restore` need `WRITE_ENABLED=true`, `confirm=true` and a `reason`. Show the user exactly what will be switched off and ask before calling it.

## Rules
- Read-only first. This skill reports; it does not change skills, agents or policies.
- Treat an unknown instance as production.
- Do not guess a provider or access level. If a tool returns nothing, say so.
- Link every record using the `record_url` the tools return. Never invent URLs.

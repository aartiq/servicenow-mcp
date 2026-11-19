import type { CapabilityDefinition } from '../types.js';
import { assessmentPrompt } from '../skill-template.js';

const capability: CapabilityDefinition = {
  name: 'ai-governance-audit',
  title: 'AI Governance Audit',
  description:
    'AI governance audit: AI Control Tower assets and approvals, AI agents and who can run each one, Otto skills and the LLM provider each uses, Guardian and guardrails, MCP servers and A2A exposure, AI CIs, and runtime health, with a score and links',
  category: 'scan',
  arguments: [],
  recommendedTools: [
    'get_otto_status', 'list_ai_assets', 'list_ai_approval_requests', 'get_ai_model_providers', 'get_agent_access_matrix',
    'list_ai_policies', 'list_external_agents', 'get_mcp_exposure', 'list_ai_inventory_cis', 'get_ai_runtime_metrics', 'get_ai_usage',
  ],
  buildPrompt() {
    return assessmentPrompt({
      title: 'AI governance audit',
      purpose: 'This audit shows every AI asset on the instance and whether it is governed: inventoried, approved, guarded, access-controlled and observed. It is written for the CIO, the AI governance lead and risk.',
      gather: [
        '`get_otto_status` for the AI apps, key properties and counts.',
        '`list_ai_assets` and `list_ai_approval_requests` for the AI Control Tower inventory, governance status, risk and open approvals.',
        '`get_ai_model_providers` for the LLM provider behind each Otto skill and agent capability (Now LLM against third-party providers such as Azure OpenAI, Anthropic Claude or Google Gemini).',
        '`get_agent_access_matrix` for who can run each AI agent: execute ACLs, roles, A2A exposure, run-as user and role masking.',
        '`list_ai_policies` for Guardian, sensitive-topic filters and guardrail properties.',
        '`list_external_agents` and `get_mcp_exposure` for A2A agents, external providers, MCP servers and tools, and the OAuth clients that reach them.',
        '`list_ai_inventory_cis` (mode gaps) for AI and MCP CIs without an asset and AI assets without a CI.',
        '`get_ai_runtime_metrics` and `get_ai_usage` for executions, failures, latency, tokens and Now Assist usage.',
      ],
      directSections: ['otto_status', 'ai_assets', 'ai_approval_requests', 'ai_model_providers', 'agent_access_matrix', 'ai_policies', 'external_agents', 'mcp_exposure', 'ai_inventory_gaps', 'ai_runtime_30d', 'ai_usage'],
      analyse: [
        'Inventory coverage: AI assets with no governance record, no owner, or still "In review"; AI CIs with no asset and assets with no CI.',
        'Approvals: open or overdue AI approval requests and high-risk assets already deployed.',
        'Providers: how many skills send data to third-party LLM providers, which providers, and whether that fits a data-residency rule. Flag skills on providers the customer may not have approved.',
        'Access: agents that fall back to the wildcard execute ACL, agents open to any signed-in user, agents with missing roles, A2A-exposed agents and their run-as user, and agents without role masking. Note that Brazil makes AI agent access deny-by-default.',
        'Guardrails: Guardian off or in log-only mode, sensitive-topic filters inactive, guardrail properties left at defaults.',
        'Exposure: active MCP servers, tools that look write-capable, external agent providers and the OAuth clients (token format, grant type) that can reach them.',
        'Runtime: agents with failures, slow agents (p95), unused agents still active, and token use.',
      ],
      scoring: [
        'Inventory and approval 25 points, access control 25, providers and data residency 15, guardrails 15, exposure 10, runtime health 10.',
        'Take points off in proportion to the share of assets or agents affected, not per item.',
      ],
      sections: [
        'Executive summary with the score and the three biggest risks',
        'AI inventory and approvals',
        'Model providers by skill',
        'Who can run each agent',
        'Guardrails',
        'MCP and A2A exposure',
        'Runtime health',
        'Findings register (one line per finding with severity, ID, link, effort)',
        '30, 60 and 90 day plan',
        'Data coverage',
      ],
      ask: 'Run an AI governance audit of my ServiceNow instance.',
    });
  },
};

export default capability;

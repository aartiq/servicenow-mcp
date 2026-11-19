import type { CapabilityDefinition } from '../types.js';
import { assessmentPrompt } from '../skill-template.js';

const capability: CapabilityDefinition = {
  name: 'mcp-exposure-review',
  title: 'MCP and A2A Exposure Review',
  description:
    'What the instance exposes to outside AI and what outside AI it calls: MCP Server Console servers and tools, A2A-exposed agents and their access, external agent providers and runs, OAuth clients and token format, and the agent MCP properties',
  category: 'scan',
  arguments: [],
  recommendedTools: ['get_mcp_exposure', 'list_external_agents', 'list_external_agent_runs', 'get_agent_access_matrix', 'get_integration_auth_posture', 'get_ai_runtime_metrics'],
  buildPrompt() {
    return assessmentPrompt({
      title: 'MCP and A2A exposure review',
      purpose: 'This review maps every way outside AI can reach the instance (MCP servers, A2A agents, OAuth clients) and every outside AI the instance calls, so a security architect can decide what to keep, restrict or switch off.',
      gather: [
        '`get_mcp_exposure` for MCP servers, their tools (with write-capable ones flagged), the external MCP registry, A2A-exposed agents, external agent providers, JWT OAuth clients, MCP roles and properties.',
        '`list_external_agents` and `list_external_agent_runs` for A2A providers, cards and recent traffic.',
        '`get_agent_access_matrix` for who can run the exposed agents and under which user.',
        '`get_integration_auth_posture` for OAuth client grant types and token formats.',
        '`get_ai_runtime_metrics` for MCP and A2A call volumes and errors.',
      ],
      directSections: ['mcp_exposure', 'external_agents', 'external_agent_runs', 'a2a_agent_access', 'integration_auth_posture', 'mcp_usage_30d'],
      analyse: [
        'An exposure map: each MCP server and A2A agent, who can call it (OAuth client, role) and what it can do.',
        'Write-capable tools exposed over MCP and agents that act as a fixed run-as user.',
        'OAuth clients with broad access, the password grant, opaque tokens where JWT is required, or no PKCE.',
        'Outbound: external agent providers and MCP servers the instance calls, and the credentials they use.',
        'Properties: sn_aia.enable_mcp_tool and sn_aia.external_agents.enabled, and whether Guardian checks external agent responses.',
        'Traffic: A2A and MCP call volumes and errors.',
      ],
      scoring: [
        'Inbound exposure control 40 points, OAuth client hygiene 25, outbound control 20, monitoring 15.',
      ],
      sections: ['Executive summary with the score', 'Exposure map', 'MCP servers and tools', 'A2A agents and access', 'OAuth clients', 'Outbound AI calls', 'Findings register', 'Recommendations', 'Data coverage'],
      ask: 'Review what my ServiceNow instance exposes to outside AI over MCP and A2A.',
    });
  },
};

export default capability;

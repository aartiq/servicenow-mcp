import type { CapabilityDefinition } from '../types.js';
import { assessmentPrompt } from '../skill-template.js';

const capability: CapabilityDefinition = {
  name: 'integration-auth-audit',
  title: 'Integration Authentication Audit',
  description:
    'Integration authentication audit for the Basic auth restriction: allowlist state, accounts that will break, OAuth clients by grant and token format (JWT for MCP and A2A), credential aliases, outbound Basic auth and failed logins, with an OAuth migration plan',
  category: 'scan',
  arguments: [],
  recommendedTools: ['get_integration_auth_posture', 'list_oauth_applications', 'list_credential_aliases', 'list_rest_messages', 'get_mcp_exposure', 'query_records'],
  buildPrompt() {
    return assessmentPrompt({
      title: 'Integration authentication audit',
      purpose: 'ServiceNow is restricting Basic auth for inbound API calls through an allowlist, with tracking and enforce modes, ahead of deprecation. This audit shows which integrations will break when the default decision flips and how to move each to OAuth. It is for the integration team and security.',
      gather: [
        '`get_integration_auth_posture` for the restriction properties, allowlisted roles and users, web service access only accounts, the Basic auth usage tracker (needs admin), OAuth clients by grant type and token format, CIMD clients, credential aliases and recent failed logins.',
        '`list_credential_aliases` and `list_rest_messages` for outbound connections, and `query_records` on `sys_rest_message_fn` (authentication_type=basic) for outbound calls still on Basic auth.',
        '`get_mcp_exposure` for the OAuth clients that reach the MCP Server Console and A2A (they need JWT tokens).',
        '`query_records` on `sys_user` for web service access only accounts and their last login.',
      ],
      directSections: ['integration_auth_posture', 'credential_aliases', 'rest_messages', 'basic_auth_rest_messages', 'mcp_exposure', 'inbound_api_users_by_last_login'],
      analyse: [
        'Restriction state: tracking or enforce, the default decision and enforcement date, and what changes when the decision flips.',
        'Accounts at risk: Basic auth users who are not on the allowlist. When the usage tracker is readable, use its rows; when it is not, say so and list the integration-style accounts instead.',
        'OAuth hygiene: clients on the password grant, clients with very long token lifespans, public clients without PKCE, inactive or never-used clients.',
        'MCP and A2A readiness: whether a JWT client exists for the MCP Server Console and A2A.',
        'Outbound: REST methods and aliases that send Basic credentials.',
        'Dormant integration accounts (no login in 90 days) and accounts with failed logins.',
      ],
      scoring: [
        'Basic auth readiness 40 points, OAuth client hygiene 25, MCP and A2A readiness 15, outbound credentials 10, dormant and failing accounts 10.',
      ],
      sections: ['Executive summary with the score', 'Basic auth restriction state', 'Integrations that will break', 'OAuth clients', 'MCP and A2A access', 'Outbound credentials', 'Findings register', 'Migration plan: one step per integration', 'Data coverage'],
      ask: 'Audit integration authentication on my ServiceNow instance and tell me what breaks when Basic auth is restricted.',
    });
  },
};

export default capability;

/**
 * A2A Agent Card generator — exposes NowAIKit capabilities as an A2A agent.
 * Maps MCP tool domains to A2A skills.
 */
import type { AgentCard, AgentSkill } from './types.js';
import { getTools } from '../tools/index.js';
import { isAuthRequired } from '../transport/auth-middleware.js';
import { VERSION } from '../utils/version.js';

/** Categorize tools into skills by domain prefix. */
const DOMAIN_MAP: Record<string, { name: string; description: string; tags: string[] }> = {
  incident: { name: 'Incident Management', description: 'Create, update, resolve, and close incidents. Triage P1/P2 issues.', tags: ['itsm', 'incident'] },
  problem: { name: 'Problem Management', description: 'Create and manage problem records, find root causes.', tags: ['itsm', 'problem'] },
  change: { name: 'Change Management', description: 'Create, approve, and manage change requests. Risk assessment and CAB.', tags: ['itsm', 'change'] },
  knowledge: { name: 'Knowledge Management', description: 'Search, create, and publish knowledge articles.', tags: ['knowledge', 'kb'] },
  catalog: { name: 'Service Catalog', description: 'Browse, manage, and order catalog items.', tags: ['catalog', 'request'] },
  cmdb: { name: 'CMDB Management', description: 'Search CIs, view relationships, health dashboards, reconciliation.', tags: ['cmdb', 'itom'] },
  security: { name: 'Security Operations', description: 'Manage security incidents, vulnerabilities, compliance, GRC risks.', tags: ['secops', 'security', 'grc'] },
  hrsd: { name: 'HR Service Delivery', description: 'HR cases, onboarding, offboarding, employee lifecycle.', tags: ['hrsd', 'hr'] },
  csm: { name: 'Customer Service Management', description: 'CSM cases, accounts, contacts, SLAs.', tags: ['csm', 'customer'] },
  flow: { name: 'Flow Designer', description: 'Create and manage flows, subflows, and process automations.', tags: ['flow', 'automation'] },
  script: { name: 'Platform Scripting', description: 'Business rules, script includes, client scripts, ACLs.', tags: ['scripting', 'development'] },
  ml: { name: 'Machine Learning', description: 'Anomaly detection, change risk prediction, incident forecasting.', tags: ['ml', 'ai'] },
  atf: { name: 'Automated Testing', description: 'ATF test suites, test execution, failure analysis.', tags: ['testing', 'atf'] },
  devops: { name: 'DevOps', description: 'Pipelines, deployments, DevOps insights.', tags: ['devops', 'cicd'] },
  report: { name: 'Reporting & Analytics', description: 'Generate reports, dashboards, KPIs, trend analysis.', tags: ['reporting', 'analytics'] },
  fluent: { name: 'Fluent Query & SDK', description: 'GlideQuery-style queries, batch operations, now-sdk integration.', tags: ['fluent', 'query', 'sdk'] },
  now_assist: { name: 'Now Assist Skills', description: 'Create, manage, and test Now Assist AI skills.', tags: ['now-assist', 'ai', 'skills'] },
  ai_agent: { name: 'AI Agents', description: 'Create and manage AI agents with automatic ACL generation.', tags: ['ai-agent', 'aiaf'] },
  orchestration: { name: 'Multi-Agent Orchestration', description: 'Create and execute multi-step playbooks chaining tools.', tags: ['orchestration', 'playbook'] },
  discover: { name: 'Schema Discovery', description: 'Discover table schemas and generate dynamic CRUD tools.', tags: ['discovery', 'schema'] },
};

/** Build agent card from current tool definitions. */
export function buildAgentCard(): AgentCard {
  const tools = getTools();
  const baseUrl = `http://${process.env.HOST || 'localhost'}:${process.env.PORT || '3000'}`;

  // Group tools by domain
  const skillMap = new Map<string, string[]>();
  for (const tool of tools) {
    const prefix = getDomainPrefix(tool.name);
    if (!skillMap.has(prefix)) skillMap.set(prefix, []);
    skillMap.get(prefix)!.push(tool.name);
  }

  // Convert to A2A skills
  const skills: AgentSkill[] = [];
  for (const [prefix, toolNames] of skillMap) {
    const domain = DOMAIN_MAP[prefix] || { name: capitalize(prefix), description: `${capitalize(prefix)} tools`, tags: [prefix] };
    skills.push({
      id: `nowaikit-${prefix}`,
      name: domain.name,
      description: `${domain.description} (${toolNames.length} tools)`,
      tags: domain.tags,
    });
  }

  return {
    name: 'NowAIKit',
    description: 'The most comprehensive ServiceNow AI toolkit — 400+ tools covering ITSM, CMDB, HRSD, CSM, SecOps, GRC, DevOps, and more.',
    url: baseUrl,
    version: VERSION,
    capabilities: {
      streaming: true,
      pushNotifications: false,
      stateTransitionHistory: true,
    },
    authentication: {
      schemes: isAuthRequired() ? ['bearer'] : [],
    },
    defaultInputModes: ['text'],
    defaultOutputModes: ['text', 'data'],
    skills,
  };
}

function getDomainPrefix(toolName: string): string {
  // Match known prefixes
  for (const prefix of Object.keys(DOMAIN_MAP)) {
    if (toolName.startsWith(prefix + '_') || toolName.startsWith(prefix)) return prefix;
  }
  // Generic tools
  if (['query_records', 'get_record', 'create_record', 'update_record', 'delete_record', 'get_table_schema', 'get_user', 'get_group'].includes(toolName)) return 'core';
  // Fallback: use first word
  return toolName.split('_')[0]!;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Built-in ITSM slash commands (MCP Prompts).
 *
 * These appear as "/" commands in Claude Desktop, Cursor, and other
 * MCP clients that support the Prompts capability.
 */

export interface PromptDefinition {
  name: string;
  description: string;
  /** Optional user-visible arguments the AI client will ask for */
  arguments?: Array<{ name: string; description: string; required?: boolean }>;
  /** Template to send as the user message */
  template: string;
}

export const itsmPrompts: PromptDefinition[] = [
  {
    name: 'morning-standup',
    description: 'Daily standup briefing — P1/P2 incidents, SLA breaches, changes due today',
    template:
      'Give me a morning standup briefing:\n' +
      '1. List all active P1 and P2 incidents — number, short description, assigned to, time open.\n' +
      '2. List any incidents currently breaching or about to breach SLA.\n' +
      '3. List change requests scheduled for today.\n' +
      'Format clearly with sections. Flag anything requiring immediate attention.',
  },
  {
    name: 'my-tickets',
    description: 'All open tasks, incidents, and requests assigned to me',
    template:
      'Show me everything currently assigned to me:\n' +
      '- Open incidents\n' +
      '- Open change requests\n' +
      '- Open tasks\n' +
      '- Pending catalog requests\n' +
      'Group by type. Include number, short description, priority, and time since opened.',
  },
  {
    name: 'p1-alerts',
    description: 'Active P1 incidents with time open and assignee',
    template:
      'List all active Priority 1 incidents. For each show:\n' +
      '- Incident number and short description\n' +
      '- Assigned to (person and group)\n' +
      '- Time since opened\n' +
      '- SLA status\n' +
      '- Last work note\n' +
      'Sort by oldest first. Highlight any with no activity in the last 30 minutes.',
  },
  {
    name: 'my-changes',
    description: 'My pending change requests and their approval status',
    template:
      'Show my change requests:\n' +
      '- Changes I submitted that are pending approval\n' +
      '- Changes I need to approve\n' +
      '- Scheduled changes for this week\n' +
      'Include change number, short description, scheduled date, and current state.',
  },
  {
    name: 'knowledge-search',
    description: 'Search the knowledge base',
    arguments: [{ name: 'topic', description: 'What to search for', required: true }],
    template: 'Search the ServiceNow knowledge base for "{topic}" and return the top 5 most relevant articles with their title, number, and a brief summary.',
  },
  {
    name: 'create-incident',
    description: 'Guided incident creation — asks for details then creates the record',
    arguments: [
      { name: 'description', description: 'Brief description of the issue', required: true },
      { name: 'category', description: 'Category (e.g. Network, Hardware, Software)', required: false },
      { name: 'urgency', description: '1=Critical, 2=High, 3=Medium, 4=Low', required: false },
    ],
    template:
      'Create a new incident with:\n' +
      '- Short description: {description}\n' +
      '- Category: {category}\n' +
      '- Urgency: {urgency}\n' +
      'Confirm the details before creating, then create the incident and return the number.',
  },
  {
    name: 'sla-breaches',
    description: 'Records currently breaching or about to breach SLA',
    template:
      'Show me all records currently breaching SLA or within 30 minutes of breach:\n' +
      '- Incident number and short description\n' +
      '- SLA name and time remaining\n' +
      '- Current assignee\n' +
      'Sort by time remaining (most urgent first).',
  },
  {
    name: 'ci-health',
    description: 'CMDB health check for a named CI',
    arguments: [{ name: 'ci_name', description: 'Name or sys_id of the Configuration Item', required: true }],
    template:
      'Give me a health check for the CI named "{ci_name}":\n' +
      '- Current status and operational state\n' +
      '- Open incidents linked to this CI\n' +
      '- Recent changes involving this CI\n' +
      '- Related CIs (upstream/downstream)',
  },
  {
    name: 'run-atf',
    description: 'Trigger an ATF test suite and report results',
    arguments: [{ name: 'suite_name', description: 'Name or sys_id of the ATF suite', required: true }],
    template:
      'Run the ATF test suite "{suite_name}" and wait for completion. ' +
      'Report pass/fail for each test and summarise any failures with details.',
  },
  {
    name: 'switch-instance',
    description: 'Switch to a different ServiceNow instance for this session',
    arguments: [{ name: 'instance', description: 'Instance name (e.g. prod, staging, dev)', required: true }],
    template: 'Switch to the "{instance}" ServiceNow instance and confirm which instance is now active.',
  },
  {
    name: 'deploy-updateset',
    description: 'Preview and commit an update set',
    arguments: [{ name: 'updateset_name', description: 'Name or sys_id of the update set', required: true }],
    template:
      'For update set "{updateset_name}":\n' +
      '1. Show the contents (files changed, type of changes)\n' +
      '2. Check for any conflicts or issues\n' +
      '3. Ask for confirmation before committing\n' +
      '4. If confirmed, commit the update set and report the result.',
  },
];

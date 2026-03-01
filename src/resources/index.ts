/**
 * MCP Resources — @ mentions that users can reference in conversation.
 *
 * Resources appear as @mention completions in clients that support them
 * (Claude Desktop, Cursor, etc.). Each resource returns live ServiceNow data.
 *
 * Available mentions:
 *   @my-incidents    — open incidents assigned to current user
 *   @open-changes    — change requests pending approval
 *   @sla-breaches    — records currently breaching SLA
 *   @instance:info   — current active instance metadata
 *   @ci:<name>       — CMDB CI by name
 *   @kb:<title>      — Knowledge article by title
 */
import type { ServiceNowClient } from '../servicenow/client.js';

export interface McpResource {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
}

/** Static resource list exposed to AI clients. */
export function getResources(): McpResource[] {
  return [
    {
      uri: 'servicenow://my-incidents',
      name: 'my-incidents',
      description: 'Open incidents currently assigned to me',
      mimeType: 'application/json',
    },
    {
      uri: 'servicenow://open-changes',
      name: 'open-changes',
      description: 'Change requests pending approval or scheduled this week',
      mimeType: 'application/json',
    },
    {
      uri: 'servicenow://sla-breaches',
      name: 'sla-breaches',
      description: 'Records currently breaching or about to breach SLA',
      mimeType: 'application/json',
    },
    {
      uri: 'servicenow://instance:info',
      name: 'instance:info',
      description: 'Current active ServiceNow instance metadata',
      mimeType: 'application/json',
    },
    {
      uri: 'servicenow://ci:{name}',
      name: 'ci:<name>',
      description: 'CMDB Configuration Item by name (e.g. @ci:web-prod-01)',
      mimeType: 'application/json',
    },
    {
      uri: 'servicenow://kb:{title}',
      name: 'kb:<title>',
      description: 'Knowledge Base article by title (e.g. @kb:VPN-setup)',
      mimeType: 'application/json',
    },
  ];
}

/** Read a resource URI and return live data from ServiceNow. */
export async function readResource(client: ServiceNowClient, uri: string): Promise<unknown> {
  if (uri === 'servicenow://my-incidents') {
    return client.queryRecords({
      table: 'incident',
      query: 'active=true',
      limit: 20,
      fields: 'number,short_description,priority,state,assigned_to,sys_created_on,sys_updated_on',
    });
  }

  if (uri === 'servicenow://open-changes') {
    return client.queryRecords({
      table: 'change_request',
      query: 'state=assess^ORstate=authorize^ORstate=scheduled',
      limit: 20,
      fields: 'number,short_description,state,start_date,end_date,assigned_to,approval',
    });
  }

  if (uri === 'servicenow://sla-breaches') {
    return client.queryRecords({
      table: 'task_sla',
      query: 'has_breached=true^stage=in_progress',
      limit: 20,
      fields: 'task,sla,has_breached,breach_time,stage',
    });
  }

  if (uri === 'servicenow://instance:info') {
    const props = await client.queryRecords({
      table: 'sys_properties',
      query: 'nameLIKEglide.buildTag^ORnameINglide.version,instance.name',
      limit: 5,
      fields: 'name,value',
    });
    return { instance_properties: props };
  }

  const ciMatch = uri.match(/^servicenow:\/\/ci:(.+)$/);
  if (ciMatch) {
    const ciName = decodeURIComponent(ciMatch[1]!);
    return client.queryRecords({
      table: 'cmdb_ci',
      query: `nameLIKE${ciName}`,
      limit: 5,
      fields: 'name,sys_class_name,operational_status,install_status,ip_address,sys_id',
    });
  }

  const kbMatch = uri.match(/^servicenow:\/\/kb:(.+)$/);
  if (kbMatch) {
    const kbTitle = decodeURIComponent(kbMatch[1]!);
    return client.queryRecords({
      table: 'kb_knowledge',
      query: `short_descriptionLIKE${kbTitle}^ORtextLIKE${kbTitle}`,
      limit: 5,
      fields: 'number,short_description,text,category,sys_id',
    });
  }

  return { error: `Unknown resource URI: ${uri}` };
}

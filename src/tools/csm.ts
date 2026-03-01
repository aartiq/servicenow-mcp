/**
 * Customer Service Management (CSM) tools — cases, consumers, accounts, and contacts.
 * Read tools: Tier 0. Write tools: Tier 1 (WRITE_ENABLED=true).
 */
import type { ServiceNowClient } from '../servicenow/client.js';
import { ServiceNowError } from '../utils/errors.js';
import { requireWrite } from '../utils/permissions.js';

export function getCsmToolDefinitions() {
  return [
    {
      name: 'create_csm_case',
      description: 'Create a new Customer Service case (requires WRITE_ENABLED=true)',
      inputSchema: {
        type: 'object',
        properties: {
          short_description: { type: 'string', description: 'Brief summary of the customer issue' },
          account: { type: 'string', description: 'Account name or sys_id' },
          contact: { type: 'string', description: 'Contact name or sys_id (the person raising the case)' },
          category: { type: 'string', description: 'Case category (e.g., "Product", "Billing", "Technical")' },
          subcategory: { type: 'string', description: 'Case subcategory' },
          priority: { type: 'number', description: '1=Critical, 2=High, 3=Moderate, 4=Low' },
          description: { type: 'string', description: 'Detailed description of the customer issue' },
          product: { type: 'string', description: 'Product or service sys_id related to the case' },
          assignment_group: { type: 'string', description: 'CSM assignment group' },
        },
        required: ['short_description'],
      },
    },
    {
      name: 'get_csm_case',
      description: 'Get full details of a CSM case by number (e.g. CS0001234) or sys_id',
      inputSchema: {
        type: 'object',
        properties: {
          number_or_sysid: { type: 'string', description: 'Case number (CS...) or sys_id' },
        },
        required: ['number_or_sysid'],
      },
    },
    {
      name: 'update_csm_case',
      description: 'Update fields on an existing CSM case (requires WRITE_ENABLED=true)',
      inputSchema: {
        type: 'object',
        properties: {
          sys_id: { type: 'string', description: 'System ID of the CSM case' },
          fields: { type: 'object', description: 'Key-value pairs of fields to update' },
        },
        required: ['sys_id', 'fields'],
      },
    },
    {
      name: 'list_csm_cases',
      description: 'List CSM cases with optional filters (account, contact, state, priority)',
      inputSchema: {
        type: 'object',
        properties: {
          account: { type: 'string', description: 'Filter by account name or sys_id' },
          contact: { type: 'string', description: 'Filter by contact name or sys_id' },
          state: { type: 'string', description: 'Filter by state (open, resolved, closed)' },
          priority: { type: 'number', description: 'Filter by priority (1-4)' },
          limit: { type: 'number', description: 'Max records to return (default 25)' },
          query: { type: 'string', description: 'Additional encoded query' },
        },
        required: [],
      },
    },
    {
      name: 'close_csm_case',
      description: 'Close a CSM case with resolution details (requires WRITE_ENABLED=true)',
      inputSchema: {
        type: 'object',
        properties: {
          sys_id: { type: 'string', description: 'System ID of the CSM case' },
          resolution_code: { type: 'string', description: 'How the case was resolved' },
          resolution_notes: { type: 'string', description: 'Detailed resolution notes' },
        },
        required: ['sys_id', 'resolution_notes'],
      },
    },
    {
      name: 'get_csm_account',
      description: 'Get details of a customer account including contacts and open cases count',
      inputSchema: {
        type: 'object',
        properties: {
          name_or_sysid: { type: 'string', description: 'Account name or sys_id' },
        },
        required: ['name_or_sysid'],
      },
    },
    {
      name: 'list_csm_accounts',
      description: 'List customer accounts with optional search filter',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search accounts by name' },
          active: { type: 'boolean', description: 'Filter to active accounts only (default true)' },
          limit: { type: 'number', description: 'Max records to return (default 50)' },
        },
        required: [],
      },
    },
    {
      name: 'get_csm_contact',
      description: 'Get details of a customer contact (name, account, phone, email)',
      inputSchema: {
        type: 'object',
        properties: {
          name_or_sysid: { type: 'string', description: 'Contact name, email, or sys_id' },
        },
        required: ['name_or_sysid'],
      },
    },
    {
      name: 'list_csm_contacts',
      description: 'List contacts for an account or search across all contacts',
      inputSchema: {
        type: 'object',
        properties: {
          account_sysid: { type: 'string', description: 'Filter contacts by account sys_id' },
          query: { type: 'string', description: 'Search by name or email' },
          limit: { type: 'number', description: 'Max records to return (default 25)' },
        },
        required: [],
      },
    },
    {
      name: 'get_csm_case_sla',
      description: 'Get SLA details and remaining time for a CSM case',
      inputSchema: {
        type: 'object',
        properties: {
          case_sysid: { type: 'string', description: 'sys_id of the CSM case' },
        },
        required: ['case_sysid'],
      },
    },
    {
      name: 'list_csm_products',
      description: 'List products and services available in the CSM catalog',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search products by name' },
          limit: { type: 'number', description: 'Max records to return (default 50)' },
        },
        required: [],
      },
    },
  ];
}

export async function executeCsmToolCall(
  client: ServiceNowClient,
  name: string,
  args: Record<string, any>
): Promise<any> {
  switch (name) {
    case 'create_csm_case': {
      requireWrite();
      if (!args.short_description) throw new ServiceNowError('short_description is required', 'INVALID_REQUEST');
      const result = await client.createRecord('sn_customerservice_case', args);
      return { ...result, summary: `Created CSM case ${result.number || result.sys_id}` };
    }
    case 'get_csm_case': {
      if (!args.number_or_sysid) throw new ServiceNowError('number_or_sysid is required', 'INVALID_REQUEST');
      if (/^[0-9a-f]{32}$/i.test(args.number_or_sysid)) {
        return await client.getRecord('sn_customerservice_case', args.number_or_sysid);
      }
      const resp = await client.queryRecords({ table: 'sn_customerservice_case', query: `number=${args.number_or_sysid}`, limit: 1 });
      if (resp.count === 0) throw new ServiceNowError(`CSM case not found: ${args.number_or_sysid}`, 'NOT_FOUND');
      return resp.records[0];
    }
    case 'update_csm_case': {
      requireWrite();
      if (!args.sys_id || !args.fields) throw new ServiceNowError('sys_id and fields are required', 'INVALID_REQUEST');
      const result = await client.updateRecord('sn_customerservice_case', args.sys_id, args.fields);
      return { ...result, summary: `Updated CSM case ${args.sys_id}` };
    }
    case 'list_csm_cases': {
      const parts: string[] = [];
      if (args.account) parts.push(`account.name=${args.account}`);
      if (args.contact) parts.push(`contact.name=${args.contact}`);
      if (args.state) parts.push(`state=${args.state}`);
      if (args.priority) parts.push(`priority=${args.priority}`);
      if (args.query) parts.push(args.query);
      const resp = await client.queryRecords({ table: 'sn_customerservice_case', query: parts.join('^') || '', limit: args.limit ?? 25 });
      return resp;
    }
    case 'close_csm_case': {
      requireWrite();
      if (!args.sys_id || !args.resolution_notes) throw new ServiceNowError('sys_id and resolution_notes are required', 'INVALID_REQUEST');
      const result = await client.updateRecord('sn_customerservice_case', args.sys_id, {
        state: 'closed',
        close_notes: args.resolution_notes,
        ...(args.resolution_code ? { close_code: args.resolution_code } : {}),
      });
      return { ...result, summary: `Closed CSM case ${args.sys_id}` };
    }
    case 'get_csm_account': {
      if (!args.name_or_sysid) throw new ServiceNowError('name_or_sysid is required', 'INVALID_REQUEST');
      if (/^[0-9a-f]{32}$/i.test(args.name_or_sysid)) {
        return await client.getRecord('customer_account', args.name_or_sysid);
      }
      const resp = await client.queryRecords({ table: 'customer_account', query: `name=${args.name_or_sysid}`, limit: 1 });
      if (resp.count === 0) throw new ServiceNowError(`Account not found: ${args.name_or_sysid}`, 'NOT_FOUND');
      return resp.records[0];
    }
    case 'list_csm_accounts': {
      const active = args.active !== false ? 'active=true' : '';
      const q = args.query ? `nameCONTAINS${args.query}` : '';
      const query = [active, q].filter(Boolean).join('^');
      return await client.queryRecords({ table: 'customer_account', query, limit: args.limit ?? 50 });
    }
    case 'get_csm_contact': {
      if (!args.name_or_sysid) throw new ServiceNowError('name_or_sysid is required', 'INVALID_REQUEST');
      if (/^[0-9a-f]{32}$/i.test(args.name_or_sysid)) {
        return await client.getRecord('customer_contact', args.name_or_sysid);
      }
      const resp = await client.queryRecords({
        table: 'customer_contact',
        query: `nameCONTAINS${args.name_or_sysid}^ORemail=${args.name_or_sysid}`,
        limit: 1,
      });
      if (resp.count === 0) throw new ServiceNowError(`Contact not found: ${args.name_or_sysid}`, 'NOT_FOUND');
      return resp.records[0];
    }
    case 'list_csm_contacts': {
      const parts: string[] = [];
      if (args.account_sysid) parts.push(`account=${args.account_sysid}`);
      if (args.query) parts.push(`nameCONTAINS${args.query}^ORemail=${args.query}`);
      return await client.queryRecords({ table: 'customer_contact', query: parts.join('^') || '', limit: args.limit ?? 25 });
    }
    case 'get_csm_case_sla': {
      if (!args.case_sysid) throw new ServiceNowError('case_sysid is required', 'INVALID_REQUEST');
      return await client.queryRecords({ table: 'task_sla', query: `task=${args.case_sysid}`, limit: 10 });
    }
    case 'list_csm_products': {
      const q = args.query ? `nameCONTAINS${args.query}` : '';
      return await client.queryRecords({ table: 'cmdb_ci_service', query: q, limit: args.limit ?? 50 });
    }
    default:
      return null;
  }
}

/**
 * Service Catalog and Approval tools.
 * Read tools: Tier 0. Write tools: Tier 1 (WRITE_ENABLED=true).
 */
import type { ServiceNowClient } from '../servicenow/client.js';
import { ServiceNowError } from '../utils/errors.js';
import { requireWrite } from '../utils/permissions.js';

export function getCatalogToolDefinitions() {
  return [
    {
      name: 'list_catalog_items',
      description: 'List available service catalog items',
      inputSchema: {
        type: 'object',
        properties: {
          category: { type: 'string', description: 'Filter by category name or sys_id' },
          limit: { type: 'number', description: 'Max items (default: 20)' },
        },
        required: [],
      },
    },
    {
      name: 'search_catalog',
      description: 'Search the service catalog for items matching a keyword',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search keywords' },
          limit: { type: 'number', description: 'Max results (default: 10)' },
        },
        required: ['query'],
      },
    },
    {
      name: 'get_catalog_item',
      description: 'Get full details of a catalog item including its variables',
      inputSchema: {
        type: 'object',
        properties: {
          sys_id_or_name: { type: 'string', description: 'Catalog item sys_id or name' },
        },
        required: ['sys_id_or_name'],
      },
    },
    {
      name: 'create_catalog_item',
      description: 'Create a new service catalog item (requires WRITE_ENABLED=true)',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Catalog item display name' },
          short_description: { type: 'string', description: 'One-line summary shown in search results' },
          description: { type: 'string', description: 'Full HTML description of the item' },
          category: { type: 'string', description: 'sys_id of the catalog category (sc_category)' },
          price: { type: 'string', description: 'Price (e.g. "0", "99.99")' },
          delivery_time: {
            type: 'string',
            description: 'Estimated delivery time ISO 8601 duration (e.g. "1 08:00:00" for 1 day 8 hours)',
          },
          active: { type: 'boolean', description: 'Make the item available in the catalog (default: true)' },
          roles: { type: 'string', description: 'Comma-separated roles that can see the item' },
        },
        required: ['name', 'short_description'],
      },
    },
    {
      name: 'update_catalog_item',
      description: 'Update an existing catalog item (requires WRITE_ENABLED=true)',
      inputSchema: {
        type: 'object',
        properties: {
          sys_id: { type: 'string', description: 'Catalog item sys_id' },
          fields: {
            type: 'object',
            description: 'Fields to update (name, short_description, price, active, category, etc.)',
          },
        },
        required: ['sys_id', 'fields'],
      },
    },
    {
      name: 'order_catalog_item',
      description: 'Order a service catalog item (requires WRITE_ENABLED=true)',
      inputSchema: {
        type: 'object',
        properties: {
          sys_id: { type: 'string', description: 'System ID of the catalog item' },
          quantity: { type: 'number', description: 'Quantity to order (default: 1)' },
          variables: { type: 'object', description: 'Catalog item variables as key-value pairs' },
        },
        required: ['sys_id'],
      },
    },
    // Approval tools
    {
      name: 'create_approval_rule',
      description:
        'Create an approval rule that automatically generates approval requests when a record matches given conditions (requires WRITE_ENABLED=true). ' +
        'Uses the sysapproval_rule table.',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Rule name' },
          table: {
            type: 'string',
            description: 'Table this rule applies to (e.g. "sc_request", "change_request")',
          },
          approver_type: {
            type: 'string',
            description: '"user" | "group" — whether the approver is a user or a group',
          },
          approver: {
            type: 'string',
            description: 'sys_id of the approving user or group',
          },
          condition: {
            type: 'string',
            description: 'Encoded query that determines when the rule fires (leave blank for always)',
          },
          active: { type: 'boolean', description: 'Activate the rule immediately (default: true)' },
          order: { type: 'number', description: 'Execution order relative to other rules (default: 100)' },
        },
        required: ['name', 'table', 'approver_type', 'approver'],
      },
    },
    {
      name: 'get_my_approvals',
      description: 'List approvals pending for the currently configured user',
      inputSchema: {
        type: 'object',
        properties: {
          state: { type: 'string', description: 'Filter by state: "requested", "approved", "rejected" (default: "requested")' },
        },
        required: [],
      },
    },
    {
      name: 'list_approvals',
      description: 'List approval requests with optional filters',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Encoded query filter' },
          state: { type: 'string', description: 'Approval state filter' },
          limit: { type: 'number', description: 'Max results (default: 10)' },
        },
        required: [],
      },
    },
    {
      name: 'approve_request',
      description: 'Approve a pending approval request (requires WRITE_ENABLED=true)',
      inputSchema: {
        type: 'object',
        properties: {
          sys_id: { type: 'string', description: 'System ID of the approval record' },
          comments: { type: 'string', description: 'Optional approval comments' },
        },
        required: ['sys_id'],
      },
    },
    {
      name: 'reject_request',
      description: 'Reject a pending approval request (requires WRITE_ENABLED=true)',
      inputSchema: {
        type: 'object',
        properties: {
          sys_id: { type: 'string', description: 'System ID of the approval record' },
          comments: { type: 'string', description: 'Reason for rejection (required)' },
        },
        required: ['sys_id', 'comments'],
      },
    },
    // SLA tools
    {
      name: 'get_sla_details',
      description: 'Get SLA breach status for a specific task or incident',
      inputSchema: {
        type: 'object',
        properties: {
          task_sys_id: { type: 'string', description: 'System ID of the task/incident' },
        },
        required: ['task_sys_id'],
      },
    },
    {
      name: 'list_active_slas',
      description: 'List active SLA records with optional filters',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Encoded query filter' },
          limit: { type: 'number', description: 'Max results (default: 10)' },
        },
        required: [],
      },
    },
    {
      name: 'create_catalog_variable',
      description: '[Write] Add a form variable to a service catalog item',
      inputSchema: {
        type: 'object',
        properties: {
          cat_item_id: { type: 'string', description: 'Catalog item sys_id' },
          name: { type: 'string', description: 'Variable name' },
          question_text: { type: 'string', description: 'Label shown to user' },
          type: { type: 'string', description: 'Variable type: string/reference/select_box/checkbox/date/date_time/integer/multi_line_text/email' },
          order: { type: 'number', description: 'Display order (default: 100)' },
          mandatory: { type: 'boolean', description: 'Required field' },
        },
        required: ['cat_item_id', 'name', 'question_text', 'type'],
      },
    },
    {
      name: 'create_catalog_ui_policy',
      description: '[Write] Create a UI policy for a catalog item form',
      inputSchema: {
        type: 'object',
        properties: {
          cat_item_id: { type: 'string', description: 'Catalog item sys_id' },
          short_description: { type: 'string', description: 'UI policy description' },
          conditions: { type: 'string', description: 'Encoded condition query' },
          reverse_if_false: { type: 'boolean', description: 'Reverse actions when condition is false' },
        },
        required: ['cat_item_id', 'short_description'],
      },
    },
  ];
}

export async function executeCatalogToolCall(
  client: ServiceNowClient,
  name: string,
  args: Record<string, any>
): Promise<any> {
  switch (name) {
    case 'list_catalog_items': {
      let query = 'active=true';
      if (args.category) query += `^category.title=${args.category}^ORcategory=${args.category}`;
      const resp = await client.queryRecords({ table: 'sc_cat_item', query, limit: args.limit || 20, fields: 'sys_id,name,short_description,category,price' });
      return { count: resp.count, catalog_items: resp.records };
    }
    case 'search_catalog': {
      if (!args.query) throw new ServiceNowError('query is required', 'INVALID_REQUEST');
      const resp = await client.queryRecords({ table: 'sc_cat_item', query: `nameLIKE${args.query}^ORshort_descriptionLIKE${args.query}^active=true`, limit: args.limit || 10 });
      return { count: resp.count, catalog_items: resp.records };
    }
    case 'get_catalog_item': {
      if (!args.sys_id_or_name) throw new ServiceNowError('sys_id_or_name is required', 'INVALID_REQUEST');
      if (/^[0-9a-f]{32}$/i.test(args.sys_id_or_name)) {
        return await client.getRecord('sc_cat_item', args.sys_id_or_name);
      }
      const resp = await client.queryRecords({ table: 'sc_cat_item', query: `name=${args.sys_id_or_name}^ORsys_id=${args.sys_id_or_name}`, limit: 1 });
      if (resp.count === 0) throw new ServiceNowError(`Catalog item not found: ${args.sys_id_or_name}`, 'NOT_FOUND');
      return resp.records[0];
    }
    case 'create_catalog_item': {
      requireWrite();
      if (!args.name || !args.short_description)
        throw new ServiceNowError('name and short_description are required', 'INVALID_REQUEST');
      const data: Record<string, any> = {
        name: args.name,
        short_description: args.short_description,
        active: args.active !== false,
      };
      if (args.description) data.description = args.description;
      if (args.category) data.category = args.category;
      if (args.price !== undefined) data.price = args.price;
      if (args.delivery_time) data.delivery_time = args.delivery_time;
      if (args.roles) data.roles = args.roles;
      const result = await client.createRecord('sc_cat_item', data);
      return { ...result, summary: `Created catalog item "${args.name}"` };
    }
    case 'update_catalog_item': {
      requireWrite();
      if (!args.sys_id || !args.fields)
        throw new ServiceNowError('sys_id and fields are required', 'INVALID_REQUEST');
      const result = await client.updateRecord('sc_cat_item', args.sys_id, args.fields);
      return { ...result, summary: `Updated catalog item ${args.sys_id}` };
    }
    case 'order_catalog_item': {
      requireWrite();
      if (!args.sys_id) throw new ServiceNowError('sys_id is required', 'INVALID_REQUEST');
      // Use Service Catalog API: POST /api/now/v1/servicecatalog/items/{sys_id}/order_now
      const result = await client.callNowAssist(`/api/now/v1/servicecatalog/items/${args.sys_id}/order_now`, {
        sysparm_quantity: args.quantity || 1,
        variables: args.variables || {},
      });
      return { ...result, summary: `Ordered catalog item ${args.sys_id}` };
    }
    case 'create_approval_rule': {
      requireWrite();
      if (!args.name || !args.table || !args.approver_type || !args.approver)
        throw new ServiceNowError('name, table, approver_type, and approver are required', 'INVALID_REQUEST');
      const data: Record<string, any> = {
        name: args.name,
        table: args.table,
        approver_type: args.approver_type,
        active: args.active !== false,
        order: args.order ?? 100,
      };
      if (args.approver_type === 'group') {
        data.approver_group = args.approver;
      } else {
        data.approver = args.approver;
      }
      if (args.condition) data.condition = args.condition;
      const result = await client.createRecord('sysapproval_rule', data);
      return {
        ...result,
        summary: `Created approval rule "${args.name}" for table "${args.table}" with ${args.approver_type} approver`,
      };
    }
    case 'get_my_approvals': {
      const username = process.env.SERVICENOW_USERNAME || process.env.SERVICENOW_BASIC_USERNAME || '';
      const state = args.state || 'requested';
      let query = `state=${state}`;
      if (username) query += `^approver.user_name=${username}`;
      const resp = await client.queryRecords({ table: 'sysapproval_approver', query, limit: 20, fields: 'sys_id,state,approver,sysapproval,comments,sys_updated_on' });
      return { count: resp.count, approvals: resp.records };
    }
    case 'list_approvals': {
      let query = args.query || '';
      if (args.state) query = query ? `${query}^state=${args.state}` : `state=${args.state}`;
      const resp = await client.queryRecords({ table: 'sysapproval_approver', query: query || undefined, limit: args.limit || 10 });
      return { count: resp.count, approvals: resp.records };
    }
    case 'approve_request': {
      requireWrite();
      if (!args.sys_id) throw new ServiceNowError('sys_id is required', 'INVALID_REQUEST');
      const data: Record<string, string> = { state: 'approved' };
      if (args.comments) data.comments = args.comments;
      const result = await client.updateRecord('sysapproval_approver', args.sys_id, data);
      return { ...result, summary: `Approved request ${args.sys_id}` };
    }
    case 'reject_request': {
      requireWrite();
      if (!args.sys_id || !args.comments) throw new ServiceNowError('sys_id and comments are required', 'INVALID_REQUEST');
      const result = await client.updateRecord('sysapproval_approver', args.sys_id, { state: 'rejected', comments: args.comments });
      return { ...result, summary: `Rejected request ${args.sys_id}` };
    }
    case 'get_sla_details': {
      if (!args.task_sys_id) throw new ServiceNowError('task_sys_id is required', 'INVALID_REQUEST');
      const resp = await client.queryRecords({ table: 'task_sla', query: `task=${args.task_sys_id}`, fields: 'sys_id,sla,stage,has_breached,percentage,pause_time,business_time_left,sys_updated_on' });
      return { count: resp.count, slas: resp.records };
    }
    case 'list_active_slas': {
      let query = 'stage!=complete^has_breached=false';
      if (args.query) query = `${args.query}^${query}`;
      const resp = await client.queryRecords({ table: 'task_sla', query, limit: args.limit || 10 });
      return { count: resp.count, slas: resp.records };
    }
    case 'create_catalog_variable': {
      requireWrite();
      if (!args.cat_item_id || !args.name || !args.question_text || !args.type)
        throw new ServiceNowError('cat_item_id, name, question_text, and type are required', 'INVALID_REQUEST');
      const typeMap: Record<string, string> = {
        string: '6', reference: '8', select_box: '1', checkbox: '7', date: '10',
        date_time: '15', integer: '2', multi_line_text: '2', email: '32',
      };
      const result = await client.createRecord('item_option_new', {
        cat_item: args.cat_item_id,
        name: args.name,
        question_text: args.question_text,
        type: typeMap[args.type] || args.type,
        order: args.order || 100,
        mandatory: args.mandatory ? 'true' : 'false',
      });
      return { ...result, summary: `Created catalog variable "${args.name}" on item ${args.cat_item_id}` };
    }
    case 'create_catalog_ui_policy': {
      requireWrite();
      if (!args.cat_item_id || !args.short_description)
        throw new ServiceNowError('cat_item_id and short_description are required', 'INVALID_REQUEST');
      const result = await client.createRecord('catalog_ui_policy', {
        catalog_item: args.cat_item_id,
        short_description: args.short_description,
        applies_to: 'catalog_item',
        catalog_conditions: args.conditions || '',
        reverse_if_false: args.reverse_if_false ? 'true' : 'false',
        active: 'true',
      });
      return { ...result, summary: `Created catalog UI policy "${args.short_description}" on item ${args.cat_item_id}` };
    }
    default:
      return null;
  }
}

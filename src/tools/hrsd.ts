/**
 * HR Service Delivery (HRSD) tools — full lifecycle for HR cases, services, and profiles.
 * Read tools: Tier 0. Write tools: Tier 1 (WRITE_ENABLED=true).
 */
import type { ServiceNowClient } from '../servicenow/client.js';
import { ServiceNowError } from '../utils/errors.js';
import { requireWrite } from '../utils/permissions.js';

export function getHrsdToolDefinitions() {
  return [
    {
      name: 'create_hr_case',
      description: 'Create a new HR Service Delivery case (requires WRITE_ENABLED=true)',
      inputSchema: {
        type: 'object',
        properties: {
          short_description: { type: 'string', description: 'Brief description of the HR request' },
          hr_service: { type: 'string', description: 'HR service sys_id or name (e.g. "Onboarding", "Offboarding")' },
          subject_person: { type: 'string', description: 'User sys_id or username the case is about' },
          description: { type: 'string', description: 'Full details of the HR request' },
          assignment_group: { type: 'string', description: 'HR assignment group name or sys_id' },
          priority: { type: 'number', description: '1=Critical, 2=High, 3=Moderate, 4=Low' },
        },
        required: ['short_description', 'hr_service'],
      },
    },
    {
      name: 'get_hr_case',
      description: 'Get full details of an HR case by number (e.g. HRCS0001234) or sys_id',
      inputSchema: {
        type: 'object',
        properties: {
          number_or_sysid: { type: 'string', description: 'HR case number (HRCS...) or sys_id' },
        },
        required: ['number_or_sysid'],
      },
    },
    {
      name: 'update_hr_case',
      description: 'Update fields on an existing HR case (requires WRITE_ENABLED=true)',
      inputSchema: {
        type: 'object',
        properties: {
          sys_id: { type: 'string', description: 'System ID of the HR case' },
          fields: { type: 'object', description: 'Key-value pairs to update' },
        },
        required: ['sys_id', 'fields'],
      },
    },
    {
      name: 'list_hr_cases',
      description: 'List HR cases with optional filters (status, subject person, service)',
      inputSchema: {
        type: 'object',
        properties: {
          state: { type: 'string', description: 'Filter by state: open, work_in_progress, closed_complete, closed_incomplete' },
          subject_person: { type: 'string', description: 'User sys_id or username to filter by' },
          hr_service: { type: 'string', description: 'HR service name or sys_id' },
          limit: { type: 'number', description: 'Max records to return (default 25)' },
          query: { type: 'string', description: 'Additional encoded query string' },
        },
        required: [],
      },
    },
    {
      name: 'close_hr_case',
      description: 'Close an HR case with resolution notes (requires WRITE_ENABLED=true)',
      inputSchema: {
        type: 'object',
        properties: {
          sys_id: { type: 'string', description: 'System ID of the HR case' },
          close_notes: { type: 'string', description: 'Resolution or closure notes' },
          close_code: { type: 'string', description: 'Closure code (e.g., "Resolved", "Withdrawn")' },
        },
        required: ['sys_id', 'close_notes'],
      },
    },
    {
      name: 'list_hr_services',
      description: 'List available HR services (Onboarding, Offboarding, Benefits, Payroll, etc.)',
      inputSchema: {
        type: 'object',
        properties: {
          active: { type: 'boolean', description: 'Filter to active services only (default true)' },
          query: { type: 'string', description: 'Filter by name or description' },
          limit: { type: 'number', description: 'Max records to return (default 50)' },
        },
        required: [],
      },
    },
    {
      name: 'get_hr_service',
      description: 'Get details of a specific HR service including its tasks and SLAs',
      inputSchema: {
        type: 'object',
        properties: {
          sys_id_or_name: { type: 'string', description: 'HR service sys_id or exact name' },
        },
        required: ['sys_id_or_name'],
      },
    },
    {
      name: 'get_hr_profile',
      description: 'Get the HR profile for a user (employment details, department, manager)',
      inputSchema: {
        type: 'object',
        properties: {
          user_identifier: { type: 'string', description: 'Username, email, or sys_id of the user' },
        },
        required: ['user_identifier'],
      },
    },
    {
      name: 'update_hr_profile',
      description: 'Update HR profile fields for a user (requires WRITE_ENABLED=true)',
      inputSchema: {
        type: 'object',
        properties: {
          user_sys_id: { type: 'string', description: 'sys_id of the user whose profile to update' },
          fields: { type: 'object', description: 'HR profile fields to update (e.g., {"department": "Engineering"})' },
        },
        required: ['user_sys_id', 'fields'],
      },
    },
    {
      name: 'list_hr_tasks',
      description: 'List HR tasks associated with an HR case',
      inputSchema: {
        type: 'object',
        properties: {
          hr_case_sysid: { type: 'string', description: 'sys_id of the parent HR case' },
          state: { type: 'string', description: 'Filter by task state (open, closed)' },
        },
        required: ['hr_case_sysid'],
      },
    },
    {
      name: 'create_hr_task',
      description: 'Create a task within an HR case (requires WRITE_ENABLED=true)',
      inputSchema: {
        type: 'object',
        properties: {
          hr_case_sysid: { type: 'string', description: 'sys_id of the parent HR case' },
          short_description: { type: 'string', description: 'Brief description of the task' },
          assigned_to: { type: 'string', description: 'User sys_id or username to assign the task to' },
          due_date: { type: 'string', description: 'Due date in ISO 8601 format' },
        },
        required: ['hr_case_sysid', 'short_description'],
      },
    },
    {
      name: 'get_hr_case_activity',
      description: 'Get the full activity log and journal entries for an HR case',
      inputSchema: {
        type: 'object',
        properties: {
          hr_case_sysid: { type: 'string', description: 'sys_id of the HR case' },
        },
        required: ['hr_case_sysid'],
      },
    },
    // ─── Onboarding / Offboarding ─────────────────────────────────────
    {
      name: 'create_onboarding_case',
      description: 'Create an employee onboarding case with all standard tasks. **[Write]**',
      inputSchema: {
        type: 'object',
        properties: {
          employee_sys_id: { type: 'string', description: 'New employee user sys_id' },
          start_date: { type: 'string', description: 'Start date (ISO 8601)' },
          department: { type: 'string', description: 'Department name or sys_id' },
          manager: { type: 'string', description: 'Manager user sys_id' },
          location: { type: 'string', description: 'Office location' },
          job_title: { type: 'string', description: 'Job title' },
        },
        required: ['employee_sys_id', 'start_date'],
      },
    },
    {
      name: 'create_offboarding_case',
      description: 'Create an employee offboarding case with exit tasks. **[Write]**',
      inputSchema: {
        type: 'object',
        properties: {
          employee_sys_id: { type: 'string', description: 'Departing employee user sys_id' },
          last_day: { type: 'string', description: 'Last working day (ISO 8601)' },
          reason: { type: 'string', description: 'Offboarding reason (resignation, termination, retirement)' },
          manager: { type: 'string', description: 'Manager user sys_id' },
        },
        required: ['employee_sys_id', 'last_day'],
      },
    },
    {
      name: 'get_hr_lifecycle_events',
      description: 'Get HR lifecycle events for an employee (promotions, transfers, leaves)',
      inputSchema: {
        type: 'object',
        properties: {
          employee_sys_id: { type: 'string', description: 'Employee user sys_id' },
          event_type: { type: 'string', description: 'Filter by type: promotion, transfer, leave, onboarding, offboarding' },
          limit: { type: 'number', description: 'Max records (default 25)' },
        },
        required: ['employee_sys_id'],
      },
    },
    {
      name: 'list_hr_document_templates',
      description: 'List available HR document templates (offer letters, contracts, policies)',
      inputSchema: {
        type: 'object',
        properties: {
          category: { type: 'string', description: 'Filter by category: onboarding, offboarding, benefits, policy' },
          active: { type: 'boolean', description: 'Filter active only (default true)' },
          limit: { type: 'number', description: 'Max records (default 25)' },
        },
        required: [],
      },
    },
  ];
}

export async function executeHrsdToolCall(
  client: ServiceNowClient,
  name: string,
  args: Record<string, any>
): Promise<any> {
  switch (name) {
    case 'create_hr_case': {
      requireWrite();
      if (!args.short_description || !args.hr_service)
        throw new ServiceNowError('short_description and hr_service are required', 'INVALID_REQUEST');
      const payload: Record<string, any> = { ...args };
      const result = await client.createRecord('sn_hr_core_case', payload);
      return { ...result, summary: `Created HR case ${result.number || result.sys_id}` };
    }
    case 'get_hr_case': {
      if (!args.number_or_sysid) throw new ServiceNowError('number_or_sysid is required', 'INVALID_REQUEST');
      if (/^[0-9a-f]{32}$/i.test(args.number_or_sysid)) {
        return await client.getRecord('sn_hr_core_case', args.number_or_sysid);
      }
      const resp = await client.queryRecords({ table: 'sn_hr_core_case', query: `number=${args.number_or_sysid}`, limit: 1 });
      if (resp.count === 0) throw new ServiceNowError(`HR case not found: ${args.number_or_sysid}`, 'NOT_FOUND');
      return resp.records[0];
    }
    case 'update_hr_case': {
      requireWrite();
      if (!args.sys_id || !args.fields) throw new ServiceNowError('sys_id and fields are required', 'INVALID_REQUEST');
      const result = await client.updateRecord('sn_hr_core_case', args.sys_id, args.fields);
      return { ...result, summary: `Updated HR case ${args.sys_id}` };
    }
    case 'list_hr_cases': {
      const parts: string[] = [];
      if (args.state) parts.push(`state=${args.state}`);
      if (args.subject_person) parts.push(`subject_person.user_name=${args.subject_person}`);
      if (args.hr_service) parts.push(`hr_service.name=${args.hr_service}`);
      if (args.query) parts.push(args.query);
      const resp = await client.queryRecords({ table: 'sn_hr_core_case', query: parts.join('^') || '', limit: args.limit ?? 25 });
      return resp;
    }
    case 'close_hr_case': {
      requireWrite();
      if (!args.sys_id || !args.close_notes) throw new ServiceNowError('sys_id and close_notes are required', 'INVALID_REQUEST');
      const result = await client.updateRecord('sn_hr_core_case', args.sys_id, {
        state: 'closed_complete',
        close_notes: args.close_notes,
        ...(args.close_code ? { close_code: args.close_code } : {}),
      });
      return { ...result, summary: `Closed HR case ${args.sys_id}` };
    }
    case 'list_hr_services': {
      const q = args.query ? `nameCONTAINS${args.query}^ORdescriptionCONTAINS${args.query}` : '';
      const active = args.active !== false ? 'active=true^' : '';
      const resp = await client.queryRecords({ table: 'sn_hr_core_service', query: `${active}${q}`, limit: args.limit ?? 50 });
      return resp;
    }
    case 'get_hr_service': {
      if (!args.sys_id_or_name) throw new ServiceNowError('sys_id_or_name is required', 'INVALID_REQUEST');
      if (/^[0-9a-f]{32}$/i.test(args.sys_id_or_name)) {
        return await client.getRecord('sn_hr_core_service', args.sys_id_or_name);
      }
      const resp = await client.queryRecords({ table: 'sn_hr_core_service', query: `name=${args.sys_id_or_name}`, limit: 1 });
      if (resp.count === 0) throw new ServiceNowError(`HR service not found: ${args.sys_id_or_name}`, 'NOT_FOUND');
      return resp.records[0];
    }
    case 'get_hr_profile': {
      if (!args.user_identifier) throw new ServiceNowError('user_identifier is required', 'INVALID_REQUEST');
      const userQ = /^[0-9a-f]{32}$/i.test(args.user_identifier)
        ? `user=${args.user_identifier}`
        : `user.user_name=${args.user_identifier}`;
      const resp = await client.queryRecords({ table: 'sn_hr_core_profile', query: userQ, limit: 1 });
      if (resp.count === 0) throw new ServiceNowError(`HR profile not found for: ${args.user_identifier}`, 'NOT_FOUND');
      return resp.records[0];
    }
    case 'update_hr_profile': {
      requireWrite();
      if (!args.user_sys_id || !args.fields) throw new ServiceNowError('user_sys_id and fields are required', 'INVALID_REQUEST');
      const profileResp = await client.queryRecords({ table: 'sn_hr_core_profile', query: `user=${args.user_sys_id}`, limit: 1 });
      if (profileResp.count === 0) throw new ServiceNowError(`No HR profile found for user ${args.user_sys_id}`, 'NOT_FOUND');
      const profileSysId = String(profileResp.records[0].sys_id);
      const result = await client.updateRecord('sn_hr_core_profile', profileSysId, args.fields);
      return { ...result, summary: `Updated HR profile for user ${args.user_sys_id}` };
    }
    case 'list_hr_tasks': {
      if (!args.hr_case_sysid) throw new ServiceNowError('hr_case_sysid is required', 'INVALID_REQUEST');
      const q = `parent=${args.hr_case_sysid}${args.state ? `^state=${args.state}` : ''}`;
      return await client.queryRecords({ table: 'sn_hr_core_task', query: q, limit: 50 });
    }
    case 'create_hr_task': {
      requireWrite();
      if (!args.hr_case_sysid || !args.short_description)
        throw new ServiceNowError('hr_case_sysid and short_description are required', 'INVALID_REQUEST');
      const payload: Record<string, any> = { parent: args.hr_case_sysid, short_description: args.short_description };
      if (args.assigned_to) payload.assigned_to = args.assigned_to;
      if (args.due_date) payload.due_date = args.due_date;
      const result = await client.createRecord('sn_hr_core_task', payload);
      return { ...result, summary: `Created HR task ${result.number || result.sys_id}` };
    }
    case 'get_hr_case_activity': {
      if (!args.hr_case_sysid) throw new ServiceNowError('hr_case_sysid is required', 'INVALID_REQUEST');
      return await client.queryRecords({ table: 'sys_journal_field', query: `element_id=${args.hr_case_sysid}`, limit: 100 });
    }
    case 'create_onboarding_case': {
      requireWrite();
      if (!args.employee_sys_id || !args.start_date) throw new ServiceNowError('employee_sys_id and start_date are required', 'INVALID_REQUEST');
      const result = await client.createRecord('sn_hr_core_case', {
        short_description: `Employee Onboarding - ${args.start_date}`,
        hr_service: 'Onboarding',
        subject_person: args.employee_sys_id,
        ...(args.department ? { department: args.department } : {}),
        ...(args.manager ? { assigned_to: args.manager } : {}),
        ...(args.location ? { location: args.location } : {}),
        ...(args.job_title ? { u_job_title: args.job_title } : {}),
      });
      return { action: 'created', type: 'onboarding', ...result };
    }
    case 'create_offboarding_case': {
      requireWrite();
      if (!args.employee_sys_id || !args.last_day) throw new ServiceNowError('employee_sys_id and last_day are required', 'INVALID_REQUEST');
      const result = await client.createRecord('sn_hr_core_case', {
        short_description: `Employee Offboarding - ${args.last_day}`,
        hr_service: 'Offboarding',
        subject_person: args.employee_sys_id,
        ...(args.reason ? { u_offboarding_reason: args.reason } : {}),
        ...(args.manager ? { assigned_to: args.manager } : {}),
      });
      return { action: 'created', type: 'offboarding', ...result };
    }
    case 'get_hr_lifecycle_events': {
      if (!args.employee_sys_id) throw new ServiceNowError('employee_sys_id is required', 'INVALID_REQUEST');
      let query = `employee=${args.employee_sys_id}`;
      if (args.event_type) query += `^type=${args.event_type}`;
      return await client.queryRecords({ table: 'sn_hr_le_lifecycle_event', query, limit: args.limit ?? 25 });
    }
    case 'list_hr_document_templates': {
      const parts: string[] = [];
      if (args.active !== false) parts.push('active=true');
      if (args.category) parts.push(`category=${args.category}`);
      return await client.queryRecords({ table: 'sn_hr_core_document_template', query: parts.join('^') || '', limit: args.limit ?? 25 });
    }
    default:
      return null;
  }
}

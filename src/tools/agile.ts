/**
 * Agile/Scrum tools.
 * Read tools: Tier 0. Write tools: Tier 1 (WRITE_ENABLED=true).
 * Tables: rm_story, rm_epic, rm_scrum_task
 */
import type { ServiceNowClient } from '../servicenow/client.js';
import { ServiceNowError } from '../utils/errors.js';
import { requireWrite } from '../utils/permissions.js';

const TABLE_PREFIX = process.env.AGILE_TABLE_PREFIX || 'rm_';

export function getAgileToolDefinitions() {
  return [
    {
      name: 'create_story',
      description: 'Create a new agile story/user story (requires WRITE_ENABLED=true)',
      inputSchema: {
        type: 'object',
        properties: {
          short_description: { type: 'string', description: 'Story title' },
          story_points: { type: 'number', description: 'Story point estimate' },
          sprint: { type: 'string', description: 'Sprint sys_id or name' },
          epic: { type: 'string', description: 'Epic sys_id' },
          description: { type: 'string', description: 'Story description and acceptance criteria' },
          assigned_to: { type: 'string', description: 'User sys_id or username' },
        },
        required: ['short_description'],
      },
    },
    {
      name: 'update_story',
      description: 'Update an agile story (requires WRITE_ENABLED=true)',
      inputSchema: {
        type: 'object',
        properties: {
          sys_id: { type: 'string', description: 'System ID of the story' },
          fields: { type: 'object', description: 'Key-value pairs to update' },
        },
        required: ['sys_id', 'fields'],
      },
    },
    {
      name: 'list_stories',
      description: 'List agile stories with optional sprint or state filter',
      inputSchema: {
        type: 'object',
        properties: {
          sprint: { type: 'string', description: 'Filter by sprint sys_id' },
          state: { type: 'string', description: 'Filter by state (e.g., "1"=Open, "2"=Work in Progress, "3"=Complete)' },
          limit: { type: 'number', description: 'Max results (default: 20)' },
        },
        required: [],
      },
    },
    {
      name: 'create_epic',
      description: 'Create a new epic (requires WRITE_ENABLED=true)',
      inputSchema: {
        type: 'object',
        properties: {
          short_description: { type: 'string', description: 'Epic title' },
          description: { type: 'string', description: 'Epic description and goals' },
          project: { type: 'string', description: 'Project sys_id' },
        },
        required: ['short_description'],
      },
    },
    {
      name: 'update_epic',
      description: 'Update an epic (requires WRITE_ENABLED=true)',
      inputSchema: {
        type: 'object',
        properties: {
          sys_id: { type: 'string', description: 'System ID of the epic' },
          fields: { type: 'object', description: 'Key-value pairs to update' },
        },
        required: ['sys_id', 'fields'],
      },
    },
    {
      name: 'list_epics',
      description: 'List epics with optional project or state filter',
      inputSchema: {
        type: 'object',
        properties: {
          project: { type: 'string', description: 'Filter by project sys_id' },
          state: { type: 'string', description: 'Filter by state' },
          limit: { type: 'number', description: 'Max results (default: 20)' },
        },
        required: [],
      },
    },
    {
      name: 'create_scrum_task',
      description: 'Create a scrum task (sub-task of a story) (requires WRITE_ENABLED=true)',
      inputSchema: {
        type: 'object',
        properties: {
          short_description: { type: 'string', description: 'Task title' },
          story_sys_id: { type: 'string', description: 'Parent story sys_id' },
          assigned_to: { type: 'string', description: 'Assignee user_name or sys_id' },
        },
        required: ['short_description'],
      },
    },
    {
      name: 'update_scrum_task',
      description: 'Update a scrum task (requires WRITE_ENABLED=true)',
      inputSchema: {
        type: 'object',
        properties: {
          sys_id: { type: 'string', description: 'System ID of the scrum task' },
          fields: { type: 'object', description: 'Key-value pairs to update' },
        },
        required: ['sys_id', 'fields'],
      },
    },
    {
      name: 'list_scrum_tasks',
      description: 'List scrum tasks, optionally filtered by story',
      inputSchema: {
        type: 'object',
        properties: {
          story_sys_id: { type: 'string', description: 'Filter by parent story sys_id' },
          assigned_to: { type: 'string', description: 'Filter by assignee' },
          limit: { type: 'number', description: 'Max results (default: 20)' },
        },
        required: [],
      },
    },
  ];
}

export async function executeAgileToolCall(
  client: ServiceNowClient,
  name: string,
  args: Record<string, any>
): Promise<any> {
  const storyTable = `${TABLE_PREFIX}story`;
  const epicTable = `${TABLE_PREFIX}epic`;
  const scrumTaskTable = `${TABLE_PREFIX}scrum_task`;

  switch (name) {
    case 'create_story': {
      requireWrite();
      if (!args.short_description) throw new ServiceNowError('short_description is required', 'INVALID_REQUEST');
      const result = await client.createRecord(storyTable, args);
      return { ...result, summary: `Created story ${result.number || result.sys_id}` };
    }
    case 'update_story': {
      requireWrite();
      if (!args.sys_id || !args.fields) throw new ServiceNowError('sys_id and fields are required', 'INVALID_REQUEST');
      return await client.updateRecord(storyTable, args.sys_id, args.fields);
    }
    case 'list_stories': {
      let query = '';
      if (args.sprint) query = `sprint=${args.sprint}`;
      if (args.state) query = query ? `${query}^state=${args.state}` : `state=${args.state}`;
      const resp = await client.queryRecords({ table: storyTable, query: query || undefined, limit: args.limit || 20, fields: 'sys_id,number,short_description,state,story_points,sprint,epic,assigned_to' });
      return { count: resp.count, stories: resp.records };
    }
    case 'create_epic': {
      requireWrite();
      if (!args.short_description) throw new ServiceNowError('short_description is required', 'INVALID_REQUEST');
      const result = await client.createRecord(epicTable, args);
      return { ...result, summary: `Created epic ${result.number || result.sys_id}` };
    }
    case 'update_epic': {
      requireWrite();
      if (!args.sys_id || !args.fields) throw new ServiceNowError('sys_id and fields are required', 'INVALID_REQUEST');
      return await client.updateRecord(epicTable, args.sys_id, args.fields);
    }
    case 'list_epics': {
      let query = '';
      if (args.project) query = `project=${args.project}`;
      if (args.state) query = query ? `${query}^state=${args.state}` : `state=${args.state}`;
      const resp = await client.queryRecords({ table: epicTable, query: query || undefined, limit: args.limit || 20 });
      return { count: resp.count, epics: resp.records };
    }
    case 'create_scrum_task': {
      requireWrite();
      if (!args.short_description) throw new ServiceNowError('short_description is required', 'INVALID_REQUEST');
      const data: Record<string, any> = { short_description: args.short_description };
      if (args.story_sys_id) data.story = args.story_sys_id;
      if (args.assigned_to) data.assigned_to = args.assigned_to;
      const result = await client.createRecord(scrumTaskTable, data);
      return { ...result, summary: `Created scrum task ${result.number || result.sys_id}` };
    }
    case 'update_scrum_task': {
      requireWrite();
      if (!args.sys_id || !args.fields) throw new ServiceNowError('sys_id and fields are required', 'INVALID_REQUEST');
      return await client.updateRecord(scrumTaskTable, args.sys_id, args.fields);
    }
    case 'list_scrum_tasks': {
      let query = '';
      if (args.story_sys_id) query = `story=${args.story_sys_id}`;
      if (args.assigned_to) query = query ? `${query}^assigned_to.user_name=${args.assigned_to}` : `assigned_to.user_name=${args.assigned_to}`;
      const resp = await client.queryRecords({ table: scrumTaskTable, query: query || undefined, limit: args.limit || 20 });
      return { count: resp.count, scrum_tasks: resp.records };
    }
    default:
      return null;
  }
}

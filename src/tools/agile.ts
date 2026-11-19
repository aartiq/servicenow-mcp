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
    {
      name: 'create_story_dependency',
      description: 'Link one agile story as dependent on another (m2m_story_dependencies). Requires WRITE_ENABLED=true.',
      inputSchema: {
        type: 'object',
        properties: {
          story: { type: 'string', description: 'The dependent story sys_id (the one that is blocked)' },
          dependent_story: { type: 'string', description: 'The story it depends on (the blocker) sys_id' },
        },
        required: ['story', 'dependent_story'],
      },
    },
    {
      name: 'list_story_dependencies',
      description: 'List dependency links for a story (m2m_story_dependencies).',
      inputSchema: {
        type: 'object',
        properties: {
          story: { type: 'string', description: 'Story sys_id to list dependencies for' },
          limit: { type: 'number', description: 'Max results (default: 50)' },
        },
        required: ['story'],
      },
    },
    {
      name: 'delete_story_dependency',
      description: 'Remove a story dependency link by its m2m_story_dependencies sys_id. Requires WRITE_ENABLED=true.',
      inputSchema: {
        type: 'object',
        properties: { sys_id: { type: 'string', description: 'The m2m_story_dependencies record sys_id' } },
        required: ['sys_id'],
      },
    },
    {
      name: 'create_project',
      description: 'Create a SPM project (pm_project). Requires WRITE_ENABLED=true.',
      inputSchema: {
        type: 'object',
        properties: {
          short_description: { type: 'string', description: 'Project name / short description' },
          description: { type: 'string', description: 'Project description' },
          state: { type: 'string', description: 'Project state (e.g. pending, open, work in progress)' },
          priority: { type: 'string', description: 'Priority (1-5)' },
          fields: { type: 'object', description: 'Additional pm_project fields (start_date, end_date, project_manager, etc.)' },
        },
        required: ['short_description'],
      },
    },
    {
      name: 'update_project',
      description: 'Update a SPM project (pm_project). Requires WRITE_ENABLED=true.',
      inputSchema: {
        type: 'object',
        properties: {
          sys_id: { type: 'string', description: 'Project sys_id' },
          fields: { type: 'object', description: 'Key-value pairs to update' },
        },
        required: ['sys_id', 'fields'],
      },
    },
    {
      name: 'list_projects',
      description: 'List SPM projects (pm_project).',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Encoded query filter (e.g. state=open)' },
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
    case 'create_story_dependency': {
      requireWrite();
      if (!args.story || !args.dependent_story) throw new ServiceNowError('story and dependent_story are required', 'INVALID_REQUEST');
      // m2m_story_dependencies has prerequisite_story (the blocker) and dependent_story (the blocked one);
      // there is no "story" column. Per this tool's schema, `story` is blocked and `dependent_story` is the blocker.
      const result = await client.createRecord('m2m_story_dependencies', { dependent_story: args.story, prerequisite_story: args.dependent_story });
      return { action: 'created', ...result };
    }
    case 'list_story_dependencies': {
      const resp = await client.queryRecords({ table: 'm2m_story_dependencies', query: `prerequisite_story=${args.story}^ORdependent_story=${args.story}`, limit: args.limit || 50, fields: 'sys_id,prerequisite_story,dependent_story' });
      return { count: resp.count, dependencies: resp.records };
    }
    case 'delete_story_dependency': {
      requireWrite();
      if (!args.sys_id) throw new ServiceNowError('sys_id is required', 'INVALID_REQUEST');
      await client.deleteRecord('m2m_story_dependencies', args.sys_id);
      return { action: 'deleted', sys_id: args.sys_id };
    }
    case 'create_project': {
      requireWrite();
      const data: Record<string, unknown> = { short_description: args.short_description, ...(args.fields || {}) };
      if (args.description) data.description = args.description;
      if (args.state) data.state = args.state;
      if (args.priority) data.priority = args.priority;
      const result = await client.createRecord('pm_project', data);
      return { action: 'created', ...result };
    }
    case 'update_project': {
      requireWrite();
      const result = await client.updateRecord('pm_project', args.sys_id, args.fields);
      return { action: 'updated', ...result };
    }
    case 'list_projects': {
      const resp = await client.queryRecords({ table: 'pm_project', query: args.query || undefined, limit: args.limit || 20, fields: 'sys_id,number,short_description,state,priority,percent_complete,project_manager,start_date,end_date' });
      return { count: resp.count, projects: resp.records };
    }
    default:
      return null;
  }
}

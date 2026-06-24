/**
 * Now Assist Skills management tools — create, list, get, and test Now Assist skills.
 * All tools require NOW_ASSIST_ENABLED=true (Tier AI).
 * Write tools additionally require WRITE_ENABLED=true (Tier 1).
 */
import type { ServiceNowClient } from '../servicenow/client.js';
import { ServiceNowError } from '../utils/errors.js';
import { requireNowAssist, requireWrite } from '../utils/permissions.js';

export function getNowAssistSkillsToolDefinitions() {
  return [
    {
      name: 'create_now_assist_skill',
      description: 'Create a Now Assist skill definition (requires NOW_ASSIST_ENABLED + WRITE_ENABLED)',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Skill name' },
          description: { type: 'string', description: 'Skill description' },
          input_schema: { type: 'string', description: 'JSON schema string defining the skill input' },
          output_schema: { type: 'string', description: 'JSON schema string defining the skill output' },
          prompt_template: { type: 'string', description: 'Prompt template for the skill' },
          model: { type: 'string', description: 'Optional model identifier to use for this skill' },
        },
        required: ['name', 'description', 'input_schema', 'output_schema', 'prompt_template'],
      },
    },
    {
      name: 'list_now_assist_skills',
      description: 'List Now Assist skill definitions (requires NOW_ASSIST_ENABLED)',
      inputSchema: {
        type: 'object',
        properties: {
          active: { type: 'boolean', description: 'Filter by active status' },
          limit: { type: 'number', description: 'Max records to return (default 25)' },
          query: { type: 'string', description: 'Additional encoded query string' },
        },
        required: [],
      },
    },
    {
      name: 'get_now_assist_skill',
      description: 'Get a single Now Assist skill definition by sys_id (requires NOW_ASSIST_ENABLED)',
      inputSchema: {
        type: 'object',
        properties: {
          sys_id: { type: 'string', description: 'System ID of the skill' },
        },
        required: ['sys_id'],
      },
    },
    {
      name: 'test_now_assist_skill',
      description: 'Invoke a Now Assist skill with test input to verify behavior (requires NOW_ASSIST_ENABLED)',
      inputSchema: {
        type: 'object',
        properties: {
          skill_sys_id: { type: 'string', description: 'System ID of the skill to test' },
          test_input: { type: 'object', description: 'Test input payload to send to the skill' },
        },
        required: ['skill_sys_id', 'test_input'],
      },
    },
  ];
}

const SKILL_TOOL_NAMES = new Set([
  'create_now_assist_skill', 'list_now_assist_skills', 'get_now_assist_skill', 'test_now_assist_skill',
]);

export async function executeNowAssistSkillsToolCall(
  client: ServiceNowClient,
  name: string,
  args: Record<string, any>
): Promise<any> {
  if (!SKILL_TOOL_NAMES.has(name)) return null;
  requireNowAssist();

  switch (name) {
    case 'create_now_assist_skill': {
      requireWrite();
      if (!args.name) throw new ServiceNowError('name is required', 'INVALID_REQUEST');
      if (!args.description) throw new ServiceNowError('description is required', 'INVALID_REQUEST');
      if (!args.input_schema) throw new ServiceNowError('input_schema is required', 'INVALID_REQUEST');
      if (!args.output_schema) throw new ServiceNowError('output_schema is required', 'INVALID_REQUEST');
      if (!args.prompt_template) throw new ServiceNowError('prompt_template is required', 'INVALID_REQUEST');

      const data: Record<string, any> = {
        name: args.name,
        description: args.description,
        input_schema: args.input_schema,
        output_schema: args.output_schema,
        prompt_template: args.prompt_template,
        active: true,
      };
      if (args.model) data.model = args.model;

      const record = await client.createRecord('sn_now_assist_skill', data);
      return { message: 'Now Assist skill created', skill: record };
    }

    case 'list_now_assist_skills': {
      const parts: string[] = [];
      if (args.active !== undefined) parts.push(`active=${args.active}`);
      if (args.query) parts.push(args.query);
      const query = parts.length > 0 ? parts.join('^') : undefined;

      const resp = await client.queryRecords({
        table: 'sn_now_assist_skill',
        query,
        limit: args.limit || 25,
        fields: 'sys_id,name,description,active,model,sys_updated_on',
      });
      return { count: resp.count, skills: resp.records };
    }

    case 'get_now_assist_skill': {
      if (!args.sys_id) throw new ServiceNowError('sys_id is required', 'INVALID_REQUEST');
      const record = await client.getRecord('sn_now_assist_skill', args.sys_id);
      return { skill: record };
    }

    case 'test_now_assist_skill': {
      if (!args.skill_sys_id) throw new ServiceNowError('skill_sys_id is required', 'INVALID_REQUEST');
      if (!args.test_input) throw new ServiceNowError('test_input is required', 'INVALID_REQUEST');

      const result = await client.callNowAssist('/api/sn_assist/skill/invoke', {
        skill: args.skill_sys_id,
        input: args.test_input,
      });
      return { skill_sys_id: args.skill_sys_id, test_input: args.test_input, result };
    }

    default:
      return null;
  }
}

/**
 * Surveys & Assessments (CSAT/experience). Read: Tier 0. Create/send: Tier 1.
 *
 * Tables:
 *   asmt_metric_type                    — survey/assessment definitions
 *   asmt_assessment_instance            — issued survey/assessment instances
 *   asmt_assessment_instance_question   — per-question responses/scores
 */
import type { ServiceNowClient } from '../servicenow/client.js';
import { ServiceNowError } from '../utils/errors.js';
import { requireWrite } from '../utils/permissions.js';

export function getSurveyToolDefinitions() {
  return [
    {
      name: 'create_survey',
      description: 'Create a survey/assessment definition (asmt_metric_type). Requires WRITE_ENABLED=true',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Survey name' },
          description: { type: 'string', description: 'Survey description' },
          type: { type: 'string', description: 'Evaluation method: survey (default), assessment, quiz, attestation, rating' },
          fields: { type: 'object', description: 'Additional field values' },
        },
        required: ['name'],
      },
    },
    {
      name: 'send_survey',
      description: 'Issue a survey/assessment instance to a user (asmt_assessment_instance). Requires WRITE_ENABLED=true',
      inputSchema: {
        type: 'object',
        properties: {
          metric_type: { type: 'string', description: 'sys_id of the survey definition (asmt_metric_type)' },
          user: { type: 'string', description: 'Recipient user sys_id' },
          trigger_id: { type: 'string', description: 'Source record sys_id (e.g. the closed incident)' },
          trigger_table: { type: 'string', description: 'Source table name' },
          fields: { type: 'object', description: 'Additional field values' },
        },
        required: ['metric_type', 'user'],
      },
    },
    {
      name: 'get_survey_results',
      description: 'Get responses/scores for a survey instance or definition (asmt_assessment_instance_question)',
      inputSchema: {
        type: 'object',
        properties: {
          instance: { type: 'string', description: 'sys_id of a specific assessment instance' },
          metric_type: { type: 'string', description: 'sys_id of the survey definition (aggregate across instances)' },
          limit: { type: 'number', description: 'Max question rows (default 100)' },
        },
        required: [],
      },
    },
    {
      name: 'list_assessments',
      description: 'List survey/assessment instances (asmt_assessment_instance) by state or user',
      inputSchema: {
        type: 'object',
        properties: {
          state: { type: 'string', description: 'Instance state (e.g. "ready", "complete")' },
          user: { type: 'string', description: 'Recipient user sys_id' },
          metric_type: { type: 'string', description: 'Survey definition sys_id' },
          limit: { type: 'number', description: 'Max records (default 50)' },
        },
        required: [],
      },
    },
  ];
}

export async function executeSurveyToolCall(
  client: ServiceNowClient,
  name: string,
  args: Record<string, any>,
): Promise<any> {
  switch (name) {
    case 'create_survey': {
      requireWrite();
      if (!args.name) throw new ServiceNowError('name is required', 'INVALID_REQUEST');
      // asmt_metric_type has no "type" column: the kind of assessment is evaluation_method. table,
      // display_field and scale_factor are mandatory; surveys use the definition table itself.
      const payload: Record<string, any> = {
        name: args.name,
        evaluation_method: args.type || 'survey',
        table: 'asmt_metric_type',
        display_field: 'name',
        scale_factor: '10',
        ...(args.fields ?? {}),
      };
      if (args.description) payload.description = args.description;
      const result = await client.createRecord('asmt_metric_type', payload);
      return { ...result, summary: `Created survey "${args.name}"` };
    }
    case 'send_survey': {
      requireWrite();
      if (!args.metric_type || !args.user) throw new ServiceNowError('metric_type and user are required', 'INVALID_REQUEST');
      const payload: Record<string, any> = { metric_type: args.metric_type, user: args.user, state: 'ready', ...(args.fields ?? {}) };
      if (args.trigger_id) payload.trigger_id = args.trigger_id;
      if (args.trigger_table) payload.trigger_table = args.trigger_table;
      const result = await client.createRecord('asmt_assessment_instance', payload);
      return { ...result, summary: `Issued survey ${args.metric_type} to ${args.user}` };
    }
    case 'get_survey_results': {
      let query = '';
      if (args.instance) query = `instance=${args.instance}`;
      else if (args.metric_type) query = `instance.metric_type=${args.metric_type}`;
      else throw new ServiceNowError('instance or metric_type is required', 'INVALID_REQUEST');
      return await client.queryRecords({
        table: 'asmt_assessment_instance_question',
        query,
        fields: 'metric,metric.name,value,string_value,instance,instance.state',
        limit: args.limit ?? 100,
      });
    }
    case 'list_assessments': {
      const parts: string[] = [];
      if (args.state) parts.push(`state=${args.state}`);
      if (args.user) parts.push(`user=${args.user}`);
      if (args.metric_type) parts.push(`metric_type=${args.metric_type}`);
      return await client.queryRecords({ table: 'asmt_assessment_instance', query: parts.join('^'), limit: args.limit ?? 50 });
    }
    default:
      return null;
  }
}

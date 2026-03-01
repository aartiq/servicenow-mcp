/**
 * DevOps integration tools — CI/CD pipelines, deployment tracking, and velocity metrics.
 *
 * Tier 0 (Read):  list_devops_pipelines, get_devops_pipeline, list_deployments,
 *                  get_deployment, get_devops_insights
 * Tier 1 (Write): create_devops_change, track_deployment
 *
 * ServiceNow tables: sn_devops_pipeline, sn_devops_artifact, sn_devops_deploy_task,
 *                    sn_devops_change_request
 */
import type { ServiceNowClient } from '../servicenow/client.js';
import { ServiceNowError } from '../utils/errors.js';
import { requireWrite } from '../utils/permissions.js';

export function getDevopsToolDefinitions() {
  return [
    {
      name: 'list_devops_pipelines',
      description: 'List DevOps pipeline configurations registered in ServiceNow',
      inputSchema: {
        type: 'object',
        properties: {
          active: { type: 'boolean', description: 'Filter to active pipelines (default true)' },
          limit: { type: 'number', description: 'Max records (default 25)' },
        },
        required: [],
      },
    },
    {
      name: 'get_devops_pipeline',
      description: 'Get details of a specific DevOps pipeline',
      inputSchema: {
        type: 'object',
        properties: {
          sys_id: { type: 'string', description: 'Pipeline sys_id' },
        },
        required: ['sys_id'],
      },
    },
    {
      name: 'list_deployments',
      description: 'List recent application deployments tracked in ServiceNow',
      inputSchema: {
        type: 'object',
        properties: {
          pipeline_sys_id: { type: 'string', description: 'Filter by pipeline' },
          environment: { type: 'string', description: 'Filter by environment (e.g. "prod", "staging")' },
          state: { type: 'string', description: 'Filter by state: "success", "failed", "in_progress"' },
          limit: { type: 'number', description: 'Max records (default 25)' },
        },
        required: [],
      },
    },
    {
      name: 'get_deployment',
      description: 'Get details and status of a specific deployment',
      inputSchema: {
        type: 'object',
        properties: {
          sys_id: { type: 'string', description: 'Deployment sys_id' },
        },
        required: ['sys_id'],
      },
    },
    {
      name: 'create_devops_change',
      description: 'Create a change request linked to a DevOps deployment for change governance. **[Write]**',
      inputSchema: {
        type: 'object',
        properties: {
          short_description: { type: 'string', description: 'Change short description' },
          pipeline: { type: 'string', description: 'Pipeline name or sys_id' },
          environment: { type: 'string', description: 'Target environment (prod, staging, dev)' },
          artifact: { type: 'string', description: 'Artifact name or version being deployed' },
          type: { type: 'string', description: 'Change type: normal, standard, emergency' },
          assigned_to: { type: 'string', description: 'User sys_id' },
          assignment_group: { type: 'string', description: 'Group sys_id' },
        },
        required: ['short_description', 'environment'],
      },
    },
    {
      name: 'track_deployment',
      description: 'Record a deployment event in ServiceNow for audit and velocity tracking. **[Write]**',
      inputSchema: {
        type: 'object',
        properties: {
          pipeline: { type: 'string', description: 'Pipeline sys_id or name' },
          environment: { type: 'string', description: 'Target environment' },
          artifact_name: { type: 'string', description: 'Artifact or application name' },
          artifact_version: { type: 'string', description: 'Version or build number' },
          status: { type: 'string', description: 'Deployment status: success, failed, rolled_back' },
          notes: { type: 'string', description: 'Deployment notes' },
        },
        required: ['environment', 'artifact_name', 'status'],
      },
    },
    {
      name: 'get_devops_insights',
      description: 'Get deployment frequency, failure rate, and lead time metrics for a pipeline',
      inputSchema: {
        type: 'object',
        properties: {
          pipeline_sys_id: { type: 'string', description: 'Pipeline sys_id (optional — all pipelines if omitted)' },
          days: { type: 'number', description: 'Number of days to analyse (default 30)' },
        },
        required: [],
      },
    },
  ];
}

export async function executeDevopsToolCall(
  client: ServiceNowClient,
  name: string,
  args: Record<string, any>
): Promise<any> {
  switch (name) {
    case 'list_devops_pipelines': {
      const query = args.active !== false ? 'active=true' : '';
      const resp = await client.queryRecords({
        table: 'sn_devops_pipeline',
        query: query || undefined,
        limit: args.limit || 25,
        fields: 'sys_id,name,active,type,description,sys_updated_on',
      });
      return { count: resp.count, pipelines: resp.records };
    }

    case 'get_devops_pipeline': {
      if (!args.sys_id) throw new ServiceNowError('sys_id is required', 'INVALID_REQUEST');
      const result = await client.getRecord('sn_devops_pipeline', args.sys_id);
      return result;
    }

    case 'list_deployments': {
      let query = '';
      if (args.pipeline_sys_id) query = `pipeline=${args.pipeline_sys_id}`;
      if (args.environment) query = query ? `${query}^stage=${args.environment}` : `stage=${args.environment}`;
      if (args.state) query = query ? `${query}^status=${args.state}` : `status=${args.state}`;
      const resp = await client.queryRecords({
        table: 'sn_devops_deploy_task',
        query: query || undefined,
        limit: args.limit || 25,
        fields: 'sys_id,name,pipeline,stage,status,artifact_name,artifact_version,sys_created_on,sys_updated_on',
      });
      return { count: resp.count, deployments: resp.records };
    }

    case 'get_deployment': {
      if (!args.sys_id) throw new ServiceNowError('sys_id is required', 'INVALID_REQUEST');
      const result = await client.getRecord('sn_devops_deploy_task', args.sys_id);
      return result;
    }

    case 'create_devops_change': {
      if (!args.short_description || !args.environment) {
        throw new ServiceNowError('short_description and environment are required', 'INVALID_REQUEST');
      }
      requireWrite();
      const payload: Record<string, any> = {
        short_description: args.short_description,
        type: args.type || 'standard',
        description: `DevOps deployment to ${args.environment}${args.artifact ? ` — ${args.artifact}` : ''}`,
      };
      if (args.assigned_to) payload.assigned_to = args.assigned_to;
      if (args.assignment_group) payload.assignment_group = args.assignment_group;
      // Create as a standard change request linked to devops
      const result = await client.createRecord('change_request', payload);
      return { action: 'created', environment: args.environment, ...result };
    }

    case 'track_deployment': {
      if (!args.environment || !args.artifact_name || !args.status) {
        throw new ServiceNowError('environment, artifact_name, and status are required', 'INVALID_REQUEST');
      }
      requireWrite();
      const payload: Record<string, any> = {
        stage: args.environment,
        artifact_name: args.artifact_name,
        status: args.status,
      };
      if (args.pipeline) payload.pipeline = args.pipeline;
      if (args.artifact_version) payload.artifact_version = args.artifact_version;
      if (args.notes) payload.description = args.notes;
      const result = await client.createRecord('sn_devops_deploy_task', payload);
      return { action: 'tracked', artifact: args.artifact_name, environment: args.environment, status: args.status, ...result };
    }

    case 'get_devops_insights': {
      const days = args.days || 30;
      const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 19).replace('T', ' ');
      let query = `sys_created_on>=${since}`;
      if (args.pipeline_sys_id) query += `^pipeline=${args.pipeline_sys_id}`;
      const resp = await client.queryRecords({
        table: 'sn_devops_deploy_task',
        query,
        limit: 1000,
        fields: 'status,sys_created_on',
      });
      const total = resp.count;
      const success = resp.records.filter((r: any) => r.status === 'success').length;
      const failed = resp.records.filter((r: any) => r.status === 'failed').length;
      return {
        period_days: days,
        total_deployments: total,
        successful: success,
        failed,
        success_rate: total > 0 ? `${Math.round((success / total) * 100)}%` : 'N/A',
        failure_rate: total > 0 ? `${Math.round((failed / total) * 100)}%` : 'N/A',
        deployment_frequency: total > 0 ? `${(total / days).toFixed(1)} per day` : 'N/A',
        note: 'Lead time requires change_request linkage; enable DevOps plugin for full DORA metrics',
      };
    }

    default:
      return null;
  }
}

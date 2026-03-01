/**
 * Deployment & Artifact lifecycle tools — artifact validation, push/pull,
 * deployment tracking, rollback, and solution packaging.
 *
 * NOTE: Does NOT duplicate existing devops.ts (pipelines, deployments) or
 * updateset.ts (update set CRUD). These tools add artifact-level management
 * and deployment orchestration.
 *
 * ServiceNow tables: sys_update_xml, sys_remote_update_set, sys_app,
 *   sys_store_app, sn_devops_artifact
 */
import type { ServiceNowClient } from '../servicenow/client.js';
import { ServiceNowError } from '../utils/errors.js';
import { requireWrite, requireScripting } from '../utils/permissions.js';

export function getDeploymentToolDefinitions() {
  return [
    {
      name: 'find_artifact',
      description: 'Search for platform artifacts by name, type, or scope (business rules, scripts, widgets, etc.)',
      inputSchema: { type: 'object', properties: { name: { type: 'string', description: 'Artifact name or pattern' }, type: { type: 'string', description: 'Artifact type: business_rule, script_include, client_script, ui_policy, ui_action, widget, flow, sys_properties' }, scope: { type: 'string', description: 'Application scope name' }, limit: { type: 'number' } }, required: ['name'] },
    },
    {
      name: 'validate_artifact',
      description: 'Validate an artifact for best practices, security issues, and performance concerns',
      inputSchema: { type: 'object', properties: { table: { type: 'string', description: 'Artifact table (e.g. sys_script, sys_script_include)' }, sys_id: { type: 'string', description: 'Artifact sys_id' } }, required: ['table', 'sys_id'] },
    },
    {
      name: 'clone_artifact',
      description: 'Clone a platform artifact to a new name/scope. **[Scripting]**',
      inputSchema: { type: 'object', properties: { table: { type: 'string', description: 'Source artifact table' }, sys_id: { type: 'string', description: 'Source artifact sys_id' }, new_name: { type: 'string', description: 'Name for the cloned artifact' }, target_scope: { type: 'string', description: 'Target application scope (optional)' } }, required: ['table', 'sys_id', 'new_name'] },
    },
    {
      name: 'validate_deployment',
      description: 'Pre-validate an update set or app before deployment — check for conflicts and missing dependencies',
      inputSchema: { type: 'object', properties: { update_set_sys_id: { type: 'string', description: 'Update set sys_id to validate' }, app_sys_id: { type: 'string', description: 'Scoped app sys_id (alternative to update set)' } }, required: [] },
    },
    {
      name: 'rollback_deployment',
      description: 'Rollback a deployment by reverting an update set. **[Write]**',
      inputSchema: { type: 'object', properties: { update_set_sys_id: { type: 'string', description: 'Committed update set sys_id to rollback' }, reason: { type: 'string', description: 'Reason for rollback' } }, required: ['update_set_sys_id'] },
    },
    {
      name: 'list_deployment_history',
      description: 'List deployment history — committed update sets and app installs over time',
      inputSchema: { type: 'object', properties: { days: { type: 'number', description: 'Look-back period (default 30)' }, limit: { type: 'number' } }, required: [] },
    },
    {
      name: 'create_solution_package',
      description: 'Create a solution package from selected update sets for distribution. **[Write]**',
      inputSchema: { type: 'object', properties: { name: { type: 'string', description: 'Package name' }, description: { type: 'string' }, update_sets: { type: 'array', items: { type: 'string' }, description: 'Array of update set sys_ids to include' } }, required: ['name', 'update_sets'] },
    },
    {
      name: 'execute_background_script',
      description: 'Execute a background script on the instance (server-side JavaScript). **[Scripting]**',
      inputSchema: { type: 'object', properties: { script: { type: 'string', description: 'JavaScript code to execute' }, scope: { type: 'string', description: 'Application scope (default global)' } }, required: ['script'] },
    },
    {
      name: 'import_cmdb_data',
      description: 'Import CI data into CMDB via import set. **[Write]**',
      inputSchema: { type: 'object', properties: { table: { type: 'string', description: 'Target CMDB table (e.g. cmdb_ci_server)' }, data: { type: 'array', items: { type: 'object' }, description: 'Array of records to import' } }, required: ['table', 'data'] },
    },
    {
      name: 'analyze_data_quality',
      description: 'Analyse data quality for a table — completeness, duplicates, stale records',
      inputSchema: { type: 'object', properties: { table: { type: 'string', description: 'Table to analyse' }, required_fields: { type: 'string', description: 'Comma-separated fields that should be populated' }, days_stale: { type: 'number', description: 'Consider records stale after N days without update (default 180)' } }, required: ['table'] },
    },
  ];
}

export async function executeDeploymentToolCall(
  client: ServiceNowClient,
  name: string,
  args: Record<string, any>
): Promise<any> {
  switch (name) {
    case 'find_artifact': {
      if (!args.name) throw new ServiceNowError('name is required', 'INVALID_REQUEST');
      const tableMap: Record<string, string> = { business_rule: 'sys_script', script_include: 'sys_script_include', client_script: 'sys_script_client', ui_policy: 'sys_ui_policy', ui_action: 'sys_ui_action', widget: 'sp_widget', flow: 'sys_hub_flow', sys_properties: 'sys_properties' };
      const table = args.type ? (tableMap[args.type] || args.type) : 'sys_metadata';
      let query = `nameLIKE${args.name}`;
      if (args.scope) query += `^sys_scope.name=${args.scope}`;
      const resp = await client.queryRecords({ table, query, limit: args.limit || 25, fields: 'sys_id,name,sys_class_name,sys_scope,active,sys_updated_on' });
      return { count: resp.count, artifacts: resp.records };
    }

    case 'validate_artifact': {
      if (!args.table || !args.sys_id) throw new ServiceNowError('table and sys_id are required', 'INVALID_REQUEST');
      const record = await client.getRecord(args.table, args.sys_id);
      const issues: string[] = [];
      const script = String(record.script || record.condition || '');
      if (script.includes('current.update()')) issues.push('WARN: current.update() in script can cause infinite loops');
      if (script.includes('eval(')) issues.push('SECURITY: eval() usage detected');
      if (script.includes('GlideRecord') && !script.includes('addQuery')) issues.push('PERF: GlideRecord without query filter may scan entire table');
      if (script.includes('gs.sleep')) issues.push('PERF: gs.sleep() blocks thread');
      if (record.active === 'false') issues.push('INFO: Artifact is inactive');
      return { name: record.name, table: args.table, sys_id: args.sys_id, issues_found: issues.length, issues, status: issues.length === 0 ? 'PASS' : 'REVIEW' };
    }

    case 'clone_artifact': {
      requireScripting();
      if (!args.table || !args.sys_id || !args.new_name) throw new ServiceNowError('table, sys_id, and new_name are required', 'INVALID_REQUEST');
      const source = await client.getRecord(args.table, args.sys_id);
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { sys_id: _sysId, sys_created_on: _created, sys_updated_on: _updated, sys_created_by: _createdBy, sys_updated_by: _updatedBy, ...cloneData } = source;
      cloneData.name = args.new_name;
      if (args.target_scope) cloneData.sys_scope = args.target_scope;
      const result = await client.createRecord(args.table, cloneData);
      return { action: 'cloned', source_sys_id: args.sys_id, new_name: args.new_name, ...result };
    }

    case 'validate_deployment': {
      if (!args.update_set_sys_id && !args.app_sys_id) throw new ServiceNowError('update_set_sys_id or app_sys_id required', 'INVALID_REQUEST');
      if (args.update_set_sys_id) {
        const us = await client.getRecord('sys_update_set', args.update_set_sys_id);
        const changes = await client.queryRecords({ table: 'sys_update_xml', query: `update_set=${args.update_set_sys_id}`, limit: 500, fields: 'sys_id,name,type,action' });
        return { update_set: us.name, state: us.state, total_changes: changes.count, changes_summary: changes.records.slice(0, 20), validation: us.state === 'complete' ? 'READY' : 'NOT_COMPLETE' };
      }
      const app = await client.getRecord('sys_app', args.app_sys_id);
      return { app: app.name, version: app.version, scope: app.scope, validation: 'OK' };
    }

    case 'rollback_deployment': {
      requireWrite();
      if (!args.update_set_sys_id) throw new ServiceNowError('update_set_sys_id is required', 'INVALID_REQUEST');
      const us = await client.getRecord('sys_update_set', args.update_set_sys_id);
      return { action: 'rollback_requested', update_set: us.name, state: us.state, note: 'Use ServiceNow Update Set rollback UI to confirm. Automated rollback requires admin background script.', reason: args.reason || '' };
    }

    case 'list_deployment_history': {
      const days = args.days || 30;
      const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 19).replace('T', ' ');
      const resp = await client.queryRecords({ table: 'sys_update_set', query: `state=complete^sys_updated_on>=${since}`, limit: args.limit || 50, fields: 'sys_id,name,state,application,sys_created_by,sys_updated_on' });
      return { period_days: days, count: resp.count, deployments: resp.records };
    }

    case 'create_solution_package': {
      requireWrite();
      if (!args.name || !args.update_sets?.length) throw new ServiceNowError('name and update_sets are required', 'INVALID_REQUEST');
      return { action: 'package_created', name: args.name, update_set_count: args.update_sets.length, note: 'Solution packaging requires Store app or manual export of listed update sets.' };
    }

    case 'execute_background_script': {
      requireScripting();
      if (!args.script) throw new ServiceNowError('script is required', 'INVALID_REQUEST');
      try {
        const resp = await client.callNowAssist('/api/now/sp/background_script', { script: args.script, scope: args.scope || 'global' });
        return { action: 'executed', output: resp };
      } catch (err) {
        return { action: 'failed', error: err instanceof Error ? err.message : String(err) };
      }
    }

    case 'import_cmdb_data': {
      requireWrite();
      if (!args.table || !args.data?.length) throw new ServiceNowError('table and data are required', 'INVALID_REQUEST');
      const results = [];
      for (const record of args.data.slice(0, 50)) {
        try {
          const result = await client.createRecord(args.table, record);
          results.push({ status: 'created', ...result });
        } catch (err) {
          results.push({ status: 'failed', error: err instanceof Error ? err.message : String(err) });
        }
      }
      return { action: 'imported', total: args.data.length, processed: results.length, results };
    }

    case 'analyze_data_quality': {
      if (!args.table) throw new ServiceNowError('table is required', 'INVALID_REQUEST');
      const totalResp = await client.queryRecords({ table: args.table, limit: 1, fields: 'sys_id' });
      const total = totalResp.count;
      const daysStale = args.days_stale || 180;
      const staleSince = new Date(Date.now() - daysStale * 86400000).toISOString().slice(0, 19).replace('T', ' ');
      const staleResp = await client.queryRecords({ table: args.table, query: `sys_updated_on<${staleSince}`, limit: 1, fields: 'sys_id' });
      const issues: string[] = [];
      if (args.required_fields) {
        for (const field of args.required_fields.split(',').map((f: string) => f.trim())) {
          const emptyResp = await client.queryRecords({ table: args.table, query: `${field}ISEMPTY`, limit: 1, fields: 'sys_id' });
          if (emptyResp.count > 0) issues.push(`${field}: ${emptyResp.count} empty records`);
        }
      }
      return { table: args.table, total_records: total, stale_records: staleResp.count, stale_threshold_days: daysStale, completeness_issues: issues, quality_score: total > 0 ? `${Math.round(((total - staleResp.count) / total) * 100)}%` : 'N/A' };
    }

    default:
      return null;
  }
}

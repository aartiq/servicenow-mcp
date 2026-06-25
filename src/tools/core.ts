/**
 * Core platform tools – the original 15 tools migrated from tools/index.ts.
 * These are always available (Tier 0).
 */
import type { ServiceNowClient } from '../servicenow/client.js';
import { validateQuery } from '../servicenow/client.js';
import type {
  QueryRecordsParams,
  GetRecordParams,
  SearchCmdbCiParams,
  GetCmdbCiParams,
  ListRelationshipsParams,
  ListDiscoverySchedulesParams,
  ListMidServersParams,
  ListActiveEventsParams,
  ServiceMappingSummaryParams,
} from '../servicenow/types.js';
import { ServiceNowError } from '../utils/errors.js';
import { requireWrite } from '../utils/permissions.js';
import { instanceManager } from '../servicenow/instances.js';
import { assertWriteAllowed, assertDeleteAllowed } from '../utils/guardrails.js';
import { appendAudit } from '../utils/audit.js';

/** Compute a before→after diff for the fields being changed. */
function computeDiff(before: Record<string, any>, fields: Record<string, any>) {
  const diff: Record<string, { from: unknown; to: unknown }> = {};
  for (const [key, to] of Object.entries(fields)) {
    const from = before ? before[key] : undefined;
    const fromVal = from && typeof from === 'object' && 'value' in from ? (from as any).value : from;
    if (String(fromVal ?? '') !== String(to ?? '')) diff[key] = { from: fromVal, to };
  }
  return diff;
}

export function getCoreToolDefinitions() {
  return [
    {
      name: 'query_records',
      description: 'Query ServiceNow records with filtering, field selection, pagination, and sorting',
      inputSchema: {
        type: 'object',
        properties: {
          table: { type: 'string', description: 'Table name (e.g., "incident", "change_request")' },
          query: { type: 'string', description: 'Encoded query string (e.g., "active=true^priority=1")' },
          fields: { type: 'string', description: 'Comma-separated fields to return' },
          limit: { type: 'number', description: 'Max records (default: 10, max: 1000)' },
          orderBy: { type: 'string', description: 'Field to sort by. Prefix with "-" for descending' },
        },
        required: ['table'],
      },
    },
    {
      name: 'get_table_schema',
      description: 'Get the structure and field information for a ServiceNow table',
      inputSchema: {
        type: 'object',
        properties: {
          table: { type: 'string', description: 'Table name to inspect' },
        },
        required: ['table'],
      },
    },
    {
      name: 'get_record',
      description: 'Retrieve complete details of a specific record by sys_id',
      inputSchema: {
        type: 'object',
        properties: {
          table: { type: 'string', description: 'Table name' },
          sys_id: { type: 'string', description: '32-character system ID' },
          fields: { type: 'string', description: 'Optional comma-separated fields' },
        },
        required: ['table', 'sys_id'],
      },
    },
    {
      name: 'create_record',
      description: 'Create a new record in any ServiceNow table (requires WRITE_ENABLED=true). Pass dry_run=true to preview the resolved payload without writing.',
      inputSchema: {
        type: 'object',
        properties: {
          table: { type: 'string', description: 'Table name (e.g., "incident", "sys_user_preference")' },
          fields: { type: 'object', description: 'Key-value pairs for the new record fields' },
          dry_run: { type: 'boolean', description: 'Preview only — return the resolved payload without creating the record' },
        },
        required: ['table', 'fields'],
      },
    },
    {
      name: 'update_record',
      description: 'Update an existing record in any ServiceNow table (requires WRITE_ENABLED=true). Pass dry_run=true to preview a before→after field diff without writing.',
      inputSchema: {
        type: 'object',
        properties: {
          table: { type: 'string', description: 'Table name (e.g., "incident", "sys_user_preference")' },
          sys_id: { type: 'string', description: '32-character system ID of the record to update' },
          fields: { type: 'object', description: 'Key-value pairs of fields to update' },
          dry_run: { type: 'boolean', description: 'Preview only — return a before→after diff without updating the record' },
        },
        required: ['table', 'sys_id', 'fields'],
      },
    },
    {
      name: 'delete_record',
      description: 'Delete a record from any ServiceNow table (requires WRITE_ENABLED=true). Pass dry_run=true to preview the record that would be deleted without deleting it.',
      inputSchema: {
        type: 'object',
        properties: {
          table: { type: 'string', description: 'Table name' },
          sys_id: { type: 'string', description: '32-character system ID of the record to delete' },
          dry_run: { type: 'boolean', description: 'Preview only — return the record that would be deleted without deleting it' },
        },
        required: ['table', 'sys_id'],
      },
    },
    {
      name: 'validate_query',
      description: 'Lint-check a ServiceNow encoded query BEFORE running it: validates javascript: expressions against the safe function allowlist, length limits, and common mistakes (e.g. using = instead of ^, raw spaces). Returns { valid, issues, suggestions }.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'The encoded query to validate, e.g. "active=true^priority=1^ORDERBYDESCsys_created_on"' },
        },
        required: ['query'],
      },
    },
    {
      name: 'get_user',
      description: 'Look up user details by email or username',
      inputSchema: {
        type: 'object',
        properties: {
          user_identifier: { type: 'string', description: 'Email address or username' },
        },
        required: ['user_identifier'],
      },
    },
    {
      name: 'get_group',
      description: 'Find assignment group details by name or sys_id',
      inputSchema: {
        type: 'object',
        properties: {
          group_identifier: { type: 'string', description: 'Group name or sys_id' },
        },
        required: ['group_identifier'],
      },
    },
    {
      name: 'search_cmdb_ci',
      description: 'Search for configuration items (CIs) in the CMDB',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Encoded query (e.g., "sys_class_name=cmdb_ci_server")' },
          limit: { type: 'number', description: 'Max CIs (default: 10, max: 100)' },
        },
        required: [],
      },
    },
    {
      name: 'get_cmdb_ci',
      description: 'Get complete information about a specific configuration item',
      inputSchema: {
        type: 'object',
        properties: {
          ci_sys_id: { type: 'string', description: 'System ID of the CI' },
          fields: { type: 'string', description: 'Optional comma-separated fields' },
        },
        required: ['ci_sys_id'],
      },
    },
    {
      name: 'list_relationships',
      description: 'Show parent and child relationships for a CI',
      inputSchema: {
        type: 'object',
        properties: {
          ci_sys_id: { type: 'string', description: 'System ID of the CI' },
        },
        required: ['ci_sys_id'],
      },
    },
    {
      name: 'list_discovery_schedules',
      description: 'List discovery schedules and their run status',
      inputSchema: {
        type: 'object',
        properties: {
          active_only: { type: 'boolean', description: 'Only show active schedules' },
        },
        required: [],
      },
    },
    {
      name: 'list_mid_servers',
      description: 'List MID servers and verify they are healthy',
      inputSchema: {
        type: 'object',
        properties: {
          active_only: { type: 'boolean', description: 'Only show servers with status "Up"' },
        },
        required: [],
      },
    },
    {
      name: 'list_active_events',
      description: 'Monitor critical infrastructure events',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Filter events (e.g., "severity=1")' },
          limit: { type: 'number', description: 'Max events (default: 10)' },
        },
        required: [],
      },
    },
    {
      name: 'cmdb_health_dashboard',
      description: 'Get CMDB data quality metrics (completeness of server and network CI data)',
      inputSchema: { type: 'object', properties: {}, required: [] },
    },
    {
      name: 'service_mapping_summary',
      description: 'View service dependencies and related CIs for impact analysis',
      inputSchema: {
        type: 'object',
        properties: {
          service_sys_id: { type: 'string', description: 'System ID of the business service' },
        },
        required: ['service_sys_id'],
      },
    },
    {
      name: 'natural_language_search',
      description: 'Search ServiceNow using plain English',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Plain English query' },
          limit: { type: 'number', description: 'Max results (default: 10)' },
        },
        required: ['query'],
      },
    },
    {
      name: 'natural_language_update',
      description: 'Update a record using natural language (requires WRITE_ENABLED=true)',
      inputSchema: {
        type: 'object',
        properties: {
          instruction: { type: 'string', description: 'Natural language update instruction' },
          table: { type: 'string', description: 'Table name' },
        },
        required: ['instruction', 'table'],
      },
    },
    {
      name: 'list_instances',
      description: 'List all configured ServiceNow instances (multi-instance / multi-customer support)',
      inputSchema: { type: 'object', properties: {}, required: [] },
    },
    {
      name: 'switch_instance',
      description: 'Switch the active ServiceNow instance for this session',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Instance name as configured (e.g. "prod", "dev", "customer_a")' },
        },
        required: ['name'],
      },
    },
    {
      name: 'get_current_instance',
      description: 'Get the currently active ServiceNow instance name and URL',
      inputSchema: { type: 'object', properties: {}, required: [] },
    },
    {
      name: 'create_ci_relationship',
      description: '[Write] Create a relationship between two CMDB Configuration Items',
      inputSchema: {
        type: 'object',
        properties: {
          parent: { type: 'string', description: 'Parent CI sys_id' },
          child: { type: 'string', description: 'Child CI sys_id' },
          type: { type: 'string', description: 'Relationship type (e.g. "Runs on::Runs")' },
        },
        required: ['parent', 'child', 'type'],
      },
    },
    {
      name: 'cmdb_impact_analysis',
      description: 'Analyze the downstream impact of a Configuration Item change or outage',
      inputSchema: {
        type: 'object',
        properties: {
          ci_sys_id: { type: 'string', description: 'CI sys_id to analyze' },
          depth: { type: 'number', description: 'Relationship depth to traverse (default: 2)' },
        },
        required: ['ci_sys_id'],
      },
    },
    {
      name: 'run_discovery_scan',
      description: '[Write] Trigger a ServiceNow Discovery scan for network/infrastructure',
      inputSchema: {
        type: 'object',
        properties: {
          schedule_id: { type: 'string', description: 'Discovery schedule sys_id to run' },
          mid_server: { type: 'string', description: 'Optional MID server name' },
        },
        required: ['schedule_id'],
      },
    },
  ];
}

export async function executeCoreToolCall(
  client: ServiceNowClient,
  name: string,
  args: Record<string, any>
): Promise<any> {
  switch (name) {
    case 'query_records': {
      const params = args as QueryRecordsParams;
      if (!params.table) throw new ServiceNowError('Table name is required', 'INVALID_REQUEST');
      const response = await client.queryRecords(params);
      return { count: response.count, records: response.records, summary: `Found ${response.count} record(s) in "${params.table}"` };
    }
    case 'get_table_schema':
      if (!args.table) throw new ServiceNowError('Table name is required', 'INVALID_REQUEST');
      return await client.getTableSchema(args.table);

    case 'validate_query': {
      if (typeof args.query !== 'string') throw new ServiceNowError('query is required', 'INVALID_REQUEST');
      const issues: string[] = [];
      const suggestions: string[] = [];
      let valid = true;
      try {
        validateQuery(args.query);
      } catch (err) {
        valid = false;
        issues.push(err instanceof Error ? err.message : String(err));
      }
      // Heuristic lint for common encoded-query mistakes.
      if (/\s(AND|OR)\s/i.test(args.query)) {
        issues.push('Uses SQL-style AND/OR. ServiceNow encoded queries join conditions with "^" (AND) and "^OR" (OR).');
        suggestions.push('Replace " AND " with "^" and " OR " with "^OR".');
      }
      if (args.query.includes(' ') && !/LIKE|ORDERBY|javascript:/i.test(args.query)) {
        suggestions.push('Raw spaces are usually unintended in encoded queries (except inside values). Verify field/operator spacing.');
      }
      if (/ORDER BY/i.test(args.query)) {
        issues.push('Uses "ORDER BY". The encoded-query form is "^ORDERBYfield" / "^ORDERBYDESCfield".');
      }
      if (valid && issues.length === 0) suggestions.push('Query looks syntactically valid.');
      return { valid: valid && issues.length === 0, query: args.query, issues, suggestions };
    }

    case 'get_record': {
      const p = args as GetRecordParams;
      if (!p.table || !p.sys_id) throw new ServiceNowError('table and sys_id are required', 'INVALID_REQUEST');
      return await client.getRecord(p.table, p.sys_id, p.fields);
    }
    case 'create_record': {
      requireWrite();
      if (!args.table || !args.fields) throw new ServiceNowError('table and fields are required', 'INVALID_REQUEST');
      assertWriteAllowed(args.table, args.fields);
      const instance = instanceManager.getCurrentName();
      if (args.dry_run) {
        return { action: 'dry_run', would: 'create', table: args.table, payload: args.fields, note: 'No record was created. Re-run without dry_run to apply.' };
      }
      try {
        const created = await client.createRecord(args.table, args.fields);
        await appendAudit({ instance, tool: 'create_record', action: 'create', table: args.table, sys_id: (created as any)?.sys_id, result: 'ok' }, args.fields);
        return { action: 'created', table: args.table, ...created };
      } catch (err) {
        await appendAudit({ instance, tool: 'create_record', action: 'create', table: args.table, result: 'error', error: err instanceof Error ? err.message : String(err) }, args.fields);
        throw err;
      }
    }

    case 'update_record': {
      requireWrite();
      if (!args.table || !args.sys_id || !args.fields) throw new ServiceNowError('table, sys_id, and fields are required', 'INVALID_REQUEST');
      assertWriteAllowed(args.table, args.fields);
      const instance = instanceManager.getCurrentName();
      if (args.dry_run) {
        let before: Record<string, any> = {};
        try { before = await client.getRecord(args.table, args.sys_id, Object.keys(args.fields).join(',')); } catch { /* record may not be readable */ }
        return { action: 'dry_run', would: 'update', table: args.table, sys_id: args.sys_id, diff: computeDiff(before, args.fields), note: 'No record was updated. Re-run without dry_run to apply.' };
      }
      try {
        const updated = await client.updateRecord(args.table, args.sys_id, args.fields);
        await appendAudit({ instance, tool: 'update_record', action: 'update', table: args.table, sys_id: args.sys_id, result: 'ok' }, args.fields);
        return { action: 'updated', table: args.table, sys_id: args.sys_id, ...updated };
      } catch (err) {
        await appendAudit({ instance, tool: 'update_record', action: 'update', table: args.table, sys_id: args.sys_id, result: 'error', error: err instanceof Error ? err.message : String(err) }, args.fields);
        throw err;
      }
    }

    case 'delete_record': {
      requireWrite();
      if (!args.table || !args.sys_id) throw new ServiceNowError('table and sys_id are required', 'INVALID_REQUEST');
      assertDeleteAllowed(args.table);
      const instance = instanceManager.getCurrentName();
      if (args.dry_run) {
        let current: Record<string, any> | undefined;
        try { current = await client.getRecord(args.table, args.sys_id); } catch { /* not readable */ }
        return { action: 'dry_run', would: 'delete', table: args.table, sys_id: args.sys_id, current_record: current, note: 'No record was deleted. Re-run without dry_run to apply.' };
      }
      try {
        await client.deleteRecord(args.table, args.sys_id);
        await appendAudit({ instance, tool: 'delete_record', action: 'delete', table: args.table, sys_id: args.sys_id, result: 'ok' });
        return { action: 'deleted', table: args.table, sys_id: args.sys_id };
      } catch (err) {
        await appendAudit({ instance, tool: 'delete_record', action: 'delete', table: args.table, sys_id: args.sys_id, result: 'error', error: err instanceof Error ? err.message : String(err) });
        throw err;
      }
    }

    case 'get_user':
      if (!args.user_identifier) throw new ServiceNowError('user_identifier is required', 'INVALID_REQUEST');
      return await client.getUser(args.user_identifier);

    case 'get_group':
      if (!args.group_identifier) throw new ServiceNowError('group_identifier is required', 'INVALID_REQUEST');
      return await client.getGroup(args.group_identifier);

    case 'search_cmdb_ci':
      return await client.searchCmdbCi((args as SearchCmdbCiParams).query, (args as SearchCmdbCiParams).limit);

    case 'get_cmdb_ci': {
      const p = args as GetCmdbCiParams;
      if (!p.ci_sys_id) throw new ServiceNowError('ci_sys_id is required', 'INVALID_REQUEST');
      return await client.getCmdbCi(p.ci_sys_id, p.fields);
    }
    case 'list_relationships': {
      const p = args as ListRelationshipsParams;
      if (!p.ci_sys_id) throw new ServiceNowError('ci_sys_id is required', 'INVALID_REQUEST');
      return await client.listRelationships(p.ci_sys_id);
    }
    case 'list_discovery_schedules':
      return await client.listDiscoverySchedules((args as ListDiscoverySchedulesParams).active_only);

    case 'list_mid_servers':
      return await client.listMidServers((args as ListMidServersParams).active_only);

    case 'list_active_events':
      return await client.listActiveEvents((args as ListActiveEventsParams).query, (args as ListActiveEventsParams).limit);

    case 'cmdb_health_dashboard':
      return await client.cmdbHealthDashboard();

    case 'service_mapping_summary': {
      const p = args as ServiceMappingSummaryParams;
      if (!p.service_sys_id) throw new ServiceNowError('service_sys_id is required', 'INVALID_REQUEST');
      return await client.serviceMappingSummary(p.service_sys_id);
    }
    case 'natural_language_search':
      return await client.naturalLanguageSearch(args.query, args.limit);

    case 'natural_language_update':
      requireWrite();
      return await client.naturalLanguageUpdate(args.instruction, args.table);

    case 'list_instances':
      return {
        current: instanceManager.getCurrentName(),
        instances: instanceManager.listAll(),
        total: instanceManager.listNames().length,
      };

    case 'switch_instance':
      if (!args.name) throw new ServiceNowError('name is required', 'INVALID_REQUEST');
      instanceManager.switch(args.name);
      return {
        action: 'switched',
        active_instance: instanceManager.getCurrentName(),
        url: instanceManager.getCurrentUrl(),
      };

    case 'get_current_instance':
      return {
        name: instanceManager.getCurrentName(),
        url: instanceManager.getCurrentUrl(),
        all_instances: instanceManager.listNames(),
      };

    case 'create_ci_relationship': {
      requireWrite();
      if (!args.parent || !args.child || !args.type)
        throw new ServiceNowError('parent, child, and type are required', 'INVALID_REQUEST');
      const result = await client.createRecord('cmdb_rel_ci', {
        parent: args.parent,
        child: args.child,
        type: args.type,
      });
      return { ...result, summary: `Created CI relationship: ${args.parent} -> ${args.child} (${args.type})` };
    }

    case 'cmdb_impact_analysis': {
      if (!args.ci_sys_id) throw new ServiceNowError('ci_sys_id is required', 'INVALID_REQUEST');
      const maxDepth = args.depth || 2;
      const visited = new Set<string>();
      const impactTree: any[] = [];

      async function traverse(ciSysId: string, currentDepth: number): Promise<any[]> {
        if (currentDepth > maxDepth || visited.has(ciSysId)) return [];
        visited.add(ciSysId);
        const resp = await client.queryRecords({
          table: 'cmdb_rel_ci',
          query: `parent=${ciSysId}`,
          fields: 'sys_id,child,type,parent',
          limit: 100,
        });
        const children: any[] = [];
        for (const rel of resp.records) {
          const childId = typeof rel.child === 'object' ? (rel.child as any).value : rel.child;
          const downstream = await traverse(childId, currentDepth + 1);
          children.push({ relationship: rel, downstream });
        }
        return children;
      }

      const downstream = await traverse(args.ci_sys_id, 1);
      impactTree.push({ ci_sys_id: args.ci_sys_id, depth: maxDepth, downstream });
      return { impact_analysis: impactTree, total_impacted: visited.size - 1 };
    }

    case 'run_discovery_scan': {
      requireWrite();
      if (!args.schedule_id) throw new ServiceNowError('schedule_id is required', 'INVALID_REQUEST');
      const data: Record<string, any> = {
        dsc_schedule: args.schedule_id,
        state: 'active',
      };
      if (args.mid_server) data.mid_server = args.mid_server;
      const result = await client.createRecord('discovery_status', data);
      return { ...result, summary: `Triggered discovery scan for schedule ${args.schedule_id}` };
    }

    default:
      return null; // not handled here
  }
}

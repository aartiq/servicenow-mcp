/**
 * Performance Analytics & Dashboards tools — PA indicators, scorecards, KPIs, and dashboards.
 * All read-only tools: Tier 0.
 * Inspired by snow-flow's "Analysis" category: KPI management, Performance Analytics, dashboards.
 */
import type { ServiceNowClient } from '../servicenow/client.js';
import { ServiceNowError } from '../utils/errors.js';
import { requireWrite } from '../utils/permissions.js';

export function getPerformanceToolDefinitions() {
  return [
    // ── PA Indicators ────────────────────────────────────────────────────────
    {
      name: 'list_pa_indicators',
      description: 'List Performance Analytics (PA) indicators (KPIs) available in the instance',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search indicators by name or description' },
          category: { type: 'string', description: 'Filter by indicator category' },
          active: { type: 'boolean', description: 'Filter to active indicators only (default true)' },
          limit: { type: 'number', description: 'Max records to return (default 50)' },
        },
        required: [],
      },
    },
    {
      name: 'get_pa_indicator',
      description: 'Get details of a specific Performance Analytics indicator including its formula',
      inputSchema: {
        type: 'object',
        properties: {
          sys_id_or_name: { type: 'string', description: 'Indicator sys_id or name' },
        },
        required: ['sys_id_or_name'],
      },
    },
    {
      name: 'get_pa_scorecard',
      description:
        'Get current scorecard data for a PA indicator — returns current value, target, trend direction',
      inputSchema: {
        type: 'object',
        properties: {
          indicator_sys_id: { type: 'string', description: 'PA indicator sys_id' },
          breakdown_sys_id: {
            type: 'string',
            description: 'Optional breakdown (dimension) sys_id to segment data by group',
          },
          period: {
            type: 'string',
            description: 'Time period: last_7_days, last_30_days, last_quarter, last_year (default: last_30_days)',
          },
          include_scores: { type: 'boolean', description: 'Include individual score records (default false)' },
        },
        required: ['indicator_sys_id'],
      },
    },
    {
      name: 'get_pa_time_series',
      description: 'Get historical time-series data for a PA indicator to identify trends',
      inputSchema: {
        type: 'object',
        properties: {
          indicator_sys_id: { type: 'string', description: 'PA indicator sys_id' },
          start_date: {
            type: 'string',
            description: 'Start date in YYYY-MM-DD format (default: 30 days ago)',
          },
          end_date: { type: 'string', description: 'End date in YYYY-MM-DD format (default: today)' },
          limit: { type: 'number', description: 'Max data points to return (default 100)' },
        },
        required: ['indicator_sys_id'],
      },
    },
    {
      name: 'list_pa_breakdowns',
      description: 'List PA breakdowns (dimensions) available for segmenting indicator data',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search breakdowns by name' },
          limit: { type: 'number', description: 'Max records to return (default 25)' },
        },
        required: [],
      },
    },
    // ── Dashboards ───────────────────────────────────────────────────────────
    {
      name: 'list_pa_dashboards',
      description: 'List Performance Analytics dashboards',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search dashboards by name' },
          limit: { type: 'number', description: 'Max records to return (default 25)' },
        },
        required: [],
      },
    },
    {
      name: 'get_pa_dashboard',
      description: 'Get details of a PA dashboard including its widgets/tabs',
      inputSchema: {
        type: 'object',
        properties: {
          sys_id_or_name: { type: 'string', description: 'Dashboard sys_id or name' },
        },
        required: ['sys_id_or_name'],
      },
    },
    {
      name: 'list_homepages',
      description: 'List homepage dashboards (CMS content pages used as homepages)',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search by title' },
          limit: { type: 'number', description: 'Max records to return (default 25)' },
        },
        required: [],
      },
    },
    // ── PA Jobs ──────────────────────────────────────────────────────────────
    {
      name: 'list_pa_jobs',
      description: 'List Performance Analytics data collection jobs and their schedules',
      inputSchema: {
        type: 'object',
        properties: {
          active: { type: 'boolean', description: 'Filter to active jobs only (default true)' },
          query: { type: 'string', description: 'Search by name' },
          limit: { type: 'number', description: 'Max records to return (default 25)' },
        },
        required: [],
      },
    },
    {
      name: 'get_pa_job',
      description: 'Get details of a Performance Analytics collection job',
      inputSchema: {
        type: 'object',
        properties: {
          sys_id: { type: 'string', description: 'PA job sys_id' },
        },
        required: ['sys_id'],
      },
    },
    // ── Dashboard Management ─────────────────────────────────────────────────
    {
      name: 'create_dashboard',
      description:
        'Create a new Performance Analytics dashboard (requires WRITE_ENABLED=true)',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Dashboard name' },
          description: { type: 'string', description: 'Brief description of the dashboard' },
          roles: {
            type: 'string',
            description: 'Comma-separated roles that can view this dashboard (leave blank for all)',
          },
          active: { type: 'boolean', description: 'Activate the dashboard immediately (default: true)' },
        },
        required: ['name'],
      },
    },
    {
      name: 'update_dashboard',
      description: 'Update an existing PA dashboard (requires WRITE_ENABLED=true)',
      inputSchema: {
        type: 'object',
        properties: {
          sys_id: { type: 'string', description: 'Dashboard sys_id' },
          fields: {
            type: 'object',
            description: 'Fields to update (name, description, roles, active, etc.)',
          },
        },
        required: ['sys_id', 'fields'],
      },
    },
    // ── Data Quality ─────────────────────────────────────────────────────────
    {
      name: 'check_table_completeness',
      description:
        'Analyze data quality and field completeness for a ServiceNow table — ' +
        'returns percentage of non-empty values per field',
      inputSchema: {
        type: 'object',
        properties: {
          table: { type: 'string', description: 'Table name to analyze (e.g. "incident", "cmdb_ci_server")' },
          fields: {
            type: 'string',
            description: 'Comma-separated field names to check (e.g. "assigned_to,priority,category")',
          },
          query: {
            type: 'string',
            description: 'Optional encoded query to scope the analysis (e.g. "active=true")',
          },
          sample_size: {
            type: 'number',
            description: 'Number of records to sample (default 100, max 500)',
          },
        },
        required: ['table', 'fields'],
      },
    },
    {
      name: 'get_table_record_count',
      description: 'Get total record count for a ServiceNow table with optional filters',
      inputSchema: {
        type: 'object',
        properties: {
          table: { type: 'string', description: 'Table name' },
          query: { type: 'string', description: 'Optional encoded query to count a subset' },
        },
        required: ['table'],
      },
    },
    {
      name: 'compare_record_counts',
      description:
        'Compare record counts across multiple ServiceNow tables or time periods — useful for capacity planning',
      inputSchema: {
        type: 'object',
        properties: {
          tables: {
            type: 'array',
            items: { type: 'string' },
            description: 'List of table names to compare (e.g. ["incident", "change_request", "problem"])',
          },
          query: { type: 'string', description: 'Optional query to apply to all tables' },
        },
        required: ['tables'],
      },
    },
  ];
}

export async function executePerformanceToolCall(
  client: ServiceNowClient,
  name: string,
  args: Record<string, any>
): Promise<any> {
  switch (name) {
    // ── PA Indicators ────────────────────────────────────────────────────────
    case 'list_pa_indicators': {
      const parts: string[] = [];
      if (args.active !== false) parts.push('active=true');
      if (args.category) parts.push(`category=${args.category}`);
      if (args.query) parts.push(`nameCONTAINS${args.query}^ORdescriptionCONTAINS${args.query}`);
      return await client.queryRecords({
        table: 'pa_indicators',
        query: parts.join('^') || '',
        limit: args.limit ?? 50,
        fields: 'sys_id,name,description,unit,direction,active,category,sys_updated_on',
      });
    }
    case 'get_pa_indicator': {
      if (!args.sys_id_or_name) throw new ServiceNowError('sys_id_or_name is required', 'INVALID_REQUEST');
      if (/^[0-9a-f]{32}$/i.test(args.sys_id_or_name)) {
        return await client.getRecord('pa_indicators', args.sys_id_or_name);
      }
      const resp = await client.queryRecords({
        table: 'pa_indicators',
        query: `nameCONTAINS${args.sys_id_or_name}`,
        limit: 1,
      });
      if (resp.count === 0) throw new ServiceNowError(`PA indicator not found: ${args.sys_id_or_name}`, 'NOT_FOUND');
      return resp.records[0];
    }
    case 'get_pa_scorecard': {
      if (!args.indicator_sys_id) throw new ServiceNowError('indicator_sys_id is required', 'INVALID_REQUEST');
      // Query pa_scores for the indicator's latest data
      const scoreParts = [`indicator=${args.indicator_sys_id}`];
      if (args.breakdown_sys_id) scoreParts.push(`breakdown_element=${args.breakdown_sys_id}`);
      const scores = await client.queryRecords({
        table: 'pa_scores',
        query: scoreParts.join('^'),
        limit: args.include_scores ? 50 : 5,
        orderBy: '-sys_created_on',
        fields: 'sys_id,indicator,value,date,breakdown_element,sys_created_on',
      });

      // Get indicator metadata
      const indicator = await client.getRecord('pa_indicators', args.indicator_sys_id);

      const latestScore = scores.records[0];
      const prevScore = scores.records[1];
      const trend = latestScore && prevScore
        ? (parseFloat(String(latestScore.value)) > parseFloat(String(prevScore.value)) ? 'up' : 'down')
        : 'stable';

      return {
        indicator: {
          sys_id: indicator.sys_id,
          name: indicator.name,
          unit: indicator.unit,
          direction: indicator.direction,
        },
        current_value: latestScore?.value ?? 'N/A',
        previous_value: prevScore?.value ?? 'N/A',
        trend,
        last_collected: latestScore?.date ?? latestScore?.sys_created_on ?? 'unknown',
        scores: args.include_scores ? scores.records : undefined,
      };
    }
    case 'get_pa_time_series': {
      if (!args.indicator_sys_id) throw new ServiceNowError('indicator_sys_id is required', 'INVALID_REQUEST');
      const parts = [`indicator=${args.indicator_sys_id}`];
      if (args.start_date) parts.push(`date>=${args.start_date}`);
      if (args.end_date) parts.push(`date<=${args.end_date}`);
      return await client.queryRecords({
        table: 'pa_scores',
        query: parts.join('^'),
        limit: args.limit ?? 100,
        orderBy: 'date',
        fields: 'sys_id,indicator,value,date,sys_created_on',
      });
    }
    case 'list_pa_breakdowns': {
      const parts: string[] = [];
      if (args.query) parts.push(`nameCONTAINS${args.query}`);
      return await client.queryRecords({
        table: 'pa_breakdowns',
        query: parts.join('^') || undefined,
        limit: args.limit ?? 25,
        fields: 'sys_id,name,type,table,field,sys_updated_on',
      });
    }
    // ── Dashboards ───────────────────────────────────────────────────────────
    case 'list_pa_dashboards': {
      const parts: string[] = [];
      if (args.query) parts.push(`nameCONTAINS${args.query}`);
      return await client.queryRecords({
        table: 'pa_dashboards',
        query: parts.join('^') || undefined,
        limit: args.limit ?? 25,
        fields: 'sys_id,name,description,sys_updated_on',
      });
    }
    case 'get_pa_dashboard': {
      if (!args.sys_id_or_name) throw new ServiceNowError('sys_id_or_name is required', 'INVALID_REQUEST');
      if (/^[0-9a-f]{32}$/i.test(args.sys_id_or_name)) {
        return await client.getRecord('pa_dashboards', args.sys_id_or_name);
      }
      const resp = await client.queryRecords({
        table: 'pa_dashboards',
        query: `nameCONTAINS${args.sys_id_or_name}`,
        limit: 1,
      });
      if (resp.count === 0) throw new ServiceNowError(`PA dashboard not found: ${args.sys_id_or_name}`, 'NOT_FOUND');
      return resp.records[0];
    }
    case 'list_homepages': {
      const parts: string[] = [];
      if (args.query) parts.push(`titleCONTAINS${args.query}`);
      return await client.queryRecords({
        table: 'sys_ui_hp',
        query: parts.join('^') || undefined,
        limit: args.limit ?? 25,
        fields: 'sys_id,title,roles,sys_updated_on',
      });
    }
    // ── PA Jobs ──────────────────────────────────────────────────────────────
    case 'list_pa_jobs': {
      const parts: string[] = [];
      if (args.active !== false) parts.push('active=true');
      if (args.query) parts.push(`nameCONTAINS${args.query}`);
      return await client.queryRecords({
        table: 'pa_job',
        query: parts.join('^') || '',
        limit: args.limit ?? 25,
        fields: 'sys_id,name,active,schedule,sys_updated_on',
      });
    }
    case 'get_pa_job': {
      if (!args.sys_id) throw new ServiceNowError('sys_id is required', 'INVALID_REQUEST');
      return await client.getRecord('pa_job', args.sys_id);
    }
    // ── Data Quality ─────────────────────────────────────────────────────────
    case 'check_table_completeness': {
      if (!args.table || !args.fields) throw new ServiceNowError('table and fields are required', 'INVALID_REQUEST');
      const fieldList = args.fields.split(',').map((f: string) => f.trim()).filter(Boolean);
      const sampleSize = Math.min(args.sample_size ?? 100, 500);

      const resp = await client.queryRecords({
        table: args.table,
        query: args.query,
        limit: sampleSize,
        fields: fieldList.join(','),
      });

      const totalRecords = resp.count;
      const completeness: Record<string, any> = {};

      for (const field of fieldList) {
        const nonEmpty = resp.records.filter((r: any) => {
          const val = r[field];
          return val !== null && val !== undefined && val !== '' && val !== '0' && val !== false;
        }).length;
        completeness[field] = {
          non_empty: nonEmpty,
          total: totalRecords,
          completeness_pct: totalRecords > 0 ? ((nonEmpty / totalRecords) * 100).toFixed(1) + '%' : '0%',
        };
      }

      return {
        table: args.table,
        sample_size: totalRecords,
        query: args.query || 'all records',
        field_completeness: completeness,
        note: totalRecords < sampleSize
          ? `Only ${totalRecords} records found (less than requested sample of ${sampleSize})`
          : undefined,
      };
    }
    case 'get_table_record_count': {
      if (!args.table) throw new ServiceNowError('table is required', 'INVALID_REQUEST');
      // Use aggregate query for accurate count
      try {
        const resp = await client.runAggregateQuery(args.table, '', 'COUNT', args.query);
        const count = resp?.stats?.count ?? resp?.count ?? 'unknown';
        return { table: args.table, query: args.query || 'all records', record_count: count };
      } catch {
        // Fallback: query with limit=1 to at least confirm table exists
        const resp = await client.queryRecords({ table: args.table, query: args.query, limit: 1 });
        return { table: args.table, query: args.query || 'all records', record_count: resp.count, note: 'Count may be approximate (aggregate API unavailable)' };
      }
    }
    case 'create_dashboard': {
      requireWrite();
      if (!args.name) throw new ServiceNowError('name is required', 'INVALID_REQUEST');
      const data: Record<string, any> = {
        name: args.name,
        active: args.active !== false,
      };
      if (args.description) data.description = args.description;
      if (args.roles) data.roles = args.roles;
      const result = await client.createRecord('pa_dashboards', data);
      return { ...result, summary: `Created dashboard "${args.name}"` };
    }
    case 'update_dashboard': {
      requireWrite();
      if (!args.sys_id || !args.fields)
        throw new ServiceNowError('sys_id and fields are required', 'INVALID_REQUEST');
      const result = await client.updateRecord('pa_dashboards', args.sys_id, args.fields);
      return { ...result, summary: `Updated dashboard ${args.sys_id}` };
    }
    case 'compare_record_counts': {
      if (!args.tables || !Array.isArray(args.tables) || args.tables.length === 0) {
        throw new ServiceNowError('tables must be a non-empty array', 'INVALID_REQUEST');
      }
      const results: Record<string, any> = {};
      for (const table of args.tables) {
        try {
          const resp = await client.queryRecords({ table, query: args.query, limit: 1 });
          results[table] = { accessible: true, record_count: resp.count };
        } catch (err) {
          results[table] = { accessible: false, error: err instanceof Error ? err.message : 'Unknown error' };
        }
      }
      return { query: args.query || 'all records', table_counts: results };
    }
    default:
      return null;
  }
}

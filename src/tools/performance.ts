/**
 * Performance Analytics & Dashboards tools — PA indicators, scorecards, KPIs, breakdowns,
 * indicator sources, and both legacy (pa_dashboards) and modern PAR (par_dashboard) dashboards.
 * Read tools: Tier 0. Write tools require WRITE_ENABLED=true.
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
    // ── Indicator Write ──────────────────────────────────────────────────────
    {
      name: 'create_indicator',
      description: 'Create a new Performance Analytics indicator (KPI) (requires WRITE_ENABLED=true)',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Indicator name' },
          indicator_source: { type: 'string', description: 'sys_id of the pa_indicator_source record' },
          type: {
            type: 'string',
            description: 'Indicator type: automated (default), manual, or formula',
          },
          aggregate: {
            type: 'string',
            description: 'Aggregate function: COUNT (default), SUM, AVG, MIN, MAX, COUNT_DISTINCT',
          },
          field: { type: 'string', description: 'Field to aggregate (required for SUM/AVG/MIN/MAX)' },
          conditions: { type: 'string', description: 'Additional encoded query conditions applied on top of the indicator source' },
          unit: { type: 'string', description: 'Display unit, e.g. # (count), % (percentage), Day' },
          direction: {
            type: 'string',
            description: 'Trend direction: 1 = up is good (higher is better), 2 = down is good (lower is better)',
          },
          frequency: {
            type: 'string',
            description: 'Collection frequency: Daily (default), Weekly, Monthly, Quarterly, Yearly',
          },
          description: { type: 'string', description: 'Optional description' },
          active: { type: 'boolean', description: 'Activate the indicator immediately (default: true)' },
        },
        required: ['name'],
      },
    },
    {
      name: 'update_indicator',
      description: 'Update an existing PA indicator (requires WRITE_ENABLED=true)',
      inputSchema: {
        type: 'object',
        properties: {
          sys_id: { type: 'string', description: 'Indicator sys_id' },
          fields: {
            type: 'object',
            description: 'Fields to update (name, description, conditions, active, unit, direction, etc.)',
          },
        },
        required: ['sys_id', 'fields'],
      },
    },
    // ── Indicator Sources ────────────────────────────────────────────────────
    {
      name: 'list_indicator_sources',
      description: 'List PA indicator sources (fact table definitions that feed indicators)',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search by name' },
          table: { type: 'string', description: 'Filter by fact table name (e.g. "incident")' },
          limit: { type: 'number', description: 'Max records to return (default 25)' },
        },
        required: [],
      },
    },
    {
      name: 'get_indicator_source',
      description: 'Get details of a PA indicator source',
      inputSchema: {
        type: 'object',
        properties: {
          sys_id_or_name: { type: 'string', description: 'Indicator source sys_id or name' },
        },
        required: ['sys_id_or_name'],
      },
    },
    {
      name: 'create_indicator_source',
      description: 'Create a PA indicator source — defines the fact table and conditions for data collection (requires WRITE_ENABLED=true)',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Source name, e.g. "Demand.closed"' },
          table: { type: 'string', description: 'Fact table name, e.g. "pc_demand"' },
          conditions: {
            type: 'string',
            description: 'Encoded query conditions — should include a date field filter, e.g. "closed_atONToday@javascript:gs.beginningOfToday()@javascript:gs.endOfToday()"',
          },
          frequency: {
            type: 'string',
            description: 'Collection frequency: Daily (default), Weekly, Monthly, Quarterly, Yearly',
          },
          is_real_time: { type: 'boolean', description: 'Enable real-time collection (default: false)' },
        },
        required: ['name', 'table'],
      },
    },
    {
      name: 'update_indicator_source',
      description: 'Update an existing PA indicator source (requires WRITE_ENABLED=true)',
      inputSchema: {
        type: 'object',
        properties: {
          sys_id: { type: 'string', description: 'Indicator source sys_id' },
          fields: {
            type: 'object',
            description: 'Fields to update (name, table, conditions, frequency, is_real_time, etc.)',
          },
        },
        required: ['sys_id', 'fields'],
      },
    },
    // ── Breakdowns ───────────────────────────────────────────────────────────
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
    {
      name: 'get_pa_breakdown',
      description: 'Get details of a specific PA breakdown including its source',
      inputSchema: {
        type: 'object',
        properties: {
          sys_id_or_name: { type: 'string', description: 'Breakdown sys_id or name' },
        },
        required: ['sys_id_or_name'],
      },
    },
    {
      name: 'create_breakdown',
      description: 'Create a PA breakdown dimension (requires WRITE_ENABLED=true)',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Breakdown name, e.g. "Demand Category"' },
          breakdown_source: { type: 'string', description: 'sys_id of the pa_breakdown_source record' },
        },
        required: ['name', 'breakdown_source'],
      },
    },
    {
      name: 'update_breakdown',
      description: 'Update an existing PA breakdown (requires WRITE_ENABLED=true)',
      inputSchema: {
        type: 'object',
        properties: {
          sys_id: { type: 'string', description: 'Breakdown sys_id' },
          fields: { type: 'object', description: 'Fields to update (name, breakdown_source, etc.)' },
        },
        required: ['sys_id', 'fields'],
      },
    },
    {
      name: 'create_breakdown_source',
      description: 'Create a PA breakdown source — defines where breakdown elements (dimension values) come from (requires WRITE_ENABLED=true)',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Source name, e.g. "Demand Category source"' },
          table: { type: 'string', description: 'Facts table that contains the dimension values, e.g. "pc_demand"' },
          field: {
            type: 'string',
            description: 'Field in the facts table that identifies each breakdown element (typically sys_id or a category field)',
          },
          label_field: {
            type: 'string',
            description: 'Field to use as the display label for each element (e.g. "category" or "short_description")',
          },
          conditions: { type: 'string', description: 'Optional encoded query to filter which records become breakdown elements' },
          label_for_unmatched: {
            type: 'string',
            description: 'Label to show when a fact record does not match any breakdown element (default: "Other")',
          },
        },
        required: ['name', 'table', 'field'],
      },
    },
    {
      name: 'create_breakdown_mapping',
      description: 'Map a PA breakdown to an indicator source — links the dimension to the fact table (requires WRITE_ENABLED=true)',
      inputSchema: {
        type: 'object',
        properties: {
          indicator_source: { type: 'string', description: 'sys_id of the pa_indicator_source' },
          breakdown: { type: 'string', description: 'sys_id of the pa_breakdown' },
          field: {
            type: 'string',
            description: 'Field in the indicator source table that maps to the breakdown elements',
          },
          is_scripted: { type: 'boolean', description: 'Use a script to compute the mapping instead of a direct field (default: false)' },
          script: { type: 'string', description: 'GlideScript returning the breakdown element sys_id (required when is_scripted=true)' },
        },
        required: ['indicator_source', 'breakdown'],
      },
    },
    // ── Legacy PA Dashboards ─────────────────────────────────────────────────
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
    // ── PAR Dashboards (Platform Analytics — modern par_dashboard) ───────────
    {
      name: 'list_par_dashboards',
      description: 'List Platform Analytics (PAR) dashboards — the modern par_dashboard experience',
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
      name: 'get_par_dashboard',
      description: 'Get details of a PAR dashboard including its tabs and widgets',
      inputSchema: {
        type: 'object',
        properties: {
          sys_id_or_name: { type: 'string', description: 'PAR dashboard sys_id or name' },
        },
        required: ['sys_id_or_name'],
      },
    },
    {
      name: 'create_par_dashboard',
      description: 'Create a new Platform Analytics (PAR) dashboard in the par_dashboard table (requires WRITE_ENABLED=true)',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Dashboard name' },
          description: { type: 'string', description: 'Optional description' },
          roles: { type: 'string', description: 'Comma-separated roles that can view this dashboard (leave blank for all)' },
          active: { type: 'boolean', description: 'Activate immediately (default: true)' },
        },
        required: ['name'],
      },
    },
    {
      name: 'update_par_dashboard',
      description: 'Update an existing PAR dashboard (requires WRITE_ENABLED=true)',
      inputSchema: {
        type: 'object',
        properties: {
          sys_id: { type: 'string', description: 'PAR dashboard sys_id' },
          fields: { type: 'object', description: 'Fields to update (name, description, roles, active, etc.)' },
        },
        required: ['sys_id', 'fields'],
      },
    },
    {
      name: 'add_par_dashboard_tab',
      description: 'Add a tab to a PAR dashboard (requires WRITE_ENABLED=true)',
      inputSchema: {
        type: 'object',
        properties: {
          dashboard_sys_id: { type: 'string', description: 'sys_id of the par_dashboard record' },
          name: { type: 'string', description: 'Tab display name' },
          order: { type: 'number', description: 'Display order (lower numbers appear first, default: 100)' },
        },
        required: ['dashboard_sys_id', 'name'],
      },
    },
    {
      name: 'add_par_dashboard_widget',
      description: 'Add a widget to a PAR dashboard tab (requires WRITE_ENABLED=true). Use component names like: single-score, line, bar, pie, donut, gauge, list, rich-text',
      inputSchema: {
        type: 'object',
        properties: {
          dashboard_sys_id: { type: 'string', description: 'sys_id of the par_dashboard' },
          tab_sys_id: { type: 'string', description: 'sys_id of the par_dashboard_tab (omit to use first tab)' },
          component: {
            type: 'string',
            description: 'Widget component type: single-score, line, bar, vertical-bar, pie, donut, gauge, list, rich-text, image, heading',
          },
          title: { type: 'string', description: 'Widget title shown in the dashboard' },
          config: {
            type: 'object',
            description: 'Component-specific configuration (e.g. { "indicator": "<sys_id>", "breakdown": "<sys_id>" })',
          },
          width: { type: 'number', description: 'Width in grid units, 1–12 (default: 6)' },
          height: { type: 'number', description: 'Height in grid units (default: 4)' },
          x: { type: 'number', description: 'Horizontal grid position, 0-based (default: 0)' },
          y: { type: 'number', description: 'Vertical grid position, 0-based (default: 0)' },
        },
        required: ['dashboard_sys_id', 'component'],
      },
    },
    {
      name: 'remove_par_dashboard_widget',
      description: 'Remove a widget from a PAR dashboard (requires WRITE_ENABLED=true)',
      inputSchema: {
        type: 'object',
        properties: {
          widget_sys_id: { type: 'string', description: 'sys_id of the par_dashboard_widget record to remove' },
        },
        required: ['widget_sys_id'],
      },
    },
    // ── Legacy PA Dashboard Management ───────────────────────────────────────
    {
      name: 'create_dashboard',
      description:
        'Create a new legacy Performance Analytics dashboard in pa_dashboards (requires WRITE_ENABLED=true). For the modern PAR experience use create_par_dashboard instead.',
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
    // ── Indicator Write ──────────────────────────────────────────────────────
    case 'create_indicator': {
      requireWrite();
      if (!args.name) throw new ServiceNowError('name is required', 'INVALID_REQUEST');
      const data: Record<string, any> = {
        name: args.name,
        active: args.active !== false,
        type: args.type ?? 'automated',
        aggregate: args.aggregate ?? 'COUNT',
        frequency: args.frequency ?? 'Daily',
      };
      if (args.indicator_source) data.indicator_source = args.indicator_source;
      if (args.field) data.field = args.field;
      if (args.conditions) data.conditions = args.conditions;
      if (args.unit) data.unit = args.unit;
      if (args.direction) data.direction = args.direction;
      if (args.description) data.description = args.description;
      const result = await client.createRecord('pa_indicators', data);
      return { ...result, summary: `Created indicator "${args.name}"` };
    }
    case 'update_indicator': {
      requireWrite();
      if (!args.sys_id || !args.fields) throw new ServiceNowError('sys_id and fields are required', 'INVALID_REQUEST');
      const result = await client.updateRecord('pa_indicators', args.sys_id, args.fields);
      return { ...result, summary: `Updated indicator ${args.sys_id}` };
    }
    // ── Indicator Sources ────────────────────────────────────────────────────
    case 'list_indicator_sources': {
      const parts: string[] = [];
      if (args.query) parts.push(`nameCONTAINS${args.query}`);
      if (args.table) parts.push(`table=${args.table}`);
      return await client.queryRecords({
        table: 'pa_indicator_source',
        query: parts.join('^') || undefined,
        limit: args.limit ?? 25,
        fields: 'sys_id,name,table,frequency,conditions,is_real_time,sys_updated_on',
      });
    }
    case 'get_indicator_source': {
      if (!args.sys_id_or_name) throw new ServiceNowError('sys_id_or_name is required', 'INVALID_REQUEST');
      if (/^[0-9a-f]{32}$/i.test(args.sys_id_or_name)) {
        return await client.getRecord('pa_indicator_source', args.sys_id_or_name);
      }
      const resp = await client.queryRecords({
        table: 'pa_indicator_source',
        query: `nameCONTAINS${args.sys_id_or_name}`,
        limit: 1,
      });
      if (resp.count === 0) throw new ServiceNowError(`Indicator source not found: ${args.sys_id_or_name}`, 'NOT_FOUND');
      return resp.records[0];
    }
    case 'create_indicator_source': {
      requireWrite();
      if (!args.name || !args.table) throw new ServiceNowError('name and table are required', 'INVALID_REQUEST');
      const data: Record<string, any> = {
        name: args.name,
        table: args.table,
        frequency: args.frequency ?? 'Daily',
        is_real_time: args.is_real_time ?? false,
      };
      if (args.conditions) data.conditions = args.conditions;
      const result = await client.createRecord('pa_indicator_source', data);
      return { ...result, summary: `Created indicator source "${args.name}" on table ${args.table}` };
    }
    case 'update_indicator_source': {
      requireWrite();
      if (!args.sys_id || !args.fields) throw new ServiceNowError('sys_id and fields are required', 'INVALID_REQUEST');
      const result = await client.updateRecord('pa_indicator_source', args.sys_id, args.fields);
      return { ...result, summary: `Updated indicator source ${args.sys_id}` };
    }
    // ── Breakdowns ───────────────────────────────────────────────────────────
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
    case 'get_pa_breakdown': {
      if (!args.sys_id_or_name) throw new ServiceNowError('sys_id_or_name is required', 'INVALID_REQUEST');
      if (/^[0-9a-f]{32}$/i.test(args.sys_id_or_name)) {
        return await client.getRecord('pa_breakdowns', args.sys_id_or_name);
      }
      const resp = await client.queryRecords({
        table: 'pa_breakdowns',
        query: `nameCONTAINS${args.sys_id_or_name}`,
        limit: 1,
      });
      if (resp.count === 0) throw new ServiceNowError(`Breakdown not found: ${args.sys_id_or_name}`, 'NOT_FOUND');
      return resp.records[0];
    }
    case 'create_breakdown': {
      requireWrite();
      if (!args.name || !args.breakdown_source) throw new ServiceNowError('name and breakdown_source are required', 'INVALID_REQUEST');
      const result = await client.createRecord('pa_breakdowns', {
        name: args.name,
        breakdown_source: args.breakdown_source,
      });
      return { ...result, summary: `Created breakdown "${args.name}"` };
    }
    case 'update_breakdown': {
      requireWrite();
      if (!args.sys_id || !args.fields) throw new ServiceNowError('sys_id and fields are required', 'INVALID_REQUEST');
      const result = await client.updateRecord('pa_breakdowns', args.sys_id, args.fields);
      return { ...result, summary: `Updated breakdown ${args.sys_id}` };
    }
    case 'create_breakdown_source': {
      requireWrite();
      if (!args.name || !args.table || !args.field)
        throw new ServiceNowError('name, table, and field are required', 'INVALID_REQUEST');
      const data: Record<string, any> = {
        name: args.name,
        table: args.table,
        field: args.field,
        label_for_unmatched: args.label_for_unmatched ?? 'Other',
      };
      if (args.label_field) data.label_field = args.label_field;
      if (args.conditions) data.conditions = args.conditions;
      const result = await client.createRecord('pa_breakdown_source', data);
      return { ...result, summary: `Created breakdown source "${args.name}"` };
    }
    case 'create_breakdown_mapping': {
      requireWrite();
      if (!args.indicator_source || !args.breakdown)
        throw new ServiceNowError('indicator_source and breakdown are required', 'INVALID_REQUEST');
      if (args.is_scripted && !args.script)
        throw new ServiceNowError('script is required when is_scripted=true', 'INVALID_REQUEST');
      if (!args.is_scripted && !args.field)
        throw new ServiceNowError('field is required for non-scripted mappings', 'INVALID_REQUEST');
      const data: Record<string, any> = {
        indicator_source: args.indicator_source,
        breakdown: args.breakdown,
        is_scripted: args.is_scripted ?? false,
      };
      if (args.field) data.field = args.field;
      if (args.script) data.script = args.script;
      const result = await client.createRecord('pa_breakdown_mapping', data);
      return { ...result, summary: `Mapped breakdown ${args.breakdown} to indicator source ${args.indicator_source}` };
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
    // ── PAR Dashboards ───────────────────────────────────────────────────────
    case 'list_par_dashboards': {
      const parts: string[] = [];
      if (args.query) parts.push(`nameCONTAINS${args.query}`);
      return await client.queryRecords({
        table: 'par_dashboard',
        query: parts.join('^') || undefined,
        limit: args.limit ?? 25,
        fields: 'sys_id,name,description,active,roles,sys_updated_on',
      });
    }
    case 'get_par_dashboard': {
      if (!args.sys_id_or_name) throw new ServiceNowError('sys_id_or_name is required', 'INVALID_REQUEST');
      let dashboard;
      if (/^[0-9a-f]{32}$/i.test(args.sys_id_or_name)) {
        dashboard = await client.getRecord('par_dashboard', args.sys_id_or_name);
      } else {
        const resp = await client.queryRecords({
          table: 'par_dashboard',
          query: `nameCONTAINS${args.sys_id_or_name}`,
          limit: 1,
        });
        if (resp.count === 0) throw new ServiceNowError(`PAR dashboard not found: ${args.sys_id_or_name}`, 'NOT_FOUND');
        dashboard = resp.records[0];
      }
      // Fetch tabs for this dashboard
      const tabs = await client.queryRecords({
        table: 'par_dashboard_tab',
        query: `dashboard=${dashboard.sys_id}`,
        fields: 'sys_id,name,order',
        orderBy: 'order',
        limit: 50,
      });
      // Fetch widgets
      const widgets = await client.queryRecords({
        table: 'par_dashboard_widget',
        query: `dashboard=${dashboard.sys_id}`,
        fields: 'sys_id,title,component,tab,width,height,x,y,sys_updated_on',
        limit: 100,
      });
      return { ...dashboard, tabs: tabs.records, widgets: widgets.records };
    }
    case 'create_par_dashboard': {
      requireWrite();
      if (!args.name) throw new ServiceNowError('name is required', 'INVALID_REQUEST');
      const data: Record<string, any> = {
        name: args.name,
        active: args.active !== false,
      };
      if (args.description) data.description = args.description;
      if (args.roles) data.roles = args.roles;
      const result = await client.createRecord('par_dashboard', data);
      return { ...result, summary: `Created PAR dashboard "${args.name}"` };
    }
    case 'update_par_dashboard': {
      requireWrite();
      if (!args.sys_id || !args.fields) throw new ServiceNowError('sys_id and fields are required', 'INVALID_REQUEST');
      const result = await client.updateRecord('par_dashboard', args.sys_id, args.fields);
      return { ...result, summary: `Updated PAR dashboard ${args.sys_id}` };
    }
    case 'add_par_dashboard_tab': {
      requireWrite();
      if (!args.dashboard_sys_id || !args.name) throw new ServiceNowError('dashboard_sys_id and name are required', 'INVALID_REQUEST');
      const result = await client.createRecord('par_dashboard_tab', {
        dashboard: args.dashboard_sys_id,
        name: args.name,
        order: args.order ?? 100,
      });
      return { ...result, summary: `Added tab "${args.name}" to PAR dashboard ${args.dashboard_sys_id}` };
    }
    case 'add_par_dashboard_widget': {
      requireWrite();
      if (!args.dashboard_sys_id || !args.component) throw new ServiceNowError('dashboard_sys_id and component are required', 'INVALID_REQUEST');
      const data: Record<string, any> = {
        dashboard: args.dashboard_sys_id,
        component: args.component,
        width: args.width ?? 6,
        height: args.height ?? 4,
        x: args.x ?? 0,
        y: args.y ?? 0,
      };
      if (args.tab_sys_id) data.tab = args.tab_sys_id;
      if (args.title) data.title = args.title;
      if (args.config) data.config = JSON.stringify(args.config);
      const result = await client.createRecord('par_dashboard_widget', data);
      return { ...result, summary: `Added ${args.component} widget to PAR dashboard ${args.dashboard_sys_id}` };
    }
    case 'remove_par_dashboard_widget': {
      requireWrite();
      if (!args.widget_sys_id) throw new ServiceNowError('widget_sys_id is required', 'INVALID_REQUEST');
      await client.deleteRecord('par_dashboard_widget', args.widget_sys_id);
      return { summary: `Removed widget ${args.widget_sys_id} from PAR dashboard` };
    }
    // ── Legacy PA Dashboard Management ───────────────────────────────────────
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

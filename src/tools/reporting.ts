/**
 * Reporting & Analytics tools — ServiceNow Reporting API + branded report generation.
 * All tools are Tier 0 (read-only) unless noted.
 * ServiceNow API: GET /api/now/reporting, /api/now/stats/{table}, /api/now/pa/widget/{sys_id}
 */
import type { ServiceNowClient } from '../servicenow/client.js';
import { ServiceNowError } from '../utils/errors.js';
import { requireWrite } from '../utils/permissions.js';

export function getReportingToolDefinitions() {
  return [
    {
      name: 'list_reports',
      description: 'List saved reports in the instance (latest release: /api/now/reporting)',
      inputSchema: {
        type: 'object',
        properties: {
          search: { type: 'string', description: 'Search reports by name (uses sysparm_contains)' },
          category: { type: 'string', description: 'Filter by report category' },
          limit: { type: 'number', description: 'Max results (default: 20)' },
        },
        required: [],
      },
    },
    {
      name: 'get_report',
      description: 'Get the definition and metadata of a saved report',
      inputSchema: {
        type: 'object',
        properties: {
          sys_id_or_name: { type: 'string', description: 'Report sys_id or exact name' },
        },
        required: ['sys_id_or_name'],
      },
    },
    {
      name: 'run_aggregate_query',
      description: 'Run a grouped aggregate (COUNT, SUM, AVG) query on any table (latest release: /api/now/stats/{table})',
      inputSchema: {
        type: 'object',
        properties: {
          table: { type: 'string', description: 'Table to query (e.g., "incident", "task_sla")' },
          group_by: { type: 'string', description: 'Field to group results by (e.g., "priority", "state", "assignment_group")' },
          aggregate: { type: 'string', description: 'Aggregate function: COUNT (default), SUM, AVG, MIN, MAX' },
          query: { type: 'string', description: 'Optional encoded query filter' },
          limit: { type: 'number', description: 'Max groups (default: 20)' },
        },
        required: ['table', 'group_by'],
      },
    },
    {
      name: 'trend_query',
      description: 'Get time-bucketed trend data for a table (useful for monthly/weekly trend charts)',
      inputSchema: {
        type: 'object',
        properties: {
          table: { type: 'string', description: 'Table name (e.g., "incident")' },
          date_field: { type: 'string', description: 'Date field to bucket by (e.g., "opened_at", "sys_created_on")' },
          group_by: { type: 'string', description: 'Secondary grouping field (e.g., "priority", "state")' },
          query: { type: 'string', description: 'Optional encoded query filter' },
          periods: { type: 'number', description: 'Number of months to look back (default: 6)' },
        },
        required: ['table', 'date_field', 'group_by'],
      },
    },
    {
      name: 'get_performance_analytics',
      description: 'Get Performance Analytics widget data (requires PA plugin; latest release: /api/now/pa/widget/{sys_id})',
      inputSchema: {
        type: 'object',
        properties: {
          widget_sys_id: { type: 'string', description: 'sys_id of the PA widget' },
          time_range: { type: 'string', description: 'Time range (e.g., "last_30_days", "last_quarter")' },
        },
        required: ['widget_sys_id'],
      },
    },
    {
      name: 'export_report_data',
      description: 'Export raw table data as structured JSON for use in external reports',
      inputSchema: {
        type: 'object',
        properties: {
          table: { type: 'string', description: 'Table to export from' },
          query: { type: 'string', description: 'Encoded query filter' },
          fields: { type: 'string', description: 'Comma-separated fields to include' },
          limit: { type: 'number', description: 'Max records (default: 100, max: 1000)' },
        },
        required: ['table'],
      },
    },
    {
      name: 'get_sys_log',
      description: 'Retrieve system log entries for debugging or auditing',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Filter (e.g., "level=error^sys_created_onONToday@javascript:gs.beginningOfToday()@javascript:gs.endOfToday()")' },
          limit: { type: 'number', description: 'Max entries (default: 20)' },
        },
        required: [],
      },
    },
    {
      name: 'list_scheduled_jobs',
      description: 'List scheduled jobs and their run schedules',
      inputSchema: {
        type: 'object',
        properties: {
          active: { type: 'boolean', description: 'Filter to active jobs only (default: true)' },
          query: { type: 'string', description: 'Additional filter' },
          limit: { type: 'number', description: 'Max results (default: 20)' },
        },
        required: [],
      },
    },
    {
      name: 'get_scheduled_job',
      description: 'Get full details of a scheduled job by sys_id or name',
      inputSchema: {
        type: 'object',
        properties: {
          sys_id_or_name: { type: 'string', description: 'Job sys_id or exact name' },
        },
        required: ['sys_id_or_name'],
      },
    },
    {
      name: 'create_scheduled_job',
      description: 'Create a new scheduled script execution job (requires WRITE_ENABLED=true)',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Job name' },
          script: { type: 'string', description: 'Server-side JavaScript to run on schedule' },
          run_type: {
            type: 'string',
            description: 'Schedule type: "daily", "weekly", "monthly", "once", "periodically"',
          },
          run_time: {
            type: 'string',
            description: 'Time to run (HH:MM:SS format for daily/weekly/monthly)',
          },
          run_period: {
            type: 'string',
            description: 'Period interval for "periodically" type (e.g. "00:15:00" for 15 minutes)',
          },
          active: { type: 'boolean', description: 'Whether to activate immediately (default: true)' },
        },
        required: ['name', 'script', 'run_type'],
      },
    },
    {
      name: 'update_scheduled_job',
      description: 'Update a scheduled job (requires WRITE_ENABLED=true)',
      inputSchema: {
        type: 'object',
        properties: {
          sys_id: { type: 'string', description: 'Scheduled job sys_id' },
          fields: {
            type: 'object',
            description: 'Fields to update (name, script, active, run_type, run_time, etc.)',
          },
        },
        required: ['sys_id', 'fields'],
      },
    },
    {
      name: 'trigger_scheduled_job',
      description: 'Immediately execute a scheduled job on-demand (requires WRITE_ENABLED=true)',
      inputSchema: {
        type: 'object',
        properties: {
          sys_id: { type: 'string', description: 'Scheduled job sys_id to trigger' },
        },
        required: ['sys_id'],
      },
    },
    {
      name: 'create_report',
      description: 'Create a new saved report on any table (requires WRITE_ENABLED=true)',
      inputSchema: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Report title displayed in the list' },
          table: { type: 'string', description: 'Table to report on (e.g. "incident", "change_request")' },
          type: {
            type: 'string',
            description:
              'Report type: "bar", "column", "pie", "line", "list", "gauge", "single_score", "trend", "pivot", "calHeatmap"',
          },
          field: { type: 'string', description: 'Primary grouping field for the report' },
          query: { type: 'string', description: 'Encoded query to filter report data' },
          aggregate: {
            type: 'string',
            description: 'Aggregate function: COUNT (default), SUM, AVG, MIN, MAX',
          },
          group_by: { type: 'string', description: 'Secondary grouping field (stacked charts)' },
          roles: { type: 'string', description: 'Comma-separated roles that can view the report' },
        },
        required: ['title', 'table', 'type'],
      },
    },
    {
      name: 'update_report',
      description: 'Update an existing saved report definition (requires WRITE_ENABLED=true)',
      inputSchema: {
        type: 'object',
        properties: {
          sys_id: { type: 'string', description: 'Report sys_id' },
          fields: {
            type: 'object',
            description: 'Fields to update (title, type, query, field, aggregate, etc.)',
          },
        },
        required: ['sys_id', 'fields'],
      },
    },
    {
      name: 'list_job_run_history',
      description: 'List recent run history for scheduled jobs (success/failure log)',
      inputSchema: {
        type: 'object',
        properties: {
          job_sys_id: { type: 'string', description: 'Filter by specific job sys_id' },
          status: { type: 'string', description: 'Filter by run status: success, error, canceled' },
          limit: { type: 'number', description: 'Max results (default: 25)' },
        },
        required: [],
      },
    },
    {
      name: 'create_scheduled_report',
      description: '[Write] Schedule a report for recurring email delivery',
      inputSchema: {
        type: 'object',
        properties: {
          report_id: { type: 'string', description: 'Report sys_id' },
          frequency: { type: 'string', description: 'Frequency: daily/weekly/monthly' },
          recipients: { type: 'string', description: 'Email addresses' },
          day_of_week: { type: 'string', description: 'Day of week (for weekly frequency)' },
          day_of_month: { type: 'number', description: 'Day of month (for monthly frequency)' },
          format: { type: 'string', description: 'Export format: pdf/csv/xlsx' },
        },
        required: ['report_id', 'frequency', 'recipients'],
      },
    },
    {
      name: 'create_kpi',
      description: '[Write] Create a Key Performance Indicator from ServiceNow data',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'KPI name' },
          table: { type: 'string', description: 'Source table' },
          field: { type: 'string', description: 'Aggregate field' },
          aggregate: { type: 'string', description: 'Aggregate function: COUNT/AVG/SUM/MIN/MAX' },
          conditions: { type: 'string', description: 'Encoded query filter' },
          unit: { type: 'string', description: 'Display unit' },
        },
        required: ['name', 'table', 'aggregate'],
      },
    },
    {
      name: 'generate_report',
      description: 'Generate a branded PDF or PPTX report from capability analysis results. Call this after completing a scan, review, or audit to create a management-ready document with charts, tables, and ServiceNow links. Supports single capability (content) or multiple capabilities (sections) in one combined report.',
      inputSchema: {
        type: 'object',
        properties: {
          content: { type: 'string', description: 'Full markdown analysis to convert into a branded report (for single capability)' },
          sections: {
            type: 'array',
            description: 'Multiple capability analyses to combine into one report. Each section becomes a chapter. Use this instead of content for multi-capability reports.',
            items: {
              type: 'object',
              properties: {
                content: { type: 'string', description: 'Markdown analysis for this capability' },
                title: { type: 'string', description: 'Section title (e.g. "Instance Health Scan")' },
                capability: { type: 'string', description: 'Capability name (e.g. "scan-health")' },
              },
              required: ['content', 'title'],
            },
          },
          format: { type: 'string', enum: ['pdf', 'pptx'], description: 'Output format: pdf (branded document) or pptx (slide deck)' },
          title: { type: 'string', description: 'Report title (e.g. "Instance Health Scan", "Comprehensive Instance Audit")' },
          capability: { type: 'string', description: 'Capability name that produced the analysis (e.g. "scan-health", "review-code", "combined-audit")' },
        },
        required: ['format', 'title'],
      },
    },
  ];
}

export async function executeReportingToolCall(
  client: ServiceNowClient,
  name: string,
  args: Record<string, any>
): Promise<any> {
  switch (name) {
    case 'list_reports': {
      // Latest release: /api/now/reporting supports sysparm_contains for name search
      let query = '';
      if (args.search) query = `nameLIKE${args.search}`;
      if (args.category) query = query ? `${query}^categoryLIKE${args.category}` : `categoryLIKE${args.category}`;
      const resp = await client.queryRecords({ table: 'sys_report', query: query || undefined, limit: args.limit || 20, fields: 'sys_id,title,table,type,category,sys_updated_on,user' });
      return { count: resp.count, reports: resp.records };
    }
    case 'get_report': {
      if (!args.sys_id_or_name) throw new ServiceNowError('sys_id_or_name is required', 'INVALID_REQUEST');
      if (/^[0-9a-f]{32}$/i.test(args.sys_id_or_name)) {
        return await client.getRecord('sys_report', args.sys_id_or_name);
      }
      const resp = await client.queryRecords({ table: 'sys_report', query: `title=${args.sys_id_or_name}^ORname=${args.sys_id_or_name}^ORsys_id=${args.sys_id_or_name}`, limit: 1 });
      if (resp.count === 0) throw new ServiceNowError(`Report not found: ${args.sys_id_or_name}`, 'NOT_FOUND');
      return resp.records[0];
    }
    case 'run_aggregate_query': {
      if (!args.table || !args.group_by) throw new ServiceNowError('table and group_by are required', 'INVALID_REQUEST');
      const result = await client.runAggregateQuery(args.table, args.group_by, args.aggregate || 'COUNT', args.query);
      return { table: args.table, group_by: args.group_by, aggregate: args.aggregate || 'COUNT', results: result };
    }
    case 'trend_query': {
      if (!args.table || !args.date_field || !args.group_by)
        throw new ServiceNowError('table, date_field, and group_by are required', 'INVALID_REQUEST');
      const periods = args.periods || 6;
      const results = [];
      for (let i = periods - 1; i >= 0; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const q = `${args.date_field}BETWEEN${year}-${month}-01 00:00:00@${year}-${month}-31 23:59:59`;
        const fullQuery = args.query ? `${args.query}^${q}` : q;
        try {
          const result = await client.runAggregateQuery(args.table, args.group_by, 'COUNT', fullQuery);
          results.push({ period: `${year}-${month}`, data: result });
        } catch {
          results.push({ period: `${year}-${month}`, data: [] });
        }
      }
      return { table: args.table, date_field: args.date_field, group_by: args.group_by, periods: results };
    }
    case 'get_performance_analytics': {
      if (!args.widget_sys_id) throw new ServiceNowError('widget_sys_id is required', 'INVALID_REQUEST');
      // ServiceNow PA API: GET /api/now/pa/widget/{sys_id}
      try {
        const result = await client.callNowAssist(`/api/now/pa/widget/${args.widget_sys_id}`, {});
        return { widget_sys_id: args.widget_sys_id, data: result };
      } catch {
        // Fallback: query PA data table
        const resp = await client.queryRecords({ table: 'pa_job_log', query: `sys_id=${args.widget_sys_id}`, limit: 1 });
        return { widget_sys_id: args.widget_sys_id, data: resp.records[0] || {} };
      }
    }
    case 'export_report_data': {
      if (!args.table) throw new ServiceNowError('table is required', 'INVALID_REQUEST');
      const resp = await client.queryRecords({ table: args.table, query: args.query, fields: args.fields, limit: Math.min(args.limit || 100, 1000) });
      return { table: args.table, count: resp.count, records: resp.records, exported_at: new Date().toISOString() };
    }
    case 'get_sys_log': {
      const resp = await client.queryRecords({ table: 'syslog', query: args.query || undefined, limit: args.limit || 20, orderBy: '-sys_created_on' });
      return { count: resp.count, entries: resp.records };
    }
    case 'list_scheduled_jobs': {
      let query = args.active !== false ? 'active=true' : '';
      if (args.query) query = query ? `${query}^${args.query}` : args.query;
      const resp = await client.queryRecords({ table: 'sysauto', query: query || undefined, limit: args.limit || 20, fields: 'sys_id,name,run_type,run_time,next_action,active,last_run_time' });
      return { count: resp.count, jobs: resp.records };
    }
    case 'get_scheduled_job': {
      if (!args.sys_id_or_name) throw new ServiceNowError('sys_id_or_name is required', 'INVALID_REQUEST');
      if (/^[0-9a-f]{32}$/i.test(args.sys_id_or_name)) {
        return await client.getRecord('sysauto', args.sys_id_or_name);
      }
      const resp = await client.queryRecords({ table: 'sysauto', query: `name=${args.sys_id_or_name}`, limit: 1 });
      if (resp.count === 0) throw new ServiceNowError(`Scheduled job not found: ${args.sys_id_or_name}`, 'NOT_FOUND');
      return resp.records[0];
    }
    case 'create_scheduled_job': {
      requireWrite();
      if (!args.name || !args.script || !args.run_type)
        throw new ServiceNowError('name, script, and run_type are required', 'INVALID_REQUEST');
      const data: Record<string, any> = {
        name: args.name,
        script: args.script,
        run_type: args.run_type,
        active: args.active !== false,
      };
      if (args.run_time) data.run_time = args.run_time;
      if (args.run_period) data.run_period = args.run_period;
      const result = await client.createRecord('sysauto_script', data);
      return { ...result, summary: `Created scheduled job "${args.name}" (${args.run_type})` };
    }
    case 'update_scheduled_job': {
      requireWrite();
      if (!args.sys_id || !args.fields) throw new ServiceNowError('sys_id and fields are required', 'INVALID_REQUEST');
      const result = await client.updateRecord('sysauto', args.sys_id, args.fields);
      return { ...result, summary: `Updated scheduled job ${args.sys_id}` };
    }
    case 'trigger_scheduled_job': {
      requireWrite();
      if (!args.sys_id) throw new ServiceNowError('sys_id is required', 'INVALID_REQUEST');
      // Trigger by setting next_action to now and ensuring it's active
      const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
      const result = await client.updateRecord('sysauto', args.sys_id, { next_action: now, active: true });
      return { ...result, summary: `Triggered scheduled job ${args.sys_id} — set next_action to now` };
    }
    case 'create_report': {
      requireWrite();
      if (!args.title || !args.table || !args.type)
        throw new ServiceNowError('title, table, and type are required', 'INVALID_REQUEST');
      const data: Record<string, any> = {
        title: args.title,
        table: args.table,
        type: args.type,
        aggregate: args.aggregate || 'COUNT',
      };
      if (args.field) data.field = args.field;
      if (args.query) data.filter_fields = args.query;
      if (args.group_by) data.group_by = args.group_by;
      if (args.roles) data.roles = args.roles;
      const result = await client.createRecord('sys_report', data);
      return { ...result, summary: `Created report "${args.title}" (${args.type}) on table "${args.table}"` };
    }
    case 'update_report': {
      requireWrite();
      if (!args.sys_id || !args.fields)
        throw new ServiceNowError('sys_id and fields are required', 'INVALID_REQUEST');
      const result = await client.updateRecord('sys_report', args.sys_id, args.fields);
      return { ...result, summary: `Updated report ${args.sys_id}` };
    }
    case 'list_job_run_history': {
      const parts: string[] = [];
      if (args.job_sys_id) parts.push(`sysauto=${args.job_sys_id}`);
      if (args.status) parts.push(`status=${args.status}`);
      const resp = await client.queryRecords({
        table: 'sysauto_trigger_log',
        query: parts.join('^') || undefined,
        limit: args.limit || 25,
        orderBy: '-sys_created_on',
        fields: 'sys_id,sysauto,status,run_time,error_message,sys_created_on',
      });
      return { count: resp.count, history: resp.records };
    }
    case 'create_scheduled_report': {
      requireWrite();
      if (!args.report_id || !args.frequency || !args.recipients)
        throw new ServiceNowError('report_id, frequency, and recipients are required', 'INVALID_REQUEST');
      const result = await client.createRecord('sys_report_schedule', {
        report: args.report_id,
        frequency: args.frequency,
        email: args.recipients,
        day: args.day_of_week || '',
        day_of_month: args.day_of_month || '',
        format: args.format || 'pdf',
        active: 'true',
      });
      return { ...result, summary: `Created scheduled report delivery (${args.frequency}) for report ${args.report_id}` };
    }
    case 'create_kpi': {
      requireWrite();
      if (!args.name || !args.table || !args.aggregate)
        throw new ServiceNowError('name, table, and aggregate are required', 'INVALID_REQUEST');
      const result = await client.createRecord('pa_indicators', {
        name: args.name,
        cube: args.table,
        aggregate: args.aggregate,
        conditions: args.conditions || '',
        field: args.field || '',
        unit: args.unit || '',
      });
      return { ...result, summary: `Created KPI "${args.name}" (${args.aggregate} on ${args.table})` };
    }
    case 'generate_report': {
      if (!args.format || !args.title)
        throw new ServiceNowError('format and title are required', 'INVALID_REQUEST');
      if (!args.content && !args.sections)
        throw new ServiceNowError('Either content (single capability) or sections (multiple capabilities) is required', 'INVALID_REQUEST');
      if (args.format !== 'pdf' && args.format !== 'pptx')
        throw new ServiceNowError('format must be "pdf" or "pptx"', 'INVALID_REQUEST');

      // Combine sections into a single markdown document if multiple capabilities provided
      let combinedContent: string;
      let capabilityName: string;
      if (args.sections && Array.isArray(args.sections) && args.sections.length > 0) {
        combinedContent = args.sections
          .map((s: { content: string; title: string; capability?: string }) =>
            `\n\n---\n\n# ${s.title}\n\n${s.content}`)
          .join('\n');
        capabilityName = args.capability || (args.sections.length > 1 ? 'combined-audit' : args.sections[0].capability || 'report');
      } else {
        combinedContent = args.content;
        capabilityName = args.capability || 'report';
      }

      const { generateReport } = await import('../reports/index.js');
      const reportResult = await generateReport(combinedContent, args.format, {
        title: args.title,
        instanceUrl: (client as any).baseUrl || '',
        instanceName: capabilityName,
        capability: capabilityName,
      });
      const sectionCount = args.sections ? args.sections.length : 1;
      return {
        success: true,
        file_path: reportResult.filePath,
        size_bytes: reportResult.sizeBytes,
        format: args.format,
        sections: sectionCount,
        message: `Report saved to ${reportResult.filePath} (${Math.round(reportResult.sizeBytes / 1024)} KB, ${sectionCount} capability${sectionCount > 1 ? 'ies' : ''})`,
      };
    }
    default:
      return null;
  }
}

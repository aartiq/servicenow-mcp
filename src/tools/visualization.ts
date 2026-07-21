/**
 * Visualization / reporting tools — turn a live ServiceNow aggregate into chart-ready data
 * plus a ready-to-render Adaptive Card (Teams native Chart.* element, schema 1.5).
 *
 * Why a card: Microsoft Copilot Studio passes an MCP tool's result to the model as text/JSON;
 * it does NOT render images or resources an MCP server returns. The supported, governance-safe
 * way to show a real chart in Teams is a native Adaptive Card chart, which renders client-side
 * (the numbers stay inside the M365 tenant, no third-party chart service). So each tool returns
 * `adaptive_card` (drop it into a Copilot Studio "Send an adaptive card" step, or any Teams bot),
 * alongside `data` (raw points), `table_markdown` (always-renders fallback) and a `summary`.
 *
 * Read-only: these only run aggregate/stats queries.
 */
import type { ServiceNowClient } from '../servicenow/client.js';
import { ServiceNowError } from '../utils/errors.js';

const VISUALIZATION_TOOL_NAMES = new Set(['visualize_aggregate', 'visualize_trend', 'aggregate_report']);

type Point = { label: string; value: number };

function toArray(v: any): string[] {
  if (Array.isArray(v)) return v.map(String).filter(Boolean);
  if (typeof v === 'string' && v.trim()) return v.split(',').map((s) => s.trim()).filter(Boolean);
  return [];
}

function toPoints(result: any[]): Point[] {
  return (result || [])
    .map((g) => {
      const gf = (g.groupby_fields && g.groupby_fields[0]) || {};
      const label = String(gf.display_value ?? gf.value ?? 'unknown');
      const value = Number((g.stats && g.stats.count) ?? g.count ?? 0);
      return { label, value };
    })
    .filter((p) => Number.isFinite(p.value));
}

function markdownTable(header: [string, string], rows: Point[]): string {
  const lines = [`| ${header[0]} | ${header[1]} |`, '| --- | ---: |'];
  for (const r of rows) lines.push(`| ${r.label} | ${r.value} |`);
  return lines.join('\n');
}

function card(title: string, chart: any): any {
  return {
    type: 'AdaptiveCard',
    $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
    version: '1.5',
    body: [
      { type: 'TextBlock', text: title, size: 'Large', weight: 'Bolder', wrap: true },
      chart,
    ],
  };
}

function breakdownChart(chartType: string, title: string, points: Point[]): any {
  const t = chartType.toLowerCase();
  if (t === 'pie' || t === 'donut') {
    const type = t === 'donut' ? 'Chart.Donut' : 'Chart.Pie';
    return card(title, {
      type,
      colorSet: 'categorical',
      data: points.map((p) => ({ legend: p.label, value: p.value })),
    });
  }
  // bar (horizontal) or column (vertical, default)
  const type = t === 'bar' ? 'Chart.HorizontalBar' : 'Chart.VerticalBar';
  return card(title, {
    type,
    colorSet: 'categorical',
    showBarValues: true,
    data: points.map((p) => ({ x: p.label, y: p.value })),
  });
}

function truncateBucket(dateValue: string, interval: string): string {
  const v = String(dateValue);
  if (interval === 'month') return v.slice(0, 7);
  if (interval === 'week') {
    const d = new Date(v.replace(' ', 'T') + 'Z');
    if (isNaN(d.getTime())) return v.slice(0, 10);
    const day = (d.getUTCDay() + 6) % 7; // Monday = 0
    d.setUTCDate(d.getUTCDate() - day);
    return d.toISOString().slice(0, 10);
  }
  return v.slice(0, 10); // day
}

export function getVisualizationToolDefinitions() {
  return [
    {
      name: 'visualize_aggregate',
      description: 'Build a real-time chart of ServiceNow records grouped by a field (e.g. incidents by priority, cases by state). Returns chart-ready data, a Teams Adaptive Card (Chart.*) to drop into a Copilot Studio "Send an adaptive card" step, a markdown table, and a summary. Read-only.',
      inputSchema: {
        type: 'object',
        properties: {
          table: { type: 'string', description: 'Table to aggregate, e.g. "incident", "sn_customerservice_case"' },
          group_by: { type: 'string', description: 'Field to group by, e.g. "priority", "state", "category", "assignment_group"' },
          query: { type: 'string', description: 'Optional encoded query filter, e.g. "active=true"' },
          chart_type: { type: 'string', description: 'column (default) | bar | pie | donut' },
          title: { type: 'string', description: 'Optional chart title' },
          limit: { type: 'number', description: 'Keep the top N groups by count (default 12)' },
        },
        required: ['table', 'group_by'],
      },
    },
    {
      name: 'aggregate_report',
      description: 'Server-side aggregate REPORT grouped by a field, in ONE query with no 1000-row truncation. Returns per-group record count PLUS optional averages/sums/mins/maxes of numeric or duration fields — the right tool for a periodic summary like "incident volume by category with average resolution time". Do NOT list raw records for this; use this. Duration fields come back pre-formatted (e.g. "21 14:03:10"). Returns a stats table (markdown), the rows, a count chart Adaptive Card, and a summary. Read-only.',
      inputSchema: {
        type: 'object',
        properties: {
          table: { type: 'string', description: 'Table to aggregate, e.g. "incident"' },
          group_by: { type: 'string', description: 'Field to group by, e.g. "category", "assignment_group", "priority"' },
          query: { type: 'string', description: 'Encoded query filter, e.g. resolved in the last 7 days: "stateIN6,7^resolved_atRELATIVEGT@dayofweek@ago@7"' },
          avg_fields: { type: 'array', items: { type: 'string' }, description: 'Fields to average per group, e.g. ["business_duration"] or ["calendar_duration"] for resolution time. Comma string also accepted.' },
          sum_fields: { type: 'array', items: { type: 'string' }, description: 'Fields to sum per group' },
          min_fields: { type: 'array', items: { type: 'string' }, description: 'Fields to take the minimum of per group' },
          max_fields: { type: 'array', items: { type: 'string' }, description: 'Fields to take the maximum of per group' },
          title: { type: 'string', description: 'Optional report title' },
          limit: { type: 'number', description: 'Keep the top N groups by count (default 25)' },
        },
        required: ['table', 'group_by'],
      },
    },
    {
      name: 'visualize_trend',
      description: 'Build a real-time trend line of ServiceNow record counts over time (e.g. incidents opened per day). Returns chart-ready series, a Teams Adaptive Card line chart, a markdown table, and a summary. Read-only.',
      inputSchema: {
        type: 'object',
        properties: {
          table: { type: 'string', description: 'Table to count, e.g. "incident"' },
          date_field: { type: 'string', description: 'Date/time field to bucket on (default "sys_created_on")' },
          interval: { type: 'string', description: 'day (default) | week | month' },
          query: { type: 'string', description: 'Recommended: a span filter, e.g. "sys_created_onONLast 30 days@..." or "active=true"' },
          title: { type: 'string', description: 'Optional chart title' },
        },
        required: ['table'],
      },
    },
  ];
}

export async function executeVisualizationToolCall(
  client: ServiceNowClient,
  name: string,
  args: Record<string, any>,
): Promise<any> {
  if (!VISUALIZATION_TOOL_NAMES.has(name)) return null;

  switch (name) {
    case 'visualize_aggregate': {
      if (!args.table || !args.group_by) throw new ServiceNowError('table and group_by are required', 'INVALID_REQUEST');
      const chartType = String(args.chart_type || 'column');
      const limit = typeof args.limit === 'number' ? args.limit : 12;
      const result = await client.runAggregateQuery(String(args.table), String(args.group_by), 'COUNT', args.query ? String(args.query) : undefined);
      let points = toPoints(result).sort((a, b) => b.value - a.value);
      const total = points.reduce((a, p) => a + p.value, 0);
      if (points.length > limit) points = points.slice(0, limit);
      const title = String(args.title || `${args.table} by ${args.group_by}`);
      const summary = points.length
        ? `${title}: ${points.map((p) => `${p.label} (${p.value})`).join(', ')}. Total ${total}.`
        : `No records found for ${args.table}${args.query ? ` where ${args.query}` : ''}.`;
      return {
        title,
        table: args.table,
        group_by: args.group_by,
        chart_type: chartType,
        total,
        data: points,
        table_markdown: markdownTable([String(args.group_by), 'count'], points),
        adaptive_card: breakdownChart(chartType, title, points),
        summary,
      };
    }

    case 'aggregate_report': {
      if (!args.table || !args.group_by) throw new ServiceNowError('table and group_by are required', 'INVALID_REQUEST');
      const avgFields = toArray(args.avg_fields);
      const sumFields = toArray(args.sum_fields);
      const minFields = toArray(args.min_fields);
      const maxFields = toArray(args.max_fields);
      const limit = typeof args.limit === 'number' ? args.limit : 25;
      const result = await client.runStats(String(args.table), {
        groupBy: String(args.group_by),
        query: args.query ? String(args.query) : undefined,
        count: true,
        avgFields, sumFields, minFields, maxFields,
      });
      let rows = result.map((g: any) => {
        const gf = (g.groupby_fields && g.groupby_fields[0]) || {};
        const st = g.stats || {};
        const row: Record<string, any> = { group: String(gf.display_value ?? gf.value ?? 'unknown'), count: Number(st.count ?? 0) };
        for (const f of avgFields) row[`avg_${f}`] = st.avg?.[f] ?? null;
        for (const f of sumFields) row[`sum_${f}`] = st.sum?.[f] ?? null;
        for (const f of minFields) row[`min_${f}`] = st.min?.[f] ?? null;
        for (const f of maxFields) row[`max_${f}`] = st.max?.[f] ?? null;
        return row;
      }).sort((a, b) => b.count - a.count);
      const total = rows.reduce((a, r) => a + r.count, 0);
      if (rows.length > limit) rows = rows.slice(0, limit);
      const cols = ['group', 'count', ...avgFields.map((f) => `avg_${f}`), ...sumFields.map((f) => `sum_${f}`), ...minFields.map((f) => `min_${f}`), ...maxFields.map((f) => `max_${f}`)];
      const table_markdown = [
        `| ${cols.join(' | ')} |`,
        `| ${cols.map(() => '---').join(' | ')} |`,
        ...rows.map((r) => `| ${cols.map((c) => (r[c] ?? '')).join(' | ')} |`),
      ].join('\n');
      const title = String(args.title || `${args.table} by ${args.group_by}`);
      const summary = rows.length
        ? `${title} (total ${total} over ${rows.length} groups): ${rows.map((r) => `${r.group} ${r.count}${avgFields.length ? ` (avg ${avgFields.map((f) => r[`avg_${f}`]).join(', ')})` : ''}`).join('; ')}.`
        : `No records for ${args.table}${args.query ? ` where ${args.query}` : ''}.`;
      return {
        title,
        table: args.table,
        group_by: args.group_by,
        total,
        rows,
        table_markdown,
        adaptive_card: breakdownChart('column', title, rows.map((r) => ({ label: r.group, value: r.count }))),
        summary,
      };
    }

    case 'visualize_trend': {
      if (!args.table) throw new ServiceNowError('table is required', 'INVALID_REQUEST');
      const dateField = String(args.date_field || 'sys_created_on');
      const interval = String(args.interval || 'day');
      const result = await client.runAggregateQuery(String(args.table), dateField, 'COUNT', args.query ? String(args.query) : undefined);
      const buckets = new Map<string, number>();
      for (const p of toPoints(result)) {
        const key = truncateBucket(p.label, interval);
        buckets.set(key, (buckets.get(key) || 0) + p.value);
      }
      const series = Array.from(buckets.entries())
        .map(([label, value]) => ({ label, value }))
        .sort((a, b) => (a.label < b.label ? -1 : a.label > b.label ? 1 : 0));
      const total = series.reduce((a, p) => a + p.value, 0);
      const title = String(args.title || `${args.table} per ${interval}`);
      const lineCard = card(title, {
        type: 'Chart.Line',
        colorSet: 'categorical',
        xAxisTitle: interval,
        yAxisTitle: 'count',
        data: [{ legend: 'count', values: series.map((p) => ({ x: p.label, y: p.value })) }],
      });
      const summary = series.length
        ? `${title}: ${series.length} ${interval}s, total ${total} (from ${series[0].label} to ${series[series.length - 1].label}).`
        : `No records found for ${args.table}${args.query ? ` where ${args.query}` : ''}.`;
      return {
        title,
        table: args.table,
        date_field: dateField,
        interval,
        total,
        data: series,
        table_markdown: markdownTable([interval, 'count'], series),
        adaptive_card: lineCard,
        summary,
      };
    }

    default:
      return null;
  }
}

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

const VISUALIZATION_TOOL_NAMES = new Set(['visualize_aggregate', 'visualize_trend']);

type Point = { label: string; value: number };

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

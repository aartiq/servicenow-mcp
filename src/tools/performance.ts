/**
 * Performance Analytics & Dashboards tools — PA indicators, scorecards, KPIs, and dashboards.
 * All read-only tools: Tier 0.
 * Inspired by snow-flow's "Analysis" category: KPI management, Performance Analytics, dashboards.
 */
import type { ServiceNowClient } from '../servicenow/client.js';
import { ServiceNowError } from '../utils/errors.js';
import { requireWrite } from '../utils/permissions.js';

// PA stores aggregate and direction as integer choices.
const PA_AGGREGATES: Record<string, string> = {
  count: '1', sum: '2', average: '3', avg: '3', minimum: '4', min: '4', maximum: '5', max: '5', count_distinct: '6',
};
const PA_DIRECTIONS: Record<string, string> = { none: '1', minimize: '2', maximize: '3' };

function paChoice(map: Record<string, string>, value: any, label: string): string {
  const v = String(value).trim();
  if (/^\d+$/.test(v)) return v;
  const mapped = map[v.toLowerCase().replace(/[\s-]+/g, '_')];
  if (!mapped) throw new ServiceNowError(`Unknown ${label} "${value}". Use one of: ${Object.keys(map).join(', ')}`, 'INVALID_REQUEST');
  return mapped;
}

/**
 * Resolve the indicator source (pa_cubes) for a facts table: an indicator links to its
 * table through an indicator source, not a table name. Reuses an existing source for the
 * table, otherwise creates one.
 */
export async function resolveIndicatorSource(
  client: ServiceNowClient,
  factsTable: string,
): Promise<{ sys_id: string; created: boolean }> {
  if (/^[0-9a-f]{32}$/i.test(factsTable)) return { sys_id: factsTable, created: false };
  const found = await client.queryRecords({ table: 'pa_cubes', query: `facts_table=${factsTable}^conditionsISEMPTY`, limit: 1, fields: 'sys_id' });
  if (found.count > 0) return { sys_id: String((found.records[0] as any).sys_id), created: false };
  const created = await client.createRecord('pa_cubes', { name: `${factsTable} (NowAIKit)`, facts_table: factsTable, frequency: '10' });
  return { sys_id: String(created.sys_id), created: true };
}

/** Build a pa_indicators payload (automated indicator) from friendly inputs. */
export async function buildPaIndicatorPayload(
  client: ServiceNowClient,
  args: Record<string, any>,
): Promise<{ data: Record<string, any>; indicatorSource?: { sys_id: string; created: boolean } }> {
  const data: Record<string, any> = { name: args.name, type: '1', frequency: '10' };
  if (args.description) data.description = args.description;
  data.aggregate = paChoice(PA_AGGREGATES, args.aggregate || 'count', 'aggregate');
  if (args.field) data.field = args.field;
  if (args.conditions) data.conditions = args.conditions;
  if (args.direction) data.direction = paChoice(PA_DIRECTIONS, args.direction, 'direction');
  if (args.unit) {
    if (/^[0-9a-f]{32}$/i.test(args.unit)) data.unit = args.unit;
    else {
      const u = await client.queryRecords({ table: 'pa_units', query: `name=${args.unit}`, limit: 1, fields: 'sys_id' });
      if (u.count > 0) data.unit = (u.records[0] as any).sys_id;
    }
  }
  let indicatorSource: { sys_id: string; created: boolean } | undefined;
  const source = args.indicator_source || args.facts_table;
  if (source) {
    indicatorSource = await resolveIndicatorSource(client, source);
    data.cube = indicatorSource.sys_id;
  }
  return { data, indicatorSource };
}

function errText(err: unknown): string {
  return (err instanceof Error ? err.message : String(err)).split('\n')[0]!;
}

function dashboardTableError(err: unknown): unknown {
  if (/invalid table/i.test(errText(err))) {
    return new ServiceNowError('Platform Analytics dashboards (par_dashboard) are not available on this instance. They need the Platform Analytics experience (Washington DC or later).', 'PLUGIN_NOT_INSTALLED');
  }
  return err;
}

const refVal = (v: any) => (v && typeof v === 'object' && 'value' in v ? v.value : v);
const refDisp = (v: any) => (v && typeof v === 'object' && 'display_value' in v ? v.display_value : v);

async function softQuery(client: ServiceNowClient, params: Parameters<ServiceNowClient['queryRecords']>[0]): Promise<{ records: any[]; count: number; note?: string }> {
  try {
    const r = await client.queryRecords(params);
    return { records: r.records, count: r.count };
  } catch (err) {
    return { records: [], count: 0, note: `${params.table}: ${errText(err)}` };
  }
}

async function softCount(client: ServiceNowClient, table: string, query = ''): Promise<number | string> {
  try {
    const rows = await client.runStats(table, { query });
    return Number(rows[0]?.stats?.count ?? 0);
  } catch (err) {
    return /invalid table/i.test(errText(err)) ? 'not available' : 'no access';
  }
}

/** Tabs, widgets, permissions and workspace visibility of a Platform Analytics dashboard. */
export async function platformDashboardLayout(client: ServiceNowClient, id: string): Promise<Record<string, any>> {
  const [tabs, widgets, perms, vis] = await Promise.all([
    softQuery(client, { table: 'par_dashboard_tab', query: `dashboard=${id}^ORDERBYorder`, fields: 'sys_id,name,order,active', limit: 50 }),
    softQuery(client, { table: 'par_dashboard_widget', query: `canvas.dashboard=${id}`, fields: 'sys_id,name,component,visualization,canvas.dashboard_tab', limit: 200, displayValue: 'all' }),
    softQuery(client, { table: 'par_dashboard_permission', query: `dashboard=${id}`, fields: 'sys_id,user,group,role,owner,can_read,can_write,can_share', limit: 100, displayValue: 'all' }),
    softQuery(client, { table: 'par_dashboard_visibility', query: `dashboard=${id}`, fields: 'sys_id,experience', limit: 50, displayValue: 'all' }),
  ]);
  const notes = [tabs, widgets, perms, vis].map((x) => x.note).filter(Boolean);
  return {
    tabs: tabs.records,
    widget_count: widgets.count,
    widgets: widgets.records.map((w: any) => ({
      sys_id: refVal(w.sys_id),
      name: refDisp(w.name) || null,
      component: refDisp(w.component) || null,
      visualization: refDisp(w.visualization) || null,
      tab: refDisp(w['canvas.dashboard_tab']) || null,
    })),
    permissions: perms.records.map((p: any) => ({
      user: refDisp(p.user) || null,
      group: refDisp(p.group) || null,
      role: refDisp(p.role) || null,
      owner: refVal(p.owner) === 'true',
      can_read: refVal(p.can_read) === 'true',
      can_write: refVal(p.can_write) === 'true',
      can_share: refVal(p.can_share) === 'true',
    })),
    visible_in: vis.records.map((v: any) => refDisp(v.experience)).filter(Boolean),
    ...(notes.length ? { layout_notes: notes } : {}),
  };
}

/** Core UI to Platform Analytics migration progress. */
export async function dashboardMigrationStatus(client: ServiceNowClient, limit: number): Promise<Record<string, any>> {
  const [legacyTotal, legacyActive, platformTotal, platformMigrated, readiness, bridge, widgetBridge, pending] = await Promise.all([
    softCount(client, 'pa_dashboards'),
    softCount(client, 'pa_dashboards', 'active=true'),
    softCount(client, 'par_dashboard'),
    softCount(client, 'par_dashboard', 'nameLIKE- Migrated'),
    (async () => {
      try {
        const rows = await client.runStats('pa_dashboards', { groupBy: 'ready_to_migrate' });
        return rows.map((r: any) => ({ ready_to_migrate: r.groupby_fields?.[0]?.value || '(not set)', count: Number(r.stats?.count ?? 0) }));
      } catch (err) {
        return [{ note: errText(err) }];
      }
    })(),
    softQuery(client, { table: 'par_coreui_migration_bridge_dashboard', query: 'is_last=true^ORDERBYDESCsys_updated_on', fields: 'sys_id,pa_dashboard,par_dashboard,migration_type,compatibility_mode,active,sys_updated_on', limit, displayValue: 'all' }),
    softCount(client, 'par_coreui_migration_bridge_widget'),
    softQuery(client, { table: 'pa_dashboards', query: 'active=true^ORDERBYname', fields: 'sys_id,name,ready_to_migrate,owner,sys_updated_on', limit: 1000, displayValue: 'all' }),
  ]);
  const platformNames = await softQuery(client, { table: 'par_dashboard', fields: 'name', limit: 2000 });
  // The Migration Center renames the legacy original "<name> - Old" and may name the copy "<name> - Migrated".
  const base = (n: unknown) => String(refDisp(n) ?? '').replace(/\s+-\s+(old|migrated)$/i, '').trim().toLowerCase();
  const platformBases = new Set(platformNames.records.map((r: any) => base(r.name)));
  const migratedIds = new Set(bridge.records.map((b: any) => refVal(b.pa_dashboard)).filter(Boolean));
  const hasPlatform = (d: any) => migratedIds.has(refVal(d.sys_id)) || platformBases.has(base(d.name));
  const notMigrated = pending.records.filter((d: any) => !hasPlatform(d));
  const migratedLegacy = pending.records.filter((d: any) => hasPlatform(d));
  const notes = [bridge.note, pending.note, platformNames.note].filter(Boolean);
  return {
    summary: {
      legacy_dashboards: legacyTotal,
      legacy_active: legacyActive,
      platform_dashboards: platformTotal,
      platform_dashboards_named_migrated: platformMigrated,
      migration_center_dashboard_logs: bridge.count,
      migration_center_widget_logs: widgetBridge,
      active_legacy_with_platform_version: migratedLegacy.length,
      active_legacy_without_platform_version: notMigrated.length,
    },
    legacy_by_readiness: readiness,
    migrations: bridge.records.map((b: any) => ({
      legacy: refDisp(b.pa_dashboard) || null,
      platform: refDisp(b.par_dashboard) || null,
      migration_type: refDisp(b.migration_type) || null,
      compatibility_mode: refDisp(b.compatibility_mode) || null,
      updated: refDisp(b.sys_updated_on) || null,
    })),
    legacy_without_platform_version: notMigrated.slice(0, limit).map((d: any) => ({
      sys_id: refVal(d.sys_id),
      name: refDisp(d.name),
      ready_to_migrate: refDisp(d.ready_to_migrate) || null,
      owner: refDisp(d.owner) || null,
      updated: refDisp(d.sys_updated_on) || null,
      record_url: client.recordUrl('pa_dashboards', String(refVal(d.sys_id))),
    })),
    legacy_with_platform_version: migratedLegacy.slice(0, limit).map((d: any) => ({
      name: refDisp(d.name),
      record_url: client.recordUrl('pa_dashboards', String(refVal(d.sys_id))),
    })),
    guidance: 'Legacy (Core UI) Performance Analytics dashboards are unsupported from Australia, and new Core UI content can be created until the end of 2027. Move active legacy dashboards with the Migration Center, then retire the ones nobody uses.',
    ...(notes.length ? { notes } : {}),
  };
}

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
      description: 'List dashboards: Core UI (legacy) Performance Analytics dashboards (pa_dashboards) and Platform Analytics dashboards (par_dashboard, the current dashboard type since Australia). Each record has a source field: "legacy" or "platform"',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search dashboards by name' },
          source: { type: 'string', enum: ['all', 'legacy', 'platform'], description: 'Which dashboards: all (default), legacy (Core UI pa_dashboards) or platform (Platform Analytics par_dashboard)' },
          limit: { type: 'number', description: 'Max records to return per source (default 25)' },
        },
        required: [],
      },
    },
    {
      name: 'get_pa_dashboard',
      description: 'Get details of a dashboard. Looks in Core UI (legacy) pa_dashboards first, then Platform Analytics par_dashboard. Platform dashboards include their tabs, widgets, permissions and workspace visibility. The result has a source field: "legacy" or "platform"',
      inputSchema: {
        type: 'object',
        properties: {
          sys_id_or_name: { type: 'string', description: 'Dashboard sys_id or name' },
          source: { type: 'string', enum: ['auto', 'legacy', 'platform'], description: 'Where to look: auto (default, legacy then platform), legacy or platform' },
        },
        required: ['sys_id_or_name'],
      },
    },
    {
      name: 'get_dashboard_migration_status',
      description: 'Progress of the move from Core UI (legacy) Performance Analytics dashboards to Platform Analytics: legacy dashboards by migration readiness, Migration Center logs (par_coreui_migration_bridge_*), migrated dashboards and widgets, and legacy dashboards with no Platform Analytics version yet. Read-only',
      inputSchema: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Max dashboards to list in each section (default 25)' },
        },
        required: [],
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
          owner: { type: 'string', description: 'Owner user sys_id (default: the calling user)' },
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
    // ── PA authoring (indicators & breakdowns) ───────────────────────────────
    {
      name: 'create_pa_indicator',
      description:
        'Create a Performance Analytics (PA) indicator / KPI on `pa_indicators` (requires WRITE_ENABLED=true). ' +
        'Define the source facts table, aggregation and conditions; collect data via a PA job afterward.',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Indicator name (e.g. "Open P1 incidents")' },
          description: { type: 'string', description: 'What the indicator measures' },
          facts_table: { type: 'string', description: 'Source/facts table the indicator counts (e.g. "incident"); an indicator source for it is reused or created' },
          indicator_source: { type: 'string', description: 'Optional indicator source (pa_cubes) sys_id; overrides facts_table' },
          aggregate: { type: 'string', description: 'Aggregation function', enum: ['count', 'sum', 'average', 'maximum', 'minimum'] },
          field: { type: 'string', description: 'Field to aggregate (required for sum/average/max/min; ignored for count)' },
          conditions: { type: 'string', description: 'Encoded query on the facts table (e.g. "active=true^priority=1")' },
          unit: { type: 'string', description: 'Unit (pa_units name or sys_id)' },
          direction: { type: 'string', description: 'Desired trend', enum: ['maximize', 'minimize'] },
          active: { type: 'boolean', description: 'Activate immediately (default: true)' },
        },
        required: ['name'],
      },
    },
    {
      name: 'create_pa_breakdown',
      description:
        'Create a Performance Analytics (PA) breakdown on `pa_breakdowns` (requires WRITE_ENABLED=true). ' +
        'Breakdowns slice an indicator by a dimension (e.g. by Assignment group or Category).',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Breakdown name (e.g. "By Assignment group")' },
          description: { type: 'string', description: 'What this breakdown slices by' },
          related_field: { type: 'string', description: 'Optional dotted field path the breakdown maps to (e.g. "assignment_group")' },
          breakdown_source: { type: 'string', description: 'Optional breakdown source (pa_dimensions) sys_id' },
          active: { type: 'boolean', description: 'Activate immediately (default: true)' },
        },
        required: ['name'],
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
      const source = String(args.source || 'all').toLowerCase();
      if (!['all', 'legacy', 'platform'].includes(source)) throw new ServiceNowError('source must be all, legacy or platform', 'INVALID_REQUEST');
      const parts: string[] = [];
      if (args.query) parts.push(`nameCONTAINS${args.query}`);
      const limit = args.limit ?? 25;
      const out: Record<string, any> = { count: 0, records: [] as any[] };
      if (source !== 'platform') {
        const legacy = await client.queryRecords({
          table: 'pa_dashboards',
          query: parts.join('^') || undefined,
          limit,
          fields: 'sys_id,name,description,sys_updated_on',
        });
        out.records.push(...legacy.records.map((r: any) => ({ ...r, source: 'legacy' })));
        out.legacy_count = legacy.count;
        out.count += legacy.count;
      }
      if (source !== 'legacy') {
        try {
          const platform = await client.queryRecords({
            table: 'par_dashboard',
            query: parts.join('^') || undefined,
            limit,
            fields: 'sys_id,name,description,active,sys_updated_on',
          });
          out.records.push(...platform.records.map((r: any) => ({ ...r, source: 'platform' })));
          out.platform_count = platform.count;
          out.count += platform.count;
        } catch (err) {
          if (source === 'platform') throw dashboardTableError(err);
          out.platform_note = `Platform Analytics dashboards not read: ${errText(err)}`;
        }
      }
      return out;
    }
    case 'get_pa_dashboard': {
      if (!args.sys_id_or_name) throw new ServiceNowError('sys_id_or_name is required', 'INVALID_REQUEST');
      const source = String(args.source || 'auto').toLowerCase();
      const ref = String(args.sys_id_or_name);
      const isId = /^[0-9a-f]{32}$/i.test(ref);
      let legacyErr: unknown;
      if (source !== 'platform') {
        try {
          if (isId) return { ...(await client.getRecord('pa_dashboards', ref)), source: 'legacy' };
          const resp = await client.queryRecords({ table: 'pa_dashboards', query: `nameCONTAINS${ref}`, limit: 1 });
          if (resp.count > 0 && resp.records[0]) return { ...resp.records[0], source: 'legacy' };
        } catch (err) {
          legacyErr = err;
        }
        if (source === 'legacy') {
          if (legacyErr) throw legacyErr;
          throw new ServiceNowError(`PA dashboard not found: ${ref}`, 'NOT_FOUND');
        }
      }
      let dash: any;
      try {
        if (isId) dash = await client.getRecord('par_dashboard', ref);
        else {
          const resp = await client.queryRecords({ table: 'par_dashboard', query: `nameCONTAINS${ref}`, limit: 1 });
          dash = resp.records[0];
        }
      } catch (err) {
        if (legacyErr) throw legacyErr;
        throw dashboardTableError(err);
      }
      if (!dash) throw new ServiceNowError(`PA dashboard not found: ${ref}`, 'NOT_FOUND');
      return { ...dash, source: 'platform', ...(await platformDashboardLayout(client, String(dash.sys_id))) };
    }
    case 'get_dashboard_migration_status':
      return await dashboardMigrationStatus(client, Math.min(Number(args.limit) || 25, 200));
    case 'list_homepages': {
      const parts: string[] = [];
      if (args.query) parts.push(`titleCONTAINS${args.query}`);
      return await client.queryRecords({
        // Legacy (UI16) homepages are stored as portal pages.
        table: 'sys_portal_page',
        query: parts.join('^') || undefined,
        limit: args.limit ?? 25,
        fields: 'sys_id,title,roles,read_roles,user,view,selectable,sys_updated_on',
      });
    }
    // ── PA Jobs ──────────────────────────────────────────────────────────────
    case 'list_pa_jobs': {
      const parts: string[] = [];
      if (args.active !== false) parts.push('active=true');
      if (args.query) parts.push(`nameCONTAINS${args.query}`);
      return await client.queryRecords({
        // PA data collection jobs are scheduled jobs of class sysauto_pa.
        table: 'sysauto_pa',
        query: parts.join('^') || '',
        limit: args.limit ?? 25,
        fields: 'sys_id,name,active,run_type,run_time,run_dayofweek,run_dayofmonth,run_period,run_as,collect,description,sys_updated_on',
      });
    }
    case 'get_pa_job': {
      if (!args.sys_id) throw new ServiceNowError('sys_id is required', 'INVALID_REQUEST');
      const job = await client.getRecord('sysauto_pa', args.sys_id);
      const indicators = await client.queryRecords({
        table: 'pa_job_indicators',
        query: `job=${args.sys_id}`,
        limit: 200,
        fields: 'sys_id,indicator,active,collect',
      }).catch(() => ({ count: 0, records: [] }));
      return { ...job, indicators: indicators.records, indicator_count: indicators.count };
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
      // owner is mandatory on pa_dashboards: default to the calling user.
      if (args.owner) data.owner = args.owner;
      else {
        const me = await client.getCurrentUser().catch(() => ({} as any));
        if (me.user_sys_id) data.owner = me.user_sys_id;
      }
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
    case 'create_pa_indicator': {
      requireWrite();
      if (!args.name) throw new ServiceNowError('name is required', 'INVALID_REQUEST');
      const { data, indicatorSource } = await buildPaIndicatorPayload(client, args);
      const result = await client.createRecord('pa_indicators', data);
      return {
        ...result,
        ...(indicatorSource ? { indicator_source: indicatorSource.sys_id, indicator_source_created: indicatorSource.created } : {}),
        summary: `Created PA indicator "${args.name}". Run a PA data-collection job to populate scores.`,
      };
    }
    case 'create_pa_breakdown': {
      requireWrite();
      if (!args.name) throw new ServiceNowError('name is required', 'INVALID_REQUEST');
      const data: Record<string, any> = { name: args.name, type: '1' };
      if (args.description) data.description = args.description;
      if (args.related_field) data.field = args.related_field;
      if (args.breakdown_source) data.dimension = args.breakdown_source;
      const result = await client.createRecord('pa_breakdowns', data);
      return { ...result, summary: `Created PA breakdown "${args.name}". Configure its breakdown source/elements in the PA UI if required.` };
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

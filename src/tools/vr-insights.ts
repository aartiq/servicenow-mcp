/**
 * Vulnerability Response insight tools for named threats and KEV compliance. Read-only (Tier 0).
 *
 *   get_threat_status   one named threat (CVE IDs or a name) across the CVE library (KEV, EPSS),
 *                       vulnerable items, affected CIs and services, remediation tasks, changes,
 *                       exceptions and security incidents
 *   get_kev_compliance  CISA KEV items against their federal due dates: met, missed, open and
 *                       overdue, by group and CVE, weekly closures and KEV vs non-KEV time to fix
 *
 * Remediation tasks on Vulnerability Response 26.4 are sn_vul_vulnerability (VUL...), linked to
 * vulnerable items through sn_vul_m2m_vul_group_item and to changes through sn_vul_m2m_vg_change_request.
 */
import type { ServiceNowClient } from '../servicenow/client.js';
import { ServiceNowError } from '../utils/errors.js';

const READ = { readOnlyHint: true, openWorldHint: true } as const;
const val = (v: any) => (v && typeof v === 'object' && 'value' in v ? v.value : v);
const disp = (v: any) => (v && typeof v === 'object' && 'display_value' in v ? (v.display_value ?? v.value) : v);
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e)).split('\n')[0]!;
const url = (c: ServiceNowClient, t: string, id: unknown) => (val(id) ? c.recordUrl(t, String(val(id))) : undefined);

async function soft(c: ServiceNowClient, p: Parameters<ServiceNowClient['queryRecords']>[0]): Promise<{ records: any[]; note?: string }> {
  try {
    return { records: (await c.queryRecords(p)).records };
  } catch (e) {
    return { records: [], note: `${p.table}: ${/invalid table/i.test(errText(e)) ? 'not available on this instance' : errText(e)}` };
  }
}

function listUrl(c: ServiceNowClient, table: string, query: string): string {
  return `${String((c as any).instanceUrl ?? '').replace(/\/$/, '')}/${table}_list.do?sysparm_query=${encodeURIComponent(query)}`;
}

const CLOSED_STATES = new Set(['3', '101']);

export function getVrInsightsToolDefinitions() {
  return [
    {
      name: 'get_threat_status',
      description: 'Status of one named threat across Vulnerability Response and Security Incident Response, with links: the CVE library entries (CISA KEV flag and due date, EPSS, scores), every vulnerable item with its CI, state, risk and target date, affected CIs and the services that depend on them, remediation tasks, linked changes and their states, exception requests, and security incidents that mention the threat. Give CVE IDs, a name, or both. Read-only',
      inputSchema: {
        type: 'object',
        properties: {
          cve: { type: 'string', description: 'One or more CVE IDs, comma separated, e.g. "CVE-2026-109618,CVE-2026-109619"' },
          name: { type: 'string', description: 'Threat name to match in remediation tasks and security incidents, e.g. "PHP2Shell"' },
          limit: { type: 'number', description: 'Max vulnerable items to list (default 100)' },
        },
        required: [],
      },
      annotations: READ,
    },
    {
      name: 'get_kev_compliance',
      description: 'CISA KEV (BOD 22-01) compliance from Vulnerability Response: KEV vulnerable items against each CVE\'s CISA due date, split into fixed on time, fixed late, open and overdue, and open within the deadline; breakdowns by assignment group and CVE, weekly closures over the window, and average days to close KEV against non-KEV items. Read-only',
      inputSchema: {
        type: 'object',
        properties: {
          days: { type: 'number', description: 'Window for closures and the trend (default 90)' },
          limit: { type: 'number', description: 'Max overdue items to list (default 25)' },
        },
        required: [],
      },
      annotations: READ,
    },
  ];
}

function parseCves(v: unknown): string[] {
  const list = String(v ?? '').split(/[\s,]+/).map((s) => s.trim().toUpperCase()).filter(Boolean);
  for (const c of list) if (!/^CVE-\d{4}-\d{3,}$/.test(c)) throw new ServiceNowError(`Not a CVE ID: ${c}`, 'INVALID_REQUEST');
  return [...new Set(list)];
}

export async function getThreatStatus(c: ServiceNowClient, args: Record<string, any>): Promise<Record<string, any>> {
  const cves = parseCves(args.cve);
  const name = String(args.name ?? '').trim();
  if (name.includes('^')) throw new ServiceNowError('name must not contain "^"', 'INVALID_REQUEST');
  if (!cves.length && !name) throw new ServiceNowError('Give cve (one or more CVE IDs) or name', 'INVALID_REQUEST');
  const max = Math.min(Math.max(Number(args.limit) || 100, 1), 500);
  const today = new Date().toISOString().slice(0, 10);

  // Remediation tasks matched by name can add CVEs we were not given.
  const tasksByName = name ? await soft(c, { table: 'sn_vul_vulnerability', query: `short_descriptionLIKE${name}^ORdescriptionLIKE${name}`, fields: 'sys_id,number', limit: 20 }) : { records: [] as any[] };
  let itemQuery = cves.length ? `vulnerability.idIN${cves.join(',')}` : '';
  if (!itemQuery && tasksByName.records.length) {
    const links = await soft(c, { table: 'sn_vul_m2m_vul_group_item', query: `sn_vul_vulnerabilityIN${tasksByName.records.map((t: any) => val(t.sys_id)).join(',')}`, fields: 'sn_vul_vulnerable_item', limit: 2000 });
    const ids = links.records.map((l: any) => val(l.sn_vul_vulnerable_item)).filter(Boolean);
    itemQuery = ids.length ? `sys_idIN${ids.join(',')}` : 'sys_id=none';
  }
  const items = itemQuery
    ? await soft(c, { table: 'sn_vul_vulnerable_item', query: `${itemQuery}^ORDERBYrisk_rating`, fields: 'sys_id,number,state,active,risk_rating,risk_score,cmdb_ci,vulnerability,vulnerability.id,assignment_group,assigned_to,ttr_target_date,closed_at', limit: 2000, displayValue: 'all' })
    : { records: [] as any[] };
  const allCves = [...new Set([...cves, ...items.records.map((i: any) => String(disp(i['vulnerability.id']) ?? '')).filter(Boolean)])];
  const itemIds = items.records.map((i: any) => String(val(i.sys_id)));
  const ciIds = [...new Set(items.records.map((i: any) => String(val(i.cmdb_ci) ?? '')).filter(Boolean))];

  const sirQuery = [...allCves, ...(name ? [name] : [])].map((t) => `short_descriptionLIKE${t}^ORdescriptionLIKE${t}`).join('^OR');
  const [library, groupLinks, approvals, sirs, services] = await Promise.all([
    allCves.length ? soft(c, { table: 'sn_vul_entry', query: `idIN${allCves.join(',')}`, fields: 'sys_id,id,summary,cisa_exists,due_date,epss_score,epss_percentile,risk_score,v3_base_score,v4_base_score,sys_class_name', limit: 50 }) : Promise.resolve({ records: [] as any[] }),
    itemIds.length ? soft(c, { table: 'sn_vul_m2m_vul_group_item', query: `sn_vul_vulnerable_itemIN${itemIds.join(',')}`, fields: 'sn_vul_vulnerability,sn_vul_vulnerable_item', limit: 4000 }) : Promise.resolve({ records: [] as any[] }),
    itemIds.length ? soft(c, { table: 'sn_vul_change_approval', query: `vul_recordIN${itemIds.join(',')}`, fields: 'sys_id,number,state,approval_state,desired_state,desired_validity_date,desired_reason,compensating_controls,vul_record,active', limit: 100, displayValue: 'all' }) : Promise.resolve({ records: [] as any[] }),
    sirQuery ? soft(c, { table: 'sn_si_incident', query: sirQuery, fields: 'sys_id,number,short_description,state,severity,priority,cmdb_ci,assignment_group,opened_at,closed_at', limit: 20, displayValue: 'all' }) : Promise.resolve({ records: [] as any[] }),
    ciIds.length ? soft(c, { table: 'cmdb_rel_ci', query: `childIN${ciIds.join(',')}^parent.sys_class_nameINSTANCEOFcmdb_ci_service`, fields: 'parent,parent.name,child', limit: 200, displayValue: 'all' }) : Promise.resolve({ records: [] as any[] }),
  ]);
  const taskIds = [...new Set([...groupLinks.records.map((l: any) => String(val(l.sn_vul_vulnerability))), ...tasksByName.records.map((t: any) => String(val(t.sys_id)))].filter(Boolean))];
  const [tasks, changeLinks] = taskIds.length
    ? await Promise.all([
        soft(c, { table: 'sn_vul_vulnerability', query: `sys_idIN${taskIds.join(',')}`, fields: 'sys_id,number,short_description,state,assignment_group,assigned_to,due_date', limit: 50, displayValue: 'all' }),
        soft(c, { table: 'sn_vul_m2m_vg_change_request', query: `sn_vul_vulnerabilityIN${taskIds.join(',')}`, fields: 'sn_vul_vulnerability,change_request,change_request.number,change_request.state,change_request.type,change_request.short_description,change_request.start_date,change_request.end_date', limit: 50, displayValue: 'all' }),
      ])
    : [{ records: [] as any[] }, { records: [] as any[] }];

  const dueByCve = new Map(library.records.map((e: any) => [String(val(e.id)), String(val(e.due_date) ?? '')]));
  const rows = items.records.map((i: any) => {
    const cve = String(disp(i['vulnerability.id']) ?? '');
    const due = dueByCve.get(cve) || '';
    const open = String(val(i.active)) === 'true' && !CLOSED_STATES.has(String(val(i.state)));
    return {
      number: disp(i.number), cve, ci: disp(i.cmdb_ci), state: disp(i.state), open, risk: disp(i.risk_rating),
      group: disp(i.assignment_group) || null, target: disp(i.ttr_target_date) || null, cisa_due: due || null,
      past_cisa_due: open && !!due && due < today, closed_at: disp(i.closed_at) || null,
      record_url: url(c, 'sn_vul_vulnerable_item', i.sys_id),
    };
  });
  const byCi = new Map<string, { ci: string; items: number; open: number; record_url?: string }>();
  for (const i of items.records) {
    const k = String(val(i.cmdb_ci) ?? '');
    if (!k) continue;
    const e = byCi.get(k) ?? { ci: String(disp(i.cmdb_ci)), items: 0, open: 0, record_url: url(c, 'cmdb_ci', k) };
    e.items += 1;
    if (String(val(i.active)) === 'true' && !CLOSED_STATES.has(String(val(i.state)))) e.open += 1;
    byCi.set(k, e);
  }
  const open = rows.filter((r) => r.open).length;
  const notes = [tasksByName, items, library, groupLinks, approvals, sirs, services, tasks, changeLinks].map((x: any) => x.note).filter(Boolean);
  return {
    threat: { cves: allCves, name: name || null },
    summary: {
      vulnerable_items: rows.length,
      open_items: open,
      remediated_items: rows.length - open,
      remediated_pct: rows.length ? Math.round(((rows.length - open) / rows.length) * 1000) / 10 : null,
      affected_cis: byCi.size,
      open_past_cisa_due: rows.filter((r) => r.past_cisa_due).length,
      kev: library.records.some((e: any) => String(val(e.cisa_exists)) === 'true'),
      remediation_tasks: tasks.records.length,
      changes: changeLinks.records.length,
      exception_requests: approvals.records.length,
      security_incidents: sirs.records.length,
      items_list_url: itemQuery ? listUrl(c, 'sn_vul_vulnerable_item', itemQuery) : null,
    },
    cves: library.records.map((e: any) => ({
      id: val(e.id), kev: String(val(e.cisa_exists)) === 'true', cisa_due: val(e.due_date) || null, epss: Number(val(e.epss_score)) || null,
      epss_percentile: Number(val(e.epss_percentile)) || null, cvss_v3: Number(val(e.v3_base_score)) || null, cvss_v4: Number(val(e.v4_base_score)) || null,
      summary: String(val(e.summary) ?? '').slice(0, 300), record_url: url(c, String(val(e.sys_class_name) || 'sn_vul_entry'), e.sys_id),
    })),
    vulnerable_items: rows.slice(0, max),
    affected_cis: [...byCi.values()],
    services: [...new Map(services.records.map((s: any) => [String(val(s.parent)), { service: disp(s['parent.name']) || disp(s.parent), record_url: url(c, 'cmdb_ci', s.parent) }])).values()],
    remediation_tasks: tasks.records.map((t: any) => ({ number: disp(t.number), state: disp(t.state), short_description: disp(t.short_description), group: disp(t.assignment_group) || null, owner: disp(t.assigned_to) || null, record_url: url(c, 'sn_vul_vulnerability', t.sys_id) })),
    changes: changeLinks.records.map((l: any) => ({
      number: disp(l['change_request.number']), state: disp(l['change_request.state']), type: disp(l['change_request.type']), short_description: disp(l['change_request.short_description']),
      planned_start: disp(l['change_request.start_date']) || null, planned_end: disp(l['change_request.end_date']) || null, record_url: url(c, 'change_request', l.change_request),
    })),
    exception_requests: approvals.records.map((a: any) => ({ number: disp(a.number), state: disp(a.state) || disp(a.approval_state), until: disp(a.desired_validity_date) || null, reason: disp(a.desired_reason) || null, record_url: url(c, 'sn_vul_change_approval', a.sys_id) })),
    security_incidents: sirs.records.map((s: any) => ({ number: disp(s.number), short_description: disp(s.short_description), state: disp(s.state), severity: disp(s.severity), ci: disp(s.cmdb_ci) || null, opened: disp(s.opened_at), record_url: url(c, 'sn_si_incident', s.sys_id) })),
    ...(notes.length ? { notes } : {}),
  };
}

export async function getKevCompliance(c: ServiceNowClient, args: Record<string, any>): Promise<Record<string, any>> {
  const days = Math.min(Math.max(Number(args.days) || 90, 7), 730);
  const max = Math.min(Math.max(Number(args.limit) || 25, 1), 200);
  const today = new Date().toISOString().slice(0, 10);
  let items;
  try {
    items = await c.queryRecords({
      table: 'sn_vul_vulnerable_item',
      query: 'vulnerability.cisa_exists=true^ORDERBYvulnerability.due_date',
      fields: 'sys_id,number,state,active,risk_rating,cmdb_ci,vulnerability,vulnerability.id,vulnerability.due_date,assignment_group,closed_at,ttr_target_date',
      limit: 5000,
      displayValue: 'all',
    });
  } catch (e) {
    if (/invalid table/i.test(errText(e))) throw new ServiceNowError('sn_vul_vulnerable_item is not available. KEV compliance needs Vulnerability Response.', 'PLUGIN_NOT_INSTALLED');
    throw e;
  }
  type Row = { number: string; cve: string; ci: string; group: string; due: string; open: boolean; closed: string; status: 'met' | 'missed' | 'open_overdue' | 'open_in_time' | 'no_due_date'; record_url?: string };
  const rows: Row[] = items.records.map((i: any) => {
    const due = String(val(i['vulnerability.due_date']) ?? '').slice(0, 10);
    const open = String(val(i.active)) === 'true' && !CLOSED_STATES.has(String(val(i.state)));
    const closed = String(val(i.closed_at) ?? '').slice(0, 10);
    const status: Row['status'] = !due ? 'no_due_date' : open ? (due < today ? 'open_overdue' : 'open_in_time') : closed && closed <= due ? 'met' : 'missed';
    return { number: String(disp(i.number)), cve: String(disp(i['vulnerability.id']) ?? ''), ci: String(disp(i.cmdb_ci) ?? ''), group: String(disp(i.assignment_group) || '(unassigned)'), due, open, closed, status, record_url: url(c, 'sn_vul_vulnerable_item', i.sys_id) };
  });
  const count = (f: (r: Row) => boolean) => rows.filter(f).length;
  const tally = (key: 'group' | 'cve') => {
    const m = new Map<string, Record<string, number>>();
    for (const r of rows) {
      const e = m.get(r[key]) ?? { total: 0, met: 0, missed: 0, open_overdue: 0, open_in_time: 0 };
      e.total += 1;
      if (r.status in e) e[r.status] += 1;
      m.set(r[key], e);
    }
    return [...m.entries()].map(([k, v]) => ({ [key]: k, ...v })).sort((a: any, b: any) => b.open_overdue - a.open_overdue || b.total - a.total);
  };
  // Weekly closures over the window.
  const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const weeks = new Map<string, number>();
  for (const r of rows) {
    if (!r.closed || r.closed < since) continue;
    const d = new Date(`${r.closed}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    const k = d.toISOString().slice(0, 10);
    weeks.set(k, (weeks.get(k) ?? 0) + 1);
  }
  const ttr = await c.runStats('sn_vul_vulnerable_item', { query: 'stateIN3,101', groupBy: 'vulnerability.cisa_exists', avgFields: ['age_closed'] }).catch(() => []);
  const closedTotal = count((r) => r.status === 'met' || r.status === 'missed');
  return {
    as_of: today,
    summary: {
      kev_items: rows.length,
      fixed_on_time: count((r) => r.status === 'met'),
      fixed_late: count((r) => r.status === 'missed'),
      missed_deadline_total: count((r) => r.status === 'missed' || r.status === 'open_overdue'),
      open_overdue: count((r) => r.status === 'open_overdue'),
      open_within_deadline: count((r) => r.status === 'open_in_time'),
      without_due_date: count((r) => r.status === 'no_due_date'),
      on_time_rate_pct: closedTotal ? Math.round((count((r) => r.status === 'met') / closedTotal) * 1000) / 10 : null,
      compliance_pct: rows.length ? Math.round((count((r) => r.status === 'met' || r.status === 'open_in_time') / rows.length) * 1000) / 10 : null,
      kev_list_url: listUrl(c, 'sn_vul_vulnerable_item', 'vulnerability.cisa_exists=true'),
    },
    by_group: tally('group'),
    by_cve: tally('cve'),
    weekly_closures: [...weeks.entries()].sort().map(([week, closed]) => ({ week, closed })),
    average_days_to_close: (ttr as any[]).map((r) => ({ kev: /^(true|1|yes)$/i.test(String(r.groupby_fields?.[0]?.value ?? '')), items: Number(r.stats?.count ?? 0), avg_days: Math.round(Number(r.stats?.avg?.age_closed ?? 0)) })),
    overdue_items: rows.filter((r) => r.status === 'open_overdue').slice(0, max).map(({ open: _o, ...r }) => r),
    note: 'Due dates are the CISA KEV federal due dates on each CVE (sn_vul_entry.due_date). An item counts as on time when it was closed on or before that date.',
  };
}

export async function executeVrInsightsToolCall(c: ServiceNowClient, name: string, args: Record<string, any>): Promise<any> {
  switch (name) {
    case 'get_threat_status': return getThreatStatus(c, args);
    case 'get_kev_compliance': return getKevCompliance(c, args);
    default: return null;
  }
}

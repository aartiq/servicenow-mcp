/**
 * Security Operations (SecOps) tools — security incidents, vulnerabilities, and GRC.
 * Read tools: Tier 0. Write tools: Tier 1 (WRITE_ENABLED=true).
 */
import type { ServiceNowClient } from '../servicenow/client.js';
import { ServiceNowError } from '../utils/errors.js';
import { requireWrite } from '../utils/permissions.js';
import { RISK_RATINGS, SIR_STATES, VIT_STATES, checkSirMove, classifyVulnRef, mapChoice } from './vr-helpers.js';

export function getSecurityToolDefinitions() {
  return [
    {
      name: 'create_security_incident',
      description: 'Create a Security Operations incident (requires WRITE_ENABLED=true)',
      inputSchema: {
        type: 'object',
        properties: {
          short_description: { type: 'string', description: 'Brief description of the security event' },
          category: { type: 'string', description: 'Incident category (e.g., "Malware", "Phishing", "Data Breach", "Unauthorized Access")' },
          subcategory: { type: 'string', description: 'Incident subcategory' },
          severity: { type: 'number', description: '1=High, 2=Medium, 3=Low' },
          description: { type: 'string', description: 'Detailed description of the security incident' },
          affected_cis: { type: 'array', items: { type: 'string' }, description: 'List of affected CI sys_ids' },
          assignment_group: { type: 'string', description: 'SOC team or assignment group' },
        },
        required: ['short_description', 'category'],
      },
    },
    {
      name: 'get_security_incident',
      description: 'Get full details of a security incident by number or sys_id',
      inputSchema: {
        type: 'object',
        properties: {
          number_or_sysid: { type: 'string', description: 'Security incident number (SIR...) or sys_id' },
        },
        required: ['number_or_sysid'],
      },
    },
    {
      name: 'update_security_incident',
      description: 'Update a security incident record (requires WRITE_ENABLED=true)',
      inputSchema: {
        type: 'object',
        properties: {
          sys_id: { type: 'string', description: 'System ID of the security incident' },
          fields: { type: 'object', description: 'Fields to update (state, severity, containment_status, etc.)' },
        },
        required: ['sys_id', 'fields'],
      },
    },
    {
      name: 'list_security_incidents',
      description: 'List security incidents with filters (severity, state, category)',
      inputSchema: {
        type: 'object',
        properties: {
          state: { type: 'string', description: 'Filter by state: open (any active), draft, analysis, contain, eradicate, recover, review, closed, cancelled, or the number' },
          severity: { type: 'number', description: 'Filter by severity (1=High, 2=Medium, 3=Low)' },
          category: { type: 'string', description: 'Filter by incident category' },
          limit: { type: 'number', description: 'Max records to return (default 25)' },
          query: { type: 'string', description: 'Additional encoded query string' },
        },
        required: [],
      },
    },
    {
      name: 'list_vulnerabilities',
      description: 'List vulnerable items (sn_vul_vulnerable_item, VIT...: one vulnerability on one CI) from Vulnerability Response, with CVE, KEV flag, risk rating, CI, group and remediation target date. source=library lists CVE library entries (sn_vul_entry) instead',
      inputSchema: {
        type: 'object',
        properties: {
          state: { type: 'string', description: 'Filter by state: open (any active item), under_investigation, in_review, awaiting_implementation, deferred (risk_accepted), resolved, closed, or the number (1 is the Open state itself)' },
          severity: { type: 'string', description: 'Filter by risk rating: critical, high, medium, low, none' },
          ci_sysid: { type: 'string', description: 'Filter by affected CI sys_id' },
          cve: { type: 'string', description: 'Filter by CVE ID, e.g. CVE-2026-109618 (vulnerability.id)' },
          kev: { type: 'boolean', description: 'Only items whose CVE is on the CISA KEV list' },
          active: { type: 'boolean', description: 'Only active items (true) or inactive ones (false)' },
          source: { type: 'string', enum: ['items', 'library'], description: 'items (default: vulnerable items) or library (CVE library entries in sn_vul_entry, filtered by cve or query)' },
          limit: { type: 'number', description: 'Max records to return (default 25)' },
          query: { type: 'string', description: 'Additional encoded query string' },
        },
        required: [],
      },
    },
    {
      name: 'get_vulnerability',
      description: 'Get a vulnerability record by reference: VIT... (vulnerable item), VUL... (remediation task, sn_vul_vulnerability, with its items), CVE-... (CVE library entry with KEV and EPSS), or a sys_id (vulnerable item first, then the library entry)',
      inputSchema: {
        type: 'object',
        properties: {
          number_or_sysid: { type: 'string', description: 'VIT..., VUL..., CVE-... or a sys_id' },
        },
        required: ['number_or_sysid'],
      },
    },
    {
      name: 'update_vulnerability',
      description: 'Update a vulnerable item (VIT) or remediation task (VUL) (requires WRITE_ENABLED=true). Never writes the shared CVE library (sn_vul_entry). A deferral (state deferred, or defer_until) is requested through an exception request (sn_vul_change_approval) so it goes through approval',
      inputSchema: {
        type: 'object',
        properties: {
          sys_id: { type: 'string', description: 'sys_id, VIT... or VUL... of the record to update' },
          fields: { type: 'object', description: 'Fields to update (state as a label or number, assignment_group, work_notes, etc.)' },
          defer_until: { type: 'string', description: 'Request a deferral until this date (YYYY-MM-DD) instead of setting the state' },
          reason: { type: 'string', description: 'Deferral reason (required with defer_until)' },
          compensating_controls: { type: 'string', description: 'Compensating controls for the deferral' },
        },
        required: ['sys_id'],
      },
    },
    {
      name: 'create_change_from_remediation_task',
      description: 'Create a change for a Vulnerability Response remediation task (VUL...) the same way the "Create Change" action does (sn_vul.ChangeMgmt actionCreateChange): the change, its link to the task, the vulnerable item links and the affected CIs, so task and change states stay in sync. Requires WRITE_ENABLED=true and the server-side script runner',
      inputSchema: {
        type: 'object',
        properties: {
          remediation_task: { type: 'string', description: 'VUL number or sys_id of the remediation task (sn_vul_vulnerability)' },
          short_description: { type: 'string', description: 'Change short description (default: the task\'s)' },
          change_type: { type: 'string', enum: ['normal', 'emergency', 'standard'], description: 'Change type (default normal)' },
          assignment_group: { type: 'string', description: 'Assignment group sys_id (default: the task\'s)' },
          assigned_to: { type: 'string', description: 'Assignee sys_id (default: the task\'s)' },
          justification: { type: 'string', description: 'Justification (recommended for emergency changes)' },
          implementation_plan: { type: 'string', description: 'Implementation plan (default: the task\'s preferred solution)' },
          end_date: { type: 'string', description: 'Planned end, YYYY-MM-DD HH:MM:SS' },
          add_cis: { type: 'boolean', description: 'Add the affected CIs to the change (default true)' },
        },
        required: ['remediation_task'],
      },
    },
    {
      name: 'list_grc_risks',
      description: 'List GRC (Governance, Risk, Compliance) risk entries',
      inputSchema: {
        type: 'object',
        properties: {
          state: { type: 'string', description: 'Filter by risk state (draft, assess, review, accepted, closed)' },
          category: { type: 'string', description: 'Filter by risk category' },
          limit: { type: 'number', description: 'Max records to return (default 25)' },
        },
        required: [],
      },
    },
    {
      name: 'get_grc_risk',
      description: 'Get details of a GRC risk including impact, likelihood, and controls',
      inputSchema: {
        type: 'object',
        properties: {
          number_or_sysid: { type: 'string', description: 'Risk number or sys_id' },
        },
        required: ['number_or_sysid'],
      },
    },
    {
      name: 'list_grc_controls',
      description: 'List GRC controls with optional filter by risk or policy',
      inputSchema: {
        type: 'object',
        properties: {
          risk_sysid: { type: 'string', description: 'Filter controls by related risk sys_id' },
          state: { type: 'string', description: 'Filter by control state (draft, attest, review, exception, compliant, non_compliant)' },
          limit: { type: 'number', description: 'Max records to return (default 25)' },
        },
        required: [],
      },
    },
    {
      name: 'get_threat_intelligence',
      description: 'Query threat intelligence data — IOCs, threat actors, and campaigns',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search term (IP, domain, hash, actor name)' },
          type: { type: 'string', description: 'Filter by IOC type: ip_address, domain, file_hash, url, email' },
          limit: { type: 'number', description: 'Max records to return (default 25)' },
        },
        required: ['query'],
      },
    },
    // ─── Security Playbooks ───────────────────────────────────────────
    {
      name: 'list_security_playbooks',
      description: 'List available security response playbooks',
      inputSchema: {
        type: 'object',
        properties: {
          active: { type: 'boolean', description: 'Filter active only (default true)' },
          category: { type: 'string', description: 'Filter by category (incident_response, threat_hunting, compliance)' },
          limit: { type: 'number', description: 'Max records (default 25)' },
        },
        required: [],
      },
    },
    {
      name: 'run_security_playbook',
      description: 'Check how a security response playbook would run on an incident. ServiceNow has no API to start a playbook on demand, so this reports the playbook runs already on the incident and how to trigger it',
      inputSchema: {
        type: 'object',
        properties: {
          playbook_sys_id: { type: 'string', description: 'Playbook sys_id to execute' },
          incident_sys_id: { type: 'string', description: 'Security incident sys_id to run against' },
          parameters: { type: 'object', description: 'Optional playbook input parameters' },
        },
        required: ['playbook_sys_id', 'incident_sys_id'],
      },
    },
    // ─── Security Dashboard & Posture ─────────────────────────────────
    {
      name: 'get_security_dashboard',
      description: 'Security posture: active security incidents by severity, active vulnerable items by risk rating, KEV items open, and incidents resolved in the period',
      inputSchema: {
        type: 'object',
        properties: {
          days: { type: 'number', description: 'Look-back period in days (default 30)' },
        },
        required: [],
      },
    },
    {
      name: 'scan_vulnerabilities',
      description: 'Trigger a vulnerability scan for specified CIs or groups. **[Write]**',
      inputSchema: {
        type: 'object',
        properties: {
          ci_sys_ids: { type: 'array', items: { type: 'string' }, description: 'CI sys_ids to scan' },
          group: { type: 'string', description: 'CI group to scan (alternative to ci_sys_ids)' },
          scan_type: { type: 'string', description: 'Scan type: full, quick, compliance (default full)' },
        },
        required: [],
      },
    },
    // ─── GRC Compliance ───────────────────────────────────────────────
    {
      name: 'create_grc_risk',
      description: 'Create a new GRC risk entry. **[Write]**',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Risk name' },
          category: { type: 'string', description: 'Risk category' },
          description: { type: 'string', description: 'Risk description' },
          impact: { type: 'number', description: 'Impact score (1-5)' },
          likelihood: { type: 'number', description: 'Likelihood score (1-5)' },
          owner: { type: 'string', description: 'Risk owner user sys_id' },
        },
        required: ['name', 'category'],
      },
    },
    {
      name: 'list_compliance_policies',
      description: 'List GRC compliance policies and their current status',
      inputSchema: {
        type: 'object',
        properties: {
          state: { type: 'string', description: 'Filter by state (draft, published, retired)' },
          limit: { type: 'number', description: 'Max records (default 25)' },
        },
        required: [],
      },
    },
    {
      name: 'get_compliance_assessment',
      description: 'Get compliance assessment results for a policy or control',
      inputSchema: {
        type: 'object',
        properties: {
          policy_sys_id: { type: 'string', description: 'Policy sys_id' },
          control_sys_id: { type: 'string', description: 'Control sys_id (alternative to policy)' },
        },
        required: [],
      },
    },
    {
      name: 'list_audit_results',
      description: 'List audit results and findings',
      inputSchema: {
        type: 'object',
        properties: {
          state: { type: 'string', description: 'Filter by state (open, in_progress, closed)' },
          severity: { type: 'string', description: 'Filter by severity (critical, high, medium, low)' },
          limit: { type: 'number', description: 'Max records (default 25)' },
        },
        required: [],
      },
    },
  ];
}

async function withPlugin<T>(plugin: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ServiceNowError && /Invalid table/i.test(e.message)) {
      throw new ServiceNowError(`This needs the ${plugin} plugin, which isn't active on this instance.`, 'PLUGIN_NOT_ACTIVE');
    }
    throw e;
  }
}

export async function executeSecurityToolCall(
  client: ServiceNowClient,
  name: string,
  args: Record<string, any>
): Promise<any> {
  switch (name) {
    case 'create_security_incident': {
      requireWrite();
      if (!args.short_description || !args.category) throw new ServiceNowError('short_description and category are required', 'INVALID_REQUEST');
      const { affected_cis: affected, ...rest } = args;
      const cis = (Array.isArray(affected) ? affected : affected ? [affected] : []).map(String).filter(Boolean);
      for (const ci of cis) if (!/^[0-9a-f]{32}$/i.test(ci)) throw new ServiceNowError(`affected_cis must be CI sys_ids, got "${ci}"`, 'INVALID_REQUEST');
      const data: Record<string, any> = { ...rest };
      if (data.state !== undefined) data.state = mapChoice(SIR_STATES, data.state, 'security incident state');
      if (cis.length && !data.cmdb_ci) data.cmdb_ci = cis[0];
      const result = await client.createRecord('sn_si_incident', data);
      const sirId = String((result as any).sys_id?.value ?? (result as any).sys_id ?? '');
      const linked: string[] = [];
      for (const ci of cis.slice(data.cmdb_ci === cis[0] ? 1 : 0)) {
        if (!sirId) break;
        await client.createRecord('task_ci', { task: sirId, ci_item: ci });
        linked.push(ci);
      }
      return { ...result, ...(cis.length ? { affected_cis_linked: [data.cmdb_ci, ...linked].filter(Boolean) } : {}), summary: `Created security incident ${result.number || result.sys_id}` };
    }
    case 'get_security_incident': {
      if (!args.number_or_sysid) throw new ServiceNowError('number_or_sysid is required', 'INVALID_REQUEST');
      const ref = String(args.number_or_sysid).trim();
      if (ref.includes('^')) throw new ServiceNowError('number_or_sysid must not contain "^"', 'INVALID_REQUEST');
      let rec: any;
      if (/^[0-9a-f]{32}$/i.test(ref)) rec = await client.getRecord('sn_si_incident', ref, undefined, 'all');
      else {
        const resp = await client.queryRecords({ table: 'sn_si_incident', query: `number=${ref}`, limit: 1, displayValue: 'all' });
        if (resp.count === 0) throw new ServiceNowError(`Security incident not found: ${ref}`, 'NOT_FOUND');
        rec = resp.records[0];
      }
      const id = String(rec?.sys_id?.value ?? rec?.sys_id ?? '');
      const notes = id
        ? await client.queryRecords({ table: 'sys_journal_field', query: `element_id=${id}^elementINwork_notes,comments^ORDERBYDESCsys_created_on`, fields: 'element,value,sys_created_on,sys_created_by', limit: 30 }).catch(() => ({ count: 0, records: [] as any[] }))
        : { count: 0, records: [] as any[] };
      return client.attachRecordUrl('sn_si_incident', { ...rec, work_notes_history: notes.records.map((n: any) => ({ type: n.element, at: n.sys_created_on, by: n.sys_created_by, text: n.value })) });
    }
    case 'update_security_incident': {
      requireWrite();
      if (!args.sys_id || !args.fields) throw new ServiceNowError('sys_id and fields are required', 'INVALID_REQUEST');
      const fields: Record<string, any> = { ...args.fields };
      if (fields.state !== undefined) {
        const to = mapChoice(SIR_STATES, fields.state, 'security incident state');
        const current = await client.getRecord('sn_si_incident', args.sys_id, 'state');
        checkSirMove(String((current as any).state?.value ?? (current as any).state ?? ''), to);
        fields.state = to;
      }
      const result = await client.updateRecord('sn_si_incident', args.sys_id, fields);
      return { ...result, summary: `Updated security incident ${args.sys_id}` };
    }
    case 'list_security_incidents': {
      const parts: string[] = [];
      if (args.state) {
        if (String(args.state).trim().toLowerCase() === 'open') parts.push('active=true');
        else parts.push(`state=${mapChoice(SIR_STATES, args.state, 'security incident state')}`);
      }
      if (args.severity) parts.push(`severity=${args.severity}`);
      if (args.category) parts.push(`category=${args.category}`);
      if (args.query) parts.push(args.query);
      return await client.queryRecords({ table: 'sn_si_incident', query: parts.join('^') || '', limit: args.limit ?? 25, displayValue: 'all' });
    }
    case 'list_vulnerabilities': {
      const parts: string[] = [];
      if (args.source === 'library') {
        if (args.cve) parts.push(`id=${String(args.cve).trim().toUpperCase()}`);
        if (args.kev) parts.push('cisa_exists=true');
        if (args.query) parts.push(args.query);
        return await withPlugin('Vulnerability Response', () => client.queryRecords({ table: 'sn_vul_entry', query: parts.join('^') || '', limit: args.limit ?? 25, fields: 'sys_id,id,name,summary,cisa_exists,due_date,epss_score,epss_percentile,risk_score,sys_class_name' }));
      }
      if (args.state) {
        // "open" means any item still being worked (active), as people use it; the Open state itself is 1.
        if (String(args.state).trim().toLowerCase() === 'open') parts.push('active=true');
        else parts.push(`state=${mapChoice(VIT_STATES, args.state, 'vulnerable item state')}`);
      }
      if (args.severity) parts.push(`risk_rating=${mapChoice(RISK_RATINGS, args.severity, 'risk rating')}`);
      if (args.ci_sysid) parts.push(`cmdb_ci=${args.ci_sysid}`);
      if (args.cve) parts.push(`vulnerability.id=${String(args.cve).trim().toUpperCase()}`);
      if (args.kev) parts.push('vulnerability.cisa_exists=true');
      if (args.active !== undefined) parts.push(`active=${args.active === true || args.active === 'true'}`);
      if (args.query) parts.push(args.query);
      const resp = await withPlugin('Vulnerability Response', () => client.queryRecords({
        table: 'sn_vul_vulnerable_item',
        query: parts.join('^') || '',
        limit: args.limit ?? 25,
        fields: 'sys_id,number,state,substate,risk_rating,risk_score,cmdb_ci,vulnerability,vulnerability.id,vulnerability.cisa_exists,vulnerability.due_date,assignment_group,assigned_to,ttr_target_date,active,first_found,last_found',
        displayValue: 'all',
      }));
      return { ...resp, records: resp.records.map((r: any) => client.attachRecordUrl('sn_vul_vulnerable_item', r)) };
    }
    case 'get_vulnerability': {
      if (!args.number_or_sysid) throw new ServiceNowError('number_or_sysid is required', 'INVALID_REQUEST');
      const ref = classifyVulnRef(String(args.number_or_sysid));
      const one = async (table: string, query: string) => {
        const r = await client.queryRecords({ table, query, limit: 1, displayValue: 'all' });
        return r.records[0] ? client.attachRecordUrl(table, r.records[0]) : undefined;
      };
      if (ref.kind === 'vit' || ref.kind === 'vul') {
        const table = ref.kind === 'vit' ? 'sn_vul_vulnerable_item' : 'sn_vul_vulnerability';
        const rec: any = await withPlugin('Vulnerability Response', () => one(table, `number=${ref.value}`));
        if (!rec) throw new ServiceNowError(`Vulnerability not found: ${ref.value}`, 'NOT_FOUND');
        if (ref.kind === 'vul') {
          const id = String(rec.sys_id?.value ?? rec.sys_id);
          const [items, changes] = await Promise.all([
            client.queryRecords({ table: 'sn_vul_m2m_vul_group_item', query: `sn_vul_vulnerability=${id}`, fields: 'sn_vul_vulnerable_item,sn_vul_vulnerable_item.number,sn_vul_vulnerable_item.state,sn_vul_vulnerable_item.risk_rating,sn_vul_vulnerable_item.cmdb_ci,sn_vul_vulnerable_item.vulnerability', limit: 500, displayValue: 'all' }).catch(() => ({ count: 0, records: [] as any[] })),
            client.queryRecords({ table: 'sn_vul_m2m_vg_change_request', query: `sn_vul_vulnerability=${id}`, fields: 'change_request,change_request.number,change_request.state,change_request.type', limit: 50, displayValue: 'all' }).catch(() => ({ count: 0, records: [] as any[] })),
          ]);
          const dv = (v: any) => (v && typeof v === 'object' ? v.display_value ?? v.value : v);
          const vv = (v: any) => (v && typeof v === 'object' ? v.value : v);
          return {
            ...rec,
            record_type: 'remediation_task',
            vulnerable_items: items.records.map((i: any) => ({
              number: dv(i['sn_vul_vulnerable_item.number']), state: dv(i['sn_vul_vulnerable_item.state']), risk_rating: dv(i['sn_vul_vulnerable_item.risk_rating']),
              ci: dv(i['sn_vul_vulnerable_item.cmdb_ci']), cve: dv(i['sn_vul_vulnerable_item.vulnerability']),
              record_url: vv(i.sn_vul_vulnerable_item) ? client.recordUrl('sn_vul_vulnerable_item', String(vv(i.sn_vul_vulnerable_item))) : undefined,
            })),
            changes: changes.records.map((c: any) => ({
              number: dv(c['change_request.number']), state: dv(c['change_request.state']), type: dv(c['change_request.type']),
              record_url: vv(c.change_request) ? client.recordUrl('change_request', String(vv(c.change_request))) : undefined,
            })),
          };
        }
        return { ...rec, record_type: 'vulnerable_item' };
      }
      if (ref.kind === 'cve') {
        const rec = await withPlugin('Vulnerability Response', () => one('sn_vul_entry', `id=${ref.value}`));
        if (!rec) throw new ServiceNowError(`CVE not in the vulnerability library: ${ref.value}`, 'NOT_FOUND');
        return { ...rec, record_type: 'library_entry' };
      }
      if (ref.kind === 'sys_id') {
        const vit = await one('sn_vul_vulnerable_item', `sys_id=${ref.value}`).catch(() => undefined);
        if (vit) return { ...vit, record_type: 'vulnerable_item' };
        const vul = await one('sn_vul_vulnerability', `sys_id=${ref.value}`).catch(() => undefined);
        if (vul) return { ...vul, record_type: 'remediation_task' };
        const entry = await one('sn_vul_entry', `sys_id=${ref.value}`).catch(() => undefined);
        if (entry) return { ...entry, record_type: 'library_entry' };
        throw new ServiceNowError(`Vulnerability not found: ${ref.value}`, 'NOT_FOUND');
      }
      const entry = await one('sn_vul_entry', `number=${ref.value}^ORid=${ref.value}`);
      if (!entry) throw new ServiceNowError(`Vulnerability not found: ${ref.value}`, 'NOT_FOUND');
      return { ...entry, record_type: 'library_entry' };
    }
    case 'update_vulnerability': {
      requireWrite();
      if (!args.sys_id) throw new ServiceNowError('sys_id is required', 'INVALID_REQUEST');
      const ref = classifyVulnRef(String(args.sys_id));
      let table = '';
      let id = '';
      const find = async (t: string, q: string) => (await client.queryRecords({ table: t, query: q, fields: 'sys_id,number,state', limit: 1 }).catch(() => ({ records: [] as any[] }))).records[0];
      if (ref.kind === 'vit' || ref.kind === 'vul') {
        table = ref.kind === 'vit' ? 'sn_vul_vulnerable_item' : 'sn_vul_vulnerability';
        const r = await find(table, `number=${ref.value}`);
        if (!r) throw new ServiceNowError(`Vulnerability not found: ${ref.value}`, 'NOT_FOUND');
        id = String(r.sys_id);
      } else if (ref.kind === 'sys_id') {
        for (const t of ['sn_vul_vulnerable_item', 'sn_vul_vulnerability']) {
          if (await find(t, `sys_id=${ref.value}`)) { table = t; id = ref.value; break; }
        }
        if (!table) {
          if (await find('sn_vul_entry', `sys_id=${ref.value}`)) {
            throw new ServiceNowError('That is a CVE library entry (sn_vul_entry). It is shared reference data and is not updated here: update the vulnerable items (VIT) or the remediation task (VUL) instead.', 'INVALID_REQUEST');
          }
          throw new ServiceNowError(`Vulnerability not found: ${ref.value}`, 'NOT_FOUND');
        }
      } else {
        throw new ServiceNowError('sys_id must be a VIT or VUL number or a sys_id. CVE library entries are not updated here.', 'INVALID_REQUEST');
      }
      const fields: Record<string, any> = { ...(args.fields || {}) };
      const deferState = fields.state !== undefined && mapChoice(VIT_STATES, fields.state, 'vulnerability state') === '12';
      if (args.defer_until || deferState) {
        if (!args.defer_until || !/^\d{4}-\d{2}-\d{2}$/.test(String(args.defer_until))) throw new ServiceNowError('A deferral needs defer_until (YYYY-MM-DD) and a reason. It is requested through an exception request, not by setting the state.', 'INVALID_REQUEST');
        if (!args.reason) throw new ServiceNowError('A deferral needs a reason', 'INVALID_REQUEST');
        const approval = await client.createRecord('sn_vul_change_approval', {
          vul_record: id, vul_table_name: table, desired_state: 12, desired_validity_date: args.defer_until,
          desired_reason: args.reason, description: args.reason, ...(args.compensating_controls ? { compensating_controls: args.compensating_controls } : {}),
        });
        delete fields.state;
        const updated = Object.keys(fields).length ? await client.updateRecord(table, id, fields) : undefined;
        return { ...(updated ?? {}), exception_request: approval, summary: `Requested a deferral of ${ref.value} until ${args.defer_until} (exception ${approval.number || approval.sys_id}); it takes effect once approved` };
      }
      if (!Object.keys(fields).length) throw new ServiceNowError('fields (or defer_until) is required', 'INVALID_REQUEST');
      if (fields.state !== undefined) fields.state = mapChoice(VIT_STATES, fields.state, 'vulnerability state');
      const result = await client.updateRecord(table, id, fields);
      return { ...result, summary: `Updated ${table === 'sn_vul_vulnerable_item' ? 'vulnerable item' : 'remediation task'} ${ref.value}` };
    }
    case 'create_change_from_remediation_task': {
      requireWrite();
      const ref = classifyVulnRef(String(args.remediation_task || ''));
      if (ref.kind !== 'vul' && ref.kind !== 'sys_id') throw new ServiceNowError('remediation_task must be a VUL number or a sys_id', 'INVALID_REQUEST');
      const task = (await client.queryRecords({ table: 'sn_vul_vulnerability', query: ref.kind === 'vul' ? `number=${ref.value}` : `sys_id=${ref.value}`, fields: 'sys_id,number,state', limit: 1 })).records[0] as any;
      if (!task) throw new ServiceNowError(`Remediation task not found: ${ref.value}`, 'NOT_FOUND');
      const type = String(args.change_type || 'normal');
      if (!['normal', 'emergency', 'standard'].includes(type)) throw new ServiceNowError('change_type must be normal, emergency or standard', 'INVALID_REQUEST');
      for (const f of ['assignment_group', 'assigned_to']) {
        if (args[f] && !/^[0-9a-f]{32}$/i.test(String(args[f]))) throw new ServiceNowError(`${f} must be a sys_id`, 'INVALID_REQUEST');
      }
      if (args.end_date && !/^\d{4}-\d{2}-\d{2}( \d{2}:\d{2}:\d{2})?$/.test(String(args.end_date))) throw new ServiceNowError('end_date must be YYYY-MM-DD HH:MM:SS', 'INVALID_REQUEST');
      const j = (v: unknown) => JSON.stringify(v === undefined || v === null ? '' : String(v));
      // The same steps as the Create Change UI action: a sn_vul_action_create_cr record handed to
      // sn_vul.ChangeMgmt().actionCreateChange(), which creates the change and all VR links.
      const script = [
        `var vg=new GlideRecord('sn_vul_vulnerability');if(!vg.get(${j(task.sys_id)}))throw 'remediation task not found';`,
        `var a=new GlideRecord('sn_vul_action_create_cr');a.initialize();`,
        `a.title=gs.getMessage('For Vulnerability Group {0}', vg.getDisplayValue());a.vg_sys_id=vg.getUniqueValue();`,
        `a.assigned_to=${j(args.assigned_to)}||vg.getValue('assigned_to');a.assignment_group=${j(args.assignment_group)}||vg.getValue('assignment_group');`,
        `a.short_description=${j(args.short_description)}||vg.getValue('short_description')||vg.getValue('description');`,
        `a.description=new sn_vul.ChangeMgmtBase().getChangeDescriptionForVG(vg.getDisplayValue(), vg.description);`,
        `a.implementation_plan=${j(args.implementation_plan)}||new sn_vul.ChangeMgmt().getPreferredSolution(vg.getUniqueValue());`,
        `a.setValue('change_request_type',${j(type)});a.add_cis_to_cr=${args.add_cis === false ? 'false' : 'true'};`,
        args.justification ? `a.justification=${j(args.justification)};` : '',
        args.end_date ? `a.end_date=${j(args.end_date)};` : '',
        `a.insert();a.status='in_progress';var ids=new sn_vul.ChangeMgmt().actionCreateChange(a);var st=a.status+'';var err=a.getValue('error_message')||'';`,
        `var chg=(ids&&ids.changeSysId)?ids.changeSysId:(a.getValue('new_change_id')||'');a.update();if(st=='finished')a.deleteRecord();`,
        `var cr=new GlideRecord('change_request');var num='';if(chg&&cr.get(chg))num=cr.getValue('number');`,
        `return {change_sys_id:chg,number:num,status:st,error:err,action_sys_id:a.getUniqueValue()};`,
      ].join('');
      const exec: any = await client.executeScript(script);
      const res = exec?.result ?? exec?.output ?? exec;
      if (exec?.ok === false || exec?.error) throw new ServiceNowError(`Vulnerability Response could not create the change: ${exec.error || 'unknown error'}`, 'CREATE_FAILED');
      const chgId = res?.change_sys_id;
      if (!chgId) throw new ServiceNowError(`Vulnerability Response did not create a change (status ${res?.status ?? 'unknown'}${res?.error ? `: ${res.error}` : ''}). Check that the remediation task is open and the Vulnerability Response change integration is active.`, 'CREATE_FAILED');
      const complete = res.status === 'finished';
      return {
        change_sys_id: chgId,
        number: res.number || null,
        remediation_task: task.number,
        vr_status: res.status || null,
        record_url: client.recordUrl('change_request', chgId),
        ...(complete ? {} : {
          warning: `Vulnerability Response created the change but reported "${res.status}"${res.error ? ` (${res.error})` : ''}. This usually means the task has no active vulnerable items to link. Check the change's links before relying on state sync.`,
        }),
        summary: complete
          ? `Created ${type} change ${res.number || chgId} for ${task.number} through Vulnerability Response, with the task, vulnerable item and CI links`
          : `Created ${type} change ${res.number || chgId} for ${task.number}, but Vulnerability Response did not finish linking it`,
      };
    }
    case 'list_grc_risks': {
      const parts: string[] = [];
      if (args.state) parts.push(`state=${args.state}`);
      if (args.category) parts.push(`category=${args.category}`);
      return await client.queryRecords({ table: 'sn_risk_risk', query: parts.join('^') || '', limit: args.limit ?? 25 });
    }
    case 'get_grc_risk': {
      if (!args.number_or_sysid) throw new ServiceNowError('number_or_sysid is required', 'INVALID_REQUEST');
      if (/^[0-9a-f]{32}$/i.test(args.number_or_sysid)) {
        return await client.getRecord('sn_risk_risk', args.number_or_sysid);
      }
      const resp = await client.queryRecords({ table: 'sn_risk_risk', query: `number=${args.number_or_sysid}`, limit: 1 });
      if (resp.count === 0) throw new ServiceNowError(`GRC risk not found: ${args.number_or_sysid}`, 'NOT_FOUND');
      return resp.records[0];
    }
    case 'list_grc_controls': {
      const parts: string[] = [];
      if (args.risk_sysid) parts.push(`risks=${args.risk_sysid}`);
      if (args.state) parts.push(`state=${args.state}`);
      return await client.queryRecords({ table: 'sn_compliance_control', query: parts.join('^') || '', limit: args.limit ?? 25 });
    }
    case 'get_threat_intelligence': {
      if (!args.query) throw new ServiceNowError('query is required', 'INVALID_REQUEST');
      const t = String(args.type || '').trim();
      if (t.includes('^') || String(args.query).includes('^')) throw new ServiceNowError('query and type must not contain "^"', 'INVALID_REQUEST');
      // type is a reference to the observable type, so match its value or its name.
      const q = t
        ? `valueCONTAINS${args.query}^type.value=${t}^ORtype.name=${t}`
        : `valueCONTAINS${args.query}`;
      return await client.queryRecords({ table: 'sn_ti_observable', query: q, limit: args.limit ?? 25 });
    }
    case 'list_security_playbooks': {
      // Security response playbooks are Playbooks (Process Automation Designer) definitions in
      // sys_pd_process_definition, shipped by the Security Operations apps (sn_si*, sn_sec*, sn_vul*, sn_ti_*).
      const parts: string[] = ['sys_scope.scopeSTARTSWITHsn_si^ORsys_scope.scopeSTARTSWITHsn_sec^ORsys_scope.scopeSTARTSWITHsn_vul^ORsys_scope.scopeSTARTSWITHsn_ti_'];
      if (args.active !== false) parts.push('active=true');
      if (args.category) parts.push(`labelLIKE${args.category}^ORdescriptionLIKE${args.category}`);
      return await withPlugin('Playbooks for Security Incident Response (sn_si)', () => client.queryRecords({
        table: 'sys_pd_process_definition',
        query: parts.join('^'),
        limit: args.limit ?? 25,
        fields: 'sys_id,name,label,description,active,status,process_type,sys_scope,sys_updated_on',
      }));
    }
    case 'run_security_playbook': {
      if (!args.playbook_sys_id || !args.incident_sys_id) throw new ServiceNowError('playbook_sys_id and incident_sys_id are required', 'INVALID_REQUEST');
      // There is no sn_si_playbook_execution table and no REST endpoint for launching a playbook.
      // Security Incident Response playbooks (Process Automation Designer, sys_pd_process_definition)
      // start from their trigger conditions on the incident, so report the active ones instead of
      // pretending to launch one.
      const contexts = await client.queryRecords({
        table: 'sys_pd_context',
        query: `input_record=${args.incident_sys_id}`,
        limit: 10,
        fields: 'sys_id,process_definition,state,sys_created_on',
      }).catch(() => ({ count: 0, records: [] as any[] }));
      throw new ServiceNowError(
        `ServiceNow has no API for starting a security playbook on demand. Playbook ${args.playbook_sys_id} runs when its trigger ` +
        `conditions match the incident (Process Automation Designer). ${contexts.count ? `Playbook runs already on this incident: ${contexts.records.map((r: any) => r.sys_id).join(', ')}.` : 'No playbook has run on this incident yet.'} ` +
        'Update the incident so it meets the playbook trigger, or start it from the Security Incident workspace.',
        'NOT_SUPPORTED',
      );
    }
    case 'get_security_dashboard': {
      const days = args.days || 30;
      const count = async (table: string, query: string): Promise<number | string> => {
        try {
          const rows = await client.runStats(table, { query });
          return Number(rows[0]?.stats?.count ?? 0);
        } catch (err) {
          return /invalid table/i.test(String((err as Error)?.message)) ? 'not available' : 'no access';
        }
      };
      const [openHigh, openMed, openLow, vulns, vulCrit, vulHigh, kevOpen, resolved] = await Promise.all([
        count('sn_si_incident', 'active=true^severity=1'),
        count('sn_si_incident', 'active=true^severity=2'),
        count('sn_si_incident', 'active=true^severity=3'),
        count('sn_vul_vulnerable_item', 'active=true'),
        count('sn_vul_vulnerable_item', 'active=true^risk_rating=1'),
        count('sn_vul_vulnerable_item', 'active=true^risk_rating=2'),
        count('sn_vul_vulnerable_item', 'active=true^vulnerability.cisa_exists=true'),
        count('sn_si_incident', `state=3^closed_at>=javascript:gs.daysAgoStart(${Number(days) || 30})`),
      ]);
      return {
        period_days: days,
        open_incidents: { high: openHigh, medium: openMed, low: openLow },
        open_vulnerabilities: vulns,
        open_vulnerabilities_by_risk: { critical: vulCrit, high: vulHigh },
        open_kev_vulnerabilities: kevOpen,
        resolved_incidents_period: resolved,
      };
    }
    case 'scan_vulnerabilities': {
      requireWrite();
      if (!args.ci_sys_ids?.length && !args.group) throw new ServiceNowError('ci_sys_ids or group is required', 'INVALID_REQUEST');
      // Vulnerability Response does not run scans itself (there is no sn_vul_scan_request table): scans run in the
      // connected scanner (Qualys, Tenable, Rapid7...) and results arrive through its integration.
      throw new ServiceNowError(
        'ServiceNow Vulnerability Response does not run scans itself. Start the scan in the connected scanner (Qualys, Tenable, Rapid7 and so on); ' +
        'its Vulnerability Response integration then imports the results into sn_vul_vulnerable_item. Use list_vulnerabilities to review them.',
        'NOT_SUPPORTED',
      );
    }
    case 'create_grc_risk': {
      requireWrite();
      if (!args.name || !args.category) throw new ServiceNowError('name and category are required', 'INVALID_REQUEST');
      const result = await client.createRecord('sn_risk_risk', { name: args.name, category: args.category, ...(args.description ? { description: args.description } : {}), ...(args.impact ? { impact: String(args.impact) } : {}), ...(args.likelihood ? { likelihood: String(args.likelihood) } : {}), ...(args.owner ? { owner: args.owner } : {}) });
      return { action: 'created', ...result };
    }
    case 'list_compliance_policies': {
      const parts: string[] = [];
      if (args.state) parts.push(`state=${args.state}`);
      return await client.queryRecords({ table: 'sn_compliance_policy', query: parts.join('^') || '', limit: args.limit ?? 25 });
    }
    case 'get_compliance_assessment': {
      if (!args.policy_sys_id && !args.control_sys_id) throw new ServiceNowError('policy_sys_id or control_sys_id is required', 'INVALID_REQUEST');
      const query = args.policy_sys_id ? `policy=${args.policy_sys_id}` : `control=${args.control_sys_id}`;
      return await client.queryRecords({ table: 'sn_compliance_assessment', query, limit: 50 });
    }
    case 'list_audit_results': {
      // GRC Audit Management stores audit work as engagements (sn_audit_engagement, a planned task).
      const parts: string[] = [];
      if (args.state) parts.push(`state=${args.state}`);
      const resp = await withPlugin('GRC: Audit Management (com.sn_audit)', () => client.queryRecords({
        table: 'sn_audit_engagement',
        query: parts.join('^') || '',
        limit: args.limit ?? 25,
        orderBy: '-sys_created_on',
      }));
      return args.severity
        ? { ...resp, note: 'Audit engagements have no severity field, so the severity filter was not applied.' }
        : resp;
    }
    default:
      return null;
  }
}

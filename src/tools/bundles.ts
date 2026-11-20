/**
 * Bundled outcome tools — one call that answers a whole question, instead of the AI making several
 * query_records round trips (the read-query-reason-retry loop). These reduce tokens and latency by
 * assembling related context server-side in the gateway. Each sub-lookup is best-effort: a failure in
 * one section degrades gracefully rather than failing the whole call.
 */
import type { ServiceNowClient } from '../servicenow/client.js';
import { ServiceNowError } from '../utils/errors.js';

export function getBundleToolDefinitions() {
  return [
    {
      name: 'investigate_incident',
      description: 'One-call incident investigation. Returns the incident, similar recent incidents, the affected CI with its relationships, and related knowledge articles, so the assistant does not have to chain several queries. Read-only.',
      inputSchema: {
        type: 'object',
        properties: {
          number_or_sysid: { type: 'string', description: 'Incident number (INC...) or sys_id' },
        },
        required: ['number_or_sysid'],
      },
    },
    {
      name: 'change_readiness',
      description: 'One-call change readiness check. Returns the change request, its conflict status, approval state, affected CIs, and other active changes that overlap the same CI. Read-only.',
      inputSchema: {
        type: 'object',
        properties: { number_or_sysid: { type: 'string', description: 'Change number (CHG...) or sys_id' } },
        required: ['number_or_sysid'],
      },
    },
    {
      name: 'service_health',
      description: 'One-call service health snapshot. Returns a business service or CI, its open incidents, related CIs, and recent changes. Read-only.',
      inputSchema: {
        type: 'object',
        properties: { name_or_sysid: { type: 'string', description: 'Service or CI name, or sys_id' } },
        required: ['name_or_sysid'],
      },
    },
  ];
}

export async function executeBundleToolCall(
  client: ServiceNowClient,
  name: string,
  args: Record<string, any>,
): Promise<any> {
  switch (name) {
    case 'investigate_incident': {
      if (!args.number_or_sysid) throw new ServiceNowError('number_or_sysid is required', 'INVALID_REQUEST');

      // 1. Resolve the incident.
      let incident: any;
      if (/^[0-9a-f]{32}$/i.test(args.number_or_sysid)) {
        incident = await client.getRecord('incident', args.number_or_sysid, undefined, 'all');
      } else {
        const r = await client.queryRecords({ table: 'incident', query: `number=${args.number_or_sysid}^ORsys_id=${args.number_or_sysid}`, limit: 1, displayValue: 'all' });
        if (r.count === 0) throw new ServiceNowError(`Incident not found: ${args.number_or_sysid}`, 'NOT_FOUND');
        incident = r.records[0];
      }
      const val = (f: string): string => { const v = incident?.[f]; return v && typeof v === 'object' ? String(v.value ?? v.display_value ?? '') : String(v ?? ''); };
      const sysId = val('sys_id');
      const category = val('category');
      const ciSysId = val('cmdb_ci');

      const result: Record<string, any> = { incident };

      // 2. Similar recent incidents (same category, excluding this one, newest first).
      try {
        const q = (category ? `category=${category}^` : '') + `sys_id!=${sysId}^ORDERBYDESCsys_created_on`;
        const sim = await client.queryRecords({ table: 'incident', query: q, limit: 5, fields: 'number,short_description,state,priority,sys_created_on', displayValue: 'all' });
        result.similar_incidents = sim.records;
      } catch { result.similar_incidents = []; }

      // 3. Affected CI + its direct relationships.
      if (ciSysId) {
        try {
          const ci = await client.getRecord('cmdb_ci', ciSysId, 'sys_id,name,sys_class_name,operational_status');
          let rels: any[] = [];
          try {
            const rr = await client.queryRecords({ table: 'cmdb_rel_ci', query: `parent=${ciSysId}^ORchild=${ciSysId}`, limit: 20, fields: 'type,parent,child', displayValue: 'all' });
            rels = rr.records || [];
          } catch { /* no rel access */ }
          result.affected_ci = { ci, relationship_count: rels.length, relationships: rels };
        } catch { result.affected_ci = null; }
      } else {
        result.affected_ci = null;
      }

      // 4. Related published knowledge (match on the first couple of significant words).
      try {
        const kw = val('short_description').split(/\s+/).filter(w => w.length > 3).slice(0, 2).join(' ');
        if (kw) {
          const kb = await client.queryRecords({ table: 'kb_knowledge', query: `workflow_state=published^short_descriptionLIKE${kw}`, limit: 3, fields: 'number,short_description,sys_id' });
          result.related_knowledge = kb.records;
        } else { result.related_knowledge = []; }
      } catch { result.related_knowledge = []; }

      result.summary = `Investigated ${val('number') || sysId}: ${result.similar_incidents.length} similar incident(s), ${result.affected_ci ? `affected CI with ${result.affected_ci.relationship_count} relationship(s)` : 'no linked CI'}, ${result.related_knowledge.length} related article(s). Assembled in one call.`;
      return result;
    }

    case 'change_readiness': {
      if (!args.number_or_sysid) throw new ServiceNowError('number_or_sysid is required', 'INVALID_REQUEST');
      let change: any;
      if (/^[0-9a-f]{32}$/i.test(args.number_or_sysid)) {
        change = await client.getRecord('change_request', args.number_or_sysid, undefined, 'all');
      } else {
        const r = await client.queryRecords({ table: 'change_request', query: `number=${args.number_or_sysid}^ORsys_id=${args.number_or_sysid}`, limit: 1, displayValue: 'all' });
        if (r.count === 0) throw new ServiceNowError(`Change not found: ${args.number_or_sysid}`, 'NOT_FOUND');
        change = r.records[0];
      }
      const cval = (f: string): string => { const v = change?.[f]; return v && typeof v === 'object' ? String(v.value ?? v.display_value ?? '') : String(v ?? ''); };
      const cdisp = (f: string): string => { const v = change?.[f]; return v && typeof v === 'object' ? String(v.display_value ?? v.value ?? '') : String(v ?? ''); };
      const sysId = cval('sys_id');
      const ci = cval('cmdb_ci');
      const out: Record<string, any> = { change, conflict_status: cdisp('conflict_status') };
      try { const ap = await client.queryRecords({ table: 'sysapproval_approver', query: `sysapproval=${sysId}`, limit: 20, fields: 'approver,state,sys_created_on', displayValue: 'all' }); out.approvals = ap.records; } catch { out.approvals = []; }
      try { const tc = await client.queryRecords({ table: 'task_ci', query: `task=${sysId}`, limit: 50, fields: 'ci_item', displayValue: 'all' }); out.affected_cis = tc.records; } catch { out.affected_cis = []; }
      if (ci) {
        try { const pc = await client.queryRecords({ table: 'change_request', query: `cmdb_ci=${ci}^sys_id!=${sysId}^active=true^ORDERBYDESCstart_date`, limit: 5, fields: 'number,short_description,state,start_date,end_date', displayValue: 'all' }); out.potential_conflicts = pc.records; } catch { out.potential_conflicts = []; }
      } else { out.potential_conflicts = []; }
      out.summary = `Change ${cval('number') || sysId}: conflict ${out.conflict_status || 'n/a'}, ${out.approvals.length} approval(s), ${out.affected_cis.length} affected CI(s), ${out.potential_conflicts.length} overlapping change(s). One call.`;
      return out;
    }

    case 'service_health': {
      if (!args.name_or_sysid) throw new ServiceNowError('name_or_sysid is required', 'INVALID_REQUEST');
      let service: any;
      if (/^[0-9a-f]{32}$/i.test(args.name_or_sysid)) {
        service = await client.getRecord('cmdb_ci', args.name_or_sysid, 'sys_id,name,sys_class_name,operational_status');
      } else {
        const r = await client.queryRecords({ table: 'cmdb_ci', query: `name=${args.name_or_sysid}`, limit: 1, fields: 'sys_id,name,sys_class_name,operational_status' });
        if (r.count === 0) {
          // No exact match: try a partial name and offer the candidates instead of a bare "not found".
          const like = await client.queryRecords({ table: 'cmdb_ci', query: `nameLIKE${args.name_or_sysid}^ORDERBYname`, limit: 10, fields: 'sys_id,name,sys_class_name' });
          if (like.records.length === 1) service = like.records[0];
          else if (like.records.length > 1) {
            return {
              found: false,
              candidates: like.records.map((c: any) => client.attachRecordUrl('cmdb_ci', c)),
              summary: `No CI is named exactly "${args.name_or_sysid}". ${like.records.length} CI(s) contain it; call again with one of their names or sys_ids.`,
            };
          } else throw new ServiceNowError(`Service or CI not found: ${args.name_or_sysid}`, 'NOT_FOUND');
        } else service = r.records[0];
      }
      const sid = service?.sys_id && typeof service.sys_id === 'object' ? service.sys_id.value : service?.sys_id;
      const sname = service?.name && typeof service.name === 'object' ? service.name.value : service?.name;
      const out: Record<string, any> = { service };
      try { const inc = await client.queryRecords({ table: 'incident', query: `cmdb_ci=${sid}^active=true^ORbusiness_service=${sid}^active=true`, limit: 10, fields: 'number,short_description,priority,state', displayValue: 'all' }); out.open_incidents = inc.records; out.open_incident_count = inc.count; } catch { out.open_incidents = []; out.open_incident_count = 0; }
      try { const rel = await client.queryRecords({ table: 'cmdb_rel_ci', query: `parent=${sid}^ORchild=${sid}`, limit: 20, fields: 'type,parent,child', displayValue: 'all' }); out.related_cis = rel.records; out.related_ci_count = rel.count; } catch { out.related_cis = []; out.related_ci_count = 0; }
      try { const chg = await client.queryRecords({ table: 'change_request', query: `cmdb_ci=${sid}^ORDERBYDESCsys_created_on`, limit: 5, fields: 'number,short_description,state,start_date', displayValue: 'all' }); out.recent_changes = chg.records; } catch { out.recent_changes = []; }
      out.summary = `Service ${sname || sid}: ${out.open_incident_count} open incident(s), ${out.related_ci_count} related CI(s), ${out.recent_changes.length} recent change(s). One call.`;
      return out;
    }

    default:
      return null;
  }
}

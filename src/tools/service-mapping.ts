/**
 * Service Mapping / application-service tools — parity with ServiceNow's first-party
 * CMDB (Service Mapping) MCP server. Read: Tier 0. Create: Tier 1 (WRITE_ENABLED=true).
 *
 * Tables:
 *   cmdb_ci_service_auto — discovered application services
 *   svc_ci_assoc         — CI ↔ application-service membership
 *   cmdb_rel_ci          — CI relationships
 *   cmdb_class_info      — CMDB class metadata (for class suggestion)
 */
import type { ServiceNowClient } from '../servicenow/client.js';
import { ServiceNowError } from '../utils/errors.js';

export function getServiceMappingToolDefinitions() {
  return [
    {
      name: 'list_application_services',
      description: 'List discovered application services (cmdb_ci_service_auto), optionally by name or operational status. Parity with ServiceNow get_all_application_service_names',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search application services by name' },
          operational_status: { type: 'string', description: 'Filter by operational_status value' },
          limit: { type: 'number', description: 'Max records (default 50)' },
        },
        required: [],
      },
    },
    {
      name: 'cmdb_services_for_ci',
      description: 'Reverse lookup: which application services contain a given CI/server (svc_ci_assoc). Parity with ServiceNow get_all_application_services_for_a_server',
      inputSchema: {
        type: 'object',
        properties: {
          ci: { type: 'string', description: 'sys_id of the CI/server' },
          ci_name: { type: 'string', description: 'CI name if sys_id not known' },
          limit: { type: 'number', description: 'Max records (default 50)' },
        },
        required: [],
      },
    },
    {
      name: 'cmdb_find_unmapped_cis',
      description: 'Find operational CIs that have relationships but belong to no application service (mapping gaps). Parity with ServiceNow get_unmapped_topology',
      inputSchema: {
        type: 'object',
        properties: {
          ci_class: { type: 'string', description: 'Restrict to a CI class/table (e.g. cmdb_ci_server)' },
          limit: { type: 'number', description: 'Max CIs to scan/return (default 100)' },
        },
        required: [],
      },
    },
    {
      name: 'suggest_ci_class',
      description: 'Suggest the correct CMDB CI class for a keyword before creating a CI (cmdb_class_info). Parity with ServiceNow Get_SimilarCI_Classes',
      inputSchema: {
        type: 'object',
        properties: {
          keyword: { type: 'string', description: 'Device/technology keyword, e.g. "linux server", "load balancer"' },
          limit: { type: 'number', description: 'Max classes to return (default 10)' },
        },
        required: ['keyword'],
      },
    },
  ];
}

export async function executeServiceMappingToolCall(
  client: ServiceNowClient,
  name: string,
  args: Record<string, any>,
): Promise<any> {
  switch (name) {
    case 'list_application_services': {
      const parts: string[] = [];
      if (args.operational_status) parts.push(`operational_status=${args.operational_status}`);
      if (args.query) parts.push(`nameCONTAINS${args.query}`);
      return await client.queryRecords({
        table: 'cmdb_ci_service_auto',
        query: parts.join('^'),
        fields: 'name,sys_id,operational_status,service_classification,busines_criticality,short_description',
        limit: args.limit ?? 50,
      });
    }
    case 'cmdb_services_for_ci': {
      let ciId = args.ci;
      if (!ciId && args.ci_name) {
        const r = await client.queryRecords({ table: 'cmdb_ci', query: `name=${args.ci_name}`, limit: 1 });
        if (r.count === 0) throw new ServiceNowError(`CI not found: ${args.ci_name}`, 'NOT_FOUND');
        ciId = (r.records[0] as any).sys_id;
      }
      if (!ciId) throw new ServiceNowError('ci or ci_name is required', 'INVALID_REQUEST');
      const assoc = await client.queryRecords({
        table: 'svc_ci_assoc',
        query: `ci_id=${ciId}`,
        fields: 'cmdb_ci_service,cmdb_ci_service.name,ci_id,ci_id.name',
        limit: args.limit ?? 50,
      });
      const services: any[] = (assoc as any).records.map((r: any) => ({ ...r, via: 'service map (svc_ci_assoc)' }));
      // Many CMDBs model services with plain relationships rather than service maps: walk up from the CI
      // (parents depend on children) and keep the service CIs found within three hops.
      const ref = (v: any) => (v && typeof v === 'object' ? v.value : v) as string;
      const known = new Set(services.map((r) => ref(r.cmdb_ci_service)));
      let frontier = [String(ciId)];
      const visited = new Set(frontier);
      for (let hop = 1; hop <= 3 && frontier.length; hop++) {
        const rels = await client.queryRecords({
          table: 'cmdb_rel_ci',
          query: `childIN${frontier.join(',')}`,
          fields: 'parent,parent.name,parent.sys_class_name',
          limit: 200,
        }).catch(() => ({ records: [] as any[] }));
        frontier = [];
        for (const r of (rels as any).records) {
          const id = ref(r.parent);
          if (!id || visited.has(id)) continue;
          visited.add(id); frontier.push(id);
          const cls = String(ref(r['parent.sys_class_name']) || '');
          if ((/^cmdb_ci_service/.test(cls) || cls === 'service_offering') && !known.has(id)) {
            known.add(id);
            services.push({ cmdb_ci_service: id, 'cmdb_ci_service.name': ref(r['parent.name']), class: cls, via: `CI relationships (${hop} hop${hop > 1 ? 's' : ''})` });
          }
        }
      }
      return { ci: ciId, services, count: services.length, note: 'Services this CI belongs to (service map) or that depend on it through CI relationships.' };
    }
    case 'cmdb_find_unmapped_cis': {
      const limit = args.limit ?? 100;
      const ciQuery = ['operational_status=1'];
      if (args.ci_class) ciQuery.push(`sys_class_name=${args.ci_class}`);
      const cis = await client.queryRecords({ table: 'cmdb_ci', query: ciQuery.join('^'), fields: 'sys_id,name,sys_class_name', limit });
      const ciIds = (cis.records as any[]).map((c) => c.sys_id);
      if (ciIds.length === 0) return { unmapped: [], count: 0, note: 'No operational CIs matched.' };
      // Which of these CIs are already members of an application service?
      const assoc = await client.queryRecords({ table: 'svc_ci_assoc', query: `ci_idIN${ciIds.join(',')}`, fields: 'ci_id', limit: 4000 }).catch(() => ({ records: [] }));
      const mapped = new Set((assoc as any).records.map((r: any) => (r.ci_id && typeof r.ci_id === 'object' ? r.ci_id.value : r.ci_id)));
      // Keep only CIs that have at least one relationship (i.e. real topology, just unmapped).
      const rel = await client.queryRecords({ table: 'cmdb_rel_ci', query: `parentIN${ciIds.join(',')}^ORchildIN${ciIds.join(',')}`, fields: 'parent,child', limit: 4000 }).catch(() => ({ records: [] }));
      const related = new Set<string>();
      for (const r of (rel as any).records) {
        for (const k of ['parent', 'child']) { const v = r[k] && typeof r[k] === 'object' ? r[k].value : r[k]; if (v) related.add(v); }
      }
      const unmapped = (cis.records as any[]).filter((c) => !mapped.has(c.sys_id) && related.has(c.sys_id));
      return {
        scanned: ciIds.length,
        count: unmapped.length,
        unmapped,
        note: 'Operational CIs with relationships (cmdb_rel_ci) but no application-service membership (svc_ci_assoc). Approximated via Table API; ServiceNow also factors observed TCP traffic.',
      };
    }
    case 'suggest_ci_class': {
      if (!args.keyword) throw new ServiceNowError('keyword is required', 'INVALID_REQUEST');
      const kw = String(args.keyword).trim();
      let resp = await client.queryRecords({
        table: 'cmdb_class_info',
        query: `labelLIKE${kw}^ORnameLIKE${kw}`,
        fields: 'name,label,super_class,sys_id',
        limit: args.limit ?? 10,
      }).catch(() => null as any);
      if (!resp || resp.count === 0) {
        // Fall back to the dictionary of tables extending cmdb_ci.
        resp = await client.queryRecords({
          table: 'sys_db_object',
          query: `nameSTARTSWITHcmdb_ci^labelLIKE${kw}`,
          fields: 'name,label,super_class,sys_id',
          limit: args.limit ?? 10,
        });
      }
      return { keyword: kw, suggested_classes: (resp as any).records, count: (resp as any).count, note: 'Use the class "name" as the table for create_record. Check required attributes with get_table_schema.' };
    }
    default:
      return null;
  }
}

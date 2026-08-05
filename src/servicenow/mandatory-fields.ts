/**
 * Field-level mandatory checking, matched to what the REST/Table API actually enforces.
 *
 * Verified against a live instance: the Table API does NOT enforce dictionary `mandatory`, and it
 * never evaluates UI policies. Both are UI-layer only (a record created via REST saves with those
 * fields blank). The ONLY server-side mandatory enforcement the API honours is a Data Policy, which
 * runs as a business rule on insert/update. So a Data Policy is the single source of truth here.
 *
 * If an org wants a field required for integrations, the supported way is a Data Policy, and this
 * check picks it up automatically. Where there is no Data Policy, the API accepts the record, and so
 * do we, rather than inventing a requirement ServiceNow itself would not apply.
 */

interface MinimalClient {
  queryRecords(params: { table: string; query?: string; fields?: string; limit?: number }): Promise<{ records: Record<string, any>[] }>;
  readonly instanceHost: string;
}

export interface RequiredField { element: string; label: string; }

interface CacheEntry { fields: RequiredField[]; at: number; }
const cache = new Map<string, CacheEntry>();
const TTL_MS = 30 * 60 * 1000;

const SYSTEM_FIELDS = new Set([
  'sys_id', 'sys_created_on', 'sys_created_by', 'sys_updated_on', 'sys_updated_by',
  'sys_mod_count', 'sys_tags', 'sys_domain', 'sys_domain_path', 'sys_class_name',
]);

/** Walk the super_class chain so an inherited data policy (e.g. on task) can apply to incident. */
async function tableHierarchy(client: MinimalClient, table: string): Promise<string[]> {
  const chain: string[] = [];
  let t: string | undefined = table;
  for (let i = 0; i < 8 && t; i++) {
    if (chain.includes(t)) break;
    chain.push(t);
    const r = await client.queryRecords({ table: 'sys_db_object', query: `name=${t}`, fields: 'name,super_class.name', limit: 1 });
    t = (r.records[0]?.['super_class.name'] as string) || undefined;
  }
  return chain;
}

async function compute(client: MinimalClient, table: string): Promise<RequiredField[]> {
  const chain = await tableHierarchy(client, table);
  const names = chain.join(',');
  const required = new Map<string, string>(); // field -> label

  // Data policies are the only server-side mandatory enforcement the Table API honours.
  const policies = await client.queryRecords({
    table: 'sys_data_policy',
    query: `model_tableIN${names}^active=true`,
    fields: 'sys_id,model_table,inherit', limit: 50,
  });
  for (const p of policies.records) {
    // A policy on a parent table applies to this table only if it is marked to inherit.
    if (p.model_table !== table && String(p.inherit).toLowerCase() !== 'true') continue;
    const rules = await client.queryRecords({
      table: 'sys_data_policy_rule',
      query: `sys_data_policy=${p.sys_id}^mandatory=true^disabled=false`,
      fields: 'field', limit: 200,
    });
    for (const r of rules.records) {
      if (r.field && !SYSTEM_FIELDS.has(r.field)) required.set(r.field, r.field);
    }
  }

  // Enrich with human labels from the dictionary (best-effort; does not affect what's required).
  if (required.size) {
    try {
      const dict = await client.queryRecords({
        table: 'sys_dictionary',
        query: `nameIN${names}^elementIN${[...required.keys()].join(',')}`,
        fields: 'element,column_label', limit: 200,
      });
      for (const r of dict.records) if (r.element && r.column_label && required.has(r.element)) required.set(r.element, r.column_label);
    } catch { /* labels are optional */ }
  }

  return [...required].map(([element, label]) => ({ element, label }));
}

/** Required fields for a table, cached per instance + table. */
export async function getRequiredFields(client: MinimalClient, table: string): Promise<RequiredField[]> {
  const key = `${client.instanceHost}::${table}`;
  const c = cache.get(key);
  if (c && Date.now() - c.at < TTL_MS) return c.fields;
  const fields = await compute(client, table);
  cache.set(key, { fields, at: Date.now() });
  return fields;
}

/** Required fields that are missing (empty/absent) from the supplied data. */
export async function missingRequiredFields(client: MinimalClient, table: string, data: Record<string, any>): Promise<RequiredField[]> {
  if (process.env.NOWAIKIT_SKIP_MANDATORY_CHECK === 'true') return [];
  let req: RequiredField[];
  try { req = await getRequiredFields(client, table); }
  catch { return []; } // never block a create because the lookup itself failed
  const d = data || {};
  return req.filter(f => {
    const v = d[f.element];
    return v === undefined || v === null || String(v).trim() === '';
  });
}

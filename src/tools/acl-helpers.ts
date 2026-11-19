/**
 * Access control helpers shared by the ACL tools (script.ts) and the ACL skills.
 *
 * - Deny-unless ACLs: sys_security_acl.decision_type = deny. They are evaluated before allow
 *   ACLs and never grant access on their own.
 * - Role checks: an ACL role row (sys_security_acl_role) that points at a role that does not exist
 *   grants nothing today and, from Brazil (glide.security.acl_with_invalid_roles_strict_deny),
 *   denies everyone. create_acl and update_acl refuse unknown roles before writing.
 */
import type { ServiceNowClient } from '../servicenow/client.js';
import { ServiceNowError } from '../utils/errors.js';

export const DECISION_TYPES = ['allow', 'deny'] as const;
export const STRICT_DENY_PROPERTY = 'glide.security.acl_with_invalid_roles_strict_deny';

/** ACL types for AI assets that Brazil makes deny-by-default. */
export const AGENTIC_ACL_TYPES = ['gen_ai_agent', 'gen_ai_workflow', 'gen_ai_skill', 'flow', 'flow_action'];

const val = (v: any) => (v && typeof v === 'object' && 'value' in v ? v.value : v);

function errText(err: unknown): string {
  return (err instanceof Error ? err.message : String(err)).split('\n')[0]!;
}

export function parseRoleList(roles: unknown): string[] {
  const list = Array.isArray(roles) ? roles : String(roles ?? '').split(',');
  return [...new Set(list.map((r) => String(r).trim()).filter(Boolean))];
}

export function normaliseDecisionType(v: unknown): 'allow' | 'deny' | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  const s = String(v).trim().toLowerCase().replace(/[\s_-]+/g, '');
  if (s === 'allow' || s === 'allowif') return 'allow';
  if (s === 'deny' || s === 'denyunless') return 'deny';
  throw new ServiceNowError('decision_type must be "allow" (Allow If) or "deny" (Deny Unless)', 'INVALID_REQUEST');
}

/** Resolve role names to sys_ids. Returns the roles that were found and the names that do not exist. */
export async function resolveRoles(client: ServiceNowClient, names: string[]): Promise<{ found: Map<string, string>; missing: string[] }> {
  const found = new Map<string, string>();
  if (!names.length) return { found, missing: [] };
  for (const n of names) {
    if (n.includes('^') || n.includes(',')) throw new ServiceNowError(`Invalid role name "${n}"`, 'INVALID_REQUEST');
  }
  const r = await client.queryRecords({ table: 'sys_user_role', query: `nameIN${names.join(',')}`, fields: 'sys_id,name', limit: names.length + 5 });
  for (const rec of r.records as any[]) found.set(String(rec.name), String(val(rec.sys_id)));
  return { found, missing: names.filter((n) => !found.has(n)) };
}

/** True when sys_security_acl has the decision_type column (Washington DC and later). */
export async function supportsDecisionType(client: ServiceNowClient): Promise<boolean> {
  try {
    const r = await client.queryRecords({ table: 'sys_dictionary', query: 'name=sys_security_acl^element=decision_type', fields: 'element', limit: 1 });
    return r.records.length > 0;
  } catch {
    return true; // Cannot tell: let ServiceNow decide.
  }
}

/** Resolve a security attribute by sys_id or name. */
export async function resolveSecurityAttribute(client: ServiceNowClient, ref: string): Promise<string> {
  if (/^[0-9a-f]{32}$/i.test(ref)) return ref;
  if (ref.includes('^')) throw new ServiceNowError('security_attribute must not contain "^"', 'INVALID_REQUEST');
  const r = await client.queryRecords({ table: 'sys_security_attribute', query: `name=${ref}^ORlabel=${ref}`, fields: 'sys_id,name', limit: 2 });
  const hit = r.records[0] as any;
  if (!hit) throw new ServiceNowError(`Security attribute "${ref}" not found (sys_security_attribute)`, 'NOT_FOUND');
  return String(val(hit.sys_id));
}

/** Current role links of an ACL. */
export async function aclRoleLinks(client: ServiceNowClient, aclId: string): Promise<Array<{ link_id: string; role_id: string; name: string | null; exists: boolean }>> {
  const r = await client.queryRecords({
    table: 'sys_security_acl_role',
    query: `sys_security_acl=${aclId}`,
    fields: 'sys_id,sys_user_role,sys_user_role.name',
    limit: 200,
  });
  return (r.records as any[]).map((x) => {
    const name = x['sys_user_role.name'] ? String(val(x['sys_user_role.name'])) : null;
    return { link_id: String(val(x.sys_id)), role_id: String(val(x.sys_user_role) ?? ''), name, exists: !!name };
  });
}

export interface AclPostureOptions {
  table?: string;
  limit?: number;
}

async function count(client: ServiceNowClient, table: string, query: string): Promise<number | string> {
  try {
    const rows = await client.runStats(table, { query });
    return Number(rows[0]?.stats?.count ?? 0);
  } catch (err) {
    return /invalid table/i.test(errText(err)) ? 'not available' : 'no access';
  }
}

async function group(client: ServiceNowClient, table: string, field: string, query: string): Promise<Array<{ value: string; count: number }> | string> {
  try {
    const rows = await client.runStats(table, { query, groupBy: field });
    return rows
      .map((r: any) => ({ value: String(r.groupby_fields?.[0]?.value ?? '') || '(empty)', count: Number(r.stats?.count ?? 0) }))
      .sort((a, b) => b.count - a.count);
  } catch (err) {
    return errText(err);
  }
}

/**
 * Access control posture: allow vs deny-unless ACLs, ACLs with roles that do not exist (Brazil strict
 * deny), security attributes, agentic ACL types and the strict deny property. Read-only.
 */
export async function aclPosture(client: ServiceNowClient, opts: AclPostureOptions = {}): Promise<Record<string, any>> {
  const limit = Math.min(Math.max(Number(opts.limit) || 25, 1), 200);
  const table = opts.table ? String(opts.table).trim() : '';
  if (table && !/^[a-z0-9_]+$/i.test(table)) throw new ServiceNowError('table must be a table name', 'INVALID_REQUEST');
  const scope = table ? `name=${table}^ORnameSTARTSWITH${table}.` : '';
  const and = (q: string) => [scope, q].filter(Boolean).join('^');
  const roleScope = table ? `sys_security_acl.name=${table}^ORsys_security_acl.nameSTARTSWITH${table}.` : '';
  const roleAnd = (q: string) => [roleScope, q].filter(Boolean).join('^');
  const url = (t: string, id: string) => (typeof (client as any).recordUrl === 'function' ? client.recordUrl(t, id) : undefined);

  const [active, inactive, byDecision, byOperation, byType, attrs, withAttr, missingAll, missingActive, missingRows, denyRows, agentic, props] = await Promise.all([
    count(client, 'sys_security_acl', and('active=true')),
    count(client, 'sys_security_acl', and('active=false')),
    group(client, 'sys_security_acl', 'decision_type', and('active=true')),
    group(client, 'sys_security_acl', 'operation', and('active=true')),
    group(client, 'sys_security_acl', 'type', and('active=true')),
    count(client, 'sys_security_attribute', ''),
    count(client, 'sys_security_acl', and('active=true^security_attributeISNOTEMPTY')),
    count(client, 'sys_security_acl_role', roleAnd('sys_user_role.nameISEMPTY')),
    count(client, 'sys_security_acl_role', roleAnd('sys_user_role.nameISEMPTY^sys_security_acl.active=true')),
    client.queryRecords({
      table: 'sys_security_acl_role',
      query: roleAnd('sys_user_role.nameISEMPTY^sys_security_acl.active=true^ORDERBYsys_security_acl.name'),
      fields: 'sys_security_acl,sys_security_acl.name,sys_security_acl.operation,sys_security_acl.type,sys_security_acl.decision_type,sys_user_role',
      limit,
    }).catch((err) => ({ count: 0, records: [] as any[], note: errText(err) })),
    client.queryRecords({
      table: 'sys_security_acl',
      query: and('active=true^decision_type=deny^ORDERBYname'),
      fields: 'sys_id,name,operation,type,condition,advanced,admin_overrides,security_attribute,sys_updated_on',
      limit,
    }).catch((err) => ({ count: 0, records: [] as any[], note: errText(err) })),
    group(client, 'sys_security_acl', 'type', and(`active=true^typeIN${AGENTIC_ACL_TYPES.join(',')}`)),
    client.queryRecords({ table: 'sys_properties', query: `name=${STRICT_DENY_PROPERTY}`, fields: 'name,value', limit: 1 }).catch(() => ({ count: 0, records: [] as any[] })),
  ]);

  const missing = (missingRows.records as any[]).map((r) => {
    const aclId = String(val(r.sys_security_acl) ?? '');
    return {
      acl: String(val(r['sys_security_acl.name']) ?? ''),
      operation: String(val(r['sys_security_acl.operation']) ?? ''),
      type: String(val(r['sys_security_acl.type']) ?? ''),
      decision_type: String(val(r['sys_security_acl.decision_type']) ?? '') || 'allow',
      missing_role: String(val(r.sys_user_role) ?? '').trim(),
      ...(/^[0-9a-f]{32}$/i.test(String(val(r.sys_user_role) ?? '').trim()) ? { missing_role_note: 'sys_id of a role that was deleted; its name is no longer on the instance' } : {}),
      acl_sys_id: aclId,
      record_url: aclId ? url('sys_security_acl', aclId) : undefined,
    };
  });
  const deny = (denyRows.records as any[]).map((r) => {
    const id = String(val(r.sys_id));
    return {
      name: String(val(r.name) ?? ''),
      operation: String(val(r.operation) ?? ''),
      type: String(val(r.type) ?? ''),
      has_condition: !!String(val(r.condition) ?? '').trim(),
      scripted: String(val(r.advanced)) === 'true',
      security_attribute: String(val(r.security_attribute) ?? '') || null,
      sys_id: id,
      record_url: url('sys_security_acl', id),
    };
  });
  const prop = (props.records as any[])[0];
  const strict = prop ? String(prop.value) : null;
  const denyCount = Array.isArray(byDecision) ? byDecision.find((d) => d.value === 'deny')?.count ?? 0 : null;
  const notes = [(missingRows as any).note, (denyRows as any).note].filter(Boolean);

  return {
    scope: table || 'instance',
    summary: {
      active_acls: active,
      inactive_acls: inactive,
      deny_unless_acls: denyCount,
      acls_using_security_attributes: withAttr,
      security_attributes: attrs,
      acl_role_links_to_missing_roles: missingAll,
      active_acl_role_links_to_missing_roles: missingActive,
    },
    by_decision_type: byDecision,
    by_operation: Array.isArray(byOperation) ? byOperation.slice(0, 15) : byOperation,
    by_type: Array.isArray(byType) ? byType.slice(0, 15) : byType,
    agentic_acl_types: agentic,
    strict_deny_for_missing_roles: {
      property: STRICT_DENY_PROPERTY,
      value: strict,
      meaning: strict === 'true'
        ? 'ACLs that reference a missing role deny everyone on this instance.'
        : strict === null
          ? 'Property not set. From Brazil, ACLs that reference a missing role deny everyone; on older releases the missing role grants nothing.'
          : 'Strict deny is off: a missing role grants nothing, the ACL still evaluates its other rules.',
    },
    acls_with_missing_roles: missing,
    deny_unless_sample: deny,
    ...(notes.length ? { notes } : {}),
  };
}

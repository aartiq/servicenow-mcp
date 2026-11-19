/**
 * ServiceNow release awareness: which family an instance runs (from glide.buildtag.last), which
 * family comes next, and the known breaking or behaviour changes for the current and next family.
 *
 * The change lists come from ServiceNow's Australia and Brazil release notes (API, core platform,
 * access management, authentication, Platform Analytics, Next Experience). Keep each entry short
 * and factual; the scan-upgrade skill and get_release_info show them as checks to run.
 */
import type { ServiceNowClient } from './client.js';

/** Release families in order. Washington DC is "washingtondc" in the build tag. */
export const RELEASE_FAMILIES = [
  'quebec', 'rome', 'sandiego', 'tokyo', 'utah', 'vancouver', 'washingtondc',
  'xanadu', 'yokohama', 'zurich', 'australia', 'brazil',
] as const;

export type ReleaseFamily = (typeof RELEASE_FAMILIES)[number];

const LABELS: Record<string, string> = {
  sandiego: 'San Diego',
  washingtondc: 'Washington DC',
};

/** As of 2026-11-19: Australia is the current GA family, Brazil is in early availability. */
export const CURRENT_GA_FAMILY: ReleaseFamily = 'australia';
export const EARLY_AVAILABILITY_FAMILY: ReleaseFamily = 'brazil';

export interface ReleaseChange {
  area: string;
  change: string;
  /** What to look for on the instance before or after upgrading. */
  check: string;
}

/** Known changes that can break or change behaviour when an instance moves INTO the family. */
export const KNOWN_RELEASE_CHANGES: Partial<Record<ReleaseFamily, ReleaseChange[]>> = {
  australia: [
    { area: 'REST API', change: 'POST /now/attachment/file returns 403 (not 401) when an ACL denies the upload', check: 'Integrations that treat 401 as "re-authenticate" and anything else as fatal' },
    { area: 'Scripting', change: 'GlideElementDynamicAttribute is removed', check: 'Scripts that reference GlideElementDynamicAttribute' },
    { area: 'Forms', change: 'g_form.setValue and clearValue do nothing on strict read-only fields', check: 'Client scripts and UI policies that set values on fields marked read-only' },
    { area: 'Party Management and Service Order', change: 'Some field names were renamed', check: 'Scripts, reports and integrations that read Party Management or Service Order fields' },
    { area: 'UI', change: 'UI11 and UI15 are deprecated; Core UI homepages are legacy', check: 'Users and homepages still on UI15 or UI11' },
    { area: 'Analytics', change: 'Legacy Performance Analytics (Core UI) dashboards are no longer supported; new Core UI content creation ends with 2027', check: 'pa_dashboards still in use and not yet moved to Platform Analytics (par_dashboard)' },
  ],
  brazil: [
    { area: 'Scripting', change: 'GlideRecord.getRefRecord() enforces cross-scope access rules', check: 'Scoped scripts that call getRefRecord() on records from other scopes' },
    { area: 'Scripting', change: 'glide.sys.fencing.restricted_caller_access.invalidation_mode defaults to SCRIPT_ENGINE from Patch 2', check: 'Restricted caller access records and cross-scope calls that relied on the old invalidation' },
    { area: 'UI', change: 'TinyMCE is upgraded to 8.3', check: 'HTML field customisations, TinyMCE plugins and toolbar properties' },
    { area: 'Authentication', change: 'Basic auth is being restricted through an allowlist (tracking and enforce modes) ahead of deprecation', check: 'Integration users that call the API with Basic auth and lack snc_basic_auth_api_access or web service access only' },
    { area: 'Access control', change: 'ACLs that reference a role that does not exist deny everyone (glide.security.acl_with_invalid_roles_strict_deny)', check: 'sys_security_acl_role rows whose role is missing' },
    { area: 'AI', change: 'Access is deny-by-default for AI agent, agentic workflow, Now Assist skill, flow and flow action records', check: 'AI agents, workflows, skills and flows without an execute ACL for the people who use them' },
  ],
};

export interface ParsedBuildTag {
  raw: string;
  family?: ReleaseFamily;
  family_label?: string;
  build_date?: string;
  patch?: number;
  hotfix?: number;
}

export function familyLabel(family: string): string {
  return LABELS[family] ?? family.charAt(0).toUpperCase() + family.slice(1);
}

/** Parse "glide-australia-02-11-2026__patch5-hotfix1" style build tags. */
export function parseBuildTag(tag: string | undefined | null): ParsedBuildTag {
  const raw = String(tag ?? '').trim();
  const out: ParsedBuildTag = { raw };
  const m = /^glide-([a-z]+)-(\d{2}-\d{2}-\d{4})(?:__patch(\d+))?(?:-hotfix(\d+))?/i.exec(raw);
  if (!m) return out;
  const fam = m[1]!.toLowerCase();
  if ((RELEASE_FAMILIES as readonly string[]).includes(fam)) {
    out.family = fam as ReleaseFamily;
    out.family_label = familyLabel(fam);
  }
  out.build_date = m[2];
  out.patch = m[3] !== undefined ? Number(m[3]) : 0;
  if (m[4] !== undefined) out.hotfix = Number(m[4]);
  return out;
}

/** The family after `family`, or undefined when it is the newest one we know. */
export function nextFamily(family: string | undefined): ReleaseFamily | undefined {
  if (!family) return undefined;
  const i = (RELEASE_FAMILIES as readonly string[]).indexOf(family.toLowerCase());
  if (i < 0 || i >= RELEASE_FAMILIES.length - 1) return undefined;
  return RELEASE_FAMILIES[i + 1];
}

/** Normalise a user-supplied release name ("Washington DC", "brazil") to a family key. */
export function normaliseFamily(name: string | undefined): ReleaseFamily | undefined {
  if (!name) return undefined;
  const k = name.toLowerCase().replace(/[^a-z]/g, '');
  return (RELEASE_FAMILIES as readonly string[]).includes(k) ? (k as ReleaseFamily) : undefined;
}

/** Families an upgrade from `from` to `to` passes through (exclusive of from, inclusive of to). */
export function familiesBetween(from: string | undefined, to: string | undefined): ReleaseFamily[] {
  const list = RELEASE_FAMILIES as readonly string[];
  const a = from ? list.indexOf(from) : -1;
  const b = to ? list.indexOf(to) : -1;
  if (b < 0 || b <= a) return [];
  return list.slice(a + 1, b + 1) as ReleaseFamily[];
}

export interface ReleaseContext {
  build_tag: string;
  current: { family?: string; label?: string; patch?: number; hotfix?: number; build_date?: string };
  target?: { family: string; label: string; status: 'ga' | 'early_availability' | 'past' };
  ga_family: string;
  early_availability_family: string;
  changes_to_check: Array<ReleaseChange & { release: string }>;
  note?: string;
}

/** Build the release context for a build tag and an optional target family (default: the next one). */
export function releaseContext(buildTag: string, target?: string): ReleaseContext {
  const parsed = parseBuildTag(buildTag);
  const explicit = normaliseFamily(target);
  const tgt = explicit ?? nextFamily(parsed.family);
  const list = RELEASE_FAMILIES as readonly string[];
  const status = (f: string): 'ga' | 'early_availability' | 'past' =>
    f === EARLY_AVAILABILITY_FAMILY ? 'early_availability' : list.indexOf(f) <= list.indexOf(CURRENT_GA_FAMILY) ? (f === CURRENT_GA_FAMILY ? 'ga' : 'past') : 'early_availability';
  const changes: Array<ReleaseChange & { release: string }> = [];
  for (const f of familiesBetween(parsed.family, tgt)) {
    for (const c of KNOWN_RELEASE_CHANGES[f] ?? []) changes.push({ release: familyLabel(f), ...c });
  }
  const ctx: ReleaseContext = {
    build_tag: parsed.raw,
    current: { family: parsed.family, label: parsed.family_label, patch: parsed.patch, hotfix: parsed.hotfix, build_date: parsed.build_date },
    ga_family: familyLabel(CURRENT_GA_FAMILY),
    early_availability_family: familyLabel(EARLY_AVAILABILITY_FAMILY),
    changes_to_check: changes,
  };
  if (tgt) ctx.target = { family: tgt, label: familyLabel(tgt), status: status(tgt) };
  if (!parsed.family) ctx.note = 'The build tag was not recognised, so the current family is unknown.';
  else if (!tgt) ctx.note = `${parsed.family_label} is the newest family NowAIKit knows about. Check ServiceNow's release notes for anything newer.`;
  else if (target && !explicit) ctx.note = `Unknown target release "${target}". Using the next family instead.`;
  return ctx;
}

/** Read glide.buildtag.last (and glide.war as a fallback) from the instance. */
export async function readBuildTag(client: ServiceNowClient): Promise<string> {
  const r = await client.queryRecords({
    table: 'sys_properties',
    query: 'nameINglide.buildtag.last,glide.buildtag,glide.war',
    fields: 'name,value',
    limit: 5,
  });
  const by = new Map((r.records as any[]).map((p) => [String(p.name), String(p.value ?? '')]));
  return by.get('glide.buildtag.last') || by.get('glide.buildtag') || by.get('glide.war') || '';
}

/**
 * Vulnerability Response and Security Incident Response helpers: state maps and record routing.
 *
 * Data model (checked on an Australia instance with Vulnerability Response 26.4):
 *   sn_vul_vulnerable_item (VIT...)   a vulnerability on one CI; state, risk_rating, ttr_target_date
 *   sn_vul_vulnerability   (VUL...)   the remediation task (vulnerability group) that holds the VITs
 *   sn_vul_entry / sn_vul_nvd_entry   the CVE library (id = CVE ID, cisa_exists, due_date, epss_*);
 *                                     shared reference data, writes need the maint role
 *   sn_vul_change_approval            exception and deferral requests (desired_state 12 = Deferred)
 *   sn_si_incident (SIR...)           security incidents; numeric states
 */
import { ServiceNowError } from '../utils/errors.js';

export const SIR_STATES: Record<string, string> = {
  draft: '10', analysis: '16', contain: '18', eradicate: '19', recover: '20', review: '100', closed: '3', cancelled: '7', canceled: '7',
};

export const VIT_STATES: Record<string, string> = {
  open: '1', under_investigation: '2', in_review: '11', awaiting_implementation: '10', deferred: '12', risk_accepted: '12',
  resolved: '101', closed: '3',
};

export const RISK_RATINGS: Record<string, string> = { critical: '1', high: '2', medium: '3', low: '4', none: '5' };

export const CHANGE_STATES: Record<string, string> = {
  new: '-5', assess: '-4', authorize: '-3', scheduled: '-2', implement: '-1', review: '0', closed: '3', canceled: '4', cancelled: '4',
};

const key = (v: unknown) => String(v ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');

/** Map a state label or number to its value; throws with the valid labels when unknown. */
export function mapChoice(map: Record<string, string>, value: unknown, what: string): string {
  const raw = String(value ?? '').trim();
  if (/^-?\d+$/.test(raw)) {
    if (!Object.values(map).includes(raw)) throw new ServiceNowError(`Unknown ${what} value "${raw}". Use one of: ${Object.entries(map).map(([k, v]) => `${k} (${v})`).join(', ')}`, 'INVALID_REQUEST');
    return raw;
  }
  const v = map[key(raw)];
  if (!v) throw new ServiceNowError(`Unknown ${what} "${raw}". Use one of: ${[...new Set(Object.keys(map))].join(', ')}`, 'INVALID_REQUEST');
  return v;
}

/** SIR moves the platform refuses or that lose history: anything out of Closed or Cancelled. */
export function checkSirMove(from: string, to: string): void {
  if ((from === '3' || from === '7') && to !== from) {
    throw new ServiceNowError(`This security incident is ${from === '3' ? 'Closed' : 'Cancelled'}, so it can't move to another state. Open a new security incident or reopen it from the Security Incident workspace.`, 'INVALID_REQUEST');
  }
  if (to === '3' && from === '10') {
    throw new ServiceNowError('A Draft security incident can\'t be closed directly. Move it to Analysis first, or cancel it (state cancelled).', 'INVALID_REQUEST');
  }
}

export type VulnRef = { kind: 'vit' | 'vul' | 'cve' | 'sys_id' | 'number'; value: string };

/** Work out what a vulnerability reference points at from its prefix. */
export function classifyVulnRef(ref: string): VulnRef {
  const r = ref.trim();
  if (/^VIT\d+$/i.test(r)) return { kind: 'vit', value: r.toUpperCase() };
  if (/^VUL\d+$/i.test(r)) return { kind: 'vul', value: r.toUpperCase() };
  if (/^CVE-\d{4}-\d+$/i.test(r)) return { kind: 'cve', value: r.toUpperCase() };
  if (/^[0-9a-f]{32}$/i.test(r)) return { kind: 'sys_id', value: r.toLowerCase() };
  if (r.includes('^')) throw new ServiceNowError('The reference must not contain "^"', 'INVALID_REQUEST');
  return { kind: 'number', value: r };
}

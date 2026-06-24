/**
 * NowAIKit brand constants for report generation.
 * Colors, logo, and utility functions for building branded reports.
 */
import type { Severity } from './types.js';

export const BRAND = {
  teal: '#00D4AA',
  tealDark: '#00B899',
  navy: '#0F4C81',
  navyLight: '#1A5A94',
  white: '#FFFFFF',
  offWhite: '#F8FAFB',
  gray: '#8B949E',
  grayLight: '#E1E4E8',
  grayDark: '#30363D',
  text: '#24292F',
  textLight: '#57606A',

  // Severity palette
  critical: '#E8466A',
  high: '#FF6B35',
  medium: '#FFB020',
  low: '#0F4C81',
  info: '#8B949E',

  // Health status
  healthy: '#10B981',
  degraded: '#FFB020',
  criticalHealth: '#E8466A',
} as const;

/** Map severity to brand color hex. */
export function severityColor(severity: Severity): string {
  return BRAND[severity] ?? BRAND.info;
}

/** Map severity to human label with consistent casing. */
export function severityLabel(severity: Severity): string {
  return severity.toUpperCase();
}

/** Build a clickable ServiceNow record link by sys_id. */
export function buildRecordLink(instanceUrl: string, table: string, sysId: string): string {
  const base = instanceUrl.replace(/\/$/, '');
  return `${base}/${table}.do?sys_id=${sysId}`;
}

/** Map record number prefixes to ServiceNow table names. */
const RECORD_PREFIXES: Record<string, string> = {
  INC: 'incident', CHG: 'change_request', PRB: 'problem', RITM: 'sc_req_item',
  REQ: 'sc_request', STASK: 'sc_task', SCTASK: 'sc_task', KB: 'kb_knowledge',
  TASK: 'task', PTASK: 'pm_project_task', PRJ: 'pm_project',
};

/** Regex matching ServiceNow record numbers like INC0000052, CHG0040003, PRB0000011. */
const RECORD_NUMBER_RE = /\b(INC|CHG|PRB|RITM|REQ|STASK|SCTASK|KB|TASK|PTASK|PRJ)\d{5,10}\b/g;

/** Regex matching sys_properties like glide.ui.session_timeout, glide.db.max_get. */
const SYS_PROPERTY_RE = /\b(glide\.\w+(?:\.\w+)*)\b/g;

/** Regex matching sn_* scoped properties like sn_hr_core.config, sn_cmdb.health.enabled. */
const SN_PROPERTY_RE = /\b(sn_\w+\.\w+(?:\.\w+)*)\b/g;

/** Regex matching plugin IDs like com.snc.cmdb, com.glide.email. */
const PLUGIN_ID_RE = /\b(com\.(?:snc|glide|service_now|servicenow)\.\w+(?:\.\w+)*)\b/g;

/** Regex matching known ServiceNow table prefixes (conservative to avoid false positives). */
const TABLE_NAME_RE = /\b((?:cmdb_ci|sys_|sc_|sn_|task|incident|change_request|problem|kb_|alm_|ast_|pm_|rm_)\w+)\b/g;

/** Build a link to a ServiceNow record by its number (uses sysparm_query lookup). */
export function buildRecordNumberLink(instanceUrl: string, recordNumber: string): string | null {
  const prefix = Object.keys(RECORD_PREFIXES).find(p => recordNumber.startsWith(p));
  if (!prefix) return null;
  const table = RECORD_PREFIXES[prefix];
  const base = instanceUrl.replace(/\/$/, '');
  return `${base}/nav_to.do?uri=${table}.do%3Fsysparm_query%3Dnumber%3D${recordNumber}`;
}

/** Build a link to a sys_properties record by name. */
export function buildPropertyLink(instanceUrl: string, name: string): string {
  const base = instanceUrl.replace(/\/$/, '');
  return `${base}/nav_to.do?uri=sys_properties.do%3Fsysparm_query%3Dname%3D${name}`;
}

/** Build a link to a plugin record by ID. */
export function buildPluginLink(instanceUrl: string, pluginId: string): string {
  const base = instanceUrl.replace(/\/$/, '');
  return `${base}/nav_to.do?uri=v_plugin.do%3Fsysparm_query%3Did%3D${pluginId}`;
}

/** Build a link to a table definition by name. */
export function buildTableLink(instanceUrl: string, tableName: string): string {
  const base = instanceUrl.replace(/\/$/, '');
  return `${base}/nav_to.do?uri=sys_db_object.do%3Fsysparm_query%3Dname%3D${tableName}`;
}

/** Entity match with resolved link URL. */
interface EntityMatch {
  start: number;
  end: number;
  text: string;
  link: string;
}

/**
 * Find all linkable ServiceNow entities in text. Runs patterns in priority order
 * and skips overlapping matches so no entity is double-linked.
 */
export function findAllEntityMatches(text: string, instanceUrl: string): EntityMatch[] {
  const matches: EntityMatch[] = [];

  // 1. Record numbers (highest priority)
  for (const m of text.matchAll(RECORD_NUMBER_RE)) {
    const link = buildRecordNumberLink(instanceUrl, m[0]);
    if (link) matches.push({ start: m.index!, end: m.index! + m[0].length, text: m[0], link });
  }

  // 2. Plugin IDs (before properties to avoid com.snc.x matching sn_ patterns)
  for (const m of text.matchAll(PLUGIN_ID_RE)) {
    matches.push({ start: m.index!, end: m.index! + m[0].length, text: m[0], link: buildPluginLink(instanceUrl, m[0]) });
  }

  // 3. glide.* sys_properties
  for (const m of text.matchAll(SYS_PROPERTY_RE)) {
    matches.push({ start: m.index!, end: m.index! + m[0].length, text: m[0], link: buildPropertyLink(instanceUrl, m[0]) });
  }

  // 4. sn_* scoped properties
  for (const m of text.matchAll(SN_PROPERTY_RE)) {
    matches.push({ start: m.index!, end: m.index! + m[0].length, text: m[0], link: buildPropertyLink(instanceUrl, m[0]) });
  }

  // 5. Table names (lowest priority — most prone to false positives)
  for (const m of text.matchAll(TABLE_NAME_RE)) {
    matches.push({ start: m.index!, end: m.index! + m[0].length, text: m[0], link: buildTableLink(instanceUrl, m[0]) });
  }

  // Sort by start position, then deduplicate overlapping matches (keep first = highest priority)
  matches.sort((a, b) => a.start - b.start);
  const deduped: EntityMatch[] = [];
  let lastEnd = -1;
  for (const m of matches) {
    if (m.start >= lastEnd) {
      deduped.push(m);
      lastEnd = m.end;
    }
  }

  return deduped;
}

/**
 * Split a plain text string into pdfmake text segments where ServiceNow entities
 * (record numbers, sys_properties, plugins, tables) become clickable hyperlinks.
 * Returns a single string if no entities found, or an array of text objects.
 */
export function linkifyTextPdf(text: string, instanceUrl: string, baseStyle: Record<string, any> = {}): any {
  const matches = findAllEntityMatches(text, instanceUrl);
  if (matches.length === 0) return { text, ...baseStyle };

  const segments: any[] = [];
  let lastIdx = 0;

  for (const match of matches) {
    if (match.start > lastIdx) {
      segments.push({ text: text.slice(lastIdx, match.start), ...baseStyle });
    }
    segments.push({
      text: match.text,
      ...baseStyle,
      color: BRAND.teal,
      decoration: 'underline',
      link: match.link,
    });
    lastIdx = match.end;
  }

  if (lastIdx < text.length) {
    segments.push({ text: text.slice(lastIdx), ...baseStyle });
  }

  return segments;
}

/**
 * Split a plain text string into pptxgenjs text parts where ServiceNow entities
 * become clickable hyperlinks. Returns an array of text part objects.
 */
export function linkifyTextPptx(
  text: string,
  instanceUrl: string,
  baseOpts: Record<string, any> = {},
): Array<{ text: string; options: Record<string, any> }> {
  const matches = findAllEntityMatches(text, instanceUrl);
  if (matches.length === 0) return [{ text, options: baseOpts }];

  const parts: Array<{ text: string; options: Record<string, any> }> = [];
  let lastIdx = 0;

  for (const match of matches) {
    if (match.start > lastIdx) {
      parts.push({ text: text.slice(lastIdx, match.start), options: { ...baseOpts } });
    }
    parts.push({
      text: match.text,
      options: {
        ...baseOpts,
        color: BRAND.teal.replace('#', ''),
        underline: true,
        hyperlink: { url: match.link },
      },
    });
    lastIdx = match.end;
  }

  if (lastIdx < text.length) {
    parts.push({ text: text.slice(lastIdx), options: { ...baseOpts } });
  }

  return parts;
}

/** NowAIKit logo as embedded base64 PNG (small 64x64 icon). */
export const LOGO_BASE64 = [
  'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAACXBIWXMAAAsTAAALEwEAmpwYAAAF',
  'HGlUWHRYTUw6Y29tLmFkb2JlLnhtcAAAAAAAPD94cGFja2V0IGJlZ2luPSLvu78iIGlkPSJXNU0w',
  'TXBDZWhpSHpyZVN6TlRjemtjOWQiPz4gPHg6eG1wbWV0YSB4bWxuczp4PSJhZG9iZTpuczptZXRh',
  'LyIgeDp4bXB0az0iQWRvYmUgWE1QIENvcmUgNy4xLWMwMDAgNzkuZWRhMmIzZiwgMjAyMS8xMS8x',
  'NC0xMjozMDo0MiAgICAgICAgIj4gPHJkZjpSREYgeG1sbnM6cmRmPSJodHRwOi8vd3d3LnczLm9y',
  'Zy8xOTk5LzAyLzIyLXJkZi1zeW50YXgtbnMjIj4gPHJkZjpEZXNjcmlwdGlvbiByZGY6YWJvdXQ9',
  'IiIvPiA8L3JkZjpSREY+IDwveDp4bXBtZXRhPiA8P3hwYWNrZXQgZW5kPSJyIj8+AAAB8UlEQVR4',
  'nO2bMU7DQBBF/0iUVLRUXIALcANOwA24ATdIQUNJR0dBBYiCgoKCikPkCFyA+KfYlSzLWe/Mzux6',
  'xfwvbex5b+1xdrwkiIiIiIiIiIiIiGgEXAF4BPACYJu4nkXNAN4C+ATgO4BX+j9pU5gF8AzAVwA7',
  'AE/1PXG9ZwB2ALwH8APAT/0c1fcFgCcA3gF4AuAhgAcA7gO4V29PANwBcBvATQDXAVwFcLnenkLV',
  'QHITQiLgaQQcPcC+CPCb/VsHuBkB6wDXI2AdYBcBe0XAfhGwBHAvAtYA7kXACsDdCFhZz+x3ADcj',
  'YGU9M98BXI+AlfXMegdwLwJW1jPbHcC9CKj0BH0HcCcCKuuZ5Q7gZgRU1jOrHcCdCKisZ0Y7gLsR',
  'UFnPTHYAdyOgsp7Z7ADuRMDSemayA7gVAUvrmcUO4HYELKxn+juA+xGwsJ5Z7ACeRADpM6sdgCcR',
  'QPrMYgfwMgL4xjoXO4CXEUB8Zr4DeB0BxGemO4AfEUB6pt8B/IoA4jP9DuBnBBCf6XcAvyKA+Ey/',
  'A/gZAcRn+h3ArwggPtPvAH5GAPGZfgfwKwKIz/Q7gJ8RQHym3wH8igDiM/0O4GcEEJ/pd4AOcHCw',
  'h4NdHBwQEREREREREREREY3gF4RZMZGMo+ENAAAAAElFTkSuQmCC',
].join('');

/** Font sizes used in reports */
export const FONT_SIZES = {
  title: 28,
  subtitle: 16,
  sectionHeader: 18,
  body: 11,
  small: 9,
  caption: 8,
} as const;

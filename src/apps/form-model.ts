/**
 * Form model shared by the MCP App views: ServiceNow catalog variables and dictionary fields are
 * normalised here (server side, testable) into a small field list the browser views just render.
 */

export type FieldKind =
  | 'text' | 'textarea' | 'email' | 'url' | 'number' | 'date' | 'datetime' | 'password'
  | 'select' | 'radio' | 'checkbox' | 'reference' | 'list'
  | 'container' | 'multirow' | 'label' | 'unsupported';

export interface FormChoice {
  value: string;
  label: string;
  /** Record forms: only offer this choice when the field it depends on has this value. */
  dependentValue?: string;
}

export interface FormField {
  name: string;
  label: string;
  kind: FieldKind;
  mandatory?: boolean;
  readOnly?: boolean;
  help?: string;
  maxLength?: number;
  choices?: FormChoice[];
  /** reference / list: table to look values up in. */
  reference?: string;
  /** Encoded-query reference qualifier (script qualifiers are dropped). */
  refQualifier?: string;
  value?: string;
  displayValue?: string;
  /** Record forms: field whose value filters this field's choices (e.g. subcategory on category). */
  dependentOn?: string;
  children?: FormField[];
  /** For unsupported fields: what ServiceNow calls the type. */
  typeLabel?: string;
  /** Select without a "-- None --" option (dictionary choice type 3). */
  noNone?: boolean;
  /** Hidden when the form opens (set by a translated onLoad client script). */
  hidden?: boolean;
  /** multirow: most rows the user may add. */
  maxRows?: number;
}

export interface PolicyCondition {
  field: string;
  oper: string;
  value: string;
  or?: boolean;
  newQuery?: boolean;
}

export interface PolicyAction {
  field: string;
  visible?: boolean;
  mandatory?: boolean;
  readOnly?: boolean;
  /** Clear the value when the policy starts to apply. */
  cleared?: boolean;
  /** Set this value when the policy starts to apply (translated g_form.setValue). */
  value?: string;
  displayValue?: string;
}

export interface FormPolicy {
  description: string;
  onLoad: boolean;
  reverse: boolean;
  conditions: PolicyCondition[];
  actions: PolicyAction[];
}

// ─── Catalog variables ────────────────────────────────────────────────────────

/** Catalog variable `friendly_type` → field kind. Anything not listed is shown as "fill this in ServiceNow". */
const CATALOG_KIND: Record<string, FieldKind> = {
  single_line_text: 'text',
  wide_single_line_text: 'text',
  ip: 'text',
  ip_address: 'text',
  duration: 'text',
  multi_line_text: 'textarea',
  html: 'textarea',
  email: 'email',
  url: 'url',
  masked: 'password',
  select_box: 'select',
  yes_no: 'select',
  lookup_select_box: 'select',
  multiple_choice: 'radio',
  numeric_scale: 'radio',
  lookup_multiple_choice: 'radio',
  check_box: 'checkbox',
  reference: 'reference',
  requested_for: 'reference',
  list_collector: 'list',
  date: 'date',
  date_time: 'datetime',
  label: 'label',
};

/** Layout-only variable types that carry no value. */
const LAYOUT_ONLY = new Set(['break', 'container_split', 'container_end', 'formatter']);

/** Catalog numeric `type` codes, used when friendly_type is missing. */
const CATALOG_TYPE_CODES: Record<number, string> = {
  1: 'yes_no', 2: 'multi_line_text', 3: 'multiple_choice', 4: 'numeric_scale', 5: 'select_box',
  6: 'single_line_text', 7: 'check_box', 8: 'reference', 9: 'date', 10: 'date_time', 11: 'label',
  12: 'break', 16: 'wide_single_line_text', 18: 'lookup_select_box', 19: 'container_start',
  20: 'container_split', 21: 'list_collector', 22: 'lookup_multiple_choice', 23: 'html',
  24: 'container_end', 25: 'masked', 26: 'email', 27: 'url', 28: 'ip_address', 29: 'duration',
  31: 'requested_for',
};

function str(v: unknown): string {
  return v === undefined || v === null ? '' : String(v);
}

/** Only plain encoded queries can be applied from the browser; script and dynamic qualifiers are not. */
function usableQualifier(q: unknown): string | undefined {
  const s = str(q).trim();
  if (!s || s === 'EQ' || /^javascript:/i.test(s) || /dynamic/i.test(s)) return undefined;
  return s.replace(/\^EQ$/, '');
}

export interface CatalogFormContext {
  /** sys_id of the current user, used to resolve `javascript:gs.getUserID()` defaults. */
  currentUserSysId?: string;
  currentUserName?: string;
}

/** Normalise one sn_sc variable (recursive for containers). Returns null for layout-only entries. */
export function normalizeCatalogVariable(v: any, ctx: CatalogFormContext = {}): FormField | null {
  if (!v) return null;
  const friendly = str(v.friendly_type) || CATALOG_TYPE_CODES[Number(v.type)] || '';
  if (LAYOUT_ONLY.has(friendly)) return null;

  // Multi-row variable set. The sn_sc API returns it with no children; the caller fills them from item_option_new.
  if (friendly === 'sc_multi_row' || v.containerType === 'one_to_many') {
    const children = (v.children || [])
      .map((c: any) => normalizeCatalogVariable(c, ctx))
      .filter((c: FormField | null): c is FormField => !!c && c.kind !== 'container' && c.kind !== 'multirow' && c.kind !== 'label');
    if (!str(v.name) || !children.length) return null;
    const field: FormField = { name: str(v.name), label: str(v.label) || str(v.name), kind: 'multirow', children };
    const max = /(?:^|,)\s*max_rows\s*=\s*(\d+)/.exec(str(v.attributes));
    field.maxRows = max ? Math.min(Number(max[1]) || 50, 50) : 50;
    if (v.mandatory) field.mandatory = true;
    if (v.read_only) field.readOnly = true;
    if (str(v.help_text)) field.help = str(v.help_text);
    const rows = parseMultiRowValue(v.value);
    if (rows.length) field.value = JSON.stringify(rows);
    return field;
  }

  // The catalog API reports containers as active:false even when they render, so only fields are filtered on it.
  if (friendly === 'container_start' || Array.isArray(v.children)) {
    const children = (v.children || [])
      .map((c: any) => normalizeCatalogVariable(c, ctx))
      .filter((c: FormField | null): c is FormField => !!c);
    if (!children.length) return null;
    // ServiceNow wraps lone checkboxes in an unnamed "checkbox_container"; render those inline.
    const label = v.containerType === 'checkbox_container' && str(v.label) === 'Options' ? '' : str(v.label);
    return { name: str(v.name) || `container_${str(v.id)}`, label, kind: 'container', children };
  }

  if (v.active === false) return null;
  const kind = CATALOG_KIND[friendly] || 'unsupported';
  const field: FormField = {
    name: str(v.name),
    label: str(v.label) || str(v.name),
    kind,
  };
  if (!field.name) return null;
  if (v.mandatory) field.mandatory = true;
  if (v.read_only) field.readOnly = true;
  if (str(v.help_text)) field.help = str(v.help_text);
  if (Number(v.max_length) > 0) field.maxLength = Number(v.max_length);
  if (kind === 'unsupported') field.typeLabel = str(v.display_type) || friendly || 'custom';

  if (Array.isArray(v.choices) && (kind === 'select' || kind === 'radio')) {
    field.choices = v.choices
      .map((c: any) => ({ value: str(c.value), label: str(c.label) || str(c.value) }))
      .filter((c: FormChoice) => kind === 'select' || c.value !== '');
  }
  if (kind === 'reference') {
    field.reference = str(v.reference) || 'sys_user';
    const q = usableQualifier(v.ref_qualifier);
    if (q) field.refQualifier = q;
  }
  if (kind === 'list') {
    field.reference = str(v.table) || str(v.list_table) || str(v.reference);
    if (!field.reference) {
      field.kind = 'unsupported';
      field.typeLabel = 'List collector';
    }
  }

  // Defaults. Script defaults are resolved where we can and dropped otherwise.
  let value = str(v.value);
  let display = str(v.displayvalue);
  if (/^javascript:/i.test(value)) {
    if (/gs\.getUserID\(\)/.test(value) && ctx.currentUserSysId) {
      value = ctx.currentUserSysId;
      display = display || ctx.currentUserName || '';
    } else {
      value = '';
      display = '';
    }
  }
  if (value) field.value = value;
  if (display && display !== value) field.displayValue = display;
  return field;
}

export function normalizeCatalogVariables(vars: any[], ctx: CatalogFormContext = {}): FormField[] {
  return (vars || [])
    .map((v) => normalizeCatalogVariable(v, ctx))
    .filter((f): f is FormField => !!f);
}

/** Map catalog variable sys_ids (used as `IO:<id>` in UI policies) to variable names. */
export function catalogVariableIdMap(vars: any[], map: Record<string, string> = {}): Record<string, string> {
  for (const v of vars || []) {
    if (v && v.id && v.name) map[String(v.id)] = String(v.name);
    if (v && Array.isArray(v.children)) catalogVariableIdMap(v.children, map);
  }
  return map;
}

function tri(v: unknown): boolean | undefined {
  const s = str(v).toLowerCase();
  if (s === 'true') return true;
  if (s === 'false') return false;
  return undefined; // "ignore", "leave alone", empty
}

/** Normalise sn_sc `ui_policy` entries, translating `IO:<sys_id>` references to variable names. */
export function normalizeCatalogPolicies(policies: any[], idMap: Record<string, string>): FormPolicy[] {
  const resolve = (ref: unknown) => {
    const s = str(ref);
    const id = s.startsWith('IO:') ? s.slice(3) : s;
    return idMap[id] || (s.startsWith('IO:') ? '' : s);
  };
  const out: FormPolicy[] = [];
  for (const p of policies || []) {
    if (!p) continue;
    // Policies that need scripts can't run in the sandboxed view; their declarative part still applies.
    const conditions: PolicyCondition[] = (p.conditions || [])
      .map((c: any) => ({
        field: resolve(c.field),
        oper: str(c.oper) || '=',
        value: str(c.value),
        ...(c.or ? { or: true } : {}),
        ...(c.newquery ? { newQuery: true } : {}),
      }))
      .filter((c: PolicyCondition) => c.field);
    const actions: PolicyAction[] = (p.actions || [])
      .map((a: any) => {
        const act: PolicyAction = { field: resolve(a.name) };
        const visible = tri(a.visible);
        const mandatory = tri(a.mandatory);
        const disabled = tri(a.disabled);
        if (visible !== undefined) act.visible = visible;
        if (mandatory !== undefined) act.mandatory = mandatory;
        if (disabled !== undefined) act.readOnly = disabled;
        if (tri(a.cleared)) act.cleared = true;
        return act;
      })
      .filter((a: PolicyAction) => a.field && (a.visible !== undefined || a.mandatory !== undefined || a.readOnly !== undefined));
    if (!actions.length) continue;
    out.push({
      description: str(p.short_description),
      onLoad: p.onload !== false,
      reverse: p.reverse !== false,
      conditions,
      actions,
    });
  }
  return out;
}

/** Flatten a field tree (containers included) for lookups. Multi-row set columns are not form fields, so they stay nested. */
export function flattenFields(fields: FormField[], out: FormField[] = []): FormField[] {
  for (const f of fields) {
    out.push(f);
    if (f.children && f.kind !== 'multirow') flattenFields(f.children, out);
  }
  return out;
}

// ─── Multi-row variable sets ──────────────────────────────────────────────────

/**
 * Turn an item_option_new row (Table API) into the sn_sc variable shape normalizeCatalogVariable reads.
 * Used for multi-row set columns, which the sn_sc item API leaves out.
 */
export function catalogVariableFromRow(row: any, choices: FormChoice[] = []): any {
  const get = (f: string) => {
    const v = row?.[f];
    return v && typeof v === 'object' ? str(v.value) : str(v);
  };
  const type = Number(get('type'));
  const friendly = CATALOG_TYPE_CODES[type] || '';
  const v: any = {
    id: get('sys_id'),
    name: get('name'),
    label: get('question_text') || get('name'),
    type,
    friendly_type: friendly,
    display_type: friendly ? undefined : 'Type ' + get('type'),
    active: get('active') !== 'false',
    mandatory: get('mandatory') === 'true',
    read_only: get('read_only') === 'true',
    help_text: get('help_text'),
    max_length: get('max_length'),
    reference: get('reference'),
    ref_qualifier: get('reference_qual'),
    table: get('list_table'),
    value: get('default_value'),
    order: Number(get('order')) || 0,
  };
  // Lookup boxes read their choices from another table; the row form does not resolve those.
  if (friendly === 'lookup_select_box' || friendly === 'lookup_multiple_choice') {
    v.friendly_type = 'lookup_unresolved';
    v.display_type = friendly === 'lookup_select_box' ? 'Lookup select box' : 'Lookup multiple choice';
  }
  if (friendly === 'yes_no' && !choices.length) choices = [{ value: 'Yes', label: 'Yes' }, { value: 'No', label: 'No' }];
  if (choices.length) v.choices = choices.map((c) => ({ value: c.value, label: c.label }));
  return v;
}

/** question_choice rows → choices per question sys_id, in order, active only. */
export function groupQuestionChoices(rows: any[]): Record<string, FormChoice[]> {
  const get = (r: any, f: string) => {
    const v = r?.[f];
    return v && typeof v === 'object' ? str(v.value) : str(v);
  };
  const sorted = [...(rows || [])].sort((a, b) => (Number(get(a, 'order')) || 0) - (Number(get(b, 'order')) || 0));
  const out: Record<string, FormChoice[]> = {};
  for (const r of sorted) {
    if (get(r, 'inactive') === 'true') continue;
    const q = get(r, 'question');
    if (!q) continue;
    (out[q] ||= []).push({ value: get(r, 'value'), label: get(r, 'text') || get(r, 'value') });
  }
  return out;
}

/** Attach multi-row set columns (sn_sc gives none) to the item's variables, in place. */
export function attachMultiRowChildren(vars: any[], childrenBySet: Record<string, any[]>): void {
  for (const v of vars || []) {
    if (!v) continue;
    if (v.friendly_type === 'sc_multi_row' || v.containerType === 'one_to_many') {
      const rows = childrenBySet[str(v.id)];
      if (rows) v.children = [...rows].sort((a, b) => (a.order || 0) - (b.order || 0));
    } else if (Array.isArray(v.children)) attachMultiRowChildren(v.children, childrenBySet);
  }
}

/** sys_ids of the multi-row sets in an item's variables. */
export function multiRowSetIds(vars: any[], out: string[] = []): string[] {
  for (const v of vars || []) {
    if (!v) continue;
    if (v.friendly_type === 'sc_multi_row' || v.containerType === 'one_to_many') { if (v.id) out.push(str(v.id)); }
    else if (Array.isArray(v.children)) multiRowSetIds(v.children, out);
  }
  return out;
}

/** Parse a multi-row value (JSON string or array) into row objects. Bad input gives no rows. */
export function parseMultiRowValue(raw: unknown): Record<string, string>[] {
  let v: unknown = raw;
  if (typeof raw === 'string') {
    if (!raw.trim()) return [];
    try { v = JSON.parse(raw); } catch { return []; }
  }
  if (!Array.isArray(v)) return [];
  return v
    .filter((r) => r && typeof r === 'object' && !Array.isArray(r))
    .map((r) => {
      const row: Record<string, string> = {};
      for (const [k, x] of Object.entries(r as Record<string, unknown>)) row[k] = x === null || x === undefined ? '' : String(x);
      return row;
    });
}

/**
 * Check and canonicalise a multi-row set value for order_now. ServiceNow expects the set's internal name
 * mapped to a JSON string: an array of row objects keyed by column variable names.
 */
export function multiRowSubmitValue(field: FormField, raw: unknown): { value: string; errors: string[] } {
  const cols = (field.children || []).filter((c) => c.kind !== 'unsupported');
  const names = new Set(cols.map((c) => c.name));
  const rows = parseMultiRowValue(raw).map((r) => {
    const row: Record<string, string> = {};
    for (const c of cols) row[c.name] = names.has(c.name) && r[c.name] !== undefined ? r[c.name] : '';
    return row;
  }).filter((r) => Object.values(r).some((x) => x !== ''));
  const errors: string[] = [];
  if (field.mandatory && !rows.length) errors.push(`${field.label}: add at least one row`);
  if (field.maxRows && rows.length > field.maxRows) errors.push(`${field.label}: at most ${field.maxRows} rows`);
  rows.forEach((r, i) => {
    for (const c of cols) {
      if (c.mandatory && (!r[c.name] || (c.kind === 'checkbox' && r[c.name] !== 'true'))) errors.push(`${field.label} row ${i + 1}: ${c.label}`);
    }
  });
  return { value: rows.length ? JSON.stringify(rows) : '', errors };
}

// ─── Record (dictionary) fields ───────────────────────────────────────────────

/** Dictionary internal types the record form can't edit safely. */
const RECORD_UNSUPPORTED = new Set([
  'script', 'script_plain', 'script_server', 'conditions', 'condition_string', 'template_value', 'documentation_field',
  'user_roles', 'variables', 'variable_conditions', 'workflow', 'glide_var', 'field_name', 'table_name',
  'user_image', 'image', 'translated_html', 'json', 'xml', 'css', 'html_script', 'composite_field',
]);
const RECORD_HIDDEN = new Set(['password', 'password2', 'domain_id', 'sys_class_name', 'collection']);
const RECORD_SYSTEM_FIELDS = new Set(['sys_id', 'sys_created_on', 'sys_created_by', 'sys_updated_on', 'sys_updated_by', 'sys_mod_count', 'sys_domain', 'sys_domain_path', 'sys_tags']);

export interface DictionaryEntry {
  element: string;
  column_label?: string;
  internal_type?: string;
  mandatory?: string | boolean;
  read_only?: string | boolean;
  reference?: string;
  reference_qual?: string;
  choice?: string | number;
  max_length?: string | number;
  dependent_on_field?: string;
  default_value?: string;
}

const truthy = (v: unknown) => v === true || str(v) === 'true';

/** Build one record-form field from its dictionary entry. Returns null for fields the form should not show. */
export function recordFieldFromDictionary(d: DictionaryEntry, choices: FormChoice[] = []): FormField | null {
  const name = str(d.element);
  const type = str(d.internal_type).toLowerCase();
  if (!name || RECORD_HIDDEN.has(type) || RECORD_SYSTEM_FIELDS.has(name)) return null;
  const field: FormField = { name, label: str(d.column_label) || name, kind: 'text' };
  if (truthy(d.mandatory)) field.mandatory = true;
  if (truthy(d.read_only)) field.readOnly = true;
  const max = Number(d.max_length);

  // Dictionary choice: 1 = dropdown with None, 2 = suggestion only (stays free text), 3 = dropdown without None.
  const choiceMode = Number(d.choice);
  if ((choiceMode === 1 || choiceMode === 3) && choices.length) {
    field.kind = 'select';
    field.choices = choices;
    if (choiceMode === 3) field.noNone = true;
    if (str(d.dependent_on_field)) field.dependentOn = str(d.dependent_on_field);
  } else if (RECORD_UNSUPPORTED.has(type)) {
    field.kind = 'unsupported';
    field.typeLabel = type;
  } else if (type === 'reference') {
    field.kind = 'reference';
    field.reference = str(d.reference);
    const q = usableQualifier(d.reference_qual);
    if (q) field.refQualifier = q;
    if (!field.reference) return null;
  } else if (type === 'glide_list') {
    field.kind = str(d.reference) ? 'list' : 'text';
    if (str(d.reference)) field.reference = str(d.reference);
  } else if (type === 'boolean') {
    field.kind = 'checkbox';
  } else if (['integer', 'decimal', 'float', 'currency', 'price', 'longint', 'percent_complete'].includes(type)) {
    field.kind = 'number';
  } else if (type === 'glide_date') {
    field.kind = 'date';
  } else if (['glide_date_time', 'due_date', 'glide_time'].includes(type)) {
    field.kind = 'datetime';
  } else if (type === 'email') {
    field.kind = 'email';
  } else if (type === 'url') {
    field.kind = 'url';
  } else if (['journal', 'journal_input', 'journal_list', 'html', 'multi_two_lines'].includes(type) || max > 255) {
    field.kind = 'textarea';
    if (type.startsWith('journal')) field.help = 'Added to the activity stream when you save.';
  }
  if (max > 0 && (field.kind === 'text' || field.kind === 'textarea')) field.maxLength = max;
  return field;
}

/** Choice rows (sys_choice) → choices per element, preferring the most specific table in the hierarchy. */
export function groupChoices(rows: any[], hierarchy: string[]): Record<string, FormChoice[]> {
  const rank = (t: string) => {
    const i = hierarchy.indexOf(t);
    return i === -1 ? hierarchy.length : i;
  };
  const best: Record<string, string> = {};
  for (const r of rows || []) {
    const el = str(r.element);
    const t = str(r.name);
    if (!el) continue;
    if (best[el] === undefined || rank(t) < rank(best[el])) best[el] = t;
  }
  const out: Record<string, FormChoice[]> = {};
  for (const r of rows || []) {
    const el = str(r.element);
    if (!el || str(r.name) !== best[el]) continue;
    const c: FormChoice = { value: str(r.value), label: str(r.label) || str(r.value) };
    if (str(r.dependent_value)) c.dependentValue = str(r.dependent_value);
    (out[el] ||= []).push(c);
  }
  return out;
}

// ─── Encoded-query conditions (record UI policies and data policies) ──────────

/** Operators the view can evaluate, longest first so "NOT LIKE" wins over "LIKE" and "<=" over "<". */
const QUERY_OPERATORS = [
  'ISNOTEMPTY', 'ISEMPTY', 'ANYTHING', 'STARTSWITH', 'ENDSWITH', 'NOT LIKE', 'NOT IN', 'LIKE', 'IN',
  '!=', '<=', '>=', '=', '<', '>',
];
const VALUELESS = new Set(['ISNOTEMPTY', 'ISEMPTY', 'ANYTHING']);

export type ParsedQuery = { ok: true; conditions: PolicyCondition[] } | { ok: false; reason: string };

/**
 * Parse an encoded query into PolicyCondition[] (^OR binds to the previous term, ^NQ starts a new OR'd query).
 * Anything the view cannot evaluate in the browser (dot-walks, javascript:, relative dates, field comparisons,
 * related-list queries) is refused with a reason rather than approximated.
 */
export function parseEncodedQuery(query: unknown): ParsedQuery {
  const q = str(query).trim();
  if (!q) return { ok: true, conditions: [] };
  if (/javascript:/i.test(q)) return { ok: false, reason: 'uses a script (javascript:)' };
  const conditions: PolicyCondition[] = [];
  for (let term of q.split('^')) {
    if (term === '' || term === 'EQ') continue;
    if (term.startsWith('ORDERBY')) continue;
    if (/^(RLQUERY|ENDRLQUERY|SUBQUERY|ENDSUBQUERY)/.test(term)) return { ok: false, reason: 'uses a related-list query' };
    let or = false;
    let newQuery = false;
    if (term.startsWith('NQ')) { newQuery = true; term = term.slice(2); }
    else if (term.startsWith('OR')) { or = true; term = term.slice(2); }
    const fieldMatch = /^[a-z0-9_.]+/.exec(term);
    if (!fieldMatch) return { ok: false, reason: `has a condition it cannot read ("${term.slice(0, 40)}")` };
    const field = fieldMatch[0];
    if (field.includes('.')) return { ok: false, reason: `uses a dot-walked field (${field})` };
    const rest = term.slice(field.length);
    const oper = QUERY_OPERATORS.find((o) => rest.startsWith(o));
    if (!oper) return { ok: false, reason: `uses an unsupported operator on ${field} ("${rest.slice(0, 20)}")` };
    const value = rest.slice(oper.length);
    if (VALUELESS.has(oper) && value) return { ok: false, reason: `uses an unsupported operator on ${field} ("${rest.slice(0, 20)}")` };
    if (/@/.test(value) || /^(javascript|gs\.)/i.test(value)) return { ok: false, reason: `uses a relative or dynamic value on ${field}` };
    const c: PolicyCondition = { field, oper, value };
    if (or && conditions.length) c.or = true;
    if (newQuery && conditions.length) c.newQuery = true;
    conditions.push(c);
  }
  return { ok: true, conditions };
}

// ─── Record UI policies and data policies ─────────────────────────────────────

const ref = (r: any, f: string) => {
  const v = r?.[f];
  return v && typeof v === 'object' ? str(v.value) : str(v);
};

export interface RecordPolicyInput {
  /** The form's table, most specific first, then its parents. */
  tables: string[];
  /** sys_ui_policy rows (table, conditions, reverse_if_false, on_load, active, global, view, inherit, run_scripts, ui_type, order). */
  uiPolicies?: any[];
  /** sys_ui_policy_action rows (ui_policy, field, visible, mandatory, disabled, cleared). */
  uiActions?: any[];
  /** sys_data_policy2 rows (model_table, conditions, reverse_if_false, active, enforce_ui, inherit). */
  dataPolicies?: any[];
  /** sys_data_policy_rule rows (sys_data_policy, field, mandatory, disabled). */
  dataRules?: any[];
}

export interface RecordPolicyResult {
  policies: FormPolicy[];
  notes: string[];
  /** Every field the kept policies test, so the caller can supply values for ones not on the form. */
  conditionFields: string[];
}

/** Does a policy defined on `table` reach the form's table (directly or through "Inherit")? */
function reachesTable(table: string, inherit: unknown, tables: string[]): boolean {
  if (table === tables[0]) return true;
  return tables.includes(table) && truthy(inherit);
}

/**
 * Normalise a table's UI policies and client-enforced data policies into FormPolicy[] for the record view.
 * Only global or default-view, desktop/all UI policies are used. Script parts never run; policies whose
 * conditions need the server are skipped and listed in `notes`.
 */
export function normalizeRecordPolicies(input: RecordPolicyInput): RecordPolicyResult {
  const { tables } = input;
  const notes: string[] = [];
  const skipped: string[] = [];
  const scripted: string[] = [];
  const policies: FormPolicy[] = [];

  const actionsBy: Record<string, any[]> = {};
  for (const a of input.uiActions || []) (actionsBy[ref(a, 'ui_policy')] ||= []).push(a);
  const ui = (input.uiPolicies || [])
    .filter((p) => str(p.active) !== 'false')
    .filter((p) => reachesTable(ref(p, 'table'), p.inherit, tables))
    .filter((p) => truthy(p.global) || !ref(p, 'view') || ref(p, 'view') === 'default')
    .filter((p) => ['', '0', '10'].includes(ref(p, 'ui_type')))
    .sort((a, b) => (Number(a.order) || 100) - (Number(b.order) || 100));
  for (const p of ui) {
    const name = str(p.short_description) || 'UI policy';
    const actions: PolicyAction[] = [];
    for (const a of actionsBy[str(p.sys_id)] || []) {
      const field = str(a.field);
      if (!/^[a-z0-9_]+$/i.test(field)) continue;
      const act: PolicyAction = { field };
      const visible = tri(a.visible);
      const mandatory = tri(a.mandatory);
      const disabled = tri(a.disabled);
      if (visible !== undefined) act.visible = visible;
      if (mandatory !== undefined) act.mandatory = mandatory;
      if (disabled !== undefined) act.readOnly = disabled;
      if (tri(a.cleared)) act.cleared = true;
      if (act.visible !== undefined || act.mandatory !== undefined || act.readOnly !== undefined || act.cleared) actions.push(act);
    }
    if (!actions.length) continue;
    const parsed = parseEncodedQuery(p.conditions);
    if (!parsed.ok) { skipped.push(`"${name}" (${parsed.reason})`); continue; }
    if (truthy(p.run_scripts)) scripted.push(`"${name}"`);
    policies.push({
      description: name,
      onLoad: str(p.on_load) !== 'false',
      reverse: str(p.reverse_if_false) !== 'false',
      conditions: parsed.conditions,
      actions,
    });
  }

  // Data policies marked "Use as UI Policy on client" behave like UI policies with mandatory/read-only actions.
  const rulesBy: Record<string, any[]> = {};
  for (const r of input.dataRules || []) (rulesBy[ref(r, 'sys_data_policy')] ||= []).push(r);
  for (const p of input.dataPolicies || []) {
    if (str(p.active) === 'false' || str(p.enforce_ui) === 'false') continue;
    if (!reachesTable(ref(p, 'model_table'), p.inherit, tables)) continue;
    const name = str(p.short_description) || 'Data policy';
    const actions: PolicyAction[] = [];
    for (const r of rulesBy[str(p.sys_id)] || []) {
      const field = str(r.field);
      if (!/^[a-z0-9_]+$/i.test(field)) continue;
      const act: PolicyAction = { field };
      const mandatory = tri(r.mandatory);
      const disabled = tri(r.disabled);
      if (mandatory !== undefined) act.mandatory = mandatory;
      if (disabled !== undefined) act.readOnly = disabled;
      if (act.mandatory !== undefined || act.readOnly !== undefined) actions.push(act);
    }
    if (!actions.length) continue;
    const parsed = parseEncodedQuery(p.conditions);
    if (!parsed.ok) { skipped.push(`data policy "${name}" (${parsed.reason})`); continue; }
    policies.push({
      description: `Data policy: ${name}`,
      onLoad: true,
      reverse: str(p.reverse_if_false) !== 'false',
      conditions: parsed.conditions,
      actions,
    });
  }

  if (skipped.length) {
    notes.push(`${skipped.length} polic${skipped.length === 1 ? 'y needs' : 'ies need'} ServiceNow to evaluate and ${skipped.length === 1 ? 'is' : 'are'} not applied here: ${skipped.join('; ')}.`);
  }
  if (scripted.length) {
    notes.push(scripted.length === 1
      ? `UI policy ${scripted[0]} also runs a script, which only runs in ServiceNow. Its field rules are applied here.`
      : `UI policies ${scripted.join(', ')} also run scripts, which only run in ServiceNow. Their field rules are applied here.`);
  }
  const conditionFields = [...new Set(policies.flatMap((p) => p.conditions.map((c) => c.field)))];
  return { policies, notes, conditionFields };
}

// ─── Catalog client scripts → declarative rules ───────────────────────────────
//
// Client scripts are never executed. A small tokenizer and recursive-descent parser recognise the
// straight-line g_form patterns most catalog scripts use and turn them into FormPolicy rules (onChange)
// or field defaults (onLoad). Anything else in a script means the whole script is left to ServiceNow.

interface Tok { t: 'id' | 'str' | 'num' | 'p'; v: string }

class Refuse extends Error {}

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  const puncts = ['===', '!==', '==', '!=', '&&', '||', '(', ')', '{', '}', '[', ']', ';', ',', '.', '!', '='];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) { i++; continue; }
    if (src.startsWith('//', i)) { const e = src.indexOf('\n', i); i = e === -1 ? src.length : e; continue; }
    if (src.startsWith('/*', i)) { const e = src.indexOf('*/', i + 2); if (e === -1) throw new Refuse('unterminated comment'); i = e + 2; continue; }
    if (ch === '"' || ch === "'") {
      let j = i + 1;
      let s = '';
      while (j < src.length && src[j] !== ch) {
        if (src[j] === '\n') throw new Refuse('unterminated string');
        if (src[j] === '\\') {
          const n = src[j + 1];
          const map: Record<string, string> = { n: '\n', t: '\t', r: '\r', '\\': '\\', "'": "'", '"': '"' };
          if (!(n in map)) throw new Refuse('string escape');
          s += map[n];
          j += 2;
        } else s += src[j++];
      }
      if (j >= src.length) throw new Refuse('unterminated string');
      out.push({ t: 'str', v: s });
      i = j + 1;
      continue;
    }
    const id = /^[A-Za-z_$][\w$]*/.exec(src.slice(i, i + 200));
    if (id) { out.push({ t: 'id', v: id[0] }); i += id[0].length; continue; }
    const num = /^\d+(\.\d+)?/.exec(src.slice(i, i + 50));
    if (num) { out.push({ t: 'num', v: num[0] }); i += num[0].length; continue; }
    const p = puncts.find((x) => src.startsWith(x, i));
    if (!p) throw new Refuse(`unsupported syntax "${ch}"`);
    out.push({ t: 'p', v: p });
    i += p.length;
  }
  return out;
}

/** Literal condition on a field: oper is =, !=, ISEMPTY or ISNOTEMPTY. */
interface Lit { field: string; oper: string; value: string }
type Expr =
  | { k: 'lit'; lit: Lit }
  | { k: 'const'; v: boolean }
  | { k: 'and' | 'or'; a: Expr; b: Expr }
  | { k: 'not'; a: Expr };

/** OR of ANDs. [] is false, [[]] is true. */
type Dnf = Lit[][];

const MAX_DNF = 32;

function negateLit(l: Lit): Lit {
  const inv: Record<string, string> = { '=': '!=', '!=': '=', ISEMPTY: 'ISNOTEMPTY', ISNOTEMPTY: 'ISEMPTY' };
  return { field: l.field, oper: inv[l.oper], value: l.value };
}

function toDnf(e: Expr, neg = false): Dnf {
  switch (e.k) {
    case 'const': return (e.v !== neg) ? [[]] : [];
    case 'lit': return [[neg ? negateLit(e.lit) : e.lit]];
    case 'not': return toDnf(e.a, !neg);
    default: {
      const isAnd = (e.k === 'and') !== neg; // De Morgan
      const a = toDnf(e.a, neg);
      const b = toDnf(e.b, neg);
      let out: Dnf;
      if (isAnd) {
        out = [];
        for (const x of a) for (const y of b) out.push([...x, ...y]);
      } else out = [...a, ...b];
      if (out.length > MAX_DNF) throw new Refuse('condition too complex');
      return simplifyDnf(out);
    }
  }
}

function simplifyDnf(d: Dnf): Dnf {
  const seen = new Set<string>();
  const out: Dnf = [];
  for (const conj of d) {
    const lits: Lit[] = [];
    const keys = new Set<string>();
    let contradiction = false;
    for (const l of conj) {
      const k = `${l.field}\u0000${l.oper}\u0000${l.value}`;
      if (keys.has(k)) continue;
      const nk = (() => { const n = negateLit(l); return `${n.field}\u0000${n.oper}\u0000${n.value}`; })();
      if (keys.has(nk)) { contradiction = true; break; }
      keys.add(k);
      lits.push(l);
    }
    if (contradiction) continue;
    if (!lits.length) return [[]]; // always true
    const key = [...keys].sort().join('\u0001');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(lits);
  }
  return out;
}

function dnfToConditions(d: Dnf): PolicyCondition[] {
  const out: PolicyCondition[] = [];
  d.forEach((conj, i) => conj.forEach((l, j) => {
    const c: PolicyCondition = { field: l.field, oper: l.oper, value: l.value };
    if (i > 0 && j === 0) c.newQuery = true;
    out.push(c);
  }));
  return out;
}

function and(a: Expr, b: Expr): Expr { return { k: 'and', a, b }; }
function not(a: Expr): Expr { return { k: 'not', a }; }
const TRUE: Expr = { k: 'const', v: true };

/** One field change a script makes, under the condition that leads to it. */
interface GuardedAction { guard: Expr; field: string; prop: 'visible' | 'mandatory' | 'readOnly' | 'value'; value: boolean | string; display?: string }

const SETTERS: Record<string, 'visible' | 'mandatory' | 'readOnly'> = {
  setDisplay: 'visible', setVisible: 'visible', setMandatory: 'mandatory', setReadOnly: 'readOnly', setReadonly: 'readOnly', setDisabled: 'readOnly',
};
/** Messages only: dropped, they don't change the form's data or rules. */
const MESSAGE_CALLS = new Set(['addInfoMessage', 'addErrorMessage', 'showFieldMsg', 'hideFieldMsg', 'hideAllFieldMsgs', 'clearMessages', 'flash']);

class ScriptParser {
  private i = 0;
  private aliases: Record<string, string> = {}; // local var → field
  private maps = new Set<string>(); // var v = {} filled with g_form.getValue for every name
  private mapNames: Record<string, Set<string>> = {};
  private newValueName = '';
  private isLoadingName = '';
  private actionsSeen = false;
  readonly actions: GuardedAction[] = [];
  onLoadGuard = false;

  constructor(private toks: Tok[], private kind: 'onLoad' | 'onChange', private watched: string, private known: Set<string>) {}

  private peek(o = 0): Tok | undefined { return this.toks[this.i + o]; }
  private is(v: string, o = 0): boolean { const t = this.peek(o); return !!t && (t.t === 'p' || t.t === 'id') && t.v === v; }
  private eat(v: string): void { if (!this.is(v)) throw new Refuse(`expected "${v}"`); this.i++; }
  private ident(): string { const t = this.peek(); if (!t || t.t !== 'id') throw new Refuse('expected a name'); this.i++; return t.v; }
  private string(): string { const t = this.peek(); if (!t || t.t !== 'str') throw new Refuse('expected a literal string'); this.i++; return t.v; }
  private semi(): void { while (this.is(';')) this.i++; }

  parse(): void {
    this.eat('function');
    if (this.peek()?.t === 'id') this.i++;
    this.eat('(');
    const params: string[] = [];
    while (!this.is(')')) { params.push(this.ident()); if (this.is(',')) this.i++; }
    this.eat(')');
    if (this.kind === 'onChange') { this.newValueName = params[2] || ''; this.isLoadingName = params[3] || ''; }
    this.eat('{');
    this.block(TRUE, true);
    this.eat('}');
    this.semi();
    if (this.i !== this.toks.length) throw new Refuse('code after the function');
  }

  /** Statements until "}" (not consumed). */
  private block(guard: Expr, top = false): void {
    while (this.peek() && !this.is('}')) this.statement(guard, top);
  }

  private body(guard: Expr): void {
    if (this.is('{')) { this.i++; this.block(guard); this.eat('}'); } else this.statement(guard, false);
  }

  private statement(guard: Expr, top: boolean): void {
    if (this.is(';')) { this.i++; return; }
    if (this.is('var') || this.is('let') || this.is('const')) return this.declaration(top);
    if (this.is('if')) return this.ifStatement(guard, top);
    if (this.is('[')) return this.forEachFill(top);
    if (this.is('g_form')) return this.call(guard);
    if (this.is('return')) throw new Refuse('return outside the isLoading check');
    throw new Refuse(`statement it does not understand ("${this.peek()?.v}")`);
  }

  private declaration(top: boolean): void {
    this.i++;
    const name = this.ident();
    this.eat('=');
    if (!top || this.actionsSeen) throw new Refuse('variable declared after the form was changed');
    if (this.is('{') && this.is('}', 1)) { this.i += 2; this.maps.add(name); this.semi(); return; }
    if (this.is('g_form') && this.is('.', 1) && this.is('getValue', 2)) {
      this.i += 3; this.eat('('); const f = this.fieldName(this.string()); this.eat(')');
      this.aliases[name] = f; this.semi(); return;
    }
    if (this.newValueName && this.is(this.newValueName) && this.peek()?.t === 'id') {
      this.i++; this.aliases[name] = this.watchedField(); this.semi(); return;
    }
    throw new Refuse(`variable "${name}" is not a plain field value`);
  }

  /** ["a","b"].forEach(function (n) { v[n] = g_form.getValue(n); }); */
  private forEachFill(top: boolean): void {
    if (!top || this.actionsSeen) throw new Refuse('unexpected array');
    this.eat('[');
    const names: string[] = [];
    while (!this.is(']')) { names.push(this.fieldName(this.string())); if (this.is(',')) this.i++; }
    this.eat(']'); this.eat('.'); this.eat('forEach'); this.eat('('); this.eat('function'); this.eat('(');
    const n = this.ident();
    this.eat(')'); this.eat('{');
    const m = this.ident();
    if (!this.maps.has(m)) throw new Refuse('forEach fills an unknown object');
    this.eat('['); this.eat(n); this.eat(']'); this.eat('='); this.eat('g_form'); this.eat('.'); this.eat('getValue');
    this.eat('('); this.eat(n); this.eat(')'); this.semi(); this.eat('}'); this.eat(')'); this.semi();
    this.mapNames[m] = new Set(names);
  }

  private ifStatement(guard: Expr, top: boolean): void {
    this.eat('if');
    this.eat('(');
    // if (isLoading) return;  → the script does nothing while the form loads.
    if (this.isLoadingName && this.is(this.isLoadingName) && this.is(')', 1)) {
      if (!top || this.actionsSeen) throw new Refuse('isLoading check after the form was changed');
      this.i += 2;
      const braced = this.is('{');
      if (braced) this.i++;
      this.eat('return'); this.semi();
      if (braced) this.eat('}');
      if (this.is('else')) throw new Refuse('else after the isLoading check');
      this.onLoadGuard = true;
      return;
    }
    const cond = this.expr();
    this.eat(')');
    this.body(and(guard, cond));
    if (this.is('else')) { this.i++; this.body(and(guard, not(cond))); }
  }

  private call(guard: Expr): void {
    this.eat('g_form'); this.eat('.');
    const m = this.ident();
    this.eat('(');
    if (MESSAGE_CALLS.has(m)) {
      // Skip the arguments: literals, names and + only.
      let depth = 1;
      while (this.peek() && depth) {
        const t = this.peek()!;
        if (t.t === 'p' && t.v === '(') depth++;
        else if (t.t === 'p' && t.v === ')') depth--;
        else if (t.t === 'p' && ![',', '.'].includes(t.v)) throw new Refuse(`unexpected "${t.v}" in ${m}`);
        this.i++;
      }
      this.semi();
      return;
    }
    const field = this.fieldName(this.string());
    this.actionsSeen = true;
    if (SETTERS[m]) {
      this.eat(',');
      const e = this.expr();
      this.eat(')'); this.semi();
      const prop = SETTERS[m];
      if (e.k === 'const') this.actions.push({ guard, field, prop, value: e.v });
      else {
        this.actions.push({ guard: and(guard, e), field, prop, value: true });
        this.actions.push({ guard: and(guard, not(e)), field, prop, value: false });
      }
      return;
    }
    if (m === 'clearValue') { this.eat(')'); this.semi(); this.actions.push({ guard, field, prop: 'value', value: '' }); return; }
    if (m === 'setValue') {
      this.eat(',');
      const value = this.literalValue();
      let display: string | undefined;
      if (this.is(',')) { this.i++; display = this.literalValue(); }
      this.eat(')'); this.semi();
      this.actions.push({ guard, field, prop: 'value', value, ...(display !== undefined ? { display } : {}) });
      return;
    }
    throw new Refuse(`g_form.${m} is not translated`);
  }

  private literalValue(): string {
    const t = this.peek();
    if (t && (t.t === 'str' || t.t === 'num')) { this.i++; return t.v; }
    if (this.is('true') || this.is('false')) { this.i++; return t!.v; }
    throw new Refuse('setValue with a computed value');
  }

  private fieldName(name: string): string {
    if (!this.known.has(name)) throw new Refuse(`unknown variable "${name}"`);
    return name;
  }

  private watchedField(): string {
    if (!this.watched) throw new Refuse('newValue without a watched variable');
    return this.watched;
  }

  // expr := and ('||' and)* ; and := unary ('&&' unary)* ; unary := '!' unary | primary
  private expr(): Expr {
    let e = this.andExpr();
    while (this.is('||')) { this.i++; e = { k: 'or', a: e, b: this.andExpr() }; }
    return e;
  }
  private andExpr(): Expr {
    let e = this.unary();
    while (this.is('&&')) { this.i++; e = { k: 'and', a: e, b: this.unary() }; }
    return e;
  }
  private unary(): Expr {
    if (this.is('!')) { this.i++; return not(this.unary()); }
    return this.primary();
  }
  private primary(): Expr {
    if (this.is('(')) { this.i++; const e = this.expr(); this.eat(')'); return e; }
    if (this.is('true') || this.is('false')) { const v = this.ident() === 'true'; return { k: 'const', v }; }
    const left = this.operand();
    if (this.is('==') || this.is('===') || this.is('!=') || this.is('!==')) {
      const op = this.peek()!.v;
      this.i++;
      const right = this.operand();
      let field: string; let value: string;
      if (left.field !== undefined && right.lit !== undefined) { field = left.field; value = right.lit; }
      else if (right.field !== undefined && left.lit !== undefined) { field = right.field; value = left.lit; }
      else throw new Refuse('comparison must be a field against a literal string');
      const eq = op === '==' || op === '===';
      const lit: Lit = value === '' ? { field, oper: eq ? 'ISEMPTY' : 'ISNOTEMPTY', value: '' } : { field, oper: eq ? '=' : '!=', value };
      return { k: 'lit', lit };
    }
    if (left.field !== undefined) return { k: 'lit', lit: { field: left.field, oper: 'ISNOTEMPTY', value: '' } }; // truthy string
    throw new Refuse('condition it does not understand');
  }

  /** A field value (newValue, alias, g_form.getValue('x'), v["x"], v.x) or a literal string. */
  private operand(): { field?: string; lit?: string } {
    const t = this.peek();
    if (!t) throw new Refuse('unexpected end');
    if (t.t === 'str') { this.i++; return { lit: t.v }; }
    if (t.t === 'num') throw new Refuse('compares with a number; only literal strings are translated');
    if (t.t !== 'id') throw new Refuse(`unexpected "${t.v}"`);
    if (t.v === 'g_form' && this.is('.', 1) && this.is('getValue', 2)) {
      this.i += 3; this.eat('('); const f = this.fieldName(this.string()); this.eat(')'); return { field: f };
    }
    if (t.v === 'g_form') throw new Refuse(`g_form.${this.peek(2)?.v || ''} in a condition is not translated`);
    if (this.isLoadingName && t.v === this.isLoadingName) throw new Refuse('isLoading is only understood as "if (isLoading) return;"');
    if (t.v === 'oldValue' || t.v === 'control') throw new Refuse(`${t.v} is not translated`);
    if (this.newValueName && t.v === this.newValueName) { this.i++; return { field: this.watchedField() }; }
    if (this.aliases[t.v]) { this.i++; return { field: this.aliases[t.v] }; }
    if (this.mapNames[t.v]) {
      this.i++;
      let f: string;
      if (this.is('[')) { this.i++; f = this.string(); this.eat(']'); } else { this.eat('.'); f = this.ident(); }
      if (!this.mapNames[t.v].has(f)) throw new Refuse(`"${f}" was not read into ${t.v}`);
      return { field: this.fieldName(f) };
    }
    throw new Refuse(`"${t.v}" is not a field value`);
  }
}

export interface CatalogScriptInput {
  type: 'onLoad' | 'onChange' | 'onSubmit';
  script: string;
  /** onChange: the variable it watches, as sn_sc gives it (IO:<sys_id> or IO:<name>). */
  fieldName?: string;
  sys_id?: string;
}

export interface FieldDefault { visible?: boolean; mandatory?: boolean; readOnly?: boolean; value?: string; displayValue?: string }

export interface ScriptTranslation {
  /** Rules from onChange scripts, in script order. They go before the item's UI policies, which win on conflict. */
  policies: FormPolicy[];
  /** Field changes from onLoad scripts, applied when the form opens. */
  defaults: Record<string, FieldDefault>;
  translated: string[];
  skipped: { script: string; reason: string }[];
}

/** Collect sn_sc client_script entries (onLoad / onChange / onSubmit) into one list. */
export function catalogScriptList(clientScript: any): CatalogScriptInput[] {
  const out: CatalogScriptInput[] = [];
  for (const type of ['onLoad', 'onChange', 'onSubmit'] as const) {
    for (const s of (clientScript && clientScript[type]) || []) {
      if (!s) continue;
      out.push({ type, script: str(s.script), fieldName: str(s.fieldName), sys_id: str(s.sys_id) });
    }
  }
  return out;
}

/**
 * Translate catalog client scripts into rules without running them. `known` is every variable name on the
 * form; `idMap` maps variable sys_ids to names (for "IO:<sys_id>"); `labels` names variables in notes.
 */
export function translateCatalogScripts(
  scripts: CatalogScriptInput[], known: Set<string>, idMap: Record<string, string>, labels: Record<string, string> = {},
): ScriptTranslation {
  const result: ScriptTranslation = { policies: [], defaults: {}, translated: [], skipped: [] };
  const seen = new Set<string>();
  for (const s of scripts) {
    let watched = '';
    if (s.type === 'onChange') {
      const raw = str(s.fieldName).replace(/^IO:/, '');
      watched = idMap[raw] || (known.has(raw) ? raw : '');
    }
    const label = s.type === 'onChange' ? `onChange script on ${labels[watched] || watched || 'an unknown variable'}` : `${s.type} script`;
    try {
      if (s.type === 'onSubmit') throw new Refuse('onSubmit checks run only in ServiceNow');
      if (s.type === 'onChange' && !watched) throw new Refuse('watches a variable that is not on this form');
      const parser = new ScriptParser(tokenize(s.script), s.type, watched, known);
      parser.parse();
      if (s.type === 'onLoad') translateOnLoad(parser.actions, result.defaults);
      else {
        for (const p of groupActions(parser.actions, label, !parser.onLoadGuard)) {
          const key = JSON.stringify([p.onLoad, p.conditions, p.actions]);
          if (seen.has(key)) continue;
          seen.add(key);
          result.policies.push(p);
        }
      }
      result.translated.push(label);
    } catch (err) {
      if (!(err instanceof Refuse)) throw err;
      result.skipped.push({ script: label, reason: err.message });
    }
  }
  return result;
}

function translateOnLoad(actions: GuardedAction[], defaults: Record<string, FieldDefault>): void {
  // onLoad scripts run once, so only unconditional changes with literal arguments are kept.
  for (const a of actions) {
    if (a.guard !== TRUE) throw new Refuse('onLoad script with conditions');
  }
  for (const a of actions) {
    const d = (defaults[a.field] ||= {});
    if (a.prop === 'value') { d.value = String(a.value); if (a.display !== undefined) d.displayValue = a.display; else delete d.displayValue; }
    else d[a.prop] = a.value as boolean;
  }
}

/**
 * Turn guarded actions into policies: one per distinct condition, keeping script order where two
 * conditions touch the same field and property (the later statement must still win).
 */
function groupActions(actions: GuardedAction[], description: string, onLoad: boolean): FormPolicy[] {
  interface Group { key: string; conditions: PolicyCondition[]; acts: GuardedAction[] }
  const groups: Group[] = [];
  for (const a of actions) {
    const dnf = toDnf(a.guard);
    if (!dnf.length) continue; // can never apply
    const conditions = dnf.some((c) => !c.length) ? [] : dnfToConditions(dnf);
    const key = JSON.stringify(conditions);
    let target: Group | undefined;
    for (let gi = groups.length - 1; gi >= 0; gi--) {
      const g = groups[gi];
      if (g.key === key) { target = g; break; }
      if (g.acts.some((x) => x.field === a.field && x.prop === a.prop)) break;
    }
    if (!target) { target = { key, conditions, acts: [] }; groups.push(target); }
    target.acts.push(a);
  }
  return groups.map((g) => {
    const byField = new Map<string, PolicyAction>();
    for (const a of g.acts) {
      const act = byField.get(a.field) || { field: a.field };
      if (a.prop === 'value') {
        delete act.value; delete act.displayValue; delete act.cleared;
        if (a.value === '') act.cleared = true;
        else { act.value = String(a.value); if (a.display !== undefined) act.displayValue = a.display; }
      } else act[a.prop] = a.value as boolean;
      byField.set(a.field, act);
    }
    return { description, onLoad, reverse: false, conditions: g.conditions, actions: [...byField.values()] };
  });
}

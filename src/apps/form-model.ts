/**
 * Form model shared by the MCP App views: ServiceNow catalog variables and dictionary fields are
 * normalised here (server side, testable) into a small field list the browser views just render.
 */

export type FieldKind =
  | 'text' | 'textarea' | 'email' | 'url' | 'number' | 'date' | 'datetime' | 'password'
  | 'select' | 'radio' | 'checkbox' | 'reference' | 'list'
  | 'container' | 'label' | 'unsupported';

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
  cleared?: boolean;
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

/** Flatten a field tree (containers included) for lookups. */
export function flattenFields(fields: FormField[], out: FormField[] = []): FormField[] {
  for (const f of fields) {
    out.push(f);
    if (f.children) flattenFields(f.children, out);
  }
  return out;
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

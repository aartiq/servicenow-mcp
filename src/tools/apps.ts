/**
 * Interactive form tools (MCP Apps). See src/apps/index.ts for how the views are wired.
 *
 * Model-visible:
 *   - open_catalog_form: render a Service Catalog item as a fillable request form
 *   - open_record_form:  render a create/edit form for any record, following the table's form layout
 *   - open_approvals:    render the current user's pending approvals with approve/reject buttons
 * App-only (called by the views, hidden from the model by MCP Apps hosts):
 *   - app_submit_catalog_form, app_lookup_reference, app_save_record, app_decide_approval
 *
 * Every write goes through the same WRITE_ENABLED gate as the equivalent plain tool.
 */
import type { ServiceNowClient } from '../servicenow/client.js';
import { ServiceNowError } from '../utils/errors.js';
import { requireWrite } from '../utils/permissions.js';
import {
  APPROVALS_URI, APP_ONLY_TOOL_META, CATALOG_FORM_URI, RECORD_FORM_URI, viewToolMeta,
} from '../apps/index.js';
import {
  catalogVariableIdMap, flattenFields, groupChoices, normalizeCatalogPolicies, normalizeCatalogVariables,
  recordFieldFromDictionary, type DictionaryEntry, type FormField,
} from '../apps/form-model.js';

const SYS_ID = /^[0-9a-f]{32}$/i;
const TABLE = /^[a-z0-9_]{1,80}$/i;

/** Strip characters that would change the meaning of an encoded query built from user text. */
function queryText(s: unknown): string {
  return String(s ?? '').replace(/[\^\n\r]/g, ' ').trim().slice(0, 100);
}

function val(r: any, f: string): string {
  const v = r?.[f];
  if (v && typeof v === 'object') return String(v.value ?? '');
  return v === undefined || v === null ? '' : String(v);
}

function disp(r: any, f: string): string {
  const v = r?.[f];
  if (v && typeof v === 'object') return String(v.display_value ?? v.value ?? '');
  return v === undefined || v === null ? '' : String(v);
}

export function getAppsToolDefinitions() {
  return [
    {
      name: 'open_catalog_form',
      description:
        'Open a Service Catalog item as an interactive request form inside the chat (Claude, ChatGPT, VS Code and other ' +
        'MCP Apps hosts). The user fills in the variables, with choices, reference lookups, variable sets and catalog UI ' +
        'policies applied, and submits the request themselves. Prefer this over asking the user for each variable. ' +
        'Pass the item sys_id or its name. Hosts without MCP Apps get the form definition as JSON.',
      inputSchema: {
        type: 'object',
        properties: {
          item: { type: 'string', description: 'Catalog item sys_id or name (e.g. "Standard Laptop")' },
        },
        required: ['item'],
      },
      _meta: viewToolMeta(CATALOG_FORM_URI, 'Opening the request form...', 'Request form ready'),
    },
    {
      name: 'open_record_form',
      description:
        'Open an interactive form to create or edit a ServiceNow record (incident, change_request, problem, any table) ' +
        'inside the chat. Fields follow the table\'s default form layout, with choice lists, dependent choices and ' +
        'reference lookups. Omit sys_id to create a new record; pass values to prefill. The user reviews and saves.',
      inputSchema: {
        type: 'object',
        properties: {
          table: { type: 'string', description: 'Table name, e.g. incident' },
          sys_id: { type: 'string', description: 'Record to edit. Omit to create a new record.' },
          fields: { type: 'array', items: { type: 'string' }, description: 'Fields to show instead of the form layout (optional)' },
          values: { type: 'object', description: 'Values to prefill, e.g. {"short_description":"VPN down"}' },
        },
        required: ['table'],
      },
      _meta: viewToolMeta(RECORD_FORM_URI, 'Opening the form...', 'Form ready'),
    },
    {
      name: 'open_approvals',
      description:
        'Show the current user\'s pending approvals as an interactive list with Approve and Reject buttons inside the chat. ' +
        'Hosts without MCP Apps get the list as JSON.',
      inputSchema: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Max approvals to show (default 20, max 50)' },
        },
        required: [],
      },
      _meta: viewToolMeta(APPROVALS_URI, 'Loading your approvals...', 'Approvals ready'),
    },
  ];
}

/** Tools only the views call. Listed only for clients that can render MCP Apps. */
export function getAppOnlyToolDefinitions() {
  return [
    {
      name: 'app_submit_catalog_form',
      description: 'Submit a catalog request from the catalog form view.',
      inputSchema: {
        type: 'object',
        properties: {
          item_sys_id: { type: 'string' },
          variables: { type: 'object' },
          quantity: { type: 'number' },
        },
        required: ['item_sys_id'],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
      _meta: APP_ONLY_TOOL_META,
    },
    {
      name: 'app_lookup_reference',
      description: 'Search a reference table by display value for a form field.',
      inputSchema: {
        type: 'object',
        properties: {
          table: { type: 'string' },
          term: { type: 'string' },
          qualifier: { type: 'string' },
        },
        required: ['table', 'term'],
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
      _meta: APP_ONLY_TOOL_META,
    },
    {
      name: 'app_save_record',
      description: 'Create or update a record from the record form view.',
      inputSchema: {
        type: 'object',
        properties: {
          table: { type: 'string' },
          sys_id: { type: 'string' },
          values: { type: 'object' },
        },
        required: ['table', 'values'],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
      _meta: APP_ONLY_TOOL_META,
    },
    {
      name: 'app_decide_approval',
      description: 'Approve or reject an approval from the approvals view.',
      inputSchema: {
        type: 'object',
        properties: {
          sys_id: { type: 'string' },
          decision: { type: 'string', enum: ['approved', 'rejected'] },
          comments: { type: 'string' },
        },
        required: ['sys_id', 'decision'],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
      _meta: APP_ONLY_TOOL_META,
    },
  ];
}

export const APP_ONLY_TOOL_NAMES = new Set(getAppOnlyToolDefinitions().map((t) => t.name));

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Table plus its parents, most specific first (incident → task). */
async function tableHierarchy(client: ServiceNowClient, table: string): Promise<{ tables: string[]; label: string }> {
  const tables: string[] = [];
  let label = '';
  let current = table;
  for (let i = 0; i < 8 && current; i++) {
    tables.push(current);
    const resp = await client.queryRecords({ table: 'sys_db_object', query: `name=${current}`, fields: 'name,label,super_class.name', limit: 1 });
    const rec = resp.records[0] as any;
    if (!rec) {
      if (i === 0) throw new ServiceNowError(`Table not found: ${table}`, 'NOT_FOUND');
      break;
    }
    if (i === 0) label = val(rec, 'label');
    current = val(rec, 'super_class.name');
  }
  return { tables, label: label || table };
}

/** The field used as a record's display value (falls back to common name fields). */
async function displayField(client: ServiceNowClient, table: string): Promise<string> {
  const { tables } = await tableHierarchy(client, table);
  const resp = await client.queryRecords({
    table: 'sys_dictionary', query: `nameIN${tables.join(',')}^display=true`, fields: 'name,element', limit: 10,
  });
  const rows = resp.records as any[];
  for (const t of tables) {
    const hit = rows.find((r) => val(r, 'name') === t && val(r, 'element'));
    if (hit) return val(hit, 'element');
  }
  const common = ['name', 'number', 'short_description', 'title', 'user_name'];
  const dict = await client.queryRecords({
    table: 'sys_dictionary', query: `nameIN${tables.join(',')}^elementIN${common.join(',')}`, fields: 'element', limit: 20,
  });
  const present = new Set((dict.records as any[]).map((r) => val(r, 'element')));
  return common.find((c) => present.has(c)) || 'sys_id';
}

/** Default-view form layout fields for a table (main section first), skipping splits, formatters and dot-walks. */
async function formLayoutFields(client: ServiceNowClient, tables: string[]): Promise<string[]> {
  for (const t of tables) {
    const sections = await client.queryRecords({
      table: 'sys_ui_form_section', query: `sys_ui_form.name=${t}^sys_ui_form.view.name=NULL^ORDERBYposition`, fields: 'sys_ui_section', limit: 20,
    });
    let ids = (sections.records as any[]).map((r) => val(r, 'sys_ui_section')).filter(Boolean);
    if (!ids.length) {
      const fallback = await client.queryRecords({ table: 'sys_ui_section', query: `name=${t}^view.name=NULL^caption=`, fields: 'sys_id', limit: 1 });
      ids = (fallback.records as any[]).map((r) => val(r, 'sys_id')).filter(Boolean);
    }
    if (!ids.length) continue;
    const out: string[] = [];
    for (const id of ids.slice(0, 2)) {
      const els = await client.queryRecords({
        table: 'sys_ui_element', query: `sys_ui_section=${id}^ORDERBYposition`, fields: 'element,type', limit: 200,
      });
      for (const r of els.records as any[]) {
        const name = val(r, 'element');
        const type = val(r, 'type');
        if (!name || (type && type !== 'element') || name.startsWith('.') || name.includes('.')) continue;
        if (!out.includes(name)) out.push(name);
      }
    }
    if (out.length) return out;
  }
  return [];
}

function recordUrl(client: ServiceNowClient, table: string, sysId: string): string {
  return `${client.instanceUrl}/nav_to.do?uri=${encodeURIComponent(`${table}.do?sys_id=${sysId}`)}`;
}

// ─── Execution ────────────────────────────────────────────────────────────────

export async function executeAppsToolCall(client: ServiceNowClient, name: string, args: Record<string, any>): Promise<any> {
  switch (name) {
    case 'open_catalog_form': {
      const ref = String(args.item || args.sys_id || '').trim();
      if (!ref) throw new ServiceNowError('item is required (catalog item sys_id or name)', 'INVALID_REQUEST');
      let sysId = SYS_ID.test(ref) ? ref : '';
      if (!sysId) {
        const t = queryText(ref);
        const resp = await client.queryRecords({ table: 'sc_cat_item', query: `active=true^name=${t}^ORnameLIKE${t}^ORDERBYname`, fields: 'sys_id,name', limit: 5 });
        const recs = resp.records as any[];
        const exact = recs.find((r) => val(r, 'name').toLowerCase() === ref.toLowerCase());
        const pick = exact || recs[0];
        if (!pick) throw new ServiceNowError(`No active catalog item matches "${ref}". Use search_catalog to find it.`, 'NOT_FOUND');
        sysId = val(pick, 'sys_id');
      }
      const item = await client.getServiceCatalogItem(sysId);
      let me: { user_sys_id?: string; user_display_name?: string } = {};
      try { me = await client.getCurrentUser(); } catch { /* defaults that need the user are dropped */ }
      const vars: any[] = item.variables || [];
      const fields = normalizeCatalogVariables(vars, { currentUserSysId: me.user_sys_id, currentUserName: me.user_display_name });
      const policies = normalizeCatalogPolicies(item.ui_policy || [], catalogVariableIdMap(vars));
      const notes: string[] = [];
      const scripts = item.client_script || {};
      const scriptCount = ['onLoad', 'onChange', 'onSubmit'].reduce((n, k) => n + ((scripts[k] || []).length), 0);
      if (scriptCount) notes.push(`This item has ${scriptCount} catalog client script(s). They run only in ServiceNow, so the form here may behave a little differently.`);
      if ((item.ui_policy || []).some((p: any) => p.script_true || p.script_false)) notes.push('Some UI policy scripts on this item only run in ServiceNow.');
      if (item.mandatory_attachment) notes.push('This item needs an attachment. Add it in ServiceNow after submitting, or use upload_attachment.');
      const flat = flattenFields(fields);
      return {
        item: {
          sys_id: item.sys_id || sysId,
          name: item.name,
          short_description: item.short_description,
          description: item.description,
          price: item.price,
          show_price: item.show_price,
          show_quantity: item.show_quantity,
          category: item.category?.title,
        },
        fields,
        policies,
        notes,
        item_url: `${client.instanceUrl}/sp?id=sc_cat_item&sys_id=${item.sys_id || sysId}`,
        mandatory_variables: flat.filter((f) => f.mandatory).map((f) => f.name),
        summary: `Catalog form for "${item.name}" with ${flat.filter((f) => f.kind !== 'container').length} field(s). ` +
          'In hosts without MCP Apps, collect the values and call order_catalog_item with variables {name: value}.',
      };
    }

    case 'open_record_form': {
      const table = String(args.table || '').trim();
      if (!TABLE.test(table)) throw new ServiceNowError('table is required (e.g. incident)', 'INVALID_REQUEST');
      const sysId = String(args.sys_id || '').trim();
      if (sysId && !SYS_ID.test(sysId)) throw new ServiceNowError('sys_id must be a 32-character sys_id', 'INVALID_REQUEST');
      const { tables, label } = await tableHierarchy(client, table);
      let names: string[] = Array.isArray(args.fields) && args.fields.length
        ? args.fields.map(String).filter((f: string) => /^[a-z0-9_]+$/i.test(f))
        : await formLayoutFields(client, tables);
      const notes: string[] = [];
      const dict = await client.queryRecords({
        table: 'sys_dictionary',
        query: `nameIN${tables.join(',')}^elementISNOTEMPTY^active=true` + (names.length ? `^elementIN${names.join(',')}` : '^mandatory=true'),
        fields: 'name,element,column_label,internal_type,mandatory,read_only,reference,reference_qual,choice,max_length,dependent_on_field',
        limit: 500,
      });
      // Most specific table wins (dictionary overrides on child tables).
      const byElement: Record<string, DictionaryEntry> = {};
      const rank = (t: string) => tables.indexOf(t);
      for (const r of dict.records as any[]) {
        const el = val(r, 'element');
        const prev = byElement[el] as any;
        if (!prev || rank(val(r, 'name')) < rank(prev.__table)) {
          byElement[el] = {
            element: el, column_label: val(r, 'column_label'), internal_type: val(r, 'internal_type'),
            mandatory: val(r, 'mandatory'), read_only: val(r, 'read_only'), reference: val(r, 'reference'),
            reference_qual: val(r, 'reference_qual'), choice: val(r, 'choice'), max_length: val(r, 'max_length'),
            dependent_on_field: val(r, 'dependent_on_field'),
          };
          (byElement[el] as any).__table = val(r, 'name');
        }
      }
      if (!names.length) {
        names = ['short_description', 'description', ...Object.keys(byElement)].filter((n, i, a) => a.indexOf(n) === i && byElement[n]);
        notes.push('No form layout was found for this table, so only key and mandatory fields are shown.');
      }
      const choiceFields = names.filter((n) => byElement[n] && [1, 3].includes(Number(byElement[n].choice)));
      let choices: Record<string, any[]> = {};
      if (choiceFields.length) {
        const rows = await client.queryRecords({
          table: 'sys_choice',
          query: `nameIN${tables.join(',')}^elementIN${choiceFields.join(',')}^inactive=false^language=en^ORDERBYsequence`,
          fields: 'name,element,value,label,dependent_value',
          limit: 1000,
        });
        choices = groupChoices(rows.records as any[], tables);
      }
      const fields: FormField[] = [];
      for (const n of names) {
        const d = byElement[n];
        if (!d) continue;
        const f = recordFieldFromDictionary(d, choices[n] || []);
        if (f) fields.push(f);
      }
      let number = '';
      if (sysId) {
        const rec = await client.getRecord(table, sysId, fields.map((f) => f.name).concat('number').join(','), 'all') as any;
        number = disp(rec, 'number');
        for (const f of fields) {
          const v = val(rec, f.name);
          const dv = disp(rec, f.name);
          if (f.kind === 'textarea' && /^journal/.test(String(byElement[f.name]?.internal_type))) continue; // journals are write-only
          if (v) f.value = v;
          if (dv && dv !== v) f.displayValue = dv;
        }
      }
      if (args.values && typeof args.values === 'object') {
        for (const f of fields) {
          const pre = (args.values as Record<string, unknown>)[f.name];
          if (pre !== undefined && pre !== null) f.value = String(pre);
        }
      }
      if (fields.some((f) => f.kind === 'reference' && f.value && !f.displayValue)) {
        notes.push('Prefilled reference fields show their sys_id until you pick a value.');
      }
      return {
        table,
        table_label: label,
        sys_id: sysId || null,
        number: number || null,
        fields,
        policies: [],
        notes,
        record_url: sysId ? recordUrl(client, table, sysId) : null,
        summary: `${sysId ? 'Edit' : 'New'} ${label}${number ? ' ' + number : ''} form with ${fields.length} field(s). ` +
          'In hosts without MCP Apps, use create_record or update_record with these field names.',
      };
    }

    case 'open_approvals': {
      const limit = Math.min(Math.max(Number(args.limit) || 20, 1), 50);
      const resp = await client.queryRecords({
        table: 'sysapproval_approver',
        query: 'approver=javascript:gs.getUserID()^state=requested^ORDERBYsys_created_on',
        fields: 'sys_id,sysapproval,source_table,document_id,sys_created_on,due_date,sysapproval.short_description,sysapproval.number,sysapproval.opened_by,sysapproval.sys_class_name',
        displayValue: 'all',
        limit: limit + 1,
      });
      const rows = resp.records as any[];
      const approvals = rows.slice(0, limit).map((r) => {
        const table = val(r, 'source_table') || val(r, 'sysapproval.sys_class_name') || 'task';
        const doc = val(r, 'document_id') || val(r, 'sysapproval');
        return {
          sys_id: val(r, 'sys_id'),
          number: disp(r, 'sysapproval.number') || disp(r, 'sysapproval'),
          short_description: disp(r, 'sysapproval.short_description'),
          type: disp(r, 'sysapproval.sys_class_name') || table,
          requested_by: disp(r, 'sysapproval.opened_by'),
          created: disp(r, 'sys_created_on'),
          due: disp(r, 'due_date'),
          url: doc ? recordUrl(client, table, doc) : recordUrl(client, 'sysapproval_approver', val(r, 'sys_id')),
        };
      });
      return {
        approvals,
        more: rows.length > limit,
        summary: approvals.length
          ? `${approvals.length} approval(s) waiting. In hosts without MCP Apps, use approve_request / reject_request with the sys_id.`
          : 'No approvals are waiting for the current user.',
      };
    }

    case 'app_lookup_reference': {
      const table = String(args.table || '').trim();
      if (!TABLE.test(table)) throw new ServiceNowError('table is required', 'INVALID_REQUEST');
      const term = queryText(args.term);
      if (term.length < 1) return { results: [] };
      const field = await displayField(client, table);
      const parts: string[] = [];
      const qual = String(args.qualifier || '').trim();
      if (qual && !/^javascript:/i.test(qual)) parts.push(qual);
      parts.push(SYS_ID.test(term) ? `sys_id=${term}` : `${field}LIKE${term}`);
      if (table === 'sys_user') parts.push('active=true');
      const secondary = table === 'sys_user' ? 'email' : '';
      const resp = await client.queryRecords({
        table, query: parts.join('^') + `^ORDERBY${field}`, fields: ['sys_id', field, secondary].filter(Boolean).join(','), limit: 15,
      });
      return {
        results: (resp.records as any[]).map((r) => ({
          sys_id: val(r, 'sys_id'),
          display: disp(r, field) || val(r, 'sys_id'),
          ...(secondary && val(r, secondary) ? { secondary: val(r, secondary) } : {}),
        })),
      };
    }

    case 'app_submit_catalog_form': {
      requireWrite();
      const itemId = String(args.item_sys_id || '');
      if (!SYS_ID.test(itemId)) throw new ServiceNowError('item_sys_id is required', 'INVALID_REQUEST');
      const variables: Record<string, string> = {};
      for (const [k, v] of Object.entries((args.variables as Record<string, unknown>) || {})) {
        if (/^[a-z0-9_]+$/i.test(k) && v !== undefined && v !== null) variables[k] = String(v);
      }
      // Re-check the item's own mandatory variables server side (UI policy visibility is the view's job).
      const item = await client.getServiceCatalogItem(itemId);
      const vars: any[] = item.variables || [];
      // Fields a UI policy can hide or make optional are the view's call, not ours.
      const policyControlled = new Set(
        normalizeCatalogPolicies(item.ui_policy || [], catalogVariableIdMap(vars)).flatMap((p) => p.actions.map((a) => a.field)),
      );
      const missing = flattenFields(normalizeCatalogVariables(vars))
        .filter((f) => f.mandatory && !policyControlled.has(f.name) && f.kind !== 'unsupported' && f.kind !== 'container' && !variables[f.name] && !f.value)
        .map((f) => f.label);
      if (missing.length) throw new ServiceNowError(`Missing required fields: ${missing.join(', ')}`, 'INVALID_REQUEST');
      const quantity = Math.min(Math.max(Number(args.quantity) || 1, 1), 100);
      const result = await client.callNowAssist(`/api/sn_sc/servicecatalog/items/${itemId}/order_now`, {
        sysparm_quantity: quantity,
        variables,
      });
      const r = result?.result || result || {};
      const requestId = String(r.request_id || r.sys_id || '');
      return {
        request_number: r.request_number || r.number || null,
        request_id: requestId || null,
        table: r.table || 'sc_request',
        request_url: requestId ? recordUrl(client, String(r.table || 'sc_request'), requestId) : null,
        summary: `Submitted ${item.name || 'catalog item'}${r.request_number ? ` as ${r.request_number}` : ''}.`,
      };
    }

    case 'app_save_record': {
      requireWrite();
      const table = String(args.table || '').trim();
      if (!TABLE.test(table)) throw new ServiceNowError('table is required', 'INVALID_REQUEST');
      const values: Record<string, string> = {};
      for (const [k, v] of Object.entries((args.values as Record<string, unknown>) || {})) {
        if (/^[a-z0-9_]+$/i.test(k) && !k.startsWith('sys_')) values[k] = v === null || v === undefined ? '' : String(v);
      }
      if (!Object.keys(values).length) throw new ServiceNowError('Nothing to save', 'INVALID_REQUEST');
      const sysId = String(args.sys_id || '').trim();
      const rec = sysId
        ? await client.updateRecord(table, sysId, values)
        : await client.createRecord(table, values);
      const id = val(rec, 'sys_id') || sysId;
      return { created: !sysId, sys_id: id, number: val(rec, 'number') || null, record_url: id ? recordUrl(client, table, id) : null };
    }

    case 'app_decide_approval': {
      requireWrite();
      const sysId = String(args.sys_id || '');
      if (!SYS_ID.test(sysId)) throw new ServiceNowError('sys_id is required', 'INVALID_REQUEST');
      const decision = String(args.decision || '');
      if (decision !== 'approved' && decision !== 'rejected') throw new ServiceNowError('decision must be approved or rejected', 'INVALID_REQUEST');
      const comments = String(args.comments || '').trim();
      if (decision === 'rejected' && !comments) throw new ServiceNowError('A comment is required to reject', 'INVALID_REQUEST');
      const data: Record<string, string> = { state: decision };
      if (comments) data.comments = comments;
      await client.updateRecord('sysapproval_approver', sysId, data);
      return { sys_id: sysId, state: decision };
    }

    default:
      return null;
  }
}

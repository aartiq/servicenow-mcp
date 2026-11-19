import { describe, it, expect } from 'vitest';
import {
  parseEncodedQuery, normalizeRecordPolicies, normalizeCatalogVariables, flattenFields, catalogVariableFromRow,
  groupQuestionChoices, attachMultiRowChildren, multiRowSetIds, multiRowSubmitValue, parseMultiRowValue,
  translateCatalogScripts, catalogScriptList, type FormField,
} from '../../src/apps/form-model.js';

describe('parseEncodedQuery', () => {
  it('parses AND, ^OR and ^NQ into conditions', () => {
    const r = parseEncodedQuery('state=6^ORstate=7^NQstate=3^hold_reason=1^EQ');
    expect(r).toEqual({
      ok: true,
      conditions: [
        { field: 'state', oper: '=', value: '6' },
        { field: 'state', oper: '=', value: '7', or: true },
        { field: 'state', oper: '=', value: '3', newQuery: true },
        { field: 'hold_reason', oper: '=', value: '1' },
      ],
    });
  });

  it('reads every operator the view evaluates', () => {
    const q = 'aISEMPTY^bISNOTEMPTY^cLIKEfoo^dNOT LIKEbar^eSTARTSWITHx^fENDSWITHy^gIN1,2^hNOT IN3,4^i<5^j<=6^k>7^l>=8^m!=9^nANYTHING^o=';
    const r = parseEncodedQuery(q);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.conditions.map((c) => `${c.field} ${c.oper} ${c.value}`)).toEqual([
      'a ISEMPTY ', 'b ISNOTEMPTY ', 'c LIKE foo', 'd NOT LIKE bar', 'e STARTSWITH x', 'f ENDSWITH y', 'g IN 1,2',
      'h NOT IN 3,4', 'i < 5', 'j <= 6', 'k > 7', 'l >= 8', 'm != 9', 'n ANYTHING ', 'o = ',
    ]);
  });

  it('accepts an empty query and ignores ORDERBY', () => {
    expect(parseEncodedQuery('')).toEqual({ ok: true, conditions: [] });
    expect(parseEncodedQuery('active=true^ORDERBYnumber')).toEqual({ ok: true, conditions: [{ field: 'active', oper: '=', value: 'true' }] });
  });

  it('refuses what the browser cannot evaluate', () => {
    expect(parseEncodedQuery('caller_id.vip=true')).toMatchObject({ ok: false, reason: expect.stringMatching(/dot-walked/) });
    expect(parseEncodedQuery('assigned_to=javascript:gs.getUserID()')).toMatchObject({ ok: false, reason: expect.stringMatching(/script/) });
    expect(parseEncodedQuery('opened_atRELATIVEGT@hour@ago@1')).toMatchObject({ ok: false });
    expect(parseEncodedQuery('opened_atONToday@javascript:gs.beginningOfToday()@javascript:gs.endOfToday()')).toMatchObject({ ok: false });
    expect(parseEncodedQuery('short_descriptionVALCHANGES')).toMatchObject({ ok: false, reason: expect.stringMatching(/operator/) });
    expect(parseEncodedQuery('nameEMPTYSTRING')).toMatchObject({ ok: false });
    expect(parseEncodedQuery('priorityISEMPTYx')).toMatchObject({ ok: false });
    expect(parseEncodedQuery('RLQUERYtask.parent,>=1^ENDRLQUERY')).toMatchObject({ ok: false });
  });
});

// Rows shaped like the Table API returns them on demo2 (sys_ui_policy / _action, sys_data_policy2 / _rule).
describe('normalizeRecordPolicies', () => {
  const tables = ['incident', 'task'];
  const uiPolicies = [
    { sys_id: 'p1', table: 'incident', short_description: 'On hold reason', conditions: 'state=3^EQ', reverse_if_false: 'true', on_load: 'true', active: 'true', global: 'true', view: '', inherit: 'false', run_scripts: 'false', ui_type: '0', order: '100' },
    { sys_id: 'p2', table: 'incident', short_description: 'SOW only', conditions: 'close_code=Duplicate^EQ', reverse_if_false: 'true', on_load: 'true', active: 'true', global: 'false', view: 'sow', ui_type: '0', order: '100' },
    { sys_id: 'p3', table: 'task', short_description: 'Task not inherited', conditions: '', active: 'true', global: 'true', view: '', inherit: 'false', ui_type: '0' },
    { sys_id: 'p4', table: 'task', short_description: 'Task inherited', conditions: 'active=true', active: 'true', global: 'true', view: '', inherit: 'true', ui_type: '10', order: '50' },
    { sys_id: 'p5', table: 'incident', short_description: 'VIP caller', conditions: 'caller_id.vip=true', active: 'true', global: 'true', view: '', ui_type: '0' },
    { sys_id: 'p6', table: 'incident', short_description: 'With scripts', conditions: 'priority=1', active: 'true', global: 'true', view: '', run_scripts: 'true', on_load: 'false', reverse_if_false: 'false', ui_type: '', order: '200' },
    { sys_id: 'p7', table: 'incident', short_description: 'Mobile only', conditions: '', active: 'true', global: 'true', view: '', ui_type: '1' },
    { sys_id: 'p8', table: 'incident', short_description: 'No real actions', conditions: '', active: 'true', global: 'true', view: '', ui_type: '0' },
  ];
  const uiActions = [
    { ui_policy: { value: 'p1' }, field: 'hold_reason', visible: 'true', mandatory: 'true', disabled: 'ignore', cleared: 'false' },
    { ui_policy: 'p2', field: 'parent_incident', visible: 'ignore', mandatory: 'true', disabled: 'ignore' },
    { ui_policy: 'p3', field: 'assignment_group', mandatory: 'false' },
    { ui_policy: 'p4', field: 'short_description', disabled: 'true' },
    { ui_policy: 'p5', field: 'urgency', mandatory: 'true' },
    { ui_policy: 'p6', field: 'work_notes', mandatory: 'true', cleared: 'true' },
    { ui_policy: 'p7', field: 'impact', visible: 'false' },
    { ui_policy: 'p8', field: 'impact', visible: 'ignore', mandatory: 'ignore', disabled: 'ignore' },
  ];
  const dataPolicies = [
    { sys_id: 'd1', model_table: 'incident', short_description: 'Close info', conditions: 'stateIN6,7^EQ', reverse_if_false: 'true', active: 'true', enforce_ui: 'true', inherit: 'false' },
    { sys_id: 'd2', model_table: 'incident', short_description: 'Server only', conditions: '', active: 'true', enforce_ui: 'false' },
    { sys_id: 'd3', model_table: 'task', short_description: 'Parent not inherited', conditions: '', active: 'true', enforce_ui: 'true', inherit: 'false' },
  ];
  const dataRules = [
    { sys_data_policy: { value: 'd1' }, field: 'close_code', mandatory: 'true', disabled: 'ignore' },
    { sys_data_policy: 'd1', field: 'close_notes', mandatory: 'true', disabled: 'ignore' },
    { sys_data_policy: 'd2', field: 'impact', mandatory: 'true' },
    { sys_data_policy: 'd3', field: 'impact', mandatory: 'true' },
  ];
  const r = normalizeRecordPolicies({ tables, uiPolicies, uiActions, dataPolicies, dataRules });

  it('keeps global/default-view desktop policies, ordered, with inherited parents', () => {
    expect(r.policies.map((p) => p.description)).toEqual(['Task inherited', 'On hold reason', 'With scripts', 'Data policy: Close info']);
  });

  it('maps actions and flags', () => {
    const hold = r.policies.find((p) => p.description === 'On hold reason')!;
    expect(hold).toEqual({
      description: 'On hold reason', onLoad: true, reverse: true,
      conditions: [{ field: 'state', oper: '=', value: '3' }],
      actions: [{ field: 'hold_reason', visible: true, mandatory: true }],
    });
    const scripted = r.policies.find((p) => p.description === 'With scripts')!;
    expect(scripted).toMatchObject({ onLoad: false, reverse: false, actions: [{ field: 'work_notes', mandatory: true, cleared: true }] });
    expect(r.policies.find((p) => p.description === 'Task inherited')!.actions).toEqual([{ field: 'short_description', readOnly: true }]);
  });

  it('turns client-enforced data policies into mandatory/read-only rules', () => {
    expect(r.policies.at(-1)).toEqual({
      description: 'Data policy: Close info', onLoad: true, reverse: true,
      conditions: [{ field: 'state', oper: 'IN', value: '6,7' }],
      actions: [{ field: 'close_code', mandatory: true }, { field: 'close_notes', mandatory: true }],
    });
  });

  it('explains skipped and script policies in notes', () => {
    expect(r.notes.join(' ')).toMatch(/"VIP caller" \(uses a dot-walked field \(caller_id\.vip\)\)/);
    expect(r.notes.join(' ')).toMatch(/"With scripts" also runs a script/);
  });

  it('lists the fields the policies test', () => {
    expect(r.conditionFields.sort()).toEqual(['active', 'priority', 'state']);
  });
});

describe('multi-row variable sets', () => {
  // sn_sc returns the set with no children; columns come from item_option_new rows.
  const vars: any[] = [
    { active: true, label: 'Joiner', friendly_type: 'select_box', type: 5, name: 'joiner_type', id: 'v1', mandatory: true, choices: [{ value: 'employee', label: 'Employee' }] },
    { type: 'sc_multi_row', friendly_type: 'sc_multi_row', containerType: 'one_to_many', active: false, label: 'Access requests', name: 'access', id: 'a'.repeat(32), children: [], attributes: 'edge_encryption_enabled=true,max_rows=5', value: null },
  ];
  const rows = [
    { sys_id: 'c1', name: 'application', question_text: 'Application', type: '5', mandatory: 'true', active: 'true', order: '100', variable_set: { value: 'a'.repeat(32) } },
    { sys_id: 'c3', name: 'privileged', question_text: 'Privileged', type: '7', mandatory: 'false', active: 'true', order: '300' },
    { sys_id: 'c2', name: 'level', question_text: 'Level', type: '3', mandatory: 'true', active: 'true', order: '200' },
    { sys_id: 'c4', name: 'owner', question_text: 'Owner', type: '8', reference: { value: 'sys_user' }, reference_qual: 'active=true^EQ', order: '400' },
    { sys_id: 'c5', name: 'region', question_text: 'Region', type: '18', order: '500' },
  ];
  const choices = groupQuestionChoices([
    { question: { value: 'c1' }, value: 'crm', text: 'CRM', order: '2' },
    { question: { value: 'c1' }, value: 'erp', text: 'ERP', order: '1' },
    { question: { value: 'c1' }, value: 'old', text: 'Old', order: '3', inactive: 'true' },
    { question: { value: 'c2' }, value: 'read', text: 'Read', order: '1' },
  ]);

  it('finds set ids and builds columns from item_option_new rows', () => {
    expect(multiRowSetIds(vars)).toEqual(['a'.repeat(32)]);
    expect(choices.c1.map((c) => c.value)).toEqual(['erp', 'crm']);
    const copy = JSON.parse(JSON.stringify(vars));
    attachMultiRowChildren(copy, { ['a'.repeat(32)]: rows.map((r) => catalogVariableFromRow(r, choices[r.sys_id] || [])) });
    const fields = normalizeCatalogVariables(copy);
    const set = fields.find((f) => f.kind === 'multirow')!;
    expect(set).toMatchObject({ name: 'access', label: 'Access requests', maxRows: 5 });
    expect(set.children!.map((c) => `${c.name}:${c.kind}${c.mandatory ? '*' : ''}`)).toEqual([
      'application:select*', 'level:radio*', 'privileged:checkbox', 'owner:reference', 'region:unsupported',
    ]);
    expect(set.children![3]).toMatchObject({ reference: 'sys_user', refQualifier: 'active=true' });
    // Columns are not form fields of their own.
    expect(flattenFields(fields).map((f) => f.name)).toEqual(['joiner_type', 'access']);
  });

  it('drops a set whose columns could not be loaded', () => {
    expect(normalizeCatalogVariables([vars[1]])).toEqual([]);
  });

  const set: FormField = {
    name: 'access', label: 'Access requests', kind: 'multirow', maxRows: 2,
    children: [
      { name: 'application', label: 'Application', kind: 'select', mandatory: true },
      { name: 'ack', label: 'Acknowledged', kind: 'checkbox', mandatory: true },
      { name: 'note', label: 'Note', kind: 'text' },
      { name: 'file', label: 'File', kind: 'unsupported' },
    ],
  };

  it('submits a JSON string array keyed by column names, dropping empty rows and unknown keys', () => {
    const r = multiRowSubmitValue(set, [
      { application: 'crm', ack: 'true', note: 'x', evil: 'y', file: 'z' },
      { application: '', ack: '', note: '' },
    ]);
    expect(r.errors).toEqual([]);
    expect(JSON.parse(r.value)).toEqual([{ application: 'crm', ack: 'true', note: 'x' }]);
    expect(typeof r.value).toBe('string');
  });

  it('checks mandatory columns per row, required sets and the row limit', () => {
    const r = multiRowSubmitValue(set, JSON.stringify([{ application: 'crm', ack: 'false' }, { note: 'only a note' }]));
    expect(r.errors).toEqual(['Access requests row 1: Acknowledged', 'Access requests row 2: Application', 'Access requests row 2: Acknowledged']);
    expect(multiRowSubmitValue({ ...set, mandatory: true }, '[]').errors).toEqual(['Access requests: add at least one row']);
    const many = [1, 2, 3].map(() => ({ application: 'a', ack: 'true' }));
    expect(multiRowSubmitValue(set, many).errors).toEqual(['Access requests: at most 2 rows']);
  });

  it('parses values defensively', () => {
    expect(parseMultiRowValue('not json')).toEqual([]);
    expect(parseMultiRowValue('{"a":1}')).toEqual([]);
    expect(parseMultiRowValue('[{"a":1,"b":null},5]')).toEqual([{ a: '1', b: '' }]);
  });
});

describe('catalog client script translation', () => {
  const known = new Set(['mode', 'hide_detail', 'detail_field', 'request_type', 'environment', 'manager_approver', 'require_justification', 'justification', 'software_name', 'at_list']);
  const idMap = { aaa: 'mode', bbb: 'environment' };
  const tr = (type: 'onLoad' | 'onChange' | 'onSubmit', script: string, fieldName = '') =>
    translateCatalogScripts([{ type, script, fieldName }], known, idMap);

  it('translates if/else with an aliased getValue and newValue into two complementary rules', () => {
    const r = tr('onChange', `function onChange(control, oldValue, newValue, isLoading) {
    var requestType = g_form.getValue('request_type')
    if (requestType === 'access' && newValue === 'prod') {
        g_form.setDisplay('manager_approver', true)
        g_form.setMandatory('manager_approver', true)
    } else {
        g_form.setDisplay('manager_approver', false)
        g_form.setMandatory('manager_approver', false)
        g_form.setValue('manager_approver', '')
    }
}`, 'IO:environment');
    expect(r.skipped).toEqual([]);
    expect(r.translated).toEqual(['onChange script on environment']);
    expect(r.policies).toEqual([
      { description: 'onChange script on environment', onLoad: true, reverse: false,
        conditions: [{ field: 'request_type', oper: '=', value: 'access' }, { field: 'environment', oper: '=', value: 'prod' }],
        actions: [{ field: 'manager_approver', visible: true, mandatory: true }] },
      { description: 'onChange script on environment', onLoad: true, reverse: false,
        conditions: [{ field: 'request_type', oper: '!=', value: 'access' }, { field: 'environment', oper: '!=', value: 'prod', newQuery: true }],
        actions: [{ field: 'manager_approver', visible: false, mandatory: false, cleared: true }] },
    ]);
  });

  it('honours the isLoading guard, sets values once and drops messages', () => {
    const r = tr('onChange', `function onChange(control, oldValue, newValue, isLoading) {
    if (isLoading) {
        return
    }
    if (newValue == 'true') {
        g_form.setMandatory('justification', true);
        g_form.setValue('justification', 'Please explain');
        g_form.addInfoMessage('Justification made mandatory by client script.');
    } else if (newValue != '') {
        g_form.clearValue('justification');
    }
}`, 'IO:require_justification');
    expect(r.skipped).toEqual([]);
    expect(r.policies).toEqual([
      { description: 'onChange script on require_justification', onLoad: false, reverse: false,
        conditions: [{ field: 'require_justification', oper: '=', value: 'true' }],
        actions: [{ field: 'justification', mandatory: true, value: 'Please explain' }] },
      { description: 'onChange script on require_justification', onLoad: false, reverse: false,
        conditions: [{ field: 'require_justification', oper: '!=', value: 'true' }, { field: 'require_justification', oper: 'ISNOTEMPTY', value: '' }],
        actions: [{ field: 'justification', cleared: true }] },
    ]);
  });

  it('translates the generated getValue-map pattern with boolean expressions as arguments', () => {
    const r = tr('onChange', 'function onChange(control, oldValue, newValue, isLoading) { var v={}; ["hide_detail","mode"].forEach(function(n){v[n]=g_form.getValue(n);}); ' +
      'g_form.setDisplay("detail_field", (v["mode"]=="show_hide") || !(v["hide_detail"]=="true")); g_form.setReadOnly("at_list", v.mode !== "all"); }', 'IO:aaa');
    expect(r.skipped).toEqual([]);
    const byAction = r.policies.map((p) => [JSON.stringify(p.conditions), JSON.stringify(p.actions)]);
    expect(byAction).toEqual([
      ['[{"field":"mode","oper":"=","value":"show_hide"},{"field":"hide_detail","oper":"!=","value":"true","newQuery":true}]', '[{"field":"detail_field","visible":true}]'],
      ['[{"field":"mode","oper":"!=","value":"show_hide"},{"field":"hide_detail","oper":"=","value":"true"}]', '[{"field":"detail_field","visible":false}]'],
      ['[{"field":"mode","oper":"!=","value":"all"}]', '[{"field":"at_list","readOnly":true}]'],
      ['[{"field":"mode","oper":"=","value":"all"}]', '[{"field":"at_list","readOnly":false}]'],
    ]);
  });

  it('turns literal onLoad calls into field defaults', () => {
    const r = tr('onLoad', `function onLoad() {
      // Start simple
      g_form.setDisplay('detail_field', false);
      g_form.setMandatory('software_name', true);
      g_form.setReadOnly('mode', true);
      g_form.setValue('request_type', 'hardware');
    }`);
    expect(r.skipped).toEqual([]);
    expect(r.policies).toEqual([]);
    expect(r.defaults).toEqual({
      detail_field: { visible: false }, software_name: { mandatory: true }, mode: { readOnly: true }, request_type: { value: 'hardware' },
    });
  });

  it('dedupes identical scripts attached to several variables', () => {
    const s = 'function onChange(c, o, n, l) { g_form.setDisplay("software_name", g_form.getValue("request_type") == "software"); }';
    const r = translateCatalogScripts([
      { type: 'onChange', script: s, fieldName: 'IO:aaa' }, { type: 'onChange', script: s, fieldName: 'IO:bbb' },
    ], known, idMap);
    expect(r.translated).toHaveLength(2);
    expect(r.policies).toHaveLength(2);
  });

  it.each([
    ['a guard it cannot model', 'function onChange(c, o, newValue, isLoading) { if (isLoading || newValue == "") return; g_form.setDisplay("mode", true); }', /isLoading is only understood/],
    ['a GlideAjax call', 'function onChange(c, o, newValue, l) { var ga = new GlideAjax("X"); }', /not a plain field value/],
    ['a computed value', 'function onChange(c, o, newValue, l) { g_form.setValue("justification", newValue + "!"); }', /unsupported syntax/],
    ['a getReference callback', 'function onChange(c, o, newValue, l) { g_form.getReference("mode", function (r) {}); }', /not translated/],
    ['an unknown variable', 'function onChange(c, o, newValue, l) { g_form.setDisplay("nope", true); }', /unknown variable "nope"/],
    ['a statement mixed into a branch', 'function onChange(c, o, newValue, l) { if (newValue == "x") { g_form.setDisplay("mode", true); alert("hi"); } }', /does not understand/],
    ['oldValue', 'function onChange(control, oldValue, newValue, l) { if (oldValue == "x") g_form.setDisplay("mode", true); }', /oldValue is not translated/],
    ['a comparison against a number', 'function onChange(c, o, newValue, l) { if (newValue == 2) g_form.setDisplay("mode", true); }', /literal string/],
  ])('refuses %s and translates nothing from that script', (_n, script, reason) => {
    const r = tr('onChange', script as string, 'IO:aaa');
    expect(r.policies).toEqual([]);
    expect(r.translated).toEqual([]);
    expect(r.skipped).toEqual([{ script: 'onChange script on mode', reason: expect.stringMatching(reason as RegExp) }]);
  });

  it('refuses conditional onLoad scripts, onSubmit scripts and unknown watched variables', () => {
    expect(tr('onLoad', 'function onLoad() { if (g_form.getValue("mode") == "x") g_form.setDisplay("mode", false); }').skipped[0].reason).toMatch(/onLoad script with conditions/);
    expect(tr('onSubmit', 'function onSubmit() { return true; }').skipped[0].reason).toMatch(/onSubmit/);
    expect(tr('onChange', 'function onChange(c,o,n,l) { g_form.setDisplay("mode", true); }', 'IO:zzz').skipped[0].reason).toMatch(/not on this form/);
  });

  it('reads the sn_sc client_script shape', () => {
    const list = catalogScriptList({
      onLoad: [{ script: 'function onLoad() {}', sys_id: '1' }],
      onChange: [{ script: 'x', fieldName: 'IO:aaa', sys_id: '2' }],
      onSubmit: [],
    });
    expect(list.map((s) => `${s.type}:${s.fieldName}`)).toEqual(['onLoad:', 'onChange:IO:aaa']);
  });
});

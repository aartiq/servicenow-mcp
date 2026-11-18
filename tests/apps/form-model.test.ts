import { describe, it, expect } from 'vitest';
import {
  normalizeCatalogVariables, normalizeCatalogPolicies, catalogVariableIdMap, flattenFields,
  recordFieldFromDictionary, groupChoices,
} from '../../src/apps/form-model.js';

// Shapes taken from GET /api/sn_sc/servicecatalog/items/{id} on a Zurich+ instance.
const VARS = [
  { active: true, label: 'What do you want to test?', type: 5, friendly_type: 'select_box', name: 'mode', id: 'a1', mandatory: true,
    choices: [{ label: 'All types', value: 'all_types' }, { label: 'Show / hide', value: 'show_hide' }], value: '', displayvalue: '' },
  { active: true, label: 'Manager approver', type: 8, friendly_type: 'reference', name: 'manager_approver', id: 'a2', reference: 'sys_user', ref_qualifier: 'active=true^EQ' },
  { active: true, label: 'Owner', type: 8, friendly_type: 'reference', name: 'owner', id: 'a2b', reference: 'sys_user', ref_qualifier: 'javascript:new Foo().bar()' },
  { active: false, type: 0, friendly_type: 'container_start', containerType: 'checkbox_container', label: 'Options', children: [
    { active: true, label: 'Hide the detail field?', type: 7, friendly_type: 'check_box', name: 'hide_detail', id: 'a3' },
  ] },
  { active: true, label: 'Detail field', type: 6, friendly_type: 'single_line_text', name: 'detail_field', id: 'a4', max_length: 80 },
  { active: false, type: 19, friendly_type: 'container_start', label: 'All variable types', name: 'at_container_start', containerType: 'container', children: [
    { active: true, label: 'Requested for', type: 31, friendly_type: 'requested_for', name: 'at_requested_for', id: 'a5', mandatory: true, reference: 'sys_user',
      value: 'javascript:gs.getUserID();', displayvalue: 'System Administrator' },
    { active: true, label: 'List collector', type: 21, friendly_type: 'list_collector', name: 'at_list', id: 'a6', table: 'sys_user' },
    { active: true, label: 'Attachment', type: 33, friendly_type: 'attachment', display_type: 'Attachment', name: 'at_attachment', id: 'a7' },
    { active: true, label: 'formatter', type: 12, friendly_type: 'break', name: 'at_break', id: 'a8' },
    { active: true, label: 'Yes / No', type: 1, friendly_type: 'yes_no', name: 'at_yesno', id: 'a9', choices: [{ label: '-- None --', value: '' }, { label: 'Yes', value: 'Yes' }, { label: 'No', value: 'No' }] },
    { active: true, label: 'Scale', type: 4, friendly_type: 'numeric_scale', name: 'at_scale', id: 'a10', choices: [{ label: '', value: '' }, { label: '1', value: '1' }] },
    { active: false, label: 'Old', type: 6, friendly_type: 'single_line_text', name: 'old', id: 'a11' },
  ] },
];

describe('normalizeCatalogVariables', () => {
  const fields = normalizeCatalogVariables(VARS, { currentUserSysId: 'u'.repeat(32), currentUserName: 'Ada Lovelace' });
  const flat = flattenFields(fields);
  const byName = Object.fromEntries(flat.map((f) => [f.name, f]));

  it('maps catalog types to field kinds', () => {
    expect(byName.mode.kind).toBe('select');
    expect(byName.mode.mandatory).toBe(true);
    expect(byName.manager_approver.kind).toBe('reference');
    expect(byName.hide_detail.kind).toBe('checkbox');
    expect(byName.detail_field).toMatchObject({ kind: 'text', maxLength: 80 });
    expect(byName.at_list).toMatchObject({ kind: 'list', reference: 'sys_user' });
    expect(byName.at_yesno.kind).toBe('select');
    expect(byName.at_scale.kind).toBe('radio');
  });

  it('keeps plain reference qualifiers and drops script ones', () => {
    expect(byName.manager_approver.refQualifier).toBe('active=true');
    expect(byName.owner.refQualifier).toBeUndefined();
  });

  it('resolves gs.getUserID() defaults to the current user', () => {
    expect(byName.at_requested_for).toMatchObject({ value: 'u'.repeat(32), displayValue: 'System Administrator' });
  });

  it('drops script defaults it cannot resolve', () => {
    const [f] = normalizeCatalogVariables([{ active: true, label: 'X', friendly_type: 'reference', name: 'x', reference: 'sys_user', value: 'javascript:gs.getUserID()' }]);
    expect(f.value).toBeUndefined();
  });

  it('flags types the form cannot fill and skips layout-only and inactive variables', () => {
    expect(byName.at_attachment).toMatchObject({ kind: 'unsupported', typeLabel: 'Attachment' });
    expect(byName.at_break).toBeUndefined();
    expect(byName.old).toBeUndefined();
  });

  it('nests containers, rendering the unnamed checkbox wrapper without a legend', () => {
    const containers = fields.filter((f) => f.kind === 'container');
    expect(containers).toHaveLength(2);
    expect(containers[0].label).toBe('');
    expect(containers[1].label).toBe('All variable types');
  });

  it('removes empty radio choices but keeps the select "None" option', () => {
    expect(byName.at_scale.choices!.map((c) => c.value)).toEqual(['1']);
    expect(byName.at_yesno.choices!.map((c) => c.value)).toEqual(['', 'Yes', 'No']);
  });
});

describe('normalizeCatalogPolicies', () => {
  const policies = [
    {
      short_description: 'Show detail', reverse: true, onload: true,
      conditions: [{ field: 'IO:a3', oper: '=', value: 'false', or: false, newquery: false }],
      actions: [
        { name: 'IO:a4', visible: 'true', mandatory: 'ignore', disabled: 'ignore', cleared: 'false' },
        { name: 'IO:missing', visible: 'true' },
      ],
    },
    { short_description: 'No-op', conditions: [], actions: [{ name: 'IO:a4', visible: 'ignore', mandatory: 'ignore', disabled: 'ignore' }] },
  ];

  it('translates IO:<sys_id> to variable names and tri-state flags to booleans', () => {
    const out = normalizeCatalogPolicies(policies, catalogVariableIdMap(VARS));
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({
      description: 'Show detail', onLoad: true, reverse: true,
      conditions: [{ field: 'hide_detail', oper: '=', value: 'false' }],
      actions: [{ field: 'detail_field', visible: true }],
    });
  });

  it('maps ids inside containers', () => {
    expect(catalogVariableIdMap(VARS).a5).toBe('at_requested_for');
  });
});

describe('record form dictionary mapping', () => {
  it('maps dictionary types', () => {
    expect(recordFieldFromDictionary({ element: 'caller_id', column_label: 'Caller', internal_type: 'reference', reference: 'sys_user', mandatory: 'true' }))
      .toMatchObject({ kind: 'reference', reference: 'sys_user', mandatory: true });
    expect(recordFieldFromDictionary({ element: 'active', internal_type: 'boolean' })!.kind).toBe('checkbox');
    expect(recordFieldFromDictionary({ element: 'description', internal_type: 'string', max_length: '4000' })!.kind).toBe('textarea');
    expect(recordFieldFromDictionary({ element: 'work_notes', internal_type: 'journal_input' })!.help).toMatch(/activity/);
    expect(recordFieldFromDictionary({ element: 'script', internal_type: 'script' })!.kind).toBe('unsupported');
    expect(recordFieldFromDictionary({ element: 'opened_at', internal_type: 'glide_date_time' })!.kind).toBe('datetime');
  });

  it('hides passwords and system fields', () => {
    expect(recordFieldFromDictionary({ element: 'secret', internal_type: 'password2' })).toBeNull();
    expect(recordFieldFromDictionary({ element: 'sys_updated_on', internal_type: 'glide_date_time' })).toBeNull();
  });

  it('turns choice fields into selects with their dependent field', () => {
    const f = recordFieldFromDictionary(
      { element: 'subcategory', internal_type: 'string', choice: '1', dependent_on_field: 'category' },
      [{ value: 'email', label: 'Email', dependentValue: 'software' }],
    );
    expect(f).toMatchObject({ kind: 'select', dependentOn: 'category' });
  });

  it('keeps suggestion fields as text and marks dropdowns without None', () => {
    const opts = [{ value: '1', label: 'New' }];
    expect(recordFieldFromDictionary({ element: 'short_description', internal_type: 'string', choice: '2' }, opts)!.kind).toBe('text');
    expect(recordFieldFromDictionary({ element: 'state', internal_type: 'integer', choice: '3' }, opts)).toMatchObject({ kind: 'select', noNone: true });
    expect(recordFieldFromDictionary({ element: 'priority', internal_type: 'integer', choice: '1' }, opts)!.noNone).toBeUndefined();
  });

  it('prefers choices from the most specific table', () => {
    const rows = [
      { name: 'task', element: 'state', value: '1', label: 'Open' },
      { name: 'incident', element: 'state', value: '1', label: 'New' },
      { name: 'incident', element: 'state', value: '2', label: 'In Progress' },
      { name: 'incident', element: 'subcategory', value: 'email', label: 'Email', dependent_value: 'software' },
    ];
    const g = groupChoices(rows, ['incident', 'task']);
    expect(g.state.map((c) => c.label)).toEqual(['New', 'In Progress']);
    expect(g.subcategory[0].dependentValue).toBe('software');
  });
});

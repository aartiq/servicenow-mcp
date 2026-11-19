/**
 * HTML for the NowAIKit MCP App views. Each view is one self-contained HTML5 document (inline CSS and
 * JS only), so it renders under the host's default CSP with no network access of its own.
 */
import { BRIDGE_JS, BASE_CSS } from './bridge.js';

/** Field rendering, value tracking, validation and declarative UI policies. */
const FIELDS_JS = String.raw`
(function () {
  var NK = window.NK, el = NK.el;

  /** Form state: values, nodes and the effective visible/mandatory/readOnly flags per field. */
  NK.createForm = function (fields, policies) {
    var st = { fields: {}, order: [], values: {}, display: {}, nodes: {}, inputs: {}, eff: {}, base: {}, policies: policies || [], listeners: [] };
    function walk(list) { list.forEach(function (f) { st.fields[f.name] = f; st.order.push(f.name); if (f.children) walk(f.children); }); }
    walk(fields);
    st.order.forEach(function (n) {
      var f = st.fields[n];
      st.base[n] = { visible: true, mandatory: !!f.mandatory, readOnly: !!f.readOnly };
      if (f.value != null) st.values[n] = String(f.value);
      if (f.displayValue != null) st.display[n] = String(f.displayValue);
    });
    st.onChange = function (fn) { st.listeners.push(fn); };
    st.changed = function (name) { NK.applyPolicies(st); refreshDependents(st, name); st.listeners.forEach(function (fn) { fn(name); }); };
    return st;
  };

  NK.renderFields = function (container, fields, st) {
    fields.forEach(function (f) { container.appendChild(renderField(f, st)); });
    NK.applyPolicies(st);
    st.order.forEach(function (n) { refreshDependents(st, n); });
  };

  function choiceOptions(f, st, select) {
    var current = st.values[f.name] || '';
    select.innerHTML = '';
    var list = (f.choices || []).filter(function (c) {
      if (!f.dependentOn || c.dependentValue == null || c.dependentValue === '') return true;
      return c.dependentValue === (st.values[f.dependentOn] || '');
    });
    var hasNone = list.some(function (c) { return c.value === ''; });
    if (!hasNone && !(f.noNone && current)) select.appendChild(el('option', { value: '' }, '-- None --'));
    var found = false;
    list.forEach(function (c) {
      var o = el('option', { value: c.value }, c.label);
      if (c.value === current) { o.selected = true; found = true; }
      select.appendChild(o);
    });
    if (!found && current) {
      select.appendChild(el('option', { value: current, selected: true }, st.display[f.name] || current));
    }
  }

  function refreshDependents(st, changedName) {
    st.order.forEach(function (n) {
      var f = st.fields[n];
      if (f.dependentOn === changedName && st.inputs[n] && st.inputs[n].tagName === 'SELECT') choiceOptions(f, st, st.inputs[n]);
    });
  }

  function setVal(st, name, value, display) {
    st.values[name] = value;
    if (display !== undefined) st.display[name] = display;
    var w = st.nodes[name];
    if (w) { w.classList.remove('invalid'); var e = w.querySelector('.err'); if (e) e.remove(); }
    st.changed(name);
  }

  function lookup(f, term) {
    return NK.callTool('app_lookup_reference', { table: f.reference, term: term, qualifier: f.refQualifier || '' })
      .then(function (r) { return (r && r.results) || []; });
  }

  /** Typeahead used by reference (single) and list (multi) fields. */
  function typeahead(f, st, id, onPick) {
    var box = el('div', { className: 'ref' });
    var input = el('input', { type: 'text', id: id, autocomplete: 'off', placeholder: 'Search ' + (f.label || f.reference || '').toLowerCase() });
    var list = el('div', { className: 'ref-list' });
    list.style.display = 'none';
    var timer = null, seq = 0;
    input.addEventListener('input', function () {
      if (f.kind === 'reference') { st.values[f.name] = ''; st.display[f.name] = ''; }
      clearTimeout(timer);
      var term = input.value.trim();
      if (term.length < 2) { list.style.display = 'none'; return; }
      timer = setTimeout(function () {
        var my = ++seq;
        lookup(f, term).then(function (rows) {
          if (my !== seq) return;
          list.innerHTML = '';
          if (!rows.length) list.appendChild(el('div', { className: 'muted' }, 'No matches'));
          rows.forEach(function (r) {
            list.appendChild(el('div', { onmousedown: function (ev) { ev.preventDefault(); list.style.display = 'none'; onPick(r, input); } },
              r.display, r.secondary ? el('span', { className: 'meta' }, '  ' + r.secondary) : null));
          });
          list.style.display = 'block';
        }).catch(function (err) { list.innerHTML = ''; list.appendChild(el('div', { className: 'err' }, err.message)); list.style.display = 'block'; });
      }, 250);
    });
    input.addEventListener('blur', function () { setTimeout(function () { list.style.display = 'none'; }, 150); });
    box.appendChild(input); box.appendChild(list);
    return { box: box, input: input };
  }

  function renderField(f, st) {
    var wrap;
    if (f.kind === 'container') {
      wrap = f.label ? el('fieldset', null, el('legend', { text: f.label })) : el('div');
      (f.children || []).forEach(function (c) { wrap.appendChild(renderField(c, st)); });
      st.nodes[f.name] = wrap;
      return wrap;
    }
    if (f.kind === 'label') {
      wrap = el('div', { className: 'field' }, el('div', { className: 'lbl', text: f.label }));
      st.nodes[f.name] = wrap;
      return wrap;
    }
    var id = 'f_' + f.name.replace(/[^a-zA-Z0-9_]/g, '_');
    wrap = el('div', { className: 'field' });
    st.nodes[f.name] = wrap;
    var labelEl = el('label', { 'for': id, text: f.label });
    var control;

    if (f.kind === 'unsupported') {
      wrap.appendChild(el('div', { className: 'lbl', text: f.label }));
      wrap.appendChild(el('div', { className: 'help', text: 'This ' + (f.typeLabel || 'field') + ' field can only be filled in in ServiceNow.' }));
      return wrap;
    }
    if (f.kind === 'checkbox') {
      control = el('input', { type: 'checkbox', id: id });
      control.checked = st.values[f.name] === 'true';
      control.addEventListener('change', function () { setVal(st, f.name, control.checked ? 'true' : 'false'); });
      wrap.appendChild(el('div', { className: 'opts' }, el('label', null, control, el('span', { className: 'lbltext', text: f.label }))));
      st.inputs[f.name] = control;
      if (f.help) wrap.appendChild(el('div', { className: 'help', text: f.help }));
      return wrap;
    }
    wrap.appendChild(labelEl);
    if (f.kind === 'select') {
      control = el('select', { id: id });
      choiceOptions(f, st, control);
      control.addEventListener('change', function () { setVal(st, f.name, control.value, control.options[control.selectedIndex].text); });
    } else if (f.kind === 'radio') {
      control = el('div', { className: 'opts', role: 'radiogroup', id: id });
      (f.choices || []).forEach(function (c) {
        var r = el('input', { type: 'radio', name: id, value: c.value });
        r.checked = st.values[f.name] === c.value;
        r.addEventListener('change', function () { if (r.checked) setVal(st, f.name, c.value, c.label); });
        control.appendChild(el('label', null, r, c.label));
      });
    } else if (f.kind === 'reference') {
      var ta = typeahead(f, st, id, function (r, input) { input.value = r.display; setVal(st, f.name, r.sys_id, r.display); });
      ta.input.value = st.display[f.name] || '';
      control = ta.box;
      st.inputs[f.name] = ta.input;
    } else if (f.kind === 'list') {
      var chips = el('div', { className: 'chips' });
      var ids = (st.values[f.name] || '').split(',').filter(Boolean);
      var names = st.display[f.name] ? st.display[f.name].split(',').map(function (s) { return s.trim(); }) : ids.slice();
      var draw = function () {
        chips.innerHTML = '';
        ids.forEach(function (sid, i) {
          chips.appendChild(el('span', null, names[i] || sid, el('button', { type: 'button', title: 'Remove', onclick: function () {
            ids.splice(i, 1); names.splice(i, 1); draw(); setVal(st, f.name, ids.join(','), names.join(', '));
          } }, 'x')));
        });
      };
      var tl = typeahead(f, st, id, function (r, input) {
        input.value = '';
        if (ids.indexOf(r.sys_id) === -1) { ids.push(r.sys_id); names.push(r.display); draw(); setVal(st, f.name, ids.join(','), names.join(', ')); }
      });
      draw();
      control = el('div', null, tl.box, chips);
      st.inputs[f.name] = tl.input;
    } else {
      var types = { textarea: null, email: 'email', url: 'url', number: 'number', date: 'date', datetime: 'datetime-local', password: 'password' };
      control = f.kind === 'textarea' ? el('textarea', { id: id }) : el('input', { type: types[f.kind] || 'text', id: id });
      if (f.maxLength) control.setAttribute('maxlength', String(f.maxLength));
      var v = st.values[f.name] || '';
      if (f.kind === 'datetime' && v) v = v.replace(' ', 'T').slice(0, 16);
      control.value = v;
      control.addEventListener('input', function () {
        var val = control.value;
        if (f.kind === 'datetime' && val) val = val.replace('T', ' ') + (val.length === 16 ? ':00' : '');
        setVal(st, f.name, val);
      });
    }
    if (!st.inputs[f.name]) st.inputs[f.name] = control;
    wrap.appendChild(control);
    if (f.help) wrap.appendChild(el('div', { className: 'help', text: f.help }));
    return wrap;
  }

  // ─── UI policies (declarative part only; scripts can't run in the sandbox) ───
  function test(c, st) {
    var v = st.values[c.field] == null ? '' : String(st.values[c.field]);
    var x = c.value == null ? '' : String(c.value);
    var lv = v.toLowerCase(), lx = x.toLowerCase();
    var list = x.split(',').map(function (s) { return s.trim(); });
    switch (c.oper) {
      case '=': return v === x;
      case '!=': return v !== x;
      case 'ISEMPTY': return v === '';
      case 'ISNOTEMPTY': return v !== '';
      case 'LIKE': return lv.indexOf(lx) !== -1;
      case 'NOT LIKE': return lv.indexOf(lx) === -1;
      case 'STARTSWITH': return lv.indexOf(lx) === 0;
      case 'ENDSWITH': return lx === '' || lv.slice(-lx.length) === lx;
      case 'IN': return list.indexOf(v) !== -1;
      case 'NOT IN': return list.indexOf(v) === -1;
      case '<': return parseFloat(v) < parseFloat(x);
      case '<=': return parseFloat(v) <= parseFloat(x);
      case '>': return parseFloat(v) > parseFloat(x);
      case '>=': return parseFloat(v) >= parseFloat(x);
      case 'ANYTHING': return true;
      default: return false;
    }
  }
  /** Encoded-query semantics: ^NQ splits OR'd queries; within a query ^OR binds tighter than AND. */
  function evaluate(conds, st) {
    if (!conds.length) return true;
    var queries = [[]];
    conds.forEach(function (c) {
      if (c.newQuery && queries[queries.length - 1].length) queries.push([]);
      var q = queries[queries.length - 1];
      if (c.or && q.length) q[q.length - 1].push(c); else q.push([c]);
    });
    return queries.some(function (q) {
      return q.every(function (group) { return group.some(function (c) { return test(c, st); }); });
    });
  }
  NK.applyPolicies = function (st) {
    var eff = {};
    st.order.forEach(function (n) { var b = st.base[n]; eff[n] = { visible: b.visible, mandatory: b.mandatory, readOnly: b.readOnly }; });
    st.policies.forEach(function (p) {
      var ok = evaluate(p.conditions || [], st);
      if (!ok && !p.reverse) return;
      p.actions.forEach(function (a) {
        var e = eff[a.field];
        if (!e) return;
        if (a.visible !== undefined) e.visible = ok ? a.visible : !a.visible;
        // "Reverse if false" flips each action, as ServiceNow does.
        if (a.mandatory !== undefined) e.mandatory = ok ? a.mandatory : !a.mandatory;
        if (a.readOnly !== undefined) e.readOnly = ok ? a.readOnly : !a.readOnly;
        if (ok && a.cleared && st.values[a.field]) st.values[a.field] = '';
      });
    });
    st.eff = eff;
    st.order.forEach(function (n) {
      var w = st.nodes[n], e = eff[n];
      if (!w) return;
      w.style.display = e.visible ? '' : 'none';
      var lab = w.querySelector('label[for], .lbltext');
      if (lab) lab.classList.toggle('req', !!e.mandatory);
      if (st.inputs[n]) {
        var all = w.querySelectorAll('input, select, textarea, button');
        for (var i = 0; i < all.length; i++) all[i].disabled = !!e.readOnly;
      }
    });
  };

  /** Mandatory check over visible fields. Marks invalid fields and returns their labels. */
  NK.validate = function (st) {
    var missing = [];
    st.order.forEach(function (n) {
      var f = st.fields[n], e = st.eff[n], w = st.nodes[n];
      if (!e || !w || f.kind === 'container' || f.kind === 'label' || f.kind === 'unsupported') return;
      var hidden = !e.visible || (w.offsetParent === null && w.style.display === 'none');
      var empty = !st.values[n] || (f.kind === 'checkbox' && st.values[n] !== 'true');
      var old = w.querySelector('.err'); if (old) old.remove();
      w.classList.remove('invalid');
      if (e.mandatory && !hidden && empty) {
        missing.push(f.label);
        w.classList.add('invalid');
        w.appendChild(el('div', { className: 'err', text: 'Required' }));
      }
    });
    return missing;
  };

  /** Values of visible, non-empty fields. */
  NK.collect = function (st, onlyChanged) {
    var out = {};
    st.order.forEach(function (n) {
      var f = st.fields[n], e = st.eff[n];
      if (!e || !e.visible || f.kind === 'container' || f.kind === 'label' || f.kind === 'unsupported') return;
      var v = st.values[n];
      if (onlyChanged) { if ((v || '') !== (f.value || '')) out[n] = v || ''; }
      else if (v !== undefined && v !== '') out[n] = v;
    });
    return out;
  };
})();
`;

const CATALOG_JS = String.raw`
(function () {
  var NK = window.NK, el = NK.el;
  NK.start('NowAIKit catalog form', function (d) {
    var root = document.getElementById('app');
    if (!d || d.error) return NK.fail((d && d.error) || 'Could not load this catalog item.');
    root.innerHTML = '';
    var item = d.item || {};
    root.appendChild(el('h1', { text: item.name || 'Catalog request' }));
    var sub = [item.short_description, item.price && item.show_price !== false ? item.price : ''].filter(Boolean).join('  ·  ');
    if (sub) root.appendChild(el('p', { className: 'sub', text: sub }));
    var desc = NK.plain(item.description);
    if (desc && desc !== item.short_description) root.appendChild(el('details', { className: 'field' }, el('summary', { className: 'muted', text: 'About this item' }), el('p', { text: desc })));
    (d.notes || []).forEach(function (n) { root.appendChild(el('div', { className: 'banner', text: n })); });

    var st = NK.createForm(d.fields || [], d.policies || []);
    var form = el('form', { novalidate: true });
    NK.renderFields(form, d.fields || [], st);
    var qty = null;
    if (item.show_quantity) {
      qty = el('input', { type: 'number', min: '1', value: '1', id: 'nk_qty' });
      form.appendChild(el('div', { className: 'field' }, el('label', { 'for': 'nk_qty', text: 'Quantity' }), qty));
    }
    var status = el('div');
    var submit = el('button', { type: 'submit', className: 'primary' }, 'Submit request');
    var actions = el('div', { className: 'actions' }, submit);
    if (d.item_url) actions.appendChild(el('button', { type: 'button', onclick: function () { NK.openLink(d.item_url); } }, 'Open in ServiceNow'));
    form.appendChild(actions);
    form.appendChild(status);
    root.appendChild(form);

    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      status.innerHTML = '';
      var missing = NK.validate(st);
      if (missing.length) { status.appendChild(el('div', { className: 'banner error', text: 'Please fill in: ' + missing.join(', ') })); return; }
      submit.disabled = true; submit.textContent = 'Submitting...';
      NK.callTool('app_submit_catalog_form', { item_sys_id: item.sys_id, variables: NK.collect(st), quantity: qty ? Number(qty.value) || 1 : 1 })
        .then(function (r) {
          form.style.display = 'none';
          var num = r.request_number || r.number || '';
          var done = el('div', { className: 'banner ok' }, 'Submitted' + (num ? ': ' + num : '') + '.');
          root.appendChild(done);
          if (r.request_url) root.appendChild(el('div', { className: 'actions' }, el('button', { type: 'button', onclick: function () { NK.openLink(r.request_url); } }, 'View request')));
          NK.sendMessage('I submitted the "' + (item.name || 'catalog') + '" request' + (num ? ' (' + num + ')' : '') + ' using the form.');
        })
        .catch(function (err) {
          submit.disabled = false; submit.textContent = 'Submit request';
          status.appendChild(el('div', { className: 'banner error', text: err.message }));
        });
    });
  });
})();
`;

const RECORD_JS = String.raw`
(function () {
  var NK = window.NK, el = NK.el;
  NK.start('NowAIKit record form', function (d) {
    var root = document.getElementById('app');
    if (!d || d.error) return NK.fail((d && d.error) || 'Could not load this form.');
    root.innerHTML = '';
    var isNew = !d.sys_id;
    root.appendChild(el('h1', { text: (isNew ? 'New ' : '') + (d.table_label || d.table) + (d.number ? ' ' + d.number : '') }));
    if (d.subtitle) root.appendChild(el('p', { className: 'sub', text: d.subtitle }));
    (d.notes || []).forEach(function (n) { root.appendChild(el('div', { className: 'banner', text: n })); });
    var st = NK.createForm(d.fields || [], d.policies || []);
    var form = el('form', { novalidate: true });
    NK.renderFields(form, d.fields || [], st);
    var status = el('div');
    var save = el('button', { type: 'submit', className: 'primary' }, isNew ? 'Create' : 'Save');
    var actions = el('div', { className: 'actions' }, save);
    if (d.record_url) actions.appendChild(el('button', { type: 'button', onclick: function () { NK.openLink(d.record_url); } }, 'Open in ServiceNow'));
    form.appendChild(actions); form.appendChild(status);
    root.appendChild(form);
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      status.innerHTML = '';
      var missing = NK.validate(st);
      if (missing.length) { status.appendChild(el('div', { className: 'banner error', text: 'Please fill in: ' + missing.join(', ') })); return; }
      var values = NK.collect(st, !isNew);
      if (!isNew && !Object.keys(values).length) { status.appendChild(el('div', { className: 'banner', text: 'Nothing has changed.' })); return; }
      save.disabled = true;
      NK.callTool('app_save_record', { table: d.table, sys_id: d.sys_id || '', values: values })
        .then(function (r) {
          save.disabled = false;
          Object.keys(values).forEach(function (k) { if (st.fields[k]) st.fields[k].value = values[k]; });
          var label = r.number || r.sys_id || '';
          status.appendChild(el('div', { className: 'banner ok', text: (isNew ? 'Created ' : 'Saved ') + label + '.' }));
          if (isNew) { d.sys_id = r.sys_id; save.textContent = 'Save'; isNew = false; }
          NK.sendMessage((r.created ? 'I created ' : 'I updated ') + (d.table_label || d.table) + ' ' + label + ' using the form. Changed fields: ' + Object.keys(values).join(', ') + '.');
        })
        .catch(function (err) { save.disabled = false; status.appendChild(el('div', { className: 'banner error', text: err.message })); });
    });
  });
})();
`;

const APPROVALS_JS = String.raw`
(function () {
  var NK = window.NK, el = NK.el;
  NK.start('NowAIKit approvals', function (d) {
    var root = document.getElementById('app');
    if (!d || d.error) return NK.fail((d && d.error) || 'Could not load approvals.');
    root.innerHTML = '';
    var items = d.approvals || [];
    root.appendChild(el('h1', { text: 'Waiting for your approval' }));
    root.appendChild(el('p', { className: 'sub', text: items.length ? items.length + ' pending' + (d.more ? ' (showing the first ' + items.length + ')' : '') : 'Nothing is waiting for you.' }));
    var decided = [];
    items.forEach(function (a) {
      var comment = el('input', { type: 'text', placeholder: 'Comment (required to reject)' });
      var status = el('div');
      var approve = el('button', { type: 'button', className: 'primary' }, 'Approve');
      var reject = el('button', { type: 'button', className: 'danger' }, 'Reject');
      var card = el('div', { className: 'card' },
        el('h2', { text: (a.number ? a.number + ': ' : '') + (a.short_description || a.document || 'Approval') }),
        el('div', { className: 'meta', text: [a.type, a.requested_by ? 'requested by ' + a.requested_by : '', a.requested_for && a.requested_for !== a.requested_by ? 'for ' + a.requested_for : '', a.created ? 'since ' + a.created : '', a.price ? a.price : ''].filter(Boolean).join('  ·  ') }),
        el('div', { className: 'row' }, comment, approve, reject,
          a.url ? el('button', { type: 'button', onclick: function () { NK.openLink(a.url); } }, 'Open') : null),
        status);
      function decide(decision) {
        status.innerHTML = '';
        if (decision === 'rejected' && !comment.value.trim()) { status.appendChild(el('div', { className: 'err', text: 'Add a comment to reject.' })); comment.focus(); return; }
        approve.disabled = reject.disabled = true;
        NK.callTool('app_decide_approval', { sys_id: a.sys_id, decision: decision, comments: comment.value.trim() })
          .then(function () {
            card.querySelector('.row').remove();
            status.appendChild(el('div', { className: 'banner ok', text: decision === 'approved' ? 'Approved.' : 'Rejected.' }));
            decided.push((decision === 'approved' ? 'approved ' : 'rejected ') + (a.number || a.sys_id));
            if (decided.length === items.length) NK.sendMessage('I went through my approvals in the form: ' + decided.join(', ') + '.');
          })
          .catch(function (err) { approve.disabled = reject.disabled = false; status.appendChild(el('div', { className: 'err', text: err.message })); });
      }
      approve.addEventListener('click', function () { decide('approved'); });
      reject.addEventListener('click', function () { decide('rejected'); });
      root.appendChild(card);
    });
  });
})();
`;

function page(title: string, viewJs: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>${BASE_CSS}</style>
</head>
<body>
<div id="app"><p class="muted">Loading...</p></div>
<script>${BRIDGE_JS}</script>
<script>${FIELDS_JS}</script>
<script>${viewJs}</script>
</body>
</html>`;
}

export const CATALOG_FORM_HTML = page('Catalog request', CATALOG_JS);
export const RECORD_FORM_HTML = page('Record form', RECORD_JS);
export const APPROVALS_HTML = page('Approvals', APPROVALS_JS);

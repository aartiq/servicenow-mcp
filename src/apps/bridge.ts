/**
 * Browser-side runtime shared by every NowAIKit MCP App view.
 *
 * Implements the MCP Apps (SEP-1865, io.modelcontextprotocol/ui, protocol 2026-01-26) view side by
 * hand: JSON-RPC 2.0 over postMessage to the host (Claude, ChatGPT, VS Code, Goose, ...). No external
 * script is loaded, so the views work under the host's default CSP (inline scripts only, no network,
 * no eval). Every ServiceNow call goes back through the host as `tools/call`, so it runs with the same
 * identity and permission gates as any other NowAIKit tool call.
 *
 * Kept as plain ES2017 without template literals because it is embedded in a TS template string.
 */
export const BRIDGE_JS = String.raw`
(function () {
  var nextId = 1;
  var pending = {};
  var handlers = {};
  var NK = (window.NK = { hostContext: {}, toolInput: {} });

  function post(msg) { window.parent.postMessage(msg, '*'); }

  NK.request = function (method, params) {
    return new Promise(function (resolve, reject) {
      var id = nextId++;
      pending[id] = { resolve: resolve, reject: reject };
      post({ jsonrpc: '2.0', id: id, method: method, params: params || {} });
      setTimeout(function () {
        if (pending[id]) { delete pending[id]; reject(new Error('The host did not answer ' + method + ' in time.')); }
      }, 180000);
    });
  };
  NK.notify = function (method, params) { post({ jsonrpc: '2.0', method: method, params: params || {} }); };
  NK.on = function (method, fn) { handlers[method] = fn; };

  window.addEventListener('message', function (e) {
    var d = e.data;
    if (!d || d.jsonrpc !== '2.0') return;
    if (d.id !== undefined && d.method === undefined) {
      var p = pending[d.id];
      if (!p) return;
      delete pending[d.id];
      if (d.error) p.reject(new Error(d.error.message || 'Host error')); else p.resolve(d.result);
      return;
    }
    if (!d.method) return;
    var h = handlers[d.method];
    if (h) { try { h(d.params || {}); } catch (err) { console.error(err); } }
    if (d.id !== undefined) post({ jsonrpc: '2.0', id: d.id, result: {} });
  });

  function textOf(r) {
    return ((r && r.content) || []).map(function (c) { return c && c.text ? c.text : ''; }).join('');
  }
  NK.resultData = function (r) {
    if (r && r.structuredContent !== undefined) return r.structuredContent;
    var t = textOf(r);
    try { return JSON.parse(t); } catch (_) { return { text: t }; }
  };
  NK.callTool = function (name, args) {
    return NK.request('tools/call', { name: name, arguments: args || {} }).then(function (r) {
      if (r && r.isError) throw new Error(textOf(r).replace(/^Error:\s*/, '') || 'The request failed.');
      return NK.resultData(r);
    });
  };
  NK.sendMessage = function (text) {
    return NK.request('ui/message', { role: 'user', content: { type: 'text', text: text } }).catch(function () {});
  };
  NK.openLink = function (url) {
    return NK.request('ui/open-link', { url: url }).catch(function () { window.open(url, '_blank', 'noopener'); });
  };

  function applyContext(ctx) {
    if (!ctx) return;
    if (ctx.theme) document.documentElement.setAttribute('data-theme', ctx.theme);
    var vars = ctx.styles && ctx.styles.variables;
    if (vars) for (var k in vars) if (vars[k]) document.documentElement.style.setProperty(k, vars[k]);
  }

  var lastH = 0;
  function reportSize() {
    var h = Math.ceil(document.documentElement.getBoundingClientRect().height);
    if (Math.abs(h - lastH) < 2) return;
    lastH = h;
    NK.notify('ui/notifications/size-changed', { width: Math.ceil(document.documentElement.scrollWidth), height: h });
  }

  /** Start the handshake; onResult receives the tool's structured result. */
  NK.start = function (appName, onResult) {
    var delivered = false;
    function deliver(data) { delivered = true; onResult(data); }
    NK.on('ui/notifications/tool-input', function (p) { NK.toolInput = p.arguments || {}; });
    NK.on('ui/notifications/tool-result', function (p) { deliver(NK.resultData(p)); });
    NK.on('ui/notifications/tool-cancelled', function (p) { NK.fail('Cancelled' + (p.reason ? ': ' + p.reason : '.')); });
    NK.on('ui/notifications/host-context-changed', function (p) {
      for (var k in p) NK.hostContext[k] = p[k];
      applyContext(p);
    });
    NK.request('ui/initialize', {
      protocolVersion: '2026-01-26',
      appInfo: { name: appName, version: '1.0.0' },
      appCapabilities: { availableDisplayModes: ['inline', 'fullscreen'] },
    }).then(function (r) {
      NK.hostContext = (r && r.hostContext) || {};
      applyContext(NK.hostContext);
      NK.notify('ui/notifications/initialized', {});
    }).catch(function (err) { console.warn('MCP Apps handshake failed', err); });
    // ChatGPT legacy Apps SDK globals, used only if the standard notification never arrives.
    setTimeout(function () {
      if (!delivered && window.openai && window.openai.toolOutput) deliver(window.openai.toolOutput);
    }, 1500);
    if (window.ResizeObserver) new ResizeObserver(reportSize).observe(document.documentElement);
    window.addEventListener('load', reportSize);
  };

  NK.fail = function (msg) {
    var root = document.getElementById('app');
    if (root) { root.innerHTML = ''; root.appendChild(NK.el('div', { className: 'banner error' }, msg)); }
  };

  /** Tiny DOM helper: el(tag, props, ...children). */
  NK.el = function (tag, props) {
    var node = document.createElement(tag);
    if (props) for (var k in props) {
      if (k === 'className') node.className = props[k];
      else if (k === 'text') node.textContent = props[k];
      else if (k.slice(0, 2) === 'on' && typeof props[k] === 'function') node.addEventListener(k.slice(2), props[k]);
      else if (props[k] === true) node.setAttribute(k, '');
      else if (props[k] !== false && props[k] != null) node.setAttribute(k, props[k]);
    }
    for (var i = 2; i < arguments.length; i++) {
      var c = arguments[i];
      if (c == null || c === false) continue;
      if (Array.isArray(c)) c.forEach(function (x) { if (x != null && x !== false) node.appendChild(typeof x === 'string' ? document.createTextNode(x) : x); });
      else node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return node;
  };

  /** Strip HTML from catalog descriptions without ever injecting it into the page. */
  NK.plain = function (html) {
    var doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
    return (doc.body.textContent || '').replace(/\s+/g, ' ').trim();
  };
})();
`;

/** Shared styles. Host CSS variables win; the fallbacks keep the views readable in any host. */
export const BASE_CSS = `
:root {
  color-scheme: light dark;
  --nk-bg: var(--color-background-primary, light-dark(#ffffff, #1b1b1b));
  --nk-bg2: var(--color-background-secondary, light-dark(#f5f6f7, #242424));
  --nk-fg: var(--color-text-primary, light-dark(#18181b, #f4f4f5));
  --nk-muted: var(--color-text-secondary, light-dark(#5f6368, #a1a1aa));
  --nk-border: var(--color-border-primary, light-dark(#d9dce1, #3a3a3a));
  --nk-accent: var(--color-text-info, light-dark(#1d5fd1, #7aa7ff));
  --nk-danger: var(--color-text-danger, light-dark(#b42318, #ff8a80));
  --nk-ok: var(--color-text-success, light-dark(#137333, #81c995));
  --nk-radius: var(--border-radius-md, 8px);
  --nk-font: var(--font-sans, system-ui, -apple-system, "Segoe UI", sans-serif);
}
:root[data-theme="light"] { color-scheme: light; }
:root[data-theme="dark"] { color-scheme: dark; }
* { box-sizing: border-box; }
html, body { margin: 0; background: transparent; color: var(--nk-fg); font: 14px/1.45 var(--nk-font); }
#app { padding: 14px 16px 18px; max-width: 760px; }
h1 { font-size: 17px; margin: 0 0 4px; font-weight: 600; }
.sub { color: var(--nk-muted); margin: 0 0 14px; font-size: 13px; }
.field { margin: 0 0 12px; }
.field > label, .field > .lbl { display: block; font-weight: 500; margin-bottom: 4px; }
.req::after { content: " *"; color: var(--nk-danger); }
.help { color: var(--nk-muted); font-size: 12px; margin-top: 3px; }
input[type=text], input[type=email], input[type=url], input[type=number], input[type=date], input[type=datetime-local],
input[type=password], select, textarea {
  width: 100%; padding: 7px 9px; border: 1px solid var(--nk-border); border-radius: var(--nk-radius);
  background: var(--nk-bg); color: var(--nk-fg); font: inherit;
}
textarea { min-height: 72px; resize: vertical; }
input:disabled, select:disabled, textarea:disabled { opacity: .65; }
.opts label { display: inline-flex; gap: 6px; align-items: center; margin: 0 14px 4px 0; font-weight: 400; }
fieldset { border: 1px solid var(--nk-border); border-radius: var(--nk-radius); padding: 10px 12px 2px; margin: 0 0 12px; }
legend { font-weight: 600; padding: 0 4px; }
.err { color: var(--nk-danger); font-size: 12px; margin-top: 3px; }
.invalid input, .invalid select, .invalid textarea { border-color: var(--nk-danger); }
.actions { display: flex; gap: 8px; align-items: center; margin-top: 16px; flex-wrap: wrap; }
button { font: inherit; padding: 7px 14px; border-radius: var(--nk-radius); border: 1px solid var(--nk-border);
  background: var(--nk-bg2); color: var(--nk-fg); cursor: pointer; }
button.primary { background: var(--nk-accent); border-color: var(--nk-accent); color: #fff; }
button.danger { color: var(--nk-danger); }
button:disabled { opacity: .55; cursor: default; }
.banner { padding: 10px 12px; border-radius: var(--nk-radius); background: var(--nk-bg2); margin: 0 0 12px; }
.banner.error { color: var(--nk-danger); }
.banner.ok { color: var(--nk-ok); }
.ref { position: relative; }
.ref-list { position: absolute; z-index: 5; left: 0; right: 0; top: 100%; background: var(--nk-bg); border: 1px solid var(--nk-border);
  border-radius: var(--nk-radius); max-height: 220px; overflow: auto; margin-top: 2px; }
.ref-list div { padding: 6px 9px; cursor: pointer; }
.ref-list div:hover, .ref-list div.active { background: var(--nk-bg2); }
.chips span { display: inline-block; background: var(--nk-bg2); border: 1px solid var(--nk-border); border-radius: 999px;
  padding: 1px 8px; margin: 4px 4px 0 0; font-size: 12px; }
.chips button { border: 0; background: none; padding: 0 0 0 4px; color: var(--nk-muted); }
.card { border: 1px solid var(--nk-border); border-radius: var(--nk-radius); padding: 10px 12px; margin: 0 0 10px; }
.card h2 { font-size: 14px; margin: 0 0 2px; }
.meta { color: var(--nk-muted); font-size: 12px; }
.row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-top: 8px; }
.row input { flex: 1; min-width: 180px; }
.muted { color: var(--nk-muted); }
.html-block { padding: 8px 10px; background: var(--nk-bg2); border-radius: var(--nk-radius); }
`;

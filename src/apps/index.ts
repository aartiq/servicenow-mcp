/**
 * MCP Apps (SEP-1865, extension "io.modelcontextprotocol/ui"): interactive views rendered inline by
 * Claude, ChatGPT, VS Code, Goose and other hosts that support the extension.
 *
 * - Each view is a `ui://nowaikit/...` resource of type `text/html;profile=mcp-app`.
 * - Model-visible tools (open_catalog_form, open_record_form, open_approvals) point at a view through
 *   `_meta.ui.resourceUri`. Hosts without MCP Apps just get the structured JSON result.
 * - App-only tools (app_*) carry `_meta.ui.visibility: ["app"]`: the host hides them from the model and
 *   only the view can call them. They are listed only for clients that advertise the extension.
 */
import { APPROVALS_HTML, CATALOG_FORM_HTML, RECORD_FORM_HTML } from './views.js';

export const UI_EXTENSION = 'io.modelcontextprotocol/ui';
export const APP_MIME_TYPE = 'text/html;profile=mcp-app';

export const CATALOG_FORM_URI = 'ui://nowaikit/catalog-form.html';
export const RECORD_FORM_URI = 'ui://nowaikit/record-form.html';
export const APPROVALS_URI = 'ui://nowaikit/approvals.html';

interface AppResource {
  uri: string;
  name: string;
  description: string;
  html: string;
}

const APP_RESOURCES: AppResource[] = [
  { uri: CATALOG_FORM_URI, name: 'Catalog request form', description: 'Interactive Service Catalog request form', html: CATALOG_FORM_HTML },
  { uri: RECORD_FORM_URI, name: 'Record form', description: 'Interactive create/edit form for a ServiceNow record', html: RECORD_FORM_HTML },
  { uri: APPROVALS_URI, name: 'Approvals inbox', description: 'Approve or reject your pending approvals', html: APPROVALS_HTML },
];

/** The views make no network calls of their own (everything goes through tools/call), so no CSP domains are declared. */
const RESOURCE_UI_META = { ui: { prefersBorder: true } };

export function getAppResources() {
  return APP_RESOURCES.map(({ uri, name, description }) => ({ uri, name, description, mimeType: APP_MIME_TYPE, _meta: RESOURCE_UI_META }));
}

export function isAppResourceUri(uri: string): boolean {
  return APP_RESOURCES.some((r) => r.uri === uri);
}

export function readAppResource(uri: string) {
  const res = APP_RESOURCES.find((r) => r.uri === uri);
  if (!res) return null;
  return { contents: [{ uri: res.uri, mimeType: APP_MIME_TYPE, text: res.html, _meta: RESOURCE_UI_META }] };
}

/** `_meta` for a model-visible tool that renders a view (standard keys plus ChatGPT's aliases and status text). */
export function viewToolMeta(resourceUri: string, invoking: string, invoked: string): Record<string, unknown> {
  return {
    ui: { resourceUri },
    'openai/outputTemplate': resourceUri,
    'openai/toolInvocation/invoking': invoking,
    'openai/toolInvocation/invoked': invoked,
  };
}

/** `_meta` for a tool only the view may call. */
export const APP_ONLY_TOOL_META: Record<string, unknown> = {
  ui: { visibility: ['app'] },
  'openai/widgetAccessible': true,
  'openai/visibility': 'private',
};

interface ClientCaps {
  extensions?: Record<string, unknown>;
  [k: string]: unknown;
}

/**
 * True when the connected client can render MCP Apps: it advertises the UI extension (standard), or
 * it is ChatGPT, which renders Apps SDK templates. NOWAIKIT_MCP_APPS=false turns the views off,
 * =true forces them on.
 */
export function clientSupportsApps(caps: ClientCaps | undefined, clientName?: string): boolean {
  const flag = (process.env.NOWAIKIT_MCP_APPS || '').trim().toLowerCase();
  if (['false', '0', 'off', 'no'].includes(flag)) return false;
  if (['true', '1', 'on', 'yes'].includes(flag)) return true;
  const ext = caps?.extensions?.[UI_EXTENSION] as { mimeTypes?: unknown } | undefined;
  if (ext) {
    const types = Array.isArray(ext.mimeTypes) ? ext.mimeTypes : [];
    return types.length === 0 || types.includes(APP_MIME_TYPE);
  }
  return /openai|chatgpt/i.test(clientName || '');
}

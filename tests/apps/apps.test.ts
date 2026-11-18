import { describe, it, expect, afterEach } from 'vitest';
import {
  APP_MIME_TYPE, CATALOG_FORM_URI, clientSupportsApps, getAppResources, readAppResource, UI_EXTENSION,
} from '../../src/apps/index.js';
import { CATALOG_FORM_HTML, RECORD_FORM_HTML, APPROVALS_HTML } from '../../src/apps/views.js';
import { getAppsToolDefinitions, getAppOnlyToolDefinitions } from '../../src/tools/apps.js';
import { getAppToolsFor } from '../../src/tools/index.js';

describe('MCP Apps capability detection', () => {
  const saved = process.env.NOWAIKIT_MCP_APPS;
  afterEach(() => {
    if (saved === undefined) delete process.env.NOWAIKIT_MCP_APPS; else process.env.NOWAIKIT_MCP_APPS = saved;
  });

  it('is on when the client advertises the UI extension', () => {
    expect(clientSupportsApps({ extensions: { [UI_EXTENSION]: { mimeTypes: [APP_MIME_TYPE] } } })).toBe(true);
    expect(clientSupportsApps({ extensions: { [UI_EXTENSION]: {} } })).toBe(true);
  });

  it('is off for a client that only supports other UI types', () => {
    expect(clientSupportsApps({ extensions: { [UI_EXTENSION]: { mimeTypes: ['text/x-other'] } } })).toBe(false);
  });

  it('is off for plain clients and on for ChatGPT', () => {
    expect(clientSupportsApps({}, 'claude-code')).toBe(false);
    expect(clientSupportsApps(undefined, 'openai-mcp')).toBe(true);
  });

  it('honours NOWAIKIT_MCP_APPS', () => {
    process.env.NOWAIKIT_MCP_APPS = 'false';
    expect(clientSupportsApps({ extensions: { [UI_EXTENSION]: {} } })).toBe(false);
    process.env.NOWAIKIT_MCP_APPS = 'true';
    expect(clientSupportsApps({}, 'anything')).toBe(true);
  });
});

describe('MCP Apps resources and tools', () => {
  it('serves each view as text/html;profile=mcp-app', () => {
    const list = getAppResources();
    expect(list.map((r) => r.uri)).toContain(CATALOG_FORM_URI);
    expect(list.every((r) => r.mimeType === APP_MIME_TYPE && r.uri.startsWith('ui://'))).toBe(true);
    const read = readAppResource(CATALOG_FORM_URI)!;
    expect(read.contents[0].mimeType).toBe(APP_MIME_TYPE);
    expect(read.contents[0].text).toMatch(/^<!doctype html>/);
    expect(readAppResource('ui://nowaikit/nope.html')).toBeNull();
  });

  it('links view tools to their resource and hides app-only tools from the model', () => {
    for (const t of getAppsToolDefinitions()) {
      const ui = (t._meta as any).ui;
      expect(ui.resourceUri).toMatch(/^ui:\/\/nowaikit\//);
      expect((t._meta as any)['openai/outputTemplate']).toBe(ui.resourceUri);
    }
    for (const t of getAppOnlyToolDefinitions()) {
      expect((t._meta as any).ui.visibility).toEqual(['app']);
    }
  });

  it('marks app-only writes as non-read-only and the lookup as read-only', () => {
    const byName = Object.fromEntries(getAppOnlyToolDefinitions().map((t) => [t.name, t]));
    expect(byName.app_submit_catalog_form.annotations.readOnlyHint).toBe(false);
    expect(byName.app_save_record.annotations.readOnlyHint).toBe(false);
    expect(byName.app_decide_approval.annotations.readOnlyHint).toBe(false);
    expect(byName.app_lookup_reference.annotations.readOnlyHint).toBe(true);
  });

  it('adds only missing app tools to a listing', () => {
    const extra = getAppToolsFor([{ name: 'open_catalog_form' }]).map((t) => t.name);
    expect(extra).not.toContain('open_catalog_form');
    expect(extra).toEqual(expect.arrayContaining(['open_record_form', 'open_approvals', 'app_submit_catalog_form', 'app_lookup_reference']));
  });
});

describe('view HTML', () => {
  const scripts = (html: string) => [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);

  it.each([['catalog', CATALOG_FORM_HTML], ['record', RECORD_FORM_HTML], ['approvals', APPROVALS_HTML]])(
    '%s view is self-contained and its scripts parse',
    (_n, html) => {
      expect(html).not.toMatch(/<script[^>]+src=/);
      expect(html).not.toMatch(/<link[^>]+href=/);
      const s = scripts(html);
      expect(s.length).toBe(3);
      for (const code of s) expect(() => new Function(code)).not.toThrow();
      // No eval-style code: the host's default CSP has no 'unsafe-eval'.
      expect(html).not.toMatch(/\beval\(|new Function\(/);
    },
  );
});

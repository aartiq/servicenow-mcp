/**
 * MCP Apps host (SEP-1865, extension "io.modelcontextprotocol/ui") for the chat.
 *
 * When a tool's definition carries `_meta.ui.resourceUri`, the chat renders that `ui://` view here in a
 * sandboxed iframe (no same-origin, so the view cannot reach the app's storage or APIs) and speaks the
 * host side of the protocol over postMessage JSON-RPC:
 *
 *   view -> host  ui/initialize                 reply { protocolVersion, hostInfo, hostCapabilities, hostContext }
 *   view -> host  ui/notifications/initialized  host sends tool-input then tool-result
 *   view -> host  tools/call                     proxied to the same tool path the chat uses (incl. app-only tools)
 *   view -> host  ui/message                     appended to the chat as a user message
 *   view -> host  ui/open-link                   opened externally (desktop) or in a new tab (web)
 *   view -> host  ui/notifications/size-changed  iframe height follows the content
 *   host -> view  ui/notifications/host-context-changed  when the app theme changes
 */
import React, { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';

export const MCP_APPS_PROTOCOL_VERSION = '2026-01-26';

/** The `ui://` view a tool renders, if any. */
export function viewUriOf(def?: ToolDef): string | undefined {
  const uri = def?._meta?.ui?.resourceUri;
  return typeof uri === 'string' && uri.startsWith('ui://') ? uri : undefined;
}

/** App-only tools (`_meta.ui.visibility` without "model") are callable by views but never offered to the model. */
export function isAppOnlyTool(def: ToolDef): boolean {
  const vis = def._meta?.ui?.visibility;
  return Array.isArray(vis) && vis.length > 0 && !vis.includes('model');
}

interface Props {
  uri: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  toolResult: McpCallToolResult;
  theme: 'light' | 'dark';
  /** Run a tool for the view. Must return a CallToolResult (errors as isError results). */
  callTool: (name: string, args: Record<string, unknown>) => Promise<McpCallToolResult>;
  /** Append a user message to the chat on the view's behalf. */
  onMessage: (text: string) => void;
}

type RpcMessage = { jsonrpc?: string; id?: number | string; method?: string; params?: Record<string, unknown> };

const viewCache = new Map<string, string>();

export default function McpAppFrame({ uri, toolName, toolInput, toolResult, theme, callTool, onMessage }: Props): React.ReactElement {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [html, setHtml] = useState<string | null>(viewCache.get(uri) ?? null);
  const [error, setError] = useState('');
  const [height, setHeight] = useState(160);

  // Keep the latest props for the long-lived message listener.
  const latest = useRef({ toolInput, toolResult, theme, callTool, onMessage });
  latest.current = { toolInput, toolResult, theme, callTool, onMessage };

  useEffect(() => {
    if (html) return;
    let cancelled = false;
    api.readResource(uri)
      .then(r => {
        const text = r?.contents?.find(c => typeof c.text === 'string')?.text;
        if (cancelled) return;
        if (!text) { setError('This view is not available from the running NowAIKit server.'); return; }
        viewCache.set(uri, text);
        setHtml(text);
      })
      .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)); });
    return () => { cancelled = true; };
  }, [uri, html]);

  useEffect(() => {
    const post = (msg: Record<string, unknown>) => frameRef.current?.contentWindow?.postMessage({ jsonrpc: '2.0', ...msg }, '*');
    const reply = (id: RpcMessage['id'], result: unknown) => post({ id, result });
    const replyError = (id: RpcMessage['id'], message: string, code = -32603) => post({ id, error: { code, message } });

    const onWindowMessage = async (e: MessageEvent) => {
      if (!frameRef.current || e.source !== frameRef.current.contentWindow) return;
      const d = e.data as RpcMessage;
      if (!d || d.jsonrpc !== '2.0' || typeof d.method !== 'string') return;
      const p = d.params || {};
      const cur = latest.current;
      switch (d.method) {
        case 'ui/initialize':
          reply(d.id, {
            protocolVersion: MCP_APPS_PROTOCOL_VERSION,
            hostInfo: { name: 'nowaikit-desktop', version: typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev' },
            hostCapabilities: { openLinks: {}, serverTools: {}, message: { text: {} } },
            hostContext: { theme: cur.theme, displayMode: 'inline', availableDisplayModes: ['inline'], locale: navigator.language },
          });
          return;
        case 'ui/notifications/initialized':
          post({ method: 'ui/notifications/tool-input', params: { arguments: cur.toolInput } });
          post({ method: 'ui/notifications/tool-result', params: cur.toolResult });
          return;
        case 'ui/notifications/size-changed': {
          const h = Number(p.height);
          if (Number.isFinite(h) && h > 0) setHeight(Math.min(Math.ceil(h) + 4, 4000));
          return;
        }
        case 'tools/call': {
          const name = typeof p.name === 'string' ? p.name : '';
          const args = (p.arguments && typeof p.arguments === 'object' ? p.arguments : {}) as Record<string, unknown>;
          if (!name) { replyError(d.id, 'tools/call needs a tool name', -32602); return; }
          try {
            reply(d.id, await cur.callTool(name, args));
          } catch (err) {
            reply(d.id, { isError: true, content: [{ type: 'text', text: err instanceof Error ? err.message : String(err) }] });
          }
          return;
        }
        case 'ui/message': {
          const c = p.content as { type?: string; text?: string } | Array<{ type?: string; text?: string }> | undefined;
          const text = (Array.isArray(c) ? c : c ? [c] : []).filter(b => b && b.type === 'text').map(b => b.text || '').join('\n').trim();
          if (text) cur.onMessage(text);
          reply(d.id, {});
          return;
        }
        case 'ui/open-link': {
          const url = typeof p.url === 'string' ? p.url : '';
          if (!/^(https?:|mailto:)/i.test(url)) { replyError(d.id, 'Only http(s) and mailto links can be opened', -32602); return; }
          try { await api.openExternal(url); reply(d.id, {}); } catch (err) { replyError(d.id, err instanceof Error ? err.message : String(err)); }
          return;
        }
        default:
          // Requests this host does not implement get an empty result; notifications are ignored.
          if (d.id !== undefined) reply(d.id, {});
      }
    };
    window.addEventListener('message', onWindowMessage);
    return () => window.removeEventListener('message', onWindowMessage);
  }, []);

  // Tell the view when the app theme changes.
  useEffect(() => {
    frameRef.current?.contentWindow?.postMessage({ jsonrpc: '2.0', method: 'ui/notifications/host-context-changed', params: { theme } }, '*');
  }, [theme]);

  if (error) {
    return <div style={{ fontSize: '0.8rem', color: 'var(--red)', padding: '8px 10px' }}>Could not load the {toolName} view: {error}</div>;
  }

  return (
    <div className="mcp-app-frame" data-tool={toolName} style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', background: theme === 'dark' ? '#111827' : '#fff' }}>
      {html
        ? <iframe
            ref={frameRef}
            title={`${toolName} view`}
            sandbox="allow-scripts allow-forms"
            srcDoc={html}
            style={{ width: '100%', height, border: 0, display: 'block' }}
          />
        : <div style={{ padding: 14, fontSize: '0.8rem', color: 'var(--dim)' }}>Loading view…</div>}
    </div>
  );
}

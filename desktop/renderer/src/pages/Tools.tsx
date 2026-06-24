import React, { useEffect, useState } from 'react';
import { api as unifiedApi } from '../api.js';

interface ToolDef {
  name: string;
  description: string;
  inputSchema?: {
    properties?: Record<string, { type: string; description?: string; enum?: string[] }>;
    required?: string[];
  };
}

interface Props {
  activeToolPackage: string;
  serverOnline: boolean;
  serverUrl: string;
  onRestart?: () => void;
}

const MODULES = [
  { id: 'all',       label: 'All' },
  { id: 'incident',  label: 'Incidents' },
  { id: 'problem',   label: 'Problems' },
  { id: 'change',    label: 'Change' },
  { id: 'task',      label: 'Tasks' },
  { id: 'cmdb',      label: 'CMDB' },
  { id: 'user',      label: 'Users' },
  { id: 'knowledge', label: 'Knowledge' },
  { id: 'catalog',   label: 'Catalog' },
  { id: 'script',    label: 'Scripts' },
  { id: 'event',     label: 'Events' },
];

// Permission tiers derived from tool descriptions
type Tier = 'read' | 'write' | 'scripting' | 'agentic';

const TIERS: { id: Tier | 'all'; label: string; color: string }[] = [
  { id: 'all',       label: 'All Tiers',  color: 'var(--dim)' },
  { id: 'read',      label: 'Read',       color: 'var(--green)' },
  { id: 'write',     label: 'Write',      color: 'var(--yellow)' },
  { id: 'scripting', label: 'Scripting',  color: '#c084fc' },
  { id: 'agentic',   label: 'Agentic',    color: 'var(--red)' },
];

function toolTier(desc: string): Tier {
  const d = (desc || '').toLowerCase();
  if (d.includes('[scripting]') || d.includes('scripting')) return 'scripting';
  if (d.includes('[agentic]') || d.includes('agentic playbook')) return 'agentic';
  if (d.includes('[write]') || d.includes('write_enabled') || d.includes('requires write')) return 'write';
  return 'read';
}

function tierBadge(tier: Tier): React.ReactElement {
  const meta = TIERS.find(t => t.id === tier)!;
  return <span style={{ fontSize:'0.65rem', padding:'2px 6px', borderRadius:10, border:`1px solid ${meta.color}`, color: meta.color, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.04em' }}>{meta.label}</span>;
}

function toolModule(name: string): string {
  const n = name.toLowerCase();
  for (const m of MODULES.slice(1)) { if (n.includes(m.id)) return m.id; }
  return 'other';
}

function RunDrawer({ tool, onClose }: { tool: ToolDef; serverUrl: string; onClose: () => void }) {
  const props    = tool.inputSchema?.properties ?? {};
  const required = tool.inputSchema?.required ?? [];
  const [params,  setParams]  = useState<Record<string, string>>({});
  const [result,  setResult]  = useState('');
  const [running, setRunning] = useState(false);
  const [error,   setError]   = useState('');

  async function run() {
    setRunning(true); setResult(''); setError('');
    const a = unifiedApi;
    if (!a) { setError('Desktop app required'); setRunning(false); return; }
    try {
      const coerced: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(params)) {
        if (!v && !required.includes(k)) continue;
        const t = props[k]?.type;
        if (t === 'number' || t === 'integer') coerced[k] = Number(v);
        else if (t === 'boolean') coerced[k] = v === 'true';
        else coerced[k] = v;
      }
      const res = await a.executeTool(tool.name, coerced);
      if (!res.success) { setError(res.error ?? 'Tool execution failed'); }
      else { setResult(typeof res.result === 'string' ? res.result : JSON.stringify(res.result, null, 2)); }
    } catch (err) { setError(err instanceof Error ? err.message : 'Error'); }
    setRunning(false);
  }

  return (
    <div style={{ position:'fixed', top:0, right:0, bottom:0, width:420, background:'var(--surface)', borderLeft:'1px solid var(--border2)', boxShadow:'var(--shadow)', zIndex:100, display:'flex', flexDirection:'column' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'16px 20px', borderBottom:'1px solid var(--border)', flexShrink:0 }}>
        <code style={{ color:'var(--accent)', fontWeight:700, fontSize:'0.95rem' }}>{tool.name}</code>
        <button onClick={onClose} style={{ background:'none', border:'none', color:'var(--dim)', fontSize:'1.2rem', padding:4 }}>✕</button>
      </div>
      <div style={{ flex:1, overflowY:'auto', padding:'16px 20px' }}>
        {tool.description && <p style={{ fontSize:'0.85rem', color:'var(--text2)', marginBottom:20, lineHeight:1.6 }}>{tool.description}</p>}
        {Object.entries(props).map(([k, schema]) => (
          <div key={k} style={{ marginBottom:14 }}>
            <label style={{ display:'block', fontSize:'0.78rem', color:'var(--dim)', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:5 }}>
              {k}{required.includes(k) && <span style={{ color:'var(--red)', marginLeft:3 }}>*</span>}
            </label>
            {schema.description && <div style={{ fontSize:'0.76rem', color:'var(--text2)', marginBottom:5 }}>{schema.description}</div>}
            {schema.enum ? (
              <select value={params[k] ?? ''} onChange={e => setParams(p => ({ ...p, [k]: e.target.value }))}
                style={{ width:'100%', background:'var(--surface2)', border:'1px solid var(--border2)', borderRadius:6, color:'var(--text)', padding:'8px 10px', fontSize:'0.85rem' }}>
                <option value="">— select —</option>
                {schema.enum.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            ) : (
              <input className="input" type={schema.type === 'number' || schema.type === 'integer' ? 'number' : 'text'}
                value={params[k] ?? ''} onChange={e => setParams(p => ({ ...p, [k]: e.target.value }))}
                placeholder={schema.type === 'boolean' ? 'true / false' : schema.type ?? ''} />
            )}
          </div>
        ))}
        {Object.keys(props).length === 0 && <div style={{ color:'var(--dim)', fontSize:'0.85rem' }}>No parameters required.</div>}
      </div>
      <div style={{ padding:'14px 20px', borderTop:'1px solid var(--border)', flexShrink:0 }}>
        <button className="btn-primary" onClick={run} disabled={running} style={{ width:'100%', padding:10, opacity: running ? 0.6 : 1 }}>
          {running ? 'Running…' : 'Run Tool'}
        </button>
        {error  && <div style={{ color:'var(--red)', fontSize:'0.8rem', marginTop:10 }}>✗ {error}</div>}
        {result && <pre className="result-box" style={{ marginTop:12, maxHeight:260 }}>{result}</pre>}
      </div>
    </div>
  );
}

export default function Tools({ activeToolPackage, serverOnline, serverUrl, onRestart }: Props): React.ReactElement {
  const [tools,      setTools]      = useState<ToolDef[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [module,     setModule]     = useState('all');
  const [tier,       setTier]       = useState<Tier | 'all'>('all');
  const [search,     setSearch]     = useState('');
  const [selected,   setSelected]   = useState<ToolDef | null>(null);
  const [restarting, setRestarting] = useState(false);

  useEffect(() => {
    const a = unifiedApi;
    if (!a) { setLoading(false); return; }
    a.listTools().then(d => setTools(d ?? [])).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const filtered = tools.filter(t => {
    if (module !== 'all' && toolModule(t.name) !== module) return false;
    if (tier !== 'all' && toolTier(t.description) !== tier) return false;
    if (search && !t.name.toLowerCase().includes(search.toLowerCase()) && !(t.description ?? '').toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'calc(100vh - 56px)' }}>
      <div className="page-header" style={{ marginBottom:16 }}>
        <div>
          <h2 className="page-title" style={{ display:'flex', alignItems:'center', gap:10 }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16"/></svg>
            Tools
          </h2>
          {!loading && <div style={{ fontSize:'0.78rem', color:'var(--dim)', marginTop:2 }}>{filtered.length} of {tools.length} tools · {activeToolPackage.replace(/_/g,' ')} package</div>}
        </div>
        <input className="input" placeholder="Search tools…" value={search} onChange={e => setSearch(e.target.value)} style={{ width:220 }} />
      </div>

      <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:10 }}>
        {MODULES.map(m => {
          const cnt = m.id === 'all' ? tools.length : tools.filter(t => toolModule(t.name) === m.id).length;
          if (cnt === 0 && m.id !== 'all') return null;
          return (
            <button key={m.id} onClick={() => setModule(m.id)} style={{
              padding:'5px 12px', borderRadius:20, fontSize:'0.8rem', border:'1px solid',
              borderColor: module === m.id ? 'var(--accent)' : 'var(--border2)',
              background:  module === m.id ? 'var(--accent-bg)' : 'transparent',
              color:       module === m.id ? 'var(--accent)' : 'var(--text2)',
              fontWeight:  module === m.id ? 600 : 400, transition:'all .15s',
            }}>
              {m.label} <span style={{ opacity:.7, marginLeft:2 }}>{cnt}</span>
            </button>
          );
        })}
      </div>

      {/* Permission tier filter */}
      <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:20, alignItems:'center' }}>
        <span style={{ fontSize:'0.75rem', color:'var(--dim)', marginRight:4 }}>Tier:</span>
        {TIERS.map(t => {
          const cnt = t.id === 'all' ? tools.length : tools.filter(tl => toolTier(tl.description) === t.id).length;
          return (
            <button key={t.id} onClick={() => setTier(t.id)} style={{
              padding:'4px 10px', borderRadius:16, fontSize:'0.75rem', border:'1px solid',
              borderColor: tier === t.id ? t.color : 'var(--border2)',
              background: tier === t.id ? `${t.color}15` : 'transparent',
              color: tier === t.id ? t.color : 'var(--text2)',
              fontWeight: tier === t.id ? 600 : 400, transition:'all .15s',
            }}>
              {t.label} <span style={{ opacity:.7, marginLeft:2 }}>{cnt}</span>
            </button>
          );
        })}
      </div>

      {!serverOnline && !loading && (
        <div style={{ background:'rgba(251,191,36,0.1)', border:'1px solid rgba(251,191,36,0.25)', borderRadius:8, padding:'10px 16px', marginBottom:16, fontSize:'0.85rem', color:'var(--yellow)', display:'flex', alignItems:'center', gap:10 }}>
          <span>⚠</span>
          <span style={{ flex:1 }}>HTTP server offline — <strong>Run</strong> will fail.</span>
          <button
            disabled={restarting}
            onClick={async () => {
              const a = unifiedApi;
              if (!a) return;
              setRestarting(true);
              await a.startServer();
              setRestarting(false);
              onRestart?.();
            }}
            style={{
              background:'rgba(251,191,36,0.2)', border:'1px solid rgba(251,191,36,0.4)',
              color:'var(--yellow)', borderRadius:6, padding:'4px 12px', fontSize:'0.8rem',
              cursor:'pointer', flexShrink:0, opacity: restarting ? 0.6 : 1,
            }}
          >
            {restarting ? 'Starting…' : 'Start Server'}
          </button>
        </div>
      )}

      {loading ? (
        <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', color:'var(--dim)', gap:10 }}>
          <span className="spinner" /> Loading tools…
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', color:'var(--dim)' }}>
          {tools.length === 0 ? 'No tools loaded — ensure HTTP server is running' : 'No tools match the filter'}
        </div>
      ) : (
        <div style={{ flex:1, overflowY:'auto', display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))', gap:10, alignContent:'start' }}>
          {filtered.map(t => (
            <button key={t.name} onClick={() => setSelected(selected?.name === t.name ? null : t)} style={{
              background: selected?.name === t.name ? 'var(--accent-bg)' : 'var(--surface)',
              border: `1px solid ${selected?.name === t.name ? 'var(--accent)' : 'var(--border)'}`,
              borderRadius:'var(--radius)', padding:'14px 16px', textAlign:'left', cursor:'pointer', transition:'all .15s',
            }}>
              <div style={{ fontFamily:'monospace', fontSize:'0.82rem', color:'var(--accent)', fontWeight:600, marginBottom:5 }}>{t.name}</div>
              <div style={{ fontSize:'0.78rem', color:'var(--text2)', lineHeight:1.4, display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical', overflow:'hidden' }}>
                {t.description || 'No description'}
              </div>
              <div style={{ marginTop:8, display:'flex', gap:6, alignItems:'center' }}>
                <span className="badge-dim">{toolModule(t.name)}</span>
                {tierBadge(toolTier(t.description))}
              </div>
            </button>
          ))}
        </div>
      )}

      {selected && <RunDrawer tool={selected} serverUrl={serverUrl} onClose={() => setSelected(null)} />}
    </div>
  );
}

import React, { useEffect, useState } from 'react';
import { api as getApi } from '../api.js';

interface LogEntry {
  ts?: string;
  event?: string;
  tool?: string;
  resource?: string;
  prompt?: string;
  instance?: string;
  authMode?: string;
  user?: string;
  provider?: string;
  model?: string;
  toolCount?: number;
  success?: boolean;
  durationMs?: number;
  inputTokens?: number;
  outputTokens?: number;
  error?: string;
  [key: string]: unknown;
}

const PAGE_SIZES = [15, 25, 50, 100];

function api(): ElectronAPI { return getApi; }

export default function Logs(): React.ReactElement {
  const [allEntries, setAllEntries] = useState<LogEntry[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [filter,     setFilter]     = useState('');
  const [selected,   setSelected]   = useState<LogEntry | null>(null);
  const [page,       setPage]       = useState(0);
  const [pageSize,   setPageSize]   = useState(25);

  function loadFresh() {
    setLoading(true);
    setSelected(null);
    setPage(0);
    const a = api();
    if (!a) { setLoading(false); return; }
    a.getAuditLogs(2000)
      .then(r => { setAllEntries((r ?? []) as unknown as LogEntry[]); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(() => { loadFresh(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = allEntries.filter(e => {
    if (!filter) return true;
    const q = filter.toLowerCase();
    return (e.tool ?? '').toLowerCase().includes(q)
      || (e.instance ?? '').toLowerCase().includes(q)
      || (e.provider ?? '').toLowerCase().includes(q)
      || (e.model ?? '').toLowerCase().includes(q)
      || (e.error ?? '').toLowerCase().includes(q)
      || (e.event ?? '').toLowerCase().includes(q)
      || (e.user ?? '').toLowerCase().includes(q);
  });

  const totalPages = Math.ceil(filtered.length / pageSize);
  const pageEntries = filtered.slice(page * pageSize, (page + 1) * pageSize);

  function fmtTime(ts?: string) {
    if (!ts) return '—';
    try {
      const d = new Date(ts);
      return d.toLocaleTimeString(undefined, { hour:'2-digit', minute:'2-digit', second:'2-digit' }) + ' ' + d.toLocaleDateString(undefined, { month:'short', day:'numeric' });
    } catch { return ts; }
  }

  function statusBadge(e: LogEntry) {
    if (e.success === true) return <span className="badge-green">ok</span>;
    if (e.success === false) return <span className="badge-red">error</span>;
    return <span className="badge-dim">—</span>;
  }

  function exportCsv() {
    const headers = ['Time', 'Event', 'Tool', 'Instance', 'User', 'Provider', 'Model', 'Status', 'Duration (ms)', 'Input Tokens', 'Output Tokens', 'Error'];
    const rows = filtered.map(e => [
      e.ts ?? '',
      e.event ?? '',
      e.tool || e.resource || e.prompt || '',
      e.instance ?? '',
      e.user ?? '',
      e.provider ?? '',
      e.model ?? '',
      e.success === true ? 'ok' : e.success === false ? 'error' : '',
      e.durationMs != null ? String(e.durationMs) : '',
      e.inputTokens != null ? String(e.inputTokens) : '',
      e.outputTokens != null ? String(e.outputTokens) : '',
      e.error ?? '',
    ]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nowaikit-audit-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const th: React.CSSProperties = { padding:'8px 12px', fontSize:'0.72rem', color:'var(--dim)', textTransform:'uppercase', letterSpacing:'0.06em', textAlign:'left', borderBottom:'1px solid var(--border)', fontWeight:600 };
  const td: React.CSSProperties = { padding:'10px 12px', fontSize:'0.82rem', borderBottom:'1px solid var(--border)', verticalAlign:'middle' };

  return (
    <div>
      <div className="page-header">
        <h2 className="page-title" style={{ display:'flex', alignItems:'center', gap:10 }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
          Audit Log
        </h2>
        <div style={{ display:'flex', gap:8 }}>
          <input className="input" placeholder="Filter by tool, instance, provider, model…" value={filter} onChange={e => { setFilter(e.target.value); setPage(0); }} style={{ width:280 }} />
          <button className="btn-ghost" onClick={exportCsv} disabled={filtered.length === 0} style={{ padding:'6px 14px', fontSize:'0.8rem' }} title="Export filtered logs as CSV">
            Export CSV
          </button>
          <button className="btn-ghost" onClick={loadFresh} style={{ padding:'6px 14px', fontSize:'0.8rem' }}>↻</button>
        </div>
      </div>

      <div style={{ fontSize:'0.78rem', color:'var(--dim)', marginBottom:14 }}>
        Log: <code style={{ color:'var(--text2)' }}>~/.config/nowaikit/audit.jsonl</code>
        {!loading && (
          <span style={{ marginLeft:12 }}>
            Showing {pageEntries.length} of {filtered.length} entries
            {filtered.length !== allEntries.length && ` (${allEntries.length} total)`}
          </span>
        )}
      </div>

      {loading ? (
        <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:200, color:'var(--dim)', gap:10 }}>
          <span className="spinner" /> Loading logs…
        </div>
      ) : allEntries.length === 0 ? (
        <div className="card" style={{ padding:32, textAlign:'center', color:'var(--dim)' }}>
          <div style={{ marginBottom:8 }}>No audit log entries found.</div>
          <div style={{ fontSize:'0.8rem' }}>Logs appear after tools are called or chat messages are sent.</div>
        </div>
      ) : (
        <div className="card" style={{ overflow:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', minWidth:1000 }}>
            <thead>
              <tr>
                <th style={th}>Time</th>
                <th style={th}>Event</th>
                <th style={th}>Tool</th>
                <th style={th}>Instance</th>
                <th style={th}>User</th>
                <th style={th}>Provider</th>
                <th style={th}>Model</th>
                <th style={th}>Status</th>
                <th style={th}>Tokens</th>
                <th style={th}>Duration</th>
                <th style={th}>Error</th>
              </tr>
            </thead>
            <tbody>
              {pageEntries.map((e, i) => (
                <tr key={page * pageSize + i} onClick={() => setSelected(selected === e ? null : e)} style={{ cursor:'pointer', background: selected === e ? 'var(--surface2)' : 'transparent', transition:'background .1s' }}>
                  <td style={{ ...td, color:'var(--text2)', fontFamily:'monospace', fontSize:'0.78rem', whiteSpace:'nowrap' }}>{fmtTime(e.ts)}</td>
                  <td style={{ ...td, fontSize:'0.75rem', color:'var(--dim)' }}>{e.event ?? '—'}</td>
                  <td style={{ ...td, fontFamily:'monospace', color:'var(--accent)', fontWeight:500 }}>{e.tool || e.resource || e.prompt || '—'}</td>
                  <td style={{ ...td, fontSize:'0.8rem', color:'var(--text2)' }}>{e.instance ?? '—'}</td>
                  <td style={{ ...td, fontSize:'0.8rem', color:'var(--text2)' }}>{e.user ?? '—'}</td>
                  <td style={{ ...td, fontSize:'0.8rem', color:'var(--text2)' }}>{e.provider ?? '—'}</td>
                  <td style={{ ...td, fontFamily:'monospace', fontSize:'0.75rem', color:'var(--text2)', maxWidth:150, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{e.model ?? '—'}</td>
                  <td style={td}>{statusBadge(e)}</td>
                  <td style={{ ...td, fontFamily:'monospace', fontSize:'0.75rem', color:'var(--text2)', whiteSpace:'nowrap' }}>
                    {e.inputTokens != null || e.outputTokens != null
                      ? `${e.inputTokens ?? 0}→${e.outputTokens ?? 0}`
                      : '—'}
                  </td>
                  <td style={{ ...td, color:'var(--text2)' }}>{e.durationMs != null ? `${e.durationMs}ms` : '—'}</td>
                  <td style={{ ...td, color:'var(--red)', fontSize:'0.75rem', maxWidth:200, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{e.error ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Pagination */}
          {(filtered.length > 0) && (
            <div style={{ padding:'12px 16px', display:'flex', alignItems:'center', justifyContent:'space-between', borderTop:'1px solid var(--border)', flexWrap:'wrap', gap:8 }}>
              {/* Page size selector */}
              <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:'0.78rem', color:'var(--text2)' }}>
                <span>Rows:</span>
                <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(0); }} style={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:4, color:'var(--text)', padding:'3px 6px', fontSize:'0.78rem' }}>
                  {PAGE_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>

              {/* Page navigation */}
              <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                <button className="btn-ghost" onClick={() => setPage(0)} disabled={page === 0} style={{ padding:'4px 8px', fontSize:'0.75rem' }}>
                  « First
                </button>
                <button className="btn-ghost" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} style={{ padding:'4px 8px', fontSize:'0.75rem' }}>
                  ‹ Prev
                </button>

                {/* Page number buttons */}
                {(() => {
                  const pages: number[] = [];
                  const start = Math.max(0, page - 2);
                  const end = Math.min(totalPages - 1, page + 2);
                  if (start > 0) pages.push(0);
                  if (start > 1) pages.push(-1); // ellipsis
                  for (let i = start; i <= end; i++) pages.push(i);
                  if (end < totalPages - 2) pages.push(-2); // ellipsis
                  if (end < totalPages - 1) pages.push(totalPages - 1);
                  return pages.map((p, idx) => {
                    if (p < 0) return <span key={`e${idx}`} style={{ padding:'0 4px', color:'var(--dim)', fontSize:'0.75rem' }}>…</span>;
                    return (
                      <button key={p} className="btn-ghost" onClick={() => setPage(p)} style={{
                        padding:'4px 8px', fontSize:'0.75rem', minWidth:28,
                        background: p === page ? 'var(--accent)' : 'transparent',
                        color: p === page ? '#fff' : 'var(--text2)',
                        borderRadius: 4, fontWeight: p === page ? 600 : 400,
                      }}>
                        {p + 1}
                      </button>
                    );
                  });
                })()}

                <button className="btn-ghost" onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} style={{ padding:'4px 8px', fontSize:'0.75rem' }}>
                  Next ›
                </button>
                <button className="btn-ghost" onClick={() => setPage(totalPages - 1)} disabled={page >= totalPages - 1} style={{ padding:'4px 8px', fontSize:'0.75rem' }}>
                  Last »
                </button>
              </div>

              {/* Summary */}
              <span style={{ fontSize:'0.75rem', color:'var(--dim)' }}>
                {page * pageSize + 1}–{Math.min((page + 1) * pageSize, filtered.length)} of {filtered.length}
              </span>
            </div>
          )}

          {/* Entry detail */}
          {selected && (
            <div style={{ padding:'14px 16px', borderTop:'2px solid var(--border2)', background:'var(--surface2)' }}>
              <div style={{ fontSize:'0.72rem', color:'var(--dim)', marginBottom:6, textTransform:'uppercase', letterSpacing:'0.06em' }}>Entry Detail</div>
              <pre style={{ fontSize:'0.78rem', overflowX:'auto', color:'var(--text)', lineHeight:1.5 }}>{JSON.stringify(selected, null, 2)}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

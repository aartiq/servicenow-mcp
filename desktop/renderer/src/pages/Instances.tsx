import React, { useState, useMemo } from 'react';
import type { AppInstance } from '../App.js';

interface Props {
  instances: AppInstance[];
  onRemove: (name: string) => Promise<void>;
  onSetDefault: (name: string) => Promise<void>;
  onTest: (name: string) => Promise<{ ok: boolean; message: string }>;
  onAddInstance: () => void;
}

// ── Environment color/label helpers ──────────────────────────────────────────
const ENV_COLORS: Record<string, { bg: string; fg: string }> = {
  prod:    { bg: 'rgba(232,70,106,0.15)', fg: '#F06A82' },
  staging: { bg: 'rgba(245,158,11,0.15)', fg: '#FF8A55' },
  test:    { bg: 'rgba(59,130,246,0.15)', fg: '#60a5fa' },
  dev:     { bg: 'rgba(16,185,129,0.15)', fg: '#34d399' },
  uat:     { bg: 'rgba(15,76,129,0.15)',  fg: '#3A6FA1' },
};

function envStyle(env: string): { bg: string; fg: string } {
  return ENV_COLORS[env.toLowerCase()] ?? { bg: 'var(--surface2)', fg: 'var(--dim)' };
}

// ── Grouped instances type ───────────────────────────────────────────────────
interface InstanceGroup {
  name: string;
  instances: AppInstance[];
  hasActive: boolean;
}

export default function Instances({ instances, onRemove, onSetDefault, onTest, onAddInstance }: Props): React.ReactElement {
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; message: string } | 'testing'>>({});
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');

  // Build grouped data
  const groups: InstanceGroup[] = useMemo(() => {
    const map = new Map<string, AppInstance[]>();
    for (const inst of instances) {
      const g = inst.group || 'Default';
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(inst);
    }
    // Sort: groups with active instance first, then alphabetical
    return Array.from(map.entries())
      .map(([name, insts]) => ({
        name,
        instances: insts.sort((a, b) => {
          // Sort by environment: prod > staging > uat > test > dev > other
          const order = ['prod', 'staging', 'uat', 'test', 'dev'];
          const ai = order.indexOf(a.environment.toLowerCase());
          const bi = order.indexOf(b.environment.toLowerCase());
          return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
        }),
        hasActive: insts.some(i => i.active),
      }))
      .sort((a, b) => {
        if (a.hasActive !== b.hasActive) return a.hasActive ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
  }, [instances]);

  // Auto-expand groups on first render: expand active group + first group
  useMemo(() => {
    if (expandedGroups.size === 0 && groups.length > 0) {
      const initial = new Set<string>();
      const activeGroup = groups.find(g => g.hasActive);
      if (activeGroup) initial.add(activeGroup.name);
      else initial.add(groups[0].name);
      setExpandedGroups(initial);
    }
  }, [groups]); // eslint-disable-line react-hooks/exhaustive-deps

  // Filter
  const filteredGroups = useMemo(() => {
    if (!search.trim()) return groups;
    const q = search.toLowerCase();
    return groups
      .map(g => ({
        ...g,
        instances: g.instances.filter(i =>
          i.name.toLowerCase().includes(q) ||
          i.url.toLowerCase().includes(q) ||
          i.group.toLowerCase().includes(q) ||
          i.environment.toLowerCase().includes(q)
        ),
      }))
      .filter(g => g.instances.length > 0);
  }, [groups, search]);

  function toggleGroup(name: string) {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  }

  function expandAll() { setExpandedGroups(new Set(groups.map(g => g.name))); }
  function collapseAll() { setExpandedGroups(new Set()); }

  async function handleTest(name: string) {
    setTestResults(r => ({ ...r, [name]: 'testing' }));
    const result = await onTest(name);
    setTestResults(r => ({ ...r, [name]: result }));
  }

  const totalGroups = groups.length;
  const totalInstances = instances.length;

  return (
    <div>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20, flexWrap:'wrap', gap:12 }}>
        <div>
          <h2 className="page-title" style={{ display:'flex', alignItems:'center', gap:10 }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"/><rect x="2" y="14" width="20" height="8" rx="2" ry="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg>
            Instances
          </h2>
          <div style={{ fontSize:'0.78rem', color:'var(--dim)', marginTop:2 }}>
            {totalGroups} {totalGroups === 1 ? 'group' : 'groups'} · {totalInstances} {totalInstances === 1 ? 'instance' : 'instances'}
          </div>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button className="btn-ghost" onClick={expandAll} style={{ fontSize:'0.78rem', padding:'6px 12px' }}>Expand All</button>
          <button className="btn-ghost" onClick={collapseAll} style={{ fontSize:'0.78rem', padding:'6px 12px' }}>Collapse All</button>
          <button className="btn-primary" onClick={onAddInstance} style={{ fontSize:'0.85rem' }}>+ Add Instance</button>
        </div>
      </div>

      {/* Search bar */}
      <input
        className="input"
        type="text"
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder={`Search ${totalInstances} instances by name, URL, group, or environment…`}
        style={{ marginBottom:16, fontSize:'0.85rem' }}
      />

      {/* Empty state */}
      {filteredGroups.length === 0 && (
        <div style={{ textAlign:'center', padding:48, color:'var(--dim)' }}>
          {instances.length === 0 ? (
            <>
              <div style={{ fontSize:'1.5rem', marginBottom:12 }}>🔗</div>
              <p>No instances configured yet.</p>
              <p style={{ fontSize:'0.85rem', marginTop:8, color:'var(--text2)' }}>
                Run <code style={{ background:'var(--surface2)', padding:'1px 6px', borderRadius:3 }}>nowaikit setup</code> or click <strong>Add Instance</strong>.
              </p>
            </>
          ) : (
            <p>No instances match "{search}"</p>
          )}
        </div>
      )}

      {/* Grouped instance list */}
      <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
        {filteredGroups.map(group => {
          const isExpanded = expandedGroups.has(group.name);
          const envCounts = group.instances.reduce<Record<string, number>>((acc, i) => {
            const env = i.environment || 'other';
            acc[env] = (acc[env] || 0) + 1;
            return acc;
          }, {});

          return (
            <div key={group.name} className="card" style={{ padding:0, overflow:'hidden' }}>
              {/* Group header */}
              <button
                onClick={() => toggleGroup(group.name)}
                style={{
                  width:'100%', display:'flex', alignItems:'center', gap:14,
                  padding:'14px 20px', background:'transparent', border:'none',
                  cursor:'pointer', textAlign:'left', transition:'background .15s',
                }}
              >
                {/* Group icon */}
                <span style={{ fontSize:'1.1rem', width:24, textAlign:'center', flexShrink:0 }}>
                  {group.hasActive ? '🟢' : '⬡'}
                </span>

                {/* Group name + summary */}
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontWeight:600, fontSize:'0.95rem', color:'var(--text)' }}>{group.name}</div>
                  <div style={{ fontSize:'0.75rem', color:'var(--text2)', marginTop:2, display:'flex', gap:8, flexWrap:'wrap' }}>
                    <span>{group.instances.length} {group.instances.length === 1 ? 'instance' : 'instances'}</span>
                    {Object.entries(envCounts).map(([env, count]) => {
                      const s = envStyle(env);
                      return (
                        <span key={env} style={{
                          display:'inline-flex', alignItems:'center', gap:4,
                          padding:'0 6px', borderRadius:8, fontSize:'0.68rem', fontWeight:500,
                          background:s.bg, color:s.fg,
                        }}>
                          {count} {env}
                        </span>
                      );
                    })}
                  </div>
                </div>

                {/* Active badge */}
                {group.hasActive && (
                  <span style={{
                    display:'inline-flex', alignItems:'center', gap:5,
                    padding:'3px 10px', borderRadius:12, fontSize:'0.72rem', fontWeight:500,
                    background:'rgba(34,197,94,0.12)', color:'var(--green)',
                  }}>
                    <span style={{ width:6, height:6, borderRadius:'50%', background:'var(--green)' }} />
                    Active
                  </span>
                )}

                {/* Chevron */}
                <span style={{ fontSize:'0.7rem', color:'var(--dim)', transition:'transform .2s', transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</span>
              </button>

              {/* Expanded: instance list */}
              {isExpanded && (
                <div style={{ borderTop:'1px solid var(--border)' }}>
                  {group.instances.map(inst => {
                    const testResult = testResults[inst.name];
                    const es = envStyle(inst.environment);

                    return (
                      <div key={inst.name} style={{
                        padding:'12px 20px', borderBottom:'1px solid var(--border)',
                        display:'flex', alignItems:'center', gap:14,
                        transition:'background .1s',
                      }}>
                        {/* Environment badge */}
                        <div style={{
                          width:56, flexShrink:0, textAlign:'center',
                          padding:'4px 0', borderRadius:6, fontSize:'0.72rem', fontWeight:600,
                          textTransform:'uppercase', letterSpacing:'0.04em',
                          background:es.bg, color:es.fg,
                        }}>
                          {inst.environment || '—'}
                        </div>

                        {/* Instance info */}
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:2 }}>
                            <span style={{ fontWeight:600, fontSize:'0.88rem' }}>{inst.name}</span>
                            {inst.active && (
                              <span style={{
                                background:'#14532d', color:'#86efac', padding:'1px 8px',
                                borderRadius:12, fontSize:'0.68rem', fontWeight:600,
                              }}>ACTIVE</span>
                            )}
                          </div>
                          <div style={{ fontSize:'0.78rem', color:'var(--text2)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                            {inst.url}
                          </div>
                          <div style={{ fontSize:'0.72rem', color:'var(--dim)', marginTop:2 }}>
                            {inst.authMethod} · {inst.toolPackage.replace(/_/g, ' ')} · {inst.writeEnabled ? 'read/write' : 'read-only'}
                          </div>
                        </div>

                        {/* Actions */}
                        <div style={{ display:'flex', gap:6, flexShrink:0 }}>
                          {!inst.active && (
                            <button className="btn-ghost" onClick={() => onSetDefault(inst.name)} style={{ fontSize:'0.78rem', padding:'5px 12px' }}>
                              Set Active
                            </button>
                          )}
                          <button
                            className="btn-ghost"
                            onClick={() => handleTest(inst.name)}
                            disabled={testResult === 'testing'}
                            style={{ fontSize:'0.78rem', padding:'5px 12px' }}
                          >
                            {testResult === 'testing' ? '…' : 'Test'}
                          </button>
                          <button
                            onClick={() => { if (confirm(`Remove instance "${inst.name}"?`)) onRemove(inst.name); }}
                            style={{
                              background:'transparent', border:'1px solid rgba(239,68,68,0.3)', borderRadius:6,
                              color:'var(--red)', padding:'5px 12px', cursor:'pointer', fontSize:'0.78rem',
                              opacity:0.7, transition:'opacity .15s',
                            }}
                          >
                            ✕
                          </button>
                        </div>

                        {/* Test result inline */}
                        {testResult && testResult !== 'testing' && (
                          <div style={{ position:'absolute', bottom:4, left:90, fontSize:'0.72rem', color: testResult.ok ? 'var(--green)' : 'var(--red)' }}>
                            {testResult.ok ? '✓' : '✗'} {testResult.message}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

import React from 'react';
import type { Page, ThemeMode, ThemeAccent } from '../App.js';
import { useTheme } from '../App.js';

interface Props {
  currentPage: Page;
  onNavigate: (page: Page) => void;
  instanceName?: string;
  instanceCount: number;
  serverOnline: boolean;
}

// SVG nav icons (Feather-style, 18×18)
const NAV_ICONS: Record<Page, React.ReactNode> = {
  dashboard: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
    </svg>
  ),
  chat: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
    </svg>
  ),
  tools: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16"/>
    </svg>
  ),
  instances: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="20" height="8" rx="2" ry="2"/><rect x="2" y="14" width="20" height="8" rx="2" ry="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/>
    </svg>
  ),
  logs: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
    </svg>
  ),
  settings: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
    </svg>
  ),
};

const NAV: { id: Page; label: string }[] = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'chat',      label: 'AI Chat' },
  { id: 'tools',     label: 'Tools' },
  { id: 'instances', label: 'Instances' },
  { id: 'logs',      label: 'Audit Log' },
  { id: 'settings',  label: 'Settings' },
];

const ACCENTS: { id: ThemeAccent; color: string }[] = [
  { id: 'teal',    color: '#00D4AA' },
  { id: 'navy',    color: '#0F4C81' },
  { id: 'blue',    color: '#3b82f6' },
  { id: 'emerald', color: '#22c55e' },
  { id: 'amber',   color: '#f59e0b' },
];

// Inline SVG logo icon — circuit/node motif matching the brand
function LogoIcon({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
      <defs>
        <linearGradient id="logoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#00F0C0" />
          <stop offset="50%" stopColor="#00D4AA" />
          <stop offset="100%" stopColor="#0F4C81" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="8" fill="url(#logoGrad)" />
      {/* Stylised "N" + circuit nodes */}
      <path d="M9 23V9l7 10V9" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="23" cy="12" r="2.5" fill="#fff" opacity="0.9" />
      <circle cx="23" cy="20" r="2.5" fill="#fff" opacity="0.9" />
      <line x1="23" y1="14.5" x2="23" y2="17.5" stroke="#fff" strokeWidth="1.5" opacity="0.6" />
    </svg>
  );
}

export default function Sidebar({ currentPage, onNavigate, instanceName, instanceCount, serverOnline }: Props): React.ReactElement {
  const { mode, accent, setMode, setAccent } = useTheme();

  return (
    <aside style={{
      width: 220, background: 'var(--surface)', borderRight: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column', flexShrink: 0,
    }}>
      {/* Drag region / macOS traffic-light spacer */}
      <div style={{ height: 38, flexShrink: 0, WebkitAppRegion: 'drag' } as React.CSSProperties} />
      {/* Brand */}
      <div style={{ padding: '4px 18px 16px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <LogoIcon size={30} />
          <span style={{ fontWeight: 700, fontSize: '1.05rem', letterSpacing: '-0.3px' }}>
            <span style={{ color: 'var(--text)' }}>Now</span>
            <span style={{
              background: 'linear-gradient(135deg, #00D4AA 0%, #0F4C81 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              fontWeight: 800,
            }}>AI</span>
            <span style={{ color: 'var(--text)' }}>Kit</span>
          </span>
        </div>
        <div style={{ fontSize: '0.73rem', color: 'var(--dim)', paddingLeft: 40 }}>
          {instanceName ? instanceName : 'No instance'}
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '10px 10px', overflowY: 'auto' }}>
        {NAV.map(item => {
          const active = currentPage === item.id;
          return (
            <button key={item.id} onClick={() => onNavigate(item.id)} style={{
              display: 'flex', alignItems: 'center', gap: 10, width: '100%',
              padding: '9px 12px', borderRadius: 7, marginBottom: 2,
              background: active ? 'var(--accent-bg)' : 'transparent',
              color: active ? 'var(--accent)' : 'var(--text2)',
              border: 'none', fontSize: '0.875rem', cursor: 'pointer',
              textAlign: 'left', fontWeight: active ? 600 : 400,
              transition: 'all .15s',
            }}>
              <span style={{ opacity: .8, width: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{NAV_ICONS[item.id]}</span>
              <span>{item.label}</span>
              {item.id === 'chat' && (
                <span style={{ marginLeft: 'auto', width: 7, height: 7, borderRadius: '50%', background: 'var(--accent)', opacity: 0.8 }} />
              )}
            </button>
          );
        })}
      </nav>

      {/* Status */}
      <div style={{ padding: '10px 14px', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.75rem' }}>
        <div style={{ width: 7, height: 7, borderRadius: '50%', background: serverOnline ? 'var(--green)' : 'var(--dim)', flexShrink: 0 }} />
        <span style={{ color: serverOnline ? 'var(--green)' : 'var(--dim)' }}>
          {serverOnline ? 'Server online' : 'Server offline'}
        </span>
        <span style={{ color: 'var(--dim)', marginLeft: 'auto' }}>{instanceCount > 0 ? `${instanceCount} inst.` : 'no inst.'}</span>
      </div>

      {/* Theme controls */}
      <div style={{ padding: '12px 14px 14px' }}>
        {/* Dark / Light toggle */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
          {(['dark', 'light'] as ThemeMode[]).map(m => (
            <button key={m} onClick={() => setMode(m)} style={{
              flex: 1, padding: '5px 0', borderRadius: 6, fontSize: '0.75rem',
              background: mode === m ? 'var(--surface3)' : 'transparent',
              color: mode === m ? 'var(--text)' : 'var(--dim)',
              border: `1px solid ${mode === m ? 'var(--border2)' : 'transparent'}`,
              transition: 'all .15s',
            }}>
              {m === 'dark' ? '🌙 Dark' : '☀ Light'}
            </button>
          ))}
        </div>
        {/* Accent dots */}
        <div style={{ display: 'flex', gap: 7, justifyContent: 'center' }}>
          {ACCENTS.map(a => (
            <button key={a.id} onClick={() => setAccent(a.id)} title={a.id} style={{
              width: 18, height: 18, borderRadius: '50%', background: a.color, border: 'none',
              outline: accent === a.id ? `2px solid ${a.color}` : '2px solid transparent',
              outlineOffset: 2, transition: 'outline .15s', cursor: 'pointer',
            }} />
          ))}
        </div>
      </div>
    </aside>
  );
}

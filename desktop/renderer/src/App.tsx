/**
 * Root app — manages theme, settings, instance data, and page routing.
 * Theme (dark/light + accent) persists to localStorage and is applied
 * on the <html> element via data-theme / data-accent attributes.
 */
import React, { useEffect, useState, useCallback, createContext, useContext } from 'react';
import { api as getApi } from './api.js';
import Setup     from './pages/Setup.js';
import Dashboard from './pages/Dashboard.js';
import Instances from './pages/Instances.js';
import Tools     from './pages/Tools.js';
import Logs      from './pages/Logs.js';
import Chat      from './pages/Chat.js';
import Settings  from './pages/Settings.js';
import Sidebar   from './components/Sidebar.js';

export type Page = 'dashboard' | 'chat' | 'tools' | 'instances' | 'logs' | 'settings';
export type ThemeMode   = 'dark' | 'light';
export type ThemeAccent = 'teal' | 'navy' | 'blue' | 'emerald' | 'amber';
export type AiProviderId = 'anthropic' | 'openai' | 'google' | 'groq' | 'openrouter' | 'ollama' | 'lmstudio';

export interface ProviderSettings {
  apiKey: string;
  authMethod: 'apiKey' | 'login';
  baseUrl?: string;
}

export interface AppInstance {
  name: string; url: string; active: boolean;
  group: string; environment: string;
  toolPackage: string; writeEnabled: boolean; authMethod: 'basic' | 'oauth';
}

export interface AppSettings {
  providers: {
    anthropic:  ProviderSettings;
    openai:     ProviderSettings;
    google:     ProviderSettings;
    groq:       ProviderSettings;
    openrouter: ProviderSettings;
    ollama:     ProviderSettings;
    lmstudio:   ProviderSettings;
  };
  activeProvider: AiProviderId;
  model: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  providers: {
    anthropic:  { apiKey: '', authMethod: 'apiKey' },
    openai:     { apiKey: '', authMethod: 'apiKey' },
    google:     { apiKey: '', authMethod: 'apiKey' },
    groq:       { apiKey: '', authMethod: 'apiKey' },
    openrouter: { apiKey: '', authMethod: 'apiKey' },
    ollama:     { apiKey: '', authMethod: 'apiKey', baseUrl: 'http://localhost:11434' },
    lmstudio:   { apiKey: '', authMethod: 'apiKey', baseUrl: 'http://localhost:1234' },
  },
  activeProvider: 'anthropic',
  model: 'claude-sonnet-4-6',
};

// ── Theme context ─────────────────────────────────────────────────────────────
interface ThemeCtx { mode: ThemeMode; accent: ThemeAccent; setMode: (m: ThemeMode) => void; setAccent: (a: ThemeAccent) => void; }
export const ThemeContext = createContext<ThemeCtx>({ mode: 'dark', accent: 'teal', setMode: () => {}, setAccent: () => {} });
export const useTheme = () => useContext(ThemeContext);

// ── Unified API (Electron IPC or browser fallback) ──────────────────────────
function api(): ElectronAPI { return getApi; }

// Apply theme to <html> and persist
function applyTheme(mode: ThemeMode, accent: ThemeAccent) {
  document.documentElement.setAttribute('data-theme',  mode);
  document.documentElement.setAttribute('data-accent', accent);
  localStorage.setItem('nwk-theme',  mode);
  localStorage.setItem('nwk-accent', accent);
}

export default function App(): React.ReactElement {
  // ── Theme (initialised from localStorage before first render) ────────────
  const [mode,   setModeState]   = useState<ThemeMode>(  () => (localStorage.getItem('nwk-theme')  as ThemeMode)   || 'dark');
  const [accent, setAccentState] = useState<ThemeAccent>(() => (localStorage.getItem('nwk-accent') as ThemeAccent) || 'teal');

  const setMode   = useCallback((m: ThemeMode)   => { setModeState(m);   applyTheme(m,      accent); }, [accent]);
  const setAccent = useCallback((a: ThemeAccent) => { setAccentState(a); applyTheme(mode,   a); },    [mode]);

  useEffect(() => { applyTheme(mode, accent); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── App state ────────────────────────────────────────────────────────────
  const [page,        setPage]        = useState<Page>('dashboard');
  const [instances,   setInstances]   = useState<AppInstance[]>([]);
  const [serverOnline,setServerOnline]= useState(false);
  const [serverUrl,   setServerUrl]   = useState('stdio');
  const [appVersion,  setAppVersion]  = useState('');
  const [settings,    setSettings]    = useState<AppSettings>(DEFAULT_SETTINGS);
  const [loading,     setLoading]     = useState(true);
  const [firstRun,    setFirstRun]    = useState(false);

  const checkHealth = useCallback(async () => {
    const a = api();
    if (!a) return;
    try {
      const status = await a.getServerStatus();
      setServerOnline(status?.running ?? false);
    } catch { setServerOnline(false); }
  }, []);

  const loadData = useCallback(async () => {
    const a = api();
    if (!a) return;
    try {
      const [instanceList, versionInfo, allConfig] = await Promise.all([
        a.listInstances(),
        a.getVersion(),
        a.getAllConfig(),
      ]);
      setAppVersion(versionInfo.app);
      setServerUrl('stdio');

      // Settings: check if stored under 'settings' key or at top level
      const raw = allConfig as Record<string, unknown>;
      const settingsRaw = (raw['settings'] ?? raw) as Record<string, unknown>;
      let parsed: AppSettings = DEFAULT_SETTINGS;
      if (settingsRaw['providers']) {
        parsed = settingsRaw as unknown as AppSettings;
      } else if (settingsRaw['anthropicApiKey']) {
        parsed = {
          ...DEFAULT_SETTINGS,
          providers: {
            ...DEFAULT_SETTINGS.providers,
            anthropic: { apiKey: settingsRaw['anthropicApiKey'] as string, authMethod: 'apiKey' },
          },
          model: (settingsRaw['model'] as string) || DEFAULT_SETTINGS.model,
        };
      }
      setSettings(parsed);

      const activeInstanceName = (raw['activeInstance'] as string) ?? '';
      const inst = instanceList.map((i: InstanceConfig) => ({
        name: i.name,
        url: i.instanceUrl,
        active: i.name === activeInstanceName,
        group: (i as Record<string, unknown>)['group'] as string || 'Default',
        environment: (i as Record<string, unknown>)['environment'] as string || '',
        toolPackage: i.toolPackage || 'full',
        writeEnabled: Boolean(i.writeEnabled),
        authMethod: (i.authMethod || 'basic') as 'basic' | 'oauth',
      }));
      setInstances(inst);
      if (inst.length === 0) setFirstRun(true);
    } catch { setFirstRun(true); }
    await checkHealth();
  }, [checkHealth]);

  useEffect(() => {
    const a = api();
    if (!a) { setLoading(false); return; }
    loadData().finally(() => setLoading(false));

    // Poll server health every 15 seconds so "offline" auto-recovers
    const interval = setInterval(checkHealth, 15_000);
    return () => clearInterval(interval);
  }, [loadData, checkHealth]);

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', flexDirection:'column', gap:12, color:'var(--dim)' }}>
      <div className="spinner" style={{ width:28, height:28, borderWidth:3 }} />
      <span style={{ fontSize:'0.85rem' }}>Starting nowaikit…</span>
    </div>
  );

  if (firstRun) return (
    <ThemeContext.Provider value={{ mode, accent, setMode, setAccent }}>
      <Setup
        onComplete={() => { setFirstRun(false); loadData(); }}
        onClose={() => setFirstRun(false)}
        existingGroups={[...new Set(instances.map(i => i.group).filter(Boolean))]}
      />
    </ThemeContext.Provider>
  );

  const active = instances.find(i => i.active);

  return (
    <ThemeContext.Provider value={{ mode, accent, setMode, setAccent }}>
      <div style={{ display:'flex', height:'100vh', overflow:'hidden' }}>
        <Sidebar
          currentPage={page}
          onNavigate={setPage}
          instanceName={active?.name}
          instanceCount={instances.length}
          serverOnline={serverOnline}
        />
        <main className="fade-in" key={page} style={{ flex:1, overflow:'auto', padding:'0 32px 28px', background:'var(--bg)' }}>
          {/* Drag region for window dragging (macOS hiddenInset titlebar) */}
          <div style={{ height: 38, flexShrink: 0, WebkitAppRegion: 'drag' } as React.CSSProperties} />
          {page === 'dashboard' && (
            <Dashboard instances={instances} serverOnline={serverOnline} appVersion={appVersion} serverUrl={serverUrl} onRefresh={loadData} onNavigate={setPage} />
          )}
          {page === 'chat' && (
            <Chat settings={settings} serverUrl={serverUrl} instances={instances} />
          )}
          {page === 'tools' && (
            <Tools activeToolPackage={active?.toolPackage ?? 'full'} serverOnline={serverOnline} serverUrl={serverUrl} onRestart={loadData} />
          )}
          {page === 'instances' && (
            <Instances
              instances={instances}
              onRemove={async name => { await api()?.removeInstance(name); loadData(); }}
              onSetDefault={async name => { await api()?.setConfig('activeInstance', name); loadData(); }}
              onTest={async name => {
                const a = api();
                if (!a) return { ok: false, message: 'Not available' };
                // Fetch full instance config (with credentials) from backend
                const allInstances = await a.listInstances();
                const fullInst = allInstances.find((i: InstanceConfig) => i.name === name);
                if (!fullInst) return { ok: false, message: 'Instance not found' };
                const r = await a.testInstance(fullInst);
                return { ok: r.success, message: r.success ? 'Connection successful' : (r.error ?? 'Failed') };
              }}
              onAddInstance={() => setFirstRun(true)}
            />
          )}
          {page === 'logs'     && <Logs />}
          {page === 'settings' && (
            <Settings
              settings={settings}
              activeInstance={active}
              onNavigate={setPage}
              onSave={async updated => {
                setSettings(updated);
                await api()?.setConfig('settings', updated as unknown);
              }}
            />
          )}
        </main>
      </div>
    </ThemeContext.Provider>
  );
}

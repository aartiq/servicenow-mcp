import React, { useState } from 'react';
import type { AppSettings, AiProviderId, ThemeMode, ThemeAccent, AppInstance, Page } from '../App.js';
import { useTheme } from '../App.js';
import { PROVIDER_ICONS } from '../components/ProviderIcons.js';
import { api as unifiedApi } from '../api.js';

interface Props {
  settings: AppSettings;
  onSave: (s: AppSettings) => Promise<void>;
  activeInstance?: AppInstance;
  onNavigate?: (p: Page) => void;
}

// ── Provider meta ──────────────────────────────────────────────────────────────
const LOCAL_PROVIDERS = new Set<AiProviderId>(['ollama', 'lmstudio']);

const PROVIDERS: {
  id: AiProviderId;
  label: string;
  icon: string;
  keyLabel: string;
  keyPlaceholder: string;
  portalUrl: string;
  portalLabel: string;
  subscriptionNote: string;
  signInSteps: string[];
}[] = [
  {
    id: 'anthropic',
    label: 'Claude (Anthropic)',
    icon: '◈',
    keyLabel: 'Anthropic API Key',
    keyPlaceholder: 'sk-ant-api03-…',
    portalUrl: 'https://console.anthropic.com/settings/keys',
    portalLabel: 'Anthropic Console',
    subscriptionNote: 'Anthropic API access is separate from Claude.ai subscriptions. You need an API key from the Anthropic Console.',
    signInSteps: [
      'Click "Open Anthropic Console" below',
      'Sign in with your Anthropic account',
      'Go to Settings → API Keys',
      'Click "Create Key", copy it',
      'Paste the key in the field that appears',
    ],
  },
  {
    id: 'openai',
    label: 'ChatGPT / Codex (OpenAI)',
    icon: '◎',
    keyLabel: 'OpenAI API Key',
    keyPlaceholder: 'sk-proj-…',
    portalUrl: 'https://platform.openai.com/api-keys',
    portalLabel: 'OpenAI Platform',
    subscriptionNote: 'ChatGPT Plus / Pro subscriptions give access to chat.openai.com but not the API. You need a separate API key from the OpenAI Platform.',
    signInSteps: [
      'Click "Open OpenAI Platform" below',
      'Sign in with your OpenAI account',
      'Click "Create new secret key"',
      'Copy the key (shown only once)',
      'Paste the key in the field that appears',
    ],
  },
  {
    id: 'google',
    label: 'Gemini (Google AI)',
    icon: '◇',
    keyLabel: 'Google AI API Key',
    keyPlaceholder: 'AIza…',
    portalUrl: 'https://aistudio.google.com/app/apikey',
    portalLabel: 'Google AI Studio',
    subscriptionNote: 'Sign in with your Google account to access Gemini API via Google AI Studio. Free tier available for personal use.',
    signInSteps: [
      'Click "Sign in with Google" below',
      'Sign in with your Google account',
      'Click "Create API key"',
      'Copy the generated key',
      'Paste the key in the field that appears',
    ],
  },
  {
    id: 'groq',
    label: 'Groq (Free)',
    icon: '⚡',
    keyLabel: 'Groq API Key',
    keyPlaceholder: 'gsk_…',
    portalUrl: 'https://console.groq.com/keys',
    portalLabel: 'Groq Console',
    subscriptionNote: 'Groq offers free, ultra-fast inference for open models like Llama 3.3 and Mixtral. Generous free tier with no credit card required.',
    signInSteps: [
      'Click "Open Groq Console" below',
      'Sign up or sign in (free)',
      'Go to API Keys',
      'Click "Create API Key", copy it',
      'Paste the key in the field that appears',
    ],
  },
  {
    id: 'openrouter',
    label: 'OpenRouter (Multi-Provider)',
    icon: '⊕',
    keyLabel: 'OpenRouter API Key',
    keyPlaceholder: 'sk-or-v1-…',
    portalUrl: 'https://openrouter.ai/keys',
    portalLabel: 'OpenRouter',
    subscriptionNote: 'OpenRouter is a unified gateway to 200+ models from OpenAI, Anthropic, Google, xAI, Meta, DeepSeek and more. Many models have free tiers — no credit card required.',
    signInSteps: [
      'Click "Open OpenRouter" below',
      'Sign up or sign in (free)',
      'Go to Keys',
      'Click "Create Key", copy it',
      'Paste the key in the field that appears',
    ],
  },
  {
    id: 'ollama',
    label: 'Ollama (Local)',
    icon: '🦙',
    keyLabel: 'Base URL',
    keyPlaceholder: 'http://localhost:11434',
    portalUrl: 'https://ollama.com/download',
    portalLabel: 'Ollama',
    subscriptionNote: 'Ollama runs AI models locally on your machine — completely free, private, and offline. No API key needed.',
    signInSteps: [
      'Download Ollama from ollama.com/download',
      'Install and open — it runs in the background',
      'Open Terminal and pull a model: ollama pull llama3.3',
      'Wait for download (models are 2–40 GB depending on size)',
      'Verify it\'s running: open http://localhost:11434 in browser — should show "Ollama is running"',
      'Come back here — no API key needed, just keep the default URL',
    ],
  },
  {
    id: 'lmstudio',
    label: 'LM Studio (Local)',
    icon: '🖥',
    keyLabel: 'Base URL',
    keyPlaceholder: 'http://localhost:1234',
    portalUrl: 'https://lmstudio.ai',
    portalLabel: 'LM Studio',
    subscriptionNote: 'LM Studio provides a visual interface to download and run AI models locally — free for personal use. No API key needed.',
    signInSteps: [
      'Download LM Studio from lmstudio.ai',
      'Install and launch the application',
      'Go to the "Discover" tab and download a model (e.g., Llama 3.3, Qwen 3, DeepSeek R1)',
      'Go to the "Developer" tab on the left sidebar',
      'Click "Start Server" — it will start on port 1234',
      'Come back here — no API key needed, just keep the default URL',
    ],
  },
];

const MODELS_BY_PROVIDER: Record<AiProviderId, { value: string; label: string; desc: string }[]> = {
  anthropic: [
    { value: 'claude-opus-4-6',           label: 'Claude Opus 4.6',   desc: 'Most capable, complex reasoning' },
    { value: 'claude-sonnet-4-6',         label: 'Claude Sonnet 4.6', desc: 'Balanced — recommended' },
    { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5',  desc: 'Fastest, lowest cost' },
  ],
  openai: [
    { value: 'gpt-5.2',         label: 'GPT-5.2',         desc: 'Latest flagship — most capable' },
    { value: 'gpt-5.2-pro',     label: 'GPT-5.2 Pro',     desc: 'Highest quality, extended thinking' },
    { value: 'gpt-5.1',         label: 'GPT-5.1',         desc: 'Previous flagship — strong all-round' },
    { value: 'gpt-5-mini',      label: 'GPT-5 mini',      desc: 'Fast & affordable — great for tool use' },
    { value: 'gpt-5-nano',      label: 'GPT-5 nano',      desc: 'Ultra-fast, lowest cost' },
    { value: 'gpt-4.1',         label: 'GPT-4.1',         desc: 'Strong coding & instruction following' },
    { value: 'gpt-4.1-mini',    label: 'GPT-4.1 mini',    desc: 'Fast & budget-friendly' },
    { value: 'gpt-4o',          label: 'GPT-4o',          desc: 'Versatile multimodal' },
    { value: 'o3',              label: 'o3',               desc: 'Advanced reasoning' },
    { value: 'o4-mini',         label: 'o4 mini',          desc: 'Fast reasoning' },
  ],
  google: [
    { value: 'gemini-3.1-pro-preview',  label: 'Gemini 3.1 Pro',  desc: 'Latest — state-of-the-art reasoning' },
    { value: 'gemini-3-pro-preview',     label: 'Gemini 3 Pro',    desc: 'Frontier-class multimodal' },
    { value: 'gemini-3-flash-preview',   label: 'Gemini 3 Flash',  desc: 'Fast & capable — best value' },
    { value: 'gemini-2.5-flash',         label: 'Gemini 2.5 Flash', desc: 'Previous gen — stable & proven' },
    { value: 'gemini-2.5-pro',           label: 'Gemini 2.5 Pro',   desc: 'Previous gen — advanced reasoning' },
  ],
  groq: [
    { value: 'meta-llama/llama-4-maverick-17b-128e-instruct', label: 'Llama 4 Maverick', desc: 'Best quality — 128 experts (recommended)' },
    { value: 'meta-llama/llama-4-scout-17b-16e-instruct',     label: 'Llama 4 Scout',    desc: 'Fast & efficient — 16 experts' },
    { value: 'llama-3.3-70b-versatile',                       label: 'Llama 3.3 70B',    desc: 'Reliable workhorse — tool use' },
    { value: 'llama-3.1-8b-instant',                          label: 'Llama 3.1 8B',     desc: 'Ultra-fast, lightweight' },
  ],
  openrouter: [
    { value: 'openai/o1-pro',                                   label: 'OpenAI o1 Pro',       desc: 'High-end reasoning via OpenRouter' },
    { value: 'xai/grok-4',                                      label: 'Grok 4 (xAI)',        desc: 'Latest xAI general-purpose model' },
    { value: 'anthropic/claude-3.7-sonnet',                      label: 'Claude 3.7 Sonnet',   desc: 'Latest Claude variant via OpenRouter' },
    { value: 'google/gemini-2.0-flash-001',                      label: 'Gemini 2.0 Flash',    desc: 'Google Gemini Flash variant' },
    { value: 'deepseek/deepseek-r1:free',                        label: 'DeepSeek R1',         desc: 'Free — open reasoning model' },
    { value: 'meta-llama/llama-4-maverick-17b-128e-instruct',    label: 'Llama 4 Maverick',    desc: 'Free — best open model' },
    { value: 'meta-llama/llama-3.3-70b-instruct',                label: 'Llama 3.3 70B',       desc: 'Free — strong general-purpose' },
    { value: 'google/gemma-2-9b-it:free',                        label: 'Gemma 2 9B',          desc: 'Free — lightweight Google model' },
  ],
  ollama: [
    { value: 'llama3.3:latest',       label: 'Llama 3.3 70B',    desc: 'Best quality open model' },
    { value: 'llama3.2:latest',       label: 'Llama 3.2 3B',     desc: 'Fast & lightweight' },
    { value: 'qwen3:latest',          label: 'Qwen 3',           desc: 'Strong multilingual reasoning' },
    { value: 'deepseek-r1:latest',    label: 'DeepSeek R1',      desc: 'Advanced reasoning model' },
    { value: 'gemma3:latest',         label: 'Gemma 3',          desc: 'Google open model' },
    { value: 'phi4:latest',           label: 'Phi-4',            desc: 'Microsoft compact model' },
    { value: 'mistral:latest',        label: 'Mistral',          desc: 'Efficient general-purpose' },
    { value: 'granite3.3:latest',     label: 'Granite 3.3',      desc: 'IBM enterprise model' },
  ],
  lmstudio: [
    { value: 'llama-3.3-70b',         label: 'Llama 3.3 70B',    desc: 'Best quality open model' },
    { value: 'qwen3-8b',              label: 'Qwen 3 8B',        desc: 'Strong multilingual reasoning' },
    { value: 'deepseek-r1-distill',   label: 'DeepSeek R1 Distill', desc: 'Reasoning distilled model' },
    { value: 'gemma-3-9b',            label: 'Gemma 3 9B',       desc: 'Google open model' },
    { value: 'phi-4',                 label: 'Phi-4',            desc: 'Microsoft compact model' },
    { value: 'mistral-7b',            label: 'Mistral 7B',       desc: 'Efficient general-purpose' },
  ],
};

const ACCENTS: { id: ThemeAccent; color: string; label: string }[] = [
  { id: 'teal',    color: '#00D4AA', label: 'Teal (default)' },
  { id: 'navy',    color: '#0F4C81', label: 'Navy'    },
  { id: 'blue',    color: '#3b82f6', label: 'Blue'    },
  { id: 'emerald', color: '#22c55e', label: 'Emerald' },
  { id: 'amber',   color: '#f59e0b', label: 'Amber'   },
];

function elApi(): ElectronAPI { return unifiedApi; }

export default function Settings({ settings, onSave, activeInstance, onNavigate }: Props): React.ReactElement {
  const { mode, accent, setMode, setAccent } = useTheme();

  const [draft,      setDraft]      = useState<AppSettings>(settings);
  const [tab,        setTab]        = useState<AiProviderId>('' as AiProviderId);
  const [snOpen,     setSnOpen]     = useState(false);
  const [showKey,    setShowKey]    = useState(false);
  const [saved,      setSaved]      = useState(false);
  const [busy,       setBusy]       = useState(false);

  // Sign-in flow state
  const [signInMode,   setSignInMode]   = useState<'none' | 'steps' | 'paste'>('none');
  const [signingIn,    setSigningIn]    = useState(false);

  // Test key state
  const [testing,      setTesting]      = useState(false);
  const [testResult,   setTestResult]   = useState<{ ok: boolean; msg: string } | null>(null);

  // Local provider state (Ollama, LM Studio)
  const [detectedModels, setDetectedModels] = useState<{ value: string; label: string }[]>([]);
  const [detecting,      setDetecting]      = useState(false);

  // Reset test result when key or tab changes
  function resetTest() { setTestResult(null); }

  function setProviderKey(pid: AiProviderId, key: string) {
    resetTest();
    setDraft(d => ({ ...d, providers: { ...d.providers, [pid]: { ...d.providers[pid], apiKey: key } } }));
  }

  function setProviderBaseUrl(pid: AiProviderId, url: string) {
    resetTest();
    setDetectedModels([]);
    setDraft(d => ({ ...d, providers: { ...d.providers, [pid]: { ...d.providers[pid], baseUrl: url } } }));
  }

  async function save() {
    setBusy(true);
    await onSave(draft);
    setBusy(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function handleSignIn() {
    setSignInMode('steps');
    setSigningIn(true);
    try {
      const a = elApi();
      if (a) {
        await a.openExternal(currentProvider.portalUrl);
      } else {
        window.open(currentProvider.portalUrl, '_blank');
      }
    } finally {
      setSigningIn(false);
      setSignInMode('paste');
    }
  }

  async function testKey() {
    const isLocal = LOCAL_PROVIDERS.has(tab);
    if (isLocal) { await testLocalConnection(); return; }
    const key = draft.providers[tab]?.apiKey ?? '';
    if (!key) { setTestResult({ ok: false, msg: 'Enter a key first' }); return; }
    setTesting(true);
    setTestResult(null);
    try {
      // Quick validation: check key prefix matches provider
      const prefixes: Record<string, string[]> = {
        anthropic: ['sk-ant-'],
        openai: ['sk-'],
        google: ['AIza'],
        groq: ['gsk_'],
        openrouter: ['sk-or-'],
      };
      const expected = prefixes[tab] ?? [];
      if (expected.length > 0 && !expected.some(p => key.startsWith(p))) {
        setTestResult({ ok: false, msg: `Key doesn't match expected format for ${tab}` });
      } else {
        setTestResult({ ok: true, msg: 'Key format looks valid — save to use it' });
      }
    } catch {
      setTestResult({ ok: false, msg: 'Validation error' });
    } finally {
      setTesting(false);
    }
  }

  // Fetch with proxy fallback: try proxy path first (browser mode), fall back to direct (Electron/CORS-allowed)
  async function localFetch(directUrl: string, proxyPath: string): Promise<Response> {
    try {
      const res = await fetch(proxyPath, { signal: AbortSignal.timeout(5000), headers: { 'X-NowAIKit-Proxy': '1' } });
      if (res.status === 404 || res.status === 403) throw new Error('proxy_unavailable');
      return res;
    } catch {
      return fetch(directUrl, { signal: AbortSignal.timeout(5000) });
    }
  }

  async function testLocalConnection() {
    const baseUrl = draft.providers[tab]?.baseUrl || (tab === 'ollama' ? 'http://localhost:11434' : 'http://localhost:1234');
    setTesting(true);
    setTestResult(null);
    try {
      const directUrl = tab === 'ollama' ? `${baseUrl}/api/tags` : `${baseUrl}/v1/models`;
      const proxyPath = tab === 'ollama' ? '/api/ai/ollama/api/tags' : '/api/ai/lmstudio/v1/models';
      const res = await localFetch(directUrl, proxyPath);
      if (res.ok) {
        setTestResult({ ok: true, msg: 'Connected — server is running' });
      } else {
        setTestResult({ ok: false, msg: `Server responded with status ${res.status}` });
      }
    } catch {
      const name = tab === 'ollama' ? 'Ollama' : 'LM Studio';
      setTestResult({ ok: false, msg: `Cannot reach server — make sure ${name} is running` });
    } finally {
      setTesting(false);
    }
  }

  async function detectModels() {
    const baseUrl = draft.providers[tab]?.baseUrl || (tab === 'ollama' ? 'http://localhost:11434' : 'http://localhost:1234');
    setDetecting(true);
    setDetectedModels([]);
    try {
      if (tab === 'ollama') {
        const res = await localFetch(`${baseUrl}/api/tags`, '/api/ai/ollama/api/tags');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json() as { models?: Array<{ name: string; size?: number }> };
        const models = (data.models || []).map(m => ({ value: m.name, label: m.name }));
        setDetectedModels(models);
        if (models.length === 0) setTestResult({ ok: false, msg: 'No models found. Pull one first: ollama pull llama3.3' });
        else setTestResult({ ok: true, msg: `Found ${models.length} model${models.length > 1 ? 's' : ''}` });
      } else {
        const res = await localFetch(`${baseUrl}/v1/models`, '/api/ai/lmstudio/v1/models');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json() as { data?: Array<{ id: string }> };
        const models = (data.data || []).map(m => ({ value: m.id, label: m.id }));
        setDetectedModels(models);
        if (models.length === 0) setTestResult({ ok: false, msg: 'No models loaded. Download one in LM Studio first.' });
        else setTestResult({ ok: true, msg: `Found ${models.length} model${models.length > 1 ? 's' : ''}` });
      }
    } catch {
      const name = tab === 'ollama' ? 'Ollama' : 'LM Studio';
      setTestResult({ ok: false, msg: `Cannot reach ${name} — make sure it's running` });
    } finally {
      setDetecting(false);
    }
  }

  const currentProvider = PROVIDERS.find(p => p.id === tab) ?? PROVIDERS[0];

  const section = (title: string, children: React.ReactNode) => (
    <div style={{ marginBottom: 28 }}>
      <div style={{ fontSize:'0.7rem', fontWeight:700, color:'var(--dim)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:12 }}>{title}</div>
      <div className="card" style={{ padding:'20px 24px' }}>{children}</div>
    </div>
  );

  const row = (label: string, hint: string, control: React.ReactNode) => (
    <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:24, padding:'12px 0', borderBottom:'1px solid var(--border)' }}>
      <div style={{ minWidth:0 }}>
        <div style={{ fontWeight:500, marginBottom:2 }}>{label}</div>
        <div style={{ fontSize:'0.8rem', color:'var(--text2)' }}>{hint}</div>
      </div>
      <div style={{ flexShrink:0 }}>{control}</div>
    </div>
  );

  return (
    <div style={{ maxWidth: 680 }}>
      <div className="page-header">
        <h2 className="page-title" style={{ display:'flex', alignItems:'center', gap:10 }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
          Settings
        </h2>
        <button className="btn-primary" onClick={save} disabled={busy} style={{ opacity: busy ? 0.6 : 1 }}>
          {saved ? '✓ Saved' : busy ? 'Saving…' : 'Save Changes'}
        </button>
      </div>

      {/* ── ServiceNow Connection (collapsible) ─────────────────────────── */}
      <div style={{ marginBottom: 28 }}>
        <button onClick={() => setSnOpen(o => !o)} style={{
          display:'flex', alignItems:'center', gap:8, width:'100%', background:'transparent', border:'none', cursor:'pointer', padding:0, marginBottom:12,
        }}>
          <div style={{ fontSize:'0.7rem', fontWeight:700, color:'var(--dim)', textTransform:'uppercase', letterSpacing:'0.08em' }}>ServiceNow Connection</div>
          <span style={{ fontSize:'0.68rem', color:'var(--dim)', marginLeft:'auto' }}>{activeInstance ? activeInstance.name : 'Not configured'}</span>
          <span style={{ fontSize:'0.7rem', color:'var(--dim)', transition:'transform .2s', transform: snOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</span>
        </button>
        {snOpen && (
          <div className="card" style={{ padding:'20px 24px' }}>
            {activeInstance ? (
              <>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px 24px', marginBottom:16 }}>
                  {[
                    ['Instance',    activeInstance.name],
                    ['URL',         activeInstance.url],
                    ['Auth Method', activeInstance.authMethod],
                    ['Tool Package',activeInstance.toolPackage.replace(/_/g,' ')],
                    ['Write Access',activeInstance.writeEnabled ? 'Enabled' : 'Read-only'],
                  ].map(([label, value]) => (
                    <div key={label} style={{ padding:'8px 0', borderBottom:'1px solid var(--border)' }}>
                      <div style={{ fontSize:'0.72rem', color:'var(--dim)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:3 }}>{label}</div>
                      <div style={{ fontSize:'0.88rem', fontWeight:500, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{value}</div>
                    </div>
                  ))}
                </div>
                <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                  <button className="btn-primary" onClick={() => onNavigate?.('instances')} style={{ fontSize:'0.82rem', padding:'7px 14px' }}>
                    Manage Instances
                  </button>
                  <button className="btn-ghost" onClick={() => onNavigate?.('instances')} style={{ fontSize:'0.82rem', padding:'7px 14px' }}>
                    + Add Instance
                  </button>
                </div>
              </>
            ) : (
              <div style={{ textAlign:'center', padding:'20px 0', color:'var(--dim)' }}>
                <div style={{ fontSize:'0.88rem', marginBottom:12 }}>No ServiceNow instance configured yet.</div>
                <button className="btn-primary" onClick={() => onNavigate?.('instances')} style={{ fontSize:'0.85rem' }}>
                  Configure ServiceNow Instance
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── AI Providers ─────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
          <div style={{ fontSize:'0.7rem', fontWeight:700, color:'var(--dim)', textTransform:'uppercase', letterSpacing:'0.08em' }}>AI Providers</div>
          <div style={{ fontSize:'0.72rem', color:'var(--dim)' }}>
            {PROVIDERS.filter(p => LOCAL_PROVIDERS.has(p.id) || draft.providers[p.id]?.apiKey).length}/{PROVIDERS.length} connected
          </div>
        </div>

        {/* Provider card grid — each card is self-contained and expands on click */}
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          {PROVIDERS.map(p => {
            const isLocal = LOCAL_PROVIDERS.has(p.id);
            const hasKey = isLocal || Boolean(draft.providers[p.id]?.apiKey);
            const isExpanded = tab === p.id;
            const providerModels = MODELS_BY_PROVIDER[p.id];
            const prov = draft.providers[p.id];

            return (
              <div key={p.id} className="card" style={{
                padding:0, overflow:'hidden',
                borderColor: isExpanded ? 'var(--accent)' : hasKey ? 'var(--green-dim, var(--border))' : 'var(--border)',
                transition:'border-color .2s',
              }}>
                {/* Collapsed header — always visible */}
                <button onClick={() => {
                  if (isExpanded) { setTab('' as AiProviderId); } else {
                    setTab(p.id);
                    setDraft(d => {
                      const updated = { ...d, activeProvider: p.id };
                      if (!MODELS_BY_PROVIDER[p.id].find(m => m.value === d.model)) updated.model = MODELS_BY_PROVIDER[p.id][0].value;
                      return updated;
                    });
                    setSignInMode('none'); resetTest(); setShowKey(false); setDetectedModels([]);
                  }
                }} style={{
                  width:'100%', display:'flex', alignItems:'center', gap:14,
                  padding:'14px 20px', background:'transparent', border:'none',
                  cursor:'pointer', textAlign:'left', transition:'background .15s',
                }}>
                  {/* Icon */}
                  <span style={{ width:28, textAlign:'center', flexShrink:0, opacity: hasKey ? 1 : 0.5, display:'flex', alignItems:'center', justifyContent:'center' }}>
                    {React.createElement(PROVIDER_ICONS[p.id] ?? (() => null), { size: 20 })}
                  </span>

                  {/* Name + status */}
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontWeight:600, fontSize:'0.9rem', color:'var(--text)' }}>{p.label}</div>
                    <div style={{ fontSize:'0.75rem', color:'var(--text2)', marginTop:1 }}>
                      {hasKey
                        ? `Connected · ${providerModels.find(m => m.value === (draft.activeProvider === p.id ? draft.model : providerModels[0].value))?.label ?? providerModels[0].label}`
                        : 'Not configured'}
                    </div>
                  </div>

                  {/* Status badge */}
                  {hasKey ? (
                    <span style={{
                      display:'inline-flex', alignItems:'center', gap:5,
                      padding:'3px 10px', borderRadius:12, fontSize:'0.72rem', fontWeight:500,
                      background: isLocal ? 'rgba(99,102,241,0.12)' : 'rgba(34,197,94,0.12)',
                      color: isLocal ? 'var(--accent)' : 'var(--green)',
                    }}>
                      <span style={{ width:6, height:6, borderRadius:'50%', background: isLocal ? 'var(--accent)' : 'var(--green)' }} />
                      {isLocal ? 'Local' : 'Active'}
                    </span>
                  ) : (
                    <span style={{
                      padding:'3px 10px', borderRadius:12, fontSize:'0.72rem', fontWeight:500,
                      background:'var(--surface2)', color:'var(--dim)',
                    }}>
                      Setup needed
                    </span>
                  )}

                  {/* Chevron */}
                  <span style={{ fontSize:'0.7rem', color:'var(--dim)', transition:'transform .2s', transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</span>
                </button>

                {/* Expanded panel — only shown when this provider is selected */}
                {isExpanded && (
                  <div style={{ padding:'0 20px 20px', borderTop:'1px solid var(--border)' }}>

                    {/* Subscription note */}
                    <div style={{ fontSize:'0.8rem', color:'var(--text2)', background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:6, padding:'10px 14px', margin:'16px 0', lineHeight:1.6 }}>
                      {currentProvider.subscriptionNote}
                    </div>

                    {/* ── Sign-In flow: steps ──────────────────────────────── */}
                    {signInMode === 'steps' && (
                      <div>
                        <div style={{ fontWeight:600, marginBottom:14, fontSize:'0.9rem' }}>
                          {signingIn ? `Opening ${currentProvider.portalLabel}…` : `Sign in to ${currentProvider.label}`}
                        </div>
                        <ol style={{ margin:0, padding:'0 0 0 20px', color:'var(--text2)', fontSize:'0.85rem', lineHeight:2 }}>
                          {currentProvider.signInSteps.map((step, i) => (
                            <li key={i} style={{ color: i === 0 && signingIn ? 'var(--accent)' : 'var(--text2)' }}>{step}</li>
                          ))}
                        </ol>
                        {signingIn && (
                          <div style={{ marginTop:16, display:'flex', alignItems:'center', gap:10, color:'var(--dim)', fontSize:'0.82rem' }}>
                            <span className="spinner" style={{ width:14, height:14, borderWidth:2 }} />
                            Portal open — sign in and copy your API key, then close the window
                          </div>
                        )}
                        {!signingIn && (
                          <button className="btn-ghost" onClick={() => setSignInMode('none')} style={{ marginTop:14, fontSize:'0.82rem', padding:'6px 14px' }}>
                            Cancel
                          </button>
                        )}
                      </div>
                    )}

                    {/* ── Sign-In flow: paste step ─────────────────────────── */}
                    {signInMode === 'paste' && (
                      <div>
                        <div style={{ fontWeight:600, marginBottom:8 }}>Paste your API key</div>
                        <div style={{ fontSize:'0.82rem', color:'var(--text2)', marginBottom:12 }}>
                          Copy the key from {currentProvider.portalLabel} and paste it below.
                        </div>
                        <div style={{ display:'flex', gap:8, marginBottom:12 }}>
                          <input
                            autoFocus
                            className="input"
                            type={showKey ? 'text' : 'password'}
                            value={prov.apiKey}
                            onChange={e => setProviderKey(tab, e.target.value)}
                            placeholder={currentProvider.keyPlaceholder}
                            style={{ fontFamily:'monospace', fontSize:'0.85rem', flex:1 }}
                          />
                          <button className="btn-ghost" onClick={() => setShowKey(s => !s)} style={{ flexShrink:0, padding:'8px 14px' }}>
                            {showKey ? 'Hide' : 'Show'}
                          </button>
                        </div>
                        <div style={{ display:'flex', gap:8 }}>
                          <button className="btn-primary" onClick={async () => { await testKey(); }} disabled={testing || !prov.apiKey} style={{ fontSize:'0.82rem', padding:'8px 16px' }}>
                            {testing ? 'Verifying…' : 'Verify Key'}
                          </button>
                          <button className="btn-ghost" onClick={() => { setSignInMode('none'); }} style={{ fontSize:'0.82rem', padding:'8px 16px' }}>
                            Done
                          </button>
                        </div>
                        {testResult && (
                          <div style={{ marginTop:10, fontSize:'0.8rem', color: testResult.ok ? 'var(--green)' : 'var(--red)' }}>
                            {testResult.ok ? '✓ ' : '✗ '}{testResult.msg}
                          </div>
                        )}
                      </div>
                    )}

                    {/* ── Default state: sign-in + key + model picker ──────── */}
                    {signInMode === 'none' && (
                      <div>
                        {isLocal ? (
                          /* ── Local provider UI (Ollama / LM Studio) ──────── */
                          <>
                            {/* Setup guide CTA */}
                            <button
                              className="btn-primary"
                              onClick={handleSignIn}
                              style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16, fontSize:'0.85rem' }}
                            >
                              {currentProvider.icon} {currentProvider.portalLabel} Setup Guide
                              <span style={{ opacity:0.7, fontSize:'0.72rem' }}>→ opens download page</span>
                            </button>

                            {/* Setup steps */}
                            <ol style={{ margin:'0 0 16px', padding:'0 0 0 20px', color:'var(--text2)', fontSize:'0.82rem', lineHeight:2 }}>
                              {currentProvider.signInSteps.map((step, i) => (
                                <li key={i}>{step}</li>
                              ))}
                            </ol>

                            {/* Base URL input */}
                            <div style={{ marginBottom:6, fontWeight:500, fontSize:'0.85rem' }}>{currentProvider.keyLabel}</div>
                            <div style={{ display:'flex', gap:8, marginBottom:8 }}>
                              <input
                                className="input"
                                type="text"
                                value={prov.baseUrl || ''}
                                onChange={e => setProviderBaseUrl(tab, e.target.value)}
                                placeholder={currentProvider.keyPlaceholder}
                                style={{ fontFamily:'monospace', fontSize:'0.85rem', flex:1 }}
                              />
                              <button
                                className="btn-ghost"
                                onClick={testLocalConnection}
                                disabled={testing}
                                style={{ flexShrink:0, padding:'8px 14px', opacity: testing ? 0.5 : 1 }}
                              >
                                {testing ? 'Testing…' : 'Test Connection'}
                              </button>
                              <button
                                className="btn-ghost"
                                onClick={detectModels}
                                disabled={detecting}
                                style={{ flexShrink:0, padding:'8px 14px', opacity: detecting ? 0.5 : 1 }}
                              >
                                {detecting ? 'Detecting…' : 'Detect Models'}
                              </button>
                            </div>

                            {/* Status */}
                            {testResult && (
                              <div style={{ fontSize:'0.78rem', color: testResult.ok ? 'var(--green)' : 'var(--red)', marginBottom:16 }}>
                                {testResult.ok ? '✓ ' : '✗ '}{testResult.msg}
                              </div>
                            )}

                            {/* Detected models list */}
                            {detectedModels.length > 0 && (
                              <div style={{ marginBottom:16, background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:6, padding:'10px 14px' }}>
                                <div style={{ fontSize:'0.72rem', color:'var(--dim)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:8 }}>
                                  Detected Models ({detectedModels.length})
                                </div>
                                <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                                  {detectedModels.map(m => (
                                    <button key={m.value} onClick={() => setDraft(d => ({ ...d, model: m.value }))} style={{
                                      padding:'4px 10px', borderRadius:4, fontSize:'0.78rem', cursor:'pointer',
                                      background: draft.model === m.value ? 'var(--accent)' : 'var(--surface3)',
                                      color: draft.model === m.value ? '#fff' : 'var(--text2)',
                                      border: `1px solid ${draft.model === m.value ? 'var(--accent)' : 'var(--border)'}`,
                                    }}>
                                      {m.label}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                          </>
                        ) : (
                          /* ── Cloud provider UI ──────────────────────────── */
                          <>
                            {/* Sign In CTA */}
                            <button
                              className="btn-primary"
                              onClick={handleSignIn}
                              style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16, fontSize:'0.85rem' }}
                            >
                              {currentProvider.icon} Sign in to {currentProvider.label.split('(')[0].trim()}
                              <span style={{ opacity:0.7, fontSize:'0.72rem' }}>→ opens portal</span>
                            </button>

                            {/* Divider */}
                            <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:16 }}>
                              <div style={{ flex:1, height:1, background:'var(--border)' }} />
                              <span style={{ fontSize:'0.7rem', color:'var(--dim)', textTransform:'uppercase', letterSpacing:'0.06em' }}>or paste API key directly</span>
                              <div style={{ flex:1, height:1, background:'var(--border)' }} />
                            </div>

                            {/* API key input */}
                            <div style={{ marginBottom:6, fontWeight:500, fontSize:'0.85rem' }}>{currentProvider.keyLabel}</div>
                            <div style={{ display:'flex', gap:8, marginBottom:8 }}>
                              <input
                                className="input"
                                type={showKey ? 'text' : 'password'}
                                value={prov.apiKey}
                                onChange={e => setProviderKey(tab, e.target.value)}
                                placeholder={currentProvider.keyPlaceholder}
                                style={{ fontFamily:'monospace', fontSize:'0.85rem', flex:1 }}
                              />
                              <button className="btn-ghost" onClick={() => setShowKey(s => !s)} style={{ flexShrink:0, padding:'8px 14px' }}>
                                {showKey ? 'Hide' : 'Show'}
                              </button>
                              <button
                                className="btn-ghost"
                                onClick={testKey}
                                disabled={testing || !prov.apiKey}
                                style={{ flexShrink:0, padding:'8px 14px', opacity: (!prov.apiKey || testing) ? 0.5 : 1 }}
                              >
                                {testing ? 'Testing…' : 'Test'}
                              </button>
                            </div>

                            {/* Key status */}
                            {testResult ? (
                              <div style={{ fontSize:'0.78rem', color: testResult.ok ? 'var(--green)' : 'var(--red)', marginBottom:16 }}>
                                {testResult.ok ? '✓ ' : '✗ '}{testResult.msg}
                              </div>
                            ) : prov.apiKey ? (
                              <div style={{ fontSize:'0.78rem', color:'var(--green)', marginBottom:16 }}>✓ Key configured — click Test to verify</div>
                            ) : (
                              <div style={{ fontSize:'0.78rem', color:'var(--dim)', marginBottom:16 }}>No key set — this provider is unavailable</div>
                            )}
                          </>
                        )}

                        {/* ── Inline model picker (shared by all) ─────────── */}
                        <div style={{ borderTop:'1px solid var(--border)', paddingTop:16 }}>
                          <div style={{ fontWeight:500, marginBottom:10, fontSize:'0.85rem' }}>Default Model</div>
                          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 }}>
                            {providerModels.map(m => {
                              const isSelected = draft.model === m.value;
                              return (
                                <label key={m.value} style={{
                                  display:'flex', alignItems:'center', gap:10, padding:'8px 12px',
                                  borderRadius:6, cursor:'pointer', transition:'all .15s',
                                  background: isSelected ? 'var(--accent-bg, rgba(79,142,247,0.12))' : 'var(--surface2)',
                                  border: `1px solid ${isSelected ? 'var(--accent)' : 'var(--border)'}`,
                                }}>
                                  <input type="radio" name="model" checked={isSelected} onChange={() => setDraft(d => ({ ...d, model: m.value }))}
                                    style={{ accentColor:'var(--accent)', width:14, height:14, flexShrink:0 }} />
                                  <div style={{ minWidth:0 }}>
                                    <div style={{ fontWeight:500, fontSize:'0.82rem' }}>{m.label}</div>
                                    <div style={{ fontSize:'0.72rem', color:'var(--text2)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{m.desc}</div>
                                  </div>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Appearance ──────────────────────────────────────────────────────── */}
      {section('Appearance', <>
        {row('Theme', 'Switch between dark and light mode', (
          <div style={{ display:'flex', gap:4 }}>
            {(['dark','light'] as ThemeMode[]).map(m => (
              <button key={m} onClick={() => setMode(m)} style={{
                padding:'7px 14px', borderRadius:6, fontSize:'0.82rem', fontWeight:500,
                background: mode === m ? 'var(--accent)' : 'var(--surface3)',
                color: mode === m ? '#fff' : 'var(--text2)', border:'none', cursor:'pointer',
              }}>
                {m === 'dark' ? '🌙 Dark' : '☀️ Light'}
              </button>
            ))}
          </div>
        ))}
        <div style={{ padding:'12px 0' }}>
          <div style={{ fontWeight:500, marginBottom:10 }}>Accent Color</div>
          <div style={{ display:'flex', gap:10 }}>
            {ACCENTS.map(a => (
              <button key={a.id} onClick={() => setAccent(a.id)} title={a.label} style={{
                width:30, height:30, borderRadius:'50%', background:a.color, border:'none',
                boxShadow: accent === a.id ? `0 0 0 3px var(--bg), 0 0 0 5px ${a.color}` : 'none',
                transition:'box-shadow .15s', cursor:'pointer',
              }} />
            ))}
          </div>
        </div>
      </>)}

      {/* ── Support ───────────────────────────────────────────────────────────── */}
      {section('Support', <>
        <div style={{ fontSize:'0.85rem', color:'var(--text2)', lineHeight:1.7 }}>
          <div>Need help or want to report a bug?</div>
          <div style={{ marginTop:8, display:'flex', flexDirection:'column', gap:6 }}>
            <div>
              <span style={{ color:'var(--dim)', fontSize:'0.78rem', marginRight:8 }}>Email</span>
              <button
                onClick={() => elApi()?.openExternal('mailto:support@nowaikit.com')}
                style={{ background:'none', border:'none', color:'var(--accent)', cursor:'pointer', padding:0, fontSize:'0.85rem' }}
              >support@nowaikit.com</button>
            </div>
            <div>
              <span style={{ color:'var(--dim)', fontSize:'0.78rem', marginRight:8 }}>Issues</span>
              <button
                onClick={() => elApi()?.openExternal('https://github.com/aartiq/nowaikit/issues')}
                style={{ background:'none', border:'none', color:'var(--accent)', cursor:'pointer', padding:0, fontSize:'0.85rem' }}
              >GitHub Issues</button>
            </div>
          </div>
        </div>
      </>)}

      {/* ── About ────────────────────────────────────────────────────────────── */}
      {section('About', <>
        <div style={{ fontSize:'0.85rem', color:'var(--text2)', lineHeight:1.7 }}>
          <div><strong>nowaikit</strong> — Your AI companion for ServiceNow</div>
          <div>Config: <code style={{ fontSize:'0.8rem' }}>~/.config/nowaikit/</code></div>
          <div style={{ marginTop:8 }}>
            <button
              onClick={() => elApi()?.openExternal('https://github.com/aartiq/nowaikit')}
              style={{ background:'none', border:'none', color:'var(--accent)', cursor:'pointer', padding:0, fontSize:'0.85rem' }}
            >GitHub</button>
            {' · '}
            <button
              onClick={() => elApi()?.openExternal('https://nowaitkit.com')}
              style={{ background:'none', border:'none', color:'var(--accent)', cursor:'pointer', padding:0, fontSize:'0.85rem' }}
            >Website</button>
          </div>
          <div style={{ marginTop:12, fontSize:'0.72rem', color:'var(--dim)', lineHeight:1.6 }}>
            This software is provided "as is" under the{' '}
            <button
              onClick={() => elApi()?.openExternal('https://github.com/aartiq/nowaikit/blob/main/LICENSE')}
              style={{ background:'none', border:'none', color:'var(--dim)', cursor:'pointer', padding:0, fontSize:'0.72rem', textDecoration:'underline' }}
            >MIT License</button>
            , without warranty of any kind. Use at your own risk.{' '}
            <button
              onClick={() => elApi()?.openExternal('https://github.com/aartiq/nowaikit/blob/main/TERMS.md')}
              style={{ background:'none', border:'none', color:'var(--dim)', cursor:'pointer', padding:0, fontSize:'0.72rem', textDecoration:'underline' }}
            >Terms &amp; Conditions</button>
          </div>
        </div>
      </>)}

      {/* Encryption note */}
      <div style={{ marginTop:28, padding:'14px 18px', background:'var(--surface)', border:'1px solid var(--border)', borderRadius:8, fontSize:'0.78rem', color:'var(--text2)', lineHeight:1.6 }}>
        <strong style={{ color:'var(--text)' }}>Security note:</strong> Passwords and API keys are encrypted at rest using AES-256-GCM (keys stored in your OS keychain). You can edit <code style={{ background:'var(--surface2)', padding:'1px 5px', borderRadius:3 }}>config.json</code> directly with plaintext values — they will be automatically encrypted the next time the app saves settings.
      </div>
    </div>
  );
}

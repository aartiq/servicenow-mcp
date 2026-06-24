/**
 * First-run setup wizard (GUI version of `nowaikit setup`).
 * Multi-step form: URL → Auth → Credentials → Test → Role → Client selection → Done.
 */
import React, { useState } from 'react';
import { api as unifiedApi } from '../api.js';

interface Props {
  onComplete: () => void;
  onClose?: () => void;
  existingGroups?: string[];
}

type Step = 'welcome' | 'url' | 'auth' | 'creds' | 'test' | 'role' | 'clients' | 'done';
type AuthMethod = 'basic' | 'oauth';
type AuthMode = 'service-account' | 'per-user' | 'impersonation';

interface FormState {
  instanceUrl: string;
  instanceName: string;
  group: string;
  environment: string;
  authMethod: AuthMethod;
  authMode: AuthMode;
  username: string;
  password: string;
  clientId: string;
  clientSecret: string;
  toolPackage: string;
  writeEnabled: boolean;
}

const PACKAGES = [
  { value: 'full', label: 'Full — all 400+ tools' },
  { value: 'service_desk', label: 'Service Desk' },
  { value: 'change_coordinator', label: 'Change Coordinator' },
  { value: 'platform_developer', label: 'Platform Developer' },
  { value: 'system_administrator', label: 'System Administrator' },
  { value: 'itom_engineer', label: 'ITOM Engineer' },
];

const STEPS: Step[] = ['welcome', 'url', 'auth', 'creds', 'test', 'role', 'clients', 'done'];

const ENVIRONMENTS = [
  { value: '', label: '— Select —' },
  { value: 'prod', label: 'Production' },
  { value: 'staging', label: 'Staging' },
  { value: 'uat', label: 'UAT' },
  { value: 'test', label: 'Test' },
  { value: 'dev', label: 'Development' },
];

export default function Setup({ onComplete, onClose, existingGroups = [] }: Props): React.ReactElement {
  const [step, setStep] = useState<Step>('welcome');
  const [newGroup, setNewGroup] = useState('');
  const [form, setForm] = useState<FormState>({
    instanceUrl: '', instanceName: 'default',
    group: 'Default', environment: '',
    authMethod: 'basic', authMode: 'service-account',
    username: '', password: '', clientId: '', clientSecret: '',
    toolPackage: 'full', writeEnabled: false,
  });
    const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'ok' | 'fail'>('idle');
  const [testMsg, setTestMsg] = useState('');
  const [saveMsg, setSaveMsg] = useState('');

  const next = () => {
    const idx = STEPS.indexOf(step);
    if (idx < STEPS.length - 1) setStep(STEPS[idx + 1]!);
  };
  const back = () => {
    const idx = STEPS.indexOf(step);
    if (idx > 0) setStep(STEPS[idx - 1]!);
  };
  const update = (key: keyof FormState, val: string | boolean) =>
    setForm(f => ({ ...f, [key]: val }));

  function getApi(): ElectronAPI { return unifiedApi; }

  async function testConnection() {
    setTestStatus('testing');
    try {
      const api = getApi();
      const instance: InstanceConfig = {
        name: form.instanceName,
        instanceUrl: form.instanceUrl,
        authMethod: form.authMethod,
        username: form.username,
        password: form.password,
        clientId: form.clientId,
        clientSecret: form.clientSecret,
        toolPackage: form.toolPackage,
        writeEnabled: form.writeEnabled,
        group: form.group || 'Default',
        environment: form.environment || undefined,
      };
      if (api) {
        const result = await api.testInstance(instance);
        if (result.success) {
          setTestStatus('ok');
          setTestMsg('Connection successful');
        } else {
          setTestStatus('fail');
          setTestMsg(result.error ?? 'Connection failed');
        }
      } else {
        // Browser mode — attempt a basic fetch test
        try {
          const resp = await fetch(`${form.instanceUrl}/api/now/table/sys_properties?sysparm_limit=1`, {
            headers: form.username ? { 'Authorization': 'Basic ' + btoa(`${form.username}:${form.password}`) } : {},
          });
          if (resp.ok) { setTestStatus('ok'); setTestMsg('Connection successful'); }
          else { setTestStatus('fail'); setTestMsg(`HTTP ${resp.status} — check credentials`); }
        } catch {
          setTestStatus('fail');
          setTestMsg('Could not reach instance — check URL and CORS settings');
        }
      }
    } catch (err) {
      setTestStatus('fail');
      setTestMsg(err instanceof Error ? err.message : 'Connection failed');
    }
  }

  async function saveAndFinish() {
    const api = getApi();
    if (api) {
      const instance: InstanceConfig = {
        name: form.instanceName,
        instanceUrl: form.instanceUrl,
        authMethod: form.authMethod,
        username: form.username,
        password: form.password,
        clientId: form.clientId,
        clientSecret: form.clientSecret,
        toolPackage: form.toolPackage,
        writeEnabled: form.writeEnabled,
        group: form.group || 'Default',
        environment: form.environment || undefined,
      };
      const result = await api.addInstance(instance);
      if (!result.success) {
        setSaveMsg(result.error ?? 'Failed to save config');
        return;
      }
    }
    next();
  }

  const styles = {
    container: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', padding: 24 } as React.CSSProperties,
    card: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 40, width: '100%', maxWidth: 520, position: 'relative' } as React.CSSProperties,
    title: { fontSize: '1.4rem', fontWeight: 700, marginBottom: 8 } as React.CSSProperties,
    sub: { color: 'var(--text2)', marginBottom: 28, fontSize: '0.9rem' } as React.CSSProperties,
    label: { display: 'block', fontSize: '0.8rem', color: 'var(--dim)', marginBottom: 6, textTransform: 'uppercase' as const, letterSpacing: '0.05em' },
    input: { width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', padding: '10px 12px', fontSize: '0.9rem', marginBottom: 16 } as React.CSSProperties,
    btn: { background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, padding: '10px 20px', fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer' } as React.CSSProperties,
    btnGhost: { background: 'transparent', color: 'var(--text2)', border: '1px solid var(--border)', borderRadius: 6, padding: '10px 20px', fontSize: '0.9rem', cursor: 'pointer' } as React.CSSProperties,
    row: { display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 24 } as React.CSSProperties,
    progress: { display: 'flex', gap: 6, marginBottom: 28 } as React.CSSProperties,
  };

  const stepIndex = STEPS.indexOf(step);
  const totalVisible = STEPS.length - 2; // exclude welcome and done from progress dots

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        {/* Close button — always visible when onClose is available */}
        {onClose && step !== 'done' && (
          <button onClick={onClose} style={{ position:'absolute', top:12, right:12, background:'transparent', border:'none', color:'var(--dim)', fontSize:'1.2rem', cursor:'pointer', padding:'4px 8px', borderRadius:4, zIndex:10 }} title="Close">✕</button>
        )}

        {step !== 'welcome' && step !== 'done' && (
          <div style={styles.progress}>
            {Array.from({ length: totalVisible }).map((_, i) => (
              <div key={i} style={{ width: 8, height: 8, borderRadius: '50%', background: i < stepIndex ? 'var(--accent)' : 'var(--border)' }} />
            ))}
          </div>
        )}

        {step === 'welcome' && (
          <>
            <h1 style={styles.title}>Welcome to <span style={{ background:'linear-gradient(135deg, #00D4AA 0%, #0F4C81 100%)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>NowAIKit</span></h1>
            <p style={styles.sub}>Connect Any AI to ServiceNow. Instantly.</p>
            <div style={{ display:'flex', gap:12 }}>
              <button style={styles.btn} onClick={next}>Get Started →</button>
              {onClose && <button style={styles.btnGhost} onClick={onClose}>Cancel</button>}
            </div>
          </>
        )}

        {step === 'url' && (
          <>
            <h2 style={styles.title}>ServiceNow Instance</h2>
            <label style={styles.label}>Instance URL</label>
            <div style={{ display:'flex', alignItems:'center', marginBottom:16 }}>
              <span style={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRight:'none', borderRadius:'6px 0 0 6px', padding:'10px 10px', fontSize:'0.9rem', color:'var(--dim)', whiteSpace:'nowrap' }}>https://</span>
              <input
                style={{ ...styles.input, marginBottom:0, borderRadius:0, flex:1 }}
                value={form.instanceUrl.replace(/^https?:\/\//, '').replace(/\.service-now\.com$/, '')}
                onChange={e => {
                  const company = e.target.value.replace(/[^a-zA-Z0-9-]/g, '');
                  update('instanceUrl', `https://${company}.service-now.com`);
                }}
                placeholder="yourcompany"
              />
              <span style={{ background:'var(--surface2)', border:'1px solid var(--border)', borderLeft:'none', borderRadius:'0 6px 6px 0', padding:'10px 10px', fontSize:'0.9rem', color:'var(--dim)', whiteSpace:'nowrap' }}>.service-now.com</span>
            </div>
            <label style={styles.label}>Short name (e.g. prod, dev)</label>
            <input style={styles.input} value={form.instanceName} onChange={e => update('instanceName', e.target.value)} placeholder="default" />

            <label style={styles.label}>Group / Customer</label>
            {existingGroups.length > 0 ? (
              <div style={{ marginBottom:16 }}>
                <select
                  style={{ ...styles.input, cursor:'pointer', marginBottom:8 }}
                  value={form.group === newGroup && newGroup ? '__new__' : form.group}
                  onChange={e => {
                    if (e.target.value === '__new__') {
                      setNewGroup('');
                      update('group', '');
                    } else {
                      update('group', e.target.value);
                      setNewGroup('');
                    }
                  }}
                >
                  {existingGroups.map(g => <option key={g} value={g}>{g}</option>)}
                  <option value="__new__">+ Add new group…</option>
                </select>
                {(form.group === '' || (!existingGroups.includes(form.group) && form.group !== 'Default')) && (
                  <input
                    style={styles.input}
                    value={newGroup}
                    onChange={e => { setNewGroup(e.target.value); update('group', e.target.value); }}
                    placeholder="e.g. Acme Corp, Internal, Customer A"
                  />
                )}
              </div>
            ) : (
              <input style={styles.input} value={form.group} onChange={e => update('group', e.target.value)} placeholder="e.g. Acme Corp, Default" />
            )}

            <label style={styles.label}>Environment</label>
            <select style={{ ...styles.input, cursor:'pointer' }} value={form.environment} onChange={e => update('environment', e.target.value)}>
              {ENVIRONMENTS.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
            </select>

            <div style={styles.row}>
              <button style={styles.btnGhost} onClick={back}>← Back</button>
              <button style={styles.btn} onClick={next} disabled={!form.instanceUrl.startsWith('https://')}>Next →</button>
            </div>
          </>
        )}

        {step === 'auth' && (
          <>
            <h2 style={styles.title}>Authentication</h2>
            <label style={styles.label}>Method</label>
            {(['basic', 'oauth'] as AuthMethod[]).map(m => (
              <label key={m} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, cursor: 'pointer' }}>
                <input type="radio" checked={form.authMethod === m} onChange={() => update('authMethod', m)} />
                <span style={{ fontSize: '0.9rem' }}>{m === 'basic' ? 'Basic Auth (username + password)' : 'OAuth 2.0 (recommended for production)'}</span>
              </label>
            ))}
            <br />
            <label style={styles.label}>Execution Context</label>
            {([['service-account', 'Service account — shared credentials (default)'], ['per-user', 'Per-user — each user runs in their own ServiceNow context (enterprise)'], ['impersonation', 'Impersonation — service account + user ACL context']] as [AuthMode, string][]).map(([v, l]) => (
              <label key={v} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 10, cursor: 'pointer' }}>
                <input type="radio" style={{ marginTop: 3 }} checked={form.authMode === v} onChange={() => update('authMode', v)} />
                <span style={{ fontSize: '0.875rem', color: 'var(--text2)' }}>{l}</span>
              </label>
            ))}
            <div style={styles.row}>
              <button style={styles.btnGhost} onClick={back}>← Back</button>
              <button style={styles.btn} onClick={next}>Next →</button>
            </div>
          </>
        )}

        {step === 'creds' && (
          <>
            <h2 style={styles.title}>Credentials</h2>
            {form.authMethod === 'oauth' && (<>
              <label style={styles.label}>OAuth Client ID</label>
              <input style={styles.input} value={form.clientId} onChange={e => update('clientId', e.target.value)} />
              <label style={styles.label}>OAuth Client Secret</label>
              <input style={styles.input} type="password" value={form.clientSecret} onChange={e => update('clientSecret', e.target.value)} />
            </>)}
            <label style={styles.label}>{form.authMethod === 'oauth' ? 'Service Account Username' : 'Username'}</label>
            <input style={styles.input} value={form.username} onChange={e => update('username', e.target.value)} />
            <label style={styles.label}>Password</label>
            <input style={styles.input} type="password" value={form.password} onChange={e => update('password', e.target.value)} />
            <div style={styles.row}>
              <button style={styles.btnGhost} onClick={back}>← Back</button>
              <button style={styles.btn} onClick={next}>Next →</button>
            </div>
          </>
        )}

        {step === 'test' && (
          <>
            <h2 style={styles.title}>Test Connection</h2>
            <p style={styles.sub}>Verify nowaikit can reach your ServiceNow instance.</p>
            {testStatus === 'idle' && <button style={styles.btn} onClick={testConnection}>Test Connection</button>}
            {testStatus === 'testing' && <p style={{ color: 'var(--dim)' }}>Testing…</p>}
            {testStatus === 'ok' && <p style={{ color: 'var(--green)', marginBottom: 16 }}>✓ {testMsg}</p>}
            {testStatus === 'fail' && <p style={{ color: 'var(--red)', marginBottom: 16 }}>✗ {testMsg}</p>}
            <div style={styles.row}>
              <button style={styles.btnGhost} onClick={back}>← Back</button>
              {(testStatus === 'ok' || testStatus === 'fail') && <button style={styles.btn} onClick={next}>Next →</button>}
            </div>
          </>
        )}

        {step === 'role' && (
          <>
            <h2 style={styles.title}>Tool Package & Permissions</h2>
            <label style={styles.label}>Tool Package</label>
            <select style={{ ...styles.input, cursor: 'pointer' }} value={form.toolPackage} onChange={e => update('toolPackage', e.target.value)}>
              {PACKAGES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input type="checkbox" checked={form.writeEnabled} onChange={e => update('writeEnabled', e.target.checked)} />
              <span style={{ fontSize: '0.9rem' }}>Enable write operations (create/update/delete)</span>
            </label>
            <div style={styles.row}>
              <button style={styles.btnGhost} onClick={back}>← Back</button>
              <button style={styles.btn} onClick={next}>Next →</button>
            </div>
          </>
        )}

        {step === 'clients' && (
          <>
            <h2 style={styles.title}>Install into AI Client</h2>
            <p style={styles.sub}>nowaikit will write the config automatically. You can also do this later from the Instances page.</p>
            <p style={{ color: 'var(--text2)', fontSize: '0.875rem', marginBottom: 20 }}>
              Click <strong>Install</strong> to detect installed clients and write their configs, or <strong>Skip</strong> to configure manually later.
            </p>
            {saveMsg && <p style={{ color: 'var(--red)', fontSize: '0.875rem', marginBottom: 8 }}>✗ {saveMsg}</p>}
            <div style={styles.row}>
              <button style={styles.btnGhost} onClick={saveAndFinish}>Skip for now</button>
              <button style={styles.btn} onClick={saveAndFinish}>Install &amp; Finish →</button>
            </div>
          </>
        )}

        {step === 'done' && (
          <>
            <h2 style={{ ...styles.title, color: 'var(--green)' }}>✓ Setup Complete!</h2>
            <p style={styles.sub}>
              nowaikit is connected to <strong>{form.instanceUrl}</strong> as <strong>{form.instanceName}</strong>.
            </p>
            <p style={{ color: 'var(--text2)', fontSize: '0.875rem', marginBottom: 24 }}>
              Open your AI client (Claude Desktop, Cursor, etc.) and start using ServiceNow tools.
              Try: <em>"List my 5 most recent open incidents"</em>
            </p>
            <button style={styles.btn} onClick={onComplete}>Open Dashboard →</button>
          </>
        )}
      </div>
    </div>
  );
}

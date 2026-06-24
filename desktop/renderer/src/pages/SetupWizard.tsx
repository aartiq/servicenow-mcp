import { useState } from 'react';
import { api } from '../api';

type Step = 'instance' | 'auth' | 'credentials' | 'test' | 'permissions' | 'client' | 'confirm' | 'done';

const STEPS: { key: Step; label: string }[] = [
  { key: 'instance', label: 'Instance' },
  { key: 'auth', label: 'Auth Method' },
  { key: 'credentials', label: 'Credentials' },
  { key: 'test', label: 'Test' },
  { key: 'permissions', label: 'Permissions' },
  { key: 'client', label: 'AI Client' },
  { key: 'confirm', label: 'Confirm' },
  { key: 'done', label: 'Done' },
];

const TOOL_PACKAGES = [
  { value: 'full', label: 'Full', desc: 'All 350+ tools' },
  { value: 'service_desk', label: 'Service Desk', desc: 'Incidents, approvals, knowledge, SLA' },
  { value: 'platform_developer', label: 'Platform Developer', desc: 'Scripts, ACLs, ATF, changesets' },
  { value: 'system_administrator', label: 'System Admin', desc: 'Users, groups, reports, jobs' },
  { value: 'ai_developer', label: 'AI Developer', desc: 'Now Assist, NLQ, playbooks' },
  { value: 'change_coordinator', label: 'Change Coordinator', desc: 'Changes, approvals, CMDB' },
  { value: 'itom_engineer', label: 'ITOM Engineer', desc: 'CMDB, discovery, events' },
  { value: 'agile_manager', label: 'Agile Manager', desc: 'Stories, epics, sprints' },
];

export function SetupWizard() {
  const [step, setStep] = useState<Step>('instance');
  const [form, setForm] = useState<InstanceConfig>({
    name: '',
    instanceUrl: '',
    authMethod: 'basic',
    username: '',
    password: '',
    clientId: '',
    clientSecret: '',
    toolPackage: 'full',
    writeEnabled: false,
    nowAssistEnabled: false,
  });
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; error?: string; info?: Record<string, unknown> } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const currentIdx = STEPS.findIndex(s => s.key === step);

  function update(fields: Partial<InstanceConfig>) {
    setForm(prev => ({ ...prev, ...fields }));
  }

  function next() {
    const nextStep = STEPS[currentIdx + 1];
    if (nextStep) setStep(nextStep.key);
  }

  function prev() {
    const prevStep = STEPS[currentIdx - 1];
    if (prevStep) setStep(prevStep.key);
  }

  async function testConnection() {
    setTesting(true);
    setTestResult(null);
    const result = await api.testInstance(form);
    setTestResult(result);
    setTesting(false);
  }

  async function save() {
    setSaving(true);
    setError('');

    if (!form.name) {
      // Auto-generate name from URL
      const match = form.instanceUrl.match(/\/\/([^.]+)/);
      form.name = match ? match[1] : 'default';
    }

    const result = await api.addInstance(form);
    if (!result.success) {
      setError(result.error || 'Failed to save');
      setSaving(false);
      return;
    }

    // Start the server with the new instance
    await api.startServer(form.name);
    setSaving(false);
    setStep('done');
  }

  return (
    <div className="fade-in">
      <div className="page-header">
        <h1 className="page-title">Setup Wizard</h1>
        <p className="page-subtitle">Connect Any AI to ServiceNow. Instantly.</p>
      </div>

      {/* Step indicators */}
      <div className="wizard-steps">
        {STEPS.map((s, i) => (
          <div key={s.key} className={`wizard-step ${s.key === step ? 'active' : ''} ${i < currentIdx ? 'completed' : ''}`}>
            <span className="wizard-step-number">{i < currentIdx ? '\u2713' : i + 1}</span>
            {s.label}
          </div>
        ))}
      </div>

      <div className="card">
        {/* Step 1: Instance URL */}
        {step === 'instance' && (
          <div>
            <h3 style={{ marginBottom: 16 }}>ServiceNow Instance</h3>
            <div className="form-group">
              <label className="form-label">Instance URL</label>
              <input
                className="form-input"
                placeholder="https://yourcompany.service-now.com"
                value={form.instanceUrl}
                onChange={e => update({ instanceUrl: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Instance Name (optional)</label>
              <input
                className="form-input"
                placeholder="Auto-detected from URL"
                value={form.name}
                onChange={e => update({ name: e.target.value })}
              />
            </div>
            <button className="btn btn-primary" onClick={next} disabled={!form.instanceUrl}>
              Next
            </button>
          </div>
        )}

        {/* Step 2: Auth Method */}
        {step === 'auth' && (
          <div>
            <h3 style={{ marginBottom: 16 }}>Authentication Method</h3>
            <div style={{ display: 'flex', gap: 12 }}>
              {(['basic', 'oauth'] as const).map(method => (
                <div
                  key={method}
                  onClick={() => update({ authMethod: method })}
                  style={{
                    flex: 1, padding: 20, borderRadius: 'var(--radius-lg)', cursor: 'pointer',
                    border: `2px solid ${form.authMethod === method ? 'var(--accent)' : 'var(--border)'}`,
                    background: form.authMethod === method ? 'var(--accent-bg)' : 'var(--bg)',
                  }}
                >
                  <strong>{method === 'basic' ? 'Basic Auth' : 'OAuth 2.0'}</strong>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                    {method === 'basic' ? 'Username & password — quick for dev/test' : 'Client credentials — recommended for production'}
                  </p>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
              <button className="btn btn-secondary" onClick={prev}>Back</button>
              <button className="btn btn-primary" onClick={next}>Next</button>
            </div>
          </div>
        )}

        {/* Step 3: Credentials */}
        {step === 'credentials' && (
          <div>
            <h3 style={{ marginBottom: 16 }}>Credentials</h3>
            {form.authMethod === 'basic' ? (
              <>
                <div className="form-group">
                  <label className="form-label">Username</label>
                  <input className="form-input" value={form.username || ''} onChange={e => update({ username: e.target.value })} placeholder="admin" />
                </div>
                <div className="form-group">
                  <label className="form-label">Password</label>
                  <input className="form-input" type="password" value={form.password || ''} onChange={e => update({ password: e.target.value })} />
                </div>
              </>
            ) : (
              <>
                <div className="form-group">
                  <label className="form-label">OAuth Client ID</label>
                  <input className="form-input" value={form.clientId || ''} onChange={e => update({ clientId: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">OAuth Client Secret</label>
                  <input className="form-input" type="password" value={form.clientSecret || ''} onChange={e => update({ clientSecret: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Username</label>
                  <input className="form-input" value={form.username || ''} onChange={e => update({ username: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Password</label>
                  <input className="form-input" type="password" value={form.password || ''} onChange={e => update({ password: e.target.value })} />
                </div>
              </>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-secondary" onClick={prev}>Back</button>
              <button className="btn btn-primary" onClick={() => { testConnection(); next(); }}>
                Test & Continue
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Test Connection */}
        {step === 'test' && (
          <div>
            <h3 style={{ marginBottom: 16 }}>Testing Connection</h3>
            {testing && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 20 }}>
                <span className="spinner" />
                Connecting to {form.instanceUrl}...
              </div>
            )}
            {testResult && testResult.success && (
              <div className="alert alert-success">
                Connected successfully! Instance: {String((testResult.info as Record<string, unknown>)?.instanceName || 'OK')}
              </div>
            )}
            {testResult && !testResult.success && (
              <div className="alert alert-error">
                Connection failed: {testResult.error}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button className="btn btn-secondary" onClick={prev}>Back</button>
              <button className="btn btn-secondary" onClick={testConnection} disabled={testing}>
                Retry
              </button>
              <button className="btn btn-primary" onClick={next} disabled={testing}>
                {testResult?.success ? 'Next' : 'Skip & Continue'}
              </button>
            </div>
          </div>
        )}

        {/* Step 5: Permissions */}
        {step === 'permissions' && (
          <div>
            <h3 style={{ marginBottom: 16 }}>Permissions & Tool Package</h3>
            <div className="form-group">
              <label className="form-label">Tool Package</label>
              <select className="form-select" value={form.toolPackage} onChange={e => update({ toolPackage: e.target.value })}>
                {TOOL_PACKAGES.map(p => (
                  <option key={p.value} value={p.value}>{p.label} — {p.desc}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-checkbox">
                <input type="checkbox" checked={form.writeEnabled || false} onChange={e => update({ writeEnabled: e.target.checked })} />
                Enable write operations (create, update, delete records)
              </label>
            </div>
            <div className="form-group">
              <label className="form-checkbox">
                <input type="checkbox" checked={form.nowAssistEnabled || false} onChange={e => update({ nowAssistEnabled: e.target.checked })} />
                Enable Now Assist / AI tools (NLQ, AI Search, Agentic Playbooks)
              </label>
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '8px 0 16px', lineHeight: 1.5 }}>
              AI Skills generate branded PDF &amp; PPTX reports with charts and ServiceNow links.
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-secondary" onClick={prev}>Back</button>
              <button className="btn btn-primary" onClick={next}>Next</button>
            </div>
          </div>
        )}

        {/* Step 6: AI Client */}
        {step === 'client' && (
          <div>
            <h3 style={{ marginBottom: 16 }}>AI Client Configuration</h3>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
              The desktop app starts the MCP server automatically. Your AI client just needs to point to it.
              After setup, use the connection details below in your AI client's MCP configuration.
            </p>
            <div className="code-block">
{`{
  "mcpServers": {
    "nowaikit": {
      "command": "node",
      "args": ["<server-path>/dist/server.js"],
      "env": {
        "SERVICENOW_INSTANCE_URL": "${form.instanceUrl}",
        "SERVICENOW_AUTH_METHOD": "${form.authMethod}",
        "MCP_TOOL_PACKAGE": "${form.toolPackage || 'full'}"
      }
    }
  }
}`}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button className="btn btn-secondary" onClick={prev}>Back</button>
              <button className="btn btn-primary" onClick={next}>Next</button>
            </div>
          </div>
        )}

        {/* Step 7: Confirm */}
        {step === 'confirm' && (
          <div>
            <h3 style={{ marginBottom: 16 }}>Confirm Configuration</h3>
            <table className="data-table">
              <tbody>
                <tr><td style={{ fontWeight: 600, width: 180 }}>Instance URL</td><td>{form.instanceUrl}</td></tr>
                <tr><td style={{ fontWeight: 600 }}>Instance Name</td><td>{form.name || '(auto)'}</td></tr>
                <tr><td style={{ fontWeight: 600 }}>Auth Method</td><td>{form.authMethod === 'basic' ? 'Basic Auth' : 'OAuth 2.0'}</td></tr>
                <tr><td style={{ fontWeight: 600 }}>Username</td><td>{form.username}</td></tr>
                <tr><td style={{ fontWeight: 600 }}>Tool Package</td><td>{form.toolPackage}</td></tr>
                <tr><td style={{ fontWeight: 600 }}>Write Enabled</td><td>{form.writeEnabled ? 'Yes' : 'No'}</td></tr>
                <tr><td style={{ fontWeight: 600 }}>Now Assist</td><td>{form.nowAssistEnabled ? 'Yes' : 'No'}</td></tr>
              </tbody>
            </table>
            {error && <div className="alert alert-error" style={{ marginTop: 16 }}>{error}</div>}
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button className="btn btn-secondary" onClick={prev}>Back</button>
              <button className="btn btn-primary" onClick={save} disabled={saving}>
                {saving ? <><span className="spinner" /> Saving...</> : 'Save & Start Server'}
              </button>
            </div>
          </div>
        )}

        {/* Step 8: Done */}
        {step === 'done' && (
          <div style={{ textAlign: 'center', padding: 32 }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>&#10003;</div>
            <h3>Setup Complete!</h3>
            <p style={{ color: 'var(--text-muted)', marginTop: 8 }}>
              nowaikit is connected to <strong>{form.instanceUrl}</strong> and the MCP server is running.
            </p>
            <p style={{ color: 'var(--text-muted)', marginTop: 8 }}>
              Open Claude Desktop, Cursor, or VS Code and start asking questions about your ServiceNow instance.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

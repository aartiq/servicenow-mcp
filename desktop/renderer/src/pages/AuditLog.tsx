import { useEffect, useState } from 'react';
import { api } from '../api';

export function AuditLog() {
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    refresh();
    const poll = setInterval(refresh, 5000);
    return () => clearInterval(poll);
  }, []);

  async function refresh() {
    const data = await api.getAuditLogs(500);
    setLogs(data);
    setLoading(false);
  }

  const filtered = logs.filter(log => {
    if (!filter) return true;
    const q = filter.toLowerCase();
    return (
      (log.tool && log.tool.toLowerCase().includes(q)) ||
      (log.event && log.event.toLowerCase().includes(q)) ||
      (log.instance && log.instance.toLowerCase().includes(q)) ||
      (log.user && log.user.toLowerCase().includes(q))
    );
  });

  const successCount = filtered.filter(l => l.success === true).length;
  const errorCount = filtered.filter(l => l.success === false).length;

  return (
    <div className="fade-in">
      <div className="page-header">
        <h1 className="page-title">Audit Log</h1>
        <p className="page-subtitle">Every tool call, resource read, and prompt resolve is logged here</p>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Total Events</div>
          <div className="stat-value">{filtered.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Successful</div>
          <div className="stat-value green">{successCount}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Errors</div>
          <div className="stat-value" style={{ color: errorCount > 0 ? 'var(--red)' : 'var(--text)' }}>{errorCount}</div>
        </div>
      </div>

      <input
        className="search-input"
        placeholder="Filter by tool, event, instance, or user..."
        value={filter}
        onChange={e => setFilter(e.target.value)}
      />

      <div className="card">
        {loading ? (
          <div style={{ textAlign: 'center', padding: 32 }}>
            <span className="spinner" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>
            </svg>
            <h3>No audit logs yet</h3>
            <p>Logs will appear here once you start using nowaikit tools.</p>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Event</th>
                <th>Tool</th>
                <th>Instance</th>
                <th>User</th>
                <th>Status</th>
                <th>Duration</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((log, i) => (
                <tr key={i}>
                  <td style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>
                    {log.ts ? new Date(log.ts).toLocaleString() : '—'}
                  </td>
                  <td><span className="code">{log.event}</span></td>
                  <td>{log.tool ? <span className="code">{log.tool}</span> : '—'}</td>
                  <td>{log.instance || '—'}</td>
                  <td>{log.user || '—'}</td>
                  <td>
                    {log.success !== undefined ? (
                      <span className={`badge ${log.success ? 'badge-green' : 'badge-red'}`}>
                        {log.success ? 'OK' : 'Error'}
                      </span>
                    ) : '—'}
                  </td>
                  <td>{log.durationMs ? `${log.durationMs}ms` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

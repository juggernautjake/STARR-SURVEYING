// app/admin/error-log/page.tsx — Admin error log viewer
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';

interface ErrorReportRow {
  id: string;
  error_message: string;
  error_stack: string | null;
  error_type: string;
  error_code: string | null;
  component_name: string | null;
  element_selector: string | null;
  page_url: string;
  page_title: string | null;
  route_path: string | null;
  api_endpoint: string | null;
  request_method: string | null;
  user_email: string;
  user_name: string | null;
  user_role: string | null;
  user_notes: string | null;
  user_expected: string | null;
  user_cause_guess: string | null;
  severity: string;
  browser_info: string | null;
  screen_size: string | null;
  viewport_size: string | null;
  connection_type: string | null;
  memory_usage: string | null;
  session_duration_ms: number | null;
  console_logs: unknown[] | null;
  breadcrumbs: unknown[] | null;
  status: string;
  assigned_to: string | null;
  resolution_notes: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  occurred_at: string;
  created_at: string;
}

const STATUS_OPTIONS = ['all', 'new', 'acknowledged', 'investigating', 'resolved', 'wont_fix'];
const TYPE_OPTIONS = ['all', 'render', 'api', 'runtime', 'promise', 'network', 'validation', 'auth', 'unknown'];
const SEVERITY_OPTIONS = ['all', 'critical', 'high', 'medium', 'low'];

function formatTimeAgo(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString();
}

function formatFullDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString([], {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

function formatDuration(ms: number): string {
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ${secs % 60}s`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m`;
}

export default function ErrorLogPage() {
  const { data: session } = useSession();
  const [reports, setReports] = useState<ErrorReportRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);

  // Filters
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [severityFilter, setSeverityFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');

  // Expanded items
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setSearchDebounced(search), 400);
    return () => clearTimeout(timer);
  }, [search]);

  const loadReports = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        admin: 'true',
        page: String(page),
        limit: '30',
      });
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (typeFilter !== 'all') params.set('error_type', typeFilter);
      if (severityFilter !== 'all') params.set('severity', severityFilter);
      if (searchDebounced) params.set('search', searchDebounced);

      const res = await fetch(`/api/admin/errors?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setReports(data.reports || []);
        setTotal(data.total || 0);
        setTotalPages(data.totalPages || 1);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [page, statusFilter, typeFilter, severityFilter, searchDebounced]);

  useEffect(() => {
    if (session?.user) loadReports();
  }, [session, loadReports]);

  // Reset page when filters change
  useEffect(() => { setPage(1); }, [statusFilter, typeFilter, severityFilter, searchDebounced]);

  async function updateStatus(id: string, status: string) {
    try {
      await fetch('/api/admin/errors', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      });
      loadReports();
    } catch { /* ignore */ }
  }

  async function deleteReport(id: string) {
    if (!confirm('Delete this error report permanently?')) return;
    try {
      await fetch(`/api/admin/errors?id=${id}`, { method: 'DELETE' });
      if (expandedId === id) setExpandedId(null);
      loadReports();
    } catch { /* ignore */ }
  }

  if (!session?.user) return null;

  // Stats from current reports (client-side from loaded page)
  const newCount = reports.filter(r => r.status === 'new').length;
  const criticalCount = reports.filter(r => r.severity === 'critical').length;
  const highCount = reports.filter(r => r.severity === 'high').length;

  return (
    <>
      {/* Summary stats */}
      <div className="err-log__stats">
        <div className={`err-log__stat ${total > 0 ? 'err-log__stat--new' : ''}`}>
          <span className="err-log__stat-val">{total}</span>
          <span className="err-log__stat-lbl">Total Reports</span>
        </div>
        <div className={`err-log__stat ${newCount > 0 ? 'err-log__stat--new' : ''}`}>
          <span className="err-log__stat-val">{newCount}</span>
          <span className="err-log__stat-lbl">New / Unreviewed</span>
        </div>
        <div className={`err-log__stat ${criticalCount > 0 ? 'err-log__stat--critical' : ''}`}>
          <span className="err-log__stat-val">{criticalCount}</span>
          <span className="err-log__stat-lbl">Critical</span>
        </div>
        <div className={`err-log__stat ${highCount > 0 ? 'err-log__stat--high' : ''}`}>
          <span className="err-log__stat-val">{highCount}</span>
          <span className="err-log__stat-lbl">High Severity</span>
        </div>
      </div>

      {/* Filters */}
      <div className="err-log__filters">
        <div className="err-log__filter-group">
          <span className="err-log__filter-label">Status:</span>
          <select className="err-log__filter-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s === 'all' ? 'All' : s === 'wont_fix' ? "Won't Fix" : s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
          </select>
        </div>
        <div className="err-log__filter-group">
          <span className="err-log__filter-label">Type:</span>
          <select className="err-log__filter-select" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
            {TYPE_OPTIONS.map(t => <option key={t} value={t}>{t === 'all' ? 'All' : t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
          </select>
        </div>
        <div className="err-log__filter-group">
          <span className="err-log__filter-label">Severity:</span>
          <select className="err-log__filter-select" value={severityFilter} onChange={e => setSeverityFilter(e.target.value)}>
            {SEVERITY_OPTIONS.map(s => <option key={s} value={s}>{s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
          </select>
        </div>
        <input
          className="err-log__search"
          type="text"
          placeholder="Search errors, pages, components..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Reports list */}
      {loading ? (
        <div className="err-log__empty">
          <p>Loading error reports...</p>
        </div>
      ) : reports.length === 0 ? (
        <div className="err-log__empty">
          <div className="err-log__empty-icon">✅</div>
          <p>No error reports found</p>
          <p style={{ fontSize: '0.8rem', color: '#9CA3AF' }}>
            {statusFilter !== 'all' || typeFilter !== 'all' || severityFilter !== 'all' || searchDebounced
              ? 'Try adjusting your filters'
              : 'Error reports will appear here when users encounter issues'}
          </p>
        </div>
      ) : (
        <div className="err-log__list">
          {reports.map(r => {
            const isExpanded = expandedId === r.id;
            return (
              <div key={r.id} className={`err-log__item err-log__item--${r.severity}`}>
                <div className="err-log__item-header" onClick={() => setExpandedId(isExpanded ? null : r.id)}>
                  <div className="err-log__item-left">
                    <span className={`err-log__item-severity err-log__item-severity--${r.severity}`}>
                      {r.severity}
                    </span>
                    <span className="err-log__item-msg">{r.error_message}</span>
                  </div>
                  <div className="err-log__item-right">
                    <span className="err-log__item-type">{r.error_type}</span>
                    <span className={`err-log__item-status err-log__item-status--${r.status}`}>
                      {r.status === 'wont_fix' ? "Won't Fix" : r.status}
                    </span>
                    <span className="err-log__item-time">{formatTimeAgo(r.created_at)}</span>
                    <span className={`err-log__item-arrow ${isExpanded ? 'err-log__item-arrow--open' : ''}`}>▶</span>
                  </div>
                </div>

                {isExpanded && (
                  <div className="err-log__item-body">
                    {/* Core details */}
                    <div className="err-log__detail-grid">
                      <div className="err-log__detail-field">
                        <label>User</label>
                        <span>{r.user_name || r.user_email}</span>
                      </div>
                      <div className="err-log__detail-field">
                        <label>Role</label>
                        <span>{r.user_role || '—'}</span>
                      </div>
                      <div className="err-log__detail-field">
                        <label>Page</label>
                        <span>{r.route_path || r.page_url || '—'}</span>
                      </div>
                      <div className="err-log__detail-field">
                        <label>Component</label>
                        <span>{r.component_name || '—'}</span>
                      </div>
                      <div className="err-log__detail-field">
                        <label>Occurred At</label>
                        <span>{formatFullDate(r.occurred_at)}</span>
                      </div>
                      <div className="err-log__detail-field">
                        <label>Reported At</label>
                        <span>{formatFullDate(r.created_at)}</span>
                      </div>
                      {r.api_endpoint && (
                        <div className="err-log__detail-field">
                          <label>API Endpoint</label>
                          <span>{r.request_method} {r.api_endpoint}</span>
                        </div>
                      )}
                      {r.element_selector && (
                        <div className="err-log__detail-field">
                          <label>Element</label>
                          <span>{r.element_selector}</span>
                        </div>
                      )}
                    </div>

                    {/* User notes */}
                    {r.user_notes && (
                      <div className="err-log__detail-section">
                        <h4>What The User Was Doing</h4>
                        <p>{r.user_notes}</p>
                      </div>
                    )}

                    {r.user_expected && (
                      <div className="err-log__detail-section">
                        <h4>What They Expected</h4>
                        <p>{r.user_expected}</p>
                      </div>
                    )}

                    {r.user_cause_guess && (
                      <div className="err-log__detail-section">
                        <h4>User&apos;s Guess Why It Happened</h4>
                        <p>{r.user_cause_guess}</p>
                      </div>
                    )}

                    {/* Environment */}
                    <div className="err-log__detail-section">
                      <h4>Environment</h4>
                      <div className="err-log__detail-grid">
                        {r.browser_info && (
                          <div className="err-log__detail-field err-log__detail-field--full">
                            <label>Browser</label>
                            <span style={{ fontSize: '0.75rem' }}>{r.browser_info}</span>
                          </div>
                        )}
                        {r.screen_size && (
                          <div className="err-log__detail-field">
                            <label>Screen</label>
                            <span>{r.screen_size}</span>
                          </div>
                        )}
                        {r.viewport_size && (
                          <div className="err-log__detail-field">
                            <label>Viewport</label>
                            <span>{r.viewport_size}</span>
                          </div>
                        )}
                        {r.connection_type && (
                          <div className="err-log__detail-field">
                            <label>Connection</label>
                            <span>{r.connection_type}</span>
                          </div>
                        )}
                        {r.memory_usage && (
                          <div className="err-log__detail-field">
                            <label>Memory</label>
                            <span>{r.memory_usage}</span>
                          </div>
                        )}
                        {r.session_duration_ms != null && (
                          <div className="err-log__detail-field">
                            <label>Session Duration</label>
                            <span>{formatDuration(r.session_duration_ms)}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Stack trace */}
                    {r.error_stack && (
                      <div className="err-log__detail-section">
                        <h4>Stack Trace</h4>
                        <pre className="err-log__detail-stack">{r.error_stack}</pre>
                      </div>
                    )}

                    {/* Breadcrumbs */}
                    {r.breadcrumbs && Array.isArray(r.breadcrumbs) && r.breadcrumbs.length > 0 && (
                      <div className="err-log__detail-section">
                        <h4>User Actions Before Error ({r.breadcrumbs.length})</h4>
                        <pre className="err-log__detail-stack" style={{ background: '#1a2332' }}>
                          {(r.breadcrumbs as { type: string; description: string; timestamp: string }[])
                            .map((b, i) => `[${new Date(b.timestamp).toLocaleTimeString()}] ${b.type}: ${b.description}`)
                            .join('\n')}
                        </pre>
                      </div>
                    )}

                    {/* Console logs */}
                    {r.console_logs && Array.isArray(r.console_logs) && r.console_logs.length > 0 && (
                      <div className="err-log__detail-section">
                        <h4>Console Logs ({r.console_logs.length})</h4>
                        <pre className="err-log__detail-stack" style={{ background: '#2d1b1b' }}>
                          {(r.console_logs as { level: string; message: string; timestamp: string }[])
                            .map((l, i) => `[${l.level.toUpperCase()}] ${l.message}`)
                            .join('\n')}
                        </pre>
                      </div>
                    )}

                    {/* Resolution info */}
                    {r.resolved_at && (
                      <div className="err-log__detail-section">
                        <h4>Resolution</h4>
                        <div className="err-log__detail-grid">
                          <div className="err-log__detail-field">
                            <label>Resolved By</label>
                            <span>{r.resolved_by || '—'}</span>
                          </div>
                          <div className="err-log__detail-field">
                            <label>Resolved At</label>
                            <span>{formatFullDate(r.resolved_at)}</span>
                          </div>
                          {r.resolution_notes && (
                            <div className="err-log__detail-field err-log__detail-field--full">
                              <label>Notes</label>
                              <span>{r.resolution_notes}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Status controls */}
                    <div className="err-log__status-controls">
                      {['new', 'acknowledged', 'investigating', 'resolved', 'wont_fix'].map(s => (
                        <button
                          key={s}
                          className={`err-log__status-btn ${r.status === s ? 'err-log__status-btn--active' : ''}`}
                          onClick={() => updateStatus(r.id, s)}
                        >
                          {s === 'wont_fix' ? "Won't Fix" : s.charAt(0).toUpperCase() + s.slice(1)}
                        </button>
                      ))}
                      <button className="err-log__delete-btn" onClick={() => deleteReport(r.id)}>
                        Delete
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="err-log__pagination">
          <button
            className="err-log__page-btn"
            disabled={page <= 1}
            onClick={() => setPage(p => Math.max(1, p - 1))}
          >
            Prev
          </button>
          <span className="err-log__page-info">
            Page {page} of {totalPages} ({total} total)
          </span>
          <button
            className="err-log__page-btn"
            disabled={page >= totalPages}
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
          >
            Next
          </button>
        </div>
      )}

      {/* Development Guide */}
      <div style={{ marginTop: '2rem', padding: '1.5rem', background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: '8px' }}>
        <h3 style={{ margin: '0 0 0.5rem', fontSize: '1rem', color: '#1F2937' }}>Error Log — Development Guide</h3>
        <div style={{ fontSize: '0.82rem', color: '#6B7280', lineHeight: 1.6 }}>
          <p style={{ margin: '0 0 0.75rem' }}><strong>Current Capabilities:</strong></p>
          <ul style={{ margin: '0 0 1rem', paddingLeft: '1.25rem' }}>
            <li>View all error reports with severity color-coding and status badges</li>
            <li>Filter by status, type, severity; full-text search on error messages, pages, components</li>
            <li>Expand reports to see full details: user notes, environment info, stack traces, breadcrumbs, console logs</li>
            <li>Update status (new, acknowledged, investigating, resolved, won&apos;t fix)</li>
            <li>Delete individual reports</li>
            <li>Pagination for large datasets</li>
          </ul>
          <p style={{ margin: '0 0 0.5rem' }}><strong>Database:</strong> Uses <code>error_reports</code> table — run <code>supabase_migration_error_reports.sql</code></p>
        </div>
        <pre style={{ background: '#1F2937', color: '#E5E7EB', padding: '1rem', borderRadius: '6px', fontSize: '0.75rem', overflow: 'auto', marginTop: '0.75rem' }}>{`CONTINUATION PROMPT:
Improve the error log viewer at /admin/error-log/page.tsx.

CURRENT STATE: Filterable, searchable list of error reports with expandable detail view,
status management, pagination, breadcrumb viewer, console log viewer, stack trace display.

NEXT STEPS:
1. Add error grouping: group similar errors by message/component and show count
2. Add chart/graph: error count over time (last 7/30 days) using Recharts
3. Add bulk actions: select multiple and batch update status or delete
4. Add assignment: assign errors to specific admin users for investigation
5. Add resolution notes: text input when marking as resolved
6. Add export: download error reports as CSV/JSON
7. Add email/Slack notifications for critical errors
8. Add error rate monitoring: alert if error count spikes above threshold
9. Add user impact analysis: which users are most affected
10. Add real-time updates via Supabase Realtime subscription`}</pre>
      </div>
    </>
  );
}

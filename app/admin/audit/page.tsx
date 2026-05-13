'use client';
// app/admin/audit/page.tsx
//
// Customer-side audit log. Phase D-9 of CUSTOMER_PORTAL.md. Org
// admins see every operator + customer-triggered action on their
// org (impersonation events, plan changes, refunds, user
// management, etc.).
//
// Filters by actor / action type / date range. Pulls from
// /api/admin/audit which scopes to the caller's default_org_id
// (until M-9 puts activeOrgId in the JWT).
//
// Spec: docs/planning/in-progress/CUSTOMER_PORTAL.md §3.10.

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

interface AuditRow {
  id: string;
  operatorEmail: string | null;
  customerEmail: string | null;
  action: string;
  severity: 'info' | 'warning' | 'critical';
  metadata: Record<string, unknown>;
  createdAt: string;
}

const SEVERITY_COLORS: Record<AuditRow['severity'], string> = {
  info: '#6B7280',
  warning: '#D97706',
  critical: '#BD1218',
};

export default function CustomerAuditPage() {
  const [rows, setRows] = useState<AuditRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [severityFilter, setSeverityFilter] = useState<'all' | AuditRow['severity']>('all');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch('/api/admin/audit?limit=200', { cache: 'no-store' });
        if (!res.ok) {
          setError(`Couldn't load audit log (status ${res.status}).`);
          return;
        }
        const data = (await res.json()) as { rows: AuditRow[] };
        if (!cancelled) setRows(data.rows ?? []);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load.');
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(() => {
    if (!rows) return null;
    return rows.filter((r) => {
      if (severityFilter !== 'all' && r.severity !== severityFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        const haystack = [
          r.action,
          r.operatorEmail ?? '',
          r.customerEmail ?? '',
          JSON.stringify(r.metadata),
        ].join(' ').toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [rows, search, severityFilter]);

  return (
    <div className="audit-page">
      <header>
        <h1>Audit log</h1>
        <p>Every operator + system action on your organization.</p>
      </header>

      <div className="audit-filters">
        <input
          type="text"
          placeholder="Search actor, action, or metadata…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value as typeof severityFilter)}
        >
          <option value="all">All severity</option>
          <option value="info">Info</option>
          <option value="warning">Warning</option>
          <option value="critical">Critical</option>
        </select>
      </div>

      {error ? (
        <div className="audit-error">{error}</div>
      ) : !filtered ? (
        <div className="audit-loading">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="audit-empty">
          {rows && rows.length > 0
            ? 'No entries match your filters.'
            : 'No audit entries yet. Actions on your organization will appear here.'}
        </div>
      ) : (
        <table className="audit-table">
          <thead>
            <tr>
              <th>When</th>
              <th>Actor</th>
              <th>Action</th>
              <th>Severity</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id}>
                <td className="audit-when">{new Date(r.createdAt).toLocaleString()}</td>
                <td className="audit-actor">{r.operatorEmail ?? r.customerEmail ?? 'system'}</td>
                <td className="audit-action"><code>{r.action}</code></td>
                <td>
                  <span style={{ color: SEVERITY_COLORS[r.severity] }}>{r.severity}</span>
                </td>
                <td className="audit-meta">
                  {Object.keys(r.metadata).length > 0 ? (
                    <details>
                      <summary>{Object.keys(r.metadata).length} field{Object.keys(r.metadata).length === 1 ? '' : 's'}</summary>
                      <pre>{JSON.stringify(r.metadata, null, 2)}</pre>
                    </details>
                  ) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <footer>
        <Link href="/admin/me">← Back to hub</Link>
      </footer>

      <style jsx>{`
        .audit-page {
          max-width: 1080px;
          margin: 0 auto;
          padding: 1.5rem;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
          color: #0F1419;
        }
        header h1 {
          font-family: 'Sora', sans-serif;
          font-size: 1.8rem;
          font-weight: 600;
          margin: 0 0 0.25rem;
        }
        header p { color: #6B7280; margin: 0 0 1.5rem; }
        .audit-filters {
          display: flex;
          gap: 0.6rem;
          margin-bottom: 1rem;
        }
        .audit-filters input,
        .audit-filters select {
          padding: 0.55rem 0.8rem;
          border: 1px solid #D1D5DB;
          border-radius: 6px;
          font-family: inherit;
          font-size: 0.88rem;
          background: #FFF;
        }
        .audit-filters input { flex: 1; }
        .audit-error, .audit-loading, .audit-empty {
          padding: 2rem;
          text-align: center;
          color: #6B7280;
          background: #F9FAFB;
          border: 1px solid #E5E7EB;
          border-radius: 12px;
        }
        .audit-table {
          width: 100%;
          background: #FFF;
          border: 1px solid #E5E7EB;
          border-radius: 12px;
          border-collapse: separate;
          border-spacing: 0;
          overflow: hidden;
        }
        .audit-table th, .audit-table td {
          padding: 0.65rem 0.9rem;
          font-size: 0.85rem;
          text-align: left;
          border-bottom: 1px solid #F3F4F6;
        }
        .audit-table th {
          background: #F9FAFB;
          font-weight: 600;
          color: #4B5563;
        }
        .audit-table tr:last-child td { border-bottom: 0; }
        .audit-when { white-space: nowrap; color: #6B7280; font-size: 0.78rem; }
        .audit-actor {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 0.78rem;
          color: #1F2937;
        }
        .audit-action code {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 0.78rem;
          background: #F3F4F6;
          padding: 0.1rem 0.4rem;
          border-radius: 4px;
        }
        .audit-meta details summary {
          cursor: pointer;
          color: #1D3095;
          font-size: 0.82rem;
        }
        .audit-meta pre {
          font-size: 0.72rem;
          margin: 0.5rem 0 0;
          padding: 0.5rem;
          background: #F9FAFB;
          border-radius: 4px;
          max-width: 360px;
          overflow-x: auto;
        }
        footer {
          margin-top: 1rem;
        }
        footer a {
          color: #6B7280;
          text-decoration: none;
          font-size: 0.85rem;
        }
        footer a:hover { color: #1D3095; }
      `}</style>
    </div>
  );
}

'use client';
// app/platform/audit/page.tsx
//
// Cross-tenant operator audit log. Phase C-5 of OPERATOR_CONSOLE.md.
// Lists every operator action across every tenant + filters by
// operator / action / severity / org / date range.
//
// Parallels /admin/audit (customer view, single-tenant) but reads
// without org_id scoping. Auth-gated to platform_admin / observer.
//
// Spec: docs/planning/in-progress/OPERATOR_CONSOLE.md §3.11.

import { useEffect, useMemo, useState } from 'react';

interface AuditRow {
  id: string;
  operatorEmail: string | null;
  customerEmail: string | null;
  orgId: string | null;
  action: string;
  severity: 'info' | 'warning' | 'critical';
  metadata: Record<string, unknown>;
  createdAt: string;
}

const SEVERITY_COLORS: Record<AuditRow['severity'], string> = {
  info: '#9CA3AF',
  warning: '#F59E0B',
  critical: '#BD1218',
};

export default function PlatformAuditPage() {
  const [rows, setRows] = useState<AuditRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [severityFilter, setSeverityFilter] = useState<'all' | AuditRow['severity']>('all');
  const [actionFilter, setActionFilter] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch('/api/platform/audit?limit=500', { cache: 'no-store' });
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
      if (actionFilter && r.action !== actionFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        const haystack = [
          r.action,
          r.operatorEmail ?? '',
          r.customerEmail ?? '',
          r.orgId ?? '',
          JSON.stringify(r.metadata),
        ].join(' ').toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [rows, search, severityFilter, actionFilter]);

  const actionOptions = useMemo(() => {
    if (!rows) return [] as string[];
    const set = new Set<string>();
    for (const r of rows) set.add(r.action);
    return Array.from(set).sort();
  }, [rows]);

  return (
    <div style={{ maxWidth: 1280, margin: '0 auto', padding: '2rem 1.5rem' }}>
      <header style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontFamily: 'Sora,sans-serif', fontSize: '1.8rem', margin: '0 0 0.25rem' }}>
          Audit log
        </h1>
        <p style={{ color: 'rgba(255,255,255,0.7)', margin: 0 }}>
          Every operator + system action across every tenant. Immutable.
        </p>
      </header>

      <div style={{ display: 'flex', gap: '0.6rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder="Search actor / org / metadata…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={inputStyle}
        />
        <select
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value as typeof severityFilter)}
          style={inputStyle}
        >
          <option value="all">All severity</option>
          <option value="info">Info</option>
          <option value="warning">Warning</option>
          <option value="critical">Critical</option>
        </select>
        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          style={inputStyle}
        >
          <option value="">All actions</option>
          {actionOptions.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
      </div>

      {error ? (
        <div style={emptyStyle}>{error}</div>
      ) : !filtered ? (
        <div style={emptyStyle}>Loading…</div>
      ) : filtered.length === 0 ? (
        <div style={emptyStyle}>No entries match your filters.</div>
      ) : (
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>When</th>
              <th style={thStyle}>Operator</th>
              <th style={thStyle}>Org</th>
              <th style={thStyle}>Action</th>
              <th style={thStyle}>Severity</th>
              <th style={thStyle}>Details</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id} style={trStyle}>
                <td style={{ ...tdStyle, color: 'rgba(255,255,255,0.6)', whiteSpace: 'nowrap', fontSize: '0.78rem' }}>
                  {new Date(r.createdAt).toLocaleString()}
                </td>
                <td style={{ ...tdStyle, fontFamily: 'JetBrains Mono,monospace', fontSize: '0.78rem' }}>
                  {r.operatorEmail ?? <em style={{ color: 'rgba(255,255,255,0.4)' }}>system</em>}
                </td>
                <td style={{ ...tdStyle, fontFamily: 'JetBrains Mono,monospace', fontSize: '0.75rem', color: 'rgba(255,255,255,0.7)' }}>
                  {r.orgId ? r.orgId.slice(0, 8) + '…' : '—'}
                </td>
                <td style={tdStyle}>
                  <code style={{ background: 'rgba(255,255,255,0.06)', padding: '2px 6px', borderRadius: 4, fontFamily: 'JetBrains Mono,monospace', fontSize: '0.78rem' }}>
                    {r.action}
                  </code>
                </td>
                <td style={tdStyle}>
                  <span style={{ color: SEVERITY_COLORS[r.severity], fontWeight: 600, fontSize: '0.82rem' }}>
                    {r.severity}
                  </span>
                </td>
                <td style={tdStyle}>
                  {Object.keys(r.metadata).length > 0 ? (
                    <details>
                      <summary style={{ cursor: 'pointer', color: '#FCD34D', fontSize: '0.82rem' }}>
                        {Object.keys(r.metadata).length} field{Object.keys(r.metadata).length === 1 ? '' : 's'}
                      </summary>
                      <pre style={{ fontSize: '0.72rem', background: 'rgba(0,0,0,0.3)', padding: '0.5rem', borderRadius: 4, maxWidth: 360, overflowX: 'auto', margin: '0.4rem 0 0' }}>
                        {JSON.stringify(r.metadata, null, 2)}
                      </pre>
                    </details>
                  ) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  padding: '0.5rem 0.75rem',
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.15)',
  borderRadius: 6,
  color: '#FFF',
  fontSize: '0.85rem',
  fontFamily: 'inherit',
};

const emptyStyle: React.CSSProperties = {
  padding: '2rem',
  textAlign: 'center',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 12,
  color: 'rgba(255,255,255,0.6)',
};

const tableStyle: React.CSSProperties = {
  width: '100%',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 12,
  borderCollapse: 'separate',
  borderSpacing: 0,
  overflow: 'hidden',
};

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '0.55rem 0.85rem',
  fontSize: '0.78rem',
  fontWeight: 600,
  color: 'rgba(255,255,255,0.6)',
  borderBottom: '1px solid rgba(255,255,255,0.1)',
  background: 'rgba(255,255,255,0.04)',
};

const tdStyle: React.CSSProperties = {
  padding: '0.55rem 0.85rem',
  fontSize: '0.85rem',
  borderBottom: '1px solid rgba(255,255,255,0.06)',
  verticalAlign: 'top',
};

const trStyle: React.CSSProperties = {};

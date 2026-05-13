'use client';
// app/platform/customers/page.tsx
//
// Operator-side tenant directory. Phase C-2 of OPERATOR_CONSOLE.md §3.2.
// Lists every organization with plan, MRR, status, last-seen.
//
// Spec: docs/planning/in-progress/OPERATOR_CONSOLE.md §3.2.

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

interface CustomerRow {
  id: string;
  slug: string;
  name: string;
  status: string;
  state: string | null;
  primaryAdminEmail: string;
  foundedAt: string;
  bundles: string[];
  monthlyMrrCents: number;
  seatCount: number;
}

const STATUS_COLORS: Record<string, string> = {
  active:     '#10B981',
  trialing:   '#3B82F6',
  past_due:   '#F59E0B',
  suspended:  '#9CA3AF',
  canceled:   '#6B7280',
  pending:    '#FCD34D',
};

export default function PlatformCustomersPage() {
  const [rows, setRows] = useState<CustomerRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState<'mrr' | 'name' | 'founded'>('mrr');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch('/api/platform/customers', { cache: 'no-store' });
        if (!res.ok) {
          setError(`Couldn't load customers (status ${res.status}).`);
          return;
        }
        const data = (await res.json()) as { customers: CustomerRow[] };
        if (!cancelled) setRows(data.customers ?? []);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load.');
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(() => {
    if (!rows) return null;
    return rows
      .filter((r) => {
        if (statusFilter !== 'all' && r.status !== statusFilter) return false;
        if (search) {
          const q = search.toLowerCase();
          const h = [r.name, r.slug, r.primaryAdminEmail, r.state ?? ''].join(' ').toLowerCase();
          if (!h.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'mrr') return b.monthlyMrrCents - a.monthlyMrrCents;
        if (sortBy === 'name') return a.name.localeCompare(b.name);
        return new Date(b.foundedAt).getTime() - new Date(a.foundedAt).getTime();
      });
  }, [rows, search, statusFilter, sortBy]);

  const totalMRR = useMemo(
    () => (rows ?? []).reduce((sum, r) => sum + r.monthlyMrrCents, 0),
    [rows],
  );

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', padding: '2rem 1.5rem' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontFamily: 'Sora,sans-serif', fontSize: '1.8rem', margin: '0 0 0.25rem' }}>
            Customers
          </h1>
          {rows ? (
            <p style={{ color: 'rgba(255,255,255,0.7)', margin: 0, fontSize: '0.95rem' }}>
              {rows.length} org{rows.length === 1 ? '' : 's'} · ${(totalMRR / 100).toFixed(2)}/mo MRR
            </p>
          ) : null}
        </div>
      </header>

      <div style={{ display: 'flex', gap: '0.6rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder="Search name / slug / admin email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={inputStyle}
        />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={inputStyle}>
          <option value="all">All status</option>
          <option value="active">Active</option>
          <option value="trialing">Trialing</option>
          <option value="past_due">Past Due</option>
          <option value="suspended">Suspended</option>
          <option value="canceled">Canceled</option>
          <option value="pending">Pending</option>
        </select>
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)} style={inputStyle}>
          <option value="mrr">Sort by MRR</option>
          <option value="name">Sort by name</option>
          <option value="founded">Sort by founded</option>
        </select>
      </div>

      {error ? (
        <div style={emptyStyle}>{error}</div>
      ) : !filtered ? (
        <div style={emptyStyle}>Loading…</div>
      ) : filtered.length === 0 ? (
        <div style={emptyStyle}>
          {rows && rows.length === 0
            ? 'No customers yet. They\'ll appear here as they sign up.'
            : 'No customers match your filters.'}
        </div>
      ) : (
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>Name</th>
              <th style={thStyle}>Slug</th>
              <th style={thStyle}>Status</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>MRR</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Seats</th>
              <th style={thStyle}>Bundles</th>
              <th style={thStyle}>Admin</th>
              <th style={thStyle}>Founded</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id}>
                <td style={tdStyle}>
                  <Link href={`/platform/customers/${r.id}`} style={{ color: '#FFF', textDecoration: 'none', fontWeight: 500 }}>
                    {r.name}
                  </Link>
                </td>
                <td style={{ ...tdStyle, color: 'rgba(255,255,255,0.6)', fontFamily: 'JetBrains Mono,monospace', fontSize: '0.82rem' }}>
                  {r.slug}
                </td>
                <td style={tdStyle}>
                  <span style={{ color: STATUS_COLORS[r.status] ?? '#9CA3AF', fontWeight: 600, fontSize: '0.82rem' }}>
                    {r.status}
                  </span>
                </td>
                <td style={{ ...tdStyle, textAlign: 'right', fontFamily: 'JetBrains Mono,monospace' }}>
                  ${(r.monthlyMrrCents / 100).toFixed(2)}
                </td>
                <td style={{ ...tdStyle, textAlign: 'right', color: 'rgba(255,255,255,0.7)' }}>{r.seatCount}</td>
                <td style={{ ...tdStyle, fontSize: '0.82rem', color: 'rgba(255,255,255,0.7)' }}>
                  {r.bundles.length > 0 ? r.bundles.join(' · ') : <em style={{ color: 'rgba(255,255,255,0.4)' }}>none</em>}
                </td>
                <td style={{ ...tdStyle, fontFamily: 'JetBrains Mono,monospace', fontSize: '0.78rem', color: 'rgba(255,255,255,0.6)' }}>
                  {r.primaryAdminEmail}
                </td>
                <td style={{ ...tdStyle, color: 'rgba(255,255,255,0.6)', fontSize: '0.78rem' }}>
                  {new Date(r.foundedAt).toLocaleDateString()}
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
  padding: '0.6rem 0.85rem',
  fontSize: '0.88rem',
  borderBottom: '1px solid rgba(255,255,255,0.06)',
};

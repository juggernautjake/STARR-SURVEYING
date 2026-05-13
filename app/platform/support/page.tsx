'use client';
// app/platform/support/page.tsx
//
// Operator-side cross-tenant support inbox. Phase E-4 of SUPPORT_DESK.md.
//
// Spec: docs/planning/in-progress/SUPPORT_DESK.md §3.4.

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

interface OperatorTicket {
  id: string;
  ticketNumber: string;
  subject: string;
  status: string;
  priority: string;
  category: string | null;
  requesterEmail: string;
  assignedTo: string | null;
  orgId: string;
  orgName: string;
  orgSlug: string;
  createdAt: string;
  updatedAt: string;
}

const PRIORITY_COLORS: Record<string, string> = {
  low:      '#9CA3AF',
  normal:   '#3B82F6',
  high:     '#F59E0B',
  urgent:   '#EF4444',
  critical: '#7F1D1D',
};

const STATUS_LABELS: Record<string, string> = {
  open: 'Open',
  awaiting_reply: 'Awaiting reply',
  awaiting_customer: 'Awaiting customer',
  resolved: 'Resolved',
  closed: 'Closed',
};

export default function PlatformSupportPage() {
  const [tickets, setTickets] = useState<OperatorTicket[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('open');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/platform/support/tickets?status=${statusFilter}`, { cache: 'no-store' });
        if (!res.ok) {
          setError(`Couldn't load tickets (status ${res.status}).`);
          return;
        }
        const data = (await res.json()) as { tickets: OperatorTicket[] };
        if (!cancelled) setTickets(data.tickets ?? []);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load.');
      }
    }
    load();
    return () => { cancelled = true; };
  }, [statusFilter]);

  const filtered = useMemo(() => {
    if (!tickets) return null;
    if (!search) return tickets;
    const q = search.toLowerCase();
    return tickets.filter((t) => {
      const h = [t.ticketNumber, t.subject, t.orgName, t.requesterEmail, t.assignedTo ?? ''].join(' ').toLowerCase();
      return h.includes(q);
    });
  }, [tickets, search]);

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', padding: '2rem 1.5rem' }}>
      <header style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontFamily: 'Sora,sans-serif', fontSize: '1.8rem', margin: '0 0 0.25rem' }}>
          Support
        </h1>
        <p style={{ color: 'rgba(255,255,255,0.7)', margin: 0 }}>
          Cross-tenant inbox. Click any ticket to reply.
        </p>
      </header>

      <div style={{ display: 'flex', gap: '0.6rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder="Search ticket # / subject / org / requester…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={inputStyle}
        />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={inputStyle}>
          <option value="open">Open (any unresolved)</option>
          <option value="open">Open</option>
          <option value="awaiting_reply">Awaiting our reply</option>
          <option value="awaiting_customer">Awaiting customer</option>
          <option value="resolved">Resolved</option>
          <option value="closed">Closed</option>
          <option value="all">All</option>
        </select>
      </div>

      {error ? (
        <div style={emptyStyle}>{error}</div>
      ) : !filtered ? (
        <div style={emptyStyle}>Loading…</div>
      ) : filtered.length === 0 ? (
        <div style={emptyStyle}>No tickets match your filter.</div>
      ) : (
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>#</th>
              <th style={thStyle}>Org</th>
              <th style={thStyle}>Subject</th>
              <th style={thStyle}>Priority</th>
              <th style={thStyle}>Status</th>
              <th style={thStyle}>Assignee</th>
              <th style={thStyle}>Age</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((t) => (
              <tr key={t.id}>
                <td style={tdStyle}>
                  <Link
                    href={`/platform/support/tickets/${t.id}`}
                    style={{ color: '#FCD34D', textDecoration: 'none', fontFamily: 'JetBrains Mono,monospace', fontSize: '0.78rem' }}
                  >
                    {t.ticketNumber}
                  </Link>
                </td>
                <td style={{ ...tdStyle, fontSize: '0.85rem' }}>
                  <Link href={`/platform/customers/${t.orgId}`} style={{ color: '#FFF', textDecoration: 'none' }}>
                    {t.orgName}
                  </Link>
                </td>
                <td style={tdStyle}>{t.subject}</td>
                <td style={tdStyle}>
                  <span style={{ color: PRIORITY_COLORS[t.priority] ?? '#9CA3AF', fontWeight: 600, fontSize: '0.82rem' }}>
                    {t.priority}
                  </span>
                </td>
                <td style={{ ...tdStyle, fontSize: '0.82rem', color: 'rgba(255,255,255,0.7)' }}>
                  {STATUS_LABELS[t.status] ?? t.status}
                </td>
                <td style={{ ...tdStyle, fontFamily: 'JetBrains Mono,monospace', fontSize: '0.78rem', color: 'rgba(255,255,255,0.6)' }}>
                  {t.assignedTo ?? <em style={{ color: 'rgba(255,255,255,0.3)' }}>—</em>}
                </td>
                <td style={{ ...tdStyle, fontSize: '0.78rem', color: 'rgba(255,255,255,0.5)' }}>
                  {formatAge(t.createdAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function formatAge(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60_000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 14) return `${d}d`;
  return new Date(iso).toLocaleDateString();
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

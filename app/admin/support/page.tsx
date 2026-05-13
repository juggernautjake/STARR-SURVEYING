'use client';
// app/admin/support/page.tsx
//
// Customer-side support ticket list. Phase E-2 of SUPPORT_DESK.md.
// Consumes the server helpers from lib/saas/tickets.ts via a thin
// API route at /api/admin/support/tickets.
//
// Per SUPPORT_DESK.md §3.1 mockup.
//
// Spec: docs/planning/in-progress/SUPPORT_DESK.md §3.1 + §7 E-2.

import Link from 'next/link';
import { useEffect, useState } from 'react';

interface TicketRow {
  id: string;
  ticketNumber: string;
  subject: string;
  status: 'open' | 'awaiting_reply' | 'awaiting_customer' | 'resolved' | 'closed';
  priority: 'low' | 'normal' | 'high' | 'urgent' | 'critical';
  createdAt: string;
  updatedAt: string;
}

const STATUS_LABELS: Record<TicketRow['status'], string> = {
  open: 'Open',
  awaiting_reply: 'Awaiting reply',
  awaiting_customer: 'Awaiting your reply',
  resolved: 'Resolved',
  closed: 'Closed',
};

const STATUS_COLORS: Record<TicketRow['status'], string> = {
  open: '#1D3095',
  awaiting_reply: '#D97706',
  awaiting_customer: '#7C3AED',
  resolved: '#059669',
  closed: '#6B7280',
};

export default function SupportPage() {
  const [tickets, setTickets] = useState<TicketRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch('/api/admin/support/tickets', { cache: 'no-store' });
        if (!res.ok) {
          setError(`Couldn't load tickets (status ${res.status}).`);
          return;
        }
        const data = (await res.json()) as { tickets: TicketRow[] };
        if (!cancelled) setTickets(data.tickets ?? []);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load.');
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const openCount = tickets?.filter((t) => t.status !== 'resolved' && t.status !== 'closed').length ?? 0;
  const closedCount = tickets?.filter((t) => t.status === 'resolved' || t.status === 'closed').length ?? 0;

  return (
    <div className="support-page">
      <header className="support-header">
        <div>
          <h1>Support</h1>
          {tickets ? (
            <p className="support-counts">
              {openCount} open · {closedCount} closed
            </p>
          ) : null}
        </div>
        <Link className="support-btn" href="/admin/support/new">
          + New ticket
        </Link>
      </header>

      {error ? (
        <div className="support-error">{error}</div>
      ) : !tickets ? (
        <div className="support-loading">Loading tickets…</div>
      ) : tickets.length === 0 ? (
        <div className="support-empty">
          <p>No tickets yet.</p>
          <p>
            If you run into a problem,{' '}
            <Link href="/admin/support/new">file a ticket</Link>{' '}
            and we&apos;ll get back to you within one business day.
          </p>
        </div>
      ) : (
        <ul className="support-list">
          {tickets.map((t) => (
            <li key={t.id}>
              <Link href={`/admin/support/tickets/${t.id}`} className="support-item">
                <span className="support-item__num">{t.ticketNumber}</span>
                <span className="support-item__subject">{t.subject}</span>
                <span
                  className="support-item__status"
                  style={{ color: STATUS_COLORS[t.status] }}
                >
                  {STATUS_LABELS[t.status]}
                </span>
                <span className="support-item__age">
                  {formatRelative(t.updatedAt)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <style jsx>{`
        .support-page {
          max-width: 900px;
          margin: 0 auto;
          padding: 1.5rem;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
          color: #0F1419;
        }
        .support-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          margin-bottom: 1.5rem;
        }
        .support-header h1 {
          font-family: 'Sora', sans-serif;
          font-size: 1.8rem;
          font-weight: 600;
          margin: 0;
        }
        .support-counts {
          color: #6B7280;
          margin: 0.25rem 0 0;
          font-size: 0.92rem;
        }
        .support-btn {
          background: #1D3095;
          color: #FFF;
          padding: 0.6rem 1.1rem;
          border-radius: 8px;
          text-decoration: none;
          font-weight: 600;
          font-size: 0.9rem;
        }
        .support-btn:hover { background: #152050; }
        .support-error, .support-loading, .support-empty {
          padding: 2rem;
          text-align: center;
          color: #6B7280;
          background: #F9FAFB;
          border: 1px solid #E5E7EB;
          border-radius: 12px;
        }
        .support-empty p:first-child {
          font-weight: 600;
          color: #1F2937;
        }
        .support-list {
          list-style: none;
          margin: 0;
          padding: 0;
          border: 1px solid #E5E7EB;
          border-radius: 12px;
          background: #FFF;
        }
        .support-list li {
          border-bottom: 1px solid #F3F4F6;
        }
        .support-list li:last-child { border-bottom: 0; }
        .support-item {
          display: grid;
          grid-template-columns: 80px 1fr auto auto;
          align-items: center;
          gap: 1rem;
          padding: 0.85rem 1.25rem;
          text-decoration: none;
          color: #1F2937;
        }
        .support-item:hover { background: #F9FAFB; }
        .support-item__num {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-weight: 700;
          color: #6B7280;
          font-size: 0.82rem;
        }
        .support-item__subject {
          font-weight: 500;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .support-item__status {
          font-size: 0.82rem;
          font-weight: 600;
        }
        .support-item__age {
          font-size: 0.82rem;
          color: #9CA3AF;
        }
      `}</style>
    </div>
  );
}

function formatRelative(iso: string): string {
  const dt = new Date(iso);
  const now = Date.now();
  const diffMs = now - dt.getTime();
  const mins = Math.round(diffMs / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return dt.toLocaleDateString();
}

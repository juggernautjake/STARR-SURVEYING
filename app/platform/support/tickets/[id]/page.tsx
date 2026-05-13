'use client';
// app/platform/support/tickets/[id]/page.tsx
//
// Operator-side ticket detail. Shows the org context, message thread
// (including internal notes), reply textarea (with "internal note"
// toggle), and inline controls for assignee + status + priority.
//
// Phase E-5 of SUPPORT_DESK.md.

import Link from 'next/link';
import { use, useCallback, useEffect, useState } from 'react';

interface Ticket {
  id: string;
  ticketNumber: string;
  subject: string;
  status: string;
  priority: string;
  category: string | null;
  requesterEmail: string;
  assignedTo: string | null;
  createdAt: string;
  updatedAt: string;
  orgId: string;
  orgName: string | null;
  orgSlug: string | null;
}

interface Message {
  id: string;
  authorEmail: string;
  authorType: 'customer' | 'operator';
  body: string;
  isInternalNote: boolean;
  createdAt: string;
}

const STATUS_COLORS: Record<string, string> = {
  open:               '#3B82F6',
  awaiting_operator:  '#F59E0B',
  awaiting_customer:  '#10B981',
  resolved:           '#9CA3AF',
  closed:             '#6B7280',
};

const PRIORITY_COLORS: Record<string, string> = {
  low:     '#9CA3AF',
  normal:  '#3B82F6',
  high:    '#F59E0B',
  urgent:  '#EF4444',
};

interface PageProps { params: Promise<{ id: string }> }

export default function PlatformTicketDetailPage({ params }: PageProps) {
  const { id } = use(params);
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [draftInternal, setDraftInternal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/platform/support/tickets/${id}`, { cache: 'no-store' });
      if (!res.ok) {
        setError(`Couldn't load ticket (status ${res.status}).`);
        return;
      }
      const data = (await res.json()) as { ticket: Ticket; messages: Message[] };
      setTicket(data.ticket);
      setMessages(data.messages);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed.');
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function postReply() {
    if (!draft.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/platform/support/tickets/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: draft.trim(), internal: draftInternal }),
      });
      if (res.ok) {
        setDraft('');
        setDraftInternal(false);
        await load();
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function patchTicket(patch: Partial<{ status: string; priority: string; assignedTo: string | null }>) {
    await fetch(`/api/platform/support/tickets/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    await load();
  }

  if (error) {
    return <div style={{ maxWidth: 960, margin: '0 auto', padding: '2rem 1.5rem', color: '#FCA5A5' }}>{error}</div>;
  }
  if (!ticket) {
    return <div style={{ maxWidth: 960, margin: '0 auto', padding: '2rem 1.5rem', color: 'rgba(255,255,255,0.6)' }}>Loading…</div>;
  }

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '2rem 1.5rem' }}>
      <Link href="/platform/support" style={{ color: '#FCD34D', fontSize: '0.85rem', textDecoration: 'none' }}>
        ← Support inbox
      </Link>

      <header style={{ marginTop: '0.6rem', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.75rem', marginBottom: '0.3rem' }}>
          <span style={{ fontFamily: 'JetBrains Mono,monospace', color: 'rgba(255,255,255,0.5)', fontSize: '0.85rem' }}>
            {ticket.ticketNumber}
          </span>
          <h1 style={{ fontFamily: 'Sora,sans-serif', fontSize: '1.4rem', margin: 0 }}>
            {ticket.subject}
          </h1>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap', fontSize: '0.82rem' }}>
          {ticket.orgId && ticket.orgName && (
            <Link href={`/platform/customers/${ticket.orgId}`} style={{ color: '#FCD34D', textDecoration: 'none', fontWeight: 600 }}>
              {ticket.orgName}
            </Link>
          )}
          <span style={{ color: 'rgba(255,255,255,0.55)' }}>· {ticket.requesterEmail}</span>
          <span style={{ color: 'rgba(255,255,255,0.55)' }}>· opened {new Date(ticket.createdAt).toLocaleString()}</span>
        </div>
      </header>

      <section style={{
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 12,
        padding: '1rem 1.1rem',
        marginBottom: '1.25rem',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: '0.8rem',
      }}>
        <Control label="Status">
          <select
            value={ticket.status}
            onChange={(e) => patchTicket({ status: e.target.value })}
            style={{ ...controlInputStyle, color: STATUS_COLORS[ticket.status] ?? '#FFF', fontWeight: 700 }}
          >
            {Object.keys(STATUS_COLORS).map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </Control>
        <Control label="Priority">
          <select
            value={ticket.priority}
            onChange={(e) => patchTicket({ priority: e.target.value })}
            style={{ ...controlInputStyle, color: PRIORITY_COLORS[ticket.priority] ?? '#FFF', fontWeight: 700 }}
          >
            {Object.keys(PRIORITY_COLORS).map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </Control>
        <Control label="Assignee">
          <input
            type="email"
            value={ticket.assignedTo ?? ''}
            onChange={(e) => setTicket((t) => t ? { ...t, assignedTo: e.target.value } : t)}
            onBlur={(e) => patchTicket({ assignedTo: e.target.value || null })}
            placeholder="operator@starr-surveying.com"
            style={controlInputStyle}
          />
        </Control>
      </section>

      <section style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginBottom: '1.25rem' }}>
        {messages.map((m) => (
          <article key={m.id} style={{
            padding: '0.85rem 1rem',
            background: m.isInternalNote ? 'rgba(252,211,77,0.08)' : (m.authorType === 'operator' ? 'rgba(29,48,149,0.08)' : 'rgba(255,255,255,0.04)'),
            border: `1px solid ${m.isInternalNote ? 'rgba(252,211,77,0.3)' : 'rgba(255,255,255,0.1)'}`,
            borderRadius: 10,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem', fontSize: '0.78rem', alignItems: 'center' }}>
              <span style={{ color: 'rgba(255,255,255,0.7)' }}>
                {m.isInternalNote && <strong style={{ color: '#FCD34D', marginRight: '0.4rem' }}>INTERNAL</strong>}
                <code style={{ fontFamily: 'JetBrains Mono,monospace' }}>{m.authorEmail}</code>
                <span style={{ color: 'rgba(255,255,255,0.5)', marginLeft: '0.4rem' }}>({m.authorType})</span>
              </span>
              <span style={{ color: 'rgba(255,255,255,0.5)', fontFamily: 'JetBrains Mono,monospace' }}>
                {new Date(m.createdAt).toLocaleString()}
              </span>
            </div>
            <div style={{ color: '#FFF', whiteSpace: 'pre-wrap', fontSize: '0.9rem', lineHeight: 1.5 }}>
              {m.body}
            </div>
          </article>
        ))}
      </section>

      <section style={{
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 12,
        padding: '1.1rem',
      }}>
        <h2 style={{ fontFamily: 'Sora,sans-serif', fontSize: '1rem', margin: '0 0 0.75rem' }}>
          {draftInternal ? 'Add internal note' : 'Reply'}
        </h2>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={5}
          placeholder={draftInternal ? 'Visible only to operators…' : 'Reply to the customer…'}
          style={{
            width: '100%',
            padding: '0.6rem 0.8rem',
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: 6,
            color: '#FFF',
            fontSize: '0.9rem',
            fontFamily: 'inherit',
            resize: 'vertical',
            marginBottom: '0.75rem',
            boxSizing: 'border-box',
          }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.85rem' }}>
            <input
              type="checkbox"
              checked={draftInternal}
              onChange={(e) => setDraftInternal(e.target.checked)}
            />
            Internal note (visible to operators only)
          </label>
          <button onClick={postReply} disabled={!draft.trim() || submitting} style={primaryBtnStyle}>
            {submitting ? 'Sending…' : draftInternal ? 'Add note' : 'Send reply'}
          </button>
        </div>
      </section>
    </div>
  );
}

function Control({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
      <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.6)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {label}
      </span>
      {children}
    </label>
  );
}

const controlInputStyle: React.CSSProperties = {
  padding: '0.4rem 0.6rem',
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.15)',
  borderRadius: 6,
  color: '#FFF',
  fontSize: '0.85rem',
  fontFamily: 'inherit',
};

const primaryBtnStyle: React.CSSProperties = {
  padding: '0.55rem 1.1rem',
  background: '#FCD34D',
  color: '#0F1419',
  border: 0,
  borderRadius: 6,
  fontWeight: 600,
  fontSize: '0.88rem',
  cursor: 'pointer',
  fontFamily: 'inherit',
};

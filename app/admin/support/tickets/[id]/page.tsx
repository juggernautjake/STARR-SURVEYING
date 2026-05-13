'use client';
// app/admin/support/tickets/[id]/page.tsx
//
// Customer-side ticket thread view. Phase E-3 of SUPPORT_DESK.md.
// Renders the ticket header + message history + reply box. Customer
// can post a reply or mark the ticket resolved.
//
// Real-time WebSocket fanout is a follow-up slice; the page reloads
// on reply submit which is sufficient for v1.
//
// Spec: docs/planning/in-progress/SUPPORT_DESK.md §3.3 + §7 E-3.

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

interface Ticket {
  id: string;
  ticketNumber: string;
  subject: string;
  status: 'open' | 'awaiting_reply' | 'awaiting_customer' | 'resolved' | 'closed';
  priority: string;
  category: string | null;
  requesterEmail: string;
  assignedTo: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Message {
  id: string;
  authorEmail: string;
  authorType: 'customer' | 'operator';
  body: string;
  createdAt: string;
}

const STATUS_LABELS: Record<Ticket['status'], string> = {
  open: 'Open',
  awaiting_reply: 'Awaiting reply from us',
  awaiting_customer: 'Awaiting your reply',
  resolved: 'Resolved',
  closed: 'Closed',
};

const STATUS_COLORS: Record<Ticket['status'], string> = {
  open: '#1D3095',
  awaiting_reply: '#D97706',
  awaiting_customer: '#7C3AED',
  resolved: '#059669',
  closed: '#6B7280',
};

export default function TicketThreadPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id;
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reply, setReply] = useState('');
  const [posting, setPosting] = useState(false);
  const [resolving, setResolving] = useState(false);

  async function load() {
    if (!id) return;
    try {
      const res = await fetch(`/api/admin/support/tickets/${id}`, { cache: 'no-store' });
      if (!res.ok) {
        setError(res.status === 404 ? 'Ticket not found.' : `Failed (status ${res.status}).`);
        return;
      }
      const data = (await res.json()) as { ticket: Ticket; messages: Message[] };
      setTicket(data.ticket);
      setMessages(data.messages);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load.');
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleReply(e: React.FormEvent) {
    e.preventDefault();
    if (!reply.trim()) return;
    setPosting(true);
    try {
      const res = await fetch(`/api/admin/support/tickets/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: reply }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Unknown error' }));
        setError(err.error ?? 'Failed to send reply.');
        setPosting(false);
        return;
      }
      setReply('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    }
    setPosting(false);
  }

  async function handleResolve() {
    setResolving(true);
    try {
      const res = await fetch(`/api/admin/support/tickets/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'mark_resolved' }),
      });
      if (res.ok) {
        await load();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resolve.');
    }
    setResolving(false);
  }

  if (error) {
    return (
      <div className="thread-page">
        <Link href="/admin/support" className="thread-back">← Back to support</Link>
        <div className="thread-error">{error}</div>
        <style jsx>{styles}</style>
      </div>
    );
  }

  if (!ticket || !messages) {
    return (
      <div className="thread-page">
        <div className="thread-loading">Loading…</div>
        <style jsx>{styles}</style>
      </div>
    );
  }

  return (
    <div className="thread-page">
      <Link href="/admin/support" className="thread-back">← Back to support</Link>
      <header className="thread-header">
        <div>
          <span className="thread-num">{ticket.ticketNumber}</span>
          <h1>{ticket.subject}</h1>
          <p>
            <span className="thread-status" style={{ color: STATUS_COLORS[ticket.status] }}>
              {STATUS_LABELS[ticket.status]}
            </span>
            {' · '}
            {new Date(ticket.createdAt).toLocaleDateString()}
            {ticket.assignedTo ? ` · Assigned to ${ticket.assignedTo}` : ''}
          </p>
        </div>
      </header>

      <section className="thread-messages">
        {messages.map((m) => (
          <article
            key={m.id}
            className={`thread-msg${m.authorType === 'operator' ? ' thread-msg--operator' : ''}`}
          >
            <header>
              <strong>
                {m.authorType === 'operator' ? 'Starr Software' : 'You'}
              </strong>
              <span>{new Date(m.createdAt).toLocaleString()}</span>
            </header>
            <div className="thread-msg-body">
              {m.body.split('\n\n').map((para, i) => (
                <p key={i}>{para}</p>
              ))}
            </div>
          </article>
        ))}
      </section>

      {ticket.status !== 'resolved' && ticket.status !== 'closed' ? (
        <form onSubmit={handleReply} className="thread-reply">
          <textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            placeholder="Type your reply…"
            rows={5}
            required
          />
          <div className="thread-actions">
            <button
              type="button"
              onClick={handleResolve}
              disabled={resolving || posting}
              className="thread-btn thread-btn--secondary"
            >
              {resolving ? 'Marking resolved…' : 'Mark resolved'}
            </button>
            <button
              type="submit"
              disabled={!reply.trim() || posting}
              className="thread-btn thread-btn--primary"
            >
              {posting ? 'Sending…' : 'Send reply'}
            </button>
          </div>
        </form>
      ) : (
        <div className="thread-resolved">
          <p>
            This ticket is {STATUS_LABELS[ticket.status].toLowerCase()}.
            {' '}If something&apos;s changed,{' '}
            <Link href="/admin/support/new">file a new ticket</Link>.
          </p>
        </div>
      )}

      <style jsx>{styles}</style>
    </div>
  );
}

const styles = `
  .thread-page {
    max-width: 800px;
    margin: 0 auto;
    padding: 1.5rem;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
    color: #0F1419;
  }
  .thread-back {
    color: #6B7280;
    text-decoration: none;
    font-size: 0.85rem;
  }
  .thread-back:hover { color: #1D3095; }
  .thread-error, .thread-loading {
    padding: 2rem;
    text-align: center;
    color: #6B7280;
    background: #F9FAFB;
    border: 1px solid #E5E7EB;
    border-radius: 12px;
    margin-top: 1rem;
  }
  .thread-header {
    margin: 0.75rem 0 1.5rem;
  }
  .thread-num {
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 0.78rem;
    color: #6B7280;
    background: #F3F4F6;
    padding: 0.15rem 0.5rem;
    border-radius: 4px;
  }
  .thread-header h1 {
    font-family: 'Sora', sans-serif;
    font-size: 1.5rem;
    font-weight: 600;
    margin: 0.4rem 0 0.2rem;
  }
  .thread-header p { color: #6B7280; font-size: 0.85rem; margin: 0; }
  .thread-status { font-weight: 600; }
  .thread-messages {
    display: flex;
    flex-direction: column;
    gap: 0.85rem;
    margin-bottom: 1.5rem;
  }
  .thread-msg {
    background: #FFF;
    border: 1px solid #E5E7EB;
    border-radius: 12px;
    padding: 1rem 1.25rem;
  }
  .thread-msg--operator {
    background: #F0F4FF;
    border-color: #C7D2FE;
  }
  .thread-msg header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 0.5rem;
    font-size: 0.85rem;
  }
  .thread-msg header strong { color: #1F2937; }
  .thread-msg header span { color: #9CA3AF; font-size: 0.78rem; }
  .thread-msg-body p { margin: 0.4rem 0; }
  .thread-msg-body p:first-child { margin-top: 0; }
  .thread-msg-body p:last-child { margin-bottom: 0; }
  .thread-reply {
    background: #FFF;
    border: 1px solid #E5E7EB;
    border-radius: 12px;
    padding: 1rem 1.25rem;
  }
  .thread-reply textarea {
    width: 100%;
    padding: 0.6rem 0.8rem;
    border: 1px solid #D1D5DB;
    border-radius: 6px;
    font-family: inherit;
    font-size: 0.92rem;
    resize: vertical;
  }
  .thread-reply textarea:focus {
    outline: none;
    border-color: #1D3095;
    box-shadow: 0 0 0 3px rgba(29, 48, 149, 0.12);
  }
  .thread-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.6rem;
    margin-top: 0.75rem;
  }
  .thread-btn {
    padding: 0.55rem 1.1rem;
    border-radius: 6px;
    font-weight: 600;
    font-size: 0.88rem;
    border: 0;
    cursor: pointer;
    font-family: inherit;
  }
  .thread-btn--primary { background: #1D3095; color: #FFF; }
  .thread-btn--primary:disabled { background: #9CA3AF; cursor: not-allowed; }
  .thread-btn--secondary {
    background: #FFF; color: #6B7280;
    border: 1px solid #D1D5DB;
  }
  .thread-btn--secondary:hover:not(:disabled) {
    border-color: #1D3095; color: #1D3095;
  }
  .thread-resolved {
    background: #F9FAFB;
    border: 1px solid #E5E7EB;
    border-radius: 12px;
    padding: 1rem 1.25rem;
    color: #6B7280;
    font-size: 0.92rem;
  }
  .thread-resolved a { color: #1D3095; }
`;

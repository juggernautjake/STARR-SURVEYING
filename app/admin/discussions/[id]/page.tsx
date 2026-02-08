// app/admin/discussions/[id]/page.tsx — Thread detail with messages and replies
'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

interface Thread {
  id: string;
  title: string;
  description: string | null;
  thread_type: string;
  escalation_level: string;
  status: string;
  page_path: string | null;
  page_title: string | null;
  content_type: string | null;
  created_by: string;
  created_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
  resolution_notes: string | null;
}

interface Message {
  id: string;
  sender_email: string;
  content: string;
  created_at: string;
}

const ESCALATION_COLORS: Record<string, string> = {
  low: '#10B981', medium: '#F59E0B', high: '#EF4444', critical: '#7C3AED',
};

const STATUS_LABELS: Record<string, string> = {
  open: 'Open', in_progress: 'In Progress', resolved: 'Resolved', closed: 'Closed', wont_fix: "Won't Fix",
};

const TYPE_LABELS: Record<string, string> = {
  factual_error: 'Factual Error', improvement: 'Improvement', bug: 'Bug',
  content_review: 'Content Review', compliance: 'Compliance', general: 'General',
};

export default function ThreadDetailPage() {
  const params = useParams();
  const threadId = params.id as string;
  const [thread, setThread] = useState<Thread | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => { fetchThread(); }, [threadId]);

  async function fetchThread() {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/discussions?id=${threadId}`);
      if (res.ok) {
        const data = await res.json();
        setThread(data.thread || null);
        setMessages(data.messages || []);
      }
    } catch { /* silent */ }
    setLoading(false);
  }

  async function sendReply() {
    if (!replyText.trim()) return;
    setSending(true);
    try {
      const res = await fetch('/api/admin/discussions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: threadId, action: 'reply', content: replyText.trim() }),
      });
      if (res.ok) {
        setReplyText('');
        fetchThread();
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
      }
    } catch { /* silent */ }
    setSending(false);
  }

  async function updateThread(updates: Record<string, string>) {
    try {
      const res = await fetch('/api/admin/discussions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: threadId, ...updates }),
      });
      if (res.ok) fetchThread();
    } catch { /* silent */ }
  }

  if (loading) return (
    <div className="admin-empty">
      <div className="admin-empty__icon">&#x23F3;</div>
      <div className="admin-empty__title">Loading...</div>
    </div>
  );

  if (!thread) return (
    <div className="admin-empty">
      <div className="admin-empty__icon">❌</div>
      <div className="admin-empty__title">Thread not found</div>
      <Link href="/admin/discussions" className="admin-btn admin-btn--ghost" style={{ marginTop: '1rem' }}>
        ← Back to Discussions
      </Link>
    </div>
  );

  return (
    <>
      <Link href="/admin/discussions" style={{ fontFamily: 'Inter,sans-serif', fontSize: '.82rem', color: '#1D3095', textDecoration: 'none', marginBottom: '.75rem', display: 'inline-block' }}>
        ← Back to Discussions
      </Link>

      {/* Thread header */}
      <div className="thread-detail__header">
        <h1 className="thread-detail__title">{thread.title}</h1>
        <div className="thread-detail__meta">
          <span
            className="thread-detail__badge"
            style={{ background: ESCALATION_COLORS[thread.escalation_level], color: '#FFF' }}
          >
            {thread.escalation_level.toUpperCase()}
          </span>
          <span className="thread-detail__badge" style={{ background: '#E5E7EB', color: '#374151' }}>
            {TYPE_LABELS[thread.thread_type] || thread.thread_type}
          </span>
          <span className="thread-detail__badge" style={{ background: '#EFF6FF', color: '#1D3095' }}>
            {STATUS_LABELS[thread.status] || thread.status}
          </span>
        </div>

        {thread.description && (
          <div className="thread-detail__description">{thread.description}</div>
        )}

        {thread.page_path && (
          <div className="thread-detail__page-ref">
            📍 Found on: <Link href={thread.page_path}>{thread.page_title || thread.page_path}</Link>
          </div>
        )}

        <div className="thread-detail__page-ref">
          Started by {thread.created_by} on {new Date(thread.created_at).toLocaleString()}
          {thread.resolved_at && (
            <> — Resolved by {thread.resolved_by} on {new Date(thread.resolved_at).toLocaleString()}</>
          )}
        </div>

        {/* Action buttons */}
        {thread.status !== 'resolved' && thread.status !== 'closed' && (
          <div className="thread-detail__actions">
            {thread.status === 'open' && (
              <button className="admin-btn admin-btn--secondary admin-btn--sm" onClick={() => updateThread({ status: 'in_progress' })}>
                Mark In Progress
              </button>
            )}
            <button className="admin-btn admin-btn--success admin-btn--sm" onClick={() => updateThread({ status: 'resolved' })}>
              Mark Resolved
            </button>
            <button className="admin-btn admin-btn--ghost admin-btn--sm" onClick={() => updateThread({ status: 'closed' })}>
              Close
            </button>
            {/* Escalation quick-change */}
            <select
              className="admin-select"
              style={{ width: 'auto', padding: '.3rem .5rem', fontSize: '.78rem' }}
              value={thread.escalation_level}
              onChange={e => updateThread({ escalation_level: e.target.value })}
            >
              <option value="low">Escalation: Low</option>
              <option value="medium">Escalation: Medium</option>
              <option value="high">Escalation: High</option>
              <option value="critical">Escalation: Critical</option>
            </select>
          </div>
        )}

        {thread.resolution_notes && (
          <div className="thread-detail__description" style={{ marginTop: '.75rem', borderLeftColor: '#10B981' }}>
            <strong>Resolution:</strong> {thread.resolution_notes}
          </div>
        )}
      </div>

      {/* Messages */}
      <div className="thread-detail__messages">
        <h3 className="thread-detail__messages-title">Discussion ({messages.length})</h3>

        {messages.length === 0 ? (
          <p style={{ fontFamily: 'Inter,sans-serif', fontSize: '.85rem', color: '#9CA3AF', textAlign: 'center', padding: '1rem' }}>
            No messages yet. Start the discussion below.
          </p>
        ) : (
          messages.map(m => (
            <div key={m.id} className="thread-detail__message">
              <div className="thread-detail__message-avatar">
                {m.sender_email.charAt(0).toUpperCase()}
              </div>
              <div className="thread-detail__message-body">
                <div className="thread-detail__message-header">
                  <span className="thread-detail__message-sender">{m.sender_email}</span>
                  <span className="thread-detail__message-time">{new Date(m.created_at).toLocaleString()}</span>
                </div>
                <div className="thread-detail__message-text">{m.content}</div>
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />

        {/* Reply input */}
        {thread.status !== 'closed' && (
          <div className="thread-detail__reply">
            <textarea
              placeholder="Write a reply..."
              value={replyText}
              onChange={e => setReplyText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && e.ctrlKey) sendReply(); }}
            />
            <button
              className="thread-detail__reply-btn"
              onClick={sendReply}
              disabled={sending || !replyText.trim()}
            >
              {sending ? '...' : 'Reply'}
            </button>
          </div>
        )}
      </div>
    </>
  );
}

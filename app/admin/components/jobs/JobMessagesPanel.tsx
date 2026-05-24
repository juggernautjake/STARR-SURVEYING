// app/admin/components/jobs/JobMessagesPanel.tsx — embedded job thread
// JOB_WORKSPACE_BUILDOUT slice F.
//
// Finds-or-creates the job's conversation (scoped via conversation
// metadata.job_id) and embeds a lightweight thread: message list +
// send box, reusing the existing /api/admin/messages endpoints. A
// deep link opens the full Messages app for richer features.
'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';

interface Message {
  id: string;
  sender_email: string;
  content: string;
  created_at: string;
}

export default function JobMessagesPanel({ jobId }: { jobId: string }) {
  const { data: session } = useSession();
  const myEmail = session?.user?.email ?? '';
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listEndRef = useRef<HTMLDivElement>(null);

  const loadMessages = useCallback(async (convId: string) => {
    const res = await fetch(`/api/admin/messages/send?conversation_id=${encodeURIComponent(convId)}&limit=100`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Failed to load messages (${res.status})`);
    setMessages(data.messages ?? []);
  }, []);

  // Find-or-create the conversation, then load its messages.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/admin/jobs/conversation?job_id=${encodeURIComponent(jobId)}`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `Failed to open job conversation (${res.status})`);
        if (cancelled) return;
        setConversationId(data.conversation_id);
        await loadMessages(data.conversation_id);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to open job conversation');
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [jobId, loadMessages]);

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  async function send() {
    const content = draft.trim();
    if (!content || !conversationId) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/messages/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversation_id: conversationId, content }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Failed to send (${res.status})`);
      setDraft('');
      await loadMessages(conversationId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to send message');
    }
    setSending(false);
  }

  return (
    <div className="job-detail__section">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div>
          <h3>Job Thread</h3>
          <p className="job-detail__section-desc">Coordinate with the team on this job. Everyone assigned to the job is a participant.</p>
        </div>
        {conversationId && (
          <Link href="/admin/messages" className="jobs-page__btn jobs-page__btn--secondary">Open in Messages</Link>
        )}
      </div>

      {loading && <p className="job-detail__section-desc" style={{ marginTop: '1rem' }}>Opening conversation…</p>}
      {error && <div className="job-detail__error" role="alert" style={{ marginTop: '0.75rem' }}>{error}</div>}

      {!loading && conversationId && (
        <>
          <div
            style={{
              marginTop: '1rem', border: '1px solid var(--color-border, #e2e8f0)', borderRadius: 8,
              padding: '0.75rem', maxHeight: 380, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem',
              background: 'var(--color-bg-subtle, #f8fafc)',
            }}
          >
            {messages.length === 0 && (
              <p className="job-detail__section-desc" style={{ textAlign: 'center', margin: '1rem 0' }}>No messages yet — say hello to kick off the thread.</p>
            )}
            {messages.map((m) => {
              const mine = m.sender_email === myEmail;
              return (
                <div key={m.id} style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '80%' }}>
                  <div style={{
                    padding: '0.45rem 0.7rem', borderRadius: 10,
                    background: mine ? 'var(--color-brand-navy, #1D3095)' : '#fff',
                    color: mine ? '#fff' : 'inherit',
                    border: mine ? 'none' : '1px solid var(--color-border, #e2e8f0)',
                    fontSize: '0.88rem', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                  }}>
                    {m.content}
                  </div>
                  <div style={{ fontSize: '0.68rem', color: 'var(--color-text-tertiary, #94a3b8)', textAlign: mine ? 'right' : 'left', marginTop: 2 }}>
                    {mine ? 'You' : m.sender_email} · {new Date(m.created_at).toLocaleString()}
                  </div>
                </div>
              );
            })}
            <div ref={listEndRef} />
          </div>

          <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem' }}>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder="Message the team… (Enter to send, Shift+Enter for a new line)"
              rows={2}
              className="job-detail__messages-input"
              style={{ flex: 1, resize: 'vertical', padding: '0.5rem', borderRadius: 6, border: '1px solid var(--color-border, #cbd5e1)', font: 'inherit' }}
            />
            <button className="jobs-page__btn jobs-page__btn--primary" onClick={send} disabled={sending || !draft.trim()}>
              {sending ? 'Sending…' : 'Send'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

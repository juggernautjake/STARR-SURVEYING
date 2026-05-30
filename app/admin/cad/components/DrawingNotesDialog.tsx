'use client';
// app/admin/cad/components/DrawingNotesDialog.tsx
//
// drawings-collaboration Slice 4 — the notes thread side dialog the
// user described: "We need a way for people to leave notes on
// drawings. The notes would reference a drawing and one or more
// people associated with its completion." Wraps the GET/POST
// /api/admin/cad/drawings/{id}/notes endpoints with:
//
//   - a scrollable thread (oldest → newest, the freshest at the
//     bottom),
//   - a compose form (textarea + optional comma-separated recipient
//     emails — blank defaults to the assignee + the job-team cohort
//     server-side via `resolveNoteRecipients`),
//   - an inline error surface for fetch / post failures.
//
// The recipient picker is intentionally minimal (a free-form
// comma-list) — a richer @-mention picker is a future polish slice.

import { useCallback, useEffect, useState } from 'react';
import ModalFrame from '@/app/admin/components/ui/ModalFrame';

export interface DrawingNote {
  id: string;
  drawing_id: string;
  author_email: string;
  body: string;
  recipient_emails: string[];
  created_at: string;
}

interface Props {
  open: boolean;
  drawingId: string | null;
  drawingName?: string | null;
  onClose: () => void;
}

export default function DrawingNotesDialog({ open, drawingId, drawingName, onClose }: Props) {
  const [notes, setNotes] = useState<DrawingNote[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  const [body, setBody] = useState('');
  const [recipients, setRecipients] = useState('');
  const [posting, setPosting] = useState(false);

  const fetchThread = useCallback(async () => {
    if (!drawingId) return;
    setStatus('loading');
    setError(null);
    try {
      const res = await fetch(`/api/admin/cad/drawings/${drawingId}/notes`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: { notes?: DrawingNote[] } = await res.json();
      setNotes(data.notes ?? []);
      setStatus('ok');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load notes');
      setStatus('error');
    }
  }, [drawingId]);

  useEffect(() => {
    if (open && drawingId) {
      void fetchThread();
    }
  }, [open, drawingId, fetchThread]);

  const handlePost = useCallback(async () => {
    if (!drawingId || !body.trim() || posting) return;
    setPosting(true);
    setError(null);
    try {
      const recipient_emails = parseRecipients(recipients);
      const res = await fetch(`/api/admin/cad/drawings/${drawingId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          body: body.trim(),
          ...(recipient_emails.length > 0 ? { recipient_emails } : {}),
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
      }
      setBody('');
      // Leave the recipients field alone — same dialog session might
      // address the same people.
      await fetchThread();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to post note');
    } finally {
      setPosting(false);
    }
  }, [drawingId, body, recipients, posting, fetchThread]);

  if (!open || !drawingId) return null;

  return (
    <ModalFrame open={open} onClose={onClose} title={`💬 Notes — ${drawingName ?? 'this drawing'}`}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 400, maxWidth: 600 }}>
        {status === 'loading' && (
          <div style={mutedStyle}>Loading…</div>
        )}

        {status !== 'loading' && notes.length === 0 && (
          <div style={mutedStyle}>
            No notes on this drawing yet. Be the first to leave one.
          </div>
        )}

        {notes.length > 0 && (
          <ul role="list" style={threadListStyle}>
            {notes.map((n) => (
              <li key={n.id} style={noteRowStyle}>
                <div style={noteHeaderStyle}>
                  <strong>{n.author_email}</strong>
                  <span style={mutedStyle}>{formatStamp(n.created_at)}</span>
                </div>
                <div>{n.body}</div>
                {n.recipient_emails && n.recipient_emails.length > 0 && (
                  <div style={mutedStyle}>To: {n.recipient_emails.join(', ')}</div>
                )}
              </li>
            ))}
          </ul>
        )}

        <hr style={{ border: 'none', borderTop: '1px solid var(--theme-border)', margin: '4px 0' }} />

        <div>
          <label htmlFor="drawing-note-body" style={labelStyle}>Your note</label>
          <textarea
            id="drawing-note-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={3}
            placeholder="Ask a question, leave an instruction, or share an update."
            style={textareaStyle}
            disabled={posting}
          />
        </div>

        <div>
          <label htmlFor="drawing-note-recipients" style={labelStyle}>
            Recipients <span style={mutedStyle}>(optional — comma-separated emails; blank = drawer + job team)</span>
          </label>
          <input
            id="drawing-note-recipients"
            type="text"
            value={recipients}
            onChange={(e) => setRecipients(e.target.value)}
            placeholder="drawer@x.com, rpls@x.com"
            style={inputStyle}
            disabled={posting}
          />
        </div>

        {error && (
          <div role="alert" style={errorStyle}>{error}</div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" onClick={onClose} style={secondaryBtnStyle} disabled={posting}>
            Close
          </button>
          <button
            type="button"
            onClick={() => void handlePost()}
            style={primaryBtnStyle}
            disabled={posting || !body.trim()}
          >
            {posting ? 'Sending…' : 'Send note'}
          </button>
        </div>
      </div>
    </ModalFrame>
  );
}

/** Parse a comma-separated recipient string into a clean email list.
 *  Pure + exported so the spec can lock it without a DOM. */
export function parseRecipients(raw: string): string[] {
  return raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0 && s.includes('@'));
}

function formatStamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

const mutedStyle: React.CSSProperties = { color: 'var(--theme-fg-secondary)', fontSize: '0.85rem' };
const threadListStyle: React.CSSProperties = {
  listStyle: 'none', padding: 0, margin: 0,
  display: 'flex', flexDirection: 'column', gap: 8,
  maxHeight: 320, overflowY: 'auto',
};
const noteRowStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 4,
  padding: '8px 10px', borderRadius: 6,
  background: 'var(--theme-bg-elevated)', fontSize: '0.9rem',
};
const noteHeaderStyle: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8,
};
const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: 4,
};
const textareaStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px', borderRadius: 6,
  border: '1px solid var(--theme-border)',
  background: 'var(--theme-bg-surface)', color: 'var(--theme-fg-primary)',
  fontFamily: 'inherit', fontSize: '0.9rem',
  resize: 'vertical',
};
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '6px 10px', borderRadius: 6,
  border: '1px solid var(--theme-border)',
  background: 'var(--theme-bg-surface)', color: 'var(--theme-fg-primary)',
  fontSize: '0.9rem',
};
const errorStyle: React.CSSProperties = {
  padding: '6px 10px', borderRadius: 6,
  background: 'color-mix(in srgb, var(--theme-danger) 12%, var(--theme-bg-surface))',
  border: '1px solid var(--theme-danger)',
  color: 'var(--theme-danger)', fontSize: '0.85rem',
};
const primaryBtnStyle: React.CSSProperties = {
  padding: '6px 12px', borderRadius: 6,
  border: '1px solid var(--theme-accent)',
  background: 'var(--theme-accent)', color: 'var(--theme-accent-fg, white)',
  cursor: 'pointer', fontSize: '0.9rem', fontWeight: 600,
};
const secondaryBtnStyle: React.CSSProperties = {
  padding: '6px 12px', borderRadius: 6,
  border: '1px solid var(--theme-border)',
  background: 'transparent', color: 'var(--theme-fg-primary)',
  cursor: 'pointer', fontSize: '0.9rem',
};

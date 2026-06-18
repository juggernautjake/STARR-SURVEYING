'use client';
// app/admin/leads/[id]/LeadNotesCard.tsx
//
// LR3 of lead-reply-expansion-2026-06-18.md — office-side note thread
// per lead. Stacks under the customer-supplied "Notes from customer"
// card so the page reads top-to-bottom as:
//   1. What the customer originally wrote
//   2. The office's running internal log (this card)
//   3. The outbound reply history (LR1)
//   4. The attachments archive
//
// Each note shows author + relative timestamp + body + pin/delete
// controls. Pinned notes float to the top. Composer is inline at the
// top of the card.

import { useCallback, useEffect, useState } from 'react';
import { useToast } from '@/app/admin/components/Toast';

interface LeadNote {
  id: string;
  lead_id: string;
  author_email: string;
  body: string;
  pinned: boolean;
  created_at: string;
  updated_at: string;
}

interface LeadNotesCardProps {
  leadId: string;
}

function authorDisplay(email: string): string {
  const local = email.split('@')[0] ?? email;
  return local
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[._]/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ') || email;
}

function fmtRelative(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso;
  const diff = Date.now() - t;
  if (diff < 60_000) return 'just now';
  const min = Math.floor(diff / 60_000);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.floor(hr / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function LeadNotesCard({ leadId }: LeadNotesCardProps) {
  const { addToast } = useToast();
  const [notes, setNotes] = useState<LeadNote[]>([]);
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading');
  const [errMsg, setErrMsg] = useState<string>('');
  const [draft, setDraft] = useState<string>('');
  const [pinned, setPinned] = useState<boolean>(false);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    setStatus('loading');
    try {
      const res = await fetch(`/api/admin/leads/${encodeURIComponent(leadId)}/notes`);
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setErrMsg(body.error ?? `HTTP ${res.status}`);
        setStatus('error');
        return;
      }
      const data = (await res.json()) as { notes: LeadNote[] };
      setNotes(data.notes ?? []);
      setStatus('ok');
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : 'Network error');
      setStatus('error');
    }
  }, [leadId]);

  useEffect(() => { void refresh(); }, [refresh]);

  async function handleAdd() {
    const body = draft.trim();
    if (!body) {
      addToast('Note body is required', 'error');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/leads/${encodeURIComponent(leadId)}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body, pinned }),
      });
      if (res.ok) {
        setDraft('');
        setPinned(false);
        await refresh();
      } else {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        addToast(`Couldn't save note — ${data.error ?? `HTTP ${res.status}`}`, 'error');
      }
    } catch (err) {
      addToast(`Couldn't save note — ${err instanceof Error ? err.message : 'network'}`, 'error');
    }
    setSaving(false);
  }

  async function handleTogglePin(note: LeadNote) {
    try {
      const res = await fetch(`/api/admin/leads/${encodeURIComponent(leadId)}/notes`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: note.id, pinned: !note.pinned }),
      });
      if (res.ok) await refresh();
      else addToast("Couldn't update pin", 'error');
    } catch {
      addToast("Couldn't update pin", 'error');
    }
  }

  async function handleDelete(note: LeadNote) {
    if (!window.confirm('Delete this note? This can’t be undone.')) return;
    try {
      const res = await fetch(
        `/api/admin/leads/${encodeURIComponent(leadId)}/notes?id=${encodeURIComponent(note.id)}`,
        { method: 'DELETE' },
      );
      if (res.ok) await refresh();
      else addToast("Couldn't delete note", 'error');
    } catch {
      addToast("Couldn't delete note", 'error');
    }
  }

  return (
    <section
      className="lead-detail__card lead-detail__card--wide"
      data-section="office-notes"
      data-testid="lead-office-notes"
    >
      <h3 className="lead-detail__card-title">
        <span aria-hidden>🗒️</span> Office notes
        <span className="lead-detail__counter" data-testid="office-notes-count">
          {notes.length}
        </span>
      </h3>

      {/* Composer */}
      <div className="office-notes__composer">
        <textarea
          className="office-notes__textarea"
          placeholder="Add a note — who called, what was said, what's next…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={2}
          data-testid="office-notes-textarea"
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
              e.preventDefault();
              void handleAdd();
            }
          }}
        />
        <div className="office-notes__composer-actions">
          <label className="office-notes__pin-toggle">
            <input
              type="checkbox"
              checked={pinned}
              onChange={(e) => setPinned(e.target.checked)}
              data-testid="office-notes-pin-toggle"
            />
            <span>📌 Pin to top</span>
          </label>
          <button
            type="button"
            className="office-notes__save"
            onClick={() => void handleAdd()}
            disabled={saving || !draft.trim()}
            data-testid="office-notes-save"
          >
            {saving ? 'Saving…' : 'Add note'}
          </button>
        </div>
      </div>

      {/* List */}
      {status === 'loading' && (
        <p className="lead-detail__empty" data-testid="office-notes-loading">
          Loading notes…
        </p>
      )}

      {status === 'error' && (
        <p
          className="lead-detail__empty"
          data-testid="office-notes-error"
          style={{ color: '#B91C1C' }}
        >
          Couldn&apos;t load notes — {errMsg}.{' '}
          <button type="button" onClick={() => void refresh()} style={retryBtnStyle}>
            Retry
          </button>
        </p>
      )}

      {status === 'ok' && notes.length === 0 && (
        <p className="lead-detail__empty">
          No office notes yet. Add the first one above.
        </p>
      )}

      {status === 'ok' && notes.length > 0 && (
        <ul className="office-notes__list" data-testid="office-notes-list">
          {notes.map((n) => (
            <li
              key={n.id}
              className="office-notes__item"
              data-pinned={n.pinned ? 'true' : undefined}
              data-testid="office-notes-row"
            >
              <header className="office-notes__item-header">
                <span className="office-notes__item-author">
                  {authorDisplay(n.author_email)}
                </span>
                <span className="office-notes__item-time" title={n.created_at}>
                  {fmtRelative(n.created_at)}
                </span>
                <div className="office-notes__item-controls">
                  <button
                    type="button"
                    onClick={() => void handleTogglePin(n)}
                    aria-pressed={n.pinned}
                    title={n.pinned ? 'Unpin' : 'Pin to top'}
                    data-testid="office-notes-pin-btn"
                    className="office-notes__icon-btn"
                  >
                    {n.pinned ? '📌' : '📍'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDelete(n)}
                    title="Delete note"
                    data-testid="office-notes-delete-btn"
                    className="office-notes__icon-btn"
                  >
                    ✕
                  </button>
                </div>
              </header>
              <p className="office-notes__item-body">{n.body}</p>
            </li>
          ))}
        </ul>
      )}

      <style jsx>{`
        .office-notes__composer {
          background: #F8FAFC;
          border: 1px solid #E5E7EB;
          border-radius: 8px;
          padding: 0.6rem 0.75rem;
          margin-bottom: 0.75rem;
        }
        .office-notes__textarea {
          width: 100%;
          padding: 0.5rem 0.6rem;
          border-radius: 6px;
          border: 1px solid #E5E7EB;
          background: white;
          font: inherit;
          font-size: 0.88rem;
          line-height: 1.5;
          resize: vertical;
          min-height: 56px;
        }
        .office-notes__textarea {
          transition: border-color 120ms ease, box-shadow 120ms ease;
        }
        .office-notes__textarea:focus {
          outline: none;
          border-color: #1D3095;
          /* LR8 styling pass — focus ring so keyboard users can see
             where they are while typing. */
          box-shadow: 0 0 0 3px color-mix(in srgb, #1D3095 18%, transparent);
        }
        .office-notes__composer-actions {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.5rem;
          margin-top: 0.5rem;
        }
        .office-notes__pin-toggle {
          display: inline-flex;
          align-items: center;
          gap: 0.4rem;
          font-size: 0.8rem;
          color: #475569;
          cursor: pointer;
        }
        .office-notes__save {
          padding: 6px 14px;
          border-radius: 6px;
          border: 0;
          background: linear-gradient(135deg, #1D3095 0%, #2A41BD 100%);
          color: white;
          font-size: 0.82rem;
          font-weight: 600;
          cursor: pointer;
          box-shadow: 0 2px 6px rgba(29, 48, 149, 0.2);
        }
        .office-notes__save:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .office-notes__list {
          list-style: none;
          padding: 0;
          margin: 0;
          display: flex;
          flex-direction: column;
          gap: 0.45rem;
        }
        .office-notes__item {
          border: 1px solid #E5E7EB;
          border-radius: 8px;
          padding: 0.55rem 0.75rem;
          background: white;
        }
        .office-notes__item[data-pinned='true'] {
          border-color: #FCD34D;
          background: #FFFBEB;
        }
        .office-notes__item-header {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          margin-bottom: 0.25rem;
        }
        .office-notes__item-author {
          font-size: 0.82rem;
          font-weight: 600;
          color: #0F172A;
        }
        .office-notes__item-time {
          font-size: 0.72rem;
          color: #6B7280;
        }
        .office-notes__item-controls {
          margin-left: auto;
          display: inline-flex;
          gap: 0.25rem;
        }
        .office-notes__icon-btn {
          width: 24px;
          height: 24px;
          border: 0;
          background: transparent;
          color: #6B7280;
          cursor: pointer;
          border-radius: 4px;
          font-size: 0.85rem;
        }
        .office-notes__icon-btn:hover {
          background: #F1F5F9;
          color: #0F172A;
        }
        .office-notes__icon-btn:focus-visible {
          outline: none;
          background: #EEF2FF;
          color: #1D3095;
          box-shadow: 0 0 0 2px color-mix(in srgb, #1D3095 35%, transparent);
        }
        .office-notes__save {
          transition: transform 120ms ease, box-shadow 120ms ease;
        }
        .office-notes__save:not(:disabled):hover {
          transform: translateY(-1px);
          box-shadow: 0 6px 14px rgba(29, 48, 149, 0.3);
        }
        .office-notes__save:focus-visible {
          outline: none;
          box-shadow:
            0 0 0 3px color-mix(in srgb, #1D3095 35%, transparent),
            0 2px 6px rgba(29, 48, 149, 0.2);
        }
        @media (prefers-reduced-motion: reduce) {
          .office-notes__textarea,
          .office-notes__save {
            transition: none !important;
          }
        }
        .office-notes__item-body {
          margin: 0;
          font-size: 0.88rem;
          line-height: 1.5;
          color: #1F2937;
          white-space: pre-wrap;
          overflow-wrap: anywhere;
        }
      `}</style>
    </section>
  );
}

const retryBtnStyle: React.CSSProperties = {
  marginLeft: 6,
  padding: '2px 8px',
  borderRadius: 6,
  border: '1px solid #FCA5A5',
  background: 'white',
  color: '#B91C1C',
  cursor: 'pointer',
  fontSize: '0.78rem',
};

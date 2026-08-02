'use client';
// app/AndrewAsh/studio/inquiries/[id]/InquiryActions.tsx — working the lead.
//
// Status, private notes, and the one action that saves real effort: turning the inquiry into a client
// without retyping the email address. Retyping is how a typo gets into the record an invoice will
// later be sent to.
//
// ── NOTES SAVE ON BLUR, NOT ON A BUTTON ─────────────────────────────────────────────────────────
//
// A "Save notes" button is a button people forget to press, and the note they lose is the one they
// wrote in a hurry after a phone call. Saving when the field loses focus means the note is kept by
// the act of moving on, which is the thing a person does automatically. A quiet "saved" confirms it
// without demanding acknowledgement.

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check, Loader2, Trash2, UserPlus } from 'lucide-react';
import { BASE_PATH } from '@/lib/voice/content';

const STATUSES = [
  { id: 'new', label: 'New' },
  { id: 'read', label: 'Read' },
  { id: 'quoted', label: 'Quoted' },
  { id: 'won', label: 'Won' },
  { id: 'lost', label: 'Lost' },
  { id: 'spam', label: 'Spam' },
];

interface Props {
  id: string;
  status: string;
  internalNotes: string;
  hasClient: boolean;
  clientId: string | null;
}

export default function InquiryActions({ id, status, internalNotes, hasClient, clientId }: Props): React.ReactElement {
  const router = useRouter();
  const [current, setCurrent] = useState(status);
  const [notes, setNotes] = useState(internalNotes);
  const [savedNotes, setSavedNotes] = useState(internalNotes);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [noteState, setNoteState] = useState<'idle' | 'saving' | 'saved'>('idle');

  async function patch(body: Record<string, unknown>, key: string): Promise<unknown> {
    setBusy(key);
    setError(null);
    try {
      const res = await fetch(`/api/voice/inquiries/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'That did not save.');
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not save.');
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function changeStatus(next: string): Promise<void> {
    const previous = current;
    setCurrent(next); // optimistic
    const result = await patch({ status: next }, 'status');
    if (!result) setCurrent(previous);
    else router.refresh();
  }

  async function saveNotes(): Promise<void> {
    if (notes === savedNotes) return;
    setNoteState('saving');
    const result = await patch({ internalNotes: notes }, 'notes');
    if (result) {
      setSavedNotes(notes);
      setNoteState('saved');
      // Clear the confirmation after a moment — a permanent "saved" stops meaning anything.
      window.setTimeout(() => setNoteState('idle'), 2500);
    } else {
      setNoteState('idle');
    }
  }

  return (
    <>
      <div className="vaPanel">
        <div className="vaPanelHead">
          <h2 className="vaPanelTitle">Where it stands</h2>
        </div>

        {error && (
          <div className="vaNotice vaNoticeBad" role="alert">
            {error}
          </div>
        )}

        <div className="vaSegmented" style={{ marginBottom: 18 }}>
          {STATUSES.map((s) => (
            <label key={s.id} className="vaSegment">
              <input
                type="radio"
                name="status"
                checked={current === s.id}
                onChange={() => void changeStatus(s.id)}
                disabled={busy === 'status'}
              />
              <span>{s.label}</span>
            </label>
          ))}
        </div>

        {!hasClient ? (
          <button
            type="button"
            className="vaBtn vaBtnSolid vaBtnSm"
            style={{ width: '100%' }}
            disabled={busy === 'client'}
            onClick={async () => {
              const result = (await patch({ createClient: true, status: current === 'new' ? 'read' : current }, 'client')) as
                | { inquiry?: { client_id?: string } }
                | null;
              if (result?.inquiry?.client_id) router.refresh();
            }}
          >
            {busy === 'client' ? <Loader2 size={14} aria-hidden className="vaSpin" /> : <UserPlus size={14} aria-hidden />}
            Make them a client
          </button>
        ) : (
          <Link href={`${BASE_PATH}/studio/clients/${clientId}`} className="vaBtn vaBtnOutline vaBtnSm" style={{ width: '100%' }}>
            <Check size={14} aria-hidden /> Already a client — open their record
          </Link>
        )}
      </div>

      <div className="vaPanel">
        <div className="vaPanelHead">
          <h2 className="vaPanelTitle">Your notes</h2>
          <span className="vaMuted" style={{ fontSize: '0.6875rem' }}>
            {noteState === 'saving' ? 'Saving…' : noteState === 'saved' ? 'Saved' : 'Private to you'}
          </span>
        </div>
        <textarea
          className="vaTextarea"
          rows={6}
          value={notes}
          placeholder="What you quoted, what they said on the phone, when to follow up."
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => void saveNotes()}
        />
        <p className="vaHint">Saved when you click away. Never shown to the client.</p>
      </div>

      <div className="vaPanel">
        <button
          type="button"
          className="vaBtn vaBtnGhost vaBtnSm"
          style={{ color: 'var(--va-danger)' }}
          disabled={busy === 'delete'}
          onClick={async () => {
            // A confirm is right here and wrong on a widget delete: this one is NOT undoable, and the
            // thing being destroyed is somebody's request for work.
            if (!window.confirm('Delete this inquiry for good? This cannot be undone.')) return;
            setBusy('delete');
            await fetch(`/api/voice/inquiries/${id}`, { method: 'DELETE' });
            router.push(`${BASE_PATH}/studio/inquiries`);
          }}
        >
          <Trash2 size={13} aria-hidden /> Delete this inquiry
        </button>
      </div>
    </>
  );
}

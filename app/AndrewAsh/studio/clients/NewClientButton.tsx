'use client';
// app/AndrewAsh/studio/clients/NewClientButton.tsx

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, UserPlus } from 'lucide-react';
import { BASE_PATH } from '@/lib/voice/content';

export default function NewClientButton(): React.ReactElement {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [existingId, setExistingId] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');
  const [phone, setPhone] = useState('');
  const [relationship, setRelationship] = useState('voiceover');

  async function save(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setExistingId(null);
    try {
      const res = await fetch('/api/voice/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, company, phone, relationship }),
      });
      const body = await res.json();
      if (!res.ok) {
        // A duplicate email offers a link to the record that already exists, rather than just
        // refusing — the reason someone is on this form is that they want to reach that person.
        if (body.existingId) setExistingId(body.existingId);
        throw new Error(body.error || 'Could not add them.');
      }
      router.push(`${BASE_PATH}/studio/clients/${body.client.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add them.');
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button type="button" className="vaBtn vaBtnSolid vaBtnSm" onClick={() => setOpen(true)}>
        <UserPlus size={14} aria-hidden /> Add a client
      </button>
    );
  }

  return (
    <form onSubmit={save} className="vaPanel" style={{ marginBottom: 0, width: 'min(100%, 460px)' }}>
      {error && (
        <div className="vaNotice vaNoticeBad" role="alert">
          {error}
          {existingId && (
            <>
              {' '}
              <a href={`${BASE_PATH}/studio/clients/${existingId}`} style={{ color: 'var(--va-accent)' }}>
                Open their record
              </a>
              .
            </>
          )}
        </div>
      )}

      <div className="vaFieldRow vaFieldRow2">
        <div className="vaField">
          <label className="vaLabel" htmlFor="va-cl-name">Name</label>
          <input id="va-cl-name" className="vaInput" value={name} onChange={(e) => setName(e.target.value)} autoFocus required />
        </div>
        <div className="vaField">
          <label className="vaLabel" htmlFor="va-cl-email">Email</label>
          <input id="va-cl-email" type="email" className="vaInput" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
      </div>

      <div className="vaFieldRow vaFieldRow2">
        <div className="vaField">
          <label className="vaLabel" htmlFor="va-cl-company">Company (optional)</label>
          <input id="va-cl-company" className="vaInput" value={company} onChange={(e) => setCompany(e.target.value)} />
        </div>
        <div className="vaField">
          <label className="vaLabel" htmlFor="va-cl-phone">Phone (optional)</label>
          <input id="va-cl-phone" type="tel" className="vaInput" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
      </div>

      <div className="vaField">
        <label className="vaLabel" htmlFor="va-cl-rel">They work with you on</label>
        <select id="va-cl-rel" className="vaSelect" value={relationship} onChange={(e) => setRelationship(e.target.value)}>
          <option value="voiceover">Voice-over work</option>
          <option value="coaching">Coaching</option>
          <option value="both">Both</option>
        </select>
      </div>

      <div className="vaStudioActions">
        <button type="submit" className="vaBtn vaBtnSolid vaBtnSm" disabled={busy || !name.trim() || !email.trim()}>
          {busy ? <Loader2 size={14} aria-hidden className="vaSpin" /> : <UserPlus size={14} aria-hidden />}
          Add them
        </button>
        <button type="button" className="vaBtn vaBtnGhost vaBtnSm" onClick={() => setOpen(false)} disabled={busy}>
          Cancel
        </button>
      </div>
    </form>
  );
}

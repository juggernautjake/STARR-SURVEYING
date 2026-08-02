'use client';
// app/AndrewAsh/studio/clients/[id]/ClientActions.tsx — details, portal link, notes.
//
// ── THE PORTAL LINK IS THE ONLY SECURITY CONTROL THIS RELATIONSHIP HAS ──────────────────────────
//
// A client has no password. The link IS their authorisation, so "regenerate" is the revoke button and
// it is stated in those words rather than hidden behind an icon. Getting a link back after forwarding
// it to the wrong address is the one thing Andrew will need in a hurry, and he should not have to
// work out that "regenerate" is what does it.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Copy, KeyRound, Loader2, Trash2 } from 'lucide-react';
import { BASE_PATH } from '@/lib/voice/content';

interface Props {
  id: string;
  name: string;
  email: string;
  phone: string;
  company: string;
  address: string;
  relationship: string;
  notes: string;
  portalToken: string;
  portalRevoked: boolean;
  canDelete: boolean;
}

export default function ClientActions(props: Props): React.ReactElement {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [name, setName] = useState(props.name);
  const [email, setEmail] = useState(props.email);
  const [phone, setPhone] = useState(props.phone);
  const [company, setCompany] = useState(props.company);
  const [address, setAddress] = useState(props.address);
  const [relationship, setRelationship] = useState(props.relationship);
  const [notes, setNotes] = useState(props.notes);
  const [savedNotes, setSavedNotes] = useState(props.notes);
  const [detailsSaved, setDetailsSaved] = useState(false);

  const portalUrl =
    typeof window !== 'undefined' ? `${window.location.origin}${BASE_PATH}/client/${props.portalToken}` : '';

  async function patch(body: Record<string, unknown>, key: string): Promise<boolean> {
    setBusy(key);
    setError(null);
    try {
      const res = await fetch(`/api/voice/clients/${props.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'That did not save.');
      router.refresh();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not save.');
      return false;
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      {error && (
        <div className="vaNotice vaNoticeBad" role="alert">
          {error}
        </div>
      )}

      <div className="vaPanel">
        <div className="vaPanelHead">
          <h2 className="vaPanelTitle">Their portal</h2>
          {props.portalRevoked && <span className="vaStatusPill vaStatusDraft">Revoked</span>}
        </div>
        <p className="vaMuted" style={{ fontSize: '0.875rem', marginBottom: 12 }}>
          One link to everything of theirs — contracts to sign, invoices to pay. No account, no
          password. Anyone holding this link can see it, so treat it like a key.
        </p>

        <div className="vaCopyRow">
          <input className="vaInput" readOnly value={portalUrl} onFocus={(e) => e.currentTarget.select()} />
          <button
            type="button"
            className="vaBtn vaBtnOutline vaBtnSm"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(portalUrl);
                setCopied(true);
                window.setTimeout(() => setCopied(false), 2000);
              } catch {
                setError('Could not copy — select the link and copy it manually.');
              }
            }}
          >
            {copied ? <Check size={13} aria-hidden /> : <Copy size={13} aria-hidden />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>

        <div className="vaStudioActions">
          <button
            type="button"
            className="vaBtn vaBtnGhost vaBtnSm"
            disabled={busy === 'token'}
            onClick={() => {
              if (
                !window.confirm(
                  'Make a new link? The current one stops working immediately — including any copy the client has already been sent.',
                )
              )
                return;
              void patch({ regenerateToken: true }, 'token');
            }}
          >
            {busy === 'token' ? <Loader2 size={13} aria-hidden className="vaSpin" /> : <KeyRound size={13} aria-hidden />}
            New link (revokes the old one)
          </button>
          {!props.portalRevoked ? (
            <button
              type="button"
              className="vaBtn vaBtnGhost vaBtnSm"
              disabled={busy === 'revoke'}
              onClick={() => void patch({ revokePortal: true }, 'revoke')}
            >
              Turn the portal off
            </button>
          ) : (
            <button
              type="button"
              className="vaBtn vaBtnGhost vaBtnSm"
              disabled={busy === 'restore'}
              onClick={() => void patch({ restorePortal: true }, 'restore')}
            >
              Turn it back on
            </button>
          )}
        </div>
      </div>

      <div className="vaPanel">
        <div className="vaPanelHead">
          <h2 className="vaPanelTitle">Details</h2>
          {detailsSaved && <span className="vaMuted" style={{ fontSize: '0.6875rem' }}>Saved</span>}
        </div>

        <div className="vaField">
          <label className="vaLabel" htmlFor="va-c-name">Name</label>
          <input id="va-c-name" className="vaInput" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="vaField">
          <label className="vaLabel" htmlFor="va-c-email">Email</label>
          <input id="va-c-email" type="email" className="vaInput" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="vaFieldRow vaFieldRow2">
          <div className="vaField">
            <label className="vaLabel" htmlFor="va-c-phone">Phone</label>
            <input id="va-c-phone" className="vaInput" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div className="vaField">
            <label className="vaLabel" htmlFor="va-c-company">Company</label>
            <input id="va-c-company" className="vaInput" value={company} onChange={(e) => setCompany(e.target.value)} />
          </div>
        </div>
        <div className="vaField">
          <label className="vaLabel" htmlFor="va-c-address">Billing address</label>
          <textarea id="va-c-address" className="vaTextarea" rows={3} value={address} onChange={(e) => setAddress(e.target.value)} />
          <p className="vaHint">Appears on their invoices.</p>
        </div>
        <div className="vaField">
          <label className="vaLabel" htmlFor="va-c-rel">Works with you on</label>
          <select id="va-c-rel" className="vaSelect" value={relationship} onChange={(e) => setRelationship(e.target.value)}>
            <option value="voiceover">Voice-over work</option>
            <option value="coaching">Coaching</option>
            <option value="both">Both</option>
          </select>
        </div>

        <button
          type="button"
          className="vaBtn vaBtnSolid vaBtnSm"
          disabled={busy === 'details'}
          onClick={async () => {
            const ok = await patch({ name, email, phone, company, address, relationship }, 'details');
            if (ok) {
              setDetailsSaved(true);
              window.setTimeout(() => setDetailsSaved(false), 2500);
            }
          }}
        >
          {busy === 'details' ? <Loader2 size={14} aria-hidden className="vaSpin" /> : <Check size={14} aria-hidden />}
          Save details
        </button>
      </div>

      <div className="vaPanel">
        <div className="vaPanelHead">
          <h2 className="vaPanelTitle">Your notes</h2>
          <span className="vaMuted" style={{ fontSize: '0.6875rem' }}>Private to you</span>
        </div>
        <textarea
          className="vaTextarea"
          rows={6}
          value={notes}
          placeholder="What they need, what you quoted last time, who to ask for."
          onChange={(e) => setNotes(e.target.value)}
          onBlur={async () => {
            if (notes === savedNotes) return;
            const ok = await patch({ notes }, 'notes');
            if (ok) setSavedNotes(notes);
          }}
        />
        <p className="vaHint">Saved when you click away. Never shown to the client.</p>
      </div>

      {props.canDelete && (
        <div className="vaPanel">
          <button
            type="button"
            className="vaBtn vaBtnGhost vaBtnSm"
            style={{ color: '#ff9c7e' }}
            disabled={busy === 'delete'}
            onClick={async () => {
              if (!window.confirm(`Delete ${props.name}? They have no invoices or contracts, so nothing else goes with them.`)) return;
              setBusy('delete');
              const res = await fetch(`/api/voice/clients/${props.id}`, { method: 'DELETE' });
              if (res.ok) router.push(`${BASE_PATH}/studio/clients`);
              else {
                const body = await res.json().catch(() => ({}));
                setError(body.error ?? 'Could not delete.');
                setBusy(null);
              }
            }}
          >
            <Trash2 size={13} aria-hidden /> Delete this client
          </button>
        </div>
      )}
    </>
  );
}

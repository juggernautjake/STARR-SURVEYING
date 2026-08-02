'use client';
// app/AndrewAsh/contract/[token]/SignForm.tsx — the signature.
//
// ── THE TICKBOX IS NOT DECORATION ───────────────────────────────────────────────────────────────
//
// Under ESIGN/UETA an electronic signature needs INTENT — evidence the signer meant to be bound, not
// merely that a name appeared in a field. A separate, explicit affirmation is what supplies that, and
// it is why the button stays disabled until it is ticked rather than validating on submit. The
// difference matters precisely once, in a dispute, and by then it cannot be added.
//
// The typed name renders in the display face at signature size as it is entered. That is not
// ornament: it makes the act feel like signing rather than like completing a field, which is the
// same reason paper contracts have a line rather than a box.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Loader2, PenLine } from 'lucide-react';

interface Props {
  token: string;
  expectedName: string;
  defaultEmail: string;
}

export default function SignForm({ token, expectedName, defaultEmail }: Props): React.ReactElement {
  const router = useRouter();
  const [typedName, setTypedName] = useState('');
  const [email, setEmail] = useState(defaultEmail);
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/voice/sign/${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ typedName, email, agreed }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'That did not go through.');
      setDone(true);
      // Refresh so the server re-renders the page in its signed state, with the evidence banner.
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not go through.');
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="vaCard" style={{ textAlign: 'center', padding: '44px 26px' }}>
        <CheckCircle2 size={36} aria-hidden style={{ color: 'var(--va-accent)', marginBottom: 16 }} />
        <h2 className="vaCardTitle" style={{ fontSize: '1.35rem' }}>Signed — thank you.</h2>
        <p className="vaCardBody" style={{ maxWidth: '44ch', margin: '10px auto 0' }}>
          A copy of this page is your record. Print it or save it as a PDF. You will hear from Andrew
          shortly about next steps.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="vaCard">
      <h2 className="vaCardTitle" style={{ fontSize: '1.2rem', marginBottom: 8 }}>Sign this agreement</h2>
      <p className="vaCardBody" style={{ marginBottom: 22 }}>
        Type your full name exactly as you would sign it.
      </p>

      {error && (
        <div className="vaNotice vaNoticeBad" role="alert">
          {error}
        </div>
      )}

      <div className="vaField">
        <label className="vaLabel" htmlFor="va-sign-name">Your full name</label>
        <input
          id="va-sign-name"
          className="vaInput vaSignatureInput"
          value={typedName}
          onChange={(e) => setTypedName(e.target.value)}
          placeholder={expectedName || 'Your name'}
          autoComplete="name"
          required
        />
        {typedName.trim().length > 1 && (
          <p className="vaSignaturePreview" aria-hidden>
            {typedName}
          </p>
        )}
      </div>

      <div className="vaField">
        <label className="vaLabel" htmlFor="va-sign-email">Your email</label>
        <input
          id="va-sign-email"
          type="email"
          className="vaInput"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
        />
        <p className="vaHint">Recorded with your signature so both of us have the same record.</p>
      </div>

      <label className="vaCheckRow">
        <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
        <span>
          I have read this agreement, I agree to its terms, and I intend my typed name above to be my
          signature.
        </span>
      </label>

      <button
        type="submit"
        className="vaBtn vaBtnSolid vaBtnLg"
        style={{ width: '100%' }}
        disabled={busy || !agreed || typedName.trim().length < 2}
      >
        {busy ? (
          <>
            <Loader2 size={16} aria-hidden className="vaSpin" /> Recording…
          </>
        ) : (
          <>
            <PenLine size={16} aria-hidden /> Sign
          </>
        )}
      </button>
    </form>
  );
}

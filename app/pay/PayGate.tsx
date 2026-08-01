'use client';

// app/pay/PayGate.tsx
//
// S7 of CUSTOMER_INVOICING_BUILD_2026-06-21.md — temporary password wall in
// front of every /pay route. Checks /api/public/pay-gate on mount:
//   - gate not required (PAY_PORTAL_PASSWORD unset) → render children
//   - required + already unlocked (valid cookie) → render children
//   - required + locked → render the password prompt
//
// Remove the gate at launch by clearing PAY_PORTAL_PASSWORD; this component
// then transparently renders children with no prompt.

// NO `PayHeader` HERE ANY MORE — see the note in `PayHeader.tsx`. These routes render inside the site's
// own layout, so the portal header was a SECOND header, and it landed in the exact band that the site's
// absolutely-positioned logo and navbar overhang: the owner's screenshot shows "…Surveying · Payments"
// disappearing behind the star.
import { useEffect, useState } from 'react';
import PaySkeleton from './PaySkeleton';

export default function PayGate({ children }: { children: React.ReactNode }): React.ReactElement {
  const [state, setState] = useState<'checking' | 'locked' | 'open'>('checking');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/public/pay-gate')
      .then((r) => (r.ok ? r.json() : { required: false, unlocked: true }))
      .then((j) => {
        if (cancelled) return;
        setState(!j.required || j.unlocked ? 'open' : 'locked');
      })
      .catch(() => { if (!cancelled) setState('open'); });
    return () => { cancelled = true; };
  }, []);

  async function unlock(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const res = await fetch('/api/public/pay-gate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    setSubmitting(false);
    if (!res.ok) {
      setError('That password is not correct.');
      return;
    }
    setState('open');
  }

  if (state === 'open') return <>{children}</>;

  if (state === 'checking') {
    return (
      <main className="pay-shell" data-testid="pay-gate-checking">
        <PaySkeleton />
      </main>
    );
  }

  return (
    <main className="pay-shell" data-testid="pay-gate-locked">
      <section className="pay-hero">
        <div className="pay-hero__card">
          <div className="pay-hero__eyebrow">Payment portal</div>
          <h1 className="pay-hero__title">Payments coming soon</h1>
          <p className="pay-hero__subtitle">
            Our online payment portal is being finalized. Enter the access password to preview it — or
            call us and we&rsquo;ll take payment over the phone.
          </p>

          {/* The classes are the SAME ones the lookup form uses, rather than the inline styles that were
              here. Inline styles on one of two nearly-identical forms is how they drift: this one had a
              left-aligned 20rem column inside a centred card, and a bare input that shared none of the
              lookup field's focus, size or error treatment. */}
          <form className="pay-lookup" onSubmit={unlock} noValidate>
            <label htmlFor="pay-gate-password" className="pay-lookup__label">
              Access password
            </label>
            <input
              id="pay-gate-password"
              type="password"
              className="pay-lookup__input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Access password"
              data-testid="pay-gate-input"
              autoComplete="off"
            />
            <button
              type="submit"
              className="pay-lookup__submit"
              disabled={submitting || !password}
              data-testid="pay-gate-submit"
            >
              {submitting ? 'Checking…' : 'Unlock'}
            </button>
            {error && (
              <p className="pay-lookup__error" role="alert" data-testid="pay-gate-error">
                {error}
              </p>
            )}
          </form>

          {/* The call route matters more here than anywhere else on the site: this page exists to tell
              someone they cannot pay online yet, so it must not be a dead end. 44px tap target. */}
          <a className="pay-hero__call" href="tel:+19366620077" data-testid="pay-gate-call">
            <span aria-hidden>📞</span> Call (936) 662-0077
          </a>
        </div>
      </section>
    </main>
  );
}

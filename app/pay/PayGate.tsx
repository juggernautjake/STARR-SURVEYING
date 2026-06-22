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

import { useEffect, useState } from 'react';
import PayHeader from './PayHeader';
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
        <PayHeader />
        <PaySkeleton />
      </main>
    );
  }

  return (
    <main className="pay-shell" data-testid="pay-gate-locked">
      <PayHeader />
      <section className="pay-hero">
        <div className="pay-hero__card">
          <h1 className="pay-hero__title">Payments coming soon</h1>
          <p className="pay-hero__subtitle">
            Our online payment portal is being finalized. Enter the access
            password to preview it, or call <a href="tel:+19366620077">(936) 662-0077</a>.
          </p>
          <form onSubmit={unlock} style={{ marginTop: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', maxWidth: '20rem' }}>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Access password"
              data-testid="pay-gate-input"
              autoComplete="off"
              style={{ font: 'inherit', padding: '0.6rem 0.8rem', border: '2px solid #E4E7EE', borderRadius: 10 }}
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
              <p role="alert" data-testid="pay-gate-error" style={{ color: '#B42318', fontSize: '0.88rem', margin: 0 }}>
                {error}
              </p>
            )}
          </form>
        </div>
      </section>
    </main>
  );
}

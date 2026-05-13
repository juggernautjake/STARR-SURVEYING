'use client';
// app/signup/page.tsx
//
// Public 4-step signup wizard per MARKETING_SIGNUP_FLOW.md §4.
// State is local to the component; submit calls /api/signup/complete
// (deferred slice). Step 2 (org info) calls /api/signup/precheck for
// live slug + email availability.
//
// URL query: ?plan=<bundle_id> pre-selects step 1.
//
// Spec: docs/planning/in-progress/MARKETING_SIGNUP_FLOW.md §4 + §6 D-1b.

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import { BUNDLES, BUNDLE_ORDER, formatBundlePrice, annualPriceCents, type BundleId } from '@/lib/saas/bundles';

type Step = 1 | 2 | 3 | 4;

export default function SignupPage() {
  return (
    <Suspense fallback={<div style={{ padding: '2rem', textAlign: 'center', color: '#6B7280' }}>Loading…</div>}>
      <SignupWizard />
    </Suspense>
  );
}

interface WizardState {
  step: Step;
  selectedBundles: BundleId[];
  annual: boolean;
  orgName: string;
  orgSlug: string;
  state: string;
  phone: string;
  adminEmail: string;
  adminName: string;
  password: string;
  agreed: boolean;
}

const INITIAL: WizardState = {
  step: 1,
  selectedBundles: [],
  annual: true,
  orgName: '',
  orgSlug: '',
  state: 'TX',
  phone: '',
  adminEmail: '',
  adminName: '',
  password: '',
  agreed: false,
};

function SignupWizard() {
  const router = useRouter();
  const params = useSearchParams();
  const initialPlan = params.get('plan') as BundleId | null;
  const [state, setState] = useState<WizardState>({
    ...INITIAL,
    selectedBundles: initialPlan && BUNDLE_ORDER.includes(initialPlan) ? [initialPlan] : [],
  });
  const [slugStatus, setSlugStatus] = useState<'idle' | 'checking' | 'available' | 'taken' | 'invalid'>('idle');
  const [emailStatus, setEmailStatus] = useState<'idle' | 'checking' | 'new' | 'existing' | 'banned'>('idle');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Debounced slug check on step 2
  useEffect(() => {
    if (state.step !== 2 || !state.orgSlug) {
      setSlugStatus('idle');
      return;
    }
    setSlugStatus('checking');
    const t = setTimeout(async () => {
      try {
        const res = await fetch('/api/signup/precheck', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slug: state.orgSlug }),
        });
        const data = (await res.json()) as { slug?: { ok: boolean; reason?: string } };
        if (!data.slug) return;
        if (data.slug.ok) setSlugStatus('available');
        else if (data.slug.reason === 'taken') setSlugStatus('taken');
        else setSlugStatus('invalid');
      } catch {
        setSlugStatus('idle');
      }
    }, 350);
    return () => clearTimeout(t);
  }, [state.orgSlug, state.step]);

  // Email check on step 3
  useEffect(() => {
    if (state.step !== 3 || !state.adminEmail.includes('@')) {
      setEmailStatus('idle');
      return;
    }
    setEmailStatus('checking');
    const t = setTimeout(async () => {
      try {
        const res = await fetch('/api/signup/precheck', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: state.adminEmail }),
        });
        const data = (await res.json()) as { email?: { status: 'new' | 'existing_user' | 'banned' } };
        if (data.email?.status === 'new') setEmailStatus('new');
        else if (data.email?.status === 'existing_user') setEmailStatus('existing');
        else if (data.email?.status === 'banned') setEmailStatus('banned');
      } catch {
        setEmailStatus('idle');
      }
    }, 350);
    return () => clearTimeout(t);
  }, [state.adminEmail, state.step]);

  function toggleBundle(b: BundleId) {
    setState((s) => ({
      ...s,
      selectedBundles: s.selectedBundles.includes(b)
        ? s.selectedBundles.filter((x) => x !== b)
        : [...s.selectedBundles, b],
    }));
  }

  function setStep(step: Step) {
    setState((s) => ({ ...s, step }));
  }

  function autoSlug(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  }

  function canContinue(): boolean {
    switch (state.step) {
      case 1: return state.selectedBundles.length > 0;
      case 2: return slugStatus === 'available' && state.orgName.trim().length > 0;
      case 3: return (
        state.adminEmail.includes('@') &&
        state.adminName.trim().length > 0 &&
        state.password.length >= 8 &&
        state.agreed &&
        emailStatus !== 'banned'
      );
      default: return true;
    }
  }

  async function handleSubmit() {
    setSubmitting(true);
    setSubmitError(null);
    try {
      // POST /api/signup/complete — not yet implemented; placeholder
      // shows what the wizard would do. Phase D-1e ships the endpoint.
      const res = await fetch('/api/signup/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bundles: state.selectedBundles,
          billingCycle: state.annual ? 'annual' : 'monthly',
          org: {
            name: state.orgName.trim(),
            slug: state.orgSlug,
            state: state.state,
            phone: state.phone.trim() || null,
          },
          admin: {
            email: state.adminEmail.trim().toLowerCase(),
            name: state.adminName.trim(),
            password: state.password,
          },
        }),
      });
      if (res.status === 404) {
        setSubmitError(
          'The signup completion API is not deployed yet (Phase D-1e). ' +
            'Your firm details have been validated; once D-1e ships, ' +
            'this page will create your org automatically. ' +
            'Contact info@starrsoftware.com to provision manually.',
        );
        setSubmitting(false);
        return;
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Unknown error' }));
        setSubmitError(err.error ?? 'Signup failed');
        setSubmitting(false);
        return;
      }
      const data = (await res.json()) as { orgSlug: string };
      // In production: window.location → subdomain. For dev:
      // /admin/me with the new session.
      router.push(`/admin/me?welcome=true&org=${data.orgSlug}`);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Network error');
      setSubmitting(false);
    }
  }

  const totalMonthly = state.selectedBundles.reduce(
    (sum, b) => sum + (state.annual
      ? Math.round(annualPriceCents(BUNDLES[b].monthlyBaseCents) / 12)
      : BUNDLES[b].monthlyBaseCents),
    0,
  );

  return (
    <main className="signup-page">
      <header className="signup-header">
        <a href="/" className="signup-back">← Back to starrsoftware.com</a>
        <h1>Start your free trial</h1>
        <ol className="signup-progress" aria-label="Signup progress">
          {[1, 2, 3, 4].map((n) => (
            <li
              key={n}
              className={`signup-step${state.step === n ? ' signup-step--active' : ''}${state.step > n ? ' signup-step--done' : ''}`}
            >
              {n}
            </li>
          ))}
        </ol>
      </header>

      <section className="signup-card">
        {state.step === 1 && (
          <div>
            <h2>Pick your bundle{state.selectedBundles.length > 1 ? 's' : ''}</h2>
            <p className="signup-sub">Mix-and-match or choose the all-in-one Firm Suite. Toggle annual to save 20%.</p>
            <label className="signup-toggle">
              <input
                type="checkbox"
                checked={state.annual}
                onChange={(e) => setState((s) => ({ ...s, annual: e.target.checked }))}
              />
              Annual billing (save 20%)
            </label>
            <div className="signup-bundles">
              {BUNDLE_ORDER.map((id) => {
                const b = BUNDLES[id];
                const monthly = state.annual
                  ? Math.round(annualPriceCents(b.monthlyBaseCents) / 12)
                  : b.monthlyBaseCents;
                const selected = state.selectedBundles.includes(id);
                return (
                  <button
                    key={id}
                    type="button"
                    className={`signup-bundle${selected ? ' signup-bundle--selected' : ''}`}
                    onClick={() => toggleBundle(id)}
                  >
                    <span className="signup-bundle__label">{b.label}</span>
                    <span className="signup-bundle__price">{formatBundlePrice(monthly)}/mo</span>
                    <span className="signup-bundle__tagline">{b.tagline}</span>
                  </button>
                );
              })}
            </div>
            {state.selectedBundles.length > 0 ? (
              <div className="signup-total">
                Total: {formatBundlePrice(totalMonthly)}/mo · 14-day free trial · No card up front
              </div>
            ) : null}
          </div>
        )}

        {state.step === 2 && (
          <div>
            <h2>Tell us about your firm</h2>
            <label className="signup-field">
              <span>Firm name</span>
              <input
                type="text"
                value={state.orgName}
                onChange={(e) => {
                  const name = e.target.value;
                  setState((s) => ({
                    ...s,
                    orgName: name,
                    orgSlug: s.orgSlug || autoSlug(name),
                  }));
                }}
                placeholder="Acme Surveying"
                autoFocus
              />
            </label>
            <label className="signup-field">
              <span>Subdomain</span>
              <div className="signup-slug">
                <input
                  type="text"
                  value={state.orgSlug}
                  onChange={(e) => setState((s) => ({ ...s, orgSlug: autoSlug(e.target.value) }))}
                  placeholder="acme-surveying"
                />
                <span>.starrsoftware.com</span>
              </div>
              <span className={`signup-slug-status signup-slug-status--${slugStatus}`}>
                {slugStatus === 'checking' && 'Checking…'}
                {slugStatus === 'available' && '✓ Available'}
                {slugStatus === 'taken' && '✗ Taken — try another'}
                {slugStatus === 'invalid' && '✗ Invalid — use 5-40 lowercase letters / numbers / hyphens'}
              </span>
            </label>
            <label className="signup-field">
              <span>Primary state</span>
              <input
                type="text"
                value={state.state}
                onChange={(e) => setState((s) => ({ ...s, state: e.target.value.toUpperCase().slice(0, 2) }))}
                placeholder="TX"
                maxLength={2}
              />
            </label>
            <label className="signup-field">
              <span>Phone <em>(optional)</em></span>
              <input
                type="tel"
                value={state.phone}
                onChange={(e) => setState((s) => ({ ...s, phone: e.target.value }))}
                placeholder="(555) 123-4567"
              />
            </label>
          </div>
        )}

        {state.step === 3 && (
          <div>
            <h2>Create your admin account</h2>
            <p className="signup-sub">You&apos;ll be the first admin on your firm&apos;s plan. Invite teammates later.</p>
            <label className="signup-field">
              <span>Email</span>
              <input
                type="email"
                value={state.adminEmail}
                onChange={(e) => setState((s) => ({ ...s, adminEmail: e.target.value }))}
                placeholder="you@acme-surveying.com"
                autoFocus
              />
              <span className={`signup-slug-status signup-slug-status--${emailStatus}`}>
                {emailStatus === 'checking' && 'Checking…'}
                {emailStatus === 'existing' && '⚠ This email already has an account. Sign in to add this firm instead.'}
                {emailStatus === 'banned' && '✗ This email is not eligible to sign up.'}
              </span>
            </label>
            <label className="signup-field">
              <span>Your name</span>
              <input
                type="text"
                value={state.adminName}
                onChange={(e) => setState((s) => ({ ...s, adminName: e.target.value }))}
                placeholder="Alice Carter"
              />
            </label>
            <label className="signup-field">
              <span>Password <em>(8+ characters)</em></span>
              <input
                type="password"
                value={state.password}
                onChange={(e) => setState((s) => ({ ...s, password: e.target.value }))}
                placeholder="••••••••"
              />
            </label>
            <label className="signup-toggle">
              <input
                type="checkbox"
                checked={state.agreed}
                onChange={(e) => setState((s) => ({ ...s, agreed: e.target.checked }))}
              />
              I agree to the Terms of Service and Privacy Policy.
            </label>
          </div>
        )}

        {state.step === 4 && (
          <div>
            <h2>Ready to launch</h2>
            <dl className="signup-summary">
              <dt>Firm</dt>
              <dd>{state.orgName} <code>({state.orgSlug}.starrsoftware.com)</code></dd>
              <dt>Bundles</dt>
              <dd>{state.selectedBundles.map((b) => BUNDLES[b].label).join(' · ')}</dd>
              <dt>Plan</dt>
              <dd>{state.annual ? 'Annual (save 20%)' : 'Monthly'} · {formatBundlePrice(totalMonthly)}/mo</dd>
              <dt>Trial</dt>
              <dd>14 days free · No card required now</dd>
              <dt>Admin</dt>
              <dd>{state.adminName} <code>({state.adminEmail})</code></dd>
            </dl>
            <p className="signup-sub">
              We&apos;ll send a welcome email shortly. After the trial we&apos;ll charge
              your card monthly; cancel any time.
            </p>
            {submitError ? <div className="signup-error">{submitError}</div> : null}
          </div>
        )}
      </section>

      <nav className="signup-nav">
        {state.step > 1 ? (
          <button type="button" className="signup-btn-secondary" onClick={() => setStep((state.step - 1) as Step)} disabled={submitting}>
            ← Back
          </button>
        ) : <span />}
        {state.step < 4 ? (
          <button
            type="button"
            className="signup-btn-primary"
            onClick={() => setStep((state.step + 1) as Step)}
            disabled={!canContinue()}
          >
            Continue →
          </button>
        ) : (
          <button
            type="button"
            className="signup-btn-primary"
            onClick={handleSubmit}
            disabled={submitting}
          >
            {submitting ? 'Creating your firm…' : 'Create my firm'}
          </button>
        )}
      </nav>

      <style jsx>{`
        .signup-page {
          max-width: 700px;
          margin: 0 auto;
          padding: 2rem 1.5rem;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
          color: #0F1419;
        }
        .signup-back {
          color: #6B7280;
          font-size: 0.85rem;
          text-decoration: none;
        }
        .signup-back:hover { color: #1D3095; }
        .signup-header h1 {
          font-family: 'Sora', sans-serif;
          font-size: 1.8rem;
          font-weight: 600;
          margin: 0.5rem 0 1rem;
        }
        .signup-progress {
          display: flex;
          gap: 0.5rem;
          list-style: none;
          padding: 0;
          margin: 0 0 1.5rem;
        }
        .signup-step {
          width: 32px; height: 32px;
          display: flex; align-items: center; justify-content: center;
          background: #E5E7EB; color: #6B7280;
          border-radius: 50%;
          font-weight: 600;
        }
        .signup-step--active { background: #1D3095; color: #FFF; }
        .signup-step--done { background: #059669; color: #FFF; }
        .signup-card {
          background: #FFF;
          border: 1px solid #E5E7EB;
          border-radius: 12px;
          padding: 1.5rem;
          min-height: 320px;
          margin-bottom: 1rem;
        }
        .signup-card h2 {
          font-family: 'Sora', sans-serif;
          font-size: 1.3rem;
          font-weight: 600;
          margin: 0 0 0.5rem;
        }
        .signup-sub { color: #6B7280; margin: 0 0 1.25rem; font-size: 0.92rem; }
        .signup-toggle {
          display: flex; align-items: center; gap: 0.5rem;
          font-size: 0.88rem; margin: 0.5rem 0 1.25rem;
          cursor: pointer;
        }
        .signup-bundles {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
          gap: 0.6rem;
        }
        .signup-bundle {
          display: flex; flex-direction: column;
          gap: 0.35rem;
          padding: 0.85rem 1rem;
          border: 2px solid #E5E7EB;
          border-radius: 8px;
          background: #FFF;
          cursor: pointer;
          text-align: left;
          font-family: inherit;
        }
        .signup-bundle--selected {
          border-color: #1D3095;
          background: #F0F4FF;
        }
        .signup-bundle__label { font-weight: 600; font-size: 0.95rem; }
        .signup-bundle__price { font-family: 'Sora', sans-serif; font-size: 1.1rem; color: #1D3095; }
        .signup-bundle__tagline { font-size: 0.78rem; color: #6B7280; line-height: 1.35; }
        .signup-total {
          margin-top: 1rem; padding: 0.75rem 1rem;
          background: #F0F4FF; border-radius: 8px;
          font-weight: 500; color: #1D3095;
        }
        .signup-field { display: block; margin-bottom: 1rem; }
        .signup-field > span:first-child {
          display: block; font-weight: 600; font-size: 0.85rem;
          margin-bottom: 0.3rem; color: #1F2937;
        }
        .signup-field > span em {
          font-style: normal; font-weight: 400; color: #6B7280;
        }
        .signup-field input {
          width: 100%; padding: 0.55rem 0.8rem;
          border: 1px solid #D1D5DB; border-radius: 6px;
          font-size: 0.92rem; font-family: inherit;
        }
        .signup-field input:focus {
          outline: none; border-color: #1D3095;
          box-shadow: 0 0 0 3px rgba(29, 48, 149, 0.12);
        }
        .signup-slug {
          display: flex; align-items: stretch;
          border: 1px solid #D1D5DB; border-radius: 6px;
          overflow: hidden;
        }
        .signup-slug input { border: 0; box-shadow: none; }
        .signup-slug span {
          padding: 0.55rem 0.6rem;
          background: #F9FAFB;
          color: #6B7280;
          font-size: 0.88rem;
          white-space: nowrap;
        }
        .signup-slug-status {
          display: block; margin-top: 0.4rem;
          font-size: 0.82rem;
        }
        .signup-slug-status--available, .signup-slug-status--new { color: #059669; }
        .signup-slug-status--taken, .signup-slug-status--banned,
        .signup-slug-status--invalid { color: #BD1218; }
        .signup-slug-status--existing { color: #D97706; }
        .signup-slug-status--checking { color: #6B7280; }
        .signup-summary { margin: 0; }
        .signup-summary dt { font-weight: 600; color: #6B7280; font-size: 0.82rem; margin-top: 0.85rem; }
        .signup-summary dd { margin: 0.15rem 0 0; }
        .signup-summary code {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 0.82rem; color: #6B7280;
        }
        .signup-error {
          margin-top: 1rem; padding: 0.85rem 1rem;
          background: #FEE2E2; border: 1px solid #FCA5A5;
          color: #7F1D1D; border-radius: 8px; font-size: 0.88rem;
        }
        .signup-nav {
          display: flex; justify-content: space-between; align-items: center;
          gap: 0.75rem;
        }
        .signup-btn-primary, .signup-btn-secondary {
          padding: 0.7rem 1.4rem; border-radius: 8px;
          font-weight: 600; font-size: 0.92rem;
          font-family: inherit; cursor: pointer; border: 0;
        }
        .signup-btn-primary { background: #1D3095; color: #FFF; }
        .signup-btn-primary:disabled { background: #9CA3AF; cursor: not-allowed; }
        .signup-btn-secondary { background: #FFF; border: 1px solid #D1D5DB; color: #1F2937; }
        .signup-btn-secondary:hover { border-color: #1D3095; color: #1D3095; }
      `}</style>
    </main>
  );
}

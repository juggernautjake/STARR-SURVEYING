'use client';
// app/admin/billing/page.tsx
//
// Customer billing portal — Overview tab. Phase D-2 of
// CUSTOMER_PORTAL.md. Shows subscription state, plan, bundles, trial
// status, seat usage. Links out to Stripe Customer Portal for payment-
// method changes (deferred — needs M-9 + a customer-portal session
// endpoint).
//
// Other tabs (Invoices / Usage / Plan history) ship in follow-up
// slices. Plan-change + add-bundle + cancellation flows depend on the
// /api/admin/billing/change endpoints (next slices).
//
// Spec: docs/planning/in-progress/CUSTOMER_PORTAL.md §3.3.

import Link from 'next/link';
import { useEffect, useState } from 'react';

interface BillingState {
  org: { id: string; slug: string; name: string };
  subscription: {
    status: string;
    bundles: string[];
    seatCount: number;
    baseCents: number;
    perSeatCents: number;
    trialEndsAt: string | null;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
  } | null;
}

const STATUS_COLORS: Record<string, string> = {
  active:     '#059669',
  trialing:   '#1D3095',
  past_due:   '#D97706',
  suspended:  '#9CA3AF',
  canceled:   '#6B7280',
  pending:    '#FCD34D',
};

const BUNDLE_LABELS: Record<string, string> = {
  recon: 'Recon',
  draft: 'Draft',
  office: 'Office',
  field: 'Field',
  academy: 'Academy',
  firm_suite: 'Firm Suite',
};

export default function CustomerBillingPage() {
  const [state, setState] = useState<BillingState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  async function load() {
    try {
      const res = await fetch('/api/admin/billing', { cache: 'no-store' });
      if (!res.ok) {
        setError(`Couldn't load billing (status ${res.status}).`);
        return;
      }
      const data = (await res.json()) as BillingState;
      setState(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load.');
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function openCustomerPortal() {
    setActionMessage(null);
    setWorking(true);
    try {
      const res = await fetch('/api/admin/billing/customer-portal', { method: 'POST' });
      const data = (await res.json()) as { url?: string; message?: string; error?: string };
      if (res.ok && data.url) {
        window.location.href = data.url;
        return;
      }
      setActionMessage(data.message ?? data.error ?? 'Unavailable.');
    } finally {
      setWorking(false);
    }
  }

  async function cancelSubscription() {
    if (state?.subscription?.cancelAtPeriodEnd) {
      if (!confirm('Reactivate this subscription so it does not cancel?')) return;
    } else {
      if (!confirm('Schedule cancellation at the end of the current billing period? You keep full access until then.')) return;
    }
    setActionMessage(null);
    setWorking(true);
    try {
      const res = await fetch('/api/admin/billing/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reactivate: state?.subscription?.cancelAtPeriodEnd === true }),
      });
      if (res.ok) {
        await load();
        setActionMessage(state?.subscription?.cancelAtPeriodEnd
          ? 'Subscription reactivated.'
          : 'Cancellation scheduled. You retain access until the end of the current period.');
      } else {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setActionMessage(data.error ?? `Failed (status ${res.status}).`);
      }
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="billing-page">
      <header>
        <h1>Billing</h1>
        {state ? <p>{state.org.name}</p> : null}
        <nav className="billing-tabs">
          <span className="billing-tab billing-tab--active">Overview</span>
          <Link href="/admin/billing/invoices" className="billing-tab">Invoices</Link>
        </nav>
      </header>

      {error ? (
        <div className="billing-error">{error}</div>
      ) : !state ? (
        <div className="billing-loading">Loading…</div>
      ) : !state.subscription ? (
        <div className="billing-empty">
          <p>No subscription on file yet.</p>
          <Link href="/pricing" className="billing-btn billing-btn--primary">
            Choose a plan →
          </Link>
        </div>
      ) : (
        <>
          <section className="billing-status">
            <div className="billing-row">
              <div className="billing-cell">
                <span className="billing-label">Status</span>
                <strong style={{ color: STATUS_COLORS[state.subscription.status] ?? '#6B7280' }}>
                  {state.subscription.status}
                </strong>
              </div>
              <div className="billing-cell">
                <span className="billing-label">Monthly price</span>
                <strong>
                  ${((state.subscription.baseCents + state.subscription.perSeatCents * Math.max(0, state.subscription.seatCount - 5)) / 100).toFixed(2)}
                </strong>
              </div>
              <div className="billing-cell">
                <span className="billing-label">Seats</span>
                <strong>{state.subscription.seatCount}</strong>
              </div>
              {state.subscription.trialEndsAt ? (
                <div className="billing-cell">
                  <span className="billing-label">Trial ends</span>
                  <strong>
                    {new Date(state.subscription.trialEndsAt).toLocaleDateString()}
                  </strong>
                </div>
              ) : null}
              {state.subscription.currentPeriodEnd ? (
                <div className="billing-cell">
                  <span className="billing-label">Next renewal</span>
                  <strong>
                    {new Date(state.subscription.currentPeriodEnd).toLocaleDateString()}
                  </strong>
                </div>
              ) : null}
            </div>
            {state.subscription.cancelAtPeriodEnd ? (
              <div className="billing-banner billing-banner--warning">
                ⚠ Your subscription is set to cancel at the end of this period
                ({state.subscription.currentPeriodEnd
                  ? new Date(state.subscription.currentPeriodEnd).toLocaleDateString()
                  : 'end of period'}).
                You&apos;ll keep full access until then. To reactivate, contact support.
              </div>
            ) : null}
          </section>

          <section className="billing-bundles">
            <h2>Active bundles</h2>
            {state.subscription.bundles.length > 0 ? (
              <ul>
                {state.subscription.bundles.map((b) => (
                  <li key={b}>
                    <span className="billing-bundle-name">{BUNDLE_LABELS[b] ?? b}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="billing-empty-inline">No bundles active. Visit /pricing to add one.</p>
            )}
          </section>

          <section className="billing-actions">
            <h2>Manage</h2>
            <div className="billing-actions-grid">
              <button className="billing-action" disabled>
                <span>Change plan</span>
                <em>Ships with the /api/admin/billing/change endpoint (D-2 follow-up)</em>
              </button>
              <button
                className="billing-action billing-action--enabled"
                disabled={working}
                onClick={openCustomerPortal}
                type="button"
              >
                <span>Update payment method →</span>
                <em>Opens the Stripe Customer Portal in a new tab.</em>
              </button>
              <button
                className="billing-action billing-action--enabled"
                disabled={working}
                onClick={cancelSubscription}
                type="button"
              >
                <span>{state.subscription.cancelAtPeriodEnd ? 'Reactivate subscription' : 'Cancel subscription'}</span>
                <em>
                  {state.subscription.cancelAtPeriodEnd
                    ? 'Keep your subscription active beyond the current period.'
                    : 'Keeps full access until the end of the current period.'}
                </em>
              </button>
              <Link href="/admin/support/new" className="billing-action billing-action--enabled">
                <span>Contact support →</span>
                <em>Need help? File a ticket and we&apos;ll respond fast.</em>
              </Link>
            </div>
            {actionMessage && (
              <div className="billing-action-message">{actionMessage}</div>
            )}
          </section>
        </>
      )}

      <style jsx>{`
        .billing-page {
          max-width: 880px;
          margin: 0 auto;
          padding: 1.5rem;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
          color: #0F1419;
        }
        header { margin-bottom: 1.5rem; }
        header h1 {
          font-family: 'Sora', sans-serif;
          font-size: 1.8rem;
          font-weight: 600;
          margin: 0 0 0.25rem;
        }
        header p { color: #6B7280; margin: 0 0 0.85rem; }
        .billing-tabs {
          display: flex;
          gap: 0.85rem;
          border-bottom: 1px solid #E5E7EB;
        }
        .billing-tab {
          padding: 0.45rem 0;
          font-size: 0.88rem;
          font-weight: 500;
          color: #6B7280;
          text-decoration: none;
          border-bottom: 2px solid transparent;
        }
        .billing-tab:hover { color: #1D3095; }
        .billing-tab--active {
          color: #1D3095;
          border-bottom-color: #1D3095;
        }
        .billing-error, .billing-loading, .billing-empty {
          padding: 2rem;
          text-align: center;
          color: #6B7280;
          background: #F9FAFB;
          border: 1px solid #E5E7EB;
          border-radius: 12px;
        }
        .billing-empty p:first-child { color: #1F2937; font-weight: 600; margin-bottom: 0.85rem; }
        .billing-status {
          background: #FFF;
          border: 1px solid #E5E7EB;
          border-radius: 12px;
          padding: 1.25rem 1.5rem;
          margin-bottom: 1.5rem;
        }
        .billing-row {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
          gap: 1.25rem;
        }
        .billing-cell { display: flex; flex-direction: column; gap: 0.2rem; }
        .billing-label {
          font-size: 0.72rem;
          color: #6B7280;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
        .billing-cell strong { font-family: 'Sora', sans-serif; font-size: 1.1rem; }
        .billing-banner {
          margin-top: 1rem;
          padding: 0.75rem 1rem;
          border-radius: 8px;
          font-size: 0.88rem;
        }
        .billing-banner--warning {
          background: #FEF3C7;
          border: 1px solid #F59E0B;
          color: #78350F;
        }
        .billing-bundles, .billing-actions {
          background: #FFF;
          border: 1px solid #E5E7EB;
          border-radius: 12px;
          padding: 1.25rem 1.5rem;
          margin-bottom: 1.5rem;
        }
        .billing-bundles h2, .billing-actions h2 {
          font-family: 'Sora', sans-serif;
          font-size: 1rem;
          font-weight: 600;
          margin: 0 0 0.85rem;
        }
        .billing-bundles ul {
          list-style: none;
          padding: 0;
          margin: 0;
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
        }
        .billing-bundles li {
          background: #F0F4FF;
          color: #1D3095;
          padding: 0.45rem 0.95rem;
          border-radius: 6px;
          font-weight: 500;
        }
        .billing-empty-inline { color: #6B7280; font-size: 0.88rem; }
        .billing-actions-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
          gap: 0.6rem;
        }
        .billing-action {
          display: flex; flex-direction: column; gap: 0.3rem;
          padding: 0.85rem 1rem;
          background: #F9FAFB;
          border: 1px solid #E5E7EB;
          border-radius: 8px;
          text-align: left;
          font-family: inherit;
          color: #6B7280;
          cursor: not-allowed;
          text-decoration: none;
        }
        .billing-action span { font-weight: 600; color: #4B5563; }
        .billing-action em {
          font-size: 0.78rem;
          font-style: normal;
          color: #9CA3AF;
        }
        .billing-action--enabled {
          background: #FFF;
          color: #1D3095;
          cursor: pointer;
        }
        .billing-action--enabled span { color: #1D3095; }
        .billing-action--enabled:hover { background: #F0F4FF; }
        .billing-action--enabled[disabled] { opacity: 0.6; cursor: progress; }
        .billing-action-message {
          margin-top: 0.85rem;
          padding: 0.7rem 0.9rem;
          background: #F0F4FF;
          border: 1px solid #C7D2FE;
          border-radius: 8px;
          font-size: 0.88rem;
          color: #1F2937;
        }
        .billing-btn {
          display: inline-flex;
          padding: 0.7rem 1.4rem;
          border-radius: 8px;
          text-decoration: none;
          font-weight: 600;
        }
        .billing-btn--primary { background: #1D3095; color: #FFF; }
      `}</style>
    </div>
  );
}

'use client';
// app/admin/billing/page.tsx
//
// Customer billing portal. Phase D-2 of CUSTOMER_PORTAL.md.
//
// billing-real-tabs-2026-06-21 — refactored from the original layout
// where the three "tabs" were just <Link>s that navigated to separate
// pages (so clicking a tab caused a hard route change, breadcrumb
// flash, and reload of the data). The tabs are now real in-place
// tabs: clicking Overview / Invoices / Plan history swaps the panel
// content without navigating away. Standalone /admin/billing/invoices
// and /admin/billing/plan-history routes still exist for direct
// links / bookmarks; their data fetchers are now reused here so we
// don't duplicate the network logic.
//
// Spec: docs/planning/in-progress/CUSTOMER_PORTAL.md §3.3.

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';

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

interface Invoice {
  id: string;
  stripeInvoiceId: string;
  number: string | null;
  status: string;
  amountDueCents: number;
  amountPaidCents: number;
  amountRefundedCents: number;
  currency: string;
  periodStart: string | null;
  periodEnd: string | null;
  hostedUrl: string | null;
  pdfUrl: string | null;
  createdAt: string;
}

interface PlanEvent {
  id: string;
  eventType: string;
  triggeredBy: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

const STATUS_COLORS: Record<string, string> = {
  active:     '#059669',
  trialing:   'var(--color-brand-navy)',
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

const INVOICE_STATUS_COLORS: Record<string, string> = {
  paid:          '#059669',
  open:          'var(--color-brand-navy)',
  draft:         '#6B7280',
  void:          '#9CA3AF',
  uncollectible: 'var(--color-brand-red)',
};

const EVENT_LABELS: Record<string, string> = {
  trial_started:          'Trial started',
  trial_converted:        'Trial converted to paid',
  schedule_cancel:        'Cancellation scheduled',
  reactivate_canceled:    'Subscription reactivated',
  bundle_added:           'Bundle added',
  bundle_removed:         'Bundle removed',
  seat_count_changed:     'Seat count changed',
  plan_changed:           'Plan changed',
  payment_succeeded:      'Payment succeeded',
  payment_failed:         'Payment failed',
};

const EVENT_COLORS: Record<string, string> = {
  trial_started:          'var(--color-brand-navy)',
  trial_converted:        '#059669',
  schedule_cancel:        '#D97706',
  reactivate_canceled:    '#059669',
  bundle_added:           '#059669',
  bundle_removed:         '#6B7280',
  plan_changed:           'var(--color-brand-navy)',
  payment_succeeded:      '#059669',
  payment_failed:         'var(--color-brand-red)',
};

type Tab = 'overview' | 'invoices' | 'history';

const TABS: { key: Tab; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'invoices', label: 'Invoices' },
  { key: 'history',  label: 'Plan history' },
];

function fmtMoney(cents: number, ccy: string): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: ccy.toUpperCase() })
    .format(cents / 100);
}

export default function CustomerBillingPage() {
  const [tab, setTab] = useState<Tab>('overview');

  const [state, setState] = useState<BillingState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  // Lazy-loaded panel data — each tab only fetches when first opened.
  const [invoices, setInvoices] = useState<Invoice[] | null>(null);
  const [invoicesError, setInvoicesError] = useState<string | null>(null);
  const [events, setEvents] = useState<PlanEvent[] | null>(null);
  const [eventsError, setEventsError] = useState<string | null>(null);
  const [expandedEvent, setExpandedEvent] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
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
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (tab !== 'invoices' || invoices !== null) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/admin/billing/invoices', { cache: 'no-store' });
        if (!res.ok) {
          if (!cancelled) setInvoicesError(`Couldn't load invoices (status ${res.status}).`);
          return;
        }
        const data = (await res.json()) as { invoices: Invoice[] };
        if (!cancelled) setInvoices(data.invoices ?? []);
      } catch (err) {
        if (!cancelled) setInvoicesError(err instanceof Error ? err.message : 'Failed to load.');
      }
    })();
    return () => { cancelled = true; };
  }, [tab, invoices]);

  useEffect(() => {
    if (tab !== 'history' || events !== null) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/admin/billing/plan-history', { cache: 'no-store' });
        if (!res.ok) {
          if (!cancelled) setEventsError(`Couldn't load history (status ${res.status}).`);
          return;
        }
        const data = (await res.json()) as { events: PlanEvent[] };
        if (!cancelled) setEvents(data.events ?? []);
      } catch (err) {
        if (!cancelled) setEventsError(err instanceof Error ? err.message : 'Failed to load.');
      }
    })();
    return () => { cancelled = true; };
  }, [tab, events]);

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

  function toggleEvent(id: string) {
    setExpandedEvent((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  return (
    <div className="billing-page">
      <header className="billing-header">
        <h1>Billing</h1>
        {state?.org ? <p>{state.org.name}</p> : null}
      </header>

      {/* billing-real-tabs-2026-06-21 — real tabs (role="tablist" /
       * role="tab" / role="tabpanel"). aria-selected + keyboard arrow
       * navigation built-in. The active panel renders in the box
       * below; switching tabs swaps the panel without navigating. */}
      <div className="billing-tabs" role="tablist" aria-label="Billing sections">
        {TABS.map((t, i) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            id={`billing-tab-${t.key}`}
            aria-selected={tab === t.key}
            aria-controls={`billing-panel-${t.key}`}
            tabIndex={tab === t.key ? 0 : -1}
            className={`billing-tab ${tab === t.key ? 'billing-tab--active' : ''}`}
            onClick={() => setTab(t.key)}
            onKeyDown={(e) => {
              if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
              e.preventDefault();
              const dir = e.key === 'ArrowRight' ? 1 : -1;
              const next = TABS[(i + dir + TABS.length) % TABS.length];
              setTab(next.key);
              const el = document.getElementById(`billing-tab-${next.key}`);
              el?.focus();
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error ? (
        <div className="billing-error">{error}</div>
      ) : !state ? (
        <div className="billing-loading">Loading…</div>
      ) : (
        <>
          {/* ── OVERVIEW ─────────────────────────────────────────── */}
          {tab === 'overview' && (
            <div
              role="tabpanel"
              id="billing-panel-overview"
              aria-labelledby="billing-tab-overview"
              className="billing-panel"
            >
              {!state.subscription ? (
                <div className="billing-empty">
                  <p>No subscription on file yet.</p>
                  <Link href="/pricing" className="billing-btn billing-btn--primary">
                    Choose a plan →
                  </Link>
                </div>
              ) : (
                <>
                  <section className="billing-card billing-status">
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
                          <strong>{new Date(state.subscription.trialEndsAt).toLocaleDateString()}</strong>
                        </div>
                      ) : null}
                      {state.subscription.currentPeriodEnd ? (
                        <div className="billing-cell">
                          <span className="billing-label">Next renewal</span>
                          <strong>{new Date(state.subscription.currentPeriodEnd).toLocaleDateString()}</strong>
                        </div>
                      ) : null}
                    </div>
                    {state.subscription.cancelAtPeriodEnd ? (
                      <div className="billing-banner billing-banner--warning">
                        <AlertTriangle size={14} style={{ verticalAlign: "-2px", marginRight: "0.3rem" }} />Your subscription is set to cancel at the end of this period
                        ({state.subscription.currentPeriodEnd
                          ? new Date(state.subscription.currentPeriodEnd).toLocaleDateString()
                          : 'end of period'}).
                        You&apos;ll keep full access until then. To reactivate, contact support.
                      </div>
                    ) : null}
                  </section>

                  <section className="billing-card billing-bundles">
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

                  <section className="billing-card billing-actions">
                    <h2>Manage</h2>
                    <div className="billing-actions-grid">
                      <button className="billing-action" disabled type="button">
                        <span>Change plan</span>
                        <em>Ships with the /api/admin/billing/change endpoint (D-2 follow-up).</em>
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
            </div>
          )}

          {/* ── INVOICES ─────────────────────────────────────────── */}
          {tab === 'invoices' && (
            <div
              role="tabpanel"
              id="billing-panel-invoices"
              aria-labelledby="billing-tab-invoices"
              className="billing-panel"
            >
              <section className="billing-card">
                <h2>Invoices</h2>
                <p className="billing-sub">Every invoice for your subscription. Stripe-hosted; click an entry for the full PDF.</p>
                {invoicesError ? (
                  <div className="billing-empty">{invoicesError}</div>
                ) : !invoices ? (
                  <div className="billing-empty">Loading invoices…</div>
                ) : invoices.length === 0 ? (
                  <div className="billing-empty">
                    <p>No invoices yet.</p>
                    <p>Invoices appear here after your first paid billing cycle.</p>
                  </div>
                ) : (
                  <div className="billing-table-wrap">
                    <table className="billing-table">
                      <thead>
                        <tr>
                          <th>Number</th>
                          <th>Date</th>
                          <th>Period</th>
                          <th>Status</th>
                          <th>Amount</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {invoices.map((inv) => (
                          <tr key={inv.id}>
                            <td><code>{inv.number ?? inv.stripeInvoiceId.slice(0, 12) + '…'}</code></td>
                            <td>{new Date(inv.createdAt).toLocaleDateString()}</td>
                            <td>
                              {inv.periodStart && inv.periodEnd
                                ? `${new Date(inv.periodStart).toLocaleDateString()} → ${new Date(inv.periodEnd).toLocaleDateString()}`
                                : '—'}
                            </td>
                            <td>
                              <span style={{ color: INVOICE_STATUS_COLORS[inv.status] ?? '#6B7280', fontWeight: 600 }}>
                                {inv.status}
                              </span>
                            </td>
                            <td>
                              {fmtMoney(inv.amountDueCents, inv.currency)}
                              {inv.amountRefundedCents > 0 ? (
                                <em style={{ color: 'var(--color-brand-red)', fontSize: '0.78rem', marginLeft: '0.4rem' }}>
                                  (− {fmtMoney(inv.amountRefundedCents, inv.currency)})
                                </em>
                              ) : null}
                            </td>
                            <td>
                              {inv.pdfUrl ? (
                                <a href={inv.pdfUrl} target="_blank" rel="noopener noreferrer">PDF ↗</a>
                              ) : inv.hostedUrl ? (
                                <a href={inv.hostedUrl} target="_blank" rel="noopener noreferrer">View ↗</a>
                              ) : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </div>
          )}

          {/* ── PLAN HISTORY ─────────────────────────────────────── */}
          {tab === 'history' && (
            <div
              role="tabpanel"
              id="billing-panel-history"
              aria-labelledby="billing-tab-history"
              className="billing-panel"
            >
              <section className="billing-card">
                <h2>Plan history</h2>
                <p className="billing-sub">Every change to your subscription. Driven by the subscription_events ledger.</p>
                {eventsError ? (
                  <div className="billing-empty">{eventsError}</div>
                ) : !events ? (
                  <div className="billing-empty">Loading history…</div>
                ) : events.length === 0 ? (
                  <div className="billing-empty">
                    <p>No plan changes yet.</p>
                    <p>This list grows over time as you change plans, add bundles, or update seats.</p>
                  </div>
                ) : (
                  <ul className="billing-history-list">
                    {events.map((ev) => {
                      const hasMetadata = Object.keys(ev.metadata).length > 0;
                      const isOpen = expandedEvent.has(ev.id);
                      return (
                        <li key={ev.id} className="billing-history-item">
                          <button
                            type="button"
                            className="billing-history-item-header"
                            onClick={() => hasMetadata && toggleEvent(ev.id)}
                            aria-expanded={hasMetadata ? isOpen : undefined}
                            disabled={!hasMetadata}
                          >
                            <span>
                              <span
                                className="billing-history-pill"
                                style={{ background: EVENT_COLORS[ev.eventType] ?? '#6B7280' }}
                              >
                                {EVENT_LABELS[ev.eventType] ?? ev.eventType}
                              </span>
                              {ev.triggeredBy && (
                                <span className="billing-history-by">
                                  by {ev.triggeredBy.replace(/^(customer|operator):/, '')}
                                </span>
                              )}
                            </span>
                            <span className="billing-history-time">{new Date(ev.createdAt).toLocaleString()}</span>
                          </button>
                          {hasMetadata && isOpen && (
                            <pre className="billing-history-meta">{JSON.stringify(ev.metadata, null, 2)}</pre>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            </div>
          )}
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
        .billing-header { margin-bottom: 1.25rem; }
        .billing-header h1 {
          font-family: 'Sora', sans-serif;
          font-size: 1.8rem;
          font-weight: 600;
          margin: 0 0 0.25rem;
        }
        .billing-header p { color: #6B7280; margin: 0; font-size: 0.92rem; }

        /* Tab bar */
        .billing-tabs {
          display: flex;
          gap: 0;
          border-bottom: 1px solid #E5E7EB;
          margin-bottom: 1.25rem;
        }
        .billing-tab {
          appearance: none;
          background: none;
          border: 0;
          border-bottom: 2px solid transparent;
          padding: 0.65rem 1rem;
          margin-bottom: -1px;
          font-family: inherit;
          font-size: 0.9rem;
          font-weight: 500;
          color: #6B7280;
          cursor: pointer;
          transition: color 0.15s, border-color 0.15s;
        }
        .billing-tab:hover { color: var(--color-brand-navy); }
        .billing-tab:focus-visible {
          outline: 2px solid var(--color-brand-navy);
          outline-offset: -2px;
          border-radius: 2px;
        }
        .billing-tab--active {
          color: var(--color-brand-navy);
          border-bottom-color: var(--color-brand-navy);
          font-weight: 600;
        }

        /* Panel containers */
        .billing-panel {
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
        }
        .billing-error, .billing-loading {
          padding: 2rem;
          text-align: center;
          color: #6B7280;
          background: #F9FAFB;
          border: 1px solid #E5E7EB;
          border-radius: 12px;
        }
        .billing-empty {
          padding: 2rem;
          text-align: center;
          color: #6B7280;
        }
        .billing-empty p:first-child { color: #1F2937; font-weight: 600; margin: 0 0 0.5rem; }
        .billing-empty p { margin: 0; }

        /* Reusable card */
        .billing-card {
          background: #FFF;
          border: 1px solid #E5E7EB;
          border-radius: 12px;
          padding: 1.25rem 1.5rem;
        }
        .billing-card h2 {
          font-family: 'Sora', sans-serif;
          font-size: 1rem;
          font-weight: 600;
          margin: 0 0 0.35rem;
        }
        .billing-sub {
          color: #6B7280;
          font-size: 0.88rem;
          margin: 0 0 1rem;
        }

        /* Overview status row */
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

        /* Bundles */
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
          color: var(--color-brand-navy);
          padding: 0.45rem 0.95rem;
          border-radius: 6px;
          font-weight: 500;
        }
        .billing-empty-inline { color: #6B7280; font-size: 0.88rem; }

        /* Actions */
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
          color: var(--color-brand-navy);
          cursor: pointer;
        }
        .billing-action--enabled span { color: var(--color-brand-navy); }
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
        .billing-btn--primary { background: var(--color-brand-navy); color: #FFF; }

        /* Invoices table */
        .billing-table-wrap {
          overflow-x: auto;
          border: 1px solid #E5E7EB;
          border-radius: 10px;
        }
        .billing-table {
          width: 100%;
          border-collapse: separate;
          border-spacing: 0;
        }
        .billing-table th, .billing-table td {
          padding: 0.65rem 0.95rem;
          font-size: 0.88rem;
          text-align: left;
          border-bottom: 1px solid #F3F4F6;
        }
        .billing-table th {
          background: #F9FAFB;
          font-weight: 600;
          color: #4B5563;
          font-size: 0.78rem;
        }
        .billing-table tr:last-child td { border-bottom: 0; }
        .billing-table code {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 0.82rem;
          color: #4B5563;
        }
        .billing-table a {
          color: var(--color-brand-navy);
          text-decoration: none;
          font-size: 0.85rem;
        }
        .billing-table a:hover { text-decoration: underline; }

        /* History list */
        .billing-history-list {
          list-style: none;
          margin: 0;
          padding: 0;
          background: #FFF;
          border: 1px solid #E5E7EB;
          border-radius: 10px;
          overflow: hidden;
        }
        .billing-history-item + .billing-history-item { border-top: 1px solid #F3F4F6; }
        .billing-history-item-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          width: 100%;
          padding: 0.75rem 1rem;
          gap: 0.5rem;
          background: none;
          border: 0;
          font-family: inherit;
          text-align: left;
          cursor: pointer;
        }
        .billing-history-item-header:disabled { cursor: default; }
        .billing-history-item-header:hover:not(:disabled) { background: #F9FAFB; }
        .billing-history-pill {
          display: inline-block;
          padding: 0.2rem 0.55rem;
          border-radius: 999px;
          color: #FFF;
          font-size: 0.78rem;
          font-weight: 600;
        }
        .billing-history-by {
          font-size: 0.78rem;
          color: #6B7280;
          margin-left: 0.55rem;
        }
        .billing-history-time {
          font-size: 0.78rem;
          color: #6B7280;
          font-family: 'JetBrains Mono', ui-monospace, monospace;
        }
        .billing-history-meta {
          margin: 0;
          padding: 0.6rem 1rem 0.85rem 1rem;
          background: #F9FAFB;
          font-size: 0.78rem;
          color: #374151;
          overflow-x: auto;
        }
      `}</style>
    </div>
  );
}

'use client';
// app/admin/billing/plan-history/page.tsx
//
// Plan history tab for the customer billing portal. Renders every
// `subscription_events` row scoped to the caller's org — plan
// changes, bundle additions/removals, cancellations, reactivations,
// trial conversions. Source of truth for "what happened to my
// subscription" questions.
//
// Phase D-2 of CUSTOMER_PORTAL.md.

import Link from 'next/link';
import { useEffect, useState } from 'react';

interface Event {
  id: string;
  eventType: string;
  triggeredBy: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

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
  trial_started:          '#1D3095',
  trial_converted:        '#059669',
  schedule_cancel:        '#D97706',
  reactivate_canceled:    '#059669',
  bundle_added:           '#059669',
  bundle_removed:         '#6B7280',
  plan_changed:           '#1D3095',
  payment_succeeded:      '#059669',
  payment_failed:         '#BD1218',
};

export default function PlanHistoryPage() {
  const [events, setEvents] = useState<Event[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/admin/billing/plan-history', { cache: 'no-store' });
        if (!res.ok) {
          setError(`Couldn't load history (status ${res.status}).`);
          return;
        }
        const data = (await res.json()) as { events: Event[] };
        if (!cancelled) setEvents(data.events ?? []);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load.');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  function toggle(id: string) {
    setExpanded((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  return (
    <div className="history-page">
      <Link href="/admin/billing" className="history-back">← Back to billing</Link>
      <header>
        <h1>Plan history</h1>
        <p>Every change to your subscription. Driven by the subscription_events ledger.</p>
      </header>

      {error ? (
        <div className="history-error">{error}</div>
      ) : !events ? (
        <div className="history-loading">Loading…</div>
      ) : events.length === 0 ? (
        <div className="history-empty">
          <p>No plan changes yet.</p>
          <p>This list grows over time as you change plans, add bundles, or update seats.</p>
        </div>
      ) : (
        <ul className="history-list">
          {events.map((ev) => {
            const hasMetadata = Object.keys(ev.metadata).length > 0;
            const isOpen = expanded.has(ev.id);
            return (
              <li key={ev.id} className="history-item">
                <div className="history-item-header" onClick={() => hasMetadata && toggle(ev.id)}>
                  <div>
                    <span
                      className="history-pill"
                      style={{ background: EVENT_COLORS[ev.eventType] ?? '#6B7280' }}
                    >
                      {EVENT_LABELS[ev.eventType] ?? ev.eventType}
                    </span>
                    {ev.triggeredBy && (
                      <span className="history-by">by {ev.triggeredBy.replace(/^(customer|operator):/, '')}</span>
                    )}
                  </div>
                  <div className="history-time">{new Date(ev.createdAt).toLocaleString()}</div>
                </div>
                {hasMetadata && isOpen && (
                  <pre className="history-meta">{JSON.stringify(ev.metadata, null, 2)}</pre>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <style jsx>{`
        .history-page {
          max-width: 900px;
          margin: 0 auto;
          padding: 1.5rem;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
          color: #0F1419;
        }
        .history-back {
          font-size: 0.85rem;
          color: #1D3095;
          text-decoration: none;
        }
        header { margin: 0.4rem 0 1.5rem; }
        header h1 {
          font-family: 'Sora', sans-serif;
          font-size: 1.8rem;
          margin: 0 0 0.2rem;
        }
        header p {
          color: #6B7280;
          margin: 0;
        }
        .history-list {
          list-style: none;
          margin: 0;
          padding: 0;
          background: #FFF;
          border: 1px solid #E5E7EB;
          border-radius: 10px;
          overflow: hidden;
        }
        .history-item + .history-item { border-top: 1px solid #F3F4F6; }
        .history-item-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0.75rem 1rem;
          gap: 0.5rem;
          cursor: default;
        }
        .history-pill {
          display: inline-block;
          padding: 0.2rem 0.55rem;
          border-radius: 999px;
          color: #FFF;
          font-size: 0.78rem;
          font-weight: 600;
        }
        .history-by {
          font-size: 0.78rem;
          color: #6B7280;
          margin-left: 0.55rem;
        }
        .history-time {
          font-size: 0.78rem;
          color: #6B7280;
          font-family: 'JetBrains Mono', ui-monospace, monospace;
        }
        .history-meta {
          margin: 0;
          padding: 0.6rem 1rem 0.85rem 1rem;
          background: #F9FAFB;
          font-size: 0.78rem;
          color: #374151;
          overflow-x: auto;
        }
        .history-empty, .history-loading, .history-error {
          background: #FFF;
          border: 1px solid #E5E7EB;
          border-radius: 10px;
          padding: 2rem;
          text-align: center;
          color: #6B7280;
        }
      `}</style>
    </div>
  );
}

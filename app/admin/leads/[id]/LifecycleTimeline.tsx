'use client';
// LifecycleTimeline — first click → every milestone → dollars, on one vertical line. A12.
//
// The owner's ask was to *track exactly what is happening with each lead*, and this is the screen that
// answers it. Everything else in this plan feeds a dashboard; this is the one someone opens when they
// want to know about a particular job.
//
// ── THE FIRST CLICK IS PART OF THE TIMELINE, NOT METADATA ──────────────────────────────────────────
//
// The ad click is the first thing that happened. Rendering it as a field somewhere above the list breaks
// the story in half: "they clicked a Boundary Survey ad on the 3rd, called on the 5th, we quoted on the
// 9th" is one sentence, and it should read as one.
//
// ── GAPS ARE SHOWN, BECAUSE THE GAPS ARE THE PROBLEM ───────────────────────────────────────────────
//
// A lead that sat eleven days between "contacted" and "quoted" is the thing worth seeing. Timestamps
// alone make you do the arithmetic; nobody does the arithmetic.
import { useEffect, useState } from 'react';

interface TimelineEvent {
  id: string;
  milestone: string;
  label: string;
  occurred_at: string;
  value_cents: number | null;
  actor: string | null;
  /** Days since the previous entry. Null on the first. */
  gapDays: number | null;
  /** True for the synthetic first-click entry, which is not a lifecycle event. */
  isClick?: boolean;
  detail?: string | null;
}

interface Props { leadId: string }

const money = (cents: number): string =>
  `$${(cents / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

const GLYPH: Record<string, string> = {
  click: '◎',
  inquiry_received: '✉',
  contacted: '☎',
  quoted: '§',
  quote_accepted: '✓',
  job_created: '★',
  research_started: '⌕',
  fieldwork_complete: '⚑',
  deliverables_sent: '⇪',
  payment_received: '$',
  lost: '✕',
};

export default function LifecycleTimeline({ leadId }: Props): React.ReactElement {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/admin/leads/${leadId}/timeline`);
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
        const json = await res.json() as { events: TimelineEvent[] };
        if (!cancelled) setEvents(json.events);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load the timeline.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [leadId]);

  return (
    <div className="lt">
      <h3 className="lt__title">Life cycle</h3>
      {loading ? <p className="lt__muted">Loading…</p>
        : error ? <p className="lt__error" role="alert">{error}</p>
        : events.length === 0 ? (
          <p className="lt__muted">
            Nothing recorded yet. Milestones appear here as the lead moves — they are written by the same
            code that drives the marketing numbers, so this list and those figures can never disagree.
          </p>
        ) : (
          <ol className="lt__list" data-testid="lead-timeline">
            {events.map((e) => (
              <li key={e.id} className={`lt__item${e.isClick ? ' lt__item--click' : ''}`}>
                <span className="lt__glyph" aria-hidden="true">{GLYPH[e.isClick ? 'click' : e.milestone] ?? '•'}</span>
                <div className="lt__body">
                  <div className="lt__head">
                    <strong>{e.label}</strong>
                    {typeof e.value_cents === 'number' && e.value_cents > 0 && (
                      <span className="lt__money">{money(e.value_cents)}</span>
                    )}
                  </div>
                  <div className="lt__meta">
                    {new Date(e.occurred_at).toLocaleString()}
                    {/* The gap, not just the date — nobody does the arithmetic themselves. */}
                    {e.gapDays !== null && e.gapDays >= 1 && (
                      <span className="lt__gap"> · {e.gapDays.toFixed(0)} day{e.gapDays >= 2 ? 's' : ''} later</span>
                    )}
                    {e.actor && <span className="lt__actor"> · {e.actor}</span>}
                  </div>
                  {e.detail && <div className="lt__detail">{e.detail}</div>}
                </div>
              </li>
            ))}
          </ol>
        )}

      <style jsx>{`
        .lt { padding: 14px 16px; border: 1px solid #e5e7eb; border-radius: 10px; background: #fff; }
        .lt__title { font-size: 1rem; margin: 0 0 10px; font-weight: 600; }
        .lt__muted { color: #6b7280; font-size: 0.86rem; margin: 0; }
        .lt__error { color: #991b1b; font-size: 0.86rem; }
        .lt__list { list-style: none; margin: 0; padding: 0; position: relative; }
        .lt__list::before { content: ''; position: absolute; left: 11px; top: 8px; bottom: 8px; width: 2px; background: #e5e7eb; }
        .lt__item { position: relative; display: flex; gap: 12px; padding: 7px 0; }
        .lt__glyph { position: relative; z-index: 1; flex: 0 0 24px; width: 24px; height: 24px; border-radius: 50%;
          background: #eef2ff; color: #3730a3; display: inline-flex; align-items: center; justify-content: center;
          font-size: 0.8rem; border: 2px solid #fff; }
        .lt__item--click .lt__glyph { background: #dcfce7; color: #14532d; }
        .lt__body { min-width: 0; flex: 1; }
        .lt__head { display: flex; gap: 10px; align-items: baseline; flex-wrap: wrap; }
        .lt__money { font-weight: 700; color: #065f46; font-size: 0.9rem; }
        .lt__meta { color: #6b7280; font-size: 0.78rem; }
        .lt__gap { color: #92400e; }
        .lt__actor { color: #6b7280; }
        .lt__detail { color: #4b5563; font-size: 0.82rem; margin-top: 2px; word-break: break-word; }
      `}</style>
    </div>
  );
}

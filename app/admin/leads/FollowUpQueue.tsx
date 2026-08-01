'use client';
// app/admin/leads/FollowUpQueue.tsx — the calls nobody has made (D1-2).
//
// *"A lead that nobody rings is the cheapest lost revenue in the business."* The date was already stored
// and already shown on the lead's own detail page. What was missing is the only view that turns it into
// work: all of them, in one place, on the board the office opens anyway.
//
// ── OVERDUE AND DUE-TODAY ARE SEPARATED, DELIBERATELY ──────────────────────────────────────────────
//
// Yesterday's call is a mistake and today's is a plan. Merged, the list is red every morning before
// anyone has done anything wrong — and the honest response to a list that is always red is to stop
// reading it. That failure mode has already cost this codebase one control (C1-2's reconciliation
// report is worded the way it is for the same reason).
import { useEffect, useState } from 'react';
import Link from 'next/link';

interface Row {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  quoteAmount: number | null;
  due: 'overdue' | 'today' | 'upcoming';
  daysOut: number;
  note: string;
  attribution: { label: string; detail: string | null; paid: boolean };
}

const money = (cents: number | null) => (cents ? `$${Number(cents).toLocaleString()}` : '');

export default function FollowUpQueue(): React.ReactElement | null {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [summary, setSummary] = useState<{ overdue: number; today: number; upcoming: number } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    fetch('/api/admin/leads/follow-ups')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j) => { if (live) { setRows(j.followUps ?? []); setSummary(j.summary ?? null); } })
      // Shown, not swallowed: a chaser that renders nothing when its request fails looks exactly like
      // "no calls due", which is the one wrong answer it must never give.
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, []);

  if (failed) {
    return (
      <section className="lead-followups" data-testid="follow-ups-error">
        <p role="alert">
          Could not load the follow-up queue. This is not saying there are no calls due — it is saying it
          could not look.
        </p>
      </section>
    );
  }

  if (!rows || rows.length === 0) return null;

  const group = (due: Row['due']) => rows.filter((r) => r.due === due);

  return (
    <section className="lead-followups" data-testid="follow-ups">
      <h2 style={{ margin: '0 0 4px', fontSize: 16 }}>
        Follow-ups{' '}
        {summary && (
          <span style={{ fontWeight: 400, fontSize: 13, color: 'var(--color-text-muted)' }}>
            {summary.overdue} overdue · {summary.today} today · {summary.upcoming} coming up
          </span>
        )}
      </h2>

      {(['overdue', 'today', 'upcoming'] as const).map((due) => {
        const list = group(due);
        if (!list.length) return null;
        return (
          <div key={due} data-testid={`follow-ups-${due}`} style={{ marginTop: 8 }}>
            <h3 style={{ margin: '0 0 4px', fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.06em', color: due === 'overdue' ? 'var(--color-error)' : 'var(--color-text-muted)' }}>
              {due === 'overdue' ? 'Overdue' : due === 'today' ? 'Due today' : 'Coming up'}
            </h3>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 4 }}>
              {list.map((r) => (
                <li key={r.id} data-testid="follow-up-row" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'baseline', fontSize: 13.5 }}>
                  <Link href={`/admin/leads/${r.id}`} style={{ fontWeight: 600 }}>{r.name || 'Unnamed lead'}</Link>
                  <span style={{ color: 'var(--color-text-muted)' }}>{r.note}</span>
                  {/* The phone number IS the action. A queue that makes you open a detail page to find it
                      is a queue that gets worked when there is time, which is never. */}
                  {r.phone && <a href={`tel:${r.phone.replace(/[^\d+]/g, '')}`}>{r.phone}</a>}
                  {r.quoteAmount ? <span>{money(r.quoteAmount)}</span> : null}
                  <span
                    title={r.attribution.detail ?? undefined}
                    style={{ fontSize: 12, color: r.attribution.paid ? 'var(--color-warning)' : 'var(--color-text-muted)' }}
                  >
                    {r.attribution.paid ? '💰 ' : ''}{r.attribution.label}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </section>
  );
}

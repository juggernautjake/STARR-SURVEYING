'use client';
// app/admin/marketing/_tabs/PeoplePanel.tsx — from a number to a person. A7.
//
// Owner: *"we need to be able to review the unique customer info for a given click, conversion,
// and/or form submission, and/or call."*
//
// ── IT LEADS WITH WHAT IT CANNOT SEE ────────────────────────────────────────────────────────────
//
// The coverage line is first, and every grade is named. A list of six traceable people, presented
// without the four who arrived unexplained, is a more confident story than the data supports — and
// at this firm the untraceable share is the majority, because most enquiries come by phone.
//
// ── PHONE CALLS ARE NOT COVERED AND THE PANEL SAYS SO ───────────────────────────────────────────
//
// A call carries no click id. Tying a phone call to an ad needs a call-tracking number, which is a
// paid service and an owner decision, not an engineering task. Leaving that unsaid would let
// somebody read "70% of leads traceable" as "70% of the business", which is a completely different
// and much more flattering claim.

import { useCallback, useEffect, useState } from 'react';
import type { DateRange } from '@/lib/marketing/date-range';

import '../Marketing.css';

interface Person {
  leadId: string | null;
  displayName: string;
  email: string | null;
  phone: string | null;
  clickId: { field: string; value: string } | null;
  campaignId: string | null;
  campaignIdSource: 'utm' | 'landing-page' | null;
  confidence: 'click' | 'inferred' | 'declared' | 'anonymous';
  explanation: string;
  landingPage: string | null;
  referrer: string | null;
  howHeard: string | null;
  createdAt: string;
}

interface Payload {
  summary: {
    total: number; click: number; inferred: number; declared: number; anonymous: number;
    clickShare: number | null;
  };
  people: Person[];
  truncated: boolean;
}

const GRADE_LABEL: Record<Person['confidence'], string> = {
  click: 'Ad click',
  inferred: 'From Google',
  declared: 'Self-reported',
  anonymous: 'Unknown',
};

/** An em-dash, never 0% — the same rule the rest of this dashboard follows. */
const pct = (v: number | null): string => (v === null ? '—' : `${Math.round(v * 100)}%`);

export default function PeoplePanel({ range }: { range: DateRange }): React.ReactElement | null {
  const [data, setData] = useState<Payload | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { from, to } = range;

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`/api/admin/marketing/people?from=${from}&to=${to}`);
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
      setData(await res.json() as Payload);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the people behind the numbers.');
    }
  }, [from, to]);

  useEffect(() => { void load(); }, [load]);

  if (error) return <p className="mk__error" role="alert">{error}</p>;
  if (!data) return null;

  const { summary, people } = data;

  return (
    <section className="mk__panel" data-testid="mk-people">
      <h2 className="mk__h2">Who came from the ads</h2>

      <p className="mk__muted">
        Every enquiry in this period, and how much we can actually say about where it came from.
      </p>

      {/* The coverage line, before the list. */}
      <ul className="mk__stats">
        <li><span>{pct(summary.clickShare)}</span> traceable to a named ad click <em>({summary.click} of {summary.total})</em></li>
        <li><span>{summary.inferred}</span> arrived from Google with no click id</li>
        <li><span>{summary.declared}</span> told us themselves</li>
        <li><span>{summary.anonymous}</span> <strong>unexplained</strong></li>
      </ul>

      {/* Said once, plainly, rather than implied by an absence. */}
      <p className="mk__warn">
        <strong>Phone calls are not counted here at all.</strong> A call carries no click id, so an
        enquiry that arrives by phone can only appear above if the customer filled in a form too.
        Tying calls to ads needs a call-tracking number — a paid service and a decision for the
        owner, not something this page can infer.
      </p>

      {people.length === 0 ? (
        <p className="mk__muted">No enquiries in this period.</p>
      ) : (
        <div className="mk__scroll">
          <table className="mk__table">
            <thead>
              <tr><th>Person</th><th>How we know</th><th>Campaign</th><th>Arrived</th><th /></tr>
            </thead>
            <tbody>
              {people.map((p) => (
                <tr key={p.leadId ?? p.createdAt}>
                  <td>
                    {/* The lead page is the drill-down: first touch, the form they filled, and the
                        job if they became one. Linking rather than duplicating keeps one place
                        where a customer record is maintained. */}
                    {p.leadId
                      ? <a href={`/admin/leads/${p.leadId}`}>{p.displayName}</a>
                      : p.displayName}
                  </td>
                  <td>
                    <span className={`mk__grade mk__grade--${p.confidence}`}>{GRADE_LABEL[p.confidence]}</span>
                  </td>
                  <td>
                    {p.campaignId
                      ? <span title={p.campaignIdSource === 'landing-page'
                          ? 'Read from the auto-tagged landing URL — this account does not use UTM tags'
                          : 'From utm_campaign'}>{p.campaignId}</span>
                      : '—'}
                  </td>
                  <td>{new Date(p.createdAt).toLocaleDateString()}</td>
                  <td>
                    <button
                      type="button"
                      className="mk__sort"
                      aria-expanded={open === p.leadId}
                      onClick={() => setOpen(open === p.leadId ? null : p.leadId)}
                    >
                      {open === p.leadId ? 'Hide' : 'Details'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* The expanded row, outside the table so a long click id cannot stretch a column and give
          the whole table a horizontal scroll it did not need. */}
      {open && (() => {
        const p = people.find((x) => x.leadId === open);
        if (!p) return null;
        return (
          <dl className="mk__detail">
            <dt>How we know</dt><dd>{p.explanation}</dd>
            {p.clickId && <><dt>{p.clickId.field}</dt><dd className="mk__detail__id">{p.clickId.value}</dd></>}
            {p.email && <><dt>Email</dt><dd>{p.email}</dd></>}
            {p.phone && <><dt>Phone</dt><dd>{p.phone}</dd></>}
            {p.howHeard && <><dt>They said</dt><dd>{p.howHeard}</dd></>}
            {p.landingPage && <><dt>Landed on</dt><dd className="mk__detail__id">{p.landingPage}</dd></>}
            {p.referrer && <><dt>Referred by</dt><dd className="mk__detail__id">{p.referrer}</dd></>}
          </dl>
        );
      })()}

      {data.truncated && (
        <p className="mk__muted">
          Only the first 500 enquiries are shown. Narrow the period to see the rest.
        </p>
      )}
    </section>
  );
}

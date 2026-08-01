'use client';
// /admin/marketing — the page everything else exists to make honest. A12.
//
// ── THE COVERAGE METER IS FIRST, AND THAT IS DELIBERATE ────────────────────────────────────────────
//
// Every other number here is only as good as the share of leads we can attribute at all, and Finding 6
// means it will never be 100% — most inquiries at this business arrive by phone, with no click to key on.
// Putting coverage at the bottom, or behind a tab, would let someone read a cost-per-lead figure as if it
// covered the whole business. It does not, and the page has to say so before it says anything else.
//
// ── "—" IS AN ANSWER; "0%" IS A CLAIM ──────────────────────────────────────────────────────────────
//
// Rates with no denominator render as an em-dash, never as zero. A 0% conversion rate reads as "something
// is broken"; the truth is usually "nothing has happened in this range yet".
import { useCallback, useEffect, useState } from 'react';

interface Stage {
  milestone: string; label: string; count: number;
  stepRate: number | null; overallRate: number | null;
  medianDaysFromPrevious: number | null; medianSampleSize: number;
}
interface Payload {
  range: { from: string; to: string };
  funnel: Stage[];
  funnelMonotonic: boolean;
  coverage: {
    total: number; clickAttributed: number; matchable: number; unattributable: number;
    clickShare: number | null; matchableShare: number | null; unattributableShare: number | null;
  };
  cost: {
    spend: number; revenue: number;
    costPerLead: number | null; costPerQuote: number | null; costPerWonJob: number | null; roas: number | null;
  };
  spend: { micros: number; manualMicros: number; manualShare: number; clicks: number };
  slice: { by: string; rows: Array<{ key: string; jobs: number; revenue: number }> };
  repeat: {
    customers: number; repeatCustomers: number; repeatRate: number | null;
    medianLifetimeValue: number | null; medianJobsPerCustomer: number | null;
    medianMonthsBetweenJobs: number | null;
    repeatsByOriginCampaign: Array<{ campaign: string; customers: number; revenue: number }>;
  };
  counts: { events: number; leads: number; jobs: number };
}

const SLICES = [
  { key: 'campaign', label: 'Campaign' },
  { key: 'source', label: 'Source' },
  { key: 'survey_type', label: 'Survey type' },
  { key: 'county', label: 'County' },
];

/** An em-dash, never a zero. See the header — this distinction is the whole point. */
const pct = (v: number | null): string => (v === null ? '—' : `${(v * 100).toFixed(0)}%`);
const money = (v: number | null): string =>
  v === null ? '—' : v.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const days = (v: number | null): string => (v === null ? '—' : `${v.toFixed(1)}d`);

export default function MarketingDashboardPage(): React.ReactElement {
  const [data, setData] = useState<Payload | null>(null);
  const [slice, setSlice] = useState('campaign');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const p = new URLSearchParams({ slice });
      if (from) p.set('from', from);
      if (to) p.set('to', to);
      const res = await fetch(`/api/admin/marketing/dashboard?${p.toString()}`);
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
      setData(await res.json() as Payload);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the dashboard.');
    } finally { setLoading(false); }
  }, [slice, from, to]);

  useEffect(() => { void load(); }, [load]);

  const top = data?.funnel[0]?.count ?? 0;

  return (
    <div className="mk">
      <h1 className="mk__title">Marketing</h1>
      <p className="mk__lead">
        Where the work comes from, what it costs, and how long it takes.
        {data && <> Range {data.range.from} → {data.range.to}.</>}
      </p>

      <section className="mk__panel">
        <div className="mk__row">
          <label htmlFor="mk-from">From</label>
          <input id="mk-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <label htmlFor="mk-to">To</label>
          <input id="mk-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          <label htmlFor="mk-slice">Break down by</label>
          <select id="mk-slice" value={slice} onChange={(e) => setSlice(e.target.value)}>
            {SLICES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </div>
      </section>

      {/* FIRST, deliberately. Everything below is only as good as this. */}
      {data && (
        <section className="mk__panel mk__panel--meter" data-testid="mk-coverage">
          <h2 className="mk__h2">Attribution coverage</h2>
          <p className="mk__muted">
            How much of the business we can trace to a source at all. This is not a target to hit — at this
            firm most inquiries arrive by phone, and a phone call carries no click to match on.
          </p>
          <div className="mk__bar" role="img"
            aria-label={`${pct(data.coverage.clickShare)} ad click, ${pct(data.coverage.matchableShare)} matchable, ${pct(data.coverage.unattributableShare)} unattributable`}>
            <span className="mk__seg mk__seg--click" style={{ width: `${(data.coverage.clickShare ?? 0) * 100}%` }} />
            <span className="mk__seg mk__seg--match" style={{ width: `${(data.coverage.matchableShare ?? 0) * 100}%` }} />
            <span className="mk__seg mk__seg--none" style={{ width: `${(data.coverage.unattributableShare ?? 0) * 100}%` }} />
          </div>
          <ul className="mk__legend">
            <li><i className="mk__dot mk__dot--click" /> {pct(data.coverage.clickShare)} from an ad click <em>({data.coverage.clickAttributed})</em></li>
            <li><i className="mk__dot mk__dot--match" /> {pct(data.coverage.matchableShare)} matchable by email/phone <em>({data.coverage.matchable})</em></li>
            <li><i className="mk__dot mk__dot--none" /> {pct(data.coverage.unattributableShare)} unattributable <em>({data.coverage.unattributable})</em></li>
          </ul>
          {data.coverage.total === 0 && (
            <p className="mk__muted">No leads in this range, so there is nothing to attribute yet.</p>
          )}
        </section>
      )}

      <section className="mk__panel" data-testid="mk-funnel">
        <h2 className="mk__h2">Funnel</h2>
        {loading ? <p className="mk__muted">Loading…</p> : data ? (
          <>
            {!data.funnelMonotonic && (
              <p className="mk__warn">
                A stage below has more subjects than the one above it. That means events were recorded out
                of order somewhere — the shape of this funnel is not trustworthy until it is looked at.
              </p>
            )}
            <div className="mk__scroll">
              <table className="mk__table">
                <thead>
                  <tr><th>Stage</th><th>Reached</th><th>From previous</th><th>Of all inquiries</th><th>Median time</th></tr>
                </thead>
                <tbody>
                  {data.funnel.map((s) => (
                    <tr key={s.milestone}>
                      <td>
                        <div className="mk__stagebar">
                          <span style={{ width: top > 0 ? `${(s.count / top) * 100}%` : '0%' }} />
                          <strong>{s.label}</strong>
                        </div>
                      </td>
                      <td>{s.count}</td>
                      <td>{pct(s.stepRate)}</td>
                      <td>{pct(s.overallRate)}</td>
                      <td>
                        {days(s.medianDaysFromPrevious)}
                        {/* A median of one job is not a median, and the page should not imply otherwise. */}
                        {s.medianSampleSize > 0 && s.medianSampleSize < 3 && (
                          <em className="mk__tiny"> (n={s.medianSampleSize})</em>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : <p className="mk__muted">No data.</p>}
      </section>

      {data && (
        <section className="mk__panel" data-testid="mk-cost">
          <h2 className="mk__h2">What it costs</h2>
          <ul className="mk__stats">
            <li><span>{money(data.cost.spend)}</span> ad spend</li>
            <li><span>{money(data.cost.costPerLead)}</span> per lead</li>
            <li><span>{money(data.cost.costPerQuote)}</span> per quote</li>
            <li><span>{money(data.cost.costPerWonJob)}</span> <strong>per won job</strong></li>
            <li><span>{data.cost.roas === null ? '—' : `${data.cost.roas.toFixed(1)}×`}</span> return on ad spend</li>
            <li><span>{money(data.cost.revenue)}</span> booked in range</li>
          </ul>
          {data.spend.manualShare > 0 && (
            <p className="mk__warn">
              {Math.round(data.spend.manualShare * 100)}% of the spend above was typed in by hand — every
              cost figure here is approximate until the Ads API import is connected.
            </p>
          )}
          {data.cost.spend === 0 && (
            <p className="mk__muted">
              No spend recorded for this range, so the cost figures are blank rather than zero.{' '}
              <a href="/admin/marketing/spend">Record it here.</a>
            </p>
          )}
        </section>
      )}

      {data && data.slice.rows.length > 0 && (
        <section className="mk__panel" data-testid="mk-slice">
          <h2 className="mk__h2">By {SLICES.find((s) => s.key === data.slice.by)?.label.toLowerCase()}</h2>
          <div className="mk__scroll">
            <table className="mk__table">
              <thead><tr><th>{SLICES.find((s) => s.key === data.slice.by)?.label}</th><th>Jobs</th><th>Revenue</th></tr></thead>
              <tbody>
                {data.slice.rows.map((r) => (
                  <tr key={r.key}>
                    <td>{r.key}</td><td>{r.jobs}</td><td>{money(r.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {data && (
        <section className="mk__panel" data-testid="mk-repeat">
          <h2 className="mk__h2">Repeat customers</h2>
          <ul className="mk__stats">
            <li><span>{pct(data.repeat.repeatRate)}</span> came back <em>({data.repeat.repeatCustomers} of {data.repeat.customers})</em></li>
            <li><span>{money(data.repeat.medianLifetimeValue)}</span> median lifetime value</li>
            <li><span>{data.repeat.medianJobsPerCustomer ?? '—'}</span> median jobs per customer</li>
            <li>
              <span>{data.repeat.medianMonthsBetweenJobs === null ? '—' : `${data.repeat.medianMonthsBetweenJobs.toFixed(1)} mo`}</span>
              between jobs
            </li>
          </ul>
          {data.repeat.repeatsByOriginCampaign.length > 0 && (
            <>
              <p className="mk__hint">
                Credited to the campaign that bought them <strong>the first time</strong> — a second job
                arriving direct was still bought by the original ad.
              </p>
              <ul className="mk__stats">
                {data.repeat.repeatsByOriginCampaign.map((c) => (
                  <li key={c.campaign}><span>{money(c.revenue)}</span> {c.campaign} <em>({c.customers})</em></li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      {data && (
        <p className="mk__hint">
          Built from {data.counts.events} lifecycle events, {data.counts.leads} leads and {data.counts.jobs} jobs.
          {' '}<a href="/admin/marketing/exports">Export conversions</a> ·{' '}
          <a href="/admin/marketing/uploads">Upload log</a> · <a href="/admin/marketing/spend">Ad spend</a>
        </p>
      )}

      {error && <p className="mk__error" role="alert">{error}</p>}

      <style jsx>{`
        .mk { padding: 20px; max-width: 1000px; }
        .mk__title { font-size: 1.4rem; margin: 0 0 6px; }
        .mk__lead { color: #4b5563; margin: 0 0 18px; }
        .mk__panel { border: 1px solid #e5e7eb; border-radius: 10px; padding: 14px 16px; margin-bottom: 14px; background: #fff; }
        .mk__panel--meter { border-color: #c7d2fe; background: #f8faff; }
        .mk__h2 { font-size: 1.05rem; margin: 0 0 6px; font-weight: 600; }
        .mk__row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
        .mk__row label { font-weight: 600; font-size: 0.85rem; }
        .mk__muted { color: #6b7280; font-size: 0.88rem; margin: 4px 0; }
        .mk__hint { color: #6b7280; font-size: 0.82rem; margin: 10px 0 0; }
        .mk__tiny { color: #9ca3af; font-size: 0.75rem; font-style: normal; }
        .mk__warn { background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 9px 11px;
          font-size: 0.85rem; color: #78350f; margin: 10px 0; }
        .mk__error { color: #991b1b; }
        .mk__bar { display: flex; height: 16px; border-radius: 99px; overflow: hidden; background: #e5e7eb; margin: 12px 0 10px; }
        .mk__seg { display: block; height: 100%; }
        .mk__seg--click { background: #16a34a; }
        .mk__seg--match { background: #f59e0b; }
        .mk__seg--none { background: #9ca3af; }
        .mk__legend { list-style: none; padding: 0; margin: 0; display: grid; gap: 4px; font-size: 0.85rem; }
        .mk__legend em { color: #6b7280; font-style: normal; }
        .mk__dot { display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-right: 7px; }
        .mk__dot--click { background: #16a34a; }
        .mk__dot--match { background: #f59e0b; }
        .mk__dot--none { background: #9ca3af; }
        .mk__stats { list-style: none; padding: 0; margin: 8px 0 0; display: grid; gap: 5px; font-size: 0.9rem;
          grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); }
        .mk__stats span { font-weight: 700; display: inline-block; min-width: 6ch; }
        .mk__stats em { color: #6b7280; font-style: normal; }
        .mk__scroll { overflow-x: auto; }
        .mk__table { width: 100%; border-collapse: collapse; font-size: 0.86rem; }
        .mk__table th, .mk__table td { text-align: left; padding: 7px 9px; border-bottom: 1px solid #f0f1f3; }
        .mk__table th { color: #4b5563; font-weight: 600; white-space: nowrap; }
        .mk__stagebar { position: relative; min-width: 150px; }
        .mk__stagebar span { position: absolute; inset: 0 auto 0 0; background: #dbeafe; border-radius: 4px; }
        .mk__stagebar strong { position: relative; font-weight: 600; padding-left: 4px; }
        select, input { padding: 8px 10px; border: 1px solid #d1d5db; border-radius: 8px; font: inherit; min-height: 40px; }
      `}</style>
    </div>
  );
}

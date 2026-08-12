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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DateRange } from '@/lib/marketing/date-range';
import { METRIC_DIRECTION, deltaOf, type GoodDirection } from '@/lib/marketing/compare';
import TrendChart from './TrendChart';
import PeoplePanel from './PeoplePanel';
import {
  READ_INTERVAL_MS, describeFreshness, isLiveRange, shouldImport,
} from '@/lib/marketing/live-refresh';

// Shared marketing stylesheet. These pages referenced their class names for months with
// nothing defining them — see the header of Marketing.css.
import '../Marketing.css';

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
  // A3 — the numbers the owner asked for by name.
  performance: {
    impressions: number; clicks: number; conversions: number;
    costMicros: number; conversionValueMicros: number;
    ctr: number | null; cpc: number | null; costPerConversion: number | null;
    roas: number | null; conversionRate: number | null;
  };
  daily: Array<{ date: string; costMicros: number; clicks: number; impressions: number; conversions: number }>;
  campaigns: Array<{
    name: string; impressions: number; clicks: number; conversions: number;
    costMicros: number; ctr: number | null; cpc: number | null; costPerConversion: number | null;
  }>;
  lastImportedAt: string | null;
  includesToday: boolean;
  // A5 — the delta baseline. Null when there is nothing sensible to compare against.
  previous: Payload['performance'] | null;
  comparison: { from: string; to: string; label: string; partial: boolean } | null;
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
  // A13 — the only dimension that says anything about phone and referral leads.
  { key: 'how_heard', label: 'How they heard' },
];

/** An em-dash, never a zero. See the header — this distinction is the whole point. */
const pct = (v: number | null): string => (v === null ? '—' : `${(v * 100).toFixed(0)}%`);
const money = (v: number | null): string =>
  v === null ? '—' : v.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const days = (v: number | null): string => (v === null ? '—' : `${v.toFixed(1)}d`);
/** Counts get thousands separators — "18420" and "1842" look alike at a glance and are not. */
const count = (v: number): string => Math.round(v).toLocaleString();
/** Two decimals, because a click costs $1.37 and rounding it to $1 loses the decision. */
const money2 = (v: number | null): string =>
  v === null ? '—' : v.toLocaleString(undefined, { style: 'currency', currency: 'USD' });
/** One decimal on a click-through rate: the difference between 2.0% and 2.4% is the whole campaign. */
const rate = (v: number | null): string => (v === null ? '—' : `${(v * 100).toFixed(1)}%`);
const MICROS = 1_000_000;

/** The campaign table's columns. `initial` is the order a column opens in when you first sort by
 *  it — the one that answers the question the column is actually asked: biggest spend first,
 *  cheapest cost-per-click first. Making every column open ascending means half of them open on the
 *  answer nobody wanted. */
interface CampaignCol {
  key: 'name' | 'costMicros' | 'impressions' | 'clicks' | 'ctr' | 'cpc' | 'conversions' | 'costPerConversion';
  label: string;
  initial: 'asc' | 'desc';
}

const CAMPAIGN_COLS: CampaignCol[] = [
  { key: 'name', label: 'Campaign', initial: 'asc' },
  { key: 'costMicros', label: 'Spend', initial: 'desc' },
  { key: 'impressions', label: 'Impr.', initial: 'desc' },
  { key: 'clicks', label: 'Clicks', initial: 'desc' },
  { key: 'ctr', label: 'CTR', initial: 'desc' },
  { key: 'cpc', label: 'CPC', initial: 'asc' },
  { key: 'conversions', label: 'Conv.', initial: 'desc' },
  { key: 'costPerConversion', label: 'Cost/conv.', initial: 'asc' },
];

/**
 * A5 — one stat tile: label, value, and a delta against a NAMED period.
 *
 * The delta is the most quietly dishonest element on a dashboard — one number, no visible working,
 * everybody reads it — so three things are deliberate here:
 *
 *   · the baseline's actual dates are printed ("vs 1–12 Jul"), never "vs last month";
 *   · a rise from zero says "up from none" rather than inventing +18000%;
 *   · the colour comes from `direction`, a property of the METRIC. Spend is neutral: spending more
 *     is what scaling a working campaign looks like, and spending less is what an expired card
 *     looks like. Green and red both lie.
 */
function Kpi({ label, value, current, previous, direction, comparison }: {
  label: string;
  value: string;
  current: number;
  previous: number | undefined;
  direction: GoodDirection;
  comparison: { label: string; partial: boolean } | null;
}): React.ReactElement {
  const has = previous !== undefined && comparison !== null;
  const delta = has ? deltaOf(current, previous, direction) : null;

  return (
    <li>
      <b>{value}</b>
      <span>{label}</span>
      {delta && (
        <em className={`mk__delta mk__delta--${delta.tone}`}>
          {delta.absolute === 0
            ? 'no change'
            : delta.ratio === null
              // Nothing to divide by. "Up from none" is the whole truth and takes less space than
              // a percentage that would be nonsense.
              ? (delta.absolute > 0 ? 'up from none' : 'down to none')
              : `${delta.ratio > 0 ? '+' : '−'}${Math.abs(delta.ratio * 100).toFixed(0)}%`}
          {' '}
          <span className="mk__delta__vs">{comparison!.label}</span>
        </em>
      )}
    </li>
  );
}

export default function MarketingDashboardPage({ range }: { range: DateRange }): React.ReactElement {
  const [data, setData] = useState<Payload | null>(null);
  const [slice, setSlice] = useState('campaign');
  // A2 — the period comes from the shell's RangePicker, held in the URL. These used to be two
  // blank date inputs per page, so every tab opened on "whatever the API defaults to" and
  // switching tabs lost the period you were looking at.
  const { from, to } = range;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /**
   * A4 — `silent` re-reads without touching `loading`. An auto-refresh that flips the page back to
   * "Loading…" every minute makes it unreadable: you look away, look back, and the thing you were
   * reading is gone. A background update should only ever change the numbers.
   */
  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const p = new URLSearchParams({ slice });
      if (from) p.set('from', from);
      if (to) p.set('to', to);
      const res = await fetch(`/api/admin/marketing/dashboard?${p.toString()}`);
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
      setData(await res.json() as Payload);
    } catch (e) {
      // A silent tick that fails must not replace a screen of good numbers with an error banner —
      // one dropped request on a train is not a reason to blank the page. It retries next minute.
      if (!silent) setError(e instanceof Error ? e.message : 'Could not load the dashboard.');
    } finally { if (!silent) setLoading(false); }
  }, [slice, from, to]);

  useEffect(() => { void load(); }, [load]);

  // A3 — ask Google for this range now, then re-read. The nightly cron stops at yesterday on purpose
  // (today is still being counted), so without this the current month is short by up to a day.
  const [refreshing, setRefreshing] = useState(false);
  const [refreshNote, setRefreshNote] = useState<string | null>(null);
  // A4 — the last time an import was ATTEMPTED, successful or not. See `shouldImport`: keying the
  // interval on success would turn a broken connection into a request loop against Google.
  const lastImportAttempt = useRef<number | null>(null);

  const refresh = useCallback(async (silent = false) => {
    lastImportAttempt.current = Date.now();
    if (!silent) { setRefreshing(true); setRefreshNote(null); }
    try {
      const res = await fetch('/api/admin/marketing/spend/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to }),
      });
      const out = await res.json() as { imported?: number; error?: string; skipped?: boolean; warning?: string };
      // The reason is shown verbatim. "Nothing happened" with no explanation is the state that gets
      // pressed eleven times. On a silent tick nothing is said at all — an automatic action the
      // person did not take should not narrate itself over the page they are reading.
      if (!silent) {
        const outcome = out.error
          ? out.error
          : out.imported ? `Imported ${out.imported} rows from Google.` : 'Google reported no rows for this range.';
        setRefreshNote(out.warning ? `${outcome} ${out.warning}` : outcome);
      }
      await load(silent);
    } catch (e) {
      if (!silent) setRefreshNote(e instanceof Error ? e.message : 'The refresh failed.');
    } finally { if (!silent) setRefreshing(false); }
  }, [from, to, load]);

  /**
   * A4 — the actual "in real time" part.
   *
   * One timer, two different jobs at two different rates: re-READ our own database every minute
   * (cheap, no quota), and re-IMPORT from Google only every fifteen (quota, and Google's figures do
   * not move faster than that anyway). The decision lives in `lib/marketing/live-refresh.ts` so it
   * is testable without a browser; this effect is only the wiring.
   *
   * It also refreshes the moment the tab becomes visible. Coming back to a laptop after lunch and
   * reading a number that was true two hours ago — with a stamp that only updates on the next tick —
   * is exactly the silent staleness this slice exists to remove.
   */
  useEffect(() => {
    const visible = () => typeof document === 'undefined' || document.visibilityState === 'visible';

    const tick = (): void => {
      if (!visible()) return;
      const now = new Date();
      // A closed month cannot change, so re-reading it every minute is work that can only ever
      // return the same bytes. The page says "final" for those ranges instead of pretending to
      // watch them.
      if (!isLiveRange(range, now)) return;
      void load(true);
      if (shouldImport({ visible: true, range, lastAttemptAt: lastImportAttempt.current, now })) {
        void refresh(true);
      }
    };

    const timer = window.setInterval(tick, READ_INTERVAL_MS);
    const onVisible = () => { if (visible()) tick(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [load, refresh, range]);

  // Recomputed on every render rather than stored, so the stamp ages while you look at it instead of
  // freezing at whatever it said when the data arrived.
  const freshness = data ? describeFreshness(data.lastImportedAt, new Date()) : null;
  const live = isLiveRange(range, new Date());

  // A5 — the campaign table sorts client-side. The rows are already capped at 25 by the route, so
  // sorting in the browser is instant and costs no round trip; re-fetching to reorder 25 rows would
  // make the table feel slower than the data it shows.
  const [sort, setSort] = useState<{ key: CampaignCol['key']; dir: 'asc' | 'desc' }>(
    { key: 'costMicros', dir: 'desc' },
  );
  const sortedCampaigns = useMemo(() => {
    const rows = [...(data?.campaigns ?? [])];
    const { key, dir } = sort;
    return rows.sort((a, b) => {
      const av = a[key]; const bv = b[key];
      if (typeof av === 'string' || typeof bv === 'string') {
        return dir === 'asc'
          ? String(av).localeCompare(String(bv))
          : String(bv).localeCompare(String(av));
      }
      // A null ratio — cost per conversion with no conversions — sorts LAST in either direction.
      // Treating it as zero would put "no conversions at all" at the top of "cheapest per
      // conversion", which is the exact opposite of what it means.
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      return dir === 'asc' ? av - bv : bv - av;
    });
  }, [data?.campaigns, sort]);

  const top = data?.funnel[0]?.count ?? 0;
  const perf = data?.performance;

  return (
    <div className="mk">
      <h1 className="mk__title">Marketing</h1>
      <p className="mk__lead">
        Where the work comes from, what it costs, and how long it takes.
        {data && <> Range {data.range.from} → {data.range.to}.</>}
      </p>

      <section className="mk__panel">
        <div className="mk__row">
          {/* A2 — the From/To inputs that used to sit here are gone. The period is chosen once, in
              the shell's RangePicker above the tabs, and held in the URL. Two controls for one
              question is how the authoritative-looking one ends up being the broken one. */}
          <label htmlFor="mk-slice">Break down by</label>
          <select id="mk-slice" value={slice} onChange={(e) => setSlice(e.target.value)}>
            {SLICES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </div>
      </section>

      {/* A3 — the four numbers the owner asked for, above the coverage meter.
          That is not a demotion of coverage. These are GOOGLE'S OWN counts of what its ads did:
          impressions were served, clicks happened, Google's tag fired. None of them depend on
          whether we can trace a lead back to a click, so the coverage caveat below — which governs
          every number we derive ourselves — genuinely does not apply to them. */}
      {perf && (
        <section className="mk__panel mk__panel--perf" data-testid="mk-performance">
          <div className="mk__perfhead">
            <h2 className="mk__h2">Google Ads · this period</h2>
            <button type="button" className="mk__refresh" onClick={() => void refresh()} disabled={refreshing}>
              {refreshing ? 'Refreshing…' : 'Refresh from Google'}
            </button>
          </div>

          <ul className="mk__kpis">
            {/* Cents on spend, unlike the funnel's cost figures. This is the one number on the page
                that gets reconciled against a Google invoice line, and "$181" cannot be checked
                against "$181.35" without opening the Ads UI to find out which one is rounded. */}
            <Kpi label="spent" value={money2(perf.costMicros / MICROS)}
              current={perf.costMicros} previous={data.previous?.costMicros}
              direction={METRIC_DIRECTION.spend} comparison={data.comparison} />
            <Kpi label="impressions" value={count(perf.impressions)}
              current={perf.impressions} previous={data.previous?.impressions}
              direction={METRIC_DIRECTION.impressions} comparison={data.comparison} />
            <Kpi label="clicks" value={count(perf.clicks)}
              current={perf.clicks} previous={data.previous?.clicks}
              direction={METRIC_DIRECTION.clicks} comparison={data.comparison} />
            <Kpi label="conversions" value={perf.conversions.toFixed(perf.conversions % 1 ? 1 : 0)}
              current={perf.conversions} previous={data.previous?.conversions}
              direction={METRIC_DIRECTION.conversions} comparison={data.comparison} />
          </ul>

          <ul className="mk__stats mk__stats--derived">
            <li><span>{rate(perf.ctr)}</span> click-through rate</li>
            <li><span>{money2(perf.cpc)}</span> per click</li>
            <li><span>{money2(perf.costPerConversion)}</span> per conversion</li>
            <li><span>{rate(perf.conversionRate)}</span> of clicks converted</li>
          </ul>

          {/* A3's stopgap sparkline lived here. A5 removed it rather than keeping both: it plotted
              the same daily spend that "Day by day" now plots properly, with no axis, no scale and
              no labels — a second unlabelled chart of one series is clutter that makes the real one
              look like a duplicate. Its job was to hold the ground until the chart existed. */}

          {data.includesToday && (
            <p className="mk__muted">
              This range includes today, and Google is still counting it — the totals will keep moving
              until tomorrow.
            </p>
          )}
          {perf.impressions === 0 && perf.costMicros === 0 && (
            <p className="mk__muted">
              Nothing imported for this range yet. <strong>Refresh from Google</strong> pulls it now;
              the nightly job fills in everything up to yesterday.
            </p>
          )}
          {refreshNote && <p className="mk__muted" role="status">{refreshNote}</p>}

          {/* A4 — the freshness stamp. ALWAYS rendered, never conditional on having a timestamp:
              a component that disappears when it has no timestamp leaves the page looking most
              confident exactly where it knows least. `describeFreshness` guarantees a sentence. */}
          {freshness && (
            <p className={`mk__stamp${freshness.stale ? ' mk__stamp--stale' : ''}`} data-testid="mk-freshness">
              <i className="mk__pulse" aria-hidden />
              {freshness.label}
              {live
                ? <> · checking every minute</>
                : freshness.ageMs === null
                  // A closed period we never imported must NOT be called final. "Final" says these
                  // figures are the settled truth; the truth is we never asked Google, and the
                  // zeroes below are the absence of an import rather than the absence of spend.
                  // That is the exact confusion A3 found live, one sentence away from repeating.
                  ? <> · nothing was ever imported for it — <strong>Refresh from Google</strong> to pull it</>
                  // Said plainly rather than left ambiguous. A past month is not "not updating
                  // because something broke", it is finished, and those look identical without a word.
                  : <> · this period has closed, so the figures are final</>}
            </p>
          )}
        </section>
      )}

      {/* A5 — day by day. Two small multiples rather than one dual-axis plot; see TrendChart. */}
      {data && data.daily.length > 1 && <TrendChart points={data.daily} />}

      {data && data.campaigns.length > 0 && (
        <section className="mk__panel" data-testid="mk-campaigns">
          <h2 className="mk__h2">By campaign</h2>
          <div className="mk__scroll">
            <table className="mk__table">
              <thead>
                <tr>
                  {CAMPAIGN_COLS.map((col) => (
                    <th key={col.key} aria-sort={sort.key === col.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                      <button
                        type="button"
                        className={`mk__sort${sort.key === col.key ? ' is-active' : ''}`}
                        onClick={() => setSort((s) => ({
                          key: col.key,
                          // Re-clicking the active column flips it; a new column starts on the
                          // order that answers the question people actually ask of it — biggest
                          // spend first, cheapest cost-per-click first.
                          dir: s.key === col.key ? (s.dir === 'asc' ? 'desc' : 'asc') : col.initial,
                        }))}
                      >
                        {col.label}
                        <span aria-hidden>{sort.key === col.key ? (sort.dir === 'asc' ? '▲' : '▼') : ''}</span>
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedCampaigns.map((c) => (
                  <tr key={c.name}>
                    <td>{c.name}</td>
                    <td>{money2(c.costMicros / MICROS)}</td>
                    <td>{count(c.impressions)}</td>
                    <td>{count(c.clicks)}</td>
                    <td>{rate(c.ctr)}</td>
                    <td>{money2(c.cpc)}</td>
                    <td>{c.conversions.toFixed(c.conversions % 1 ? 1 : 0)}</td>
                    <td>{money2(c.costPerConversion)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* A7 — from a count to a person. Directly under the campaign table because that table says
          what the money bought and this says who it bought. */}
      {data && <PeoplePanel range={range} />}

      {/* Everything below is only as good as this. */}
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
        .mk__lead { color: var(--theme-fg-muted, #4b5563); margin: 0 0 18px; }
        .mk__panel { border: 1px solid var(--theme-border, #e5e7eb); border-radius: 10px; padding: 14px 16px;
          margin-bottom: 14px; background: var(--theme-bg-surface, #fff); }
        .mk__panel--meter { border-color: var(--theme-border-strong, #c7d2fe); background: var(--theme-bg-subtle, #f8faff); }
        .mk__h2 { font-size: 1.05rem; margin: 0 0 6px; font-weight: 600; }
        .mk__row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
        .mk__row label { font-weight: 600; font-size: 0.85rem; }
        .mk__muted { color: var(--theme-fg-muted, #6b7280); font-size: 0.88rem; margin: 4px 0; }
        .mk__hint { color: var(--theme-fg-muted, #6b7280); font-size: 0.82rem; margin: 10px 0 0; }
        .mk__tiny { color: var(--theme-fg-muted, #9ca3af); font-size: 0.75rem; font-style: normal; }
        .mk__warn { background: var(--theme-bg-subtle, #fffbeb); border: 1px solid var(--theme-warning, #fde68a);
          border-radius: 8px; padding: 9px 11px; font-size: 0.85rem;
          color: var(--theme-warning, #78350f); margin: 10px 0; }
        .mk__error { color: var(--theme-danger, #991b1b); }
        .mk__bar { display: flex; height: 16px; border-radius: 99px; overflow: hidden;
          background: var(--theme-border, #e5e7eb); margin: 12px 0 10px; }
        .mk__seg { display: block; height: 100%; }
        .mk__seg--click { background: #16a34a; }
        .mk__seg--match { background: #f59e0b; }
        .mk__seg--none { background: #9ca3af; }
        .mk__legend { list-style: none; padding: 0; margin: 0; display: grid; gap: 4px; font-size: 0.85rem; }
        .mk__legend em { color: var(--theme-fg-muted, #6b7280); font-style: normal; }
        .mk__dot { display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-right: 7px; }
        .mk__dot--click { background: #16a34a; }
        .mk__dot--match { background: #f59e0b; }
        .mk__dot--none { background: #9ca3af; }
        .mk__stats { list-style: none; padding: 0; margin: 8px 0 0; display: grid; gap: 5px; font-size: 0.9rem;
          grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); }
        .mk__stats span { font-weight: 700; display: inline-block; min-width: 6ch; }
        .mk__stats em { color: var(--theme-fg-muted, #6b7280); font-style: normal; }
        .mk__scroll { overflow-x: auto; }
        .mk__table { width: 100%; border-collapse: collapse; font-size: 0.86rem; }
        .mk__table th, .mk__table td { text-align: left; padding: 7px 9px;
          border-bottom: 1px solid var(--theme-border, #f0f1f3); }
        .mk__table th { color: var(--theme-fg-secondary, #4b5563); font-weight: 600; white-space: nowrap; }
        .mk__stagebar { position: relative; min-width: 150px; }
        .mk__stagebar span { position: absolute; inset: 0 auto 0 0; background: var(--theme-bg-subtle, #dbeafe);
          border-radius: 4px; }
        .mk__stagebar strong { position: relative; font-weight: 600; padding-left: 4px; }
        select, input { padding: 8px 10px; border: 1px solid var(--theme-border, #d1d5db); border-radius: 8px;
          font: inherit; min-height: 40px; background: var(--theme-bg-input, #fff);
          color: var(--theme-fg-primary, #111827); }
        /* A3's panel styles live in Marketing.css, not here. A styled-jsx block is invisible to the
           guard in __tests__/marketing/marketing-pages-are-styled.test.ts — the one that catches a
           class name nothing defines — so putting new rules here would opt them out of the check
           that exists precisely because these pages once shipped unstyled. */
      `}</style>
    </div>
  );
}

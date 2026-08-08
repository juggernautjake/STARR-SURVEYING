'use client';

// app/admin/finances/overview/page.tsx
//
// G2 / Phase 2.2b — unified "money in vs money out" dashboard. Reads
// /api/admin/finances/overview and shows revenue, payouts, expenses, and net
// for a date range, plus a per-period breakdown. Brand-styled to match the
// payout tax-report page.

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { formatDollars } from '@/lib/payments/live';
import '../../payments-admin.css';

// This page referenced its fin-* classes with nothing defining them. See the stylesheet header.
import './FinanceOverview.css';

type Granularity = 'day' | 'week' | 'month' | 'year';

interface Summary {
  revenue_cents: number;
  payouts_cents: number;
  expenses_cents: number;
  ad_spend_cents: number;
  outflow_cents: number;
  net_cents: number;
}
interface PeriodRow {
  period_key: string;
  period_start: string;
  revenue_cents: number;
  payouts_cents: number;
  expenses_cents: number;
  ad_spend_cents: number;
  net_cents: number;
}
/** What the route says about the advertising figure's own trustworthiness. */
interface AdSpendMeta {
  cents: number;
  manual_share: number;
  platforms: string[];
  suspected_duplicates: Array<{
    kind: string;
    confidence: 'high' | 'low';
    receipt_ids: string[];
    vendor: string | null;
    total_cents: number;
    dedupe_key: string;
    explanation: string;
  }>;
  suspected_duplicate_cents: number;
}
interface OverviewResponse {
  from: string;
  to: string;
  granularity: Granularity;
  summary: Summary;
  by_period: PeriodRow[];
  ad_spend: AdSpendMeta;
}

interface AuditFinding {
  severity: 'high' | 'medium' | 'low';
  category: string;
  title: string;
  detail: string;
  ids: string[];
  amount_cents?: number;
}
interface AuditResponse {
  period: { from: string; to: string };
  totals: {
    receipt_count: number; receipt_cents: number;
    invoice_count: number; invoiced_cents: number;
    paid_cents: number; ad_spend_cents: number;
  };
  findings: AuditFinding[];
  questioned_cents: number;
  /** Written by the model over the findings. Null when it is unavailable — the findings still stand. */
  narrative: string | null;
  narrative_error?: string;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default function FinanceOverviewPage(): React.ReactElement {
  const today = useMemo(() => new Date(), []);
  const year = today.getUTCFullYear();
  const [from, setFrom] = useState(isoDate(new Date(Date.UTC(year, 0, 1))));
  const [to, setTo] = useState(isoDate(today));
  const [granularity, setGranularity] = useState<Granularity>('month');
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const url = `/api/admin/finances/overview?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&granularity=${granularity}`;
    const res = await fetch(url);
    setLoading(false);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? 'Failed to load overview.');
      setData(null);
      return;
    }
    setData((await res.json()) as OverviewResponse);
  }, [from, to, granularity]);
  useEffect(() => {
    load();
  }, [load]);

  function pinYear(y: number) {
    setFrom(isoDate(new Date(Date.UTC(y, 0, 1))));
    setTo(isoDate(new Date(Date.UTC(y, 11, 31))));
  }
  function pinThisYear() {
    setFrom(isoDate(new Date(Date.UTC(year, 0, 1))));
    setTo(isoDate(today));
  }
  function pinLastDays(n: number) {
    const start = new Date(today);
    start.setUTCDate(start.getUTCDate() - n);
    setFrom(isoDate(start));
    setTo(isoDate(today));
  }

  // ── The audit ─────────────────────────────────────────────────────────────────────────────────
  //
  // Deliberately NOT run on page load. It costs a model call, and an audit is something you decide
  // to do — an automatic one on every visit would be both expensive and ignored.
  const [audit, setAudit] = useState<AuditResponse | null>(null);
  const [auditing, setAuditing] = useState(false);
  const [auditError, setAuditError] = useState<string | null>(null);

  const runAudit = useCallback(async () => {
    setAuditing(true);
    setAuditError(null);
    setAudit(null);
    try {
      const res = await fetch(
        `/api/admin/finances/audit?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      );
      if (!res.ok) {
        setAuditError((await res.json().catch(() => ({}))).error ?? 'The audit could not run.');
        return;
      }
      setAudit((await res.json()) as AuditResponse);
    } finally {
      setAuditing(false);
    }
  }, [from, to]);

  // Changing the range invalidates the report rather than leaving July's findings on screen under
  // an August heading — a stale audit is worse than none, because it reads as current.
  useEffect(() => {
    setAudit(null);
    setAuditError(null);
  }, [from, to]);

  const s = data?.summary;
  const netPositive = (s?.net_cents ?? 0) >= 0;

  return (
    <main className="fin-page" data-payments-admin data-testid="finances-overview">
      <header className="fin-page__header">
        <div>
          <Link href="/admin/finances" className="fin-page__back">← Finances</Link>
          {' '}
          {/* Advertising is a line on this page now, so the screen that explains WHY it moved has to
              be one click away. A total with no route to its cause is a number you can only worry
              about. */}
          <Link href="/admin/marketing" className="fin-page__back">Marketing &amp; ad spend →</Link>
          <h1 className="fin-page__title">Money in &amp; out</h1>
          <p className="fin-page__lede">
            Cash-flow overview — cleared customer payments in, employee payouts, approved receipts
            and advertising out, netted for the range. Money that actually moved.
          </p>
        </div>
      </header>

      <section className="fin-page__picker">
        <div className="fin-page__quick">
          <button type="button" onClick={pinThisYear} data-testid="fin-quick-ytd">This year</button>
          <button type="button" onClick={() => pinYear(year - 1)} data-testid="fin-quick-prev-year">Last year ({year - 1})</button>
          <button type="button" onClick={() => pinLastDays(90)} data-testid="fin-quick-90">Last 90 days</button>
          <button type="button" onClick={() => pinLastDays(30)} data-testid="fin-quick-30">Last 30 days</button>
        </div>
        <div className="fin-page__range">
          <label>
            <span>From</span>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} data-testid="fin-from" />
          </label>
          <label>
            <span>To</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} data-testid="fin-to" />
          </label>
          <label>
            <span>Group by</span>
            <select value={granularity} onChange={(e) => setGranularity(e.target.value as Granularity)} data-testid="fin-granularity">
              <option value="day">Day</option>
              <option value="week">Week</option>
              <option value="month">Month</option>
              <option value="year">Year</option>
            </select>
          </label>
          <button type="button" className="fin-btn" onClick={load} disabled={loading} data-testid="fin-load">
            {loading ? 'Loading…' : 'Recalculate'}
          </button>
          {/* The audit lives HERE rather than on a page of its own, because the period is already
              chosen on this screen. A separate page would make the owner pick the dates twice, which
              is the difference between "one click" and "a thing I will do later". */}
          <button
            type="button"
            className="fin-btn fin-btn--audit"
            onClick={() => void runAudit()}
            disabled={auditing}
            data-testid="fin-audit"
          >
            {auditing ? 'Auditing…' : 'Audit this period'}
          </button>
        </div>
      </section>

      {error && <p className="fin-page__error" data-testid="fin-error" role="alert">{error}</p>}
      {auditError && <p className="fin-page__error" role="alert">{auditError}</p>}

      {audit && (
        <section className="fin-audit" data-testid="fin-audit-report">
          <header className="fin-audit__head">
            <h2 className="fin-audit__title">
              Audit — {audit.period.from} to {audit.period.to}
            </h2>
            <span className="fin-audit__count">
              {audit.findings.length === 0
                ? 'No issues found'
                : `${audit.findings.length} finding${audit.findings.length === 1 ? '' : 's'} · ${formatDollars(audit.questioned_cents)} questioned`}
            </span>
          </header>

          {/* What was checked, stated whether or not anything was found. A report that says "nothing
              wrong" without saying what it looked at is not evidence of anything. */}
          <p className="fin-audit__scope">
            Checked {audit.totals.receipt_count} receipt(s) totalling{' '}
            {formatDollars(audit.totals.receipt_cents)}, {audit.totals.invoice_count} invoice(s)
            totalling {formatDollars(audit.totals.invoiced_cents)}, and{' '}
            {formatDollars(audit.totals.ad_spend_cents)} of advertising.
          </p>

          {audit.narrative && <p className="fin-audit__narrative">{audit.narrative}</p>}
          {audit.narrative_error && (
            // The findings are the product; the prose is a convenience. Saying which half is missing
            // is the difference between a degraded report and an untrustworthy one.
            <p className="fin-audit__degraded">{audit.narrative_error}</p>
          )}

          {audit.findings.length > 0 && (
            <ul className="fin-audit__list">
              {audit.findings.map((f, i) => (
                <li key={`${f.category}-${i}`} className={`fin-audit__item fin-audit__item--${f.severity}`}>
                  <div className="fin-audit__item-head">
                    <span className={`fin-audit__sev fin-audit__sev--${f.severity}`}>{f.severity}</span>
                    <strong>{f.title}</strong>
                  </div>
                  <p className="fin-audit__detail">{f.detail}</p>
                  <p className="fin-audit__ids">
                    {f.ids.length} row{f.ids.length === 1 ? '' : 's'}
                    {f.amount_cents ? ` · ${formatDollars(f.amount_cents)}` : ''}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* Advertising can reach the books twice — imported from the Ads account AND photographed as a
          receipt somebody approved. Both numbers are individually correct, so nothing looks wrong;
          net profit simply reads low by a month of ad spend, an error in the direction nobody
          investigates. Shown, never silently corrected: the match is a heuristic over a vendor name
          typed on a phone, and deleting a real expense because it fired would be both worse and
          undetectable afterwards. */}
      {data?.ad_spend?.suspected_duplicates?.length ? (
        <div className="fin-dupe" data-testid="fin-dupes" role="status">
          <strong>
            Money may be counted twice ({formatDollars(data.ad_spend.suspected_duplicate_cents)} at risk).
          </strong>{' '}
          Each of these is a signal, not a verdict — two genuine purchases can look identical to one
          entered twice, so nothing has been changed or removed.
          <ul>
            {data.ad_spend.suspected_duplicates.map((d) => (
              <li key={d.dedupe_key}>
                {/* Confidence is shown per row rather than filtered out. A "maybe" is worth seeing
                    on a page you opened deliberately; it is only on a 7am phone alert that it
                    becomes noise, and the alert filters to high confidence for that reason. */}
                <strong>{d.vendor ?? 'unnamed vendor'}</strong> — {formatDollars(d.total_cents)}
                {d.confidence === 'low' ? ' (possible)' : ''}
                <br />
                <span className="fin-dupe__why">{d.explanation}</span>
              </li>
            ))}
          </ul>
          If a match is the same money, delete or recategorise the extra receipt. If they are
          genuinely separate charges, nothing needs doing.
        </div>
      ) : null}

      {s && (
        <>
          <section className="fin-cards" data-testid="fin-cards">
            <article className="fin-card fin-card--in">
              <span className="fin-card__label">Money in</span>
              <span className="fin-card__value">{formatDollars(s.revenue_cents)}</span>
              <span className="fin-card__sub">cleared customer payments</span>
            </article>
            <article className="fin-card fin-card--out">
              <span className="fin-card__label">Money out</span>
              <span className="fin-card__value">{formatDollars(s.outflow_cents)}</span>
              <span className="fin-card__sub">
                payouts {formatDollars(s.payouts_cents)} · expenses {formatDollars(s.expenses_cents)}
                {' · '}ads {formatDollars(s.ad_spend_cents)}
              </span>
            </article>
            {/* Advertising gets a card of its own rather than only a share of "money out". The owner
                asked to control ad spend, and a figure folded into a subtotal is one you cannot
                steer — you would have to subtract two other numbers to find it. */}
            <article className="fin-card fin-card--out" data-testid="fin-ads">
              <span className="fin-card__label">Advertising</span>
              <span className="fin-card__value">{formatDollars(s.ad_spend_cents)}</span>
              <span className="fin-card__sub">
                {data?.ad_spend && data.ad_spend.manual_share > 0
                  ? `${Math.round(data.ad_spend.manual_share * 100)}% entered by hand`
                  : 'imported from the Ads account'}
              </span>
            </article>
            <article className={`fin-card ${netPositive ? 'fin-card--net-pos' : 'fin-card--net-neg'}`}>
              <span className="fin-card__label">Net</span>
              <span className="fin-card__value" data-testid="fin-net">{formatDollars(s.net_cents)}</span>
              <span className="fin-card__sub">{netPositive ? 'in the black' : 'in the red'}</span>
            </article>
          </section>

          <section className="fin-table-wrap" data-testid="fin-table">
            <div className="fin-table__head">
              <span>Period</span>
              <span>In</span>
              <span>Payouts</span>
              <span>Expenses</span>
              <span>Ads</span>
              <span>Net</span>
            </div>
            {data!.by_period.length === 0 ? (
              <p className="fin-empty" data-testid="fin-empty">No money moved in this range.</p>
            ) : (
              data!.by_period.map((p) => (
                <div className="fin-table__row" key={p.period_key} data-testid={`fin-row-${p.period_key}`}>
                  <span className="fin-table__period">{p.period_key}</span>
                  <span className="fin-pos">{formatDollars(p.revenue_cents)}</span>
                  <span className="fin-neg">{formatDollars(p.payouts_cents)}</span>
                  <span className="fin-neg">{formatDollars(p.expenses_cents)}</span>
                  <span className="fin-neg">{formatDollars(p.ad_spend_cents)}</span>
                  <span className={p.net_cents >= 0 ? 'fin-pos fin-strong' : 'fin-neg fin-strong'}>
                    {formatDollars(p.net_cents)}
                  </span>
                </div>
              ))
            )}
          </section>
        </>
      )}

      <style jsx>{styles}</style>
    </main>
  );
}

const styles = `
  .fin-page { font-family: 'Inter', sans-serif; background: #f4f5f9; min-height: 100vh; color: #152050; padding: 2rem 1.25rem 4rem; }
  .fin-page__header { max-width: 1100px; margin: 0 auto 1.25rem; }
  .fin-page__back { color: #1D3095; font-weight: 600; text-decoration: none; font-size: 0.9rem; }
  .fin-page__title { font-family: 'Sora', sans-serif; font-size: 1.5rem; margin: 0.25rem 0 0.35rem; font-weight: 700; }
  .fin-page__lede { margin: 0; color: #4a5470; max-width: 760px; }

  .fin-btn { font: inherit; font-weight: 700; padding: 0.65rem 1.2rem; background: #1D3095; color: #fff; border: none; border-radius: 10px; cursor: pointer; }
  .fin-btn:hover:not(:disabled) { background: #16266f; }
  .fin-btn:disabled { opacity: 0.6; cursor: not-allowed; }

  .fin-page__picker { max-width: 1100px; margin: 0 auto 1rem; background: #fff; border: 1px solid #e4e7ee; border-radius: 14px; padding: 1rem 1.25rem; display: flex; flex-direction: column; gap: 0.85rem; }
  .fin-page__quick { display: flex; gap: 0.4rem; flex-wrap: wrap; }
  .fin-page__quick button { font: inherit; font-weight: 600; color: #1D3095; background: rgba(29, 48, 149, 0.06); border: none; border-radius: 8px; padding: 0.45rem 0.85rem; cursor: pointer; }
  .fin-page__quick button:hover { background: rgba(29, 48, 149, 0.12); }
  .fin-page__range { display: flex; gap: 0.85rem; align-items: end; flex-wrap: wrap; }
  .fin-page__range label { display: flex; flex-direction: column; gap: 0.3rem; font-size: 0.85rem; color: #4a5470; }
  .fin-page__range input, .fin-page__range select { font: inherit; padding: 0.5rem 0.7rem; border: 1px solid #d6d9e3; border-radius: 8px; }

  .fin-page__error { max-width: 1100px; margin: 0 auto 1rem; background: #fdecec; color: #8a0e13; padding: 0.6rem 0.85rem; border-radius: 8px; }

  .fin-cards { max-width: 1100px; margin: 0 auto 1rem; display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 0.85rem; }
  .fin-card { background: #fff; border: 1px solid #e4e7ee; border-radius: 14px; padding: 1.1rem 1.25rem; display: flex; flex-direction: column; gap: 0.25rem; border-top: 4px solid #c0c5d4; }
  .fin-card--in { border-top-color: #1f6d3c; }
  .fin-card--out { border-top-color: #BD1218; }
  .fin-card--net-pos { border-top-color: #1D3095; }
  .fin-card--net-neg { border-top-color: #BD1218; background: #fff8f8; }
  .fin-card__label { font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; font-weight: 600; }
  .fin-card__value { font-family: 'Sora', sans-serif; font-size: 1.7rem; font-weight: 700; color: #152050; }
  .fin-card__sub { font-size: 0.82rem; color: #6b7280; }

  .fin-table-wrap { max-width: 1100px; margin: 0 auto; background: #fff; border: 1px solid #e4e7ee; border-radius: 14px; padding: 1.25rem 1.5rem; }
  .fin-table__head, .fin-table__row { display: grid; grid-template-columns: 1.4fr 1fr 1fr 1fr 1fr; gap: 0.6rem; padding: 0.6rem 0; align-items: baseline; border-bottom: 1px solid #f1f2f7; }
  .fin-table__head { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; border-bottom: 1px solid #e4e7ee; }
  .fin-table__head span:not(:first-child), .fin-table__row span:not(.fin-table__period) { text-align: right; font-variant-numeric: tabular-nums; }
  .fin-table__period { font-weight: 600; color: #152050; }
  .fin-pos { color: #1f6d3c; }
  .fin-neg { color: #8a0e13; }
  .fin-strong { font-family: 'Sora', sans-serif; font-weight: 700; }
  .fin-empty { text-align: center; color: #4a5470; padding: 2rem; }

  @media (max-width: 800px) {
    .fin-table__head { display: none; }
    .fin-table__row { grid-template-columns: 1fr 1fr; row-gap: 0.2rem; padding: 0.85rem 0; }
    .fin-table__period { grid-column: 1 / -1; }
  }
`;

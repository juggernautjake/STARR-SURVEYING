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

type Granularity = 'day' | 'week' | 'month' | 'year';

interface Summary {
  revenue_cents: number;
  payouts_cents: number;
  expenses_cents: number;
  outflow_cents: number;
  net_cents: number;
}
interface PeriodRow {
  period_key: string;
  period_start: string;
  revenue_cents: number;
  payouts_cents: number;
  expenses_cents: number;
  net_cents: number;
}
interface OverviewResponse {
  from: string;
  to: string;
  granularity: Granularity;
  summary: Summary;
  by_period: PeriodRow[];
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

  const s = data?.summary;
  const netPositive = (s?.net_cents ?? 0) >= 0;

  return (
    <main className="fin-page" data-payments-admin data-testid="finances-overview">
      <header className="fin-page__header">
        <div>
          <Link href="/admin/finances" className="fin-page__back">← Finances</Link>
          <h1 className="fin-page__title">Money in &amp; out</h1>
          <p className="fin-page__lede">
            Cash-flow overview — cleared customer payments in, employee payouts and approved
            receipts out, netted for the range. Money that actually moved.
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
        </div>
      </section>

      {error && <p className="fin-page__error" data-testid="fin-error" role="alert">{error}</p>}

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

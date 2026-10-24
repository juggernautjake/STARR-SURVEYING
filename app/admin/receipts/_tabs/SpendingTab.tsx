'use client';
// app/admin/receipts/_tabs/SpendingTab.tsx — where the money goes, by kind of thing bought.
//
// Owner, 2026-10-07: "we need to be able to do daily, weekly, monthly, quarterly, bi-yearly, and
// yearly analysis of and filtering by type of item that was purchased. That way we can determine
// what all money is going to different kinds of things."
//
// Every receipt's items are counted toward their own category (a gas-station run is fuel + meals +
// supplies), tax and tip spread over the items so the figures reconcile to what was paid
// (lib/receipts/spending.ts). Pick a period and a range; tap a category to see only it and what
// was bought most within it.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { CATEGORY_LABEL, PERIODS, type Period, type SpendReport } from '@/lib/receipts/spending';
import './SpendingTab.css';

type Report = SpendReport & { range: { from: string; to: string }; category: string | null };

const money = (c: number) => `$${(c / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const iso = (d: Date) => d.toISOString().slice(0, 10);

/** A sensible default range for each period, so a bar chart has a readable number of bars. */
function defaultRange(period: Period): { from: string; to: string } {
  const to = new Date();
  const back: Record<Period, number> = { day: 30, week: 7 * 16, month: 365, quarter: 365 * 2, half: 365 * 3, year: 365 * 5 };
  return { from: iso(new Date(to.getTime() - back[period] * 86_400_000)), to: iso(to) };
}

export default function SpendingTab(): React.ReactElement {
  const [period, setPeriod] = useState<Period>('month');
  const [range, setRange] = useState(() => defaultRange('month'));
  const [category, setCategory] = useState<string | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const qs = new URLSearchParams({ period, from: range.from, to: range.to });
    if (category) qs.set('category', category);
    try {
      const res = await fetch(`/api/admin/receipts/spending?${qs.toString()}`);
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
      setReport(j as Report);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load spending.');
    }
  }, [period, range, category]);

  useEffect(() => { void load(); }, [load]);

  const max = useMemo(() => Math.max(1, ...(report?.buckets ?? []).map((b) => b.total)), [report]);
  const order = useMemo(() => (report?.categories ?? []).map((c) => c.category), [report]);

  function choosePeriod(p: Period) {
    setPeriod(p);
    setRange(defaultRange(p));
  }

  return (
    <section className="spend" data-testid="receipts-spending">
      <div className="spend__controls">
        <div className="spend__periods" role="group" aria-label="Group by">
          {PERIODS.map((p) => (
            <button key={p.id} type="button" className="spend__chip" aria-pressed={period === p.id} onClick={() => choosePeriod(p.id)} data-testid={`spend-period-${p.id}`}>{p.label}</button>
          ))}
        </div>
        <div className="spend__range">
          <label>From <input type="date" value={range.from} max={range.to} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} /></label>
          <label>To <input type="date" value={range.to} min={range.from} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} /></label>
        </div>
      </div>

      {error ? <p className="spend__error" role="alert">{error}</p> : null}
      {!report && !error ? <p className="spend__muted">Adding up receipts…</p> : null}

      {report ? (
        <>
          <div className="spend__summary">
            <div className="spend__big">{money(report.total)}</div>
            <div className="spend__muted">
              {category ? `${CATEGORY_LABEL[category] ?? category} · ` : ''}{report.receiptCount} receipt{report.receiptCount === 1 ? '' : 's'} from {report.range.from} to {report.range.to}
              {report.excluded.rejected || report.excluded.secondSlip ? ` · not counted: ${[report.excluded.rejected ? `${report.excluded.rejected} rejected` : '', report.excluded.secondSlip ? `${report.excluded.secondSlip} second slips of a purchase already counted` : ''].filter(Boolean).join(', ')}` : ''}
            </div>
          </div>

          <div className="spend__cats" role="group" aria-label="Filter by kind of item">
            <button type="button" className="spend__cat" aria-pressed={!category} onClick={() => setCategory(null)}>All kinds</button>
            {report.categories.map((c) => (
              <button key={c.category} type="button" className={`spend__cat spend__cat--${c.category}`} aria-pressed={category === c.category} onClick={() => setCategory(category === c.category ? null : c.category)} data-testid={`spend-cat-${c.category}`}>
                <span className="spend__swatch" aria-hidden="true" />
                {c.label} <b>{money(c.total)}</b> <small>{Math.round(c.share * 100)}%</small>
              </button>
            ))}
          </div>

          {report.buckets.length === 0 ? (
            <p className="spend__muted">No receipts in this range{category ? ` with ${CATEGORY_LABEL[category] ?? category}` : ''}.</p>
          ) : (
            <ol className="spend__bars" aria-label="Spending per period">
              {report.buckets.map((b) => (
                <li key={b.key} className="spend__row">
                  <span className="spend__label">{b.label}</span>
                  <span className="spend__track" title={Object.entries(b.byCategory).map(([c, v]) => `${CATEGORY_LABEL[c] ?? c}: ${money(v)}`).join('\n')}>
                    {order.filter((c) => b.byCategory[c]).map((c) => (
                      <span key={c} className={`spend__seg spend__cat--${c}`} style={{ width: `${(b.byCategory[c] / max) * 100}%` }} />
                    ))}
                  </span>
                  <span className="spend__amt">{money(b.total)}</span>
                </li>
              ))}
            </ol>
          )}

          {report.topItems.length > 0 ? (
            <div className="spend__top">
              <h3 className="spend__h3">{category ? `Most bought in ${CATEGORY_LABEL[category] ?? category}` : 'Most bought items'}</h3>
              <table className="spend__table">
                <thead><tr><th>Item</th><th>Kind</th><th>Times</th><th>Spent</th></tr></thead>
                <tbody>
                  {report.topItems.map((t) => (
                    <tr key={`${t.category}|${t.description}`}>
                      <td>{t.description}</td>
                      <td>{CATEGORY_LABEL[t.category] ?? t.category}</td>
                      <td>{t.count}</td>
                      <td>{money(t.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="spend__muted">Item amounts are before tax and tip; the totals above include them.</p>
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

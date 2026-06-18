'use client';

// app/admin/payouts/tax-report/page.tsx
//
// P16 of payment-infrastructure-2026-06-18.md — annual + quarterly
// tax export workspace.
//
// Picker: from + to dates, with quick-pin buttons for the current
// year + each of the four quarters. The table shows one row per
// employee with payment count + total + per-method breakdown.
// Download button hits the same endpoint with ?format=csv.

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { formatDollars } from '@/lib/payments/live';
import '../../payments-admin.css';

interface EmployeeTaxRow {
  user_email: string;
  user_name: string | null;
  total_cents: number;
  by_method: Record<'venmo' | 'cashapp' | 'zelle' | 'ach' | 'cash' | 'stripe' | 'other', number>;
  payment_count: number;
  first_paid_at: string | null;
  last_paid_at: string | null;
}

interface ReportResponse {
  from: string;
  to: string;
  range_label: string;
  employees: EmployeeTaxRow[];
  totals: { total_cents: number; payment_count: number };
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function quarterRange(year: number, q: 1 | 2 | 3 | 4): { from: string; to: string } {
  const startMonth = (q - 1) * 3;
  const start = new Date(Date.UTC(year, startMonth, 1));
  const end = new Date(Date.UTC(year, startMonth + 3, 0));
  return { from: isoDate(start), to: isoDate(end) };
}

export default function PayoutTaxReportPage(): React.ReactElement {
  const today = useMemo(() => new Date(), []);
  const year = today.getUTCFullYear();
  const [from, setFrom] = useState(isoDate(new Date(Date.UTC(year, 0, 1))));
  const [to, setTo] = useState(isoDate(new Date(Date.UTC(year, 11, 31))));
  const [report, setReport] = useState<ReportResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const url = `/api/admin/payouts/tax-report?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
    const res = await fetch(url);
    setLoading(false);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? 'Failed to load report.');
      setReport(null);
      return;
    }
    setReport((await res.json()) as ReportResponse);
  }, [from, to]);
  useEffect(() => { load(); }, [load]);

  function pinYear(y: number) {
    setFrom(isoDate(new Date(Date.UTC(y, 0, 1))));
    setTo(isoDate(new Date(Date.UTC(y, 11, 31))));
  }
  function pinQuarter(q: 1 | 2 | 3 | 4) {
    const r = quarterRange(year, q);
    setFrom(r.from);
    setTo(r.to);
  }

  const downloadUrl = `/api/admin/payouts/tax-report?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&format=csv`;

  return (
    <main className="tax-page" data-payments-admin data-testid="payouts-tax-report">
      <header className="tax-page__header">
        <div>
          <Link href="/admin/payouts/runs" className="tax-page__back">← Payouts</Link>
          <h1 className="tax-page__title">Payout tax report</h1>
          <p className="tax-page__lede">
            Per-employee totals for the selected range. Aggregates only confirmed (paid) items.
            Pass the CSV to your tax preparer for 1099-NEC / W-2 prep.
          </p>
        </div>
        <a
          href={downloadUrl}
          className="tax-btn"
          target="_blank"
          rel="noreferrer"
          data-testid="tax-download-csv"
        >
          Download CSV
        </a>
      </header>

      <section className="tax-page__picker">
        <div className="tax-page__quick">
          <button type="button" onClick={() => pinYear(year)} data-testid="tax-quick-year">Year {year}</button>
          <button type="button" onClick={() => pinYear(year - 1)} data-testid="tax-quick-prev-year">Year {year - 1}</button>
          <button type="button" onClick={() => pinQuarter(1)} data-testid="tax-quick-q1">Q1 {year}</button>
          <button type="button" onClick={() => pinQuarter(2)} data-testid="tax-quick-q2">Q2 {year}</button>
          <button type="button" onClick={() => pinQuarter(3)} data-testid="tax-quick-q3">Q3 {year}</button>
          <button type="button" onClick={() => pinQuarter(4)} data-testid="tax-quick-q4">Q4 {year}</button>
        </div>
        <div className="tax-page__range">
          <label>
            <span>From</span>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} data-testid="tax-from" />
          </label>
          <label>
            <span>To</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} data-testid="tax-to" />
          </label>
          <button type="button" className="tax-btn" onClick={load} disabled={loading} data-testid="tax-load">
            {loading ? 'Loading…' : 'Recalculate'}
          </button>
        </div>
      </section>

      {error && <p className="tax-page__error" data-testid="tax-error" role="alert">{error}</p>}

      {report && (
        <section className="tax-page__table" data-testid="tax-table">
          <header className="tax-page__table-head">
            <div>
              <strong>{report.range_label}</strong>
              <span>· {report.employees.length} employee{report.employees.length === 1 ? '' : 's'}</span>
              <span>· {report.totals.payment_count} payment{report.totals.payment_count === 1 ? '' : 's'}</span>
            </div>
            <strong className="tax-page__grand" data-testid="tax-grand-total">
              {formatDollars(report.totals.total_cents)}
            </strong>
          </header>

          {report.employees.length === 0 ? (
            <p className="tax-page__empty" data-testid="tax-empty">
              No confirmed payouts in this range.
            </p>
          ) : (
            <div className="tax-table">
              <div className="tax-table__head">
                <span>Employee</span>
                <span>Count</span>
                <span>First</span>
                <span>Last</span>
                <span>Total</span>
              </div>
              {report.employees.map((r) => (
                <div className="tax-table__row" key={r.user_email} data-testid={`tax-row-${r.user_email}`}>
                  <div>
                    <div className="tax-table__email">{r.user_email}</div>
                    {r.user_name && <div className="tax-table__name">{r.user_name}</div>}
                    <div className="tax-table__methods">
                      {(['venmo', 'cashapp', 'zelle', 'ach', 'cash', 'stripe', 'other'] as const).map((k) => (
                        r.by_method[k] > 0 && (
                          <span key={k} className="tax-table__method-chip">
                            {k} {formatDollars(r.by_method[k])}
                          </span>
                        )
                      ))}
                    </div>
                  </div>
                  <div>{r.payment_count}</div>
                  <div>{r.first_paid_at ? new Date(r.first_paid_at).toLocaleDateString() : '—'}</div>
                  <div>{r.last_paid_at ? new Date(r.last_paid_at).toLocaleDateString() : '—'}</div>
                  <div className="tax-table__total">{formatDollars(r.total_cents)}</div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      <style jsx>{styles}</style>
    </main>
  );
}

const styles = `
  .tax-page {
    font-family: 'Inter', sans-serif;
    background: #f4f5f9; min-height: 100vh; color: #152050;
    padding: 2rem 1.25rem 4rem;
  }
  .tax-page__header {
    max-width: 1100px; margin: 0 auto 1.25rem;
    display: flex; gap: 1rem; flex-wrap: wrap; justify-content: space-between; align-items: flex-start;
  }
  .tax-page__back { color: #1D3095; font-weight: 600; text-decoration: none; font-size: 0.9rem; }
  .tax-page__title { font-family: 'Sora', sans-serif; font-size: 1.5rem; margin: 0.25rem 0 0.35rem; font-weight: 700; }
  .tax-page__lede { margin: 0; color: #4a5470; max-width: 740px; }

  .tax-btn {
    font: inherit; font-weight: 700; padding: 0.65rem 1.2rem;
    background: #1D3095; color: #fff; border: none; border-radius: 10px;
    text-decoration: none; cursor: pointer; display: inline-block;
  }
  .tax-btn:hover:not(:disabled) { background: #16266f; }
  .tax-btn:disabled { opacity: 0.6; cursor: not-allowed; }

  .tax-page__picker {
    max-width: 1100px; margin: 0 auto 1rem;
    background: #fff; border: 1px solid #e4e7ee; border-radius: 14px;
    padding: 1rem 1.25rem;
    display: flex; flex-direction: column; gap: 0.85rem;
  }
  .tax-page__quick { display: flex; gap: 0.4rem; flex-wrap: wrap; }
  .tax-page__quick button {
    font: inherit; font-weight: 600; color: #1D3095;
    background: rgba(29, 48, 149, 0.06); border: none; border-radius: 8px;
    padding: 0.45rem 0.85rem; cursor: pointer;
  }
  .tax-page__quick button:hover { background: rgba(29, 48, 149, 0.12); }

  .tax-page__range {
    display: flex; gap: 0.85rem; align-items: end; flex-wrap: wrap;
  }
  .tax-page__range label { display: flex; flex-direction: column; gap: 0.3rem; font-size: 0.85rem; color: #4a5470; }
  .tax-page__range input { font: inherit; padding: 0.5rem 0.7rem; border: 1px solid #d6d9e3; border-radius: 8px; }

  .tax-page__error {
    max-width: 1100px; margin: 0 auto 1rem;
    background: #fdecec; color: #8a0e13;
    padding: 0.6rem 0.85rem; border-radius: 8px;
  }
  .tax-page__empty {
    text-align: center; color: #4a5470; padding: 2rem;
  }

  .tax-page__table {
    max-width: 1100px; margin: 0 auto;
    background: #fff; border: 1px solid #e4e7ee; border-radius: 14px; padding: 1.25rem 1.5rem;
  }
  .tax-page__table-head {
    display: flex; justify-content: space-between; gap: 1rem;
    padding-bottom: 0.85rem; margin-bottom: 0.85rem;
    border-bottom: 2px solid #152050;
    align-items: baseline; flex-wrap: wrap;
  }
  .tax-page__table-head > div { display: flex; gap: 0.5rem; align-items: baseline; }
  .tax-page__table-head span { color: #6b7280; font-size: 0.85rem; }
  .tax-page__grand { font-family: 'Sora', sans-serif; font-size: 1.4rem; color: #BD1218; }

  .tax-table__head, .tax-table__row {
    display: grid; grid-template-columns: 2.5fr 0.5fr 0.8fr 0.8fr 1fr; gap: 0.6rem;
    padding: 0.65rem 0; align-items: baseline; border-bottom: 1px solid #f1f2f7;
  }
  .tax-table__head {
    font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280;
    border-bottom: 1px solid #e4e7ee;
  }
  .tax-table__email { font-weight: 600; color: #152050; overflow-wrap: anywhere; }
  .tax-table__name { font-size: 0.82rem; color: #6b7280; }
  .tax-table__total { font-family: 'Sora', sans-serif; font-weight: 700; }
  .tax-table__methods { display: flex; gap: 0.35rem; flex-wrap: wrap; margin-top: 0.4rem; }
  .tax-table__method-chip {
    font-size: 0.72rem; letter-spacing: 0.04em; text-transform: uppercase; color: #1D3095;
    background: rgba(29, 48, 149, 0.08); padding: 0.15rem 0.5rem; border-radius: 999px;
  }

  @media (max-width: 800px) {
    .tax-table__head { display: none; }
    .tax-table__row { grid-template-columns: 1fr; padding: 1rem 0; }
  }
`;

'use client';
// app/admin/reports/page.tsx
//
// Owner reports surface. Single page with five sections (jobs / hours /
// receipts / mileage / financials), driven by a date-range header.
//
// Phase R-3 of OWNER_REPORTS.md.

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

interface ReportData {
  range: { from: string; to: string };
  org: { id: string; name: string; slug: string };
  jobs: {
    started: number; inProgress: number; notStarted: number;
    completed: number; lost: number; abandoned: number;
    quotedTotalCents: number; invoicedTotalCents: number; outstandingCents: number;
    details: Array<{
      id: string; name: string; client: string | null; stage: string;
      result: 'won' | 'lost' | 'abandoned' | null;
      quoteCents: number; finalCents: number | null;
      dateStarted: string | null; dateDelivered: string | null;
      assignedTo: string | null;
    }>;
  };
  hours: {
    perEmployee: Array<{ email: string; name: string; regularHours: number; otHours: number; totalHours: number; laborCostCents: number }>;
    totalRegularHours: number; totalOtHours: number; totalLaborCostCents: number;
  };
  receipts: {
    byStatus: { approved: number; pending: number; paid: number; rejected: number };
    byCategory: Record<string, number>;
    byEmployee: Array<{ email: string; name: string; totalCents: number }>;
    entries: Array<{ id: string; date: string | null; vendor: string | null; amountCents: number; status: string; category: string | null; jobId: string | null }>;
  };
  mileage: {
    totalMiles: number; totalDollars: number;
    perEmployee: Array<{ email: string; name: string; miles: number; dollars: number }>;
    entries: Array<{ id: string; date: string; email: string | null; miles: number; dollars: number; jobId: string | null }>;
  };
  financials: {
    revenueCents: number; laborCostCents: number; receiptsCostCents: number; mileageCostCents: number;
    grossMarginCents: number; grossMarginPct: number;
    outstandingInvoicesCents: number; pendingQuotesCents: number;
  };
  warnings: string[];
}

type Preset = 'today' | 'week' | 'month' | 'quarter' | 'ytd' | 'last7' | 'last30' | 'custom';

function presetRange(p: Preset, customFrom?: string, customTo?: string): { from: string; to: string } {
  const now = new Date();
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(todayMidnight.getTime() + 24 * 60 * 60 * 1000 - 1);

  switch (p) {
    case 'today':
      return iso(todayMidnight, endOfDay);
    case 'week': {
      const day = now.getDay() || 7;
      const monday = new Date(todayMidnight);
      monday.setDate(monday.getDate() - (day - 1));
      return iso(monday, endOfDay);
    }
    case 'month':
      return iso(new Date(now.getFullYear(), now.getMonth(), 1), endOfDay);
    case 'quarter': {
      const qStartMonth = Math.floor(now.getMonth() / 3) * 3;
      return iso(new Date(now.getFullYear(), qStartMonth, 1), endOfDay);
    }
    case 'ytd':
      return iso(new Date(now.getFullYear(), 0, 1), endOfDay);
    case 'last7':
      return iso(new Date(todayMidnight.getTime() - 7 * 86400000), endOfDay);
    case 'last30':
      return iso(new Date(todayMidnight.getTime() - 30 * 86400000), endOfDay);
    case 'custom':
      return {
        from: customFrom ?? iso(new Date(now.getFullYear(), now.getMonth(), 1), endOfDay).from,
        to: customTo ?? iso(todayMidnight, endOfDay).to,
      };
  }
}

function iso(from: Date, to: Date): { from: string; to: string } {
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

function fmtMoney(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

function fmtMoneyShort(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(cents / 100);
}

export default function ReportsPage() {
  const [preset, setPreset] = useState<Preset>('month');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const range = useMemo(() => presetRange(preset, customFrom, customTo), [preset, customFrom, customTo]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/admin/reports/operations?from=${range.from}&to=${range.to}`, { cache: 'no-store' });
        if (!res.ok) {
          const err = (await res.json().catch(() => ({}))) as { error?: string };
          setError(err.error ?? `Failed (status ${res.status}).`);
          return;
        }
        const d = (await res.json()) as ReportData;
        if (!cancelled) setData(d);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [range.from, range.to]);

  return (
    <div className="reports-page">
      <header className="reports-header reports-no-print">
        <div>
          <h1>Operations Report</h1>
          {data && <p>{data.org.name} · {range.from} to {range.to}</p>}
        </div>
        <div className="reports-actions">
          <button onClick={() => window.print()} className="reports-btn reports-btn-primary">
            Print / Save PDF
          </button>
        </div>
      </header>

      {/* Print-only header */}
      <div className="reports-print-only">
        <h1>Operations Report</h1>
        {data && <p>{data.org.name} — {range.from} to {range.to}</p>}
      </div>

      <section className="reports-range reports-no-print">
        <div className="reports-chips">
          {(['today', 'week', 'month', 'quarter', 'ytd', 'last7', 'last30', 'custom'] as Preset[]).map((p) => (
            <button
              key={p}
              onClick={() => setPreset(p)}
              className={`reports-chip ${preset === p ? 'reports-chip-active' : ''}`}
            >
              {labelForPreset(p)}
            </button>
          ))}
        </div>
        {preset === 'custom' && (
          <div className="reports-custom">
            <label>
              From
              <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
            </label>
            <label>
              To
              <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
            </label>
          </div>
        )}
      </section>

      {error ? (
        <div className="reports-error">{error}</div>
      ) : loading || !data ? (
        <div className="reports-loading">Crunching…</div>
      ) : (
        <>
          {data.warnings.length > 0 && (
            <div className="reports-warnings reports-no-print">
              {data.warnings.map((w, i) => <div key={i}>⚠ {w}</div>)}
            </div>
          )}

          {/* Section 1 — Jobs */}
          <section className="reports-card">
            <h2>Jobs</h2>
            <div className="reports-stat-row">
              <Stat label="Started" value={String(data.jobs.started)} />
              <Stat label="Completed (won)" value={String(data.jobs.completed)} secondary={fmtMoneyShort(data.jobs.invoicedTotalCents)} />
              <Stat label="In progress" value={String(data.jobs.inProgress)} />
              <Stat label="Lost" value={String(data.jobs.lost)} />
              <Stat label="Not yet started" value={String(data.jobs.notStarted)} />
              <Stat label="Abandoned" value={String(data.jobs.abandoned)} />
            </div>
            <div className="reports-financial-line">
              Quoted: <strong>{fmtMoney(data.jobs.quotedTotalCents)}</strong>
              {' · '}Invoiced: <strong>{fmtMoney(data.jobs.invoicedTotalCents)}</strong>
              {' · '}Outstanding: <strong>{fmtMoney(data.jobs.outstandingCents)}</strong>
            </div>
            {data.jobs.details.length > 0 && (
              <table className="reports-table">
                <thead>
                  <tr><th>Job</th><th>Client</th><th>Stage / Result</th><th>Started</th><th>Delivered</th><th className="reports-right">Quote</th><th className="reports-right">Final</th></tr>
                </thead>
                <tbody>
                  {data.jobs.details.map((j) => (
                    <tr key={j.id}>
                      <td><Link href={`/admin/jobs/${j.id}`}>{j.name}</Link></td>
                      <td>{j.client ?? '—'}</td>
                      <td>{j.result ?? j.stage}</td>
                      <td>{j.dateStarted ? new Date(j.dateStarted).toLocaleDateString() : '—'}</td>
                      <td>{j.dateDelivered ? new Date(j.dateDelivered).toLocaleDateString() : '—'}</td>
                      <td className="reports-right">{fmtMoney(j.quoteCents)}</td>
                      <td className="reports-right">{j.finalCents === null ? '—' : fmtMoney(j.finalCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          {/* Section 2 — Hours */}
          <section className="reports-card">
            <h2>Employee Hours</h2>
            <div className="reports-financial-line">
              Regular: <strong>{data.hours.totalRegularHours.toFixed(1)}h</strong>
              {' · '}OT: <strong>{data.hours.totalOtHours.toFixed(1)}h</strong>
              {' · '}Labor cost: <strong>{fmtMoney(data.hours.totalLaborCostCents)}</strong>
            </div>
            {data.hours.perEmployee.length > 0 ? (
              <table className="reports-table">
                <thead>
                  <tr><th>Employee</th><th className="reports-right">Regular</th><th className="reports-right">OT</th><th className="reports-right">Total</th><th className="reports-right">Labor</th></tr>
                </thead>
                <tbody>
                  {data.hours.perEmployee.map((e) => (
                    <tr key={e.email}>
                      <td>{e.name}</td>
                      <td className="reports-right">{e.regularHours.toFixed(1)}</td>
                      <td className="reports-right">{e.otHours.toFixed(1)}</td>
                      <td className="reports-right"><strong>{e.totalHours.toFixed(1)}</strong></td>
                      <td className="reports-right">{fmtMoney(e.laborCostCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <p className="reports-empty">No time entries in this window.</p>}
          </section>

          {/* Section 3 — Receipts */}
          <section className="reports-card">
            <h2>Receipts</h2>
            <div className="reports-financial-line">
              Approved: <strong>{fmtMoney(data.receipts.byStatus.approved)}</strong>
              {' · '}Paid: <strong>{fmtMoney(data.receipts.byStatus.paid)}</strong>
              {' · '}Pending: <strong>{fmtMoney(data.receipts.byStatus.pending)}</strong>
              {' · '}Rejected: <strong>{fmtMoney(data.receipts.byStatus.rejected)}</strong>
            </div>
            {Object.keys(data.receipts.byCategory).length > 0 && (
              <div className="reports-pills">
                {Object.entries(data.receipts.byCategory).sort((a, b) => b[1] - a[1]).map(([cat, cents]) => (
                  <span key={cat} className="reports-pill">
                    {cat}: {fmtMoney(cents)}
                  </span>
                ))}
              </div>
            )}
            {data.receipts.entries.length > 0 ? (
              <table className="reports-table">
                <thead>
                  <tr><th>Date</th><th>Vendor</th><th>Category</th><th>Status</th><th className="reports-right">Amount</th></tr>
                </thead>
                <tbody>
                  {data.receipts.entries.map((r) => (
                    <tr key={r.id}>
                      <td>{r.date ? new Date(r.date).toLocaleDateString() : '—'}</td>
                      <td>{r.vendor ?? '—'}</td>
                      <td>{r.category ?? '—'}</td>
                      <td>{r.status}</td>
                      <td className="reports-right">{fmtMoney(r.amountCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <p className="reports-empty">No receipts in this window.</p>}
          </section>

          {/* Section 4 — Mileage */}
          <section className="reports-card">
            <h2>Mileage</h2>
            <div className="reports-financial-line">
              Total miles: <strong>{data.mileage.totalMiles.toFixed(1)}</strong>
              {' · '}Reimbursement: <strong>${data.mileage.totalDollars.toFixed(2)}</strong>
            </div>
            {data.mileage.perEmployee.length > 0 ? (
              <table className="reports-table">
                <thead>
                  <tr><th>Employee</th><th className="reports-right">Miles</th><th className="reports-right">Dollars</th></tr>
                </thead>
                <tbody>
                  {data.mileage.perEmployee.map((m) => (
                    <tr key={m.email}>
                      <td>{m.name}</td>
                      <td className="reports-right">{m.miles.toFixed(1)}</td>
                      <td className="reports-right">${m.dollars.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <p className="reports-empty">No mileage entries in this window.</p>}
          </section>

          {/* Section 5 — Financials */}
          <section className="reports-card">
            <h2>Financial Roll-up</h2>
            <table className="reports-table reports-finance-table">
              <tbody>
                <tr><td>Revenue (jobs invoiced)</td><td className="reports-right">{fmtMoney(data.financials.revenueCents)}</td></tr>
                <tr><td className="reports-indent">– Labor cost</td><td className="reports-right">({fmtMoney(data.financials.laborCostCents)})</td></tr>
                <tr><td className="reports-indent">– Receipts (approved + paid)</td><td className="reports-right">({fmtMoney(data.financials.receiptsCostCents)})</td></tr>
                <tr><td className="reports-indent">– Mileage</td><td className="reports-right">({fmtMoney(data.financials.mileageCostCents)})</td></tr>
                <tr className="reports-finance-total">
                  <td><strong>Gross margin</strong></td>
                  <td className="reports-right">
                    <strong>{fmtMoney(data.financials.grossMarginCents)}</strong>{' '}
                    <span className="reports-muted">({data.financials.grossMarginPct.toFixed(1)}%)</span>
                  </td>
                </tr>
                <tr><td>Outstanding invoices</td><td className="reports-right">{fmtMoney(data.financials.outstandingInvoicesCents)}</td></tr>
                <tr><td>Quotes pending acceptance</td><td className="reports-right">{fmtMoney(data.financials.pendingQuotesCents)}</td></tr>
              </tbody>
            </table>
          </section>
        </>
      )}

      <style jsx>{`
        .reports-page {
          max-width: 1100px;
          margin: 0 auto;
          padding: 1.5rem;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
          color: #0F1419;
        }
        .reports-header {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          margin-bottom: 1rem;
        }
        .reports-header h1 {
          font-family: 'Sora', sans-serif;
          font-size: 1.8rem;
          margin: 0 0 0.25rem;
        }
        .reports-header p {
          color: #6B7280;
          margin: 0;
        }
        .reports-print-only {
          display: none;
        }
        .reports-actions { display: flex; gap: 0.5rem; }
        .reports-btn {
          padding: 0.55rem 1.1rem;
          background: #FFF;
          color: #1D3095;
          border: 1px solid #C7D2FE;
          border-radius: 6px;
          font-weight: 600;
          font-size: 0.88rem;
          cursor: pointer;
          font-family: inherit;
        }
        .reports-btn-primary {
          background: #1D3095;
          color: #FFF;
          border-color: #1D3095;
        }
        .reports-range {
          background: #FFF;
          border: 1px solid #E5E7EB;
          border-radius: 10px;
          padding: 1rem;
          margin-bottom: 1.25rem;
        }
        .reports-chips {
          display: flex;
          flex-wrap: wrap;
          gap: 0.4rem;
        }
        .reports-chip {
          padding: 0.35rem 0.8rem;
          background: #F3F4F6;
          color: #374151;
          border: 0;
          border-radius: 999px;
          font-size: 0.82rem;
          font-weight: 500;
          cursor: pointer;
          font-family: inherit;
        }
        .reports-chip-active {
          background: #1D3095;
          color: #FFF;
        }
        .reports-custom {
          margin-top: 0.75rem;
          display: flex;
          gap: 1rem;
        }
        .reports-custom label {
          display: flex;
          flex-direction: column;
          gap: 0.2rem;
          font-size: 0.78rem;
          color: #6B7280;
          font-weight: 600;
        }
        .reports-custom input {
          padding: 0.35rem 0.55rem;
          border: 1px solid #D1D5DB;
          border-radius: 5px;
          font-size: 0.85rem;
          font-family: inherit;
        }
        .reports-card {
          background: #FFF;
          border: 1px solid #E5E7EB;
          border-radius: 10px;
          padding: 1.25rem;
          margin-bottom: 1rem;
        }
        .reports-card h2 {
          font-family: 'Sora', sans-serif;
          font-size: 1.2rem;
          margin: 0 0 0.85rem;
        }
        .reports-stat-row {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
          gap: 0.6rem;
          margin-bottom: 0.85rem;
        }
        .reports-financial-line {
          padding: 0.5rem 0.75rem;
          background: #F9FAFB;
          border-radius: 6px;
          font-size: 0.88rem;
          margin-bottom: 0.85rem;
        }
        .reports-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.85rem;
        }
        .reports-table th, .reports-table td {
          text-align: left;
          padding: 0.5rem 0.6rem;
          border-bottom: 1px solid #F3F4F6;
        }
        .reports-table th {
          font-weight: 600;
          color: #6B7280;
          background: #F9FAFB;
        }
        .reports-table td :global(a) {
          color: #1D3095;
          text-decoration: none;
          font-weight: 600;
        }
        .reports-right { text-align: right; }
        .reports-indent { padding-left: 1.5rem; color: #6B7280; }
        .reports-finance-total td {
          border-top: 2px solid #0F1419;
          padding-top: 0.6rem;
        }
        .reports-finance-table { max-width: 540px; }
        .reports-muted { color: #6B7280; font-weight: 400; }
        .reports-pills { display: flex; flex-wrap: wrap; gap: 0.4rem; margin-bottom: 0.85rem; }
        .reports-pill {
          padding: 0.2rem 0.6rem;
          background: #EEF2FF;
          color: #1D3095;
          border-radius: 999px;
          font-size: 0.78rem;
          font-weight: 500;
        }
        .reports-empty {
          color: #6B7280;
          font-size: 0.88rem;
          font-style: italic;
        }
        .reports-warnings {
          background: #FFFBEB;
          border: 1px solid #FCD34D;
          border-radius: 8px;
          padding: 0.6rem 0.85rem;
          font-size: 0.82rem;
          margin-bottom: 1rem;
        }
        .reports-error, .reports-loading {
          background: #FFF;
          border: 1px solid #E5E7EB;
          border-radius: 10px;
          padding: 2rem;
          text-align: center;
          color: #6B7280;
        }

        /* Print stylesheet — turn the page into a clean PDF. */
        @media print {
          .reports-page {
            max-width: none;
            padding: 0;
          }
          .reports-no-print { display: none !important; }
          .reports-print-only {
            display: block;
            margin-bottom: 1rem;
            border-bottom: 2px solid #000;
            padding-bottom: 0.5rem;
          }
          .reports-print-only h1 {
            font-size: 1.6rem;
            margin: 0;
          }
          .reports-print-only p {
            margin: 0.2rem 0 0;
            color: #000;
          }
          .reports-card {
            border: 1px solid #000;
            border-radius: 0;
            box-shadow: none;
            page-break-inside: avoid;
            background: #FFF;
            color: #000;
          }
          .reports-financial-line {
            background: #F0F0F0;
          }
          .reports-table th {
            background: #F0F0F0;
            color: #000;
          }
          .reports-chip-active, .reports-pill {
            background: #DDD !important;
            color: #000 !important;
          }
          @page {
            size: letter;
            margin: 0.6in;
          }
        }
      `}</style>
    </div>
  );
}

function Stat({ label, value, secondary }: { label: string; value: string; secondary?: string }) {
  return (
    <div style={{
      padding: '0.7rem 0.85rem',
      background: '#F9FAFB',
      border: '1px solid #E5E7EB',
      borderRadius: 8,
    }}>
      <div style={{ fontSize: '0.7rem', color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>
        {label}
      </div>
      <div style={{ fontFamily: 'Sora, sans-serif', fontSize: '1.5rem', fontWeight: 600, marginTop: '0.15rem' }}>
        {value}
      </div>
      {secondary && (
        <div style={{ fontSize: '0.76rem', color: '#6B7280', marginTop: '0.15rem' }}>{secondary}</div>
      )}
    </div>
  );
}

function labelForPreset(p: Preset): string {
  switch (p) {
    case 'today': return 'Today';
    case 'week': return 'This Week';
    case 'month': return 'This Month';
    case 'quarter': return 'This Quarter';
    case 'ytd': return 'YTD';
    case 'last7': return 'Last 7d';
    case 'last30': return 'Last 30d';
    case 'custom': return 'Custom';
  }
}

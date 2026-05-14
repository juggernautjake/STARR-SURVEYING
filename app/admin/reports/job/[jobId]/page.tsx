'use client';
// app/admin/reports/job/[jobId]/page.tsx
//
// Per-job operations report. Header + per-employee hours + receipts +
// mileage + payouts (referencing notes='job:<id>') + financial
// roll-up. Click-through from the Jobs section of /admin/reports.
//
// Phase R-12 of OWNER_REPORTS.md.

import { use, useEffect, useState } from 'react';
import Link from 'next/link';

interface JobReport {
  job: {
    id: string;
    name: string;
    clientName: string | null;
    jobNumber: string | null;
    address: string | null;
    stage: string;
    result: 'won' | 'lost' | 'abandoned' | null;
    resultSetAt: string | null;
    resultReason: string | null;
    quoteCents: number;
    finalCents: number | null;
    dateReceived: string | null;
    dateQuoted: string | null;
    dateAccepted: string | null;
    dateStarted: string | null;
    dateDelivered: string | null;
    assignedTo: string | null;
    createdAt: string;
  };
  hours: {
    perEmployee: Array<{ email: string; name: string; regularHours: number; otHours: number; laborCostCents: number }>;
    totalRegularHours: number;
    totalOtHours: number;
    totalLaborCostCents: number;
  };
  receipts: {
    entries: Array<{ id: string; userId: string | null; vendor: string | null; date: string | null; amountCents: number; status: string; category: string | null }>;
    totalCents: number;
  };
  mileage: {
    entries: Array<{ id: string; userEmail: string | null; miles: number; dollarsCents: number; date: string }>;
    totalMiles: number;
    totalCents: number;
  };
  payouts: {
    entries: Array<{ id: string; userEmail: string; amountCents: number; method: string; reference: string | null; paidAt: string; notes: string | null }>;
    totalCents: number;
  };
  financials: {
    revenueCents: number;
    totalCostCents: number;
    grossMarginCents: number;
    grossMarginPct: number;
  };
}

function fmtMoney(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString();
}

interface PageProps { params: Promise<{ jobId: string }> }

export default function JobReportPage({ params }: PageProps) {
  const { jobId } = use(params);
  const [data, setData] = useState<JobReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/admin/reports/job/${jobId}`, { cache: 'no-store' });
        if (!res.ok) {
          setError(`Couldn't load job report (status ${res.status}).`);
          return;
        }
        const d = (await res.json()) as JobReport;
        if (!cancelled) setData(d);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed.');
      }
    })();
    return () => { cancelled = true; };
  }, [jobId]);

  if (error) {
    return <div className="job-page"><div className="job-error">{error}</div></div>;
  }
  if (!data) {
    return <div className="job-page"><div className="job-loading">Loading…</div></div>;
  }

  const { job, hours, receipts, mileage, payouts, financials } = data;

  return (
    <div className="job-page">
      <header className="job-no-print">
        <Link href="/admin/reports">← All reports</Link>
        <Link href={`/admin/jobs/${job.id}`}>Open job →</Link>
        <button onClick={() => window.print()} className="job-btn-primary">Print / Save PDF</button>
      </header>

      <div className="job-print-only">
        <h1>Job Report — {job.name}</h1>
        <p>{job.clientName ?? ''} · Generated {new Date().toLocaleDateString()}</p>
      </div>

      <section className="job-card">
        <h2 className="job-no-print">
          {job.name}
          {job.jobNumber && <code style={{ marginLeft: '0.5rem', fontFamily: 'JetBrains Mono, ui-monospace, monospace', fontSize: '0.85rem', color: '#6B7280' }}>{job.jobNumber}</code>}
        </h2>
        <div className="job-meta">
          <KV k="Client" v={job.clientName ?? '—'} />
          <KV k="Address" v={job.address ?? '—'} />
          <KV k="Stage" v={job.stage} />
          <KV k="Result" v={job.result ?? '—'} />
          <KV k="Assigned to" v={job.assignedTo ?? '—'} />
          <KV k="Date received" v={fmtDate(job.dateReceived)} />
          <KV k="Date quoted" v={fmtDate(job.dateQuoted)} />
          <KV k="Date accepted" v={fmtDate(job.dateAccepted)} />
          <KV k="Date started" v={fmtDate(job.dateStarted)} />
          <KV k="Date delivered" v={fmtDate(job.dateDelivered)} />
          <KV k="Quote" v={fmtMoney(job.quoteCents)} />
          <KV k="Final" v={job.finalCents === null ? '—' : fmtMoney(job.finalCents)} />
        </div>
        {job.resultReason && (
          <div className="job-result-reason">
            <strong>Result reason:</strong> {job.resultReason}
          </div>
        )}
      </section>

      <section className="job-card">
        <h2>Hours on this job</h2>
        <div className="job-financial-line">
          Regular: <strong>{hours.totalRegularHours.toFixed(1)}h</strong>
          {' · '}OT: <strong>{hours.totalOtHours.toFixed(1)}h</strong>
          {' · '}Labor cost: <strong>{fmtMoney(hours.totalLaborCostCents)}</strong>
        </div>
        {hours.perEmployee.length > 0 ? (
          <table className="job-table">
            <thead>
              <tr><th>Employee</th><th className="right">Regular</th><th className="right">OT</th><th className="right">Labor</th></tr>
            </thead>
            <tbody>
              {hours.perEmployee.map((e) => (
                <tr key={e.email}>
                  <td>{e.name}</td>
                  <td className="right">{e.regularHours.toFixed(1)}</td>
                  <td className="right">{e.otHours.toFixed(1)}</td>
                  <td className="right">{fmtMoney(e.laborCostCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="job-empty">No time entries on this job.</p>}
      </section>

      <section className="job-card">
        <h2>Receipts on this job</h2>
        <div className="job-financial-line">
          Total: <strong>{fmtMoney(receipts.totalCents)}</strong>
        </div>
        {receipts.entries.length > 0 ? (
          <table className="job-table">
            <thead>
              <tr><th>Date</th><th>Vendor</th><th>Category</th><th>Status</th><th className="right">Amount</th></tr>
            </thead>
            <tbody>
              {receipts.entries.map((r) => (
                <tr key={r.id}>
                  <td>{fmtDate(r.date)}</td>
                  <td>{r.vendor ?? '—'}</td>
                  <td>{r.category ?? '—'}</td>
                  <td>{r.status}</td>
                  <td className="right">{fmtMoney(r.amountCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="job-empty">No receipts attributed to this job.</p>}
      </section>

      <section className="job-card">
        <h2>Mileage on this job</h2>
        <div className="job-financial-line">
          Total miles: <strong>{mileage.totalMiles.toFixed(1)}</strong>
          {' · '}Reimbursement: <strong>{fmtMoney(mileage.totalCents)}</strong>
        </div>
        {mileage.entries.length > 0 ? (
          <table className="job-table">
            <thead>
              <tr><th>Date</th><th>Employee</th><th className="right">Miles</th><th className="right">Dollars</th></tr>
            </thead>
            <tbody>
              {mileage.entries.map((m) => (
                <tr key={m.id}>
                  <td>{fmtDate(m.date)}</td>
                  <td>{m.userEmail ?? '—'}</td>
                  <td className="right">{m.miles.toFixed(1)}</td>
                  <td className="right">{fmtMoney(m.dollarsCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="job-empty">No mileage entries on this job.</p>}
      </section>

      {payouts.entries.length > 0 && (
        <section className="job-card">
          <h2>Payouts attributed to this job</h2>
          <div className="job-financial-line">
            Total: <strong>{fmtMoney(payouts.totalCents)}</strong>
          </div>
          <table className="job-table">
            <thead>
              <tr><th>Paid on</th><th>Employee</th><th>Method</th><th>Reference</th><th className="right">Amount</th></tr>
            </thead>
            <tbody>
              {payouts.entries.map((p) => (
                <tr key={p.id}>
                  <td>{fmtDate(p.paidAt)}</td>
                  <td>{p.userEmail}</td>
                  <td>{p.method}</td>
                  <td><code>{p.reference ?? '—'}</code></td>
                  <td className="right">{fmtMoney(p.amountCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className="job-card">
        <h2>Financial Roll-up</h2>
        <table className="job-table">
          <tbody>
            <tr><td>Revenue (final amount)</td><td className="right">{fmtMoney(financials.revenueCents)}</td></tr>
            <tr><td className="indent">– Labor</td><td className="right">({fmtMoney(hours.totalLaborCostCents)})</td></tr>
            <tr><td className="indent">– Receipts</td><td className="right">({fmtMoney(receipts.totalCents)})</td></tr>
            <tr><td className="indent">– Mileage</td><td className="right">({fmtMoney(mileage.totalCents)})</td></tr>
            <tr className="job-total">
              <td><strong>Gross margin</strong></td>
              <td className="right">
                <strong>{fmtMoney(financials.grossMarginCents)}</strong>{' '}
                <span style={{ color: '#6B7280', fontWeight: 400 }}>({financials.grossMarginPct.toFixed(1)}%)</span>
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <style jsx>{`
        .job-page {
          max-width: 1000px;
          margin: 0 auto;
          padding: 1.5rem;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
          color: #0F1419;
        }
        header.job-no-print {
          display: flex;
          gap: 1rem;
          align-items: center;
          margin-bottom: 1.25rem;
        }
        header.job-no-print :global(a) {
          color: #1D3095;
          font-size: 0.85rem;
          text-decoration: none;
          font-weight: 600;
        }
        .job-btn-primary {
          margin-left: auto;
          padding: 0.55rem 1.1rem;
          background: #1D3095;
          color: #FFF;
          border: 0;
          border-radius: 6px;
          font-weight: 600;
          font-size: 0.88rem;
          cursor: pointer;
          font-family: inherit;
        }
        .job-print-only { display: none; }
        .job-card {
          background: #FFF;
          border: 1px solid #E5E7EB;
          border-radius: 10px;
          padding: 1.25rem;
          margin-bottom: 1rem;
        }
        .job-card h2 {
          font-family: 'Sora', sans-serif;
          font-size: 1.2rem;
          margin: 0 0 0.85rem;
        }
        .job-meta {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 0.4rem;
        }
        .job-result-reason {
          margin-top: 0.85rem;
          padding: 0.55rem 0.75rem;
          background: #FFFBEB;
          border-radius: 6px;
          font-size: 0.88rem;
        }
        .job-financial-line {
          padding: 0.5rem 0.75rem;
          background: #F9FAFB;
          border-radius: 6px;
          font-size: 0.88rem;
          margin-bottom: 0.85rem;
        }
        .job-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.85rem;
        }
        .job-table th, .job-table td {
          text-align: left;
          padding: 0.5rem 0.6rem;
          border-bottom: 1px solid #F3F4F6;
        }
        .job-table th {
          font-weight: 600;
          color: #6B7280;
          background: #F9FAFB;
        }
        .right { text-align: right; }
        .indent { padding-left: 1.5rem; color: #6B7280; }
        .job-total td { border-top: 2px solid #0F1419; padding-top: 0.6rem; }
        .job-empty { color: #6B7280; font-size: 0.88rem; font-style: italic; margin: 0; }
        .job-loading, .job-error {
          background: #FFF;
          border: 1px solid #E5E7EB;
          border-radius: 10px;
          padding: 2rem;
          text-align: center;
          color: #6B7280;
        }
        .job-table code {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 0.82rem;
          color: #374151;
        }

        @media print {
          .job-page { max-width: none; padding: 0; }
          .job-no-print { display: none !important; }
          .job-print-only { display: block; margin-bottom: 1rem; border-bottom: 2px solid #000; padding-bottom: 0.5rem; }
          .job-print-only h1 { font-size: 1.6rem; margin: 0; }
          .job-print-only p { margin: 0.2rem 0 0; color: #000; }
          .job-card {
            border: 1px solid #000;
            border-radius: 0;
            page-break-inside: avoid;
            background: #FFF;
          }
          @page { size: letter; margin: 0.6in; }
        }
      `}</style>
    </div>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.25rem 0', borderBottom: '1px solid #F3F4F6', fontSize: '0.85rem', gap: '0.5rem' }}>
      <span style={{ color: '#6B7280' }}>{k}</span>
      <span style={{ textAlign: 'right', wordBreak: 'break-word' }}>{v}</span>
    </div>
  );
}

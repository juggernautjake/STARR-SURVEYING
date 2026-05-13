'use client';
// app/admin/billing/invoices/page.tsx
//
// Invoice history for the customer billing portal. Phase D-2.
// Pulls from /api/admin/billing/invoices which mirrors the Stripe
// invoice ledger.
//
// Spec: docs/planning/in-progress/CUSTOMER_PORTAL.md §3.3 (Invoices tab).

import Link from 'next/link';
import { useEffect, useState } from 'react';

interface Invoice {
  id: string;
  stripeInvoiceId: string;
  number: string | null;
  status: string;
  amountDueCents: number;
  amountPaidCents: number;
  amountRefundedCents: number;
  currency: string;
  periodStart: string | null;
  periodEnd: string | null;
  hostedUrl: string | null;
  pdfUrl: string | null;
  createdAt: string;
}

const STATUS_COLORS: Record<string, string> = {
  paid:          '#059669',
  open:          '#1D3095',
  draft:         '#6B7280',
  void:          '#9CA3AF',
  uncollectible: '#BD1218',
};

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/admin/billing/invoices', { cache: 'no-store' });
        if (!res.ok) {
          setError(`Couldn't load invoices (status ${res.status}).`);
          return;
        }
        const data = (await res.json()) as { invoices: Invoice[] };
        if (!cancelled) setInvoices(data.invoices ?? []);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load.');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  function fmtMoney(cents: number, ccy: string): string {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: ccy.toUpperCase() })
      .format(cents / 100);
  }

  return (
    <div className="invoices-page">
      <Link href="/admin/billing" className="invoices-back">← Back to billing</Link>
      <header>
        <h1>Invoices</h1>
        <p>Every invoice for your subscription. Stripe-hosted; click an entry for the full PDF.</p>
      </header>

      {error ? (
        <div className="invoices-error">{error}</div>
      ) : !invoices ? (
        <div className="invoices-loading">Loading…</div>
      ) : invoices.length === 0 ? (
        <div className="invoices-empty">
          <p>No invoices yet.</p>
          <p>Invoices appear here after your first paid billing cycle.</p>
        </div>
      ) : (
        <table className="invoices-table">
          <thead>
            <tr>
              <th>Number</th>
              <th>Date</th>
              <th>Period</th>
              <th>Status</th>
              <th>Amount</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => (
              <tr key={inv.id}>
                <td>
                  <code>{inv.number ?? inv.stripeInvoiceId.slice(0, 12) + '…'}</code>
                </td>
                <td>{new Date(inv.createdAt).toLocaleDateString()}</td>
                <td>
                  {inv.periodStart && inv.periodEnd ? (
                    <>
                      {new Date(inv.periodStart).toLocaleDateString()} → {new Date(inv.periodEnd).toLocaleDateString()}
                    </>
                  ) : '—'}
                </td>
                <td>
                  <span style={{ color: STATUS_COLORS[inv.status] ?? '#6B7280', fontWeight: 600 }}>
                    {inv.status}
                  </span>
                </td>
                <td>
                  {fmtMoney(inv.amountDueCents, inv.currency)}
                  {inv.amountRefundedCents > 0 ? (
                    <em style={{ color: '#BD1218', fontSize: '0.78rem', marginLeft: '0.4rem' }}>
                      (− {fmtMoney(inv.amountRefundedCents, inv.currency)})
                    </em>
                  ) : null}
                </td>
                <td>
                  {inv.pdfUrl ? (
                    <a href={inv.pdfUrl} target="_blank" rel="noopener noreferrer">PDF ↗</a>
                  ) : inv.hostedUrl ? (
                    <a href={inv.hostedUrl} target="_blank" rel="noopener noreferrer">View ↗</a>
                  ) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <style jsx>{`
        .invoices-page {
          max-width: 900px;
          margin: 0 auto;
          padding: 1.5rem;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
          color: #0F1419;
        }
        .invoices-back { color: #6B7280; text-decoration: none; font-size: 0.85rem; }
        .invoices-back:hover { color: #1D3095; }
        header { margin: 0.75rem 0 1.5rem; }
        header h1 {
          font-family: 'Sora', sans-serif;
          font-size: 1.8rem;
          font-weight: 600;
          margin: 0 0 0.25rem;
        }
        header p { color: #6B7280; margin: 0; font-size: 0.92rem; }
        .invoices-loading, .invoices-error, .invoices-empty {
          padding: 2rem;
          text-align: center;
          color: #6B7280;
          background: #F9FAFB;
          border: 1px solid #E5E7EB;
          border-radius: 12px;
        }
        .invoices-empty p:first-child { font-weight: 600; color: #1F2937; margin: 0 0 0.5rem; }
        .invoices-empty p { margin: 0; }
        .invoices-table {
          width: 100%;
          background: #FFF;
          border: 1px solid #E5E7EB;
          border-radius: 12px;
          border-collapse: separate;
          border-spacing: 0;
          overflow: hidden;
        }
        .invoices-table th, .invoices-table td {
          padding: 0.65rem 0.95rem;
          font-size: 0.88rem;
          text-align: left;
          border-bottom: 1px solid #F3F4F6;
        }
        .invoices-table th {
          background: #F9FAFB;
          font-weight: 600;
          color: #4B5563;
          font-size: 0.78rem;
        }
        .invoices-table tr:last-child td { border-bottom: 0; }
        .invoices-table code {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 0.82rem;
          color: #4B5563;
        }
        .invoices-table a {
          color: #1D3095;
          text-decoration: none;
          font-size: 0.85rem;
        }
        .invoices-table a:hover { text-decoration: underline; }
      `}</style>
    </div>
  );
}

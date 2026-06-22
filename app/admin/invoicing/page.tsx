'use client';

// app/admin/invoicing/page.tsx
//
// S6 of CUSTOMER_INVOICING_BUILD_2026-06-21.md — office invoicing dashboard.
// Lists every customer invoice with status + total, links to the composer
// (/admin/invoices/new), the payments inbox (/admin/payments/inbox), each
// invoice's customer pay page, and a one-click copy of the direct pay link.
//
// Backend page — gated by admin login (no extra password). The customer-facing
// /pay portal is the password-gated surface (S7).

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { describeInvoiceStatus, formatDollars } from '@/lib/payments/live';
import '../payments-admin.css';

const TONE_COLORS: Record<string, { bg: string; fg: string }> = {
  success: { bg: '#E7F6EC', fg: '#1B7A3D' },
  warn: { bg: '#FFF4E0', fg: '#8A5A12' },
  danger: { bg: '#FDECEC', fg: '#9C0E13' },
  info: { bg: '#EAF0FB', fg: '#1D3095' },
};

interface InvoiceRow {
  id: string;
  invoice_number: string;
  public_slug: string;
  status: string;
  customer_name: string | null;
  customer_email: string | null;
  total_cents: number;
  issued_at: string | null;
  due_at: string | null;
  paid_at: string | null;
  created_at: string;
}

export default function InvoicingDashboardPage(): React.ReactElement {
  const [invoices, setInvoices] = useState<InvoiceRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/admin/invoices')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j) => { if (!cancelled) setInvoices((j.invoices ?? []) as InvoiceRow[]); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load'); });
    return () => { cancelled = true; };
  }, []);

  const filtered = (invoices ?? []).filter((inv) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      inv.invoice_number.toLowerCase().includes(q) ||
      (inv.customer_name ?? '').toLowerCase().includes(q) ||
      (inv.customer_email ?? '').toLowerCase().includes(q)
    );
  });

  function payLink(slug: string): string {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    return `${origin}/pay/${slug}`;
  }

  function copyLink(inv: InvoiceRow) {
    navigator.clipboard?.writeText(payLink(inv.public_slug)).then(
      () => { setCopiedId(inv.id); window.setTimeout(() => setCopiedId(null), 2000); },
      () => {},
    );
  }

  return (
    <main className="invoice-page" data-payments-admin data-testid="invoicing-dashboard">
      <div className="invoice-page__card" style={{ maxWidth: 1100 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div>
            <h1 className="invoice-page__title">Invoicing</h1>
            <p className="invoice-page__lede">Create, send, and track customer invoices + payments.</p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <Link href="/admin/payments/inbox" className="invoice-btn invoice-btn--ghost">Payments inbox</Link>
            <Link href="/admin/invoices/new" className="invoice-btn" data-testid="invoicing-new">+ New invoice</Link>
          </div>
        </div>

        <input
          type="search"
          placeholder="Search by invoice #, customer name, or email…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          data-testid="invoicing-search"
          style={{ font: 'inherit', padding: '0.6rem 0.8rem', border: '1px solid #d6d9e3', borderRadius: 8, width: '100%', margin: '1rem 0' }}
        />

        {error && <p className="invoice-page__error" role="alert">Couldn&rsquo;t load invoices: {error}</p>}

        {invoices === null && !error && <p data-testid="invoicing-loading">Loading invoices…</p>}

        {invoices !== null && filtered.length === 0 && (
          <div data-testid="invoicing-empty" style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>
            {invoices.length === 0 ? 'No invoices yet. Create your first one.' : 'No invoices match your search.'}
          </div>
        )}

        {filtered.length > 0 && (
          <div className="invoice-items" data-testid="invoicing-list">
            <div className="invoice-items__head" style={{ gridTemplateColumns: '1.2fr 2fr 1fr 1fr 1.6fr' }}>
              <span>Invoice</span>
              <span>Customer</span>
              <span>Total</span>
              <span>Status</span>
              <span>Actions</span>
            </div>
            {filtered.map((inv) => {
              const status = describeInvoiceStatus(inv.status);
              return (
                <div
                  className="invoice-items__row"
                  key={inv.id}
                  data-testid={`invoicing-row-${inv.invoice_number}`}
                  style={{ gridTemplateColumns: '1.2fr 2fr 1fr 1fr 1.6fr' }}
                >
                  <span style={{ fontWeight: 600 }}>{inv.invoice_number}</span>
                  <span>
                    {inv.customer_name || '—'}
                    {inv.customer_email && (
                      <span style={{ display: 'block', fontSize: '0.8rem', color: '#6b7280' }}>{inv.customer_email}</span>
                    )}
                  </span>
                  <span>{formatDollars(inv.total_cents)}</span>
                  <span>
                    <span
                      style={{
                        fontSize: '0.75rem',
                        padding: '0.15rem 0.55rem',
                        borderRadius: 999,
                        fontWeight: 600,
                        background: (TONE_COLORS[status.tone] ?? TONE_COLORS.info).bg,
                        color: (TONE_COLORS[status.tone] ?? TONE_COLORS.info).fg,
                      }}
                    >
                      {status.label}
                    </span>
                  </span>
                  <span style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                    <a href={payLink(inv.public_slug)} target="_blank" rel="noreferrer" className="invoice-btn invoice-btn--ghost" style={{ padding: '0.35rem 0.7rem', fontSize: '0.82rem' }}>
                      View
                    </a>
                    <button
                      type="button"
                      className="invoice-btn invoice-btn--ghost"
                      style={{ padding: '0.35rem 0.7rem', fontSize: '0.82rem' }}
                      onClick={() => copyLink(inv)}
                      data-testid={`invoicing-copy-${inv.invoice_number}`}
                    >
                      {copiedId === inv.id ? 'Copied ✓' : 'Copy link'}
                    </button>
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}

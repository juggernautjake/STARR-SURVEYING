'use client';

// app/pay/[invoice]/page.tsx
//
// P4 of payment-infrastructure-2026-06-18.md — customer invoice
// detail surface. Reads `/api/public/invoice/[number]`, renders:
//   - greeting + invoice header (number, status pill, due date)
//   - line items + totals
//   - payment-method picker
//
// Per the user ask, the page is built but NOT wired. Each method
// renders an info card with a "Wiring coming after PNC setup" toast
// on click. Stripe ships its form stub in P5; cash/check pledge in
// P7; deep-link click-throughs in P6.

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  PAYMENT_METHODS,
  buildDeepLink,
  describeInvoiceStatus,
  formatDollars,
} from '@/lib/payments/live';
import '../../styles/Pay.css';

interface LineItemPublic {
  description: string;
  quantity: number;
  unit_price_cents: number;
  total_cents: number;
}

interface PublicInvoice {
  invoice_number: string;
  public_slug: string;
  status: string;
  customer_name: string | null;
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
  balance_cents: number;
  issued_at: string | null;
  due_at: string | null;
  paid_at: string | null;
  line_items: LineItemPublic[];
}

export default function PayInvoicePage(): React.ReactElement {
  const params = useParams<{ invoice: string }>();
  const invoiceKey = decodeURIComponent(params?.invoice ?? '');
  const [invoice, setInvoice] = useState<PublicInvoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingMethod, setPendingMethod] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const res = await fetch(`/api/public/invoice/${encodeURIComponent(invoiceKey)}`);
      if (cancelled) return;
      if (res.status === 404) { setError("We couldn't find that invoice."); setLoading(false); return; }
      if (res.status === 410) { setError('That invoice is no longer available.'); setLoading(false); return; }
      if (!res.ok) { setError('Something went wrong loading your invoice.'); setLoading(false); return; }
      const json = await res.json();
      setInvoice(json.invoice as PublicInvoice);
      setLoading(false);
    }
    if (invoiceKey) load();
    return () => { cancelled = true; };
  }, [invoiceKey]);

  if (loading) {
    return (
      <main className="pay-shell">
        <section className="pay-hero">
          <div className="pay-hero__card">
            <p data-testid="pay-detail-loading">Loading your invoice…</p>
          </div>
        </section>
      </main>
    );
  }

  if (error || !invoice) {
    return (
      <main className="pay-shell">
        <section className="pay-hero">
          <div className="pay-hero__card">
            <h1 className="pay-hero__title">Invoice not found</h1>
            <p className="pay-hero__subtitle" data-testid="pay-detail-error">
              {error ?? 'We could not find that invoice.'}
            </p>
            <Link href="/pay" className="pay-lookup__submit" style={{ display: 'inline-block', marginTop: '1rem' }}>
              Try another number
            </Link>
          </div>
        </section>
      </main>
    );
  }

  const status = describeInvoiceStatus(invoice.status);
  const dueDate = invoice.due_at ? new Date(invoice.due_at).toLocaleDateString() : null;
  const isPaid = invoice.balance_cents === 0;

  return (
    <main className="pay-shell" data-testid="pay-detail">
      <section className="pay-hero pay-hero--compact">
        <div className="pay-hero__card">
          <div className="pay-hero__eyebrow">Invoice {invoice.invoice_number}</div>
          <h1 className="pay-hero__title">
            {invoice.customer_name ? `Hello, ${invoice.customer_name}` : 'Your invoice'}
          </h1>
          <div className={`pay-status pay-status--${status.tone}`} data-testid="pay-status-pill">
            {status.label}
          </div>
          {dueDate && !isPaid && (
            <p className="pay-hero__subtitle">Due {dueDate}</p>
          )}
        </div>
      </section>

      <section className="pay-section">
        <div className="pay-container">
          <article className="pay-card">
            <h2 className="pay-card__title">What you owe</h2>
            <ul className="pay-line-items" data-testid="pay-line-items">
              {invoice.line_items.length === 0 ? (
                <li className="pay-line-items__empty">Itemized breakdown not available.</li>
              ) : (
                invoice.line_items.map((item, i) => (
                  <li key={i} className="pay-line-items__row">
                    <span className="pay-line-items__desc">{item.description}</span>
                    <span className="pay-line-items__amt">{formatDollars(item.total_cents)}</span>
                  </li>
                ))
              )}
            </ul>
            <div className="pay-totals">
              <div className="pay-totals__row">
                <span>Subtotal</span>
                <span>{formatDollars(invoice.subtotal_cents)}</span>
              </div>
              {invoice.tax_cents > 0 && (
                <div className="pay-totals__row">
                  <span>Tax</span>
                  <span>{formatDollars(invoice.tax_cents)}</span>
                </div>
              )}
              <div className="pay-totals__row pay-totals__row--total">
                <span>Total</span>
                <span>{formatDollars(invoice.total_cents)}</span>
              </div>
              <div className="pay-totals__row pay-totals__row--balance" data-testid="pay-balance-row">
                <span>{isPaid ? 'Paid' : 'Balance due'}</span>
                <span>{formatDollars(isPaid ? invoice.total_cents : invoice.balance_cents)}</span>
              </div>
            </div>
          </article>

          {!isPaid && (
            <article className="pay-card pay-card--methods" data-testid="pay-methods">
              <h2 className="pay-card__title">How would you like to pay?</h2>
              <p className="pay-card__hint">
                Choose any method below. You'll get a receipt the moment the payment clears.
              </p>
              <div className="pay-methods__grid">
                {PAYMENT_METHODS.map((method) => {
                  const deepLink = buildDeepLink(method, invoice.invoice_number, invoice.balance_cents);
                  return (
                    <button
                      key={method.id}
                      type="button"
                      className="pay-methods__card"
                      data-testid={`pay-method-${method.id}`}
                      onClick={() => setPendingMethod(method.id)}
                    >
                      <span className="pay-methods__glyph" aria-hidden>{method.glyph}</span>
                      <span className="pay-methods__label">{method.label}</span>
                      <span className="pay-methods__blurb">{method.blurb}</span>
                      {deepLink && (
                        <span className="pay-methods__hint">Tap to open</span>
                      )}
                    </button>
                  );
                })}
              </div>
              {pendingMethod && (
                <div className="pay-methods__toast" data-testid="pay-methods-toast" role="status">
                  Payment wiring goes live once our bank account is fully set up.
                  Please call <a href="tel:+19366620077">(936) 662-0077</a> in the meantime.
                </div>
              )}
            </article>
          )}

          {isPaid && (
            <article className="pay-card pay-card--paid" data-testid="pay-paid-card">
              <h2 className="pay-card__title">Paid in full ✓</h2>
              <p>Thank you — your invoice is fully paid. A receipt was emailed when the payment cleared.</p>
            </article>
          )}
        </div>
      </section>
    </main>
  );
}

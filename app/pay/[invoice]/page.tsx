'use client';

// app/pay/[invoice]/page.tsx
//
// P4 + P6 of payment-infrastructure-2026-06-18.md — customer invoice
// detail surface. Reads `/api/public/invoice/[number]`, renders:
//   - greeting + invoice header (number, status pill, due date)
//   - line items + totals
//   - payment-method picker
//
// P6 wires the deep-link methods (Venmo / CashApp / Zelle): clicking
// a card opens the platform's app with the amount + invoice note
// pre-filled, AND swaps the card into an "I sent it" / "Not yet"
// follow-up. "I sent it" POSTs to /api/public/invoice/<n>/attempt
// which records a `payment_attempts` row in `pending_confirmation`
// status for the office close-out queue (P10). Stripe still shows
// the not-yet-wired toast; cash/check pledge is P7.

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
  // P6 — when the user clicks a deep-link method, we open the
  // platform AND switch the card into the "I sent it" / "Not yet"
  // confirmation state. `attemptMethod` is the method waiting for
  // confirmation; `attemptRecorded` flips after the customer says
  // they sent it (we then POST the attempt row).
  const [attemptMethod, setAttemptMethod] = useState<string | null>(null);
  const [attemptRecorded, setAttemptRecorded] = useState(false);
  const [attemptSubmitting, setAttemptSubmitting] = useState(false);
  const [attemptError, setAttemptError] = useState<string | null>(null);
  const [payerEmail, setPayerEmail] = useState('');

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

  function onMethodClick(method: typeof PAYMENT_METHODS[number]) {
    setAttemptError(null);
    setAttemptRecorded(false);
    if (method.action === 'deeplink') {
      // Open the platform with the amount + note prefilled when the
      // method has a deep-link template. Zelle doesn't (the customer
      // sends through their bank's Zelle app — the info card shows
      // the recipient email instead).
      const link = buildDeepLink(method, invoice!.invoice_number, invoice!.balance_cents);
      if (link) {
        window.open(link, '_blank', 'noopener,noreferrer');
      }
      setAttemptMethod(method.id);
      setPendingMethod(null);
      return;
    }
    if (method.action === 'pledge') {
      // P7 will wire the pledge flow; for now show the not-yet
      // toast so the customer knows to call.
      setAttemptMethod(null);
      setPendingMethod(method.id);
      return;
    }
    // Stripe: still stubbed per P4 — the form ships in a later slice.
    setAttemptMethod(null);
    setPendingMethod(method.id);
  }

  async function recordAttempt() {
    if (!attemptMethod || !invoice) return;
    setAttemptSubmitting(true);
    setAttemptError(null);
    const res = await fetch(`/api/public/invoice/${encodeURIComponent(invoice.invoice_number)}/attempt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        method: attemptMethod,
        intended_amount_cents: invoice.balance_cents,
        payer_email: payerEmail.trim() || undefined,
      }),
    });
    setAttemptSubmitting(false);
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setAttemptError(json.error ?? 'We couldn\'t record your payment. Please try again.');
      return;
    }
    setAttemptRecorded(true);
  }

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
                      onClick={() => onMethodClick(method)}
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

              {/* P6 — deep-link confirmation strip. After the customer
                  opens Venmo / CashApp / Zelle, they come back and
                  tell us whether they actually sent it. */}
              {attemptMethod && !attemptRecorded && (
                <div className="pay-methods__confirm" data-testid="pay-attempt-confirm" role="status">
                  <p className="pay-methods__confirm-lede">
                    Did you send <strong>{formatDollars(invoice.balance_cents)}</strong> via{' '}
                    {PAYMENT_METHODS.find((m) => m.id === attemptMethod)?.label}?
                  </p>
                  <label className="pay-methods__confirm-email">
                    Your email (so we can send the receipt)
                    <input
                      type="email"
                      value={payerEmail}
                      onChange={(e) => setPayerEmail(e.target.value)}
                      placeholder="you@example.com"
                      data-testid="pay-attempt-email"
                      autoComplete="email"
                    />
                  </label>
                  <div className="pay-methods__confirm-actions">
                    <button
                      type="button"
                      className="pay-methods__confirm-cancel"
                      onClick={() => { setAttemptMethod(null); setPayerEmail(''); }}
                      disabled={attemptSubmitting}
                    >
                      Not yet
                    </button>
                    <button
                      type="button"
                      className="pay-methods__confirm-yes"
                      onClick={recordAttempt}
                      disabled={attemptSubmitting}
                      data-testid="pay-attempt-submit"
                    >
                      {attemptSubmitting ? 'Recording…' : 'Yes, I sent it'}
                    </button>
                  </div>
                  {attemptError && (
                    <p className="pay-methods__confirm-error" data-testid="pay-attempt-error" role="alert">
                      {attemptError}
                    </p>
                  )}
                </div>
              )}

              {attemptRecorded && (
                <div className="pay-methods__received" data-testid="pay-attempt-received" role="status">
                  <strong>Thank you!</strong> We've logged your payment as pending.
                  Once we confirm it in {PAYMENT_METHODS.find((m) => m.id === attemptMethod)?.label},
                  your receipt will arrive at the email you provided. Questions?{' '}
                  <a href="tel:+19366620077">(936) 662-0077</a>.
                </div>
              )}

              {pendingMethod && !attemptMethod && (
                <div className="pay-methods__toast" data-testid="pay-methods-toast" role="status">
                  This payment method goes live once our bank account is fully set up.
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

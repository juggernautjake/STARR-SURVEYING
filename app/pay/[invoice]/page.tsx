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
import { decideUpfrontAcceptance } from '@/lib/payments/upfront-rule';
import { cardPaymentConfigured } from '@/lib/payments/stripe-elements';
import StripeCardForm from './StripeCardForm';
import PayHeader from '../PayHeader';
import PaySkeleton from '../PaySkeleton';
import '../../styles/Pay.css';

interface LineItemPublic {
  description: string;
  quantity: number;
  unit_price_cents: number;
  total_cents: number;
}

interface PublicPaymentSummary {
  amount_cents: number;
  method: string;
  method_label: string;
  cleared_at: string | null;
  external_id_tail: string | null;
  payer_email_mask: string | null;
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
  deposit_amount_cents: number;
  min_payment_cents: number;
  max_payment_cents: number;
  upfront_outstanding: boolean;
  issued_at: string | null;
  due_at: string | null;
  paid_at: string | null;
  line_items: LineItemPublic[];
  payments: PublicPaymentSummary[];
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
  // P8 — return-to-portal receipt resend.
  const [receiptEmail, setReceiptEmail] = useState('');
  const [receiptStatus, setReceiptStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [receiptError, setReceiptError] = useState<string | null>(null);
  // P7 — cash/check pledges need to know whether the customer is
  // mailing it or bringing it in person so the confirmation email
  // reads correctly. Defaults: cash → in-person, check → by mail.
  const [pledgeIsMailing, setPledgeIsMailing] = useState(true);
  // S4 — the customer chooses how much to pay (>= upfront, <= balance).
  // Initialized to the full balance once the invoice loads.
  const [amountStr, setAmountStr] = useState('');
  // G1 — when true, the Stripe Elements card form is shown in place of the
  // method picker's stub. Only opened when a publishable key is configured.
  const [cardOpen, setCardOpen] = useState(false);

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
      const inv = json.invoice as PublicInvoice;
      setInvoice(inv);
      setAmountStr((Math.max(0, inv.balance_cents) / 100).toFixed(2));
      setLoading(false);
    }
    if (invoiceKey) load();
    return () => { cancelled = true; };
  }, [invoiceKey]);

  if (loading) {
    return (
      <main className="pay-shell" data-testid="pay-detail-loading">
        <PayHeader />
        <PaySkeleton />
      </main>
    );
  }

  if (error || !invoice) {
    return (
      <main className="pay-shell">
        <PayHeader />
        <section className="pay-hero">
          <div className="pay-hero__card">
            <h1 className="pay-hero__title">Invoice not found</h1>
            <p className="pay-hero__subtitle" data-testid="pay-detail-error" role="alert">
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
  // P22 QA — a $0 invoice is not "paid", it's "no balance due".
  // The Paid-in-full card is only rendered when there was real
  // money to clear and a confirmed payment closed it.
  const isPaid = invoice.balance_cents === 0 && invoice.total_cents > 0;
  const isZeroDollar = invoice.total_cents === 0;

  // S4 — the chosen payment amount (cents) + the same rule the server enforces,
  // so the UI clamp/message matches /attempt + /intent exactly.
  const chosenCents = Math.round((parseFloat(amountStr) || 0) * 100);
  const priorPaidCents = Math.max(0, invoice.total_cents - invoice.balance_cents);
  const amountDecision = decideUpfrontAcceptance({
    deposit_amount_cents: invoice.deposit_amount_cents,
    prior_paid_cents: priorPaidCents,
    intended_amount_cents: chosenCents,
    total_cents: invoice.total_cents,
  });
  const amountValid = amountDecision.accepted;

  function onMethodClick(method: typeof PAYMENT_METHODS[number]) {
    setAttemptError(null);
    setAttemptRecorded(false);
    setCardOpen(false);
    // Don't start a payment for an amount that fails the upfront/total rule.
    if (!invoice || !amountValid) return;
    if (method.action === 'deeplink') {
      // Open the platform with the amount + note prefilled when the
      // method has a deep-link template. Zelle doesn't (the customer
      // sends through their bank's Zelle app — the info card shows
      // the recipient email instead).
      const link = buildDeepLink(method, invoice.invoice_number, chosenCents);
      if (link) {
        window.open(link, '_blank', 'noopener,noreferrer');
      }
      setAttemptMethod(method.id);
      setPendingMethod(null);
      return;
    }
    if (method.action === 'pledge') {
      // P7 — switch into the pledge strip. Cash defaults to in-
      // person; check defaults to by-mail. Customer can flip either.
      setPledgeIsMailing(method.id === 'check');
      setAttemptMethod(method.id);
      setPendingMethod(null);
      return;
    }
    // Stripe (G1): open the Elements card form when a publishable key is
    // configured; otherwise fall back to the not-yet-wired toast (pre-go-live,
    // no NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY set).
    setAttemptMethod(null);
    if (cardPaymentConfigured()) {
      setPendingMethod(null);
      setCardOpen(true);
    } else {
      setPendingMethod(method.id);
    }
  }

  async function recordAttempt() {
    if (!attemptMethod || !invoice) return;
    setAttemptSubmitting(true);
    setAttemptError(null);
    const isPledge = attemptMethod === 'cash' || attemptMethod === 'check';
    const res = await fetch(`/api/public/invoice/${encodeURIComponent(invoice.invoice_number)}/attempt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        method: attemptMethod,
        intended_amount_cents: chosenCents,
        payer_email: payerEmail.trim() || undefined,
        ...(isPledge ? { is_mailing: pledgeIsMailing } : {}),
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

  async function resendReceipt() {
    if (!invoice) return;
    const to = receiptEmail.trim();
    if (!to.includes('@')) {
      setReceiptError('Please enter a valid email address.');
      setReceiptStatus('error');
      return;
    }
    setReceiptStatus('sending');
    setReceiptError(null);
    const res = await fetch(`/api/public/invoice/${encodeURIComponent(invoice.invoice_number)}/receipt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setReceiptError(json.error ?? 'We could not send the receipt. Please try again.');
      setReceiptStatus('error');
      return;
    }
    setReceiptStatus('sent');
  }

  return (
    <main className="pay-shell" data-testid="pay-detail">
      <PayHeader />
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

          {/* P22 QA — zero-dollar invoice gets its own card; the
              method picker is hidden because there's nothing to
              pay. */}
          {isZeroDollar && (
            <article className="pay-card" data-testid="pay-zero-dollar">
              <h2 className="pay-card__title">No balance due</h2>
              <p>This invoice has a $0 balance. Nothing to pay.</p>
            </article>
          )}

          {!isPaid && !isZeroDollar && (
            <article className="pay-card pay-card--methods" data-testid="pay-methods">
              <h2 className="pay-card__title">How would you like to pay?</h2>
              <p className="pay-card__hint">
                Choose any method below. You&rsquo;ll get a receipt the moment the payment clears.
              </p>

              {/* S4 — required-upfront banner + amount selector. The customer
                  may pay any amount from the required minimum up to the full
                  balance; the same rule is re-checked server-side. */}
              {invoice.upfront_outstanding && (
                <div className="pay-methods__upfront" data-testid="pay-upfront-banner" role="note">
                  This invoice requires a first payment of at least{' '}
                  <strong>{formatDollars(invoice.min_payment_cents)}</strong>{' '}
                  before the balance can be paid down.
                </div>
              )}
              <label className="pay-methods__amount" data-testid="pay-amount-field">
                <span className="pay-methods__amount-label">How much would you like to pay?</span>
                <span className="pay-methods__amount-input">
                  <span aria-hidden="true">$</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min={(invoice.min_payment_cents / 100).toFixed(2)}
                    max={(invoice.max_payment_cents / 100).toFixed(2)}
                    value={amountStr}
                    onChange={(e) => setAmountStr(e.target.value)}
                    data-testid="pay-amount-input"
                    aria-label="Payment amount in dollars"
                  />
                </span>
                <span className="pay-methods__amount-hint">
                  Minimum {formatDollars(invoice.min_payment_cents)} · Balance due {formatDollars(invoice.max_payment_cents)}
                </span>
              </label>
              {!amountValid && (
                <p className="pay-methods__amount-error" data-testid="pay-amount-error" role="alert">
                  {amountDecision.message}
                </p>
              )}

              <div className="pay-methods__grid">
                {PAYMENT_METHODS.map((method) => {
                  const deepLink = buildDeepLink(method, invoice.invoice_number, chosenCents);
                  return (
                    <button
                      key={method.id}
                      type="button"
                      className="pay-methods__card"
                      data-testid={`pay-method-${method.id}`}
                      onClick={() => onMethodClick(method)}
                      disabled={!amountValid}
                      aria-label={`Pay ${formatDollars(chosenCents)} with ${method.label}`}
                    >
                      <span className="pay-methods__glyph" aria-hidden="true">{method.glyph}</span>
                      <span className="pay-methods__label">{method.label}</span>
                      <span className="pay-methods__blurb">{method.blurb}</span>
                      {deepLink && (
                        <span className="pay-methods__hint">Tap to open</span>
                      )}
                    </button>
                  );
                })}
              </div>

              {cardOpen && (
                <StripeCardForm
                  invoiceNumber={invoice.invoice_number}
                  amountCents={chosenCents}
                  onCancel={() => setCardOpen(false)}
                />
              )}

              {/* P6 — deep-link confirmation strip / P7 — cash + check
                  pledge strip. After the customer opens Venmo / CashApp
                  / Zelle (P6) or picks cash / check (P7), they come
                  back here and tell us how they're paying. */}
              {attemptMethod && !attemptRecorded && (() => {
                const isPledge = attemptMethod === 'cash' || attemptMethod === 'check';
                const methodLabel = PAYMENT_METHODS.find((m) => m.id === attemptMethod)?.label;
                return (
                  <div className="pay-methods__confirm" data-testid={isPledge ? 'pay-pledge-confirm' : 'pay-attempt-confirm'} role="status">
                    <p className="pay-methods__confirm-lede">
                      {isPledge ? (
                        <>Pay <strong>{formatDollars(chosenCents)}</strong> in {attemptMethod === 'check' ? 'check' : 'cash'}?</>
                      ) : (
                        <>Did you send <strong>{formatDollars(chosenCents)}</strong> via {methodLabel}?</>
                      )}
                    </p>
                    {isPledge && (
                      <fieldset className="pay-methods__pledge-delivery" data-testid="pay-pledge-delivery">
                        <legend>How will you deliver it?</legend>
                        <label>
                          <input
                            type="radio"
                            name="pledge-delivery"
                            checked={pledgeIsMailing}
                            onChange={() => setPledgeIsMailing(true)}
                          />
                          <span>I&rsquo;ll mail it</span>
                        </label>
                        <label>
                          <input
                            type="radio"
                            name="pledge-delivery"
                            checked={!pledgeIsMailing}
                            onChange={() => setPledgeIsMailing(false)}
                          />
                          <span>I&rsquo;ll bring it in person</span>
                        </label>
                      </fieldset>
                    )}
                    <label className="pay-methods__confirm-email">
                      Your email (so we can send the receipt{isPledge ? ' + mailing address' : ''})
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
                        data-testid={isPledge ? 'pay-pledge-submit' : 'pay-attempt-submit'}
                      >
                        {attemptSubmitting
                          ? 'Recording…'
                          : isPledge
                            ? (pledgeIsMailing ? "I'm sending it" : "I'll bring it")
                            : 'Yes, I sent it'}
                      </button>
                    </div>
                    {attemptError && (
                      <p className="pay-methods__confirm-error" data-testid="pay-attempt-error" role="alert">
                        {attemptError}
                      </p>
                    )}
                  </div>
                );
              })()}

              {attemptRecorded && (() => {
                const isPledge = attemptMethod === 'cash' || attemptMethod === 'check';
                const methodLabel = PAYMENT_METHODS.find((m) => m.id === attemptMethod)?.label;
                return (
                  <div className="pay-methods__received" data-testid={isPledge ? 'pay-pledge-received' : 'pay-attempt-received'} role="status">
                    <strong>Thank you!</strong>{' '}
                    {isPledge ? (
                      <>
                        We&rsquo;ve logged your <strong>{attemptMethod === 'check' ? 'check' : 'cash'}</strong> payment as pending.
                        {pledgeIsMailing ? (
                          <> Please mail it to:</>
                        ) : (
                          <> Drop by anytime — we&rsquo;ll log the payment when it arrives.</>
                        )}
                        {pledgeIsMailing && (
                          <p className="pay-methods__received-addr" data-testid="pay-pledge-mailing-addr">
                            <strong>Starr Surveying</strong><br />
                            3779 W FM 436<br />
                            Belton, TX 76513
                          </p>
                        )}
                        Your receipt will land at the email you provided once we log the payment.
                      </>
                    ) : (
                      <>
                        We&rsquo;ve logged your payment as pending. Once we confirm it in {methodLabel},
                        your receipt will arrive at the email you provided.
                      </>
                    )}{' '}
                    Questions?{' '}
                    <a href="tel:+19366620077">(936) 662-0077</a>.
                  </div>
                );
              })()}

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
              <p>Thank you — your invoice is fully paid.</p>

              {invoice.payments.length > 0 && (
                <ul className="pay-paid__payments" data-testid="pay-paid-payments">
                  {invoice.payments.map((p, i) => (
                    <li key={i} className="pay-paid__payment">
                      <div className="pay-paid__payment-method">
                        <strong>{p.method_label}</strong>
                        {p.external_id_tail && (
                          <span className="pay-paid__payment-ref"> · ending {p.external_id_tail}</span>
                        )}
                      </div>
                      <div className="pay-paid__payment-meta">
                        {p.cleared_at && <span>{new Date(p.cleared_at).toLocaleDateString()}</span>}
                        <span className="pay-paid__payment-amt">{formatDollars(p.amount_cents)}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              <div className="pay-paid__receipt" data-testid="pay-paid-receipt">
                <h3 className="pay-paid__receipt-title">Need another copy of your receipt?</h3>
                <p className="pay-paid__receipt-hint">
                  Download it as a PDF, or email it to yourself (or your accountant).
                </p>
                <a
                  href={`/api/public/invoice/${encodeURIComponent(invoice.invoice_number)}/receipt/pdf`}
                  target="_blank"
                  rel="noreferrer"
                  className="pay-paid__receipt-download"
                  data-testid="pay-paid-receipt-pdf"
                >
                  Download receipt (PDF)
                </a>
                {receiptStatus === 'sent' ? (
                  <p className="pay-paid__receipt-sent" data-testid="pay-paid-receipt-sent" role="status">
                    Sent! Check your inbox at <strong>{receiptEmail}</strong>.
                  </p>
                ) : (
                  <div className="pay-paid__receipt-row">
                    <input
                      type="email"
                      className="pay-paid__receipt-input"
                      placeholder="you@example.com"
                      value={receiptEmail}
                      onChange={(e) => setReceiptEmail(e.target.value)}
                      data-testid="pay-paid-receipt-input"
                      autoComplete="email"
                    />
                    <button
                      type="button"
                      className="pay-paid__receipt-submit"
                      onClick={resendReceipt}
                      disabled={receiptStatus === 'sending'}
                      data-testid="pay-paid-receipt-submit"
                    >
                      {receiptStatus === 'sending' ? 'Sending…' : 'Email me a receipt'}
                    </button>
                  </div>
                )}
                {receiptError && (
                  <p className="pay-paid__receipt-error" data-testid="pay-paid-receipt-error" role="alert">
                    {receiptError}
                  </p>
                )}
              </div>
            </article>
          )}
        </div>
      </section>
    </main>
  );
}

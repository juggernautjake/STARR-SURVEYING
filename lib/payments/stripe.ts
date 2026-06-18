// lib/payments/stripe.ts
//
// P5 of payment-infrastructure-2026-06-18.md — Stripe PaymentIntent
// + webhook plumbing. Pure helpers live here so vitest can lock the
// invariants without spinning up the Stripe SDK against a sandbox.
//
// Boundaries:
//   - `buildPaymentIntentParams(invoice)` returns the shape we POST
//     to Stripe. Pure — no network.
//   - `extractInvoiceFromStripeEvent(event)` reads the `metadata`
//     blob a successful intent carries back. Pure.
//   - `nextInvoiceStatusAfterPayment(invoice, paymentCents)` decides
//     whether the invoice moves to `paid` or `partial` after a
//     payment clears. Pure.
//   - `isPaymentSucceededEvent(event)` filters webhook events we
//     actually act on. Pure.
//
// The actual `stripe.paymentIntents.create()` call + the Stripe-SDK
// signature verification live in the route file; the pure pieces
// stay here so the slice keeps its testable surface.

export interface StripePaymentIntentParams {
  amount: number;            // cents
  currency: 'usd';
  description: string;       // shown on the customer's bank statement
  metadata: {
    invoice_id: string;
    invoice_number: string;
    public_slug: string;
  };
  receipt_email?: string;
  payment_method_types: ReadonlyArray<'card' | 'us_bank_account'>;
  // Allow automatic confirmation of payment methods Stripe enables
  // for the account.
  automatic_payment_methods?: { enabled: boolean };
}

export interface InvoiceForIntent {
  id: string;
  invoice_number: string;
  public_slug: string;
  balance_cents: number;
  customer_email?: string | null;
  customer_name?: string | null;
}

/** Pure helper — build the PaymentIntent body. Description is
 *  customer-friendly ("Invoice SS-260618-A1B2 — Starr Surveying")
 *  so it reads well on a credit-card statement. */
export function buildPaymentIntentParams(invoice: InvoiceForIntent): StripePaymentIntentParams {
  const amount = Math.max(0, Math.floor(invoice.balance_cents));
  const params: StripePaymentIntentParams = {
    amount,
    currency: 'usd',
    description: `Invoice ${invoice.invoice_number} — Starr Surveying`,
    metadata: {
      invoice_id: invoice.id,
      invoice_number: invoice.invoice_number,
      public_slug: invoice.public_slug,
    },
    payment_method_types: ['card', 'us_bank_account'],
    automatic_payment_methods: { enabled: true },
  };
  const email = typeof invoice.customer_email === 'string' ? invoice.customer_email.trim() : '';
  if (email) params.receipt_email = email;
  return params;
}

export interface StripeEventLike {
  type?: string;
  data?: {
    object?: {
      id?: string;
      amount?: number;
      amount_received?: number;
      currency?: string;
      status?: string;
      latest_charge?: string | null;
      receipt_email?: string | null;
      metadata?: Record<string, unknown>;
    };
  };
}

/** Pure helper — only `payment_intent.succeeded` carries cleared
 *  money. Everything else (created / processing / failed) we log
 *  but don't act on. */
export function isPaymentSucceededEvent(event: StripeEventLike): boolean {
  if (event.type !== 'payment_intent.succeeded') return false;
  const obj = event.data?.object;
  return obj?.status === 'succeeded';
}

export interface StripeInvoiceLookupKey {
  invoice_id: string | null;
  invoice_number: string | null;
  public_slug: string | null;
  external_intent_id: string | null;
  amount_received: number;
  currency: string;
  receipt_email: string | null;
  latest_charge: string | null;
}

/** Pure helper — pull the keys we need to mark the right invoice
 *  paid out of the webhook event's metadata. Returns nulls when
 *  Stripe didn't echo back our metadata (defensive). */
export function extractInvoiceFromStripeEvent(event: StripeEventLike): StripeInvoiceLookupKey {
  const obj = event.data?.object ?? {};
  const meta = obj.metadata ?? {};
  const pick = (k: string): string | null => {
    const v = (meta as Record<string, unknown>)[k];
    return typeof v === 'string' && v.length > 0 ? v : null;
  };
  return {
    invoice_id: pick('invoice_id'),
    invoice_number: pick('invoice_number'),
    public_slug: pick('public_slug'),
    external_intent_id: typeof obj.id === 'string' ? obj.id : null,
    amount_received: typeof obj.amount_received === 'number' ? obj.amount_received : 0,
    currency: typeof obj.currency === 'string' ? obj.currency : 'usd',
    receipt_email: typeof obj.receipt_email === 'string' ? obj.receipt_email : null,
    latest_charge: typeof obj.latest_charge === 'string' ? obj.latest_charge : null,
  };
}

/** Pure helper — given an invoice's current total + the cumulative
 *  amount paid (including the new payment), decide the new status.
 *  Order matters: zero-balance invoices are already 'paid'; partial
 *  payments move 'issued' → 'partial'; full payment moves to 'paid'. */
export function nextInvoiceStatusAfterPayment(args: {
  totalCents: number;
  alreadyPaidCents: number;
  newPaymentCents: number;
  currentStatus: string;
}): 'paid' | 'partial' | 'issued' {
  const { totalCents, alreadyPaidCents, newPaymentCents, currentStatus } = args;
  const totalPaid = Math.max(0, alreadyPaidCents) + Math.max(0, newPaymentCents);
  if (totalPaid >= Math.max(0, totalCents)) return 'paid';
  if (totalPaid > 0) return 'partial';
  // No money cleared — leave the invoice in whatever state it was.
  return currentStatus === 'partial' || currentStatus === 'paid' ? 'partial' : 'issued';
}

/** Pure helper — Stripe canonicalises currency as lowercase ISO. We
 *  only support USD; reject events in other currencies so a misrouted
 *  PaymentIntent doesn't mark an invoice paid in pesos. */
export function stripeEventIsUsd(event: StripeEventLike): boolean {
  const cur = event.data?.object?.currency;
  return typeof cur === 'string' && cur.toLowerCase() === 'usd';
}

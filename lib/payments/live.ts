// lib/payments/live.ts
//
// P4 of payment-infrastructure-2026-06-18.md — central gate for
// "real money" payment paths. Per the user's explicit ask:
//   "I don't want the payment page to go live yet. We will have to
//    set up our bank account with everything. We use PNC banking."
//
// Every clearing route checks `paymentsAreLive()` and short-circuits
// to a 503-with-explanation when it returns false. The default is
// false; flip to true ONLY when PNC + Stripe live keys are wired.
//
// `PAYMENT_METHODS` is the single source of truth for which methods
// the customer portal renders + the deep-link template per method.
// Adding a method = one entry here + nothing else.

export interface PaymentMethodConfig {
  /** Stable id used in the DB CHECK constraint (matches P1's enum). */
  id: 'stripe' | 'venmo' | 'cashapp' | 'zelle' | 'ach' | 'cash' | 'check';
  /** Customer-facing label on the picker card. */
  label: string;
  /** One-sentence subheading shown beneath the label. */
  blurb: string;
  /** Emoji glyph rendered in the card (no image assets needed). */
  glyph: string;
  /** Type of action the customer takes:
   *  - 'form'      → fills out an in-page form (Stripe Elements)
   *  - 'deeplink'  → opens a third-party app with a prefilled note
   *  - 'pledge'    → marks intent to pay offline (cash / check)
   */
  action: 'form' | 'deeplink' | 'pledge';
  /** Deep-link template — `${AMOUNT}`, `${NOTE}` are replaced at
   *  render time. Only present for `action: 'deeplink'`. */
  deepLinkTemplate?: string;
  /** Company-side handle the customer sends to. */
  handle?: string;
}

export const STARR_VENMO_HANDLE = '@StarrSurveying';
export const STARR_CASHAPP_HANDLE = '$StarrSurveying';
export const STARR_ZELLE_EMAIL = 'info@starr-surveying.com';

export const PAYMENT_METHODS: ReadonlyArray<PaymentMethodConfig> = [
  {
    id: 'stripe',
    label: 'Card or bank (Stripe)',
    blurb: 'Credit / debit card or US bank account. Receipt emailed instantly.',
    glyph: '💳',
    action: 'form',
  },
  {
    id: 'venmo',
    label: 'Venmo',
    blurb: `Send to ${STARR_VENMO_HANDLE}. Tap to open Venmo with the amount + note pre-filled.`,
    glyph: '🅥',
    action: 'deeplink',
    handle: STARR_VENMO_HANDLE,
    deepLinkTemplate: 'venmo://paycharge?txn=pay&recipients=StarrSurveying&amount=${AMOUNT}&note=${NOTE}',
  },
  {
    id: 'cashapp',
    label: 'Cash App',
    blurb: `Send to ${STARR_CASHAPP_HANDLE}. Opens Cash App with the amount pre-filled.`,
    glyph: '💵',
    action: 'deeplink',
    handle: STARR_CASHAPP_HANDLE,
    deepLinkTemplate: 'https://cash.app/$StarrSurveying/${AMOUNT}',
  },
  {
    id: 'zelle',
    label: 'Zelle',
    blurb: `Send through your bank's Zelle app to ${STARR_ZELLE_EMAIL}.`,
    glyph: '🏦',
    action: 'deeplink',
    handle: STARR_ZELLE_EMAIL,
  },
  {
    id: 'cash',
    label: 'Cash (in person or by mail)',
    blurb: 'Drop it by the office or mail it. We mark you paid the moment it arrives.',
    glyph: '💸',
    action: 'pledge',
  },
  {
    id: 'check',
    label: 'Check (by mail)',
    blurb: 'Make payable to Starr Surveying. Receipt emailed when it clears.',
    glyph: '✉️',
    action: 'pledge',
  },
] as const;

/** Pure helper — env-flag check. Reads at call time so test
 *  overrides take effect without restarting the route. */
export function paymentsAreLive(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.PAYMENTS_LIVE === 'true';
}

/** Pure helper — populate a method's deep-link template with the
 *  invoice amount + a customer-friendly note. Returns null when the
 *  method has no template (Stripe / cash / check). */
export function buildDeepLink(
  method: PaymentMethodConfig,
  invoiceNumber: string,
  amountCents: number,
): string | null {
  if (!method.deepLinkTemplate) return null;
  const dollars = (Math.max(0, amountCents) / 100).toFixed(2);
  const note = encodeURIComponent(`Invoice ${invoiceNumber} — Starr Surveying`);
  return method.deepLinkTemplate
    .replace('${AMOUNT}', dollars)
    .replace('${NOTE}', note);
}

/** Pure helper — money formatter used everywhere on the portal so
 *  the wording stays consistent. */
export function formatDollars(amountCents: number | null | undefined): string {
  const n = typeof amountCents === 'number' && Number.isFinite(amountCents) ? amountCents : 0;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n / 100);
}

/** Pure helper — friendly status pill text. */
export function describeInvoiceStatus(status: string | null | undefined): { label: string; tone: 'success' | 'warn' | 'info' | 'danger' } {
  switch (status) {
    case 'paid': return { label: 'Paid in full', tone: 'success' };
    case 'partial': return { label: 'Partially paid', tone: 'warn' };
    case 'overdue': return { label: 'Overdue', tone: 'danger' };
    case 'voided': return { label: 'Voided', tone: 'info' };
    case 'refunded': return { label: 'Refunded', tone: 'info' };
    case 'issued': return { label: 'Awaiting payment', tone: 'info' };
    case 'draft': return { label: 'Draft', tone: 'info' };
    default: return { label: status ? String(status) : 'Unknown', tone: 'info' };
  }
}

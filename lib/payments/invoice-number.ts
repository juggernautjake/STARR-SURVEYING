// lib/payments/invoice-number.ts
//
// P3b of payment-infrastructure-2026-06-18.md — pure helpers for the
// office-side "Create + send invoice" flow. Kept pure so vitest can
// lock the format + the totals math without spinning up Supabase.

export interface LineItem {
  description: string;
  quantity: number;
  unit_price_cents: number;
  total_cents: number;
}

export interface InvoiceTotals {
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
}

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I — easier to read on a paper invoice

/** Pure helper — generate `SS-YYMMDD-XXXX` (year-month-day + 4 char
 *  random suffix). Two-digit year matches the `SS-260618-…` style
 *  the rest of the codebase already prints on leads. */
export function generateInvoiceNumber(now: Date, random: () => number): string {
  const yy = String(now.getUTCFullYear() % 100).padStart(2, '0');
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(now.getUTCDate()).padStart(2, '0');
  let suffix = '';
  for (let i = 0; i < 4; i += 1) {
    suffix += ALPHABET[Math.floor(random() * ALPHABET.length)];
  }
  return `SS-${yy}${mm}${dd}-${suffix}`;
}

/** Pure helper — URL-safe random slug for the public pay link. 16
 *  chars of `ALPHABET` (~80 bits of entropy) prevents enumeration. */
export function generatePublicSlug(random: () => number): string {
  let s = '';
  for (let i = 0; i < 16; i += 1) {
    s += ALPHABET[Math.floor(random() * ALPHABET.length)];
  }
  return s;
}

/** Pure helper — line item total math. Each row keeps its own
 *  `total_cents` (rounded to the nearest cent); the helper trusts
 *  it and just sums. The composer's "Add row" handler computes the
 *  per-row total at edit time. */
export function lineItemTotal(quantity: number, unitPriceCents: number): number {
  const q = Number.isFinite(quantity) ? quantity : 0;
  const p = Number.isFinite(unitPriceCents) ? unitPriceCents : 0;
  return Math.max(0, Math.round(q * p));
}

/** Pure helper — totals for the invoice. `tax_cents` is the office-
 *  typed amount (we don't compute sales tax — the office knows the
 *  customer's jurisdiction better than the app does). */
export function computeInvoiceTotals(
  lineItems: ReadonlyArray<{ total_cents?: number }>,
  taxCents = 0,
): InvoiceTotals {
  const subtotal = lineItems.reduce((acc, l) => {
    const t = typeof l.total_cents === 'number' ? l.total_cents : 0;
    return acc + Math.max(0, t);
  }, 0);
  const tax = Math.max(0, Math.round(taxCents));
  return {
    subtotal_cents: subtotal,
    tax_cents: tax,
    total_cents: subtotal + tax,
  };
}

/** Pure helper — the URL we email to the customer. `host` is taken
 *  from `process.env.NEXT_PUBLIC_APP_URL` at the route layer; this
 *  helper just glues it onto `/pay/<slug>`. */
export function buildInvoicePayLink(host: string, slug: string): string {
  const trimmedHost = host.replace(/\/+$/g, '');
  return `${trimmedHost}/pay/${encodeURIComponent(slug)}`;
}

/** Pure helper — strip a row to the line-item shape we store in
 *  JSONB. Drops empty descriptions; clamps numbers to integers. */
export function normalizeLineItem(raw: unknown): LineItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const description = typeof r.description === 'string' ? r.description.trim() : '';
  if (description.length === 0) return null;
  const quantity = typeof r.quantity === 'number' && Number.isFinite(r.quantity) ? r.quantity : 1;
  const unit_price_cents = typeof r.unit_price_cents === 'number' && Number.isFinite(r.unit_price_cents) ? Math.round(r.unit_price_cents) : 0;
  const total_cents = typeof r.total_cents === 'number' && Number.isFinite(r.total_cents)
    ? Math.round(r.total_cents)
    : lineItemTotal(quantity, unit_price_cents);
  return { description, quantity, unit_price_cents, total_cents };
}

// app/api/public/invoice/[number]/route.ts
//
// P4 of payment-infrastructure-2026-06-18.md — public, anonymous
// invoice lookup. Surface backing `/pay`.
//
// Customer enters their invoice number; we look it up by either
// `invoice_number` (printed on the paper invoice) OR `public_slug`
// (the URL-safe token in deep links). Both unique; the slug prevents
// enumeration / scraping of sequential ids.
//
// Returns only the fields the customer sees on `/pay/[invoice]`:
//   - total + balance due
//   - invoice status + paid-on date
//   - customer name (snapshotted from P3)
//   - line items (descriptions + line totals, no internal notes)
// Internal columns (`org_id`, `created_by`, `voided_at`, etc.) are
// stripped server-side so they never leak.
//
// 404 when the row doesn't exist; 410 when the invoice is `voided` /
// `draft` (customer-visible portal does not show drafts).

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { enforceRateLimit } from '@/lib/rate-limit';
// A1-4b — a hit and a miss must take the same time, or the timing answers what the body refuses to.
import { notBefore, now } from '@/lib/http/constant-time';
import {
  PUBLIC_BLOCKED_STATUSES,
  describePaymentForReceipt,
  sanitizeLineItems,
  sumSucceededPayments,
  type LineItemPublic,
  type PublicPaymentSummary,
} from '@/lib/payments/invoice-public';
import { decideUpfrontAcceptance } from '@/lib/payments/upfront-rule';

interface PublicInvoice {
  invoice_number: string;
  public_slug: string;
  status: string;
  customer_name: string | null;
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
  balance_cents: number;
  // S4 — upfront/deposit so /pay can show the banner + clamp the amount input.
  deposit_amount_cents: number;
  /** Smallest the next payment may be (cents): the outstanding upfront, or 1. */
  min_payment_cents: number;
  /** Largest the next payment may be (cents): the remaining balance. */
  max_payment_cents: number;
  /** True while the cumulative paid hasn't yet met the upfront requirement. */
  upfront_outstanding: boolean;
  issued_at: string | null;
  due_at: string | null;
  paid_at: string | null;
  line_items: LineItemPublic[];
  // P8 — when paid, show the customer the methods + dates + tx ids
  // they cleared on. Always present (empty array on a brand-new
  // invoice).
  payments: PublicPaymentSummary[];
}

export const GET = withErrorHandler(async (req: NextRequest) => {
  // ── A1-4: THROTTLE, because this is an ENUMERATION surface as much as a cost one ────────────────
  //
  // Invoice numbers are `SS-<yymmdd>-<hhmmss>-<3 chars>`, which is guessable in a way a random slug is
  // not — the date and time of a working day are a small space, and the suffix is three characters. A hit
  // returns a customer's NAME and their outstanding BALANCE.
  //
  // The header above notes that the slug "prevents enumeration", and that is true of the slug. It is not
  // true of `invoice_number`, which this same handler also accepts, because it has to: the number is what
  // is printed on the paper invoice the customer is holding.
  //
  // 30 per 5 minutes lets someone fumble their invoice number over and over without ever noticing, and
  // makes walking the space impractical.
  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim()
    || req.headers.get('x-real-ip')
    || '';
  const limited = await enforceRateLimit('public-lookup', null, { ip });
  if (limited) return limited;

  // A1-4b — every path below returns through `notBefore(startedAt, …)`, so a 404 and a hit leave at the
  // same moment. Started AFTER the rate-limit check on purpose: a throttled caller should be refused
  // immediately, and padding their 429 would only make the endpoint slower to say no.
  const startedAt = now();

  const url = new URL(req.url);
  const segments = url.pathname.split('/').filter(Boolean);
  const rawKey = decodeURIComponent(segments[segments.length - 1] ?? '').trim();
  if (!rawKey) {
    // Floored like every other terminal path. A blank key is not a guess at an invoice number, so this
    // one leaks nothing — but a route where one return is unpadded is a route where the next one added
    // will be unpadded too, and the test below asserts there are none.
    return notBefore(startedAt, NextResponse.json({ error: 'Missing invoice number' }, { status: 400 }));
  }
  // Normalize for case-insensitive lookup — invoice numbers print
  // in uppercase, slugs are typed exactly.
  const upper = rawKey.toUpperCase();

  const { data: invoice, error } = await supabaseAdmin
    .from('customer_invoices')
    .select('id, invoice_number, public_slug, status, customer_name, subtotal_cents, tax_cents, total_cents, deposit_amount_cents, issued_at, due_at, paid_at, line_items')
    .or(`invoice_number.eq.${upper},public_slug.eq.${rawKey}`)
    .maybeSingle();

  if (error) {
    return notBefore(startedAt, NextResponse.json({ error: 'Lookup failed' }, { status: 500 }));
  }

  // A1-4b — THE SAME ROUND TRIPS EITHER WAY. This is the half that matters: a miss that skipped the
  // payments query would be structurally faster, and a difference that scales with how busy the database
  // is cannot be padded away. So the second query runs on both paths — for a miss it looks up an id that
  // exists nowhere, which costs one indexed lookup and returns nothing.
  //
  // The rate limit (30 per 5 minutes, A1-4) is what keeps that extra query from being worth exploiting as
  // load in its own right.
  const { data: payments } = await supabaseAdmin
    .from('payments')
    .select('amount_cents, method, status, cleared_at, external_id, payer_email')
    .eq('invoice_id', invoice?.id ?? '00000000-0000-0000-0000-000000000000')
    .order('cleared_at', { ascending: false });

  if (!invoice) {
    return notBefore(startedAt, NextResponse.json({ error: 'Invoice not found' }, { status: 404 }));
  }
  if (PUBLIC_BLOCKED_STATUSES.has(invoice.status)) {
    return notBefore(startedAt, NextResponse.json({ error: 'Invoice not available' }, { status: 410 }));
  }

  const paid = sumSucceededPayments(payments ?? []);
  const paymentSummaries: PublicPaymentSummary[] = ((payments ?? []) as Array<Parameters<typeof describePaymentForReceipt>[0]>)
    .map(describePaymentForReceipt)
    .filter((s: PublicPaymentSummary | null): s is PublicPaymentSummary => s !== null);
  const total = typeof invoice.total_cents === 'number' ? invoice.total_cents : 0;
  const balance = Math.max(0, total - paid);

  // Upfront/deposit envelope for the next payment — reuse the same rule the
  // payment routes enforce so the UI clamp matches server validation exactly.
  const deposit = typeof invoice.deposit_amount_cents === 'number' ? invoice.deposit_amount_cents : 0;
  const envelope = decideUpfrontAcceptance({
    deposit_amount_cents: deposit,
    prior_paid_cents: paid,
    intended_amount_cents: balance, // a known-valid amount → returns min/max
    total_cents: total,
  });

  const body: PublicInvoice = {
    invoice_number: invoice.invoice_number,
    public_slug: invoice.public_slug,
    status: invoice.status,
    customer_name: invoice.customer_name ?? null,
    subtotal_cents: invoice.subtotal_cents ?? 0,
    tax_cents: invoice.tax_cents ?? 0,
    total_cents: total,
    balance_cents: balance,
    deposit_amount_cents: deposit,
    min_payment_cents: envelope.min_cents,
    max_payment_cents: envelope.max_cents,
    upfront_outstanding: balance > 0 && paid < Math.min(deposit, total),
    issued_at: invoice.issued_at ?? null,
    due_at: invoice.due_at ?? null,
    paid_at: invoice.paid_at ?? null,
    line_items: sanitizeLineItems(invoice.line_items),
    payments: paymentSummaries,
  };

  return notBefore(startedAt, NextResponse.json({ invoice: body }));
});

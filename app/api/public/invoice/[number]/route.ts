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
import {
  PUBLIC_BLOCKED_STATUSES,
  describePaymentForReceipt,
  sanitizeLineItems,
  sumSucceededPayments,
  type LineItemPublic,
  type PublicPaymentSummary,
} from '@/lib/payments/invoice-public';

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
  // P8 — when paid, show the customer the methods + dates + tx ids
  // they cleared on. Always present (empty array on a brand-new
  // invoice).
  payments: PublicPaymentSummary[];
}

export const GET = withErrorHandler(async (req: NextRequest) => {
  const url = new URL(req.url);
  const segments = url.pathname.split('/').filter(Boolean);
  const rawKey = decodeURIComponent(segments[segments.length - 1] ?? '').trim();
  if (!rawKey) {
    return NextResponse.json({ error: 'Missing invoice number' }, { status: 400 });
  }
  // Normalize for case-insensitive lookup — invoice numbers print
  // in uppercase, slugs are typed exactly.
  const upper = rawKey.toUpperCase();

  const { data: invoice, error } = await supabaseAdmin
    .from('invoices')
    .select('invoice_number, public_slug, status, customer_name, subtotal_cents, tax_cents, total_cents, issued_at, due_at, paid_at, line_items')
    .or(`invoice_number.eq.${upper},public_slug.eq.${rawKey}`)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: 'Lookup failed' }, { status: 500 });
  }
  if (!invoice) {
    return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
  }
  if (PUBLIC_BLOCKED_STATUSES.has(invoice.status)) {
    return NextResponse.json({ error: 'Invoice not available' }, { status: 410 });
  }

  const { data: payments } = await supabaseAdmin
    .from('payments')
    .select('amount_cents, method, status, cleared_at, external_id, payer_email')
    .eq('invoice_id', (invoice as { id?: string }).id ?? '00000000-0000-0000-0000-000000000000')
    .order('cleared_at', { ascending: false });

  const paid = sumSucceededPayments(payments ?? []);
  const paymentSummaries: PublicPaymentSummary[] = ((payments ?? []) as Array<Parameters<typeof describePaymentForReceipt>[0]>)
    .map(describePaymentForReceipt)
    .filter((s: PublicPaymentSummary | null): s is PublicPaymentSummary => s !== null);
  const total = typeof invoice.total_cents === 'number' ? invoice.total_cents : 0;
  const balance = Math.max(0, total - paid);

  const body: PublicInvoice = {
    invoice_number: invoice.invoice_number,
    public_slug: invoice.public_slug,
    status: invoice.status,
    customer_name: invoice.customer_name ?? null,
    subtotal_cents: invoice.subtotal_cents ?? 0,
    tax_cents: invoice.tax_cents ?? 0,
    total_cents: total,
    balance_cents: balance,
    issued_at: invoice.issued_at ?? null,
    due_at: invoice.due_at ?? null,
    paid_at: invoice.paid_at ?? null,
    line_items: sanitizeLineItems(invoice.line_items),
    payments: paymentSummaries,
  };

  return NextResponse.json({ invoice: body });
});

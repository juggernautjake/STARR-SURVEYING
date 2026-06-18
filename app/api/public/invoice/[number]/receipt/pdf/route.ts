// app/api/public/invoice/[number]/receipt/pdf/route.ts
//
// P9 of payment-infrastructure-2026-06-18.md — server-renders the
// customer's receipt as a PDF + serves it directly. Lets the
// customer hit the "Download receipt (PDF)" button on the return-
// to-portal paid-card.
//
// Auth surface mirrors the other public invoice endpoints: the
// invoice number / public_slug IS the auth token. The endpoint
// short-circuits to 404 on missing rows, 410 on draft/voided,
// 409 on unpaid invoices (no receipt to render).
//
// Storage is intentionally NOT used — the PDF is regenerated on
// every request. The receipt rows change only when a new payment
// clears; rendering takes <50ms; a bucket-signed-URL would just
// add a layer of token management without buying real privacy
// (the invoice number is already the gating credential).

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import {
  PUBLIC_BLOCKED_STATUSES,
  describePaymentForReceipt,
  sumSucceededPayments,
} from '@/lib/payments/invoice-public';
import { buildInvoicePayLink } from '@/lib/payments/invoice-number';
import { buildReceiptModel, renderReceiptPdf } from '@/lib/payments/receipt-pdf';
import { OFFICE_ADDRESS_LINE1, OFFICE_ADDRESS_LINE2 } from '@/app/components/ServiceAreaMap';

const OFFICE_PHONE = '(936) 662-0077';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const url = new URL(req.url);
  const parts = url.pathname.split('/').filter(Boolean);
  // …/invoice/<number>/receipt/pdf — number is the third-to-last segment.
  const rawKey = decodeURIComponent(parts[parts.length - 3] ?? '').trim();
  if (!rawKey) {
    return NextResponse.json({ error: 'Missing invoice number' }, { status: 400 });
  }
  const upper = rawKey.toUpperCase();

  const { data: invoice } = await supabaseAdmin
    .from('invoices')
    .select('id, invoice_number, public_slug, status, customer_name, customer_email, total_cents')
    .or(`invoice_number.eq.${upper},public_slug.eq.${rawKey}`)
    .maybeSingle();
  if (!invoice) {
    return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
  }
  if (PUBLIC_BLOCKED_STATUSES.has(invoice.status)) {
    return NextResponse.json({ error: 'Invoice not available' }, { status: 410 });
  }

  const { data: payments } = await supabaseAdmin
    .from('payments')
    .select('amount_cents, method, status, cleared_at, external_id, payer_email')
    .eq('invoice_id', invoice.id)
    .order('cleared_at', { ascending: false });
  const paidCents = sumSucceededPayments(payments ?? []);
  if (paidCents === 0) {
    return NextResponse.json({ error: 'No cleared payments yet.' }, { status: 409 });
  }
  type PaymentSummary = NonNullable<ReturnType<typeof describePaymentForReceipt>>;
  const paymentSummaries: PaymentSummary[] = ((payments ?? []) as Array<Parameters<typeof describePaymentForReceipt>[0]>)
    .map(describePaymentForReceipt)
    .filter((s: PaymentSummary | null): s is PaymentSummary => s !== null);

  const host = process.env.NEXT_PUBLIC_APP_URL ?? 'https://starr-surveying.com';
  const model = buildReceiptModel({
    invoice_number: invoice.invoice_number,
    customer_name: invoice.customer_name,
    customer_email: invoice.customer_email,
    total_cents: invoice.total_cents ?? 0,
    paid_cents: paidCents,
    payments: paymentSummaries,
    office_address_line1: OFFICE_ADDRESS_LINE1,
    office_address_line2: OFFICE_ADDRESS_LINE2,
    office_phone: OFFICE_PHONE,
    pay_link: buildInvoicePayLink(host, invoice.public_slug),
  });
  const pdf = await renderReceiptPdf(model);

  return new NextResponse(pdf, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="Receipt_${invoice.invoice_number}.pdf"`,
      'Cache-Control': 'private, max-age=0, must-revalidate',
    },
  });
});

// app/api/public/invoice/[number]/receipt/route.ts
//
// P8 of payment-infrastructure-2026-06-18.md — public endpoint that
// re-sends the customer's payment receipt by email. Backs the
// "Email me a receipt" button on the return-to-portal paid-card.
//
//   POST  /api/public/invoice/{number}/receipt   application/json
//     body: { to: string }
//
// Permits the customer to type any email — there's no way to
// authenticate ownership of an invoice via the public portal beyond
// possession of the invoice number / slug, and the customer might
// be sending the receipt to an accountant or assistant.
//
// PDF rendering + a separate Download endpoint ships in P9; this
// endpoint covers the immediate user need (return to portal, get a
// receipt to a different address) without blocking on the PDF
// pipeline.

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import {
  PUBLIC_BLOCKED_STATUSES,
  describePaymentForReceipt,
  sumSucceededPayments,
} from '@/lib/payments/invoice-public';
import { buildInvoicePayLink } from '@/lib/payments/invoice-number';
import {
  buildReceiptResendHtml,
  buildReceiptResendSubject,
  buildReceiptResendText,
} from '@/lib/payments/invoice-email';

export const POST = withErrorHandler(async (req: NextRequest) => {
  const url = new URL(req.url);
  const parts = url.pathname.split('/').filter(Boolean);
  // …/invoice/<number>/receipt — number is the second-to-last segment.
  const rawKey = decodeURIComponent(parts[parts.length - 2] ?? '').trim();
  if (!rawKey) {
    return NextResponse.json({ error: 'Missing invoice number' }, { status: 400 });
  }
  const upper = rawKey.toUpperCase();

  const body = (await req.json().catch(() => ({}))) as { to?: string };
  const to = typeof body.to === 'string' ? body.to.trim() : '';
  if (!to || !to.includes('@')) {
    return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 });
  }

  const { data: invoice } = await supabaseAdmin
    .from('invoices')
    .select('id, invoice_number, public_slug, status, customer_name, total_cents')
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
    return NextResponse.json({ error: 'No cleared payments yet. The receipt will arrive once we log your payment.' }, { status: 409 });
  }

  type PaymentSummary = NonNullable<ReturnType<typeof describePaymentForReceipt>>;
  const paymentSummaries: PaymentSummary[] = ((payments ?? []) as Array<Parameters<typeof describePaymentForReceipt>[0]>)
    .map(describePaymentForReceipt)
    .filter((s: PaymentSummary | null): s is PaymentSummary => s !== null);

  const host = process.env.NEXT_PUBLIC_APP_URL ?? 'https://starr-surveying.com';
  const payload = {
    invoice_number: invoice.invoice_number,
    customer_name: invoice.customer_name,
    total_cents: invoice.total_cents ?? 0,
    paid_cents: paidCents,
    payments: paymentSummaries,
    pay_link: buildInvoicePayLink(host, invoice.public_slug),
  };
  const subject = buildReceiptResendSubject({ invoice_number: invoice.invoice_number });
  const html = buildReceiptResendHtml(payload);
  const text = buildReceiptResendText(payload);

  let sent = false;
  let sendError: string | null = null;
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (RESEND_API_KEY && RESEND_API_KEY !== 'your_resend_api_key') {
    try {
      const resp = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'Starr Surveying <info@starr-surveying.com>',
          to: [to],
          reply_to: 'info@starr-surveying.com',
          subject,
          html,
          text,
        }),
      });
      if (resp.ok) sent = true;
      else sendError = `Resend returned ${resp.status}`;
    } catch (err) {
      sendError = err instanceof Error ? err.message : String(err);
    }
  } else {
    sent = true;
    console.log(`[receipt-resend] DEV — would send to ${to}: ${subject}`);
  }

  // Stamp a payment_receipts row so the office can see the resend
  // history. One row per send (intentional — we want a full log).
  if (paymentSummaries.length > 0) {
    const { data: latestPayment } = await supabaseAdmin
      .from('payments')
      .select('id')
      .eq('invoice_id', invoice.id)
      .eq('status', 'succeeded')
      .order('cleared_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latestPayment) {
      await supabaseAdmin.from('payment_receipts').insert({
        payment_id: latestPayment.id,
        invoice_id: invoice.id,
        sent_to_email: to,
        sent_at: sent ? new Date().toISOString() : null,
        send_error: sendError,
      });
    }
  }

  return NextResponse.json({ sent, send_error: sendError });
});

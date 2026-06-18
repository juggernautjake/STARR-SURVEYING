// app/api/admin/payment-attempts/[id]/clear/route.ts
//
// P10 of payment-infrastructure-2026-06-18.md — one-click "Mark
// cleared" action. Flips the attempt + the invoice + writes the
// payments row + fires the customer's receipt email.
//
//   POST  /api/admin/payment-attempts/{id}/clear  application/json
//     body: {
//       amount_cents?:     number   // defaults to intended_amount_cents
//       external_ref?:     string   // platform tx id (Venmo) or check number
//       notes?:            string
//     }
//
// Returns { payment_id, attempt_id, invoice_status }.
//
// Idempotency: if the attempt already has a `resulted_in_payment_id`,
// we 409 — the office double-clicked. The payments row INSERT is
// not idempotent on its own (no external_id dedup for cash/check)
// so the early return matters.

import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import {
  describePaymentForReceipt,
  sumSucceededPayments,
} from '@/lib/payments/invoice-public';
import { nextInvoiceStatusAfterPayment } from '@/lib/payments/stripe';
import {
  buildReceiptResendHtml,
  buildReceiptResendSubject,
  buildReceiptResendText,
} from '@/lib/payments/invoice-email';
import { buildInvoicePayLink } from '@/lib/payments/invoice-number';

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user || !isAdmin(session.user.roles)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const url = new URL(req.url);
  const segments = url.pathname.split('/').filter(Boolean);
  // …/payment-attempts/<id>/clear — id is the second-to-last segment.
  const attemptId = segments[segments.length - 2];
  if (!attemptId) {
    return NextResponse.json({ error: 'Missing attempt id' }, { status: 400 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    amount_cents?: number;
    external_ref?: string;
    notes?: string;
  };

  const { data: attempt } = await supabaseAdmin
    .from('payment_attempts')
    .select('id, invoice_id, method, status, intended_amount_cents, payer_email, resulted_in_payment_id')
    .eq('id', attemptId)
    .maybeSingle();
  if (!attempt) {
    return NextResponse.json({ error: 'Attempt not found' }, { status: 404 });
  }
  if (attempt.resulted_in_payment_id) {
    return NextResponse.json({ error: 'Attempt already cleared.' }, { status: 409 });
  }
  if (attempt.status === 'succeeded' || attempt.status === 'abandoned') {
    return NextResponse.json({ error: `Cannot clear an attempt in status "${attempt.status}".` }, { status: 409 });
  }

  const { data: invoice } = await supabaseAdmin
    .from('invoices')
    .select('id, invoice_number, public_slug, status, total_cents, customer_name, customer_email')
    .eq('id', attempt.invoice_id)
    .maybeSingle();
  if (!invoice) {
    return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
  }

  const amount = typeof body.amount_cents === 'number'
    ? Math.max(0, Math.round(body.amount_cents))
    : attempt.intended_amount_cents;

  const { data: existingPayments } = await supabaseAdmin
    .from('payments')
    .select('amount_cents, status')
    .eq('invoice_id', invoice.id);
  const alreadyPaid = sumSucceededPayments(existingPayments ?? []);
  const nextStatus = nextInvoiceStatusAfterPayment({
    totalCents: invoice.total_cents ?? 0,
    alreadyPaidCents: alreadyPaid,
    newPaymentCents: amount,
    currentStatus: invoice.status,
  });

  // Write the payment row first so the receipt-fetch reflects it.
  const { data: payment, error: payErr } = await supabaseAdmin
    .from('payments')
    .insert({
      invoice_id: invoice.id,
      amount_cents: amount,
      method: attempt.method,
      status: 'succeeded',
      external_id: body.external_ref?.slice(0, 200) ?? null,
      external_provider: attempt.method === 'cash' || attempt.method === 'check' ? 'manual' : attempt.method,
      payer_email: attempt.payer_email,
      reconciled_by: session.user.email ?? null,
      cleared_at: new Date().toISOString(),
      notes: body.notes?.slice(0, 1000) ?? null,
    })
    .select('id')
    .single();
  if (payErr || !payment) {
    return NextResponse.json({ error: payErr?.message ?? 'Could not record payment' }, { status: 500 });
  }

  await supabaseAdmin
    .from('payment_attempts')
    .update({
      status: 'succeeded',
      confirmed_by: session.user.email ?? null,
      confirmed_at: new Date().toISOString(),
      resulted_in_payment_id: payment.id,
    })
    .eq('id', attempt.id);

  await supabaseAdmin
    .from('invoices')
    .update({
      status: nextStatus,
      paid_at: nextStatus === 'paid' ? new Date().toISOString() : null,
    })
    .eq('id', invoice.id);

  // Fire the receipt email when we have somewhere to send it.
  const recipient = (attempt.payer_email ?? invoice.customer_email ?? '').trim();
  let receiptSent = false;
  let receiptError: string | null = null;
  if (recipient && recipient.includes('@')) {
    const { data: allPayments } = await supabaseAdmin
      .from('payments')
      .select('amount_cents, method, status, cleared_at, external_id, payer_email')
      .eq('invoice_id', invoice.id)
      .order('cleared_at', { ascending: false });
    type PaymentSummary = NonNullable<ReturnType<typeof describePaymentForReceipt>>;
    const summaries: PaymentSummary[] = ((allPayments ?? []) as Array<Parameters<typeof describePaymentForReceipt>[0]>)
      .map(describePaymentForReceipt)
      .filter((s: PaymentSummary | null): s is PaymentSummary => s !== null);
    const totalPaid = sumSucceededPayments(allPayments ?? []);
    const host = process.env.NEXT_PUBLIC_APP_URL ?? 'https://starr-surveying.com';
    const payload = {
      invoice_number: invoice.invoice_number,
      customer_name: invoice.customer_name,
      total_cents: invoice.total_cents ?? 0,
      paid_cents: totalPaid,
      payments: summaries,
      pay_link: buildInvoicePayLink(host, invoice.public_slug),
    };
    const subject = buildReceiptResendSubject({ invoice_number: invoice.invoice_number });
    const html = buildReceiptResendHtml(payload);
    const text = buildReceiptResendText(payload);

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
            to: [recipient],
            reply_to: 'info@starr-surveying.com',
            subject,
            html,
            text,
          }),
        });
        if (resp.ok) receiptSent = true;
        else receiptError = `Resend returned ${resp.status}`;
      } catch (err) {
        receiptError = err instanceof Error ? err.message : String(err);
      }
    } else {
      receiptSent = true;
      console.log(`[clear] DEV — would send receipt to ${recipient}: ${subject}`);
    }

    await supabaseAdmin.from('payment_receipts').insert({
      payment_id: payment.id,
      invoice_id: invoice.id,
      sent_to_email: recipient,
      sent_at: receiptSent ? new Date().toISOString() : null,
      send_error: receiptError,
    });
  }

  return NextResponse.json({
    payment_id: payment.id,
    attempt_id: attempt.id,
    invoice_status: nextStatus,
    receipt_sent: receiptSent,
    receipt_error: receiptError,
    receipt_recipient: recipient || null,
  });
});

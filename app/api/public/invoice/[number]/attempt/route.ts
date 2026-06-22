// app/api/public/invoice/[number]/attempt/route.ts
//
// P6 of payment-infrastructure-2026-06-18.md — public endpoint that
// records a customer's "I sent it" claim (Venmo / CashApp / Zelle)
// or a cash/check pledge (P7). Writes a `payment_attempts` row in
// the appropriate hold state so the office close-out queue can
// pick it up.
//
//   POST  /api/public/invoice/{number}/attempt
//     body: { method, intended_amount_cents?, external_ref?, payer_email?, payer_message? }
//
// Status mapping:
//   - venmo / cashapp / zelle → 'pending_confirmation' (office checks
//     the platform tx log to confirm the funds arrived)
//   - cash / check            → 'pledged'              (office waits
//     for the cash / check to physically arrive)
//   - stripe                  → not accepted here (Stripe has its
//     own intent route that ships the PaymentIntent + webhook flow)
//
// The route is intentionally NOT gated by PAYMENTS_LIVE — recording
// customer intent isn't a money-mover, and we want the claims queued
// up so the office can reconcile manually until the full clearance
// pipeline is wired.

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import {
  PUBLIC_BLOCKED_STATUSES,
  attemptStatusForMethod,
  sanitizeAttemptMessage,
  sumSucceededPayments,
} from '@/lib/payments/invoice-public';
import {
  buildPledgeConfirmationHtml,
  buildPledgeConfirmationSubject,
  buildPledgeConfirmationText,
} from '@/lib/payments/invoice-email';
import { buildInvoicePayLink } from '@/lib/payments/invoice-number';
import { OFFICE_ADDRESS_LINE1, OFFICE_ADDRESS_LINE2 } from '@/app/components/ServiceAreaMap';

export const POST = withErrorHandler(async (req: NextRequest) => {
  const url = new URL(req.url);
  const parts = url.pathname.split('/').filter(Boolean);
  // …/invoice/<number>/attempt — number is the second-to-last segment.
  const rawKey = decodeURIComponent(parts[parts.length - 2] ?? '').trim();
  if (!rawKey) {
    return NextResponse.json({ error: 'Missing invoice number' }, { status: 400 });
  }
  const upper = rawKey.toUpperCase();

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const method = typeof body.method === 'string' ? body.method : '';
  const status = attemptStatusForMethod(method);
  if (!status) {
    return NextResponse.json({ error: 'Unsupported payment method.' }, { status: 400 });
  }

  const { data: invoice } = await supabaseAdmin
    .from('customer_invoices')
    .select('id, invoice_number, public_slug, status, total_cents, customer_name')
    .or(`invoice_number.eq.${upper},public_slug.eq.${rawKey}`)
    .maybeSingle();
  if (!invoice) {
    return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
  }
  if (PUBLIC_BLOCKED_STATUSES.has(invoice.status)) {
    return NextResponse.json({ error: 'Invoice not available' }, { status: 410 });
  }

  // Default the intended amount to the outstanding balance so the
  // customer doesn't have to type it on a phone.
  const { data: payments } = await supabaseAdmin
    .from('payments')
    .select('amount_cents, status')
    .eq('invoice_id', invoice.id);
  const balance = Math.max(0, (invoice.total_cents ?? 0) - sumSucceededPayments(payments ?? []));
  if (balance === 0) {
    return NextResponse.json({ error: 'Invoice is already paid in full.' }, { status: 409 });
  }
  const intended = typeof body.intended_amount_cents === 'number'
    ? Math.max(0, Math.round(body.intended_amount_cents))
    : balance;

  const row = {
    invoice_id: invoice.id,
    method,
    intended_amount_cents: intended,
    status,
    external_ref: typeof body.external_ref === 'string' ? body.external_ref.slice(0, 200) : null,
    payer_email: typeof body.payer_email === 'string' ? body.payer_email.trim().slice(0, 200) || null : null,
    payer_message: sanitizeAttemptMessage(body.payer_message),
  };
  const { data: attempt, error } = await supabaseAdmin
    .from('payment_attempts')
    .insert(row)
    .select('id, method, status, intended_amount_cents, created_at')
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // P7 — cash / check pledges trigger an immediate confirmation
  // email so the customer has the mailing address + receipt-incoming
  // expectations in writing. Deep-link methods skip this (the
  // platform's own receipt covers them).
  let pledgeEmailSent = false;
  let pledgeEmailError: string | null = null;
  if ((method === 'cash' || method === 'check') && row.payer_email) {
    const isMailing = (typeof body.is_mailing === 'boolean') ? body.is_mailing : method === 'check';
    const host = process.env.NEXT_PUBLIC_APP_URL ?? 'https://starr-surveying.com';
    const payload = {
      method: method as 'cash' | 'check',
      invoice_number: invoice.invoice_number,
      customer_name: invoice.customer_name,
      amount_cents: intended,
      office_address_line1: OFFICE_ADDRESS_LINE1,
      office_address_line2: OFFICE_ADDRESS_LINE2,
      pay_link: buildInvoicePayLink(host, invoice.public_slug),
      is_mailing: isMailing,
    };
    const subject = buildPledgeConfirmationSubject({ method: payload.method, invoice_number: invoice.invoice_number });
    const html = buildPledgeConfirmationHtml(payload);
    const text = buildPledgeConfirmationText(payload);

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
            to: [row.payer_email],
            reply_to: 'info@starr-surveying.com',
            subject,
            html,
            text,
          }),
        });
        if (resp.ok) {
          pledgeEmailSent = true;
        } else {
          pledgeEmailError = `Resend returned ${resp.status}`;
        }
      } catch (err) {
        pledgeEmailError = err instanceof Error ? err.message : String(err);
      }
    } else {
      // Dev mode — log + treat as sent so the UI surfaces the right
      // confirmation panel without forcing the office to set up
      // Resend before previewing the flow.
      pledgeEmailSent = true;
      console.log(`[pledge] DEV — would send to ${row.payer_email}: ${subject}`);
    }
  }

  return NextResponse.json({ attempt, pledge_email_sent: pledgeEmailSent, pledge_email_error: pledgeEmailError });
});

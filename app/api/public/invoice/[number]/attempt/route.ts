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
    .from('invoices')
    .select('id, status, total_cents')
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

  return NextResponse.json({ attempt });
});

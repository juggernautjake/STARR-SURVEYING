// app/api/public/invoice/[number]/intent/route.ts
//
// P5 of payment-infrastructure-2026-06-18.md — public endpoint that
// creates a Stripe PaymentIntent for an invoice + records a shadow
// row in `payment_intents`.
//
// Gating:
//   - paymentsAreLive() must return true (PAYMENTS_LIVE=true env)
//   - STRIPE_SECRET_KEY must be set
// If either is false, we return a 503 with a customer-friendly note
// that real-money paths aren't enabled yet. The portal renders the
// not-yet-wired toast in that case (handled at the UI layer; this
// route never silently no-ops).
//
// Body returned on success:
//   { client_secret: string, public_intent_id: string }
//
// The shadow row in `payment_intents` is what the webhook handler
// uses to find the invoice when the PaymentIntent fires `succeeded`.

import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { paymentsAreLive } from '@/lib/payments/live';
import {
  buildPaymentIntentParams,
  type InvoiceForIntent,
} from '@/lib/payments/stripe';
import { PUBLIC_BLOCKED_STATUSES, sumSucceededPayments } from '@/lib/payments/invoice-public';

export const POST = withErrorHandler(async (req: NextRequest) => {
  if (!paymentsAreLive()) {
    return NextResponse.json(
      { error: 'Online card payments are not yet enabled. Please call (936) 662-0077.' },
      { status: 503 },
    );
  }
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) {
    return NextResponse.json(
      { error: 'Stripe is not configured on this environment.' },
      { status: 503 },
    );
  }

  const url = new URL(req.url);
  const parts = url.pathname.split('/').filter(Boolean);
  // …/invoice/<number>/intent — number is the second-to-last segment.
  const rawKey = decodeURIComponent(parts[parts.length - 2] ?? '').trim();
  if (!rawKey) {
    return NextResponse.json({ error: 'Missing invoice number' }, { status: 400 });
  }
  const upper = rawKey.toUpperCase();

  const { data: invoice } = await supabaseAdmin
    .from('invoices')
    .select('id, invoice_number, public_slug, status, total_cents, customer_email, customer_name')
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
    .select('amount_cents, status')
    .eq('invoice_id', invoice.id);
  const paid = sumSucceededPayments(payments ?? []);
  const balance = Math.max(0, (invoice.total_cents ?? 0) - paid);
  if (balance <= 0) {
    return NextResponse.json({ error: 'Invoice is already paid in full.' }, { status: 409 });
  }

  const intentInput: InvoiceForIntent = {
    id: invoice.id,
    invoice_number: invoice.invoice_number,
    public_slug: invoice.public_slug,
    balance_cents: balance,
    customer_email: invoice.customer_email,
    customer_name: invoice.customer_name,
  };

  // Pin to the same apiVersion the rest of the app uses (see
  // app/api/admin/research/document-access/route.ts).
  const stripe = new Stripe(secret, { apiVersion: '2025-02-24.acacia' });
  const params = buildPaymentIntentParams(intentInput);
  const intent = await stripe.paymentIntents.create(params as unknown as Stripe.PaymentIntentCreateParams);

  // Shadow row so the webhook can match the event back to the
  // invoice without re-querying Stripe.
  await supabaseAdmin
    .from('payment_intents')
    .insert({
      invoice_id: invoice.id,
      provider: 'stripe',
      external_intent_id: intent.id,
      amount_cents: balance,
      currency: 'usd',
      status: intent.status,
      client_secret: intent.client_secret,
      metadata: { invoice_number: invoice.invoice_number, public_slug: invoice.public_slug },
    });

  return NextResponse.json({
    client_secret: intent.client_secret,
    public_intent_id: intent.id,
  });
});

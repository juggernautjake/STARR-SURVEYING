// app/api/voice/pay/webhook/route.ts — Stripe telling us money cleared.
//
// ── THE BROWSER IS NOT ALLOWED TO MARK AN INVOICE PAID ──────────────────────────────────────────
//
// After a successful card confirm the client's browser knows it worked. It is not permitted to say
// so. The only thing that moves `paid_cents` is this endpoint, verified against Stripe's signature,
// because "tell the server it worked" is a request anybody can forge and the payload would be an
// invoice number and an amount. The browser gets a nice page; the ledger gets the webhook.
//
// ── IDEMPOTENCE ─────────────────────────────────────────────────────────────────────────────────
//
// Stripe retries a webhook until it gets a 2xx, and it will happily deliver the same event twice
// after a timeout that actually succeeded. The PaymentIntent id is stored in `reference` and checked
// first: a second delivery finds the row, returns 200, and changes nothing. Without that, a retried
// event double-credits the invoice and Andrew refunds money he was owed.
//
// ── RAW BODY ────────────────────────────────────────────────────────────────────────────────────
//
// Signature verification hashes the exact bytes Stripe sent. `request.text()` before any parsing;
// re-serialising parsed JSON produces a different string and every signature fails.

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { statusAfterPayment, voiceStripeSecretKey } from '@/lib/voice/payments';
import { formatCents } from '@/lib/voice/money';
import { notifyStudio } from '@/lib/voice/notifications';
import { BASE_PATH } from '@/lib/voice/content';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request): Promise<NextResponse> {
  const secret = voiceStripeSecretKey();
  const webhookSecret = (process.env.VOICE_STRIPE_WEBHOOK_SECRET ?? '').trim();
  if (!secret || !webhookSecret) {
    return NextResponse.json({ error: 'Not configured.' }, { status: 503 });
  }

  const signature = request.headers.get('stripe-signature');
  if (!signature) return NextResponse.json({ error: 'Unsigned.' }, { status: 400 });

  const raw = await request.text();

  let event: { type: string; data: { object: Record<string, unknown> } };
  try {
    const { default: Stripe } = await import('stripe');
    const stripe = new Stripe(secret, {});
    event = stripe.webhooks.constructEvent(raw, signature, webhookSecret) as unknown as typeof event;
  } catch {
    // A failed signature is either a misconfiguration or someone probing. Neither gets detail.
    return NextResponse.json({ error: 'Bad signature.' }, { status: 400 });
  }

  // Anything that is not cleared money is acknowledged and ignored. Returning non-2xx for events we
  // did not ask about makes Stripe retry them forever and eventually disable the endpoint.
  if (event.type !== 'payment_intent.succeeded') {
    return NextResponse.json({ received: true });
  }

  const intent = event.data.object as {
    id?: string;
    amount_received?: number;
    currency?: string;
    metadata?: Record<string, string>;
  };

  const intentId = typeof intent.id === 'string' ? intent.id : null;
  const invoiceId = intent.metadata?.va_invoice_id ?? null;
  const amount = typeof intent.amount_received === 'number' ? intent.amount_received : 0;

  // A PaymentIntent that is not ours — a different product on the same Stripe account — has no
  // va_invoice_id. Acknowledge it and stay out of the way.
  if (!intentId || !invoiceId || amount <= 0) return NextResponse.json({ received: true });

  if ((intent.currency ?? 'usd').toLowerCase() !== 'usd') {
    console.error('[voice/webhook] non-USD intent ignored', intentId);
    return NextResponse.json({ received: true });
  }

  // Idempotence gate.
  const { data: existing } = await supabaseAdmin
    .from('va_payments')
    .select('id')
    .eq('reference', intentId)
    .maybeSingle();
  if (existing) return NextResponse.json({ received: true, duplicate: true });

  const { data: invoice } = await supabaseAdmin
    .from('va_invoices')
    .select('id, invoice_number, total_cents, paid_cents, status, client:va_clients(name)')
    .eq('id', invoiceId)
    .maybeSingle();
  if (!invoice) {
    console.error('[voice/webhook] paid intent for unknown invoice', intentId, invoiceId);
    return NextResponse.json({ received: true });
  }

  const { error: payErr } = await supabaseAdmin.from('va_payments').insert({
    invoice_id: invoice.id,
    amount_cents: amount,
    method: 'stripe',
    status: 'succeeded',
    reference: intentId,
  });
  if (payErr) {
    // 500 so Stripe retries — losing a cleared payment is worse than a duplicate delivery, which the
    // gate above already handles.
    console.error('[voice/webhook] could not record payment', payErr);
    return NextResponse.json({ error: 'retry' }, { status: 500 });
  }

  const paidCents = (invoice.paid_cents ?? 0) + amount;
  const status = statusAfterPayment({
    totalCents: invoice.total_cents,
    alreadyPaidCents: invoice.paid_cents ?? 0,
    newPaymentCents: amount,
  });

  await supabaseAdmin
    .from('va_invoices')
    .update({
      paid_cents: paidCents,
      status,
      paid_at: status === 'paid' ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', invoice.id);

  const client = (Array.isArray(invoice.client) ? invoice.client[0] : invoice.client) as { name?: string } | undefined;
  await notifyStudio({
    kind: 'invoice_paid',
    title:
      status === 'paid'
        ? `${formatCents(amount)} received — ${invoice.invoice_number} is settled`
        : `${formatCents(amount)} received towards ${invoice.invoice_number}`,
    body: client?.name ? `From ${client.name}.` : undefined,
    href: `${BASE_PATH}/studio/invoices`,
    subjectType: 'invoice',
    subjectId: invoice.id,
  });

  return NextResponse.json({ received: true });
}

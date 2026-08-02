// app/api/voice/pay/[token]/route.ts — starting a card payment, and declaring an offline one.
//
// Reachable by an unauthenticated stranger holding an invoice token. Two actions:
//
//   { action: 'intent' }  → create a Stripe PaymentIntent for the outstanding balance
//   { action: 'declare' } → record "I sent you the transfer" as a PENDING payment
//
// ── THE AMOUNT IS NEVER TAKEN FROM THE REQUEST ──────────────────────────────────────────────────
//
// The balance is read from the invoice row server-side. A client who edits the posted amount to $1
// gets a PaymentIntent for the real balance, because the request never had a say. This is the whole
// reason the intent is created here rather than in the browser.
//
// ── A DECLARED PAYMENT IS NOT A PAYMENT ─────────────────────────────────────────────────────────
//
// `declare` writes status='pending' and does NOT move `paid_cents`. Somebody saying they sent a Zelle
// transfer is a claim, and treating a claim as cleared money is how a freelancer delivers finished
// audio against money that never arrives. It shows in the studio as "says they paid — confirm when it
// lands", and Andrew's confirmation is what moves the balance.

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { looksLikeToken } from '@/lib/voice/tokens';
import { balanceCents } from '@/lib/voice/money';
import { cardPaymentEnabled, voiceStripeSecretKey } from '@/lib/voice/payments';
import { notifyStudio } from '@/lib/voice/notifications';
import { BASE_PATH } from '@/lib/voice/content';

export const dynamic = 'force-dynamic';

const OFFLINE_METHODS = ['venmo', 'cashapp', 'zelle', 'paypal', 'check', 'cash', 'other'] as const;

export async function POST(request: Request, { params }: { params: { token: string } }): Promise<NextResponse> {
  if (!looksLikeToken(params.token)) {
    return NextResponse.json({ error: 'That link is not valid.' }, { status: 404 });
  }

  let body: { action?: string; method?: string; note?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Bad request.' }, { status: 400 });
  }

  const { data: invoice } = await supabaseAdmin
    .from('va_invoices')
    .select('id, invoice_number, title, total_cents, paid_cents, status, client:va_clients(name, email)')
    .eq('access_token', params.token)
    .maybeSingle();

  if (!invoice || invoice.status === 'draft') {
    return NextResponse.json({ error: 'That link is not valid.' }, { status: 404 });
  }
  if (invoice.status === 'void') {
    return NextResponse.json({ error: 'This invoice has been cancelled — nothing is owed.' }, { status: 409 });
  }

  const balance = balanceCents(invoice.total_cents, invoice.paid_cents);
  if (balance <= 0) {
    return NextResponse.json({ error: 'This invoice has already been paid in full.' }, { status: 409 });
  }

  // Supabase types the embedded relation as an array; there is exactly one client.
  const client = (Array.isArray(invoice.client) ? invoice.client[0] : invoice.client) as
    | { name?: string; email?: string }
    | undefined;

  if (body.action === 'declare') {
    const method = OFFLINE_METHODS.includes(String(body.method) as (typeof OFFLINE_METHODS)[number])
      ? String(body.method)
      : 'other';

    const { error } = await supabaseAdmin.from('va_payments').insert({
      invoice_id: invoice.id,
      amount_cents: balance,
      method,
      status: 'pending',
      declared_by_client: true,
      note: body.note ? String(body.note).slice(0, 500) : null,
    });
    if (error) return NextResponse.json({ error: 'That did not save. Please try again.' }, { status: 500 });

    await notifyStudio({
      kind: 'invoice_paid',
      title: `${client?.name ?? 'A client'} says they paid ${invoice.invoice_number}`,
      body: `By ${method}. Confirm it in the studio once the money lands — the balance has not moved yet.`,
      href: `${BASE_PATH}/studio/invoices`,
      subjectType: 'invoice',
      subjectId: invoice.id,
    });

    return NextResponse.json({ ok: true, declared: true });
  }

  // ── Card ───────────────────────────────────────────────────────────────────────────────────────
  if (!cardPaymentEnabled()) {
    return NextResponse.json(
      { error: 'Card payment is not switched on yet. Please use one of the other options below.' },
      { status: 503 },
    );
  }

  const secret = voiceStripeSecretKey();
  if (!secret) {
    return NextResponse.json({ error: 'Card payment is not switched on yet.' }, { status: 503 });
  }

  try {
    // Loaded lazily so a deployment without Andrew's keys never pulls the SDK into the request path.
    // `apiVersion` is deliberately omitted: the installed SDK's own pinned default is the version its
    // TypeScript definitions describe, and hardcoding a different string here is how a package bump
    // silently starts sending requests the types no longer match.
    const { default: Stripe } = await import('stripe');
    const stripe = new Stripe(secret, {});

    const intent = await stripe.paymentIntents.create({
      amount: balance,
      currency: 'usd',
      description: `Invoice ${invoice.invoice_number}${invoice.title ? ` — ${invoice.title}` : ''}`,
      // Read back by the webhook. Without it a cleared payment cannot be matched to an invoice, and
      // the money arrives with nothing to apply it to.
      metadata: {
        va_invoice_id: invoice.id,
        va_invoice_number: invoice.invoice_number,
      },
      ...(client?.email ? { receipt_email: client.email } : {}),
      automatic_payment_methods: { enabled: true },
    });

    if (!intent.client_secret) {
      return NextResponse.json({ error: 'Could not start a card payment.' }, { status: 500 });
    }
    return NextResponse.json({ clientSecret: intent.client_secret });
  } catch (err) {
    // Never surface a Stripe error verbatim: they name the account and the key mode.
    console.error('[voice/pay] intent failed', err);
    return NextResponse.json({ error: 'Could not start a card payment. Please try another option.' }, { status: 500 });
  }
}

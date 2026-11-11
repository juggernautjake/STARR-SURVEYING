// app/api/webhooks/stripe/route.ts — Phase 15
// Stripe webhook endpoint for payment event processing.
//
// Handles:
//   payment_intent.succeeded        → Credit wallet or fulfill document purchase
//   customer.subscription.updated   → Update subscription record
//   customer.subscription.deleted   → Mark subscription as cancelled
//   invoice.payment_succeeded       → Record invoice payment
//   invoice.payment_failed          → Notify user + retry logic
//   checkout.session.completed      → Fulfill checkout (wallet funding or doc purchase)
//
// Customer invoice payments (/pay, owner 2026-11-10: "set up online payments … however it makes
// the most sense") — every event updates the payment, then the invoice's status is worked out
// again from ALL its payments (lib/payments/stripe-lifecycle.ts):
//   payment_intent.processing       → bank (ACH) payment clearing: payment `pending`
//   payment_intent.succeeded        → payment `succeeded` (a pending one is promoted, not duplicated)
//   payment_intent.payment_failed   → a pending bank payment that bounced → `failed`; office told
//   charge.refunded                 → `refunded_cents` (+ `refunded` when whole); balance reopens
//   charge.dispute.*                → chargeback: `disputed` until won; office told
// A failure while handling one of these answers 500 and forgets the event, so Stripe sends it again
// rather than the payment being lost.
//
// Security: All requests verified via Stripe-Signature header using
//           STRIPE_WEBHOOK_SECRET environment variable.
//
// Note: This route must NOT use the withErrorHandler wrapper — it needs raw
//       request body access for signature verification.
//
// Spec §15.9 — Stripe Webhook Endpoint
// v1.0: Initial implementation

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { dispatch } from '@/lib/saas/notifications';
import { registerAllEvents } from '@/lib/saas/notifications/events';
import { paymentsAreLive } from '@/lib/payments/live';
import {
  extractInvoiceFromStripeEvent,
  stripeEventIsUsd,
} from '@/lib/payments/stripe';
import type { StripeEventLike } from '@/lib/payments/stripe';
import {
  invoiceStatusFromPayments, refundState, paymentStatusForDispute, stripeCents, intentIdOf,
} from '@/lib/payments/stripe-lifecycle';
import { sendEmailViaResend } from '@/lib/saas/notifications/email';
import { getTenantProfile } from '@/lib/saas/tenant-profile';

// Idempotent — runs on first webhook hit then short-circuits.
// The notifications service needs to know about its events before
// dispatch() is called.
registerAllEvents();

// ── Stripe webhook secret ─────────────────────────────────────────────────────

function getWebhookSecret(): string {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error('STRIPE_WEBHOOK_SECRET is not configured');
  return secret;
}

function getStripeSecretKey(): string {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY is not configured');
  return key;
}

// ── Stripe event types we handle ──────────────────────────────────────────────

type StripeEventType =
  | 'payment_intent.succeeded'
  | 'payment_intent.payment_failed'
  | 'checkout.session.completed'
  | 'customer.subscription.updated'
  | 'customer.subscription.deleted'
  | 'invoice.payment_succeeded'
  | 'invoice.payment_failed';

interface StripeEvent {
  id: string;
  type: StripeEventType | string;
  data: {
    object: Record<string, unknown>;
  };
  created: number;
}

// ── POST handler ──────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  const rawBody = await req.text();
  const signature = req.headers.get('stripe-signature');

  if (!signature) {
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 });
  }

  // Verify Stripe signature
  let event: StripeEvent;
  try {
    event = await verifyStripeSignature(rawBody, signature);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[Webhook] Signature verification failed:', msg);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Process event
  try {
    await processStripeEvent(event);
    return NextResponse.json({ received: true, eventId: event.id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[Webhook] Event processing failed for ${event.type}:`, msg);
    // A customer's money: forget the event and answer 500, so Stripe sends it again (it retries for
    // three days) instead of the payment being lost to one database hiccup. Every invoice handler is
    // safe to run twice.
    if (isInvoiceMoneyEvent(event)) {
      try {
        await supabaseAdmin.from('processed_webhook_events').delete().eq('stripe_event_id', event.id);
      } catch { /* the retry still runs; dedup is best-effort */ }
      return NextResponse.json({ received: false, error: msg }, { status: 500 });
    }
    // Everything else keeps its old answer — logged, 200, no retry — because the wallet handlers
    // are not safe to run twice.
    return NextResponse.json({ received: true, error: msg });
  }
}

// ── Signature Verification ────────────────────────────────────────────────────

/**
 * Verify Stripe webhook signature using HMAC-SHA256.
 * Follows Stripe's signature verification algorithm exactly.
 */
async function verifyStripeSignature(
  payload: string,
  signature: string,
): Promise<StripeEvent> {
  const secret = getWebhookSecret();

  // Parse signature header: t=timestamp,v1=signature(s)
  const parts: Record<string, string[]> = {};
  for (const part of signature.split(',')) {
    const [key, ...rest] = part.split('=');
    if (key && rest.length > 0) {
      parts[key] = parts[key] ?? [];
      parts[key].push(rest.join('='));
    }
  }

  const timestamp = parts['t']?.[0];
  const v1Signatures = parts['v1'] ?? [];

  if (!timestamp || v1Signatures.length === 0) {
    throw new Error('Malformed stripe-signature header');
  }

  // Check timestamp tolerance (5 minutes)
  const ts = parseInt(timestamp, 10);
  const tolerance = 5 * 60; // 5 minutes in seconds
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > tolerance) {
    throw new Error(
      `Webhook timestamp ${ts > now ? 'is in the future' : 'is too old'} ` +
      `(received: ${ts}, now: ${now}, delta: ${ts - now}s)`,
    );
  }

  // Compute expected signature: HMAC-SHA256(timestamp.payload, secret)
  const signedPayload = `${timestamp}.${payload}`;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signatureBuffer = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signedPayload));
  const expectedSig = Buffer.from(signatureBuffer).toString('hex');

  // Check if any provided v1 signature matches
  const isValid = v1Signatures.some((sig) => timingSafeEqual(sig, expectedSig));
  if (!isValid) {
    throw new Error('Stripe signature verification failed');
  }

  return JSON.parse(payload) as StripeEvent;
}

/** Timing-safe string comparison to prevent timing attacks */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

// ── Event Processing ──────────────────────────────────────────────────────────

async function processStripeEvent(event: StripeEvent): Promise<void> {
  // SaaS pivot — Phase B-2 idempotency. Stripe occasionally fires the
  // same event twice (network retries, smart-retry, replay-from-CLI).
  // The processed_webhook_events table (seeds/266_saas_billing_schema.sql)
  // is a single-column dedup ledger.
  //
  // INSERT with ON CONFLICT DO NOTHING returns success either way; we
  // then check whether the row was actually inserted by counting affected
  // rows. Supabase's PostgREST doesn't expose row counts directly — we
  // use a select-after-insert pattern.
  //
  // Race-safe: if two replicas of this handler fire concurrently for
  // the same event, only one INSERT succeeds (PRIMARY KEY constraint);
  // the other gets a duplicate-key error which we swallow. Both then
  // observe the row exists + return early.
  try {
    const { error: insertErr } = await supabaseAdmin
      .from('processed_webhook_events')
      .insert({
        stripe_event_id: event.id,
        event_type: event.type,
      });
    if (insertErr) {
      // Duplicate key = already processed. Postgres code 23505.
      const code = (insertErr as { code?: string }).code;
      if (code === '23505') {
        console.log(`[Webhook] Skipping duplicate event ${event.id} (${event.type})`);
        return;
      }
      // Other DB errors aren't fatal — fall through to actual handling
      // (better to process the event than silently lose it on a
      // transient DB hiccup). The dedup table is best-effort.
      console.warn('[Webhook] processed_webhook_events insert failed', insertErr);
    }
  } catch (err) {
    // If processed_webhook_events doesn't exist yet (migration not
    // applied), continue without dedup rather than fail the webhook.
    console.warn('[Webhook] dedup check skipped — table may not exist yet', err);
  }

  console.log(`[Webhook] Processing event: ${event.type} (${event.id})`);

  switch (event.type) {
    case 'checkout.session.completed':
      await handleCheckoutCompleted(event.data.object);
      break;

    case 'payment_intent.processing':
      if (isInvoiceIntent(event.data.object)) await handleInvoiceIntent(event.data.object, 'pending');
      break;

    case 'payment_intent.succeeded':
      await handlePaymentIntentSucceeded(event.data.object);
      break;

    case 'payment_intent.payment_failed':
      if (isInvoiceIntent(event.data.object)) await handleInvoiceIntent(event.data.object, 'failed');
      else await handlePaymentFailed(event.data.object);
      break;

    case 'charge.refunded':
      await handleChargeRefunded(event.data.object);
      break;

    case 'charge.dispute.created':
    case 'charge.dispute.updated':
    case 'charge.dispute.closed':
      await handleDispute(event.data.object, event.type);
      break;

    case 'customer.subscription.updated':
      await handleSubscriptionUpdated(event.data.object);
      break;

    case 'customer.subscription.deleted':
      await handleSubscriptionDeleted(event.data.object);
      break;

    case 'invoice.payment_succeeded':
      await handleInvoicePaymentSucceeded(event.data.object);
      break;

    case 'invoice.payment_failed':
      await handleInvoicePaymentFailed(event.data.object);
      break;

    default:
      console.log(`[Webhook] Unhandled event type: ${event.type}`);
  }
}

// ── Event Handlers ─────────────────────────────────────────────────────────────

async function handleCheckoutCompleted(session: Record<string, unknown>): Promise<void> {
  const metadata = (session.metadata as Record<string, string>) ?? {};
  const action = metadata.action;
  const userEmail = metadata.userEmail ?? (session.customer_email as string) ?? null;

  if (!userEmail) {
    console.warn('[Webhook] checkout.session.completed: no user email found');
    return;
  }

  if (action === 'wallet_funding') {
    // Credit user's document wallet
    const amountTotal = (session.amount_total as number) ?? 0;
    const amountUsd = amountTotal / 100;

    await supabaseAdmin
      .from('document_wallet_balance')
      .upsert(
        { user_email: userEmail, balance_usd: amountUsd, updated_at: new Date().toISOString() },
        { onConflict: 'user_email', ignoreDuplicates: false },
      );

    // Record the transaction
    await supabaseAdmin.from('document_purchase_history').insert({
      user_email: userEmail,
      transaction_type: 'wallet_credit',
      amount_usd: amountUsd,
      stripe_session_id: session.id as string,
      status: 'completed',
      metadata: { action: 'wallet_funded', stripeSession: session.id },
    });

    console.log(`[Webhook] Wallet funded: ${userEmail} +$${amountUsd}`);
  } else if (action === 'document_purchase') {
    const projectId = metadata.projectId;
    const instrumentNumber = metadata.instrumentNumber;
    const platform = metadata.platform;
    const costUsd = parseFloat(metadata.costUsd ?? '0');

    // Debit user's document wallet for document purchase
    const { data: wallet } = await supabaseAdmin
      .from('document_wallet_balance')
      .select('balance_usd')
      .eq('user_email', userEmail)
      .maybeSingle();

    const currentBalance = (wallet?.balance_usd as number) ?? 0;
    const newBalance = Math.max(0, currentBalance - costUsd);

    await supabaseAdmin
      .from('document_wallet_balance')
      .upsert(
        { user_email: userEmail, balance_usd: newBalance, updated_at: new Date().toISOString() },
        { onConflict: 'user_email', ignoreDuplicates: false },
      );

    await supabaseAdmin.from('document_purchase_history').insert({
      user_email: userEmail,
      transaction_type: 'document_purchase',
      amount_usd: costUsd,
      project_id: projectId ?? null,
      instrument_number: instrumentNumber ?? null,
      platform: platform ?? null,
      stripe_session_id: session.id as string,
      status: 'completed',
      metadata: { action, projectId, instrumentNumber, platform },
    });

    console.log(`[Webhook] Document purchase recorded: ${userEmail} ${instrumentNumber} -$${costUsd}`);
  }
}

async function handlePaymentIntentSucceeded(paymentIntent: Record<string, unknown>): Promise<void> {
  // payment-infrastructure-2026-06-18 P5 — invoices created via the
  // `/pay` portal stamp `metadata.invoice_id`. Route those to the
  // invoice-clearance helper; everything else is the legacy
  // subscription / wallet path and just gets logged.
  if (isInvoiceIntent(paymentIntent)) {
    await handleInvoiceIntent(paymentIntent, 'succeeded');
    return;
  }
  // Legacy / SaaS path — audit log only.
  console.log(`[Webhook] PaymentIntent succeeded: ${paymentIntent.id as string}`);
}

// ── Customer invoice payments ─────────────────────────────────────────────────

const PAYMENT_COLUMNS = 'id, invoice_id, amount_cents, status, refunded_cents';
type PaymentRow = { id: string; invoice_id: string; amount_cents: number; status: string; refunded_cents: number | null };

function isInvoiceIntent(obj: Record<string, unknown>): boolean {
  const meta = (obj.metadata as Record<string, unknown> | undefined) ?? {};
  return typeof meta.invoice_id === 'string' && meta.invoice_id.length > 0;
}

/** Events that move a customer's money — the ones worth a Stripe retry when handling fails. */
function isInvoiceMoneyEvent(event: StripeEvent): boolean {
  if (event.type.startsWith('charge.')) return true;
  return event.type.startsWith('payment_intent.') && isInvoiceIntent(event.data.object);
}

async function paymentForIntent(intentId: string): Promise<PaymentRow | null> {
  const { data, error } = await supabaseAdmin
    .from('payments').select(PAYMENT_COLUMNS)
    .eq('external_provider', 'stripe').eq('external_id', intentId).maybeSingle();
  if (error) throw new Error(`payments lookup failed: ${error.message}`);
  return (data as PaymentRow | null) ?? null;
}

/**
 * Card or bank, and the non-card discount the payment carries (lib/payments/pay-discount.ts). The
 * intent route stamps `pay_method` and `discount_cents` in the metadata; a bank-only intent is ACH.
 * The discount is honoured only for a bank payment — it is what the customer was shown and charged.
 */
function payKind(paymentIntent: Record<string, unknown>): { method: 'stripe' | 'ach'; discount: number } {
  const meta = (paymentIntent.metadata as Record<string, unknown> | undefined) ?? {};
  const types = Array.isArray(paymentIntent.payment_method_types) ? paymentIntent.payment_method_types : [];
  const bank = meta.pay_method === 'bank' || (types.length === 1 && types[0] === 'us_bank_account');
  const d = Number(meta.discount_cents);
  return { method: bank ? 'ach' : 'stripe', discount: bank && Number.isFinite(d) && d > 0 ? Math.round(d) : 0 };
}

function bankReason(paymentIntent: Record<string, unknown>): string {
  return (paymentIntent.last_payment_error as { message?: string } | null)?.message ?? 'not given';
}

/**
 * A PaymentIntent for an invoice reached `pending` (a bank payment clearing), `succeeded`, or
 * `failed`. Writes or moves the one payment row for the intent, then re-derives the invoice. Safe
 * out of order and twice: a late `processing` never demotes a succeeded payment, a repeated
 * `succeeded` writes nothing, and a decline with no payment row (a card typed wrong at checkout)
 * writes nothing.
 */
async function handleInvoiceIntent(paymentIntent: Record<string, unknown>, outcome: 'pending' | 'succeeded' | 'failed'): Promise<void> {
  if (!paymentsAreLive()) {
    console.warn(`[Webhook] invoice payment intent (${outcome}) received but PAYMENTS_LIVE=false`);
    return;
  }
  const event: StripeEventLike = {
    type: `payment_intent.${outcome}`,
    data: { object: paymentIntent as NonNullable<StripeEventLike['data']>['object'] },
  };
  if (!stripeEventIsUsd(event)) {
    console.warn('[Webhook] non-USD invoice payment intent — skipping');
    return;
  }
  const key = extractInvoiceFromStripeEvent(event);
  if (!key.external_intent_id) return;

  // Find the invoice — metadata first, shadow row second.
  let invoiceId = key.invoice_id;
  if (!invoiceId) {
    const { data: shadow } = await supabaseAdmin
      .from('payment_intents').select('invoice_id').eq('external_intent_id', key.external_intent_id).maybeSingle();
    invoiceId = shadow?.invoice_id ?? null;
  }
  if (!invoiceId) {
    console.warn(`[Webhook] no invoice found for intent ${key.external_intent_id}`);
    return;
  }

  const now = new Date().toISOString();
  const existing = await paymentForIntent(key.external_intent_id);
  const amount = outcome === 'succeeded' ? key.amount_received : stripeCents(paymentIntent, 'amount');
  const { method, discount } = payKind(paymentIntent);
  let bounced = false;

  if (outcome === 'pending') {
    if (!existing) {
      const { error } = await supabaseAdmin.from('payments').insert({
        invoice_id: invoiceId, amount_cents: amount, discount_cents: discount, method, status: 'pending',
        external_id: key.external_intent_id, external_provider: 'stripe', payer_email: key.receipt_email,
        notes: 'Bank payment clearing (about 4 business days).',
      });
      if (error) throw new Error(`pending payment insert failed: ${error.message}`);
    }
  } else if (outcome === 'succeeded') {
    if (!existing) {
      const { error } = await supabaseAdmin.from('payments').insert({
        invoice_id: invoiceId, amount_cents: amount, discount_cents: discount, method, status: 'succeeded',
        external_id: key.external_intent_id, external_provider: 'stripe', payer_email: key.receipt_email, cleared_at: now,
      });
      if (error) throw new Error(`payment insert failed: ${error.message}`);
    } else if (existing.status === 'pending' || existing.status === 'failed') {
      const { error } = await supabaseAdmin.from('payments')
        .update({ status: 'succeeded', amount_cents: amount, discount_cents: discount, method, cleared_at: now, notes: null, updated_at: now }).eq('id', existing.id);
      if (error) throw new Error(`payment update failed: ${error.message}`);
    } else {
      console.log(`[Webhook] invoice payment intent ${key.external_intent_id} already recorded (${existing.status})`);
    }
  } else if (existing && existing.status === 'pending') {
    const { error } = await supabaseAdmin.from('payments')
      .update({ status: 'failed', notes: `Bank payment failed: ${bankReason(paymentIntent)}`, updated_at: now }).eq('id', existing.id);
    if (error) throw new Error(`payment update failed: ${error.message}`);
    bounced = true;
  }

  await supabaseAdmin.from('payment_intents')
    .update({ status: outcome === 'pending' ? 'processing' : outcome }).eq('external_intent_id', key.external_intent_id);

  const inv = await rederiveInvoice(invoiceId);
  console.log(`[Webhook] invoice ${invoiceId} → ${inv?.status ?? '?'} (intent ${key.external_intent_id} ${outcome})`);

  if (bounced && inv) {
    await tellOffice(inv.org_id, `Bank payment failed — invoice ${inv.invoice_number}`, [
      `A bank (ACH) payment of ${dollars(amount)} on invoice ${inv.invoice_number}${inv.customer_name ? ` (${inv.customer_name})` : ''} did not clear.`,
      `Reason from the bank: ${bankReason(paymentIntent)}.`,
      `The invoice is back to "${inv.status}" and shows that amount as owed again. Reach out to the customer to arrange payment.`,
    ]);
  }
}

/** A refund, whole or part (issued from the Stripe dashboard). */
async function handleChargeRefunded(charge: Record<string, unknown>): Promise<void> {
  const intentId = intentIdOf(charge);
  if (!intentId) return;
  const payment = await paymentForIntent(intentId);
  if (!payment) return; // not an invoice payment (a wallet or subscription charge)
  if (payment.status !== 'succeeded' && payment.status !== 'refunded') {
    console.log(`[Webhook] refund on a ${payment.status} payment ${payment.id} — left as is`);
    return;
  }
  const next = refundState(payment.amount_cents, stripeCents(charge, 'amount_refunded'));
  const { error } = await supabaseAdmin.from('payments')
    .update({ ...next, updated_at: new Date().toISOString() }).eq('id', payment.id);
  if (error) throw new Error(`refund update failed: ${error.message}`);
  const inv = await rederiveInvoice(payment.invoice_id);
  console.log(`[Webhook] refund ${dollars(next.refunded_cents)} on payment ${payment.id}; invoice → ${inv?.status ?? '?'}`);
}

/** A chargeback: opened, moving, or decided. */
async function handleDispute(dispute: Record<string, unknown>, type: string): Promise<void> {
  const intentId = intentIdOf(dispute);
  if (!intentId) return;
  const payment = await paymentForIntent(intentId);
  if (!payment) return;
  const disputeStatus = typeof dispute.status === 'string' ? dispute.status : 'needs_response';
  const status = payment.status === 'succeeded' || payment.status === 'disputed'
    ? paymentStatusForDispute(disputeStatus)
    : payment.status;
  const { error } = await supabaseAdmin.from('payments').update({
    status, dispute_id: typeof dispute.id === 'string' ? dispute.id : null, dispute_status: disputeStatus,
    updated_at: new Date().toISOString(),
  }).eq('id', payment.id);
  if (error) throw new Error(`dispute update failed: ${error.message}`);
  const inv = await rederiveInvoice(payment.invoice_id);
  if (!inv) return;

  const amount = dollars(stripeCents(dispute, 'amount'));
  const who = inv.customer_name ? ` (${inv.customer_name})` : '';
  if (type === 'charge.dispute.created') {
    const due = (dispute.evidence_details as { due_by?: number } | undefined)?.due_by;
    const by = due ? ` by ${new Date(due * 1000).toLocaleDateString('en-US', { timeZone: 'America/Chicago', dateStyle: 'long' })}` : '';
    await tellOffice(inv.org_id, `Chargeback opened — invoice ${inv.invoice_number}`, [
      `A customer disputed a card payment of ${amount} on invoice ${inv.invoice_number}${who}.`,
      `Reason given: ${typeof dispute.reason === 'string' ? dispute.reason.replace(/_/g, ' ') : 'not given'}.`,
      `Respond in the Stripe dashboard (Payments → Disputes)${by}, with the signed proposal, the invoice, and proof the work was delivered.`,
      `Until it is decided the money is held back, and the invoice shows "${inv.status}".`,
    ]);
  } else if (type === 'charge.dispute.closed') {
    await tellOffice(inv.org_id, `Chargeback ${disputeStatus === 'won' ? 'won' : 'closed'} — invoice ${inv.invoice_number}`, [
      `The dispute over ${amount} on invoice ${inv.invoice_number}${who} closed: ${disputeStatus.replace(/_/g, ' ')}.`,
      `The invoice now shows "${inv.status}".`,
    ]);
  }
}

/** Work the invoice's status out again from all its payments, and save it if it changed. */
async function rederiveInvoice(invoiceId: string): Promise<{ status: string; invoice_number: string; customer_name: string | null; org_id: string | null } | null> {
  const { data: invoice, error } = await supabaseAdmin
    .from('customer_invoices').select('id, org_id, invoice_number, customer_name, total_cents, status, paid_at').eq('id', invoiceId).maybeSingle();
  if (error) throw new Error(`invoice lookup failed: ${error.message}`);
  if (!invoice) return null;
  const { data: payments, error: pErr } = await supabaseAdmin
    .from('payments').select('amount_cents, status, refunded_cents, discount_cents').eq('invoice_id', invoiceId);
  if (pErr) throw new Error(`payments lookup failed: ${pErr.message}`);
  const status = invoiceStatusFromPayments({ totalCents: invoice.total_cents ?? 0, currentStatus: invoice.status, payments: payments ?? [] });
  if (status !== invoice.status || (status === 'paid') !== Boolean(invoice.paid_at)) {
    const { error: uErr } = await supabaseAdmin.from('customer_invoices').update({
      status, paid_at: status === 'paid' ? (invoice.paid_at ?? new Date().toISOString()) : null,
    }).eq('id', invoiceId);
    if (uErr) throw new Error(`invoice update failed: ${uErr.message}`);
  }
  return { status, invoice_number: invoice.invoice_number, customer_name: invoice.customer_name ?? null, org_id: invoice.org_id ?? null };
}

function dollars(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** An email to the office about money that needs a person: a bounced bank payment, a chargeback.
 *  Goes to PAYMENTS_ALERT_EMAIL if set, else the firm's own contact email (its tenant profile).
 *  Never fails the webhook — the payment record is already right. */
async function tellOffice(orgId: string | null, subject: string, lines: string[]): Promise<void> {
  let to = process.env.PAYMENTS_ALERT_EMAIL || '';
  if (!to) {
    try { to = (await getTenantProfile(orgId)).contactEmail; } catch { /* below */ }
  }
  if (!to) {
    console.error('[Webhook] office alert NOT SENT — no PAYMENTS_ALERT_EMAIL and no firm contact email', subject);
    return;
  }
  const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);
  try {
    await sendEmailViaResend({
      to,
      subject,
      html: lines.map((l) => `<p style="font-family:system-ui,sans-serif;font-size:15px">${esc(l)}</p>`).join(''),
      text: lines.join('\n\n'),
      tags: { kind: 'payment_alert' },
    });
  } catch (err) {
    console.error('[Webhook] office alert failed', subject, err);
  }
}

async function handlePaymentFailed(paymentIntent: Record<string, unknown>): Promise<void> {
  const metadata = (paymentIntent.metadata as Record<string, string>) ?? {};
  const userEmail = metadata.userEmail ?? null;
  if (!userEmail) return;

  // Record failed transaction
  await supabaseAdmin.from('document_purchase_history').insert({
    user_email: userEmail,
    transaction_type: 'payment_failed',
    amount_usd: ((paymentIntent.amount as number) ?? 0) / 100,
    stripe_session_id: paymentIntent.id as string,
    status: 'failed',
    metadata: { paymentIntentId: paymentIntent.id, error: paymentIntent.last_payment_error },
  });

  console.log(`[Webhook] Payment failed for ${userEmail}: ${paymentIntent.id as string}`);
}

async function handleSubscriptionUpdated(subscription: Record<string, unknown>): Promise<void> {
  const customerId = subscription.customer as string;
  if (!customerId) return;

  // Find user by Stripe customer ID and update subscription status
  const { data: subRecord } = await supabaseAdmin
    .from('research_subscriptions')
    .select('user_email')
    .eq('stripe_customer_id', customerId)
    .maybeSingle();

  if (!subRecord?.user_email) return;

  const status = subscription.status as string;
  const cancelAt = subscription.cancel_at_period_end as boolean;
  const currentPeriodEnd = subscription.current_period_end as number;

  await supabaseAdmin
    .from('research_subscriptions')
    .update({
      status,
      cancel_at_period_end: cancelAt,
      current_period_end: currentPeriodEnd
        ? new Date(currentPeriodEnd * 1000).toISOString()
        : null,
      updated_at: new Date().toISOString(),
    })
    .eq('stripe_customer_id', customerId);

  console.log(`[Webhook] Subscription updated for ${subRecord.user_email as string}: ${status}`);
}

async function handleSubscriptionDeleted(subscription: Record<string, unknown>): Promise<void> {
  const customerId = subscription.customer as string;
  if (!customerId) return;

  await supabaseAdmin
    .from('research_subscriptions')
    .update({ status: 'canceled', updated_at: new Date().toISOString() })
    .eq('stripe_customer_id', customerId);

  console.log(`[Webhook] Subscription deleted for customer: ${customerId}`);
}

async function handleInvoicePaymentSucceeded(invoice: Record<string, unknown>): Promise<void> {
  const customerId = invoice.customer as string;
  console.log(`[Webhook] Invoice payment succeeded for customer: ${customerId}`);
}

async function handleInvoicePaymentFailed(invoice: Record<string, unknown>): Promise<void> {
  const customerId = invoice.customer as string;

  // Find user and record failed invoice
  const { data: subRecord } = await supabaseAdmin
    .from('research_subscriptions')
    .select('user_email')
    .eq('stripe_customer_id', customerId)
    .maybeSingle();

  const userEmail = subRecord?.user_email as string | undefined;
  console.error(
    `[Webhook] Invoice payment FAILED for customer ${customerId}` +
    (userEmail ? ` (${userEmail})` : ''),
  );

  // Update subscription status to past_due
  await supabaseAdmin
    .from('research_subscriptions')
    .update({ status: 'past_due', updated_at: new Date().toISOString() })
    .eq('stripe_customer_id', customerId);

  // SaaS pivot F-5 — fire payment_failed notification (email + in-app)
  // via the notifications service. For legacy research-subscription
  // customers, user_email IS the billing contact. For firm-level
  // subscriptions (post-M-9), the org's billing_contact_email is used.
  if (userEmail) {
    const amount = (invoice.amount_due as number | undefined) ?? 0;
    const orgUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://starrsoftware.com';
    try {
      await dispatch('payment_failed', {
        orgId: undefined, // legacy per-user sub; firm-level sub adds org_id post-M-9
        payload: {
          billingContactEmail: userEmail,
          user: { name: userEmail.split('@')[0] },
          org: { name: 'your subscription', url: orgUrl },
          plan: { label: 'Research subscription' },
          invoice: { amount: `$${(amount / 100).toFixed(2)}` },
        },
      });
    } catch (err) {
      // Notification failure shouldn't fail the webhook — Stripe
      // will retry on a 5xx and we don't want duplicate dunning.
      console.error('[Webhook] payment_failed notification failed', err);
    }
  }
}

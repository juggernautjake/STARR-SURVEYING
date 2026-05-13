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
    // Return 200 even on processing errors so Stripe doesn't retry
    // (log the error internally for investigation)
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

    case 'payment_intent.succeeded':
      await handlePaymentIntentSucceeded(event.data.object);
      break;

    case 'payment_intent.payment_failed':
      await handlePaymentFailed(event.data.object);
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
  // Payment intents are also fired for subscriptions — log for audit trail
  console.log(`[Webhook] PaymentIntent succeeded: ${paymentIntent.id as string}`);
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
}

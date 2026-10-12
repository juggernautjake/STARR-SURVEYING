// lib/payouts/paypal.ts — sending Venmo payouts through the PayPal Payouts API.
//
// PayPal owns Venmo, and its Payouts API can pay a Venmo account by username, phone or email
// (`recipient_wallet: "VENMO"`). This is the one P2P method that can genuinely send itself.
//
// Needs, in the environment (Doppler → Vercel): PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, and
// PAYPAL_ENV = "live" (anything else uses the sandbox). The PayPal Business account must have Payouts
// enabled — PayPal approves that separately.
//
// ── NEVER TWICE ─────────────────────────────────────────────────────────────────────────────────
//
// `sender_batch_id` is ours and PayPal refuses a second payout with the same one, and the same value
// goes in the `PayPal-Request-Id` header (PayPal's idempotency key). It is derived from the payout
// batch, so a retried Commit — a double click, a timeout, a redeploy mid-request — cannot pay anyone
// twice. Each item carries `sender_item_id` = our payout line id, which is how statuses come back.

import { venmoRecipient } from './rails';

export interface PayPalConfig { clientId: string; clientSecret: string; base: string; live: boolean }

export function paypalConfig(env: NodeJS.ProcessEnv = process.env): PayPalConfig | null {
  const clientId = env.PAYPAL_CLIENT_ID?.trim();
  const clientSecret = env.PAYPAL_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  const live = env.PAYPAL_ENV?.trim().toLowerCase() === 'live';
  return { clientId, clientSecret, live, base: live ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com' };
}

export interface VenmoPayoutLine { itemId: string; handle: string; amountCents: number; note: string }

/** The request body for one batch of Venmo payouts. Pure. */
export function buildVenmoPayoutRequest(senderBatchId: string, lines: readonly VenmoPayoutLine[], subject: string) {
  const items = lines.map((l) => {
    const r = venmoRecipient(l.handle);
    if (!r) throw new Error(`"${l.handle}" is not a Venmo username, phone number or email.`);
    return {
      recipient_type: r.recipient_type,
      receiver: r.receiver,
      amount: { value: (l.amountCents / 100).toFixed(2), currency: 'USD' },
      note: l.note.slice(0, 4000),
      sender_item_id: l.itemId,
      recipient_wallet: 'VENMO',
    };
  });
  return {
    sender_batch_header: { sender_batch_id: senderBatchId.slice(0, 256), email_subject: subject.slice(0, 255), email_message: subject.slice(0, 1000) },
    items,
  };
}

/** PayPal's item status → our line status. Pure. */
export function mapPayPalItemStatus(s: string | null | undefined): { status: 'sent' | 'paid' | 'failed'; final: boolean } {
  switch ((s ?? '').toUpperCase()) {
    case 'SUCCESS': return { status: 'paid', final: true };
    case 'FAILED': case 'RETURNED': case 'BLOCKED': case 'REFUNDED': case 'REVERSED': case 'DENIED':
      return { status: 'failed', final: true };
    // UNCLAIMED: sent, but the receiver has not accepted (no account yet) — it returns after 30 days.
    // PENDING / ONHOLD / NEW: still moving.
    default: return { status: 'sent', final: false };
  }
}

async function token(cfg: PayPalConfig, fetchImpl: typeof fetch): Promise<string> {
  const res = await fetchImpl(`${cfg.base}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  const json = (await res.json().catch(() => ({}))) as { access_token?: string; error_description?: string };
  if (!res.ok || !json.access_token) throw new Error(`PayPal sign-in failed: ${json.error_description ?? res.status}`);
  return json.access_token;
}

export interface PayPalCreateResult { payoutBatchId: string; batchStatus: string }

/** Send the batch. Safe to call again with the same senderBatchId — PayPal returns the original. */
export async function createVenmoPayout(
  cfg: PayPalConfig, senderBatchId: string, lines: readonly VenmoPayoutLine[], subject: string, fetchImpl: typeof fetch = fetch,
): Promise<PayPalCreateResult> {
  const body = buildVenmoPayoutRequest(senderBatchId, lines, subject);
  const t = await token(cfg, fetchImpl);
  const res = await fetchImpl(`${cfg.base}/v1/payments/payouts`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json', 'PayPal-Request-Id': senderBatchId.slice(0, 108) },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as { batch_header?: { payout_batch_id?: string; batch_status?: string }; message?: string; name?: string; details?: Array<{ issue?: string; description?: string }> };
  if (!res.ok || !json.batch_header?.payout_batch_id) {
    const why = json.details?.map((d) => d.description ?? d.issue).filter(Boolean).join('; ') || json.message || `HTTP ${res.status}`;
    throw new Error(`PayPal refused the payout: ${why}`);
  }
  return { payoutBatchId: json.batch_header.payout_batch_id, batchStatus: json.batch_header.batch_status ?? 'PENDING' };
}

export interface PayPalItemStatus { senderItemId: string; payoutItemId: string; transactionStatus: string; error: string | null }

/** Read back the status of every item in a payout batch. */
export async function getVenmoPayoutStatus(cfg: PayPalConfig, payoutBatchId: string, fetchImpl: typeof fetch = fetch): Promise<PayPalItemStatus[]> {
  const t = await token(cfg, fetchImpl);
  const res = await fetchImpl(`${cfg.base}/v1/payments/payouts/${encodeURIComponent(payoutBatchId)}?page_size=1000`, {
    headers: { Authorization: `Bearer ${t}` },
  });
  const json = (await res.json().catch(() => ({}))) as { items?: Array<{ payout_item_id: string; transaction_status: string; payout_item?: { sender_item_id?: string }; errors?: { message?: string } }>; message?: string };
  if (!res.ok) throw new Error(`PayPal status check failed: ${json.message ?? res.status}`);
  return (json.items ?? []).map((i) => ({
    senderItemId: i.payout_item?.sender_item_id ?? '',
    payoutItemId: i.payout_item_id,
    transactionStatus: i.transaction_status,
    error: i.errors?.message ?? null,
  }));
}

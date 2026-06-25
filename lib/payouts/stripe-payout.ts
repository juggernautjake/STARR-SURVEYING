// lib/payouts/stripe-payout.ts
//
// G4 / Phase 2.4 of BUSINESS_GO_LIVE_FINANCE_PAYMENTS_2026-06-25 — gated
// foundation for paying EMPLOYEES via Stripe (Connect transfers).
//
// Like the customer-side Stripe path, this ships behind a flag and activates
// once the Stripe account + per-employee Connect onboarding exist (the account
// phase). The pure param-builder + the gate are testable now; the live
// `stripe.transfers.create` call and the Connect onboarding flow drop in when
// Stripe is provisioned — without touching the source-locked dispatch helpers.

export function stripePayoutsLive(env: Record<string, string | undefined> = process.env): boolean {
  return env.PAYOUTS_STRIPE_LIVE === 'true' && Boolean(env.STRIPE_SECRET_KEY);
}

export interface StripeTransferInput {
  amountCents: number;
  /** The employee's connected account id (`acct_…`), stored as the payout
   *  item's method_handle once they finish Connect onboarding. */
  destinationAccountId: string;
  batchLabel: string;
  userEmail: string;
  itemId: string;
}

export interface StripeTransferParams {
  amount: number;
  currency: 'usd';
  destination: string;
  transfer_group: string;
  description: string;
  metadata: { payout_item_id: string; user_email: string; batch_label: string };
}

/** Pure — build the Stripe Transfer create params for one employee payout. */
export function buildPayoutTransferParams(input: StripeTransferInput): StripeTransferParams {
  return {
    amount: Math.max(0, Math.floor(input.amountCents)),
    currency: 'usd',
    destination: input.destinationAccountId,
    transfer_group: `payout_${slugifyLabel(input.batchLabel)}`,
    description: `Starr Surveying payout — ${input.batchLabel} — ${input.userEmail}`,
    metadata: {
      payout_item_id: input.itemId,
      user_email: input.userEmail.toLowerCase(),
      batch_label: input.batchLabel,
    },
  };
}

/** Pure — is this payout item dispatchable via Stripe right now? (method
 *  'stripe' + a connected account id on file). */
export function payoutStripeReady(item: { method: string | null; method_handle: string | null }): boolean {
  return item.method === 'stripe' && typeof item.method_handle === 'string' && item.method_handle.startsWith('acct_');
}

function slugifyLabel(s: string): string {
  return s.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').toLowerCase().slice(0, 40) || 'batch';
}

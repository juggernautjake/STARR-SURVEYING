// G4 / Phase 2.4 — source-lock for the gated Stripe employee-payout foundation.
import { describe, it, expect } from 'vitest';
import {
  stripePayoutsLive,
  buildPayoutTransferParams,
  payoutStripeReady,
} from '@/lib/payouts/stripe-payout';

describe('stripe-payout: stripePayoutsLive gate', () => {
  it('requires both PAYOUTS_STRIPE_LIVE=true and a secret key', () => {
    expect(stripePayoutsLive({ PAYOUTS_STRIPE_LIVE: 'true', STRIPE_SECRET_KEY: 'sk_live_x' })).toBe(true);
    expect(stripePayoutsLive({ PAYOUTS_STRIPE_LIVE: 'true' })).toBe(false);
    expect(stripePayoutsLive({ STRIPE_SECRET_KEY: 'sk_live_x' })).toBe(false);
    expect(stripePayoutsLive({})).toBe(false);
  });
});

describe('stripe-payout: buildPayoutTransferParams', () => {
  it('builds usd transfer params, floors/clamps amount, lowercases email', () => {
    const p = buildPayoutTransferParams({
      amountCents: 40000.9,
      destinationAccountId: 'acct_123',
      batchLabel: 'Week of Jun 22',
      userEmail: 'Mary@Starr.com',
      itemId: 'item-1',
    });
    expect(p.amount).toBe(40000);
    expect(p.currency).toBe('usd');
    expect(p.destination).toBe('acct_123');
    expect(p.transfer_group).toBe('payout_week_of_jun_22');
    expect(p.description).toMatch(/Starr Surveying payout/);
    expect(p.metadata).toEqual({ payout_item_id: 'item-1', user_email: 'mary@starr.com', batch_label: 'Week of Jun 22' });
  });
  it('clamps negative amounts to 0', () => {
    expect(buildPayoutTransferParams({ amountCents: -5, destinationAccountId: 'acct_1', batchLabel: 'x', userEmail: 'a@b.com', itemId: 'i' }).amount).toBe(0);
  });
});

describe('stripe-payout: payoutStripeReady', () => {
  it('is true only for method=stripe with an acct_ handle', () => {
    expect(payoutStripeReady({ method: 'stripe', method_handle: 'acct_abc' })).toBe(true);
    expect(payoutStripeReady({ method: 'stripe', method_handle: '@mary' })).toBe(false);
    expect(payoutStripeReady({ method: 'stripe', method_handle: null })).toBe(false);
    expect(payoutStripeReady({ method: 'venmo', method_handle: 'acct_abc' })).toBe(false);
  });
});

// G1 / Phase 1.1 — source-lock for the Stripe Elements pure helpers.
import { describe, it, expect } from 'vitest';
import {
  stripePublishableKey,
  cardPaymentConfigured,
  buildPayReturnUrl,
  interpretIntentResponse,
} from '@/lib/payments/stripe-elements';

describe('stripe-elements: stripePublishableKey', () => {
  it('returns a real pk_ key (trimmed)', () => {
    expect(stripePublishableKey({ NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_live_abc123' })).toBe('pk_live_abc123');
    expect(stripePublishableKey({ NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: '  pk_test_xyz ' })).toBe('pk_test_xyz');
  });
  it('rejects empty, placeholder, and non-pk values', () => {
    expect(stripePublishableKey({ NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: '' })).toBeNull();
    expect(stripePublishableKey({})).toBeNull();
    expect(stripePublishableKey({ NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_live_...' })).toBeNull();
    expect(stripePublishableKey({ NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_test_...' })).toBeNull();
    expect(stripePublishableKey({ NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'sk_live_secret' })).toBeNull();
  });
});

describe('stripe-elements: cardPaymentConfigured', () => {
  it('reflects key presence', () => {
    expect(cardPaymentConfigured({ NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_live_abc' })).toBe(true);
    expect(cardPaymentConfigured({})).toBe(false);
  });
});

describe('stripe-elements: buildPayReturnUrl', () => {
  it('points back to the invoice with ?paid=1 and trims trailing slashes', () => {
    expect(buildPayReturnUrl('https://starr-surveying.com', 'SS-260618-A1B2')).toBe(
      'https://starr-surveying.com/pay/SS-260618-A1B2?paid=1',
    );
    expect(buildPayReturnUrl('https://x.com/', 'A B')).toBe('https://x.com/pay/A%20B?paid=1');
  });
});

describe('stripe-elements: interpretIntentResponse', () => {
  it('200 with a client_secret yields the secret', () => {
    expect(interpretIntentResponse(200, { client_secret: 'cs_1' })).toEqual({
      clientSecret: 'cs_1',
      message: null,
      callOffice: false,
    });
  });
  it('200 without a secret is treated as a generic failure', () => {
    const r = interpretIntentResponse(200, {});
    expect(r.clientSecret).toBeNull();
    expect(r.message).toBeTruthy();
  });
  it('503 = not live → callOffice', () => {
    const r = interpretIntentResponse(503, { error: 'not enabled' });
    expect(r.clientSecret).toBeNull();
    expect(r.callOffice).toBe(true);
    expect(r.message).toBe('not enabled');
  });
  it('409 already paid, 422 amount rule (uses server message when present)', () => {
    expect(interpretIntentResponse(409, {}).message).toMatch(/already paid/i);
    expect(interpretIntentResponse(409, {}).callOffice).toBe(false);
    expect(interpretIntentResponse(422, { error: 'min is $50.00' }).message).toBe('min is $50.00');
  });
  it('5xx server errors set callOffice', () => {
    expect(interpretIntentResponse(500, {}).callOffice).toBe(true);
    expect(interpretIntentResponse(400, {}).callOffice).toBe(false);
  });
});

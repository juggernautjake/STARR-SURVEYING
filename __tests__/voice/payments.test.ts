// __tests__/voice/payments.test.ts
//
// The tests that matter here are the ones about money moving when it should not.

import { describe, expect, it } from 'vitest';

import {
  buildPaymentDeepLink,
  cardPaymentEnabled,
  clientStripeConfig,
  interpretIntentResponse,
  normalizePaymentMethods,
  payableMethods,
  statusAfterPayment,
  voiceStripePublishableKey,
  voiceStripeSecretKey,
  type PaymentMethod,
} from '@/lib/voice/payments';

const method = (over: Partial<PaymentMethod> = {}): PaymentMethod => ({
  id: 'zelle',
  label: 'Zelle',
  handle: 'pay@example.com',
  enabled: true,
  ...over,
});

describe('Stripe key isolation', () => {
  // The single most consequential test in this file. The repo it currently lives in has working
  // Stripe keys for a DIFFERENT business. Reading them would route a client's payment for voice work
  // into a surveying company's bank account — silently, and correctly as far as Stripe is concerned.
  it('never falls back to the host application\'s unprefixed Stripe keys', () => {
    const env = {
      STRIPE_SECRET_KEY: 'sk_live_the_surveying_companys_key',
      NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_live_the_surveying_companys_key',
      VOICE_PAYMENTS_LIVE: 'true',
    };
    expect(voiceStripeSecretKey(env)).toBeNull();
    expect(voiceStripePublishableKey(env)).toBeNull();
    expect(cardPaymentEnabled(env)).toBe(false);
    expect(clientStripeConfig(env)).toBeNull();
  });

  it('rejects unfilled .env.example placeholders rather than booting Stripe with junk', () => {
    expect(voiceStripePublishableKey({ NEXT_PUBLIC_VOICE_STRIPE_PUBLISHABLE_KEY: 'pk_live_...' })).toBeNull();
    expect(voiceStripeSecretKey({ VOICE_STRIPE_SECRET_KEY: 'REPLACE_ME' })).toBeNull();
  });

  it('rejects a key that is not a Stripe key at all', () => {
    expect(voiceStripePublishableKey({ NEXT_PUBLIC_VOICE_STRIPE_PUBLISHABLE_KEY: 'sk_live_wrong_half' })).toBeNull();
    expect(voiceStripeSecretKey({ VOICE_STRIPE_SECRET_KEY: 'pk_live_wrong_half' })).toBeNull();
  });

  it('needs both halves AND the live flag before card payment is on', () => {
    const both = {
      VOICE_STRIPE_SECRET_KEY: 'sk_test_abc',
      NEXT_PUBLIC_VOICE_STRIPE_PUBLISHABLE_KEY: 'pk_test_abc',
    };
    // Having keys is not the same as being ready to take money.
    expect(cardPaymentEnabled(both)).toBe(false);
    expect(cardPaymentEnabled({ ...both, VOICE_PAYMENTS_LIVE: 'true' })).toBe(true);
    expect(cardPaymentEnabled({ ...both, VOICE_PAYMENTS_LIVE: 'yes' })).toBe(false);
  });

  it('hands the browser the publishable key only', () => {
    const cfg = clientStripeConfig({
      VOICE_STRIPE_SECRET_KEY: 'sk_test_secret',
      NEXT_PUBLIC_VOICE_STRIPE_PUBLISHABLE_KEY: 'pk_test_public',
      VOICE_PAYMENTS_LIVE: 'true',
    });
    expect(cfg).toEqual({ publishableKey: 'pk_test_public' });
    expect(JSON.stringify(cfg)).not.toContain('sk_test_secret');
  });
});

describe('normalizePaymentMethods', () => {
  it('drops entries whose method id is not one the ledger can record', () => {
    // The id doubles as va_payments.method, which has a CHECK constraint. An unknown id here becomes
    // a failed insert at the worst possible moment — while someone is trying to pay.
    const out = normalizePaymentMethods([
      { id: 'zelle', label: 'Zelle', handle: 'a@b.com', enabled: true },
      { id: 'bitcoin', label: 'Bitcoin', handle: 'bc1...', enabled: true },
    ]);
    expect(out.map((m) => m.id)).toEqual(['zelle']);
  });

  it('treats a missing enabled flag as off', () => {
    const [m] = normalizePaymentMethods([{ id: 'venmo', handle: '@x' }]);
    expect(m.enabled).toBe(false);
  });

  it('survives garbage in the JSONB column', () => {
    expect(normalizePaymentMethods(null)).toEqual([]);
    expect(normalizePaymentMethods('not an array')).toEqual([]);
    expect(normalizePaymentMethods([null, 42, 'x'])).toEqual([]);
  });

  it('caps a handle so a pasted essay cannot become the destination line', () => {
    const [m] = normalizePaymentMethods([{ id: 'zelle', handle: 'x'.repeat(500), enabled: true }]);
    expect(m.handle).toHaveLength(160);
  });
});

describe('payableMethods', () => {
  it('hides an enabled method with no destination', () => {
    // Otherwise the invoice tells someone to send money and does not say where.
    expect(payableMethods([method({ handle: '' })])).toEqual([]);
  });

  it('hides a method that is configured but switched off', () => {
    expect(payableMethods([method({ enabled: false })])).toEqual([]);
  });

  it('keeps a cheque whose address lives in the instructions', () => {
    const check = method({ id: 'check', handle: '', instructions: 'Post to 1 Example St.' });
    expect(payableMethods([check])).toHaveLength(1);
  });
});

describe('buildPaymentDeepLink', () => {
  it('formats the amount as dollars and tags the note with the invoice number', () => {
    const link = buildPaymentDeepLink(method({ id: 'venmo', handle: '@andrew-ash' }), 'AAV-2026-004', 95000);
    expect(link).toContain('amount=950.00');
    expect(link).toContain('note=Invoice%20AAV-2026-004');
  });

  it('strips a leading @ or $ so the handle is not doubled by the app', () => {
    expect(buildPaymentDeepLink(method({ id: 'cashapp', handle: '$andrewash' }), 'X', 5000)).toBe(
      'https://cash.app/$andrewash/50.00',
    );
  });

  it('returns null for methods with no app to open', () => {
    // Zelle happens inside the client's own banking app; there is nothing to link to.
    expect(buildPaymentDeepLink(method({ id: 'zelle' }), 'X', 100)).toBeNull();
    expect(buildPaymentDeepLink(method({ id: 'check', handle: 'Andrew' }), 'X', 100)).toBeNull();
    expect(buildPaymentDeepLink(method({ id: 'venmo', handle: '' }), 'X', 100)).toBeNull();
  });
});

describe('statusAfterPayment', () => {
  it('marks paid when the money covers the total', () => {
    expect(statusAfterPayment({ totalCents: 95000, alreadyPaidCents: 0, newPaymentCents: 95000 })).toBe('paid');
  });

  it('marks paid on an overpayment rather than leaving it partial forever', () => {
    expect(statusAfterPayment({ totalCents: 95000, alreadyPaidCents: 0, newPaymentCents: 100000 })).toBe('paid');
  });

  it('composes partial payments', () => {
    expect(statusAfterPayment({ totalCents: 120000, alreadyPaidCents: 40000, newPaymentCents: 40000 })).toBe('partial');
    expect(statusAfterPayment({ totalCents: 120000, alreadyPaidCents: 80000, newPaymentCents: 40000 })).toBe('paid');
  });

  it('does not let a zero payment claim any progress', () => {
    expect(statusAfterPayment({ totalCents: 95000, alreadyPaidCents: 0, newPaymentCents: 0 })).toBe('sent');
  });

  it('ignores a negative payment instead of reducing what has been paid', () => {
    expect(statusAfterPayment({ totalCents: 95000, alreadyPaidCents: 95000, newPaymentCents: -95000 })).toBe('paid');
  });
});

describe('interpretIntentResponse', () => {
  it('falls back to the offline methods when card is not switched on', () => {
    const out = interpretIntentResponse(503, { error: 'Card payment is not switched on yet.' });
    expect(out.clientSecret).toBeNull();
    expect(out.fallback).toBe(true);
  });

  it('does not offer a fallback for an already-paid invoice', () => {
    // There is nothing to fall back TO — the client owes nothing.
    expect(interpretIntentResponse(409, { error: 'Already paid.' }).fallback).toBe(false);
  });

  it('treats a 200 with no client secret as a failure', () => {
    expect(interpretIntentResponse(200, {}).clientSecret).toBeNull();
  });

  it('passes a client secret through', () => {
    expect(interpretIntentResponse(200, { clientSecret: 'pi_123_secret_456' }).clientSecret).toBe('pi_123_secret_456');
  });
});

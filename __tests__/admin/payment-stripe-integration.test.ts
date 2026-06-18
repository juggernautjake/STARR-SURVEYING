// __tests__/admin/payment-stripe-integration.test.ts
//
// P5 of payment-infrastructure-2026-06-18.md — locks the Stripe
// integration plumbing:
//   - lib/payments/stripe.ts: pure helpers for intent body +
//     webhook event parsing + invoice status transitions
//   - app/api/public/invoice/[n]/intent/route.ts: POST creates the
//     PaymentIntent (gated by PAYMENTS_LIVE + STRIPE_SECRET_KEY)
//   - app/api/webhooks/stripe/route.ts: existing webhook extended
//     to route invoice-payment intents (metadata.invoice_id) to
//     the clearance helper

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  buildPaymentIntentParams,
  extractInvoiceFromStripeEvent,
  isPaymentSucceededEvent,
  nextInvoiceStatusAfterPayment,
  stripeEventIsUsd,
} from '@/lib/payments/stripe';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe('buildPaymentIntentParams (pure)', () => {
  it("populates the canonical fields + a customer-friendly description", () => {
    const params = buildPaymentIntentParams({
      id: 'inv-uuid',
      invoice_number: 'SS-260618-A1B2',
      public_slug: 'slug-x',
      balance_cents: 125000,
      customer_email: 'mary@example.com',
      customer_name: 'Mary Smith',
    });
    expect(params).toEqual({
      amount: 125000,
      currency: 'usd',
      description: 'Invoice SS-260618-A1B2 — Starr Surveying',
      metadata: {
        invoice_id: 'inv-uuid',
        invoice_number: 'SS-260618-A1B2',
        public_slug: 'slug-x',
      },
      payment_method_types: ['card', 'us_bank_account'],
      automatic_payment_methods: { enabled: true },
      receipt_email: 'mary@example.com',
    });
  });

  it("omits receipt_email when the customer has none", () => {
    const params = buildPaymentIntentParams({
      id: 'inv', invoice_number: 'X', public_slug: 'y',
      balance_cents: 100, customer_email: null,
    });
    expect(params).not.toHaveProperty('receipt_email');
  });

  it("trims a stray whitespace email", () => {
    const params = buildPaymentIntentParams({
      id: 'inv', invoice_number: 'X', public_slug: 'y',
      balance_cents: 100, customer_email: '  ',
    });
    expect(params).not.toHaveProperty('receipt_email');
  });

  it("clamps a negative or non-integer balance to a safe cents amount", () => {
    const a = buildPaymentIntentParams({
      id: 'inv', invoice_number: 'X', public_slug: 'y', balance_cents: -50,
    });
    expect(a.amount).toBe(0);
    const b = buildPaymentIntentParams({
      id: 'inv', invoice_number: 'X', public_slug: 'y', balance_cents: 125.99 as number,
    });
    expect(b.amount).toBe(125);
  });
});

describe('isPaymentSucceededEvent + stripeEventIsUsd (pure)', () => {
  it("accepts only payment_intent.succeeded with status=succeeded", () => {
    expect(isPaymentSucceededEvent({
      type: 'payment_intent.succeeded',
      data: { object: { status: 'succeeded' } },
    })).toBe(true);
    expect(isPaymentSucceededEvent({
      type: 'payment_intent.processing',
      data: { object: { status: 'processing' } },
    })).toBe(false);
    expect(isPaymentSucceededEvent({
      type: 'payment_intent.succeeded',
      data: { object: { status: 'requires_payment_method' } },
    })).toBe(false);
  });

  it("stripeEventIsUsd accepts 'usd' (case-insensitive); rejects everything else", () => {
    expect(stripeEventIsUsd({ data: { object: { currency: 'usd' } } })).toBe(true);
    expect(stripeEventIsUsd({ data: { object: { currency: 'USD' } } })).toBe(true);
    expect(stripeEventIsUsd({ data: { object: { currency: 'eur' } } })).toBe(false);
    expect(stripeEventIsUsd({ data: { object: {} } })).toBe(false);
  });
});

describe('extractInvoiceFromStripeEvent (pure)', () => {
  it("pulls metadata + amount_received + intent id off the event", () => {
    expect(extractInvoiceFromStripeEvent({
      type: 'payment_intent.succeeded',
      data: { object: {
        id: 'pi_xyz',
        amount_received: 12500,
        currency: 'usd',
        receipt_email: 'mary@example.com',
        latest_charge: 'ch_abc',
        metadata: {
          invoice_id: 'inv-uuid',
          invoice_number: 'SS-260618-A1B2',
          public_slug: 'slug-xyz',
        },
      } },
    })).toEqual({
      invoice_id: 'inv-uuid',
      invoice_number: 'SS-260618-A1B2',
      public_slug: 'slug-xyz',
      external_intent_id: 'pi_xyz',
      amount_received: 12500,
      currency: 'usd',
      receipt_email: 'mary@example.com',
      latest_charge: 'ch_abc',
    });
  });

  it("returns nulls when Stripe didn't echo back our metadata", () => {
    expect(extractInvoiceFromStripeEvent({ data: { object: { id: 'pi_x' } } })).toEqual({
      invoice_id: null,
      invoice_number: null,
      public_slug: null,
      external_intent_id: 'pi_x',
      amount_received: 0,
      currency: 'usd',
      receipt_email: null,
      latest_charge: null,
    });
  });
});

describe('nextInvoiceStatusAfterPayment (pure)', () => {
  it("moves to paid when the new payment closes the balance", () => {
    expect(nextInvoiceStatusAfterPayment({
      totalCents: 10000, alreadyPaidCents: 0, newPaymentCents: 10000, currentStatus: 'issued',
    })).toBe('paid');
    expect(nextInvoiceStatusAfterPayment({
      totalCents: 10000, alreadyPaidCents: 3000, newPaymentCents: 7000, currentStatus: 'partial',
    })).toBe('paid');
  });

  it("moves to partial when only some of the balance clears", () => {
    expect(nextInvoiceStatusAfterPayment({
      totalCents: 10000, alreadyPaidCents: 0, newPaymentCents: 4000, currentStatus: 'issued',
    })).toBe('partial');
    expect(nextInvoiceStatusAfterPayment({
      totalCents: 10000, alreadyPaidCents: 2000, newPaymentCents: 3000, currentStatus: 'partial',
    })).toBe('partial');
  });

  it("treats an over-payment as paid (no negative balances)", () => {
    expect(nextInvoiceStatusAfterPayment({
      totalCents: 10000, alreadyPaidCents: 0, newPaymentCents: 15000, currentStatus: 'issued',
    })).toBe('paid');
  });

  it("zero-payment events don't regress an issued invoice", () => {
    expect(nextInvoiceStatusAfterPayment({
      totalCents: 10000, alreadyPaidCents: 0, newPaymentCents: 0, currentStatus: 'issued',
    })).toBe('issued');
  });
});

describe('app/api/public/invoice/[n]/intent/route.ts — source-lock', () => {
  const SRC = read('app/api/public/invoice/[number]/intent/route.ts');

  it("exports POST wrapped by withErrorHandler", () => {
    expect(SRC).toMatch(/export const POST = withErrorHandler/);
  });

  it("short-circuits when PAYMENTS_LIVE is not true", () => {
    expect(SRC).toMatch(/if \(!paymentsAreLive\(\)\)/);
    expect(SRC).toMatch(/status: 503/);
  });

  it("short-circuits when STRIPE_SECRET_KEY is missing", () => {
    expect(SRC).toMatch(/process\.env\.STRIPE_SECRET_KEY/);
  });

  it("looks up the invoice by number OR slug + blocks drafts/voided", () => {
    expect(SRC).toMatch(/invoice_number\.eq\.\$\{upper\},public_slug\.eq\.\$\{rawKey\}/);
    expect(SRC).toMatch(/PUBLIC_BLOCKED_STATUSES\.has\(invoice\.status\)/);
  });

  it("refuses a paid invoice with 409", () => {
    expect(SRC).toMatch(/Invoice is already paid in full/);
    expect(SRC).toMatch(/status: 409/);
  });

  it("creates the intent + writes the payment_intents shadow row", () => {
    expect(SRC).toMatch(/stripe\.paymentIntents\.create/);
    expect(SRC).toMatch(/\.from\('payment_intents'\)\s*\.insert\(/);
  });

  it("returns only the client_secret + intent id (no internal columns)", () => {
    expect(SRC).toMatch(/client_secret: intent\.client_secret/);
    expect(SRC).toMatch(/public_intent_id: intent\.id/);
  });
});

describe('app/api/webhooks/stripe/route.ts — invoice routing', () => {
  const SRC = read('app/api/webhooks/stripe/route.ts');

  it("imports the P5 helpers + gates the new path behind paymentsAreLive", () => {
    expect(SRC).toMatch(/extractInvoiceFromStripeEvent/);
    expect(SRC).toMatch(/nextInvoiceStatusAfterPayment/);
    expect(SRC).toMatch(/stripeEventIsUsd/);
    expect(SRC).toMatch(/sumSucceededPayments/);
    expect(SRC).toMatch(/paymentsAreLive/);
  });

  it("routes intents with metadata.invoice_id to the new clearance helper", () => {
    expect(SRC).toMatch(/typeof metadata\.invoice_id === 'string'/);
    expect(SRC).toMatch(/handleInvoicePaymentIntentSucceeded/);
  });

  it("dedupes by external_id so retried webhooks don't double-charge", () => {
    expect(SRC).toMatch(/\.eq\('external_id', key\.external_intent_id\)/);
    expect(SRC).toMatch(/already recorded/);
  });

  it("falls back to payment_intents.invoice_id when metadata is missing", () => {
    expect(SRC).toMatch(/\.from\('payment_intents'\)\s*\.select\('invoice_id'\)/);
  });

  it("INSERTs the payment row with method='stripe' + cleared_at", () => {
    expect(SRC).toMatch(/method: 'stripe'/);
    expect(SRC).toMatch(/cleared_at: new Date\(\)\.toISOString\(\)/);
  });

  it("UPDATEs the invoice status via nextInvoiceStatusAfterPayment", () => {
    expect(SRC).toMatch(/status: nextStatus/);
    expect(SRC).toMatch(/paid_at: nextStatus === 'paid' \? new Date\(\)\.toISOString\(\) : null/);
  });
});

describe('P5 plan annotation locks the slice', () => {
  const PLAN = read('docs/planning/in-progress/payment-infrastructure-2026-06-18.md');

  it("plan still references the Stripe Elements integration scope", () => {
    expect(PLAN).toMatch(/Stripe Elements integration/);
  });

  it("plan still pins test-mode-until-PNC", () => {
    expect(PLAN).toMatch(/Test mode by default until PNC \+ Stripe live keys are set/);
  });
});

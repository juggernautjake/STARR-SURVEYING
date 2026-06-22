// __tests__/admin/payment-deeplink-attempts.test.ts
//
// P6 of payment-infrastructure-2026-06-18.md — locks the deep-link
// payment flow:
//   - lib/payments/invoice-public.ts gains attemptStatusForMethod +
//     sanitizeAttemptMessage helpers
//   - app/api/public/invoice/[number]/attempt/route.ts records the
//     "I sent it" claim as a payment_attempts row
//   - app/pay/[invoice]/page.tsx opens the deep link AND shows the
//     "I sent it / Not yet" confirmation strip

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  attemptStatusForMethod,
  sanitizeAttemptMessage,
} from '@/lib/payments/invoice-public';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe('attemptStatusForMethod (pure)', () => {
  it("Venmo / CashApp / Zelle → pending_confirmation", () => {
    expect(attemptStatusForMethod('venmo')).toBe('pending_confirmation');
    expect(attemptStatusForMethod('cashapp')).toBe('pending_confirmation');
    expect(attemptStatusForMethod('zelle')).toBe('pending_confirmation');
  });

  it("cash / check → pledged", () => {
    expect(attemptStatusForMethod('cash')).toBe('pledged');
    expect(attemptStatusForMethod('check')).toBe('pledged');
  });

  it("stripe + unknown methods → null (Stripe has its own intent route)", () => {
    expect(attemptStatusForMethod('stripe')).toBeNull();
    expect(attemptStatusForMethod('ach')).toBeNull();
    expect(attemptStatusForMethod('crypto' as string)).toBeNull();
    expect(attemptStatusForMethod('')).toBeNull();
  });
});

describe('sanitizeAttemptMessage (pure)', () => {
  it("trims trailing whitespace + clamps to 500 chars", () => {
    expect(sanitizeAttemptMessage('  hi  ')).toBe('  hi');
    expect(sanitizeAttemptMessage('x'.repeat(600))).toHaveLength(500);
  });

  it("returns null for empty / whitespace / non-string", () => {
    expect(sanitizeAttemptMessage('')).toBeNull();
    expect(sanitizeAttemptMessage('   ')).toBeNull();
    expect(sanitizeAttemptMessage(null)).toBeNull();
    expect(sanitizeAttemptMessage(42 as unknown as string)).toBeNull();
  });

  it("preserves multi-line customer notes verbatim", () => {
    expect(sanitizeAttemptMessage('Sent from Bank of America\nRef #1234'))
      .toBe('Sent from Bank of America\nRef #1234');
  });
});

describe('POST /api/public/invoice/[number]/attempt — source-lock', () => {
  const SRC = read('app/api/public/invoice/[number]/attempt/route.ts');

  it("rejects unsupported methods (incl. stripe) with 400", () => {
    expect(SRC).toMatch(/attemptStatusForMethod\(method\)/);
    expect(SRC).toMatch(/'Unsupported payment method\.'/);
    expect(SRC).toMatch(/status: 400/);
  });

  it("looks up the invoice by number OR slug + blocks drafts/voided", () => {
    expect(SRC).toMatch(/invoice_number\.eq\.\$\{upper\},public_slug\.eq\.\$\{rawKey\}/);
    expect(SRC).toMatch(/PUBLIC_BLOCKED_STATUSES\.has/);
  });

  it("refuses an already-paid invoice with 409", () => {
    expect(SRC).toMatch(/Invoice is already paid in full/);
    expect(SRC).toMatch(/status: 409/);
  });

  it("defaults intended_amount_cents to the outstanding balance", () => {
    expect(SRC).toMatch(/sumSucceededPayments/);
    expect(SRC).toMatch(/typeof body\.intended_amount_cents === 'number'/);
    expect(SRC).toMatch(/\? Math\.max\(0, Math\.round\(body\.intended_amount_cents\)\)\s*:\s*balance/);
  });

  it("INSERTs into payment_attempts with the method-derived status", () => {
    expect(SRC).toMatch(/\.from\('payment_attempts'\)\s*\.insert\(row\)/);
    expect(SRC).toMatch(/status,/);
  });

  it("is NOT gated by PAYMENTS_LIVE (recording intent is safe pre-launch)", () => {
    expect(SRC).not.toMatch(/paymentsAreLive/);
  });

  it("returns only the public attempt fields (id / method / status / amount / ts)", () => {
    expect(SRC).toMatch(/\.select\('id, method, status, intended_amount_cents, created_at'\)/);
  });
});

describe('app/pay/[invoice]/page.tsx — deep-link flow (P6)', () => {
  const SRC = read('app/pay/[invoice]/page.tsx');

  it("dispatches by method.action: 'deeplink' opens the platform; 'pledge' shows the toast; default is stub", () => {
    expect(SRC).toMatch(/method\.action === 'deeplink'/);
    expect(SRC).toMatch(/method\.action === 'pledge'/);
  });

  it("opens the deep link in a new tab via window.open", () => {
    expect(SRC).toMatch(/window\.open\(link, '_blank', 'noopener,noreferrer'\)/);
  });

  it("renders the I-sent-it confirmation strip with email + actions", () => {
    // After P7 the testids are picked by a ternary so they live as
    // bare string literals.
    expect(SRC).toMatch(/'pay-attempt-confirm'/);
    expect(SRC).toMatch(/data-testid="pay-attempt-email"/);
    expect(SRC).toMatch(/'pay-attempt-submit'/);
  });

  it("POSTs to /api/public/invoice/<n>/attempt with method + chosen amount + email", () => {
    expect(SRC).toMatch(/fetch\(`\/api\/public\/invoice\/\$\{encodeURIComponent\(invoice\.invoice_number\)\}\/attempt`/);
    expect(SRC).toMatch(/method: attemptMethod/);
    // S4 — the customer's chosen amount (>= upfront, <= balance), not always the full balance.
    expect(SRC).toMatch(/intended_amount_cents: chosenCents/);
    expect(SRC).toMatch(/payer_email: payerEmail\.trim\(\) \|\| undefined/);
  });

  it("flips to a thank-you state after the attempt is recorded", () => {
    expect(SRC).toMatch(/'pay-attempt-received'/);
    expect(SRC).toMatch(/setAttemptRecorded\(true\)/);
  });

  it("Stripe + cash + check still show the not-yet toast (P5 / P7 deferred)", () => {
    expect(SRC).toMatch(/data-testid="pay-methods-toast"/);
    expect(SRC).toMatch(/setPendingMethod\(method\.id\)/);
  });
});

describe('P6 plan annotation locks the slice', () => {
  const PLAN = read('docs/planning/completed/payment-infrastructure-2026-06-18.md');

  it("plan still references the deep-link payment options scope", () => {
    expect(PLAN).toMatch(/Deep-link payment options/);
  });

  it("plan still pins the pending_confirmation flow for office close-out", () => {
    expect(PLAN).toMatch(/pending_confirmation/);
  });
});

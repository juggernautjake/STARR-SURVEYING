// __tests__/payments/money-path.test.ts — the invoice lifecycle, the reconciliation, and the receipts.
//
// Phase C of SURVEYING_BACKEND_ANALYSIS_2026-08-01. The analysis's own framing is the reason this file
// exists: *"Six test invoices exist in live data covering exactly these states — they should be driven by
// a test, not only by hand."* Driving by hand proves it worked once, on one afternoon, for whoever was
// looking.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { decideUpfrontAcceptance } from '@/lib/payments/upfront-rule';
import { PAYMENT_METHODS } from '@/lib/payments/live';
import {
  STALE_AFTER_DAYS, UNCONFIRMED_STATUSES, describeClaim, staleClaims,
  type AttemptRow, type PaymentRow,
} from '@/lib/payments/reconcile';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

// ── C1-1 · the lifecycle ───────────────────────────────────────────────────────────────────────────
//
// Walked as a SEQUENCE rather than as isolated cases, because the interesting failures are transitions:
// the second payment on an invoice with an upfront, the payment that exactly clears the balance, the one
// after that.

describe('C1-1 — issued → partially paid → paid', () => {
  const total = 150_000;   // TEST-0006's shape: $1,500 with a $750 upfront
  const upfront = 75_000;
  const step = (paid: number, want: number) =>
    decideUpfrontAcceptance({
      total_cents: total, deposit_amount_cents: upfront,
      prior_paid_cents: paid, intended_amount_cents: want,
    });

  it('refuses a first payment under the upfront', () => {
    // The whole point of an upfront: a customer cannot pay $1 and have the job scheduled.
    const d = step(0, 10_000);
    expect(d.accepted).toBe(false);
    expect(d.reason).toBe('below_upfront');
    expect(d.min_cents).toBe(upfront);
  });

  it('accepts a first payment of exactly the upfront', () => {
    // The boundary, and the most common off-by-one in a rule like this: "at least" must include equal.
    expect(step(0, upfront).accepted).toBe(true);
  });

  it('accepts anything positive once the upfront is met', () => {
    // The upfront is a FIRST-payment rule, not a per-payment minimum. Applying it again would refuse a
    // customer paying off the rest in instalments.
    const d = step(upfront, 1);
    expect(d.accepted).toBe(true);
    expect(d.min_cents).toBe(1);
  });

  it('refuses more than the remaining balance at every stage', () => {
    expect(step(0, total + 1).reason).toBe('above_balance');
    expect(step(upfront, total).reason).toBe('above_balance');
    expect(step(upfront, total - upfront).accepted).toBe(true);
  });

  it('closes the invoice: the payment that clears it is accepted, the next is not', () => {
    expect(step(total - 1, 1).accepted).toBe(true);
    const after = step(total, 1);
    expect(after.accepted).toBe(false);
    expect(after.reason).toBe('already_paid');
    expect(after.max_cents).toBe(0);
  });

  it('an invoice with no upfront takes any positive amount from the start', () => {
    // TEST-0001's shape. The upfront rule must not invent a minimum where none was set.
    const d = decideUpfrontAcceptance({
      total_cents: 100_000, deposit_amount_cents: 0, prior_paid_cents: 0, intended_amount_cents: 500,
    });
    expect(d.accepted).toBe(true);
    expect(d.min_cents).toBe(1);
  });

  it('a ZERO-TOTAL invoice is already paid rather than payable for nothing', () => {
    // TEST-0004's shape, and the case a naive `remaining > 0` check gets wrong in the other direction.
    const d = decideUpfrontAcceptance({
      total_cents: 0, deposit_amount_cents: 0, prior_paid_cents: 0, intended_amount_cents: 100,
    });
    expect(d.accepted).toBe(false);
    expect(d.reason).toBe('already_paid');
  });

  it('an upfront LARGER than the total is clamped, not enforced', () => {
    // Otherwise a data-entry slip makes an invoice unpayable: the customer is asked for more than the
    // whole bill and every amount is simultaneously below the minimum and above the balance.
    const d = decideUpfrontAcceptance({
      total_cents: 50_000, deposit_amount_cents: 200_000, prior_paid_cents: 0, intended_amount_cents: 50_000,
    });
    expect(d.accepted).toBe(true);
  });

  it('overpayment already recorded does not produce a negative balance', () => {
    const d = decideUpfrontAcceptance({
      total_cents: 100_000, deposit_amount_cents: 0, prior_paid_cents: 120_000, intended_amount_cents: 1,
    });
    expect(d.max_cents).toBe(0);
    expect(d.reason).toBe('already_paid');
  });
});

// ── C1-2 · the claims that never became money ──────────────────────────────────────────────────────

describe('C1-2 — reconciling "I sent it" against what arrived', () => {
  const DAY = 24 * 60 * 60 * 1000;
  const NOW = Date.parse('2026-08-01T12:00:00Z');
  const daysAgo = (n: number) => new Date(NOW - n * DAY).toISOString();

  const attempt = (over: Partial<AttemptRow> = {}): AttemptRow => ({
    id: 'a1', invoice_id: 'inv1', method: 'venmo', intended_amount_cents: 50_000,
    status: 'pending_confirmation', created_at: daysAgo(10), resulted_in_payment_id: null,
    payer_email: 'c@example.com', ...over,
  });
  const payment = (over: Partial<PaymentRow> = {}): PaymentRow => ({
    id: 'p1', invoice_id: 'inv1', amount_cents: 50_000, method: 'venmo', status: 'succeeded',
    cleared_at: daysAgo(9), created_at: daysAgo(9), ...over,
  });
  const run = (a: AttemptRow[], p: PaymentRow[], afterDays = STALE_AFTER_DAYS) =>
    staleClaims(a, p, { asOf: NOW, afterDays });

  it('flags a claim with nothing recorded against it', () => {
    const [c] = run([attempt()], []);
    expect(c.reason).toBe('no_payment');
    expect(c.ageDays).toBe(10);
  });

  it('does NOT flag one where the money arrived', () => {
    expect(run([attempt()], [payment()])).toEqual([]);
  });

  it('does not flag a claim the office already linked by hand', () => {
    // Re-listing work somebody has done is how a list gets ignored.
    expect(run([attempt({ resulted_in_payment_id: 'p9' })], [])).toEqual([]);
  });

  it('LEAVES A RECENT CLAIM ALONE, which is the point of the window', () => {
    // A Zelle can take three business days. Flagging at once would put every honest customer on the list
    // and train the office to ignore it — the failure that matters, because a list nobody reads cost the
    // work of building it.
    expect(run([attempt({ created_at: daysAgo(1) })], [])).toEqual([]);
    expect(run([attempt({ created_at: daysAgo(6) })], [])).toHaveLength(1);
  });

  it('does not count money that arrived BEFORE the claim', () => {
    // An earlier instalment must not clear a later claim — that is somebody else's money paying for this
    // one, and it would hide exactly the case worth catching.
    const old = payment({ cleared_at: daysAgo(40), created_at: daysAgo(40) });
    expect(run([attempt()], [old])).toHaveLength(1);
  });

  it('reports a SHORTFALL separately, because it needs a different action', () => {
    // Nothing arrived is a question for the customer; less arrived than claimed is a question for the
    // bank statement.
    const [c] = run([attempt()], [payment({ amount_cents: 20_000 })]);
    expect(c.reason).toBe('amount_mismatch');
    expect(c.paidCents).toBe(20_000);
  });

  it('ignores a failed payment when deciding whether money arrived', () => {
    expect(run([attempt()], [payment({ status: 'failed' })])).toHaveLength(1);
  });

  it('only looks at claims nobody has confirmed', () => {
    expect(UNCONFIRMED_STATUSES.has('pledged')).toBe(true);
    expect(UNCONFIRMED_STATUSES.has('pending_confirmation')).toBe(true);
    expect(run([attempt({ status: 'confirmed' })], [])).toEqual([]);
  });

  it('sorts OLDEST first', () => {
    // The oldest is the most likely to have been forgotten; newest-first buries exactly the rows that
    // need attention.
    const got = run([
      attempt({ id: 'recent', created_at: daysAgo(6) }),
      attempt({ id: 'ancient', created_at: daysAgo(40) }),
    ], []);
    expect(got.map((c) => c.attempt.id)).toEqual(['ancient', 'recent']);
  });

  it('is worded as a worklist, never as an accusation', () => {
    // Almost every row is a customer who genuinely paid and an office that has not reconciled the bank
    // yet. The one thing that would waste this feature is somebody chasing them.
    const [c] = run([attempt()], []);
    const note = describeClaim(c);
    expect(note).toMatch(/Check the bank/);
    expect(note).not.toMatch(/unpaid|fraud|failed to pay|owes/i);
  });
});

// ── C1-3 · a receipt on every path ─────────────────────────────────────────────────────────────────

describe('C1-3 — every method a customer can pay by has a receipt path', () => {
  const RECEIPT = read('app/api/public/invoice/[number]/receipt/route.ts');
  const ATTEMPT = read('app/api/public/invoice/[number]/attempt/route.ts');
  const PUBLIC = read('lib/payments/invoice-public.ts');

  it('the receipt endpoint does not special-case a method', () => {
    // The failure this guards is a receipt that works for Stripe and silently does nothing for a check —
    // which nobody notices, because the person who would notice is the customer who did not get one.
    for (const m of PAYMENT_METHODS) {
      expect(RECEIPT, `receipt must not branch on ${m.id}`).not.toMatch(new RegExp(`method\\s*===\\s*'${m.id}'`));
    }
  });

  it('receipts describe every method rather than falling through to a blank', () => {
    // `describePaymentForReceipt` turns a payment row into a customer-facing line. A method it does not
    // know produces a receipt with a hole in it.
    for (const m of PAYMENT_METHODS) {
      expect(PUBLIC, `${m.id} must be describable on a receipt`).toContain(m.id);
    }
  });

  it('a deep-link claim emails the office, so a pledged payment is not silent', () => {
    expect(ATTEMPT).toMatch(/resend|RESEND_API_KEY/i);
  });

  it('and the receipt path is throttled like the rest of the public surface (B1-1)', () => {
    // It sends mail, so it is the same class of risk as the contact form — an exhausted quota stops real
    // enquiries being emailed at all.
    expect(RECEIPT).toMatch(/public-payment/);
    expect(ATTEMPT).toMatch(/public-payment/);
  });
});

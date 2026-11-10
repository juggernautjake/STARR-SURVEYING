/**
 * Online payments after the customer presses Pay (owner, 2026-11-10: "set up online payments for
 * customers to pay online with card … however it makes the most sense").
 *
 * A bank payment clears in days and can bounce; a refund or chargeback can land weeks later. The
 * invoice's status is always worked out again from all of its payments.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  netPaidCents, pendingCents, payableBalanceCents, invoiceStatusFromPayments, refundState,
  paymentStatusForDispute, intentIdOf,
} from '@/lib/payments/stripe-lifecycle';
import { sumSucceededPayments } from '@/lib/payments/invoice-public';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

describe('what is paid, clearing, and still payable', () => {
  const pays = [
    { amount_cents: 50000, status: 'succeeded' },
    { amount_cents: 20000, status: 'succeeded', refunded_cents: 5000 },
    { amount_cents: 30000, status: 'pending' },
    { amount_cents: 99999, status: 'failed' },
    { amount_cents: 10000, status: 'disputed' },
  ];
  it('paid = succeeded less refunds; failed and disputed money does not count', () => {
    expect(netPaidCents(pays)).toBe(65000);
    expect(sumSucceededPayments(pays)).toBe(65000); // every existing balance follows refunds too
  });
  it('a bank payment clearing is not paid, but is not owed again either', () => {
    expect(pendingCents(pays)).toBe(30000);
    expect(payableBalanceCents(100000, pays)).toBe(5000);
    expect(payableBalanceCents(50000, pays)).toBe(0);
  });
});

describe('invoice status from its payments', () => {
  const s = (currentStatus: string, payments: Parameters<typeof netPaidCents>[0], totalCents = 100000) =>
    invoiceStatusFromPayments({ totalCents, currentStatus, payments });

  it('paid in full → paid; part → partial', () => {
    expect(s('issued', [{ amount_cents: 100000, status: 'succeeded' }])).toBe('paid');
    expect(s('issued', [{ amount_cents: 40000, status: 'succeeded' }])).toBe('partial');
  });
  it('a bank payment still clearing leaves the invoice as it was — not paid yet', () => {
    expect(s('issued', [{ amount_cents: 100000, status: 'pending' }])).toBe('issued');
    expect(s('overdue', [{ amount_cents: 100000, status: 'pending' }])).toBe('overdue');
  });
  it('a bank payment that bounces takes a paid invoice back to issued', () => {
    expect(s('paid', [{ amount_cents: 100000, status: 'failed' }])).toBe('issued');
  });
  it('a whole refund → refunded; a part refund reopens the balance → partial', () => {
    expect(s('paid', [{ amount_cents: 100000, status: 'refunded', refunded_cents: 100000 }])).toBe('refunded');
    expect(s('paid', [{ amount_cents: 100000, status: 'succeeded', refunded_cents: 25000 }])).toBe('partial');
  });
  it('a chargeback takes the money out until it is won', () => {
    expect(s('paid', [{ amount_cents: 100000, status: 'disputed' }])).toBe('issued');
  });
  it('draft and voided are the office\'s decisions and never change', () => {
    expect(s('voided', [{ amount_cents: 100000, status: 'succeeded' }])).toBe('voided');
    expect(s('draft', [{ amount_cents: 100000, status: 'succeeded' }])).toBe('draft');
  });
});

describe('refunds and disputes', () => {
  it('refund state', () => {
    expect(refundState(10000, 0)).toEqual({ refunded_cents: 0, status: 'succeeded' });
    expect(refundState(10000, 2500)).toEqual({ refunded_cents: 2500, status: 'succeeded' });
    expect(refundState(10000, 10000)).toEqual({ refunded_cents: 10000, status: 'refunded' });
    expect(refundState(10000, 99999)).toEqual({ refunded_cents: 10000, status: 'refunded' });
  });
  it('a dispute holds the money until it is won (or an inquiry closes without a chargeback)', () => {
    for (const open of ['warning_needs_response', 'needs_response', 'under_review', 'lost']) {
      expect(paymentStatusForDispute(open)).toBe('disputed');
    }
    expect(paymentStatusForDispute('won')).toBe('succeeded');
    expect(paymentStatusForDispute('warning_closed')).toBe('succeeded');
  });
  it('finds the PaymentIntent from an intent, a charge, or a dispute', () => {
    expect(intentIdOf({ object: 'payment_intent', id: 'pi_1' })).toBe('pi_1');
    expect(intentIdOf({ object: 'charge', id: 'ch_1', payment_intent: 'pi_2' })).toBe('pi_2');
    expect(intentIdOf({ object: 'dispute', payment_intent: { id: 'pi_3' } })).toBe('pi_3');
    expect(intentIdOf({ object: 'charge' })).toBeNull();
  });
});

describe('the webhook wiring', () => {
  const HOOK = read('app/api/webhooks/stripe/route.ts');
  it('handles the bank-clearing, refund and chargeback events', () => {
    for (const t of ['payment_intent.processing', 'charge.refunded', 'charge.dispute.created', 'charge.dispute.closed']) {
      expect(HOOK).toContain(`'${t}'`);
    }
  });
  it('a pending payment is promoted on success — never skipped as "already recorded"', () => {
    expect(HOOK).toContain("existing.status === 'pending' || existing.status === 'failed'");
  });
  it('a failure handling a money event answers 500 and forgets the event, so Stripe retries', () => {
    expect(HOOK).toMatch(/isInvoiceMoneyEvent\(event\)\)[\s\S]{0,300}processed_webhook_events'\)\.delete\(\)[\s\S]{0,200}status: 500/);
  });
  it('the invoice status is re-derived from all payments', () => {
    expect(HOOK).toContain('invoiceStatusFromPayments(');
    expect(HOOK).not.toContain('nextInvoiceStatusAfterPayment(');
  });
  it('the next payment never counts a clearing bank payment as owed', () => {
    expect(read('app/api/public/invoice/[number]/intent/route.ts')).toContain('pendingCents(payments');
    expect(read('app/api/public/invoice/[number]/route.ts')).toContain('pending_cents: pending');
  });
  it('the seed adds disputed and refunds', () => {
    const sql = read('seeds/680_stripe_payment_lifecycle.sql');
    expect(sql).toContain("'disputed'");
    expect(sql).toContain('refunded_cents');
  });
});

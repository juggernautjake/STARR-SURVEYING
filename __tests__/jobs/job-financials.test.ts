// __tests__/jobs/job-financials.test.ts — slice J3 of
// docs/planning/completed/JOB_LIFECYCLE_AND_BRIEFINGS_2026-08-14.md
//
// Every case here is a way of getting "what is still owed on this job" wrong that produces a
// PLAUSIBLE number. That is the whole hazard: a wrong balance does not look wrong, it looks like a
// balance, and somebody either chases a client who has paid or fails to chase one who has not.

import { describe, it, expect } from 'vitest';
import {
  summariseJobFinancials, formatMoney, BILLED_INVOICE_STATES,
} from '@/lib/jobs/financials';

const pay = (amount: number, payment_type = 'payment') => ({ amount, payment_type });
const inv = (dollars: number, status = 'issued') => ({ total_cents: Math.round(dollars * 100), status });

describe('what was quoted', () => {
  it('uses the quote when there is no final amount', () => {
    const s = summariseJobFinancials({ quoteAmount: 6000, finalAmount: null, payments: [], invoices: [] });
    expect(s.quoted).toBe(6000);
    expect(s.quotedIsFinal).toBe(false);
  });

  it('lets an agreed final amount replace the quote', () => {
    const s = summariseJobFinancials({ quoteAmount: 6000, finalAmount: 8000, payments: [], invoices: [] });
    expect(s.quoted).toBe(8000);
    expect(s.quotedIsFinal).toBe(true);
  });

  it('does not call a final amount equal to the quote a change', () => {
    const s = summariseJobFinancials({ quoteAmount: 6000, finalAmount: 6000, payments: [], invoices: [] });
    expect(s.quotedIsFinal).toBe(false);
  });

  it('treats a zero final amount as "not agreed yet", not as a $0 job', () => {
    // `finalAmount ?? quoteAmount` would take the 0 and report a fully-billed $0 job with a $6,000
    // quote sitting next to it.
    const s = summariseJobFinancials({ quoteAmount: 6000, finalAmount: 0, payments: [], invoices: [] });
    expect(s.quoted).toBe(6000);
  });
});

describe('what was invoiced', () => {
  it('converts cents to dollars exactly once', () => {
    // The 100× error that renders as a plausible number: job_payments.amount is DOLLARS and
    // customer_invoices.total_cents is CENTS, and they are summed against each other.
    expect(summariseJobFinancials({ quoteAmount: 0, payments: [], invoices: [inv(6000)] }).invoiced).toBe(6000);
  });

  it('ignores a draft invoice, which nobody has seen', () => {
    const s = summariseJobFinancials({ quoteAmount: 6000, payments: [], invoices: [inv(6000, 'draft')] });
    expect(s.invoiced).toBe(0);
    // And so the balance falls back to the quote rather than reporting the job as unbilled-and-owed
    // against a document that was never sent.
    expect(s.basis).toBe('quoted');
  });

  it('ignores a voided invoice, which was withdrawn', () => {
    const s = summariseJobFinancials({ quoteAmount: 6000, payments: [], invoices: [inv(6000, 'voided')] });
    expect(s.invoiced).toBe(0);
  });

  it('still counts an invoice that was paid and then refunded', () => {
    // The money was asked for and the reversal appears on the payments side. Dropping it here too
    // would subtract the refund twice.
    expect(BILLED_INVOICE_STATES.has('refunded')).toBe(true);
    const s = summariseJobFinancials({
      quoteAmount: 6000, payments: [pay(6000), pay(6000, 'refund')], invoices: [inv(6000, 'refunded')],
    });
    expect(s.invoiced).toBe(6000);
    expect(s.netReceived).toBe(0);
    expect(s.outstanding).toBe(6000);
  });

  it('says how much of the quote is still to be billed', () => {
    const s = summariseJobFinancials({ quoteAmount: 6000, payments: [], invoices: [inv(2000)] });
    expect(s.unbilled).toBe(4000);
  });

  it('does not report negative unbilled when more was invoiced than quoted', () => {
    // Change orders happen. "−$2,000 still to bill" is not a sentence.
    const s = summariseJobFinancials({ quoteAmount: 6000, payments: [], invoices: [inv(8000)] });
    expect(s.unbilled).toBe(0);
    expect(s.invoiced).toBe(8000);
  });
});

describe('what came in', () => {
  it('sums payments and deposits', () => {
    const s = summariseJobFinancials({
      quoteAmount: 6000, payments: [pay(2000, 'deposit'), pay(1500)], invoices: [],
    });
    expect(s.received).toBe(3500);
    expect(s.netReceived).toBe(3500);
  });

  it('subtracts a refund', () => {
    // The bug this whole file exists around: `jobs.amount_paid` was written as the sum of
    // NON-refund payments, so recording a refund left the job showing the money as received and
    // the status as `paid`. Recomputing from the rows cannot drift like a cached column can.
    const s = summariseJobFinancials({
      quoteAmount: 6000, payments: [pay(6000), pay(1000, 'refund')], invoices: [],
    });
    expect(s.received).toBe(6000);
    expect(s.refunded).toBe(1000);
    expect(s.netReceived).toBe(5000);
    expect(s.outstanding).toBe(1000);
    expect(s.status).toBe('partial');
  });

  it('takes a refund as a positive amount with a type, not as a negative number', () => {
    // Recorded the other way — amount: -1000, type: 'refund' — the sign and the type would both
    // subtract and the job would lose $2,000 for a $1,000 refund.
    const s = summariseJobFinancials({ quoteAmount: 6000, payments: [pay(1000, 'refund')], invoices: [] });
    expect(s.refunded).toBe(1000);
    expect(s.netReceived).toBe(-1000);
  });
});

describe('what is still owed', () => {
  it('measures against the invoice once anything has been billed', () => {
    // A job invoiced $8,000 against a $6,000 quote owes $8,000. Answering from the quote is how a
    // firm under-chases by two thousand dollars.
    const s = summariseJobFinancials({ quoteAmount: 6000, payments: [], invoices: [inv(8000)] });
    expect(s.basis).toBe('invoiced');
    expect(s.outstanding).toBe(8000);
  });

  it('falls back to the quote when nothing has been invoiced', () => {
    const s = summariseJobFinancials({ quoteAmount: 6000, payments: [pay(1000)], invoices: [] });
    expect(s.basis).toBe('quoted');
    expect(s.outstanding).toBe(5000);
  });

  it('owes nothing on a job with no quote and no invoice', () => {
    const s = summariseJobFinancials({ quoteAmount: 0, finalAmount: 0, payments: [], invoices: [] });
    expect(s.basis).toBe('none');
    expect(s.outstanding).toBe(0);
    expect(s.status).toBe('nothing_to_bill');
  });

  it('reports an overpayment as overpaid, not as negative outstanding', () => {
    // A negative "Outstanding" reads as a rounding bug. Somebody paying twice is a real event that
    // needs a person to look at it.
    const s = summariseJobFinancials({ quoteAmount: 6000, payments: [pay(6500)], invoices: [] });
    expect(s.outstanding).toBe(0);
    expect(s.overpaid).toBe(500);
    expect(s.status).toBe('overpaid');
  });

  it('calls an exactly-settled job paid without a floating-point remainder', () => {
    // 0.1 + 0.2 arithmetic leaves fractions of a cent outstanding on a job that is exactly paid,
    // which shows as "Outstanding $0.00" beside a status of "partial" — a contradiction on screen.
    const s = summariseJobFinancials({
      quoteAmount: 1000.30, payments: [pay(1000.10), pay(0.20)], invoices: [],
    });
    expect(s.outstanding).toBe(0);
    expect(s.status).toBe('paid');
  });

  it('is unpaid rather than partial when nothing at all has come in', () => {
    const s = summariseJobFinancials({ quoteAmount: 6000, payments: [], invoices: [] });
    expect(s.status).toBe('unpaid');
  });

  it('survives nulls and rubbish in the numbers', () => {
    const s = summariseJobFinancials({
      quoteAmount: null, finalAmount: undefined,
      payments: [{ amount: NaN, payment_type: 'payment' }, pay(100)],
      invoices: [{ total_cents: NaN, status: 'issued' }],
    });
    expect(Number.isFinite(s.netReceived)).toBe(true);
    expect(s.netReceived).toBe(100);
    expect(Number.isFinite(s.outstanding)).toBe(true);
  });
});

describe('the money on screen', () => {
  it('always shows cents, because somebody reconciles this against a bank statement', () => {
    expect(formatMoney(6000)).toBe('$6,000.00');
    expect(formatMoney(1234.5)).toBe('$1,234.50');
  });

  it('puts the sign before the dollar, not after it', () => {
    expect(formatMoney(-500)).toBe('-$500.00');
  });

  it('renders rubbish as zero rather than as "$NaN"', () => {
    expect(formatMoney(NaN)).toBe('$0.00');
  });
});

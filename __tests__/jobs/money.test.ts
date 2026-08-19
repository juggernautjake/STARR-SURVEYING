// __tests__/jobs/money.test.ts — the money rules, which three screens used to each decide alone.

import { describe, it, expect } from 'vitest';
import { summarise, reconcile, rollUpJobs, describePriceChange, PAYMENT_TYPE_LABELS } from '@/lib/jobs/money';

describe('what a job is worth', () => {
  it('bills the final amount when there is one', () => {
    expect(summarise({ quote_amount: 4200, final_amount: 5600 }).billed).toBe(5600);
  });

  it('falls back to the quote while the job is still running', () => {
    // Reporting zero would make live work look free.
    expect(summarise({ quote_amount: 4200 }).billed).toBe(4200);
  });

  it('counts what arrived from the payment ROWS, not the running total', () => {
    // `jobs.amount_paid` is a total somebody has to remember to update; the rows are the events.
    const s = summarise({
      quote_amount: 4200, amount_paid: 0,
      payments: [{ amount: 1500, payment_type: 'deposit' }, { amount: 700, payment_type: 'progress' }],
    });
    expect(s.received).toBe(2200);
    expect(s.outstanding).toBe(2000);
  });

  it('reports down payments separately, because that is the question asked', () => {
    const s = summarise({
      quote_amount: 4200,
      payments: [{ amount: 1500, payment_type: 'deposit' }, { amount: 700, payment_type: 'progress' }],
    });
    expect(s.deposits).toBe(1500);
  });

  it('subtracts a refund — money going back out is not money received', () => {
    const s = summarise({
      quote_amount: 4200,
      payments: [{ amount: 1500, payment_type: 'deposit' }, { amount: 500, payment_type: 'refund' }],
    });
    expect(s.received).toBe(1000);
  });

  it('treats a refund as an outflow even when it was entered as a negative', () => {
    const s = summarise({ quote_amount: 100, payments: [{ amount: -50, payment_type: 'refund' }] });
    expect(s.received).toBe(-50);
  });

  it('never reports a negative amount outstanding', () => {
    const s = summarise({ quote_amount: 100, payments: [{ amount: 500, payment_type: 'payment' }] });
    expect(s.outstanding).toBe(0);
  });
});

describe('a job cancelled after money changed hands', () => {
  it('owes only what is being RETAINED, not what it was quoted', () => {
    // Chasing $6,000 on work nobody is doing is how a receivables report becomes fiction.
    const s = summarise({
      quote_amount: 6000, result: 'abandoned', amount_retained: 1500,
      payments: [{ amount: 1500, payment_type: 'deposit' }],
    });
    expect(s.cancelled).toBe(true);
    expect(s.received).toBe(1500);
    expect(s.outstanding).toBe(0);
  });

  it('owes nothing when it is keeping nothing, even with a big quote', () => {
    const s = summarise({ quote_amount: 6000, result: 'lost', amount_retained: 0 });
    expect(s.outstanding).toBe(0);
  });

  it('still shows what actually arrived, because that cash is real', () => {
    const s = summarise({
      quote_amount: 6000, result: 'lost', amount_retained: 0,
      payments: [{ amount: 1500, payment_type: 'deposit' }],
    });
    expect(s.received).toBe(1500);
  });
});

describe('reconcile — saying so rather than picking a winner', () => {
  it('agrees when the running total matches the rows', () => {
    const r = reconcile({ amount_paid: 1500, payments: [{ amount: 1500, payment_type: 'deposit' }] });
    expect(r.agrees).toBe(true);
    expect(r.drift).toBe(0);
  });

  it('reports the drift when they disagree', () => {
    const r = reconcile({ amount_paid: 1000, payments: [{ amount: 1500, payment_type: 'deposit' }] });
    expect(r.agrees).toBe(false);
    expect(r.stored).toBe(1000);
    expect(r.fromRows).toBe(1500);
    expect(r.drift).toBe(500);
  });

  it('does not trip on floating-point noise', () => {
    const r = reconcile({ amount_paid: 0.1 + 0.2, payments: [{ amount: 0.3, payment_type: 'payment' }] });
    expect(r.agrees).toBe(true);
  });
});

describe('the firm-wide roll-up', () => {
  it('adds bid, received and outstanding across jobs', () => {
    const r = rollUpJobs([
      { quote_amount: 4200, payments: [{ amount: 4200, payment_type: 'payment' }] },
      { quote_amount: 3100, payments: [{ amount: 1000, payment_type: 'deposit' }] },
    ]);
    expect(r.jobs).toBe(2);
    expect(r.billed).toBe(7300);
    expect(r.received).toBe(5200);
    expect(r.outstanding).toBe(2100);
    expect(r.deposits).toBe(1000);
  });

  it('leaves a cancelled job out of what the firm is billing, but keeps its cash', () => {
    const r = rollUpJobs([
      { quote_amount: 4200, payments: [{ amount: 4200, payment_type: 'payment' }] },
      { quote_amount: 9000, result: 'lost', amount_retained: 500, payments: [{ amount: 500, payment_type: 'deposit' }] },
    ]);
    expect(r.billed).toBe(4200);      // not 13,200 — nobody is doing the lost job
    expect(r.received).toBe(4700);    // the 500 really did arrive
    expect(r.cancelled).toBe(1);
  });

  it('is zero for no jobs, not NaN', () => {
    expect(rollUpJobs([])).toMatchObject({ jobs: 0, billed: 0, received: 0, outstanding: 0 });
  });

  it('survives nulls without producing NaN', () => {
    const r = rollUpJobs([{ quote_amount: null, final_amount: null, payments: [{ amount: null }] }]);
    expect(Number.isFinite(r.billed)).toBe(true);
    expect(Number.isFinite(r.received)).toBe(true);
  });
});

describe('reading a price change back', () => {
  it('says which way it moved and from what', () => {
    expect(describePriceChange({ field: 'quote', old_amount: 4200, new_amount: 5600 }))
      .toBe('Quote raised from $4,200.00 to $5,600.00');
    expect(describePriceChange({ field: 'final', old_amount: 5600, new_amount: 5000 }))
      .toBe('Final amount lowered from $5,600.00 to $5,000.00');
  });

  it('does not render an opening figure as a change from nothing', () => {
    // "— → $4,200" reads like data loss.
    expect(describePriceChange({ field: 'quote', old_amount: null, new_amount: 4200 }))
      .toBe('Quote set to $4,200.00');
  });

  it('names a down payment the way the firm says it', () => {
    expect(PAYMENT_TYPE_LABELS.deposit).toBe('Down payment');
  });
});

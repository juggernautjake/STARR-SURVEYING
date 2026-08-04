// __tests__/payroll/advance-recovery.test.ts
//
// Taking a pay advance back out of a paycheque. Every case here is one somebody would otherwise
// discover by receiving the wrong amount.

import { describe, it, expect } from 'vitest';
import { planAdvanceRecovery, type OutstandingAdvance } from '@/lib/payroll/advance-recovery';

const advance = (over: Partial<OutstandingAdvance> = {}): OutstandingAdvance => ({
  id: 'a1',
  outstanding: 200,
  repay_per_period: null,
  paid_at: '2026-07-01T00:00:00Z',
  ...over,
});

describe('planAdvanceRecovery — the ordinary case', () => {
  it('takes the whole advance out of a cheque that can carry it', () => {
    const plan = planAdvanceRecovery({ advances: [advance()], netPay: 1000 });
    expect(plan.totalRecovered).toBe(200);
    expect(plan.netAfterRecovery).toBe(800);
    expect(plan.remainingOutstanding).toBe(0);
  });

  it('names the amount and the balance on the stub', () => {
    const plan = planAdvanceRecovery({ advances: [advance({ outstanding: 500 })], netPay: 400 });
    expect(plan.note).toContain('$300.00 recovered');
    expect(plan.note).toContain('$200.00 still outstanding');
  });

  it('does nothing when there is nothing owed', () => {
    const plan = planAdvanceRecovery({ advances: [], netPay: 1000 });
    expect(plan.totalRecovered).toBe(0);
    expect(plan.netAfterRecovery).toBe(1000);
    expect(plan.note).toBeNull();
  });
});

describe('planAdvanceRecovery — a cheque is never emptied', () => {
  it('leaves a quarter of net pay behind, even against a bigger debt', () => {
    // A person who works a full period and receives $0.00 has nothing to live on, and the next
    // thing that happens is another advance request.
    const plan = planAdvanceRecovery({ advances: [advance({ outstanding: 5000 })], netPay: 800 });
    expect(plan.totalRecovered).toBe(600);
    expect(plan.netAfterRecovery).toBe(200);
    expect(plan.remainingOutstanding).toBe(4400);
  });

  it('never produces a negative cheque', () => {
    const plan = planAdvanceRecovery({ advances: [advance({ outstanding: 10_000 })], netPay: 100 });
    expect(plan.netAfterRecovery).toBeGreaterThanOrEqual(0);
    expect(plan.totalRecovered).toBeLessThanOrEqual(100);
  });

  it('honours a bigger protected share when one is set', () => {
    const plan = planAdvanceRecovery({ advances: [advance({ outstanding: 5000 })], netPay: 1000, protectedShare: 0.8 });
    expect(plan.totalRecovered).toBe(200);
    expect(plan.netAfterRecovery).toBe(800);
  });

  it('recovers nothing from a cheque of zero, and says the debt is still there', () => {
    const plan = planAdvanceRecovery({ advances: [advance()], netPay: 0 });
    expect(plan.totalRecovered).toBe(0);
    expect(plan.remainingOutstanding).toBe(200);
    expect(plan.note).toContain('nothing recovered this period');
  });
});

describe('planAdvanceRecovery — instalments', () => {
  it('caps a period at the instalment amount', () => {
    const plan = planAdvanceRecovery({
      advances: [advance({ outstanding: 1200, repay_per_period: 200 })],
      netPay: 2000,
    });
    expect(plan.totalRecovered).toBe(200);
    expect(plan.remainingOutstanding).toBe(1000);
  });

  it('never takes MORE than is outstanding, however big the instalment', () => {
    // An instalment is a cap, not a target. Taking $200 against a $50 balance would overcharge by
    // $150 and leave a negative outstanding for somebody to puzzle over.
    const plan = planAdvanceRecovery({
      advances: [advance({ outstanding: 50, repay_per_period: 200 })],
      netPay: 2000,
    });
    expect(plan.totalRecovered).toBe(50);
    expect(plan.remainingOutstanding).toBe(0);
  });

  it('ignores a zero or negative instalment rather than recovering nothing forever', () => {
    // A zero cap would mean the debt is never repaid and nothing anywhere says why.
    const plan = planAdvanceRecovery({
      advances: [advance({ outstanding: 300, repay_per_period: 0 })],
      netPay: 2000,
    });
    expect(plan.totalRecovered).toBe(300);
  });
});

describe('planAdvanceRecovery — several advances', () => {
  it('clears the oldest first', () => {
    const plan = planAdvanceRecovery({
      advances: [
        advance({ id: 'newer', outstanding: 100, paid_at: '2026-07-20T00:00:00Z' }),
        advance({ id: 'older', outstanding: 100, paid_at: '2026-06-01T00:00:00Z' }),
      ],
      netPay: 200,   // $150 available after the protected quarter
    });
    expect(plan.recoveries[0].advanceId).toBe('older');
    expect(plan.recoveries[0].amount).toBe(100);
    expect(plan.recoveries[1].amount).toBe(50);
  });

  it('spends the budget across as many as it reaches, then stops', () => {
    const plan = planAdvanceRecovery({
      advances: [
        advance({ id: 'a', outstanding: 100, paid_at: '2026-06-01T00:00:00Z' }),
        advance({ id: 'b', outstanding: 100, paid_at: '2026-06-02T00:00:00Z' }),
        advance({ id: 'c', outstanding: 100, paid_at: '2026-06-03T00:00:00Z' }),
      ],
      netPay: 200,   // $150 available
    });
    expect(plan.totalRecovered).toBe(150);
    expect(plan.recoveries).toHaveLength(2);
    expect(plan.remainingOutstanding).toBe(150);
  });

  it('sorts an advance with no paid date last rather than to the front', () => {
    // It should not be in the list at all — the view filters to paid advances — so an unknown date
    // must not jump the queue on no evidence.
    const plan = planAdvanceRecovery({
      advances: [
        advance({ id: 'undated', outstanding: 100, paid_at: null }),
        advance({ id: 'dated', outstanding: 100, paid_at: '2026-07-01T00:00:00Z' }),
      ],
      netPay: 200,
    });
    expect(plan.recoveries[0].advanceId).toBe('dated');
  });
});

describe('planAdvanceRecovery — bad input', () => {
  it('skips advances with nothing outstanding', () => {
    const plan = planAdvanceRecovery({
      advances: [advance({ outstanding: 0 }), advance({ id: 'a2', outstanding: -50 })],
      netPay: 1000,
    });
    expect(plan.totalRecovered).toBe(0);
    expect(plan.recoveries).toEqual([]);
  });

  it('survives a NaN net pay without producing a NaN cheque', () => {
    const plan = planAdvanceRecovery({ advances: [advance()], netPay: Number.NaN });
    expect(plan.netAfterRecovery).toBe(0);
    expect(plan.totalRecovered).toBe(0);
  });

  it('clamps a nonsense protected share into range', () => {
    const plan = planAdvanceRecovery({ advances: [advance({ outstanding: 5000 })], netPay: 1000, protectedShare: -3 });
    expect(plan.totalRecovered).toBe(1000);
    expect(plan.netAfterRecovery).toBe(0);
  });
});

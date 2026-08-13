// __tests__/payroll/engine-overlap.test.ts
//
// This firm runs two payroll engines that do not know about each other — `payroll_runs` and
// `payout_batches` — and both take the same approved hours as input. A week paid by a batch on
// Friday could be paid again by a run on Monday, and nothing objected.
//
// The asymmetry these tests encode: refusing a legitimate second payment costs somebody a
// conversation and a deliberate one-off adjustment. Allowing a duplicate pays a person's whole week
// twice and is found by reconciling a bank statement weeks later, if at all.
import { describe, it, expect } from 'vitest';
import { findPeriodOverlap, type ExistingSettlement } from '@/lib/payroll/engine-overlap';

const batch = (over: Partial<ExistingSettlement> = {}): ExistingSettlement => ({
  id: 'b1', kind: 'payout_batch', from: '2026-08-10', to: '2026-08-16', status: 'completed', ...over,
});
const run = (over: Partial<ExistingSettlement> = {}): ExistingSettlement => ({
  id: 'r1', kind: 'payroll_run', from: '2026-08-10', to: '2026-08-16', status: 'completed', ...over,
});

describe('a clear period', () => {
  it('passes when nothing exists', () => {
    const r = findPeriodOverlap({ from: '2026-08-17', to: '2026-08-23' }, []);
    expect(r.ok).toBe(true);
    expect(r.message).toBeNull();
  });

  it('passes for the week after one that was paid', () => {
    expect(findPeriodOverlap({ from: '2026-08-17', to: '2026-08-23' }, [batch()]).ok).toBe(true);
  });

  it('passes for the week before', () => {
    expect(findPeriodOverlap({ from: '2026-08-03', to: '2026-08-09' }, [batch()]).ok).toBe(true);
  });
});

describe('the collision', () => {
  it('refuses the identical week', () => {
    const r = findPeriodOverlap({ from: '2026-08-10', to: '2026-08-16' }, [batch()]);
    expect(r.ok).toBe(false);
    expect(r.conflicts).toHaveLength(1);
  });

  it('refuses a single overlapping day at either end', () => {
    // Partial overlap is still double payment for the days in common.
    expect(findPeriodOverlap({ from: '2026-08-16', to: '2026-08-22' }, [batch()]).ok).toBe(false);
    expect(findPeriodOverlap({ from: '2026-08-04', to: '2026-08-10' }, [batch()]).ok).toBe(false);
  });

  it('refuses a period that swallows an existing one, and one nested inside it', () => {
    expect(findPeriodOverlap({ from: '2026-08-01', to: '2026-08-31' }, [batch()]).ok).toBe(false);
    expect(findPeriodOverlap({ from: '2026-08-12', to: '2026-08-13' }, [batch()]).ok).toBe(false);
  });

  it('catches the cross-engine case, which is the whole point', () => {
    // Neither engine reads anything the other writes; this is the collision that had nothing
    // watching it at all.
    const r = findPeriodOverlap({ from: '2026-08-10', to: '2026-08-16' }, [batch({ status: 'dispatched' })]);
    expect(r.ok).toBe(false);
    expect(r.message).toContain('payout batch');
  });

  it('catches two runs of the same engine too', () => {
    expect(findPeriodOverlap({ from: '2026-08-10', to: '2026-08-16' }, [run()]).ok).toBe(false);
  });
});

describe('what does not count', () => {
  it('ignores a voided batch and a cancelled run', () => {
    // They settled nothing, so the week is genuinely unpaid.
    expect(findPeriodOverlap({ from: '2026-08-10', to: '2026-08-16' }, [
      batch({ status: 'voided' }), run({ id: 'r2', status: 'cancelled' }),
    ]).ok).toBe(true);
  });

  it('still counts a DRAFT', () => {
    // A draft is a settlement in progress. Ignoring it is how the same week gets built twice while
    // the first one is still being checked — the same reason `owed.ts` counts drafts as committed.
    const r = findPeriodOverlap({ from: '2026-08-10', to: '2026-08-16' }, [batch({ status: 'draft' })]);
    expect(r.ok).toBe(false);
    expect(r.message).toContain('draft');
  });

  it('ignores a settlement with no period attached', () => {
    // An ad-hoc payout with no week is a one-off correction, not a settlement of a period. Blocking
    // every future run because one exists would make the guard something people route around.
    expect(findPeriodOverlap({ from: '2026-08-10', to: '2026-08-16' }, [
      batch({ from: null, to: null, status: 'completed' }),
    ]).ok).toBe(true);
  });
});

describe('the sentence somebody reads', () => {
  it('names what it collided with, when, and what to do', () => {
    // "Conflict detected" leaves somebody guessing whether the week was paid — which is the only
    // question that matters.
    const r = findPeriodOverlap({ from: '2026-08-10', to: '2026-08-16' }, [
      batch({ label: 'Week of 10 Aug', status: 'completed' }),
    ]);
    expect(r.message).toContain('Week of 10 Aug');
    expect(r.message).toContain('2026-08-10');
    expect(r.message).toMatch(/twice/i);
    expect(r.message).toMatch(/void|narrow|one-off/i);
  });

  it('does not print a wall of text when many collide', () => {
    const many = Array.from({ length: 6 }, (_, i) => batch({ id: `b${i}` }));
    const r = findPeriodOverlap({ from: '2026-08-10', to: '2026-08-16' }, many);
    expect(r.conflicts).toHaveLength(6);
    expect(r.message).toContain('and 3 more');
  });
});

describe('a nonsense period', () => {
  it('refuses a range that runs backwards', () => {
    // Left unchecked, `from > to` overlaps nothing and would sail through the guard into an engine
    // that would then select no hours and pay everybody zero.
    const r = findPeriodOverlap({ from: '2026-08-16', to: '2026-08-10' }, [batch()]);
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/not a valid range/i);
  });

  it('refuses an empty date', () => {
    expect(findPeriodOverlap({ from: '', to: '2026-08-16' }, []).ok).toBe(false);
  });
});

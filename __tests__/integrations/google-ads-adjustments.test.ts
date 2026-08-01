// __tests__/integrations/google-ads-adjustments.test.ts — restatements and retractions. A9.
//
// The bid conversion is valued at the QUOTE, which is an estimate. This module is what makes that number
// eventually true. Every refusal it makes maps to a documented Google error we would otherwise earn.
import { describe, it, expect } from 'vitest';
import {
  planAdjustment, planAdjustments, windowSkipMetadata, WINDOW_SKIP_KEY, type AdjustmentInput,
} from '@/lib/integrations/google-ads/adjustments';

const base = (over: Partial<AdjustmentInput> = {}): AdjustmentInput => ({
  eventId: 'evt-1',
  orderId: 'job_created:evt-1',
  uploadedAction: 'customers/123/conversionActions/456',
  uploadedValueCents: 480_000,
  originalUploaded: true,
  currentValueCents: 520_000,
  clickAt: '2026-06-01T12:00:00.000Z',
  decidedAt: '2026-07-15T12:00:00.000Z',
  ...over,
});

const planned = (over: Partial<AdjustmentInput> = {}) => {
  const r = planAdjustment(base(over));
  if ('skip' in r) throw new Error(`expected an adjustment, got skip:${r.skip}`);
  return r;
};

describe('restatement — the invoice came in different from the quote', () => {
  it('restates upward, in dollars, against the ORIGINAL order id', () => {
    const { adjustment } = planned();
    expect(adjustment).toMatchObject({
      adjustmentType: 'RESTATEMENT',
      // Google matches on this exact string. A new order id would read as a brand new conversion and
      // double-count the job.
      orderId: 'job_created:evt-1',
      conversionAction: 'customers/123/conversionActions/456',
      restatementValue: 5200,
      currencyCode: 'USD',
    });
  });

  it('restates downward too — a job that invoiced under the quote', () => {
    expect(planned({ currentValueCents: 410_000 }).adjustment.restatementValue).toBe(4100);
  });

  it('restates to zero when the real amount really is zero', () => {
    // Distinct from a retraction: the conversion happened, it was worth nothing. Collapsing the two would
    // erase a job that did occur.
    const { adjustment } = planned({ currentValueCents: 0 });
    expect(adjustment.adjustmentType).toBe('RESTATEMENT');
    expect(adjustment.restatementValue).toBe(0);
  });

  it('stamps the time we DECIDED, not when the conversion happened', () => {
    expect(planned().adjustment.adjustmentDateTime)
      .toMatch(/^2026-07-15 \d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);
  });
});

describe('retraction — the job is gone', () => {
  it('retracts an explicitly cancelled job', () => {
    const { adjustment } = planned({ retracted: true });
    expect(adjustment.adjustmentType).toBe('RETRACTION');
  });

  it('retracts when the value became null', () => {
    expect(planned({ currentValueCents: null }).adjustment.adjustmentType).toBe('RETRACTION');
  });

  it('carries NO restatement value on a retraction', () => {
    // `restatementValue: 0` alongside RETRACTION is a different claim — "it happened and was worth
    // nothing" — and Google ignores it anyway.
    const { adjustment } = planned({ retracted: true });
    expect(adjustment).not.toHaveProperty('restatementValue');
    expect(adjustment).not.toHaveProperty('currencyCode');
  });

  it('retracts even when the value is unchanged', () => {
    // A cancelled job at the quoted figure is still cancelled. Checking "no change" first would keep a
    // dead conversion in the account forever.
    const { adjustment } = planned({ retracted: true, currentValueCents: 480_000 });
    expect(adjustment.adjustmentType).toBe('RETRACTION');
  });
});

describe('every refusal maps to a documented Google error', () => {
  it('refuses to adjust a conversion Google never accepted', () => {
    // CONVERSION_NOT_FOUND is guaranteed here, and the failure would look identical to a real problem.
    expect(planAdjustment(base({ originalUploaded: false }))).toEqual({ skip: 'not-uploaded' });
  });

  it('refuses when the conversion ACTION changed', () => {
    // "You cannot change the ConversionAction assigned to a conversion with an adjustment." That needs a
    // retraction plus a fresh upload, which is a different operation.
    expect(planAdjustment(base({ currentAction: 'customers/123/conversionActions/999' })))
      .toEqual({ skip: 'action-changed' });
  });

  it('does not send an adjustment when nothing changed', () => {
    // The common case — most jobs invoice at the quote. Nightly no-op restatements would bury the one
    // adjustment that failed.
    expect(planAdjustment(base({ currentValueCents: 480_000 }))).toEqual({ skip: 'no-change' });
  });

  it('treats a matching null-vs-null as a retraction, not a no-change', () => {
    const r = planAdjustment(base({ uploadedValueCents: null, currentValueCents: null }));
    expect('skip' in r ? r.skip : r.adjustment.adjustmentType).toBe('RETRACTION');
  });

  it('refuses outside the 90-day click window — G4, our books do not bend', () => {
    const r = planAdjustment(base({ decidedAt: '2026-10-01T12:00:00.000Z' }));
    expect(r).toEqual({ skip: 'out-of-window' });
  });

  it('checks not-uploaded BEFORE anything else', () => {
    // An un-uploaded conversion cannot be adjusted for any reason; reporting 'out-of-window' would send
    // someone looking at the wrong problem.
    expect(planAdjustment(base({ originalUploaded: false, decidedAt: '2026-10-01T12:00:00.000Z' })))
      .toEqual({ skip: 'not-uploaded' });
  });
});

describe('planAdjustments — the batch', () => {
  it('separates the sendable from the skipped, keeping the reason', () => {
    const plan = planAdjustments([
      base({ eventId: 'a' }),
      base({ eventId: 'b', originalUploaded: false }),
      base({ eventId: 'c', currentValueCents: 480_000 }),
      base({ eventId: 'd', retracted: true }),
    ]);
    expect(plan.adjustments.map((a) => a.eventId)).toEqual(['a', 'd']);
    expect(plan.skipped).toEqual([
      { eventId: 'b', reason: 'not-uploaded' },
      { eventId: 'c', reason: 'no-change' },
    ]);
  });

  it('does not re-send an adjustment already accepted', () => {
    const first = planAdjustments([base()]);
    const key = `evt-1:${first.adjustments[0].hash}`;
    const again = planAdjustments([base()], new Set([key]));
    expect(again.adjustments).toHaveLength(0);
    expect(again.skipped[0].reason).toBe('no-change');
  });

  it('DOES send when the number moved again after an earlier restatement', () => {
    // Change orders happen. A hash keyed only on the event would freeze the first correction in place.
    const first = planAdjustments([base()]);
    const key = `evt-1:${first.adjustments[0].hash}`;
    const moved = planAdjustments([base({ currentValueCents: 600_000 })], new Set([key]));
    expect(moved.adjustments).toHaveLength(1);
    expect(moved.adjustments[0].adjustment.restatementValue).toBe(6000);
  });

  it('returns empty for empty input rather than throwing', () => {
    expect(planAdjustments([])).toEqual({ adjustments: [], skipped: [] });
  });
});

describe('windowSkipMetadata — the discrepancy is queryable, not a mystery', () => {
  it('records BOTH numbers, not just the true one', () => {
    // The gap between what Google reports and what we billed is the point. Overwriting the reported
    // figure would hide exactly the fact this key exists to preserve.
    const meta = windowSkipMetadata({ uploadedValueCents: 480_000, currentValueCents: 620_000, decidedAt: '2026-10-01T12:00:00.000Z' });
    expect(meta[WINDOW_SKIP_KEY]).toMatchObject({ reportedCents: 480_000, actualCents: 620_000 });
    expect(WINDOW_SKIP_KEY).toBe('adjustment_skipped_window');
  });
});

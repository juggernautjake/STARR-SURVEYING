// __tests__/receipts/per-line-deductible.test.ts — P2.2b, and the property that made it shippable.
//
// The open question was: when lines carry their own treatment and the transcribed lines do not add
// up to the printed total — which they routinely do not — what does the receipt deduct?
//
// The answer chosen: **the printed total, apportioned by the share the lines say is claimable.** The
// printed total stays authoritative, which is what the approval queue tells the approver in as many
// words; the lines decide the SHARE, not the AMOUNT.
//
// The first test is the one that matters. Everything else is detail.

import { describe, it, expect } from 'vitest';
import {
  deductibleCents, deductibleCentsWithLines, claimableShareOfLines, type DeductibleLine,
} from '@/lib/finance/tax-summary';

const line = (cents: number, business: boolean | null = null, removed = false): DeductibleLine => ({
  amount_cents: cents,
  is_business_expense: business,
  removed_at: removed ? '2026-08-25T00:00:00Z' : null,
});

describe('nothing changes until somebody marks a line', () => {
  it('reproduces the old number exactly when no line is overridden', () => {
    // THE property. Every line inherits the receipt, the share collapses to 1, and the figure is
    // identical to what `deductibleCents` produced before this existed. A change to a tax report
    // that cannot alter an existing number until a person acts is the version that ships without a
    // reconciliation.
    const lines = [line(1000), line(2500), line(1499)];
    for (const flag of ['full', 'partial_50', 'none', 'review', null]) {
      expect(
        deductibleCentsWithLines(8419, flag, lines, true),
        `flag ${String(flag)} must not move`,
      ).toBe(deductibleCents(8419, flag));
    }
  });

  it('and when there are no lines at all', () => {
    // A fuel slip or a toll has none. "The AI read no lines off this" is not "none of it was
    // business", so the lines must not be able to zero a receipt by being absent.
    expect(deductibleCentsWithLines(8419, 'full', [], true)).toBe(deductibleCents(8419, 'full'));
    expect(claimableShareOfLines([], true)).toBeNull();
  });

  it('and when the lines carry no amounts, which is a transcription failure not a decision', () => {
    expect(claimableShareOfLines([line(0), line(0)], true)).toBeNull();
    expect(deductibleCentsWithLines(5000, 'full', [line(0)], true)).toBe(5000);
  });
});

describe('a marked line moves the number, proportionally', () => {
  it('halves the deduction when half the transcribed value is personal', () => {
    const lines = [line(5000, true), line(5000, false)];
    expect(claimableShareOfLines(lines, true)).toBe(0.5);
    // The printed total is 12000 even though the lines sum to 10000 — transcription is not
    // arithmetic. Half of the PRINTED total is what gets claimed, not half of the lines.
    expect(deductibleCentsWithLines(12000, 'full', lines, true)).toBe(6000);
  });

  it('and applies the receipt flag on top of the share, not instead of it', () => {
    // The composition that makes a per-line tax treatment unnecessary: business-vs-personal is
    // whether we may claim the line at all, the receipt flag is how much of a claimable amount is
    // deductible. 12000 × ½ claimable × 50% meals = 3000.
    const lines = [line(5000, true), line(5000, false)];
    expect(deductibleCentsWithLines(12000, 'partial_50', lines, true)).toBe(3000);
  });

  it('excludes a removed line from the claim but not from the receipt', () => {
    // A removed line is still on the record — struck through, with its reason — because that is the
    // reviewable half of the owner's ask. It must not count toward the claim.
    const lines = [line(3000), line(1000, null, true)];
    expect(claimableShareOfLines(lines, true)).toBe(0.75);
  });

  it('and a personal receipt claims nothing unless a line says otherwise', () => {
    expect(claimableShareOfLines([line(100), line(300)], false)).toBe(0);
    expect(claimableShareOfLines([line(100, true), line(300)], false)).toBe(0.25);
  });
});

describe('the arithmetic stays honest at the edges', () => {
  it('never deducts more than the receipt', () => {
    const lines = [line(9_999_999, true)];
    expect(deductibleCentsWithLines(10_000, 'full', lines, true)).toBeLessThanOrEqual(10_000);
  });

  it('rounds once, at the end', () => {
    // 1001 × ⅓ × 50% = 166.83… A second rounding in the middle would land somewhere else, and two
    // screens rounding differently is the discrepancy nobody can explain at filing time.
    const lines = [line(100, true), line(100, false), line(100, false)];
    expect(deductibleCentsWithLines(1001, 'partial_50', lines, true))
      .toBe(Math.round((1001 * (1 / 3)) * 0.5));
  });

  it('and ignores negative amounts rather than letting a refund invert the share', () => {
    // A refund line would otherwise make `claimable / total` exceed 1 or go negative.
    const share = claimableShareOfLines([line(1000, true), line(-500, true)], true);
    expect(share).toBe(1);
  });
});

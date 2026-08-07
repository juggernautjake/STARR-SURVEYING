// __tests__/finances/ad-spend-into-finances.test.ts
//
// Covers the two pieces that carry advertising from the Ads account into the books:
// the micros→cents boundary, and the double-count guard.
//
// Owner ask, 2026-08-07: *"We need to see exactly how much we are spending month to month and have
// that integrated into the website fully. We need it to be fully synced with our finances."*

import { describe, it, expect } from 'vitest';
import { microsToCents, MICROS_PER_UNIT } from '@/lib/integrations/google-ads/spend';
import {
  findSuspectedDuplicates,
  suspectedDuplicateTotal,
  looksLikeAdVendor,
  type ReceiptLike,
} from '@/lib/finances/ad-spend-reconcile';

describe('micros → cents', () => {
  it('converts the documented example exactly', () => {
    // $12.34 is the worked example in spend.ts. If this drifts, every total drifts with it.
    expect(microsToCents(12_340_000)).toBe(1234);
    expect(MICROS_PER_UNIT).toBe(1_000_000);
  });

  it('floors rather than rounds, so the books never lead the invoice', () => {
    // 1234.5 cents. Rounding up would report spend Google never charged; flooring under-reports by at
    // most a cent per row. Only one of those two directions is an unpleasant surprise.
    expect(microsToCents(12_345_000)).toBe(1234);
    expect(microsToCents(9_999)).toBe(0);
  });

  it('clamps credits and nonsense to zero', () => {
    // Google can report a credit as negative micros. A negative "expense" inside an outflow sum would
    // quietly inflate net profit — the error direction nobody reports.
    expect(microsToCents(-5_000_000)).toBe(0);
    expect(microsToCents(Number.NaN)).toBe(0);
    expect(microsToCents(Number.POSITIVE_INFINITY)).toBe(0);
    expect(microsToCents(0)).toBe(0);
  });

  it('survives a large month without precision loss', () => {
    // $250,000 in a month is far past this business, but int64 micros are why the parser keeps strings.
    expect(microsToCents(250_000 * MICROS_PER_UNIT)).toBe(25_000_000);
  });
});

describe('spotting an advertising charge that is already counted', () => {
  const receipt = (id: string, vendor: string | null, cents: number): ReceiptLike => ({
    id, vendor_name: vendor, total_cents: cents, transaction_at: '2026-07-15T10:00:00Z',
  });

  it('recognises how the charge actually appears on a statement', () => {
    for (const v of ['GOOGLE *ADS 8394', 'Google Ads', 'google adwords', 'GOOGLE*ADS']) {
      expect(looksLikeAdVendor(v), `"${v}" should look like an ad charge`).toBe(true);
    }
  });

  it('leaves ordinary vendors alone', () => {
    for (const v of ['Buc-ees', 'Home Depot', 'Lowes', 'Chevron', null, '']) {
      expect(looksLikeAdVendor(v)).toBe(false);
    }
  });

  it('flags a receipt that duplicates imported ad spend', () => {
    const dupes = findSuspectedDuplicates(
      [receipt('r1', 'GOOGLE *ADS 8394', 48_000), receipt('r2', 'Chevron', 9_000)],
      50_000,
    );
    expect(dupes).toHaveLength(1);
    expect(dupes[0].receipt_id).toBe('r1');
    expect(dupes[0].reason).toContain('counted twice');
    expect(suspectedDuplicateTotal(dupes)).toBe(48_000);
  });

  it('stays quiet when no ad spend was imported for the window', () => {
    // With nothing imported there is nothing to double-count, and an advertising receipt is just an
    // expense. Warning here would be a warning that fires when nothing is wrong — the kind people
    // learn to dismiss, which is how the real one gets ignored later.
    const dupes = findSuspectedDuplicates([receipt('r1', 'Google Ads', 48_000)], 0);
    expect(dupes).toEqual([]);
  });

  it('reports rather than removes', () => {
    // The match is a heuristic over free text somebody typed on a phone in a truck. Deleting a real
    // expense because a fuzzy match fired is worse than showing two numbers and a sentence — and it is
    // undetectable afterwards, because the receipt simply never appears in a total again.
    const receipts = [receipt('r1', 'Google Ads', 48_000)];
    const before = receipts.length;
    findSuspectedDuplicates(receipts, 50_000);
    expect(receipts).toHaveLength(before);
  });

  it('catches the other platforms too, so this does not need revisiting', () => {
    const dupes = findSuspectedDuplicates(
      [receipt('a', 'META PLATFORMS', 1000), receipt('b', 'Microsoft Advertising', 2000)],
      50_000,
    );
    expect(dupes.map((d) => d.receipt_id).sort()).toEqual(['a', 'b']);
  });
});

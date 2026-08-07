// __tests__/finances/duplicate-expenses.test.ts
//
// Owner ask: *"systems and checks in place that trigger alerts whenever it seems like
// receipt/expenditures are counted multiple times."*
//
// The hard part is not spotting two identical rows — it is not crying wolf. A firm that buys fuel at
// the same station twice in a month for the same round number is normal, and flagging that as high
// confidence teaches somebody to dismiss the alert, which takes the real ones with it.

import { describe, it, expect } from 'vitest';
import {
  findDuplicateExpenses,
  duplicateRiskTotal,
  type ReceiptForDuplicateCheck,
} from '@/lib/finances/duplicate-expenses';
import { looksLikeAdVendor } from '@/lib/finances/ad-spend-reconcile';

const r = (
  id: string,
  vendor: string | null,
  cents: number,
  date: string,
): ReceiptForDuplicateCheck => ({
  id, vendor_name: vendor, total_cents: cents, transaction_at: `${date}T10:00:00Z`,
});

describe('the same charge entered twice', () => {
  it('flags identical vendor and amount a day apart, with high confidence', () => {
    const f = findDuplicateExpenses([
      r('a', 'Chevron', 8_450, '2026-07-10'),
      r('b', 'Chevron', 8_450, '2026-07-11'),
    ]);
    expect(f).toHaveLength(1);
    expect(f[0].kind).toBe('same-charge-twice');
    expect(f[0].confidence).toBe('high');
    expect(f[0].receipt_ids.sort()).toEqual(['a', 'b']);
  });

  it('counts only the EXTRA copies as at risk, not the whole group', () => {
    // One of them is a real expense. Reporting $169 at risk on two $84.50 receipts would overstate
    // the problem and undermine the number the moment somebody checked it.
    const f = findDuplicateExpenses([
      r('a', 'Chevron', 8_450, '2026-07-10'),
      r('b', 'Chevron', 8_450, '2026-07-11'),
    ]);
    expect(f[0].total_cents).toBe(8_450);
    expect(duplicateRiskTotal(f)).toBe(8_450);
  });

  it('reports three prints of one charge as ONE finding naming three receipts', () => {
    // Not three overlapping pairs. Somebody reading an alert should see one situation.
    const f = findDuplicateExpenses([
      r('a', 'Home Depot', 12_000, '2026-07-10'),
      r('b', 'Home Depot', 12_000, '2026-07-10'),
      r('c', 'Home Depot', 12_000, '2026-07-11'),
    ]);
    expect(f).toHaveLength(1);
    expect(f[0].receipt_ids).toHaveLength(3);
    expect(f[0].total_cents).toBe(24_000);
  });

  it('normalises store numbers, which differ between two prints of one charge', () => {
    const f = findDuplicateExpenses([
      r('a', "Buc-ee's #12", 5_000, '2026-07-10'),
      r('b', 'BUC-EES 12', 5_000, '2026-07-10'),
    ]);
    expect(f).toHaveLength(1);
    expect(f[0].confidence).toBe('high');
  });
});

describe('what must NOT be flagged as high confidence', () => {
  it('leaves different vendors alone', () => {
    expect(findDuplicateExpenses([
      r('a', 'Chevron', 8_450, '2026-07-10'),
      r('b', 'Shell', 8_450, '2026-07-10'),
    ])).toEqual([]);
  });

  it('leaves different amounts alone', () => {
    expect(findDuplicateExpenses([
      r('a', 'Chevron', 8_450, '2026-07-10'),
      r('b', 'Chevron', 8_451, '2026-07-10'),
    ])).toEqual([]);
  });

  it('downgrades a same-vendor repeat further apart to low confidence', () => {
    // Fuel at the same station a week later for the same amount is ordinary. Worth surfacing,
    // not worth alarming about.
    const f = findDuplicateExpenses([
      r('a', 'Chevron', 8_450, '2026-07-01'),
      r('b', 'Chevron', 8_450, '2026-07-09'),
    ]);
    expect(f).toHaveLength(1);
    expect(f[0].kind).toBe('possible-re-entry');
    expect(f[0].confidence).toBe('low');
  });

  it('does not chain a monthly vendor into one giant finding', () => {
    // Same amount at the same vendor once a month all year is a standing charge, not twelve
    // duplicates. Gaps beyond the window cut the run.
    const f = findDuplicateExpenses([
      r('a', 'Verizon', 9_900, '2026-01-05'),
      r('b', 'Verizon', 9_900, '2026-02-05'),
      r('c', 'Verizon', 9_900, '2026-03-05'),
    ]);
    expect(f).toEqual([]);
  });

  it('ignores receipts with no vendor name', () => {
    // Matching two unnamed rows on amount alone would invent a match out of a blank field.
    expect(findDuplicateExpenses([
      r('a', null, 5_000, '2026-07-10'),
      r('b', '', 5_000, '2026-07-10'),
    ])).toEqual([]);
  });

  it('returns nothing for an empty ledger', () => {
    expect(findDuplicateExpenses([])).toEqual([]);
  });
});

describe('advertising counted from two sources', () => {
  it('flags an ad receipt when ad spend was also imported', () => {
    const f = findDuplicateExpenses(
      [r('a', 'GOOGLE *ADS 8394', 48_000, '2026-07-15')],
      { adSpendCents: 50_000, isAdVendor: looksLikeAdVendor },
    );
    expect(f).toHaveLength(1);
    expect(f[0].kind).toBe('cross-source-advertising');
  });

  it('stays quiet when no ad spend was imported', () => {
    const f = findDuplicateExpenses(
      [r('a', 'Google Ads', 48_000, '2026-07-15')],
      { adSpendCents: 0, isAdVendor: looksLikeAdVendor },
    );
    expect(f).toEqual([]);
  });
});

describe('the alert ledger can rely on the key', () => {
  it('produces the same key whatever order the rows arrive in', () => {
    // `a|b` and `b|a` are one situation. An unsorted key alerts twice — once in whichever order the
    // query happened to return — and the dedupe ledger cannot help.
    const forward = findDuplicateExpenses([
      r('a', 'Chevron', 8_450, '2026-07-10'),
      r('b', 'Chevron', 8_450, '2026-07-11'),
    ]);
    const reverse = findDuplicateExpenses([
      r('b', 'Chevron', 8_450, '2026-07-11'),
      r('a', 'Chevron', 8_450, '2026-07-10'),
    ]);
    expect(forward[0].dedupe_key).toBe(reverse[0].dedupe_key);
  });

  it('gives different situations different keys', () => {
    const f = findDuplicateExpenses([
      r('a', 'Chevron', 8_450, '2026-07-10'),
      r('b', 'Chevron', 8_450, '2026-07-11'),
      r('c', 'Home Depot', 3_000, '2026-07-10'),
      r('d', 'Home Depot', 3_000, '2026-07-10'),
    ]);
    expect(new Set(f.map((x) => x.dedupe_key)).size).toBe(f.length);
  });

  it('puts the biggest actionable finding first', () => {
    const f = findDuplicateExpenses([
      r('a', 'Small Co', 1_000, '2026-07-10'),
      r('b', 'Small Co', 1_000, '2026-07-10'),
      r('c', 'Big Co', 90_000, '2026-07-10'),
      r('d', 'Big Co', 90_000, '2026-07-10'),
    ]);
    expect(f[0].vendor).toBe('Big Co');
  });
});

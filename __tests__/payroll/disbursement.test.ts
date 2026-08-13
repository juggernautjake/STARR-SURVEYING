// __tests__/payroll/disbursement.test.ts
//
// "What this payment settles" and "what actually goes out" were the same number until a pay advance
// could be recovered from a payout batch. The whole point of this module is that they are now two,
// and that only one of them is stored.
import { describe, it, expect } from 'vitest';
import {
  disbursedCents, totalDisbursedCents, totalRecoveredCents, describeRecovery,
} from '@/lib/payroll/disbursement';

describe('the ordinary payout, where nothing is withheld', () => {
  it('sends the whole total', () => {
    expect(disbursedCents({ total_cents: 100_000, recovered_cents: 0 })).toBe(100_000);
  });

  it('treats a missing recovery as zero', () => {
    // Every row written before seed 588, and every row written by a path that does not recover.
    expect(disbursedCents({ total_cents: 100_000 })).toBe(100_000);
    expect(disbursedCents({ total_cents: 100_000, recovered_cents: null })).toBe(100_000);
  });

  it('says nothing on the row', () => {
    // A note reading "$0.00 was withheld" on every ordinary payout is a note people stop reading
    // before they reach the one that matters.
    expect(describeRecovery({ total_cents: 100_000, recovered_cents: 0 })).toBeNull();
    expect(describeRecovery({ total_cents: 100_000 })).toBeNull();
  });
});

describe('the case the column exists for', () => {
  const item = { total_cents: 100_000, recovered_cents: 20_000 };

  it('sends the total minus the recovery', () => {
    expect(disbursedCents(item)).toBe(80_000);
  });

  it('leaves the settled total alone — this is the bug that cannot be seen once made', () => {
    // Subtracting the recovery from `total_cents` at build time looks right on every screen and is
    // wrong in the ledger: `owed` counts `total_cents` as paid, so $800 against $1,000 of earnings
    // leaves the person owed $200 for ever and the firm hands the advance straight back.
    expect(item.total_cents, 'total_cents must remain what the payment settles').toBe(100_000);
  });

  it('explains itself on the row, with all three figures', () => {
    const line = describeRecovery(item)!;
    expect(line).toContain('$1000.00');
    expect(line).toContain('$200.00');
    expect(line).toContain('$800.00');
    expect(line).toMatch(/pay advance/i);
  });
});

describe('amounts that must never reach a payment rail', () => {
  it('never returns a negative disbursement', () => {
    // The database CHECK forbids `recovered_cents > total_cents`; this is the belt to that braces.
    // A screen rendering "-$40.00 to send" is worse than one rendering "$0.00", because somebody
    // might try to action it.
    expect(disbursedCents({ total_cents: 10_000, recovered_cents: 14_000 })).toBe(0);
  });

  it('ignores a negative recovery rather than paying it out twice', () => {
    // A negative recovery would ADD to the disbursement — paying somebody their own debt again.
    expect(disbursedCents({ total_cents: 10_000, recovered_cents: -5_000 })).toBe(10_000);
    expect(totalRecoveredCents([{ total_cents: 10_000, recovered_cents: -5_000 }])).toBe(0);
  });

  it('survives unreadable figures without inventing money', () => {
    expect(disbursedCents({ total_cents: Number.NaN, recovered_cents: 100 })).toBe(0);
    expect(disbursedCents({ total_cents: 5_000, recovered_cents: Number.NaN })).toBe(5_000);
  });

  it('works in whole cents', () => {
    // Fractional cents cannot be sent, and a rounding disagreement between the total and the
    // disbursement is a payment that is off by a penny with no explanation.
    const out = disbursedCents({ total_cents: 10_000.4, recovered_cents: 3_333.6 });
    expect(Number.isInteger(out)).toBe(true);
    expect(out).toBe(6_666);
  });
});

describe('across a batch', () => {
  const items = [
    { total_cents: 100_000, recovered_cents: 20_000 },
    { total_cents: 50_000, recovered_cents: 0 },
    { total_cents: 25_000 },
  ];

  it('totals what the bank account pays out', () => {
    expect(totalDisbursedCents(items)).toBe(155_000);
  });

  it('totals what stayed with the firm', () => {
    expect(totalRecoveredCents(items)).toBe(20_000);
  });

  it('the two together equal what the batch settles', () => {
    // The invariant worth stating: nothing is lost between the hours and the bank.
    const settled = items.reduce((s, i) => s + (i.total_cents ?? 0), 0);
    expect(totalDisbursedCents(items) + totalRecoveredCents(items)).toBe(settled);
  });

  it('is zero for an empty batch rather than NaN', () => {
    expect(totalDisbursedCents([])).toBe(0);
    expect(totalRecoveredCents([])).toBe(0);
  });
});

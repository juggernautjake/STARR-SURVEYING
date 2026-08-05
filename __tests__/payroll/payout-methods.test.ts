// __tests__/payroll/payout-methods.test.ts
//
// One vocabulary for "how was this paid". Before this there were three, and they disagreed in a way
// that lost payments: a payout recorded as `check` reached a batch whose dispatch grouping had no
// `check`, so it fell into `unassigned` and the office saw a payment with no method.

import { describe, it, expect } from 'vitest';
import {
  PAYOUT_METHODS,
  PAYOUT_METHOD_INFO,
  isPayoutMethod,
  normalizePayoutMethod,
  payoutMethodLabel,
  groupByMethod,
} from '@/lib/payouts/methods';

describe('the vocabulary covers what the firm actually does', () => {
  it('includes the four the owner named', () => {
    for (const m of ['cash', 'check', 'venmo', 'cashapp']) {
      expect(isPayoutMethod(m), `${m} must be payable`).toBe(true);
    }
  });

  it('keeps zelle, ach and other', () => {
    expect(isPayoutMethod('zelle')).toBe(true);
    expect(isPayoutMethod('ach')).toBe(true);
    // `other` is deliberate: a method squeezed into a wrong bucket is how a ledger stops matching
    // reality.
    expect(isPayoutMethod('other')).toBe(true);
  });

  it('does NOT offer stripe — nothing can send through it', () => {
    // Offering a method with no rail behind it lets somebody record a payment that cannot be made.
    expect(isPayoutMethod('stripe')).toBe(false);
  });

  it('describes every method it offers', () => {
    // A method with no guidance is a form field nobody fills in correctly.
    for (const m of PAYOUT_METHODS) {
      const info = PAYOUT_METHOD_INFO[m];
      expect(info, m).toBeTruthy();
      expect(info.label.length, m).toBeGreaterThan(0);
      expect(info.referenceLabel.length, m).toBeGreaterThan(0);
      expect(info.note.length, m).toBeGreaterThan(0);
    }
  });

  it('claims no method sends itself', () => {
    // The distinction the whole payout system rests on: recording a payment is not making one. The
    // day a real rail is connected, this flag is where it gets declared rather than assumed.
    for (const m of PAYOUT_METHODS) {
      expect(PAYOUT_METHOD_INFO[m].sendsItself, `${m} must not claim to send itself`).toBe(false);
    }
  });
});

describe('historical spellings are translated, not dropped', () => {
  it('maps direct_deposit onto ach', () => {
    // It was a synonym in a list nothing ever wrote to.
    expect(normalizePayoutMethod('direct_deposit')).toBe('ach');
    expect(normalizePayoutMethod('Direct Deposit')).toBe('ach');
  });

  it('maps stripe and card onto other, since neither had a rail', () => {
    expect(normalizePayoutMethod('stripe')).toBe('other');
    expect(normalizePayoutMethod('card')).toBe('other');
  });

  it('tolerates spacing and case', () => {
    expect(normalizePayoutMethod('Cash App')).toBe('cashapp');
    expect(normalizePayoutMethod('  CHECK ')).toBe('check');
    expect(normalizePayoutMethod('cheque')).toBe('check');
  });

  it('returns null for something genuinely unknown rather than guessing', () => {
    // Guessing puts a payment in the wrong column of a report somebody reconciles against a bank
    // statement.
    expect(normalizePayoutMethod('carrier pigeon')).toBeNull();
    expect(normalizePayoutMethod(null)).toBeNull();
    expect(normalizePayoutMethod(42)).toBeNull();
  });

  it('never renders a raw database value on a screen', () => {
    expect(payoutMethodLabel('cashapp')).toBe('Cash App');
    expect(payoutMethodLabel('direct_deposit')).toBe('ACH / direct deposit');
    expect(payoutMethodLabel('nonsense')).toBe('Method not recorded');
  });
});

describe('grouping for the office', () => {
  const items = [
    { id: 1, method: 'check' },
    { id: 2, method: 'cash' },
    { id: 3, method: 'venmo' },
    { id: 4, method: 'direct_deposit' },
    { id: 5, method: 'carrier pigeon' },
    { id: 6, method: null },
  ];

  it('puts check in its own bucket instead of losing it', () => {
    // THE BUG. `check` was valid to record and absent from the grouping type, so it vanished into
    // `unassigned` and the office saw a payment with no method.
    const g = groupByMethod(items);
    expect(g.check.map((i) => i.id)).toEqual([1]);
  });

  it('translates a retired spelling into the right bucket', () => {
    expect(groupByMethod(items).ach.map((i) => i.id)).toEqual([4]);
  });

  it('keeps genuinely unknown methods visible rather than folding them into other', () => {
    // `other` is a choice somebody made. An unrecognised value is not the same thing, and merging
    // them would hide bad data inside a legitimate category.
    const g = groupByMethod(items);
    expect(g.unassigned.map((i) => i.id).sort()).toEqual([5, 6]);
    expect(g.other).toEqual([]);
  });

  it('gives every method a bucket even when empty, so the screen is a stable checklist', () => {
    const g = groupByMethod([]);
    for (const m of PAYOUT_METHODS) expect(g[m], m).toEqual([]);
    expect(g.unassigned).toEqual([]);
  });

  it('loses nothing', () => {
    const g = groupByMethod(items);
    const total = Object.values(g).reduce((n, list) => n + list.length, 0);
    expect(total).toBe(items.length);
  });
});

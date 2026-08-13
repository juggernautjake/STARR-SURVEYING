// __tests__/receipts/same-purchase.test.ts
//
// Owner, 2026-08-13: *"I think I added two receipts for texas roadhouse… one that is $100 and one
// that is $84.34, but really they are for the same meal… so that we don't count the purchase twice."*
//
// The pair below is REAL — both rows were in the database when this was written, and the existing
// duplicate check could not see them: `computeDedupFingerprint` is vendor|total|date, and the totals
// differ by the tip. Every figure here is copied from those two rows.
import { describe, it, expect } from 'vitest';
import { detectSamePurchase, findSamePurchase, type ComparableReceipt } from '@/lib/receipts/same-purchase';

/** The itemised bill: 7791 food + 643 tax = 8434. Timestamped 23:59. */
const BILL: ComparableReceipt = {
  id: 'bill',
  vendor_name: 'Texas Roadhouse',
  transaction_at: '2026-08-11T23:59:00+00:00',
  subtotal_cents: 7791,
  tax_cents: 643,
  tip_cents: 0,
  total_cents: 8434,
  created_at: '2026-08-12T22:25:18Z',
};

/** The card slip: subtotal 8434 (the whole bill) + 1566 handwritten = 10000. Timestamped 00:04. */
const SLIP: ComparableReceipt = {
  id: 'slip',
  vendor_name: 'Texas Roadhouse',
  transaction_at: '2026-08-12T00:04:38+00:00',
  subtotal_cents: 8434,
  tax_cents: null,
  tip_cents: 1566,
  total_cents: 10000,
  created_at: '2026-08-12T22:40:00Z',
};

describe('the owner’s meal', () => {
  it('recognises the bill and the card slip as one purchase', () => {
    const m = detectSamePurchase(BILL, SLIP)!;
    expect(m).not.toBeNull();
    expect(m.kind).toBe('bill_and_slip');
  });

  it('counts the slip, because that is what left the account', () => {
    // $100.00 was charged. $84.34 never left anything. Counting both doubles the meal.
    const m = detectSamePurchase(BILL, SLIP)!;
    expect(m.countId).toBe('slip');
    expect(m.supersededId).toBe('bill');
  });

  it('gives the same answer whichever order they arrive in', () => {
    // The capture order is an accident of which photo was taken first.
    const forward = detectSamePurchase(BILL, SLIP)!;
    const backward = detectSamePurchase(SLIP, BILL)!;
    expect(backward.countId).toBe(forward.countId);
    expect(backward.supersededId).toBe(forward.supersededId);
  });

  it('explains itself with both figures and the tip', () => {
    const m = detectSamePurchase(BILL, SLIP)!;
    expect(m.reason).toContain('$84.34');
    expect(m.reason).toContain('$100.00');
    expect(m.reason).toContain('$15.66');
    expect(m.reason).toMatch(/tip line/i);
  });

  it('is certain, because the arithmetic can only mean one thing', () => {
    expect(detectSamePurchase(BILL, SLIP)!.confidence).toBe('certain');
  });

  it('matches across midnight, which a same-day rule would have missed', () => {
    // The real pair is stamped 23:59 and 00:04 — five minutes apart, different dates. This is the
    // exact case a calendar-day comparison fails on.
    expect(BILL.transaction_at!.slice(0, 10)).not.toBe(SLIP.transaction_at!.slice(0, 10));
    expect(detectSamePurchase(BILL, SLIP)).not.toBeNull();
  });
});

describe('what must NOT be called the same purchase', () => {
  it('two different meals at the same restaurant on different evenings', () => {
    const other = { ...SLIP, id: 'other', transaction_at: '2026-08-19T19:30:00Z' };
    expect(detectSamePurchase(BILL, other)).toBeNull();
  });

  it('the same amounts at a different vendor', () => {
    expect(detectSamePurchase(BILL, { ...SLIP, id: 'x', vendor_name: 'Chili’s' })).toBeNull();
  });

  it('a receipt against itself', () => {
    expect(detectSamePurchase(BILL, BILL)).toBeNull();
  });

  it('a slip that settles LESS than the bill', () => {
    // Not a settlement of it — more likely a partial payment or a different purchase entirely.
    const short = { ...SLIP, id: 'short', total_cents: 5000, subtotal_cents: 8434 };
    expect(detectSamePurchase(BILL, short)).toBeNull();
  });

  it('receipts with no vendor on either side', () => {
    expect(detectSamePurchase({ id: 'a', total_cents: 8434 }, { id: 'b', subtotal_cents: 8434 })).toBeNull();
  });
});

describe('the same receipt photographed twice', () => {
  const first = { ...BILL, id: 'first' };
  const again = { ...BILL, id: 'again', created_at: '2026-08-12T22:50:00Z' };

  it('is flagged, counting the one that arrived first', () => {
    const m = detectSamePurchase(first, again)!;
    expect(m.kind).toBe('duplicate_photo');
    expect(m.countId).toBe('first');
    expect(m.supersededId).toBe('again');
  });

  it('is never CERTAIN, because two $5 coffees are both real', () => {
    // This is where an over-confident merge silently loses an expense, so it always asks.
    expect(detectSamePurchase(first, again)!.confidence).toBe('likely');
    expect(detectSamePurchase(first, again)!.reason).toMatch(/two separate purchases/i);
  });

  it('does not swallow a bill-and-slip pair whose tip happened to be zero', () => {
    // A slip signed for the exact bill total has the same total as its bill. Calling that a
    // re-photograph would discard the itemisation, which is the only record of the tax.
    const zeroTipSlip = { ...SLIP, id: 'zero', subtotal_cents: 8434, tip_cents: 0, total_cents: 8434 };
    expect(detectSamePurchase(BILL, zeroTipSlip)!.kind).toBe('bill_and_slip');
  });
});

describe('searching the receipts already on file', () => {
  const OTHERS = [
    { id: 'unrelated', vendor_name: 'Buc-ee’s', total_cents: 4210, transaction_at: '2026-08-11T18:00:00Z' },
    BILL,
  ];

  it('finds the bill when the slip is uploaded second', () => {
    const m = findSamePurchase(SLIP, OTHERS)!;
    expect(m.supersededId).toBe('bill');
    expect(m.countId).toBe('slip');
  });

  it('returns nothing for a genuinely new receipt', () => {
    const fresh = { id: 'new', vendor_name: 'Home Depot', total_cents: 1899, transaction_at: '2026-08-12T10:00:00Z' };
    expect(findSamePurchase(fresh, OTHERS)).toBeNull();
  });

  it('prefers an arithmetic pair over a guess about somebody’s afternoon', () => {
    // A bill-and-slip match is a fact; a duplicate-photo match is a suspicion. When both are
    // available the fact wins.
    const twin = { ...SLIP, id: 'twin', created_at: '2026-08-12T23:00:00Z' };
    const m = findSamePurchase(SLIP, [twin, BILL])!;
    expect(m.kind).toBe('bill_and_slip');
  });
});

// __tests__/receipts/duplicates.test.ts
//
// Fixtures are shaped on the live receipts as of 2026-10-06 (53 receipts, 3 people). The rules were
// calibrated against all 1,378 real pairs (0 flagged — there are no true duplicates yet) and 150
// synthetic re-photographs of real receipts (143 caught). These pin the cases that decided the rules.

import { describe, it, expect } from 'vitest';
import { compareReceipts, comparePlace, itemOverlap, type DupReceipt } from '@/lib/receipts/duplicates';
import { implausibleDateFlag } from '@/lib/receipts/date-sanity';
import { receiptInstant } from '@/worker/src/services/receipt-extraction-core';

const r = (over: Partial<DupReceipt> & { id: string }): DupReceipt => ({
  user_id: 'u1', vendor_name: 'CEFCO #18', transaction_at: '2026-08-20T12:00:00Z', total_cents: 903,
  payment_last4: '5054', receipt_number: null, photo_url: null, items: [], ...over,
});
const coffee = [{ description: 'ICE BAGGED', amount_cents: 329 }, { description: 'RDBULL 12OZ', amount_cents: 429 }];

describe('never flags the ordinary week', () => {
  it('two people, same $8.20 at the same chain, three days apart, different receipt numbers', () => {
    const a = r({ id: 'a', vendor_name: '436 cefco belton', total_cents: 820, transaction_at: '2026-09-25T12:00:00Z', receipt_number: '375434', items: coffee });
    const b = r({ id: 'b', user_id: 'u2', vendor_name: 'Cefco', total_cents: 820, transaction_at: '2026-09-28T12:00:00Z', receipt_number: '378330', items: coffee });
    expect(compareReceipts(a, b)).toBeNull();
  });

  it('the same coffee on different days is a habit, not a misread date', () => {
    const a = r({ id: 'a', items: coffee, receipt_number: null });
    const b = r({ id: 'b', transaction_at: '2026-08-14T12:00:00Z', items: coffee, receipt_number: null });
    expect(compareReceipts(a, b)).toBeNull();
  });

  it('both printed receipt numbers and they differ: two transactions', () => {
    expect(compareReceipts(r({ id: 'a', receipt_number: '327732' }), r({ id: 'b', receipt_number: '321530' }))).toBeNull();
  });

  it('a few cents apart on DIFFERENT days is a different purchase', () => {
    expect(compareReceipts(r({ id: 'a' }), r({ id: 'b', total_cents: 900, transaction_at: '2026-08-21T12:00:00Z' }))).toBeNull();
  });

  it('different places', () => {
    expect(compareReceipts(r({ id: 'a', vendor_name: "Casey's Gas Station", total_cents: 357 }), r({ id: 'b', vendor_name: 'Cefco', total_cents: 357 }))).toBeNull();
  });
});

describe('always catches the same paper filed twice', () => {
  it('same receipt number and total — certain, even across employees', () => {
    const v = compareReceipts(r({ id: 'a', receipt_number: '327732' }), r({ id: 'b', user_id: 'u2', receipt_number: '327732' }));
    expect(v?.confidence).toBe('certain');
    expect(v?.reasons.join(' ')).toMatch(/two different people/);
  });

  it('same photo file — certain', () => {
    expect(compareReceipts(r({ id: 'a', photo_url: 'x.jpg' }), r({ id: 'b', photo_url: 'x.jpg', total_cents: 1 }))?.confidence).toBe('certain');
  });

  it('a re-photograph the AI read slightly differently: same day, total 3¢ off, items the same', () => {
    const v = compareReceipts(r({ id: 'a', items: coffee }), r({ id: 'b', total_cents: 906, vendor_name: 'GEFCO', items: coffee }));
    expect(v).not.toBeNull();
    expect(v!.reasons[0]).toMatch(/3¢ apart/);
  });

  it('a misread YEAR (2026 read as 2017) with the same month and day', () => {
    const v = compareReceipts(r({ id: 'a', transaction_at: '2017-08-20T12:00:00Z' }), r({ id: 'b' }));
    expect(v?.confidence).toBe('likely');
    expect(v!.reasons[0]).toMatch(/year was probably misread/);
  });

  it('same day, same place and total, but printed hours apart — flagged, but downgraded', () => {
    const v = compareReceipts(r({ id: 'a', transaction_at: '2026-08-20T13:10:00Z' }), r({ id: 'b', transaction_at: '2026-08-20T18:40:00Z' }));
    expect(v?.confidence ?? 'possible').not.toBe('certain');
  });
});

describe('the pieces', () => {
  it('place names allow store numbers, case and a one-letter misread', () => {
    expect(comparePlace('CEFCO #18', 'Cefco Belton')).not.toBe('different');
    expect(comparePlace('GEFCO', 'CEFCO')).toBe('same');
    expect(comparePlace('Chick-fil-A', 'Chik-fil-A')).toBe('same');
    expect(comparePlace('Burger King', 'Whataburger')).toBe('different');
  });
  it('items match one-to-one at the same price', () => {
    expect(itemOverlap(coffee, coffee)).toBe(1);
    expect(itemOverlap(coffee, [coffee[0]])).toBeCloseTo(2 / 3);
    expect(itemOverlap([], coffee)).toBeNull();
  });
});

describe('receipt dates land on the printed day', () => {
  it('a bare date is noon UTC, not midnight (which is the previous evening in Texas)', () => {
    expect(receiptInstant('2026-09-24')).toBe('2026-09-24T12:00:00.000Z');
  });
  it('a printed time with no zone is Central', () => {
    expect(receiptInstant('2026-09-24T19:30')).toBe('2026-09-25T00:30:00.000Z'); // CDT, UTC−5
    expect(receiptInstant('2026-01-15T08:00')).toBe('2026-01-15T14:00:00.000Z'); // CST, UTC−6
  });
  it('a zoned value is kept as written', () => {
    expect(receiptInstant('2026-09-24T19:30:00Z')).toBe('2026-09-24T19:30:00.000Z');
  });
  it('a year that cannot be right is flagged, not rewritten', () => {
    expect(implausibleDateFlag('2017-08-17T12:00:00Z', '2026-08-17T14:00:00Z')).toMatch(/year was probably misread/);
    expect(implausibleDateFlag('2026-08-16T12:00:00Z', '2026-08-17T14:00:00Z')).toBeNull();
  });
});

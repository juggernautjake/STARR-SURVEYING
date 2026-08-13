// __tests__/receipts/pair-sweep.test.ts
//
// The sweep exists because the two receipts the owner reported were extracted days before the
// pairing was written, and nothing was ever going to extract them again. These tests are about the
// one rule that is easy to get wrong when pairing a whole table at once: a receipt can take part in
// exactly one pairing.
import { describe, it, expect } from 'vitest';
import { planPairings } from '@/lib/receipts/pair-sweep';
import type { ComparableReceipt } from '@/lib/receipts/same-purchase';

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

const UNRELATED: ComparableReceipt = {
  id: 'fuel',
  vendor_name: 'Buc-ee’s',
  transaction_at: '2026-08-11T18:00:00Z',
  total_cents: 4210,
  created_at: '2026-08-11T18:05:00Z',
};

describe('sweeping receipts already on file', () => {
  it('links the pair the owner reported', () => {
    const plan = planPairings([UNRELATED, BILL, SLIP]);
    expect(plan).toHaveLength(1);
    expect(plan[0].supersededId).toBe('bill');
    expect(plan[0].countId).toBe('slip');
    expect(plan[0].kind).toBe('bill_and_slip');
  });

  it('leaves an unrelated receipt alone', () => {
    const ids = planPairings([UNRELATED, BILL, SLIP]).flatMap((p) => [p.supersededId, p.countId]);
    expect(ids).not.toContain('fuel');
  });

  it('writes nothing when there is nothing to pair', () => {
    expect(planPairings([UNRELATED])).toEqual([]);
    expect(planPairings([])).toEqual([]);
  });

  it('never spends one receipt on two pairings', () => {
    // Bill, slip, and a re-photograph of the slip. Chaining these would make the slip both counted
    // (by the bill's link) and superseded (by the copy's), and the middle of a chain is where a
    // double count comes back from the other end.
    const copy = { ...SLIP, id: 'slip-again', created_at: '2026-08-12T23:10:00Z' };
    const plan = planPairings([BILL, SLIP, copy]);
    const used = plan.flatMap((p) => [p.supersededId, p.countId]);
    expect(new Set(used).size).toBe(used.length);
  });

  it('is a no-op on a second run, because paired rows are never candidates', () => {
    // The sweep query filters `superseded_by_receipt_id IS NULL`, so the second run sees only the
    // counted row. Nothing pairs with itself.
    const remaining = planPairings([SLIP, UNRELATED]);
    expect(remaining).toEqual([]);
  });

  it('gives the same plan whatever order the rows arrive in', () => {
    const a = planPairings([BILL, SLIP]);
    const b = planPairings([SLIP, BILL]);
    expect(b[0].supersededId).toBe(a[0].supersededId);
    expect(b[0].countId).toBe(a[0].countId);
  });

  it('carries a sentence a bookkeeper can act on', () => {
    expect(planPairings([BILL, SLIP])[0].reason).toMatch(/only the slip is counted/i);
  });
});

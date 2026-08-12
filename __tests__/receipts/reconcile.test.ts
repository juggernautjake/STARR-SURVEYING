// __tests__/receipts/reconcile.test.ts
//
// The arithmetic check that stopped being the model's job.
//
// Both cases below are REAL, from one meal on 2026-08-12, and they are why this exists in code:
//
//   * the card slip     — subtotal 8434, no printed tip, total 10000. The gratuity was handwritten
//     after the slip printed. Inferring it is the owner's explicit request.
//   * the itemised bill — subtotal 7791 + tax 643 = 8434, which IS the printed total. The model added
//     a $6.00 tip anyway, making its own figures sum to 9034 against a total of 8434, and raised no
//     flag despite the prompt telling it to.
//
// One meal, both failure directions, in the first real test. Subtraction settles it.
import { describe, it, expect } from 'vitest';
import { reconcileAmounts } from '@/lib/receipts/reconcile';

describe('the owner’s case: a tip that was never printed', () => {
  it('infers the gratuity from the gap', () => {
    // "if a receipt has a cost of $85.00, and then the total that is written is $100.00, that probably
    // means that there was a $15 tip, even if the tip is not explicitly added"
    const r = reconcileAmounts({ subtotal_cents: 8500, tax_cents: 0, total_cents: 10000, category: 'meals' });
    expect(r.outcome).toBe('tip_inferred');
    expect(r.tipCents).toBe(1500);
    expect(r.flag).toContain('$15.00');
  });

  it('reproduces the real Texas Roadhouse card slip', () => {
    const r = reconcileAmounts({ subtotal_cents: 8434, tax_cents: null, total_cents: 10000, category: 'meals' });
    expect(r.outcome).toBe('tip_inferred');
    expect(r.tipCents).toBe(1566);
  });

  it('says the tip was inferred rather than presenting it as printed', () => {
    // A number the machine derived must be visibly derived — a bookkeeper approving a gratuity should
    // know nobody read it off the paper.
    const r = reconcileAmounts({ subtotal_cents: 8500, tax_cents: 0, total_cents: 10000, category: 'meals' });
    expect(r.flag).toMatch(/inferred/i);
    expect(r.flag).toMatch(/confirm/i);
  });
});

describe('the real defect: a tip the model invented', () => {
  it('removes a tip when the receipt already balances without it', () => {
    // The itemised bill. 7791 + 643 = 8434 = total, so a $6 tip cannot be real.
    const r = reconcileAmounts({ subtotal_cents: 7791, tax_cents: 643, tip_cents: 600, total_cents: 8434, category: 'meals' });
    expect(r.outcome).toBe('spurious_tip');
    expect(r.tipCents, 'the invented tip must be cleared, not merely flagged').toBe(0);
    expect(r.flag).toContain('$6.00');
    expect(r.flag).toContain('$84.34');
  });
});

describe('gaps that must NOT become tips', () => {
  it('does not invent a gratuity at a fuel pump', () => {
    // A "tip" on a fuel slip is a misread. Inferring one would launder an error into a number.
    const r = reconcileAmounts({ subtotal_cents: 5000, tax_cents: 0, total_cents: 5731, category: 'fuel' });
    expect(r.outcome).toBe('mismatch');
    expect(r.tipCents).toBeNull();
    expect(r.flag).toMatch(/do not add up/i);
  });

  it('rejects a gap far too large to be a gratuity', () => {
    // 200% of the subtotal is a second transaction or a misread digit, not generosity.
    const r = reconcileAmounts({ subtotal_cents: 1000, tax_cents: 0, total_cents: 3000, category: 'meals' });
    expect(r.outcome).toBe('mismatch');
  });

  it('rejects a gap far too small to be a gratuity', () => {
    const r = reconcileAmounts({ subtotal_cents: 10000, tax_cents: 0, total_cents: 10010, category: 'meals' });
    expect(r.outcome).toBe('mismatch');
  });

  it('never silently rewrites a subtotal or a total to make things balance', () => {
    const r = reconcileAmounts({ subtotal_cents: 5000, tax_cents: 400, total_cents: 9000, category: 'supplies' });
    expect(r.outcome).toBe('mismatch');
    expect(r.tipCents).toBeNull();
    // Both figures appear so the bookkeeper can see the disagreement without opening the photo.
    expect(r.flag).toContain('$54.00');
    expect(r.flag).toContain('$90.00');
  });
});

describe('receipts that are simply fine, or simply unreadable', () => {
  it('says nothing when the figures add up', () => {
    const r = reconcileAmounts({ subtotal_cents: 1000, tax_cents: 83, total_cents: 1083 });
    expect(r.outcome).toBe('balanced');
    expect(r.flag).toBeNull();
    expect(r.tipCents).toBeNull();
  });

  it('tolerates a one-cent rounding difference', () => {
    // Receipts round their own tax; chasing a penny would flag good receipts forever.
    expect(reconcileAmounts({ subtotal_cents: 1000, tax_cents: 83, total_cents: 1084 }).outcome).toBe('balanced');
  });

  it('accepts a printed tip that balances', () => {
    const r = reconcileAmounts({ subtotal_cents: 8434, tax_cents: 0, tip_cents: 1566, total_cents: 10000, category: 'meals' });
    expect(r.outcome).toBe('balanced');
  });

  it('handles a discount', () => {
    const r = reconcileAmounts({ subtotal_cents: 5000, tax_cents: 400, discount_cents: 500, total_cents: 4900 });
    expect(r.outcome).toBe('balanced');
  });

  it('stays silent when only the total is legible', () => {
    // A null is honest. Flagging a receipt for being partly unreadable teaches people to ignore flags.
    const r = reconcileAmounts({ total_cents: 4200 });
    expect(r.outcome).toBe('insufficient_data');
    expect(r.flag).toBeNull();
  });

  it('stays silent when nothing was read at all', () => {
    expect(reconcileAmounts({}).outcome).toBe('insufficient_data');
  });
});

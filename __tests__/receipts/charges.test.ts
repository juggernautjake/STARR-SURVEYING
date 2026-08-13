// __tests__/receipts/charges.test.ts
//
// Owner, 2026-08-13: *"we need to recognize how much tax and tip the business applied, and how much
// tip I gave besides that."*
//
// Three things that are not the food, and are not the same kind of thing:
//   tax                — the business must charge it
//   service charge     — the business CHOSE to add it (auto-gratuity on a large party)
//   the customer's tip — written on the slip after the bill was printed
//
// Conflating the last two misrepresents both sides: a party billed 18% has not tipped voluntarily,
// and somebody who wrote $15.66 by hand did not have it imposed.
import { describe, it, expect } from 'vitest';
import { breakdownCharges } from '@/lib/receipts/charges';

describe('the owner’s meal', () => {
  // The real pair: bill 7791 + 643 tax = 8434; slip settles it at 10000.
  const b = breakdownCharges({
    subtotal_cents: 8434,
    tax_cents: 643,
    total_cents: 10000,
    settledBillTotalCents: 8434,
  });

  it('recovers the $15.66 the owner added by hand', () => {
    expect(b.customerTipCents).toBe(1566);
  });

  it('keeps the restaurant’s $6.43 of tax separate from that', () => {
    expect(b.taxCents).toBe(643);
    expect(b.businessAppliedCents).toBe(643);
  });

  it('reports the food itself, without double-counting the tax', () => {
    // The slip's "subtotal" is the WHOLE bill including tax. Subtracting tax from it again would
    // understate the food by $6.43.
    expect(b.goodsCents).toBe(7791);
  });

  it('says the tip was worked out rather than read off the paper', () => {
    // A derived number that looks printed is a number nobody checks.
    expect(b.customerTipWasInferred).toBe(true);
    expect(b.summary).toMatch(/worked out from the total/i);
  });

  it('states the tip as a share of the bill', () => {
    // 1566 / 8434 ≈ 18.6%.
    expect(b.tipRateOfBill).toBeCloseTo(0.186, 2);
  });

  it('names all three figures in one sentence', () => {
    expect(b.summary).toContain('$6.43');
    expect(b.summary).toContain('$15.66');
  });
});

describe('an auto-gratuity is not a tip the customer chose', () => {
  const b = breakdownCharges({
    subtotal_cents: 20000,
    tax_cents: 1650,
    service_charge_cents: 3600, // 18% added for a large party
    total_cents: 25250,
  });

  it('attributes the service charge to the business', () => {
    expect(b.businessGratuityCents).toBe(3600);
    expect(b.businessAppliedCents).toBe(1650 + 3600);
  });

  it('does not report a customer tip when the total is fully explained', () => {
    // 20000 + 1650 + 3600 = 25250 exactly. Nothing was added by hand.
    expect(b.customerTipCents).toBe(0);
  });

  it('says who added it, not merely that it exists', () => {
    expect(b.summary).toMatch(/added by the restaurant/i);
  });

  it('separates a hand-written tip ON TOP of an auto-gratuity', () => {
    // A party billed 18% who still rounded up. Both are real and they are not the same thing.
    const both = breakdownCharges({
      subtotal_cents: 20000, tax_cents: 1650, service_charge_cents: 3600, total_cents: 26000,
    });
    expect(both.businessGratuityCents).toBe(3600);
    expect(both.customerTipCents).toBe(750);
  });
});

describe('an ordinary receipt with nothing added', () => {
  const b = breakdownCharges({ subtotal_cents: 4000, tax_cents: 210, total_cents: 4210 });

  it('reports no tip at all', () => {
    expect(b.customerTipCents).toBe(0);
    expect(b.businessGratuityCents).toBe(0);
  });

  it('says nothing rather than printing three zeroes', () => {
    // A breakdown on every fuel receipt is a breakdown people stop reading.
    expect(b.summary).toBe('$2.10 tax.');
  });

  it('is silent when there is nothing beyond the goods', () => {
    expect(breakdownCharges({ subtotal_cents: 4000, total_cents: 4000 }).summary).toBeNull();
  });
});

describe('an arithmetic gap is only a tip where a tip line exists', () => {
  // Found in production 2026-08-13, on the receipt that made this rule necessary: CIRCLE K, fuel,
  // subtotal $53.99, total $57.31, no tax legible. The $3.32 difference was recorded as "tip you
  // added". Nobody tips a fuel pump — that gap is tax the extractor could not read, and calling it a
  // gratuity puts a number in front of the owner that is not merely wrong but slightly accusatory.
  const FUEL = { subtotal_cents: 5399, total_cents: 5731, category: 'fuel' };

  it('does not invent a tip on a fuel receipt', () => {
    const b = breakdownCharges(FUEL);
    expect(b.customerTipCents).toBe(0);
    expect(b.summary, 'and says nothing rather than reporting a $0.00 tip').toBeNull();
  });

  it('still infers one on a meal, which is the case the inference was written for', () => {
    const b = breakdownCharges({ ...FUEL, category: 'meals' });
    expect(b.customerTipCents).toBe(332);
    expect(b.customerTipWasInferred).toBe(true);
  });

  it('does not infer one when the category is unknown', () => {
    // An unknown category is not evidence that somebody tipped. Guessing here is what produced the
    // fuel-receipt tip in the first place.
    expect(breakdownCharges({ ...FUEL, category: null }).customerTipCents).toBe(0);
  });

  it('is unaffected on the two branches that have real evidence', () => {
    // A settled bill makes the gap the tip BY DEFINITION, and a printed tip is a printed tip —
    // neither is guessing, so neither is gated on the category.
    const settled = breakdownCharges({
      subtotal_cents: 8434, total_cents: 10000, settledBillTotalCents: 8434, category: 'fuel',
    });
    expect(settled.customerTipCents).toBe(1566);
    const printed = breakdownCharges({ subtotal_cents: 5000, tip_cents: 1000, total_cents: 6000, category: 'fuel' });
    expect(printed.customerTipCents).toBe(1000);
  });
});

describe('a printed tip is taken at its word', () => {
  it('uses the tip the extractor actually read', () => {
    const b = breakdownCharges({ subtotal_cents: 5000, tip_cents: 1000, total_cents: 6000 });
    expect(b.customerTipCents).toBe(1000);
    expect(b.customerTipWasInferred).toBe(false);
  });
});

describe('figures that do not add up', () => {
  it('never reports a negative tip', () => {
    // A total LESS than the parts is a misread, not a negative gratuity.
    const b = breakdownCharges({ subtotal_cents: 9000, tax_cents: 500, total_cents: 8000 });
    expect(b.customerTipCents).toBe(0);
  });

  it('handles a discount without turning it into a tip', () => {
    const b = breakdownCharges({ subtotal_cents: 5000, tax_cents: 400, discount_cents: 500, total_cents: 4900 });
    expect(b.customerTipCents).toBe(0);
  });

  it('survives a receipt with nothing legible', () => {
    const b = breakdownCharges({});
    expect(b.customerTipCents).toBe(0);
    expect(b.totalCents).toBeNull();
    expect(b.summary).toBeNull();
  });
});

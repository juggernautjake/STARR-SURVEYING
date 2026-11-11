/**
 * Card pricing and the non-card discount (owner, 2026-11-10): "if people pay cash or [check] or
 * whatever, they will pay the sales tax, but no processing fee. If they pay with card, they will pay
 * the processing fee. We need to know the rate so that we can plug our actual quote into a calculator."
 *
 * Texas allows a DISCOUNT for not paying by card (Bus. & Com. Code §604A.0021), not a card surcharge,
 * so the invoice carries the card price and every other method gets the card fee off.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  cardFee, discountFor, chargeFor, creditForMoney, cardPriceFor, quoteBreakdown, cardPriceLines,
  methodGetsDiscount, feeLabel, salesTax, STRIPE_CARD_FEE,
} from '@/lib/payments/pay-discount';
import { netPaidCents, pendingCents, invoiceStatusFromPayments } from '@/lib/payments/stripe-lifecycle';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');
const FEE = STRIPE_CARD_FEE;

describe('the rate', () => {
  it("is Stripe's card price, 2.9% + 30¢, unless the server says otherwise", () => {
    expect(cardFee({})).toEqual({ bps: 290, fixedCents: 30 });
    expect(cardFee({ CARD_FEE_PERCENT: '2.7', CARD_FEE_FIXED_CENTS: '5' })).toEqual({ bps: 270, fixedCents: 5 });
    expect(cardFee({ NONCARD_DISCOUNT: 'off' })).toBeNull();
    expect(feeLabel(FEE)).toBe('2.9% + 30¢');
  });

  it('only a card pays it', () => {
    for (const m of ['ach', 'zelle', 'cash', 'check', 'venmo', 'cashapp']) expect(methodGetsDiscount(m)).toBe(true);
    expect(methodGetsDiscount('stripe')).toBe(false);
  });
});

describe('a $1,000 quote', () => {
  it('no sales tax: $1,000.00 any other way, $1,030.17 by card — and the card leaves us the same $1,000', () => {
    const b = quoteBreakdown(100000, 0, FEE);
    expect(b.noncard.total).toBe(100000);
    expect(b.card.total).toBe(103017);
    expect(b.cardFeeCents).toBe(3017);
    expect(b.net.card).toBe(100000);          // 103017 − (2987 + 30)
    expect(b.net.zelleCashCheck).toBe(100000);
    expect(b.net.bankViaStripe).toBe(99500);  // ACH through Stripe: 0.8%, capped at $5
  });

  it('8.25% sales tax: each price carries its own tax', () => {
    const b = quoteBreakdown(100000, 825, FEE);
    expect(b.noncard).toEqual({ subtotal: 100000, tax: 8250, total: 108250 });
    expect(b.card.total).toBe(cardPriceFor(108250, FEE));
    expect(b.card.subtotal + b.card.tax).toBe(b.card.total);
    expect(Math.abs(b.card.tax - salesTax(b.card.subtotal, 825))).toBeLessThanOrEqual(1);
    // Paying the card price by card nets the non-card price, to the cent or within one.
    expect(Math.abs(b.net.card - b.noncard.total)).toBeLessThanOrEqual(1);
  });
});

describe('the discount on the pay page', () => {
  it('the card price, paid any other way, is the non-card price', () => {
    for (const cash of [5000, 49999, 100000, 108250, 250000, 1234567]) {
      const card = cardPriceFor(cash, FEE);
      expect(chargeFor(card, 'ach', FEE)).toBeGreaterThanOrEqual(cash);
      expect(chargeFor(card, 'ach', FEE) - cash).toBeLessThanOrEqual(1);
      expect(chargeFor(card, 'stripe', FEE)).toBe(card);
    }
  });

  it('a part payment gets the same discount a card would have cost', () => {
    expect(discountFor(50000, FEE)).toBe(1450 + 30);
    expect(chargeFor(50000, 'zelle', FEE)).toBe(48520);
  });

  it('money that arrives as a round number credits what it buys, never more than the balance', () => {
    const balance = 103017;
    expect(creditForMoney(100000, FEE, balance)).toEqual({ credit: 103017, discount: 3017 });
    expect(creditForMoney(120000, FEE, balance).discount).toBe(3017);   // overpaid: discount stays the balance's
    const half = creditForMoney(50000, FEE, balance);
    expect(half.credit).toBeLessThan(balance);
    expect(half.credit - half.discount).toBe(50000);
    expect(creditForMoney(100000, null, balance)).toEqual({ credit: 100000, discount: 0 });
  });
});

describe('the balance counts the discount as paid', () => {
  it('$1,000 by bank settles a $1,030.17 invoice', () => {
    const pays = [{ amount_cents: 100000, discount_cents: 3017, status: 'succeeded' }];
    expect(netPaidCents(pays)).toBe(103017);
    expect(invoiceStatusFromPayments({ totalCents: 103017, currentStatus: 'issued', payments: pays })).toBe('paid');
  });
  it('while clearing, the discount is on its way too', () => {
    expect(pendingCents([{ amount_cents: 100000, discount_cents: 3017, status: 'pending' }])).toBe(103017);
  });
});

describe('invoice lines at the card price', () => {
  it('scale together and add up to the card subtotal exactly', () => {
    const lines = [{ total_cents: 75000 }, { total_cents: 25000 }, { total_cents: 333 }];
    const card = quoteBreakdown(100333, 825, FEE);
    const out = cardPriceLines(lines, card.card.subtotal);
    expect(out.reduce((a, l) => a + l.total_cents, 0)).toBe(card.card.subtotal);
    expect(out[0].total_cents).toBeGreaterThan(75000);
  });
});

describe('the wiring', () => {
  it('a bank payment is charged the discounted price and recorded as ACH with its discount', () => {
    expect(read('app/api/public/invoice/[number]/intent/route.ts')).toContain("chargeFor(intended, payMethod === 'bank' ? 'ach' : 'stripe', cardFee())");
    const hook = read('app/api/webhooks/stripe/route.ts');
    expect(hook).toContain("method: bank ? 'ach' : 'stripe'");
    expect(hook).toContain('discount_cents: discount, method');
  });
  it('a Zelle / cash / check pledge records the money to send and the credit it buys', () => {
    const src = read('app/api/public/invoice/[number]/attempt/route.ts');
    expect(src).toContain('intended_amount_cents: money');
    expect(src).toContain('credit_cents: intended');
  });
  it('the invoice builder saves the card price and the calculator is registered', () => {
    expect(read('app/admin/invoices/new/page.tsx')).toContain('cardPriceLines(typedLines, pricing.card.subtotal)');
    expect(read('lib/admin/route-registry.ts')).toContain("'/admin/invoices/calculator'");
  });
  it('the quote never calls the card price a surcharge or a fee added on', () => {
    const calc = read('app/admin/components/payments/QuoteCalculator.tsx');
    expect(calc).toMatch(/`Price: \$\{formatDollars\(b\.card\.total\)\}`/);
    expect(calc).not.toMatch(/surcharge:/i);
  });
  it('the seed adds the discount columns', () => {
    const sql = read('seeds/681_noncard_discount.sql');
    expect(sql).toContain('discount_cents');
    expect(sql).toContain('discount_fixed_cents');
  });
});

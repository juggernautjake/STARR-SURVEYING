// lib/payments/pay-discount.ts — card pricing, and the discount for paying any other way. Pure.
//
// Owner, 2026-11-10: "if people pay cash or [check] or whatever, they will pay the sales tax, but no
// processing fee. If they pay with card, they will pay the processing fee. We need to know the rate
// so that we can plug our actual quote into a calculator … and tell them what the quote is with and
// without the discount based on payment type, and what the sales tax will be."
//
// THE LEGAL SHAPE. Texas Bus. & Com. Code §604A.0021 forbids a card SURCHARGE but expressly allows a
// DISCOUNT for paying by cash, check or other non-card means. So the price on an invoice is the CARD
// price, and every other method gets a discount off it equal to the card processing fee. The
// customer sees "pay by bank and pay $1,000 — or $1,030.18 by card"; it is never "plus a card fee".
//
// THE MATHS. Stripe charges a card payment `bps` basis points plus `fixed` cents of the amount
// charged. If the card price is C, the fee on it is C·bps/10000 + fixed, and the business keeps
// C − fee. So the non-card price is exactly C − fee: both customers leave the business with the same
// money. Going the other way, a quote Q (what we want to receive) has card price (Q + fixed) /
// (1 − bps/10000). Sales tax follows each price, because a discount at the time of sale lowers the
// taxable price (and the card price, being the price, is taxed in full).
//
// Words: CREDIT is how much of the invoice a payment settles; CHARGE is the money it takes.

export interface CardFee {
  /** Percentage part, basis points (290 = 2.9%). */
  bps: number;
  /** Fixed part per payment, cents. */
  fixedCents: number;
}

/** Stripe's standard US card pricing, and its ACH pricing (0.8%, capped at $5) — the latter only for
 *  showing what a bank payment through Stripe actually nets. */
export const STRIPE_CARD_FEE: CardFee = { bps: 290, fixedCents: 30 };
export const STRIPE_ACH_FEE = { bps: 80, capCents: 500 };

/**
 * The card fee non-card payers are spared, or null when the discount is switched off
 * (NONCARD_DISCOUNT=off). CARD_FEE_PERCENT and CARD_FEE_FIXED_CENTS override Stripe's list price —
 * set them if Stripe ever offers the account a different rate. Read at call time.
 */
export function cardFee(env: Record<string, string | undefined> = process.env): CardFee | null {
  if ((env.NONCARD_DISCOUNT ?? '').trim().toLowerCase() === 'off') return null;
  const pct = Number(env.CARD_FEE_PERCENT);
  const fixed = Number(env.CARD_FEE_FIXED_CENTS);
  return {
    bps: env.CARD_FEE_PERCENT && Number.isFinite(pct) && pct >= 0 && pct <= 10 ? Math.round(pct * 100) : STRIPE_CARD_FEE.bps,
    fixedCents: env.CARD_FEE_FIXED_CENTS && Number.isFinite(fixed) && fixed >= 0 && fixed <= 500 ? Math.round(fixed) : STRIPE_CARD_FEE.fixedCents,
  };
}

/** Every way to pay except card is spared the card fee. `ach` is a bank payment through Stripe. */
export const DISCOUNT_METHODS: ReadonlySet<string> = new Set(['ach', 'zelle', 'cash', 'check', 'venmo', 'cashapp']);

export function methodGetsDiscount(method: string): boolean {
  return DISCOUNT_METHODS.has(method);
}

/** The card fee on settling `creditCents` by card — the discount every other method gets. */
export function discountFor(creditCents: number, fee: CardFee | null): number {
  if (!fee || creditCents <= 0) return 0;
  return Math.min(creditCents, Math.round((creditCents * fee.bps) / 10000) + fee.fixedCents);
}

/** What the customer pays to settle `creditCents` of the invoice by this method. */
export function chargeFor(creditCents: number, method: string, fee: CardFee | null): number {
  const credit = Math.max(0, Math.round(creditCents));
  return methodGetsDiscount(method) ? credit - discountFor(credit, fee) : credit;
}

/**
 * Money that actually arrived by a discounted method → how much of the balance it settles. Used when
 * the office records an amount different from the pledge (a customer sent a round number). Paying at
 * least the discounted balance settles all of it; less settles the matching part, never more.
 */
export function creditForMoney(moneyCents: number, fee: CardFee | null, balanceCents: number): { credit: number; discount: number } {
  const money = Math.max(0, Math.round(moneyCents));
  const balance = Math.max(0, Math.round(balanceCents));
  if (!fee) return { credit: money, discount: 0 };
  const fullDiscount = discountFor(balance, fee);
  if (money >= balance - fullDiscount) return { credit: money + fullDiscount, discount: fullDiscount };
  const credit = Math.min(balance, Math.round(((money + fee.fixedCents) * 10000) / (10000 - fee.bps)));
  return { credit, discount: Math.max(0, credit - money) };
}

/** The card price whose non-card price is `cashCents`: the smallest C with C − discountFor(C) ≥ cash. */
export function cardPriceFor(cashCents: number, fee: CardFee | null): number {
  const cash = Math.max(0, Math.round(cashCents));
  if (!fee || cash === 0) return cash;
  const guess = Math.round(((cash + fee.fixedCents) * 10000) / (10000 - fee.bps));
  for (let c = guess - 3; c <= guess + 3; c++) {
    if (c - discountFor(c, fee) >= cash) return c;
  }
  return guess;
}

export interface PriceSide {
  subtotal: number;
  tax: number;
  total: number;
}

export interface QuoteBreakdown {
  /** Bank, Zelle, cash, check, Venmo, Cash App: the quote plus its sales tax. */
  noncard: PriceSide;
  /** Card: the price that leaves us the same money after the card fee, plus its sales tax. */
  card: PriceSide;
  /** Card total − non-card total: the processing fee the card payer covers (tax included). */
  cardFeeCents: number;
  /** What actually reaches the bank for each way of paying. */
  net: { card: number; bankViaStripe: number; zelleCashCheck: number };
}

/** Sales tax at `taxBps` on a pre-tax amount. */
export function salesTax(subtotalCents: number, taxBps: number): number {
  return Math.max(0, Math.round((Math.max(0, subtotalCents) * Math.max(0, taxBps)) / 10000));
}

/**
 * Everything the office needs to quote a job: the quote (what we want, before tax) at a sales tax
 * rate (basis points; 825 = 8.25%; 0 for non-taxable work) → both prices with their tax, the card
 * fee, and what each method nets.
 */
export function quoteBreakdown(quoteCents: number, taxBps: number, fee: CardFee | null = STRIPE_CARD_FEE): QuoteBreakdown {
  const q = Math.max(0, Math.round(quoteCents));
  const noncardTax = salesTax(q, taxBps);
  const noncard: PriceSide = { subtotal: q, tax: noncardTax, total: q + noncardTax };
  const cardTotal = cardPriceFor(noncard.total, fee);
  const cardSubtotal = Math.round((cardTotal * 10000) / (10000 + Math.max(0, taxBps)));
  const card: PriceSide = { subtotal: cardSubtotal, tax: cardTotal - cardSubtotal, total: cardTotal };
  const stripeCard = fee ?? STRIPE_CARD_FEE;
  const achFee = Math.min(STRIPE_ACH_FEE.capCents, Math.round((noncard.total * STRIPE_ACH_FEE.bps) / 10000));
  return {
    noncard,
    card,
    cardFeeCents: card.total - noncard.total,
    net: {
      card: card.total - (Math.round((card.total * stripeCard.bps) / 10000) + stripeCard.fixedCents),
      bankViaStripe: noncard.total - achFee,
      zelleCashCheck: noncard.total,
    },
  };
}

/**
 * Line items typed at the non-card price → the same items at the card price, for the invoice. Each
 * line is scaled by the card/non-card subtotal ratio; the rounding remainder goes on the largest
 * line so the lines add up to the card subtotal exactly.
 */
export function cardPriceLines<T extends { total_cents: number }>(lines: ReadonlyArray<T>, cardSubtotalCents: number): Array<T & { total_cents: number }> {
  const sum = lines.reduce((a, l) => a + Math.max(0, l.total_cents), 0);
  if (sum <= 0) return lines.map((l) => ({ ...l }));
  const scaled = lines.map((l) => ({ ...l, total_cents: Math.round((Math.max(0, l.total_cents) * cardSubtotalCents) / sum) }));
  const diff = cardSubtotalCents - scaled.reduce((a, l) => a + l.total_cents, 0);
  if (diff !== 0) {
    let big = 0;
    scaled.forEach((l, i) => { if (l.total_cents > scaled[big].total_cents) big = i; });
    scaled[big] = { ...scaled[big], total_cents: scaled[big].total_cents + diff };
  }
  return scaled;
}

/** "2.9% + 30¢" for the pay page, emails and the calculator. */
export function feeLabel(fee: CardFee | null): string {
  if (!fee) return 'none';
  const pct = fee.bps / 100;
  return `${Number.isInteger(pct) ? pct : pct.toFixed(2).replace(/0+$/, '')}%${fee.fixedCents ? ` + ${fee.fixedCents}¢` : ''}`;
}

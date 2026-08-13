// lib/receipts/charges.ts
//
// Who added what to the bill.
//
// Owner, 2026-08-13: *"we need to recognize how much tax and tip the business applied, and how much
// tip I gave besides that."*
//
// ── WHY "TIP" IS TWO DIFFERENT NUMBERS ───────────────────────────────────────────────────────────
//
// A restaurant total can contain three things that are not the food, and they are not the same kind
// of thing at all:
//
//   **tax** — the business is required to charge it. Not discretionary, and for a 50%-deductible
//   meal it is deductible on the same footing as the food.
//
//   **service charge / auto-gratuity** — the business ADDED it, usually for a large party. The
//   customer had no say. On the receipt it often reads "Gratuity 18%" or "Service charge", printed
//   in the same column as the tax, and it is part of what the business billed.
//
//   **the tip the customer chose** — written on the tip line after the bill was printed. This is the
//   one that does not appear on the itemised bill at all, and the one that turns an $84.34 meal into
//   a $100.00 charge.
//
// Conflating the last two is the easy mistake, and it matters in both directions: a party of twelve
// billed an 18% auto-gratuity has not tipped anybody voluntarily, and somebody who wrote $15.66 on a
// slip did not have it imposed on them. The books, and any conversation about whether a tip was
// reasonable, need them apart.
//
// ── HOW THE CUSTOMER TIP IS RECOVERED ────────────────────────────────────────────────────────────
//
// Usually it is not printed anywhere. It is arithmetic: on a card slip the printed subtotal is the
// whole bill including tax, and whatever the total exceeds it by was written by hand. That is why
// this module works from a settled TOTAL rather than trusting a "tip" field the model read — the
// model reports what it can see, and the tip line is the one thing on the paper that is not typed.

/** Everything the extractor can read off a receipt. All money in cents. */
export interface ReceiptAmounts {
  subtotal_cents?: number | null;
  tax_cents?: number | null;
  /** Anything the BUSINESS added: auto-gratuity, service charge, large-party fee. */
  service_charge_cents?: number | null;
  /** Whatever the model called a tip. May be either kind — this module decides which. */
  tip_cents?: number | null;
  discount_cents?: number | null;
  total_cents?: number | null;
  /** When this receipt is the card slip settling an itemised bill, the bill's total. */
  settledBillTotalCents?: number | null;
  /**
   * The receipt's category, when known. Used for exactly one decision: whether an unexplained
   * arithmetic gap may be called a tip. See `breakdownCharges`.
   */
  category?: string | null;
}

/** Categories where a customer writes a figure on a tip line. Nobody tips a fuel pump. */
const TIPPABLE = new Set(['meals', 'lodging', 'entertainment']);

export interface ChargeBreakdown {
  /** The goods or food, before anything was added. */
  goodsCents: number | null;
  /** Tax the business was required to charge. */
  taxCents: number;
  /** Auto-gratuity or service charge — added BY the business, not chosen by the payer. */
  businessGratuityCents: number;
  /** The tip the payer chose to add. */
  customerTipCents: number;
  /** tax + business gratuity: everything the business put on the bill beyond the goods. */
  businessAppliedCents: number;
  /** What was actually paid. */
  totalCents: number | null;
  /** The customer tip as a share of the pre-tip bill, or null when it cannot be computed. */
  tipRateOfBill: number | null;
  /** True when a figure had to be derived rather than read. Shown, so nobody mistakes it for print. */
  customerTipWasInferred: boolean;
  /** One sentence for a person, or null when there is nothing beyond the goods. */
  summary: string | null;
}

const int = (v: number | null | undefined): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : null;

const money = (c: number): string => `$${(c / 100).toFixed(2)}`;

/**
 * Split a receipt into goods, what the business added, and what the payer chose to add.
 *
 * Pure. Deliberately conservative: a figure is only attributed to the customer when the arithmetic
 * leaves no other explanation, because the alternative — calling an auto-gratuity a voluntary tip —
 * misrepresents both the payer and the business.
 */
export function breakdownCharges(a: ReceiptAmounts): ChargeBreakdown {
  const total = int(a.total_cents);
  const tax = int(a.tax_cents) ?? 0;
  const service = int(a.service_charge_cents) ?? 0;
  const discount = int(a.discount_cents) ?? 0;
  const readTip = int(a.tip_cents) ?? 0;
  const subtotal = int(a.subtotal_cents);
  const billTotal = int(a.settledBillTotalCents);

  let customerTip = 0;
  let inferred = false;

  if (billTotal !== null && total !== null) {
    // The strongest case, and the one the owner hit: this receipt SETTLES a known itemised bill, so
    // everything above that bill was written on the tip line. Nothing else can explain it.
    customerTip = Math.max(0, total - billTotal);
    inferred = readTip === 0 && customerTip > 0;
  } else if (readTip > 0) {
    // The model read a tip. On a card slip the printed subtotal already includes the tax, so the tip
    // it read is the customer's.
    customerTip = readTip;
  } else if (
    total !== null && subtotal !== null
    // Either the category says this is somewhere people tip, or the bill itself printed a service
    // charge — which only appears on the kind of bill that has a tip line under it. The second arm
    // matters because the category is the extractor's guess and can be absent or wrong, while a
    // printed auto-gratuity is a fact read off the paper.
    && (TIPPABLE.has((a.category ?? '').toLowerCase()) || service > 0)
  ) {
    // Nothing printed. Whatever the total exceeds subtotal + tax + service by was added by hand —
    // but ONLY where a tip line exists in the first place.
    //
    // Found in production 2026-08-13: a CIRCLE K fuel receipt (subtotal $53.99, total $57.31, no tax
    // legible) had the $3.32 difference recorded as "tip you added". Nobody tips a fuel pump; that
    // gap is tax the extractor could not read. The rule was inferring from arithmetic alone, and
    // arithmetic cannot tell an unread tax line from a gratuity — only the kind of purchase can.
    //
    // The two branches above are unaffected and remain category-blind, because both have direct
    // evidence: a settled bill makes the gap the tip by definition, and a printed tip is a printed
    // tip. This branch is the only one that was guessing.
    const explained = subtotal + tax + service - discount;
    const gap = total - explained;
    if (gap > 0) {
      customerTip = gap;
      inferred = true;
    }
  }

  // The goods are what is left once everything added to them is taken back off.
  const goods = subtotal !== null
    // A card slip's "subtotal" is the whole bill including tax, so taking the tax off it again would
    // understate the food. Only subtract when the subtotal genuinely precedes the tax.
    ? (billTotal !== null ? subtotal - tax - service : subtotal)
    : (total !== null ? total - tax - service - customerTip + discount : null);

  const businessApplied = tax + service;
  const preTip = goods === null ? null : goods + businessApplied - discount;

  const parts: string[] = [];
  if (tax > 0) parts.push(`${money(tax)} tax`);
  if (service > 0) parts.push(`${money(service)} service charge added by the restaurant`);
  if (customerTip > 0) {
    parts.push(`${money(customerTip)} tip you added${inferred ? ' (worked out from the total, not printed)' : ''}`);
  }

  return {
    goodsCents: goods,
    taxCents: tax,
    businessGratuityCents: service,
    customerTipCents: customerTip,
    businessAppliedCents: businessApplied,
    totalCents: total,
    tipRateOfBill: preTip && preTip > 0 && customerTip > 0
      ? Math.round((customerTip / preTip) * 1000) / 1000
      : null,
    customerTipWasInferred: inferred,
    summary: parts.length === 0 ? null : `${parts.join(', ')}.`,
  };
}

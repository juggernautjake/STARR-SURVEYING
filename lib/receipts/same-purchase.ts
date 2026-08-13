// lib/receipts/same-purchase.ts
//
// Two photographs, one purchase.
//
// Owner, 2026-08-13: *"I think I added two receipts for texas roadhouse, but only one shows the
// total. We have one that is $100 and one that is $84.34, but really they are for the same meal…
// make sure receipts are for the same purchase, so that we don't count the purchase twice."*
//
// ── WHY THE EXISTING DUPLICATE CHECK CANNOT SEE THIS ─────────────────────────────────────────────
//
// `computeDedupFingerprint` is `vendor | total | date`, which finds the same receipt photographed
// twice. These two are not the same receipt — they are the two pieces of paper a restaurant hands
// you for ONE meal:
//
//     itemised bill   subtotal 7791 + tax 643            = total  8434
//     card slip       subtotal 8434 + handwritten tip 1566 = total 10000
//
// The totals differ, so the fingerprints differ, so nothing matches. And the timestamps straddled
// midnight — 23:59 and 00:04 — so even a "same calendar day" rule would have missed it.
//
// ── THE SIGNATURE THAT DOES FIND IT ──────────────────────────────────────────────────────────────
//
// **One receipt's TOTAL is the other receipt's SUBTOTAL.** That is not a coincidence: it is what a
// card slip IS. The bill totals the food and tax; the slip starts from that figure and adds whatever
// the customer wrote on the tip line. Any restaurant meal paid by card produces this pair.
//
// It is also a strong signal on its own — an unrelated purchase at the same vendor happening to
// total exactly another receipt's subtotal, within hours, is a coincidence worth a person's glance
// rather than a silent merge.
//
// ── WHICH ONE COUNTS ─────────────────────────────────────────────────────────────────────────────
//
// The slip. $100.00 left the account; $84.34 never did. The bill is kept as the detail — it is the
// only record of what the food cost and what the tax was — but it must not reach the books as a
// second expense. Deleting it would destroy the itemisation; counting it would double the meal.
// So one is COUNTED and the other is SUPERSEDED, and both stay.
//
// Nothing here ever merges automatically on its own judgement — every result carries a sentence and
// a confidence, and the caller decides whether a person confirms it.

/** A receipt, narrowed to what matching needs. All money in cents. */
export interface ComparableReceipt {
  id: string;
  vendor_name?: string | null;
  /** ISO timestamp. */
  transaction_at?: string | null;
  subtotal_cents?: number | null;
  tax_cents?: number | null;
  tip_cents?: number | null;
  total_cents?: number | null;
  created_at?: string | null;
  /** Not used for matching — carried so the charge split can tell a meal from a fuel stop. */
  category?: string | null;
}

export type SamePurchaseKind =
  /** Same vendor, same total, same moment — one receipt photographed twice. */
  | 'duplicate_photo'
  /** The itemised bill and the card slip for one meal. One's total is the other's subtotal. */
  | 'bill_and_slip';

export interface SamePurchaseMatch {
  kind: SamePurchaseKind;
  /** The receipt that reflects what actually left the account. This one counts. */
  countId: string;
  /** The supporting record. Kept, never counted — deleting it would destroy the itemisation. */
  supersededId: string;
  /** `certain` when the arithmetic can only mean one thing; `likely` when a person should glance. */
  confidence: 'certain' | 'likely';
  /** One sentence a bookkeeper can act on, naming both figures. */
  reason: string;
}

const money = (cents: number): string => `$${(cents / 100).toFixed(2)}`;

/** Vendors are printed a dozen ways: "TEXAS ROADHOUSE #418", "Texas Roadhouse". Compare on letters. */
function vendorKey(name: string | null | undefined): string {
  return (name ?? '').toLowerCase().replace(/[^a-z]/g, '');
}

/** Do two vendor names refer to the same place? One containing the other covers branch numbers and
 *  the "Inc"/"LLC" a card slip adds and a bill does not. */
function sameVendor(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = vendorKey(a);
  const y = vendorKey(b);
  if (!x || !y) return false;
  return x === y || x.includes(y) || y.includes(x);
}

/**
 * How far apart two receipts for one purchase can be stamped.
 *
 * Twelve hours, in HOURS rather than calendar days, because the real pair that prompted this was
 * timestamped 23:59 and 00:04 — five minutes apart and on different dates. A "same day" rule would
 * have missed the exact case it was written for.
 *
 * It also bounds the other direction: a card slip posting the following afternoon is a different
 * meal, not a late settlement of last night's.
 */
const MAX_GAP_MS = 12 * 60 * 60 * 1000;

/** A cent of slack — receipts round their own tax, and a penny must not break a real match. */
const TOLERANCE = 1;

function withinWindow(a: ComparableReceipt, b: ComparableReceipt): boolean {
  const ta = Date.parse(a.transaction_at ?? '');
  const tb = Date.parse(b.transaction_at ?? '');
  // Unknown dates do not veto a match: a slip with an illegible date is common, and the amount
  // signature below is the stronger evidence anyway.
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return true;
  return Math.abs(ta - tb) <= MAX_GAP_MS;
}

const cents = (v: number | null | undefined): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : null;

/**
 * Are these two receipts the same purchase?
 *
 * Pure and symmetric: the order of the arguments does not change the verdict, only which id lands in
 * `countId`. Returns null when there is no reason to think they are related, which is the
 * overwhelmingly common answer and must stay cheap to say.
 */
export function detectSamePurchase(
  a: ComparableReceipt,
  b: ComparableReceipt,
): SamePurchaseMatch | null {
  if (a.id === b.id) return null;
  if (!sameVendor(a.vendor_name, b.vendor_name)) return null;
  if (!withinWindow(a, b)) return null;

  const aTotal = cents(a.total_cents);
  const bTotal = cents(b.total_cents);

  // ── The bill-and-slip pair ─────────────────────────────────────────────────────────────────────
  //
  // Checked BEFORE the duplicate case: a slip whose tip happened to be zero would have the same
  // total as its bill, and calling that "photographed twice" would discard the itemisation.
  for (const [bill, slip] of [[a, b], [b, a]] as const) {
    const billTotal = cents(bill.total_cents);
    const slipSubtotal = cents(slip.subtotal_cents);
    const slipTotal = cents(slip.total_cents);
    if (billTotal === null || slipSubtotal === null) continue;
    if (Math.abs(billTotal - slipSubtotal) > TOLERANCE) continue;
    // The slip must settle at least what the bill came to. A "slip" for less than the bill is not a
    // settlement of it.
    if (slipTotal !== null && slipTotal + TOLERANCE < billTotal) continue;
    // An itemised bill that is really just a slip of its own — no tax, no line detail — is weaker
    // evidence. Still reported, because the arithmetic is the arithmetic; the caller sees `likely`.
    const billLooksItemised = cents(bill.tax_cents) !== null || cents(bill.subtotal_cents) !== null;

    const added = slipTotal === null ? null : slipTotal - slipSubtotal;
    return {
      kind: 'bill_and_slip',
      // What actually left the account.
      countId: slip.id,
      supersededId: bill.id,
      confidence: billLooksItemised ? 'certain' : 'likely',
      reason:
        `The ${money(billTotal)} receipt is the itemised bill for the ${money(slipTotal ?? billTotal)} `
        + 'card slip — the bill\'s total is the slip\'s subtotal'
        + (added !== null && added > 0 ? `, with ${money(added)} added on the tip line` : '')
        + '. One meal, two pieces of paper: the slip is what left the account, and the bill is kept '
        + 'as the itemisation. Only the slip is counted.',
    };
  }

  // ── The same receipt photographed twice ────────────────────────────────────────────────────────
  if (aTotal !== null && bTotal !== null && Math.abs(aTotal - bTotal) <= TOLERANCE) {
    // Whichever arrived first is the original; the later one is the re-photograph.
    const [first, second] = (Date.parse(a.created_at ?? '') || 0) <= (Date.parse(b.created_at ?? '') || 0)
      ? [a, b] : [b, a];
    return {
      kind: 'duplicate_photo',
      countId: first.id,
      supersededId: second.id,
      // Deliberately never `certain`: two $5 coffees at the same shop within the hour are both real,
      // and this is the case where an over-confident merge silently loses an expense.
      confidence: 'likely',
      reason:
        `Both receipts are ${money(aTotal)} from the same place within hours of each other. If this `
        + 'is one purchase photographed twice, only the first is counted — if they were two separate '
        + 'purchases, say so and both will count.',
    };
  }

  return null;
}

/**
 * Find the best match for `candidate` among receipts already on file.
 *
 * Prefers a bill-and-slip pair over a possible duplicate photo: the first is an arithmetic fact, the
 * second is a guess about somebody's afternoon.
 */
export function findSamePurchase(
  candidate: ComparableReceipt,
  existing: readonly ComparableReceipt[],
): SamePurchaseMatch | null {
  const matches = existing
    .map((other) => detectSamePurchase(candidate, other))
    .filter((m): m is SamePurchaseMatch => m !== null);
  if (matches.length === 0) return null;
  return matches.find((m) => m.kind === 'bill_and_slip') ?? matches[0];
}

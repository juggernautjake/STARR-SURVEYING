// lib/receipts/reconcile.ts
//
// Check a receipt's arithmetic in code, after the model has read it.
//
// Owner, 2026-08-12: *"if a receipt has a cost of $85.00, and then the total that is written is
// $100.00, that probably means that there was a $15 tip… Please make sure the AI is accounting for
// everything."*
//
// ── WHY THIS IS NOT LEFT TO THE PROMPT ────────────────────────────────────────────────────────────
//
// The prompt does ask for exactly this, and the model mostly obliges. But "mostly" is the wrong
// standard for money, and the first real test showed both failure directions on ONE meal:
//
//   * the card slip: subtotal 8434 + tip 1566 = 10000 = total. Correct, and the tip was never printed —
//     the inference the owner asked for, working.
//   * the itemised bill for the same meal: subtotal 7791 + tax 643 = 8434, which IS the total exactly.
//     The model added a $6.00 tip anyway, so its own numbers summed to 9034 against a total of 8434 —
//     and it raised no flag, despite the prompt telling it to.
//
// Arithmetic is deterministic. Asking a language model to be the last line of defence on it, when a
// subtraction settles it, is a choice to be occasionally wrong for no reason. The prompt still asks —
// a model that reasons about the total reads the rest of the receipt better — but this decides.
//
// ── THE THREE OUTCOMES ────────────────────────────────────────────────────────────────────────────
//
//   balanced   — the parts sum to the total. Nothing to say.
//   tip_inferred — the parts fall short by an amount that can only sensibly be a gratuity, and no tip
//                  was recorded. We fill it in and say so, because a total that exceeds its own line
//                  items is otherwise unexplained money on a company card.
//   mismatch   — anything else. Flagged with both numbers, never silently corrected: a receipt whose
//                figures disagree is a thing a person must look at, and quietly rewriting one of them
//                to make it add up would destroy the evidence that it did not.

/** Every figure is in cents. Null means the model could not read it. */
export interface ReceiptAmounts {
  subtotal_cents?: number | null;
  tax_cents?: number | null;
  tip_cents?: number | null;
  discount_cents?: number | null;
  total_cents?: number | null;
  /** Used only to decide whether an unexplained gap could plausibly be a gratuity. */
  category?: string | null;
}

export type ReconcileOutcome = 'insufficient_data' | 'balanced' | 'tip_inferred' | 'spurious_tip' | 'mismatch';

export interface ReconcileResult {
  outcome: ReconcileOutcome;
  /** Tip to write when we inferred one, or 0 when we are removing a tip that cannot be real. */
  tipCents: number | null;
  /** Sentence for `review_flags`. Null when there is nothing a person needs to do. */
  flag: string | null;
  /** total − (subtotal + tax + tip − discount). Positive means the total exceeds the parts. */
  differenceCents: number | null;
}

const money = (cents: number): string => `$${(cents / 100).toFixed(2)}`;

/** A gratuity is a proportion of the food, not an arbitrary number. Outside this band the gap is a
 *  misread, a second transaction, or a service charge — all of which want a person, not a guess. */
const TIP_MIN_RATIO = 0.05;
const TIP_MAX_RATIO = 0.40;

/** Categories where an unprinted gratuity is an ordinary event. A "tip" on a fuel pump slip is a
 *  misreading, so inferring one there would launder an error into a number. */
const TIPPABLE = new Set(['meals', 'client_entertainment', 'lodging']);

/**
 * Reconcile the money on a receipt.
 *
 * Pure: same figures in, same verdict out, so the rule is testable without the model or a database.
 */
export function reconcileAmounts(a: ReceiptAmounts): ReconcileResult {
  const total = a.total_cents;
  const subtotal = a.subtotal_cents;

  // Without a total and a subtotal there is no equation to check. A receipt where only the total is
  // legible is honest and common — silence is the right answer, not a flag.
  if (typeof total !== 'number' || typeof subtotal !== 'number') {
    return { outcome: 'insufficient_data', tipCents: null, flag: null, differenceCents: null };
  }

  const tax = a.tax_cents ?? 0;
  const tip = a.tip_cents ?? 0;
  const discount = a.discount_cents ?? 0;

  const withTip = subtotal + tax + tip - discount;
  const withoutTip = subtotal + tax - discount;

  // A cent of slack: receipts round their own tax, and chasing a 1¢ rounding artifact would flag
  // perfectly good receipts forever.
  const TOLERANCE = 1;

  if (Math.abs(total - withTip) <= TOLERANCE) {
    return { outcome: 'balanced', tipCents: null, flag: null, differenceCents: total - withTip };
  }

  // The model recorded a tip, and the receipt balances WITHOUT it. The tip is the invented figure —
  // this is the exact defect seen on the itemised Texas Roadhouse bill. Removing it is safe because
  // the remaining numbers are self-consistent and printed; keeping it would corrupt the expense total.
  if (tip > 0 && Math.abs(total - withoutTip) <= TOLERANCE) {
    return {
      outcome: 'spurious_tip',
      tipCents: 0,
      flag: `A tip of ${money(tip)} was read, but ${money(subtotal)} + ${money(tax)} already equals the `
        + `total of ${money(total)}. The tip has been removed as a misread — check the photo if this `
        + 'receipt did carry a gratuity.',
      differenceCents: total - withTip,
    };
  }

  const gap = total - withoutTip;

  // The owner's case: the parts fall short and nothing is recorded as a tip.
  if (tip === 0 && gap > 0) {
    const ratio = subtotal > 0 ? gap / subtotal : Infinity;
    const tippable = TIPPABLE.has((a.category ?? '').toLowerCase());
    if (tippable && ratio >= TIP_MIN_RATIO && ratio <= TIP_MAX_RATIO) {
      return {
        outcome: 'tip_inferred',
        tipCents: gap,
        flag: `Tip of ${money(gap)} inferred: the total of ${money(total)} exceeds ${money(subtotal)} + `
          + `${money(tax)} and no gratuity was printed. Confirm against the photo.`,
        differenceCents: 0,
      };
    }
    return {
      outcome: 'mismatch',
      tipCents: null,
      flag: `The figures do not add up: ${money(subtotal)} + ${money(tax)}`
        + `${discount ? ` − ${money(discount)} discount` : ''} = ${money(withoutTip)}, but the total `
        + `reads ${money(total)} (${money(Math.abs(gap))} unaccounted for).`,
      differenceCents: gap,
    };
  }

  return {
    outcome: 'mismatch',
    tipCents: null,
    flag: `The figures do not add up: ${money(subtotal)} + ${money(tax)}`
      + `${tip ? ` + ${money(tip)} tip` : ''}${discount ? ` − ${money(discount)} discount` : ''} = `
      + `${money(withTip)}, but the total reads ${money(total)}.`,
    differenceCents: total - withTip,
  };
}

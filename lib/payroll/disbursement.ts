// lib/payroll/disbursement.ts
//
// What actually goes out, versus what the payment settles.
//
// ── WHY THESE ARE TWO NUMBERS ────────────────────────────────────────────────────────────────────
//
// Until pay advances could be recovered from a payout batch, they were the same number and nobody
// had to think about it. They stop being the same the moment somebody who earned $1,000 owes a $200
// advance:
//
//   * **$1,000 is settled.** All of their approved hours are discharged — $800 went to them and $200
//     went against a debt they already had. `lib/payroll/owed.ts` counts `total_cents` as paid, so
//     this is the figure that must stay at $1,000 or the balance never reaches zero and the firm
//     hands the advance back.
//   * **$800 goes out.** That is what a bank transfer, a Venmo payment or an envelope contains.
//
// Storing both would let them disagree — and a stored figure that disagrees with its own components
// is the kind of error nobody finds until a payment is short. So the total and the recovery are
// stored, and the disbursement is derived here, in one place, by everything that sends money.
//
// ── THE FAILURE THIS EXISTS TO PREVENT ───────────────────────────────────────────────────────────
//
// The obvious implementation is to subtract the recovery from `total_cents` at build time. It would
// look right on every screen and be wrong in the ledger: `owed` would count $800 against $1,000 of
// earnings and report the person as still owed $200, for ever, with nothing anywhere looking broken.
// The seed comment on `payout_batch_items.recovered_cents` says the same thing from the database's
// side, because this is the one mistake that cannot be seen once it is made.

/** A payout line, narrowed to the two figures that decide what leaves the firm. */
export interface DisbursableItem {
  /** What this item settles — the full value of the hours, bonuses and reimbursements. */
  total_cents?: number | null;
  /** Of that, how much was withheld against an outstanding advance. */
  recovered_cents?: number | null;
}

const int = (v: number | null | undefined): number => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : 0;
};

/**
 * What actually goes to the person, in cents.
 *
 * Clamped at zero. A recovery larger than the total would produce a negative payment, which is not a
 * thing any rail can send — the database CHECK forbids it too, and this is the belt to that braces:
 * a screen rendering "-$40.00 to send" is worse than one rendering "$0.00", because somebody might
 * try to action it.
 */
export function disbursedCents(item: DisbursableItem): number {
  // The recovery is clamped BEFORE it is subtracted, not only after. Subtracting a raw negative
  // would ADD to the payment — paying somebody their own debt a second time — and the outer
  // `Math.max` cannot catch that, because the result is larger than the total rather than smaller.
  // Caught by a test that asserted the outcome rather than the clamp.
  const recovered = Math.max(0, int(item.recovered_cents));
  return Math.max(0, int(item.total_cents) - recovered);
}

/** The disbursement across a whole batch — what the run costs the bank account. */
export function totalDisbursedCents(items: readonly DisbursableItem[]): number {
  return items.reduce((sum, i) => sum + disbursedCents(i), 0);
}

/** How much of a batch stayed with the firm as advance repayment. */
export function totalRecoveredCents(items: readonly DisbursableItem[]): number {
  return items.reduce((sum, i) => sum + Math.max(0, int(i.recovered_cents)), 0);
}

/**
 * One line explaining a withheld amount, for the row it appears on.
 *
 * Null when nothing was withheld — the overwhelmingly common case, and a note saying "$0.00 was
 * withheld" on every ordinary payout is a note people stop reading before the one that matters.
 */
export function describeRecovery(item: DisbursableItem): string | null {
  const recovered = Math.max(0, int(item.recovered_cents));
  if (recovered === 0) return null;
  const money = (c: number) => `$${(c / 100).toFixed(2)}`;
  return `${money(int(item.total_cents))} earned, ${money(recovered)} held back against a pay advance — `
    + `${money(disbursedCents(item))} to send.`;
}

// lib/payroll/owed.ts
//
// WHAT IS OWED TO A PERSON RIGHT NOW
// ══════════════════════════════════
//
// *"This will all be calculated to show how much is owed since the last payout to that employee."*
//
// ── A RUNNING BALANCE, NOT A DATE WINDOW ────────────────────────────────────────────────────────
//
// The obvious reading of "since the last payout" is: sum the approved hours dated after the last
// payout. That is wrong in a way that loses money quietly.
//
// Hours get submitted late. A crew member who forgets Thursday and logs it the following week
// produces an entry dated BEFORE a payout that has already gone out. Under a date window it falls
// on the wrong side of the line and is never paid — and nothing anywhere says so, because the
// window did exactly what it was told.
//
// So this is a balance: **everything approved, minus everything paid.** An entry can arrive at any
// time, in any order, and still be owed exactly once. "Since your last payout" survives as the
// LABEL — which is what the owner actually wants to read — while the arithmetic is a subtraction
// that cannot drop a row.
//
// ── CENTS ───────────────────────────────────────────────────────────────────────────────────────
//
// Hours carry dollars (`daily_time_logs.total_pay`, NUMERIC) and payouts carry cents
// (`payout_batch_items.total_cents`, INTEGER). Mixing them is a 100× error in whichever direction
// nobody checks. Everything here is cents; dollars are converted once, on the way in, and named as
// such at every boundary.

/** One approved entry, already priced by the pay model or by an approver's decision. */
export interface ApprovedEntry {
  id: string;
  logDate: string;
  /** Hours to pay: the approver's adjustment when there is one, else what was submitted. */
  hours: number;
  /**
   * What this entry is worth, in DOLLARS — the approver's decision where one exists, otherwise the
   * figure the pay model resolved at submission. Null means nobody has priced it yet.
   */
  payDollars: number | null;
  /** Hours inside a decision that were deliberately left unpriced. */
  undecidedHours?: number;
}

export interface OwedInput {
  /** Every APPROVED entry for this person, all time. Pending and rejected must not be here. */
  approved: ApprovedEntry[];
  /**
   * Every payout COMMITTED to them, in CENTS — including batches still in draft.
   *
   * Drafts count deliberately. Once a batch exists for somebody's hours, paying those hours again
   * is a double payment, and a balance that ignores drafts invites exactly that. Voided batches and
   * failed items are not committed and must not be in this list.
   */
  paidCents: number[];
  /**
   * Of that, how much has actually reached them, in CENTS.
   *
   * Kept apart because "we owe you nothing" and "we owe you nothing because a batch is sitting in
   * draft" are different sentences to be on the receiving end of.
   */
  settledCents?: number;
  /** When the most recent payout went out, for the label. Null when they have never been paid. */
  lastPayoutAt?: string | null;
}

export interface OwedSummary {
  /** The number that matters: approved earnings minus everything paid, in cents. */
  owedCents: number;
  /** Total approved earnings, all time, in cents. */
  earnedCents: number;
  /** Total committed, all time, in cents — including batches still in draft. */
  paidCents: number;
  /** Of that, how much has actually reached them. */
  settledCents: number;
  /** Committed but not yet settled: money promised, sitting in a batch that has not gone out. */
  inFlightCents: number;
  /** Hours behind `earnedCents`. */
  paidHours: number;
  /**
   * Approved hours nobody has priced. They are NOT in `owedCents` — they have no amount — but they
   * are owed something, and a balance that omits them silently understates what the firm owes.
   */
  undecidedHours: number;
  /** How many approved entries make up the balance. */
  entryCount: number;
  /** Date of the earliest approved entry not yet covered by pay, for the label. */
  oldestUnpaidDate: string | null;
  lastPayoutAt: string | null;
  /** A sentence for the screen. Never invents a date it does not have. */
  statement: string;
}

const toCents = (dollars: number) => Math.round(dollars * 100);
const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

/**
 * Compute what a person is owed.
 *
 * A NEGATIVE balance is possible and is reported rather than clamped: it means somebody was paid
 * more than their approved hours account for — an advance recorded as a payout, a correction, or a
 * mistake. Clamping it to zero would hide the one case that needs a human.
 */
export function computeOwed(input: OwedInput): OwedSummary {
  let earnedCents = 0;
  let paidHours = 0;
  let undecidedHours = 0;
  let entryCount = 0;
  let oldestUnpaid: string | null = null;

  for (const entry of input.approved ?? []) {
    const hours = Number(entry.hours);
    if (!Number.isFinite(hours) || hours <= 0) continue;
    entryCount += 1;

    const undecided = Number(entry.undecidedHours ?? 0);
    if (Number.isFinite(undecided) && undecided > 0) undecidedHours += undecided;

    if (entry.payDollars === null || entry.payDollars === undefined || !Number.isFinite(entry.payDollars)) {
      // Priced by nobody. Counted in `undecidedHours` below rather than as money, because inventing
      // an amount here is how an estimate becomes a payment.
      if (!(Number.isFinite(undecided) && undecided > 0)) undecidedHours += hours;
      if (!oldestUnpaid || entry.logDate < oldestUnpaid) oldestUnpaid = entry.logDate;
      continue;
    }

    earnedCents += toCents(Number(entry.payDollars));
    paidHours += hours;
    if (!oldestUnpaid || entry.logDate < oldestUnpaid) oldestUnpaid = entry.logDate;
  }

  const paidCents = (input.paidCents ?? []).reduce(
    (sum, c) => sum + (Number.isFinite(Number(c)) ? Math.round(Number(c)) : 0),
    0,
  );

  const settledCents = Number.isFinite(Number(input.settledCents)) ? Math.round(Number(input.settledCents)) : paidCents;
  // Never negative: settled cannot exceed committed, and a data oddity that made it look so would
  // otherwise render as money in flight that does not exist.
  const inFlightCents = Math.max(0, paidCents - settledCents);

  const owedCents = earnedCents - paidCents;
  const lastPayoutAt = input.lastPayoutAt ?? null;

  return {
    owedCents,
    earnedCents,
    paidCents,
    settledCents,
    inFlightCents,
    paidHours: Math.round(paidHours * 100) / 100,
    undecidedHours: Math.round(undecidedHours * 100) / 100,
    entryCount,
    oldestUnpaidDate: oldestUnpaid,
    lastPayoutAt,
    statement: describeOwed({ owedCents, undecidedHours, lastPayoutAt, entryCount, inFlightCents }),
  };
}

function describeOwed(o: {
  owedCents: number;
  undecidedHours: number;
  lastPayoutAt: string | null;
  entryCount: number;
  inFlightCents: number;
}): string {
  const parts: string[] = [];

  if (o.owedCents < 0) {
    // Named, not hidden. Somebody has been paid more than their approved hours account for.
    parts.push(
      `Overpaid by ${money(-o.owedCents)} against approved hours — this needs a look rather than a payment.`,
    );
  } else if (o.owedCents === 0 && o.entryCount === 0) {
    parts.push('Nothing approved yet, so nothing owed.');
  } else if (o.owedCents === 0) {
    parts.push('Fully paid up on approved hours.');
  } else {
    parts.push(
      o.lastPayoutAt
        ? `${money(o.owedCents)} owed since the last payout on ${o.lastPayoutAt.slice(0, 10)}.`
        // No payout has ever gone out. Saying "since your last payout" would imply one happened.
        : `${money(o.owedCents)} owed — no payout has been made to this person yet.`,
    );
  }

  if (o.inFlightCents > 0) {
    // "We owe you nothing" and "we owe you nothing because a batch is sitting in draft" are very
    // different sentences to be on the receiving end of.
    parts.push(`${money(o.inFlightCents)} of that is already in a payout that has not gone out yet.`);
  }

  if (o.undecidedHours > 0) {
    // Separate sentence, deliberately: these hours are owed SOMETHING and the balance above does
    // not include them. Rolling them in at $0 would make the total read as complete.
    parts.push(
      `${o.undecidedHours}h are approved but not yet priced — no amount is attached to them, so they are not in that total.`,
    );
  }

  return parts.join(' ');
}

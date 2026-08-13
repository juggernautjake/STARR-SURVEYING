// lib/payroll/balance-integrity.ts
//
// Does the number on somebody's account match the ledger underneath it?
//
// `employee_profiles.available_balance` is a running total kept by hand: every path that moves money
// reads it, adds or subtracts, and writes the result back. `balance_transactions` records the
// movements. Nothing has ever checked that the two agree.
//
// ── WHY THAT MATTERS MORE THAN IT SOUNDS ─────────────────────────────────────────────────────────
//
// Three separate places write `available_balance`: completing a legacy payroll run, marking a payout
// item paid by the `account` method, and processing a withdrawal. Each does a read-modify-write with
// no transaction around it. Two of them running at once, or one of them failing after the balance
// update and before the ledger row, leaves a number nobody can derive from anything — and the number
// is what somebody withdraws against.
//
// A drifted balance does not look wrong. It is a plausible amount of money, in the right currency,
// on the right person. The only way to know is to add the ledger up, which is what this does.
//
// ── WHAT THIS IS NOT ─────────────────────────────────────────────────────────────────────────────
//
// It does not repair anything. A balance that disagrees with its ledger is a question about which of
// the two is right, and that is a person's decision — silently "correcting" the balance to match the
// ledger would erase the evidence of whatever caused the drift, and silently doing the reverse would
// invent a transaction. It reports, with both numbers and the difference.

/** One movement, as this module needs it. Amounts are DOLLARS and signed: credits +, debits −. */
export interface LedgerEntry {
  amount: number;
  transaction_type?: string | null;
  created_at?: string | null;
  status?: string | null;
}

export type IntegrityVerdict =
  /** The balance is exactly the sum of the ledger. */
  | 'reconciled'
  /** Within a cent — floating-point dust from repeated NUMERIC round-trips, not a real difference. */
  | 'rounding'
  /** The balance is higher than the ledger explains: somebody could withdraw money nothing recorded. */
  | 'balance_too_high'
  /** The balance is lower than the ledger explains: somebody is owed money they cannot see. */
  | 'balance_too_low'
  /** There is nothing to check — no balance and no movements. */
  | 'empty';

export interface IntegrityResult {
  verdict: IntegrityVerdict;
  /** What the account says. */
  balance: number;
  /** What the movements add up to. */
  ledgerTotal: number;
  /** balance − ledgerTotal. Positive means the account claims more than the ledger explains. */
  differenceDollars: number;
  /** True when a person needs to look at this before money moves against it. */
  needsReview: boolean;
  /** One sentence, or null when there is nothing to say. */
  message: string | null;
}

/** A cent of slack. `available_balance` and `amount` are both NUMERIC and round-trip through
 *  JavaScript floats on every read; chasing a penny would flag healthy accounts forever. */
const TOLERANCE = 0.005;

const money = (n: number): string => `$${Math.abs(n).toFixed(2)}`;
const round = (n: number): number => Math.round(n * 100) / 100;

/**
 * Check a balance against its own ledger.
 *
 * Pure, so the interesting cases can be tested without a database — which, for money, is where they
 * are cheapest to find.
 *
 * Entries with a non-`completed` status are EXCLUDED. A pending movement has not happened, and
 * counting it would report a healthy account as drifted every time one was in flight.
 */
export function checkBalanceIntegrity(
  balanceDollars: number | null | undefined,
  entries: readonly LedgerEntry[],
): IntegrityResult {
  const rawBalance = Number(balanceDollars ?? 0);

  const settled = entries.filter((e) => {
    const s = (e.status ?? 'completed').toLowerCase();
    return s === 'completed';
  });

  const rawLedger = settled.reduce((sum, e) => {
    const n = Number(e.amount);
    return Number.isFinite(n) ? sum + n : sum;
  }, 0);

  // Reported rounded — nobody wants to read 1000.1999999999998 — but COMPARED raw. Rounding both to
  // cents first would make the tolerance below unreachable: any surviving difference would already
  // be a whole cent, and the float dust the tolerance exists for would have been rounded away into
  // either a false "reconciled" or a real mismatch. The first version did exactly that, and the
  // `rounding` branch could never fire.
  const balance = round(rawBalance);
  const ledgerTotal = round(rawLedger);

  if (rawBalance === 0 && settled.length === 0) {
    return {
      verdict: 'empty', balance, ledgerTotal, differenceDollars: 0, needsReview: false, message: null,
    };
  }

  const rawDifference = rawBalance - rawLedger;
  const difference = round(rawDifference);

  if (rawDifference === 0) {
    return { verdict: 'reconciled', balance, ledgerTotal, differenceDollars: 0, needsReview: false, message: null };
  }
  if (Math.abs(rawDifference) <= TOLERANCE) {
    return { verdict: 'rounding', balance, ledgerTotal, differenceDollars: difference, needsReview: false, message: null };
  }

  // Both directions are wrong, and they are wrong in opposite ways — so they get different
  // sentences. One is money somebody could take that nothing accounts for; the other is money
  // somebody is owed and cannot see.
  if (difference > 0) {
    return {
      verdict: 'balance_too_high',
      balance, ledgerTotal, differenceDollars: difference, needsReview: true,
      message:
        `This account shows ${money(balance)} but its recorded movements only add up to ${money(ledgerTotal)} — `
        + `${money(difference)} is unexplained. Do not send money against it until somebody has worked out why.`,
    };
  }
  return {
    verdict: 'balance_too_low',
    balance, ledgerTotal, differenceDollars: difference, needsReview: true,
    message:
      `This account shows ${money(balance)} but its recorded movements add up to ${money(ledgerTotal)} — `
      + `${money(difference)} more than the account is showing. They may be owed money they cannot see.`,
  };
}

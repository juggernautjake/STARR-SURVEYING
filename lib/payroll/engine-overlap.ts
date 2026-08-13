// lib/payroll/engine-overlap.ts
//
// Stopping the same week from being paid by both engines.
//
// ── THE PROBLEM ──────────────────────────────────────────────────────────────────────────────────
//
// This firm has two working payroll engines that do not know about each other:
//
//   * `payroll_runs` + `pay_stubs` — the legacy path. Reads approved hours between two dates, builds
//     a stub per person, and on `completed` credits `employee_profiles.available_balance`.
//   * `payout_batches` + `payout_batch_items` — the live path. Builds a batch for a week, gets
//     approved, dispatched by Venmo/ACH/cash/cheque, marked paid.
//
// Both take the same approved hours as their input. Neither writes anything the other reads. So a
// week paid by a payout batch on Friday can be paid again by a payroll run on Monday, and nothing
// anywhere objects — the second engine simply does what it was asked.
//
// `lib/payroll/owed.ts` already prevents over-payment at the AMOUNT level: it is approved earnings
// minus everything committed, drafts included. That protects the running balance. It does not stop
// somebody creating the second settlement in the first place, because neither engine consults it
// before building.
//
// ── WHY THIS IS AN OVERLAP CHECK AND NOT A ROW-LEVEL ONE ─────────────────────────────────────────
//
// The honest answer to "were these exact hours already paid?" would need a link from a payment back
// to the time logs it covered — and neither engine has one. `payout_batch_items` records
// `hours_cents`, an aggregate; `pay_stubs` records `regular_hours`, likewise. Nothing points at a
// `daily_time_logs.id`.
//
// So this checks the only thing that IS recorded: the period. Two settlements whose date ranges
// overlap are covering some of the same days, and that is enough to stop and make somebody look.
// It is deliberately conservative in one direction — a genuine second payment for the same week (a
// missed bonus, a correction) is refused and has to be made deliberately somewhere else — because
// the opposite error pays a person's whole week twice and is found by reconciling a bank statement
// weeks later, if at all.
//
// Voided batches and cancelled runs are ignored: they settled nothing.

/** A settlement that already exists, from either engine. */
export interface ExistingSettlement {
  id: string;
  /** Which engine produced it — named in the message so somebody knows where to look. */
  kind: 'payroll_run' | 'payout_batch';
  /** Inclusive, 'YYYY-MM-DD'. Null on either side means the settlement has no bounded period. */
  from: string | null;
  to: string | null;
  status: string;
  /** For the message: a label or a date somebody can recognise. */
  label?: string | null;
}

export interface OverlapResult {
  /** True when the proposed period is clear. */
  ok: boolean;
  /** Everything it collides with, most recent first. */
  conflicts: ExistingSettlement[];
  /** A sentence for the person who just pressed the button. Null when `ok`. */
  message: string | null;
}

/** Statuses that mean "this settled nothing" — the only ones safe to ignore. */
const DEAD = new Set(['voided', 'cancelled', 'failed']);

/** Two inclusive date ranges overlap unless one ends before the other starts. */
function overlaps(aFrom: string, aTo: string, bFrom: string, bTo: string): boolean {
  return aFrom <= bTo && bFrom <= aTo;
}

const describe = (s: ExistingSettlement): string => {
  const what = s.kind === 'payroll_run' ? 'a payroll run' : 'a payout batch';
  const when = s.from && s.to ? ` covering ${s.from} to ${s.to}` : '';
  const named = s.label ? ` (“${s.label}”)` : '';
  return `${what}${named}${when}, currently ${s.status}`;
};

/**
 * Is this period already covered by an existing settlement?
 *
 * Pure, so the rule can be tested without either engine. The caller supplies whatever it found; this
 * decides, and writes the sentence.
 *
 * A settlement with no bounded period is treated as NOT overlapping. That sounds permissive and is
 * the right call: an ad-hoc payout with no week attached is a one-off correction, not a settlement
 * of a period, and blocking every future run because one exists would make the guard something
 * people route around.
 */
export function findPeriodOverlap(
  proposed: { from: string; to: string },
  existing: readonly ExistingSettlement[],
): OverlapResult {
  if (!proposed.from || !proposed.to || proposed.from > proposed.to) {
    return {
      ok: false,
      conflicts: [],
      message: 'The pay period is not a valid range — the start date must not be after the end date.',
    };
  }

  const conflicts = existing
    .filter((s) => !DEAD.has((s.status ?? '').toLowerCase()))
    .filter((s) => !!s.from && !!s.to)
    .filter((s) => overlaps(proposed.from, proposed.to, s.from as string, s.to as string))
    .sort((a, b) => ((b.from ?? '') < (a.from ?? '') ? -1 : 1));

  if (conflicts.length === 0) return { ok: true, conflicts: [], message: null };

  const list = conflicts.slice(0, 3).map(describe).join('; ');
  const more = conflicts.length > 3 ? ` (and ${conflicts.length - 3} more)` : '';
  return {
    ok: false,
    conflicts,
    // Names what it collides with and what to do, because "conflict detected" leaves somebody
    // guessing whether the week was paid or not — which is the question that matters.
    message:
      `${proposed.from} to ${proposed.to} is already covered by ${list}${more}. `
      + 'Paying it again would pay the same hours twice. Void or narrow the existing one first, or '
      + 'record a one-off adjustment instead.',
  };
}

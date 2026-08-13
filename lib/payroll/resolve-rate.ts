// lib/payroll/resolve-rate.ts
//
// THE PAY MODEL — DELIBERATELY SIMPLE (owner decision, 2026-08-04)
// ═══════════════════════════════════════════════════════════════
//
// *"I want it so that people are just set at base pay. One person might be set at one base pay, and
// another person might be set at something else. Then we will have specific activity payment, such
// as driving and stuff. Those types of activities should just be set and should be the same for
// everyone. If people are riding in a vehicle for an hour to a job, then they all get $15. Of
// course, this can be overridden by the person paying the money out. Let's just simplify the whole
// thing and put the whole pay progression and seniority thing on hold and hide it from surfacing
// for now."*
//
// There are exactly two rules and one escape hatch:
//
//   1. **Every person has a base pay.** Set per person; one is on $25, another on $18. It is what
//      an hour of their work costs unless something more specific applies.
//   2. **Some activities have a flat rate, the same for everybody.** Riding to a job pays $15 —
//      for the party chief and for the intern alike. The activity rate **replaces** base pay for
//      those hours; it is not added to it and it is not floored by it. That is what "the same for
//      everyone" means, and it is the whole reason these rates exist: the work is worth what it is
//      worth regardless of who does it.
//   3. **Whoever pays can override anything.** A rate typed on a payout outranks both rules.
//
// ── WHAT THIS DELIBERATELY DOES NOT DO ──────────────────────────────────────────────────────────
//
// Role tiers, seniority brackets, credential bonuses and XP milestones are **parked, not deleted**.
// The tables stay seeded and `lib/payroll/effective-rate.ts` still holds the graduated formula with
// its tests, so the day the owner wants it back it is a wiring job rather than a rebuild:
//
//   *"Eventually we might work with balancing everything for job types, role types, seniority,
//   certifications/education level, etc, but for now we need to just keep it super simple."*
//
// Nothing in the live pay path reads them. That is the point — a half-applied progression system is
// how one employee ended up with three different hourly rates and no rule for choosing between
// them. See `docs/planning/in-progress/PAY_MODEL_CONSOLIDATION_2026-08-04.md` for the full account
// of what that cost.
//
// Pure and deterministic, no I/O, so the hours picker, the approval screen and the payroll run
// cannot drift apart. When the rules change, change them here and in
// `__tests__/payroll/resolve-rate.test.ts` in the same commit.

/** Which rule produced the number. Always reported; never inferred by the reader. */
export type RateSource = 'manual' | 'override' | 'activity' | 'base' | 'unset';

/**
 * Stored in `daily_time_logs.work_type` when somebody submits hours without choosing an activity —
 * *"submit the hours without any payment option and the boss can decide what is fair."*
 *
 * The column is NOT NULL, so the absence needs a name. This value deliberately matches no row in
 * `work_type_rates`, which is what makes such an entry fall through to the person's base pay. Do
 * not add a `work_type_rates` row with this key — that would give the sentinel a price and turn
 * "no particular activity" into an activity.
 */
export const UNSPECIFIED_WORK_TYPE = 'unspecified';

/**
 * Stored in `daily_time_logs.work_type` when somebody deliberately attaches **no rate at all**.
 *
 * *"Make it so that we can log hours without assigning any specific pay rate at all if we don't
 * want to assign one. The pay rate selection should be optional, and it shouldn't be pointing to
 * a specific pay rate by default."*
 *
 * Distinct from `UNSPECIFIED_WORK_TYPE`, and the distinction is the whole point. "No particular
 * activity" still means ordinary work at the person's base pay — a number. "No rate" means the
 * hours are recorded and the money is somebody else's decision. Collapsing the two would put a
 * figure on hours the submitter explicitly declined to price.
 */
export const UNPRICED_WORK_TYPE = 'unpriced';

/**
 * How an activity is priced.
 *
 *   `base` — pays the person's own base pay. Field work is $25 for somebody on $25 and $18 for
 *            somebody on $18, because it is just their job. `base_rate` on the row is ignored.
 *   `flat` — pays a set rate to everybody. *"If people are riding in a vehicle for an hour to a
 *            job, then they all get $15."*
 *
 * Anything unrecognised is treated as `base`, which pays people their normal rate — the safe wrong
 * answer. Treating an unknown mode as `flat` would put everybody on whatever number happened to be
 * in the column.
 */
export type RateMode = 'base' | 'flat';

/** An activity someone can log hours against. Mirrors a `work_type_rates` row. */
export interface ActivityRate {
  work_type: string;
  /** Used only when `rate_mode` is `flat`. */
  base_rate: number;
  rate_mode?: RateMode | string | null;
}

/** A standing per-person pinned rate (`user_pay_overrides.fixed_rate`). */
export interface PayOverride {
  fixed_rate?: number | null;
}

export interface ResolveRateInput {
  /** A rate typed by whoever is paying, for this entry. Outranks everything. */
  manualRate?: number | null;
  /** A standing pin on this person. Outranks the activity rate and their base pay. */
  override?: PayOverride | null;
  /** The activity, when the hour is tagged with one. Null → the hour falls to base pay. */
  activity?: ActivityRate | null;
  /** `employee_profiles.hourly_rate` — this person's agreed rate. */
  basePay?: number | null;
  /**
   * The submitter attached no rate on purpose. Resolves to `unset` — the hours are recorded,
   * the money is left to whoever approves them.
   */
  unpriced?: boolean;
}

export interface ResolvedRate {
  /** The rate, or **null** when nothing sets one. Never a stand-in zero. */
  rate: number | null;
  source: RateSource;
  /** One sentence naming where the number came from, for display beside it. */
  explanation: string;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const money = (n: number) => `$${n.toFixed(2)}`;

/** Is `value` a usable rate? Rejects null/undefined/NaN — and negatives, which are never a rate. */
function isRate(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

/**
 * Is this an AGREED base rate, as opposed to a column nobody filled in?
 *
 * ── WHY 0 IS NOT A BASE RATE (found 2026-08-12) ─────────────────────────────────────────────────
 *
 * `employee_profiles.hourly_rate` is `numeric(10,2) DEFAULT 0 NOT NULL`. It cannot hold null, so
 * "nobody has agreed a rate with this person yet" is stored as **0** — and `isRate` accepted 0,
 * which meant every hour that person logged resolved to:
 *
 *     { rate: 0, source: 'base', explanation: '$0.00/hr — base pay.' }
 *
 * Priced. Decided. Worth nothing. A new hire whose profile was created without a rate would have
 * every hour settled at $0.00, `owed` would report them fully paid up, and a pay stub would print
 * $0.00/hr — the precise thing the header of this file says must never happen: *"a zero totals into
 * a payroll figure and reads as 'worked for free'; null reads as 'nobody has set this yet', which
 * is both true and actionable."* The module's own principle, defeated by a column default.
 *
 * Rejecting 0 here sends it to `unset` instead, which is the honest answer and the one that puts the
 * hours in front of an approver.
 *
 * **Only base pay.** A manual rate, a standing override and a flat activity rate are all values a
 * person typed on purpose, so a 0 there is at least arguably deliberate, and none of them has a
 * column default that manufactures zeros. The mechanism for "this day is worth nothing" is a pay
 * DECISION with `total_pay: 0`, which is a separate and deliberate act that this does not touch.
 */
function isAgreedBasePay(value: unknown): value is number {
  return isRate(value) && value > 0;
}

/** Turn `field_work` into `field work` for a sentence. */
function readable(workType: string): string {
  return workType.replace(/_/g, ' ');
}

/**
 * Does this activity pay a set rate to everybody?
 *
 * Only the exact string `flat` counts. Anything else — including a mode nobody has set yet, or a
 * typo — means base pay, so a misconfigured row pays people their normal rate rather than whatever
 * number is sitting in `base_rate`.
 */
function isFlat(activity: ActivityRate): boolean {
  return activity.rate_mode === 'flat';
}

/**
 * Resolve what one hour is worth.
 *
 * Reading the result: `rate` is the number to pay, `source` is the rule that produced it, and
 * `explanation` is the sentence to show next to it. A `rate` of null means *unset* — show that
 * word, not a zero. A zero totals into a payroll figure and reads as "worked for free"; null reads
 * as "nobody has set this yet", which is both true and actionable.
 */
export function resolvePayRate(input: ResolveRateInput): ResolvedRate {
  // 1 — whoever is paying said so. *"Of course, this can be overridden by the person paying the
  // money out."*
  if (isRate(input.manualRate)) {
    const rate = round2(Number(input.manualRate));
    return { rate, source: 'manual', explanation: `${money(rate)}/hr — set by hand for this entry.` };
  }

  // 2 — the submitter deliberately attached no rate.
  //
  // Below the manual rate, because the whole point is deferring to whoever approves. Above
  // everything else — including a standing pin — because any of those would put a number on hours
  // the person explicitly declined to price.
  if (input.unpriced) {
    return {
      rate: null,
      source: 'unset',
      explanation: 'No rate attached — whoever approves these hours will decide what they are worth.',
    };
  }

  // 3 — a standing pin on this person.
  const fixed = input.override?.fixed_rate;
  if (isRate(fixed)) {
    const rate = round2(Number(fixed));
    return { rate, source: 'override', explanation: `${money(rate)}/hr — a fixed rate is set for this person.` };
  }

  // 4 — a set rate for this activity, the same for everybody who does that work.
  //
  // Note what is NOT here: no floor at the person's base pay. Driving pays $15 to everyone, and
  // lifting it to a $25 base for one person would make the rate not-the-same-for-everyone, which is
  // the one property these rates are for.
  if (input.activity && isFlat(input.activity) && isRate(input.activity.base_rate)) {
    const rate = round2(Number(input.activity.base_rate));
    return {
      rate,
      source: 'activity',
      explanation: `${money(rate)}/hr — the set rate for ${readable(input.activity.work_type)}, the same for everyone.`,
    };
  }

  // 5 — ordinary work: this person's own base pay, whether or not an activity is named.
  //
  // *"I want to log 7 hours of field work at $25 an hour"* — $25 because that is what THEY are on,
  // not because field work has a price. Naming the activity still records what they did.
  if (isAgreedBasePay(input.basePay)) {
    const rate = round2(Number(input.basePay));
    return {
      rate,
      source: 'base',
      explanation: input.activity
        ? `${money(rate)}/hr — base pay, the rate for ${readable(input.activity.work_type)}.`
        : `${money(rate)}/hr — base pay.`,
    };
  }

  // 6 — nothing to go on. Say so.
  return {
    rate: null,
    source: 'unset',
    explanation: 'No rate set — this person has no base pay and the hours carry no set activity.',
  };
}

/**
 * Total a set of hour-blocks.
 *
 * This is the shape the owner described: *"someone might draw for a couple hours, and also work in
 * the field for about 6 hours… the boss might choose to pay the rate for drawing for 2 hours and
 * the field work rate for 6 hours, or just give them the base pay for the whole time."* Each block
 * resolves independently, so a day can mix sources and the total still adds up from stated parts
 * rather than one blended figure.
 *
 * Blocks whose rate is `unset` contribute **no money and are counted separately**, so an undecided
 * block cannot quietly total as free labour.
 */
export interface HourBlock {
  hours: number;
  resolved: Pick<ResolvedRate, 'rate'>;
  label?: string;
}

export interface PayTotal {
  /** Money for the blocks that have a rate. */
  amount: number;
  /** Hours that produced that money. */
  paidHours: number;
  /** Hours sitting on blocks with no rate — awaiting a decision, not worth zero. */
  unsetHours: number;
  /** Blended $/hr across paid hours only, or null when nothing is paid. */
  blendedRate: number | null;
}

export function totalHourBlocks(blocks: HourBlock[]): PayTotal {
  let amount = 0;
  let paidHours = 0;
  let unsetHours = 0;

  for (const block of blocks) {
    const hours = Number(block.hours);
    if (!Number.isFinite(hours) || hours <= 0) continue;
    if (block.resolved.rate === null || block.resolved.rate === undefined) {
      unsetHours += hours;
      continue;
    }
    amount += hours * block.resolved.rate;
    paidHours += hours;
  }

  return {
    amount: round2(amount),
    paidHours: round2(paidHours),
    unsetHours: round2(unsetHours),
    blendedRate: paidHours > 0 ? round2(amount / paidHours) : null,
  };
}

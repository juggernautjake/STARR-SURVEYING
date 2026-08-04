// lib/payroll/resolve-rate.ts
//
// ONE ANSWER TO "WHAT DOES THIS HOUR COST" (owner request, 2026-08-04)
// ═══════════════════════════════════════════════════════════════════
//
// *"We need one central consolidated model for all payments, and we need to have full control over
// custom pay rates and that kind of thing. Please make everything uniform and intuitive."*
//
// Before this file there were three, and they shared no tables, so they could not agree except by
// coincidence. For the firm's one employee — a party chief, hired 2025-07-15 — they said:
//
//   | Model | Where it lives | Says |
//   |---|---|---|
//   | Flat base | `employee_profiles.hourly_rate` | **$25.00** — what My Pay shows |
//   | Activity stack | `work_type_rates` + `role_tiers` + `seniority_brackets` + … via `computeEffectiveRate` | **$30.50** for field work — what the pay-progression page shows |
//   | Title standards | `pay_rate_standards` + `role_pay_adjustments` | **$28.00** — what `/api/admin/payroll/runs` puts on a pay stub |
//
// The third one is the one that actually cuts a cheque, and it was the only one nobody was looking
// at. Worse, the two vocabularies disagree too: `pay_rate_standards.job_title` says
// `survey_technician` / `lead_rpls` where `role_tiers.role_key` says `survey_tech` / `rpls`, so a
// join between them silently matches nothing rather than failing loudly.
//
// WHY IT IS SAFE TO CONSOLIDATE NOW. Every transactional pay table is empty — `daily_time_logs`,
// `job_time_entries`, `payroll_runs`, `pay_stubs`, `payout_batches`, `pay_advance_requests`,
// `balance_transactions` all have zero rows. Only the *config* tables are seeded. So there is no
// history to migrate and nobody has been paid on the wrong number. This is the last moment when
// this costs nothing, which is the argument for doing it rather than patching around it again.
//
// ── THE CONSOLIDATED MODEL ──────────────────────────────────────────────────────────────────────
//
// Every rate in the platform resolves through this one function, and every rate it returns carries
// a `source` naming which rule produced it. Precedence, highest first:
//
//   1. `manual`   — whoever approves the pay typed an amount for this entry. The owner asked for
//                   exactly this: *"he might want to just give them the base pay for the whole
//                   time, or he will pay them some unique amount."* A human decision outranks
//                   every table, and is recorded as such rather than back-fitted into a formula.
//   2. `override` — `user_pay_overrides.fixed_rate`. A standing per-person pin: "Hank is on $32,
//                   full stop." This is the "full control over custom pay rates" hook.
//   3. `activity` — the designed stack in `computeEffectiveRate`: the activity's base rate, plus
//                   role tier, seniority, credentials and XP, with the caps. Used when the hour is
//                   tagged with what kind of work it was.
//   4. `base`     — `employee_profiles.hourly_rate`, for an hour with no activity on it. The owner
//                   asked to be able to submit hours with no rate chosen; this is what that costs
//                   until somebody decides otherwise.
//   5. `unset`    — nothing to go on. Returns **null, not zero**. A zero is a number that totals
//                   into a payroll figure and reads as "worked for free"; null reads as "nobody has
//                   set this yet", which is the true statement and the one that prompts an action.
//
// ── BASE PAY IS A FLOOR, NOT A FOURTH NUMBER ────────────────────────────────────────────────────
//
// This is the decision that makes the $25 and the $30.50 both true instead of contradictory.
//
// An agreed hourly rate is a promise: you do not earn less than it because of what you happened to
// do that day. Driving pays $16/hr as an activity; a party chief on an agreed $25 who spends the
// morning driving has not agreed to a $9 pay cut. So the activity rate is floored at the person's
// agreed base, and when the floor bites we say so — `floorApplied` — rather than quietly showing a
// number whose provenance the reader can't see.
//
// The alternative (activity rate stands, base pay is just a display field) is defensible in a shop
// where the activity rates ARE the deal. It is not what this firm's data says: one person has an
// agreed $25 and the activity table would pay them $16 to drive. Encoding the floor is what turns
// "the system disagrees with itself" into "the system has a rule".
//
// ── WHAT THE RETIRED MODEL KNEW THAT THE NEW ONE DIDN'T ─────────────────────────────────────────
//
// `pay_rate_standards` and `role_pay_adjustments` are being folded in, not deleted, because each
// held one real idea the activity stack could not express:
//
//   • **A band per grade.** `pay_rate_standards` gives every title a min/max ($22–$40 for a party
//     chief). Full control over custom rates needs bounds to *warn* against — not to forbid, since
//     the owner is the authority, but so that typing $8 for a party chief says something before it
//     is saved. `outOfBand` reports it; it never blocks.
//   • **Acting-up pay.** `role_pay_adjustments` says a survey technician who runs a crew as party
//     chief for the day gets +$5/hr. `work_type_rates` describes what kind of work; `role_tiers`
//     describes your standing grade; neither can say "you filled a bigger role today". That is a
//     real thing on a survey crew, so `actingBonus` keeps it.
//
// Pure, deterministic, no I/O — same rule as `effective-rate.ts`, so the hours picker, the approval
// screen, the payroll run and the pay-progression page cannot drift apart again. When the formula
// changes, change it here and in `__tests__/payroll/resolve-rate.test.ts` in the same commit.

import {
  computeEffectiveRate,
  type EffectiveRateBreakdown,
  type CredentialRow,
  type PayOverrideRow,
  type RoleTierRow,
  type SeniorityBracketRow,
  type SystemCaps,
  type WorkTypeRow,
  type XpMilestoneRow,
} from './effective-rate';

/** Which rule produced the number. Always reported; never inferred by the reader. */
export type RateSource = 'manual' | 'override' | 'activity' | 'base' | 'unset';

/**
 * Stored in `daily_time_logs.work_type` when somebody submits hours without choosing an activity —
 * *"submit the hours without any payment option and the boss can decide what is fair."*
 *
 * The column is NOT NULL, so the absence needs a name. This value deliberately matches no row in
 * `work_type_rates`, which is what makes such an entry resolve to the person's agreed base pay
 * instead of an activity rate. Do not add a `work_type_rates` row with this key — that would give
 * the sentinel a price and turn "undecided" back into a number.
 */
export const UNSPECIFIED_WORK_TYPE = 'unspecified';

/** The min/max band for a grade, folded in from `pay_rate_standards`. Advisory, never a block. */
export interface RateBand {
  min: number;
  max: number;
}

export interface ResolveRateInput {
  /** A human's decision for this specific entry. Outranks everything. */
  manualRate?: number | null;
  /** Standing per-person override (`user_pay_overrides`). `fixed_rate` pins; the rest scale. */
  override?: PayOverrideRow | null;
  /** The activity, when the hour is tagged with one. Null → the hour is uncategorised. */
  workType?: WorkTypeRow | null;
  /** `employee_profiles.hourly_rate` — the agreed rate. Acts as the floor. */
  basePay?: number | null;
  /** The person's standing grade. */
  tier?: RoleTierRow | null;
  /** A bigger role filled for this entry only (`role_pay_adjustments`). Added on top. */
  actingBonus?: number | null;
  yearsEmployed?: number;
  seniority?: SeniorityBracketRow[];
  earnedCredentialKeys?: string[];
  credentials?: CredentialRow[];
  totalXp?: number;
  xpMilestones?: XpMilestoneRow[];
  caps?: SystemCaps;
  /** Advisory band for the person's grade. Reported when the result falls outside it. */
  band?: RateBand | null;
}

export interface ResolvedRate {
  /** The rate, or **null** when nothing sets one. Never a stand-in zero. */
  rate: number | null;
  source: RateSource;
  /** One sentence naming where the number came from, for display beside it. */
  explanation: string;
  /** The activity stack's working, when `source` is `activity`. Null otherwise. */
  breakdown: EffectiveRateBreakdown | null;
  /** True when the agreed base pay lifted an activity rate that came in below it. */
  floorApplied: boolean;
  /** Acting-up pay included in the result, in $/hr. */
  actingBonus: number;
  /** Set when the result sits outside the grade's advisory band. Informational only. */
  outOfBand: { band: RateBand; direction: 'below' | 'above' } | null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const money = (n: number) => `$${n.toFixed(2)}`;

/** Is `value` a usable rate? Rejects null/undefined/NaN — and negatives, which are never a rate. */
function isRate(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function bandCheck(rate: number, band: RateBand | null | undefined): ResolvedRate['outOfBand'] {
  if (!band || !isRate(band.min) || !isRate(band.max)) return null;
  if (rate < band.min) return { band, direction: 'below' };
  if (rate > band.max) return { band, direction: 'above' };
  return null;
}

/**
 * Resolve what one hour is worth, under the one model.
 *
 * Reading the result: `rate` is the number to pay, `source` is the rule that produced it, and
 * `explanation` is the sentence to show next to it. A `rate` of null means *unset* — show that
 * word, not a zero.
 */
export function resolvePayRate(input: ResolveRateInput): ResolvedRate {
  const acting = isRate(input.actingBonus) ? Number(input.actingBonus) : 0;
  const base = isRate(input.basePay) ? Number(input.basePay) : null;

  const blank: Omit<ResolvedRate, 'rate' | 'source' | 'explanation'> = {
    breakdown: null,
    floorApplied: false,
    actingBonus: 0,
    outOfBand: null,
  };

  // 1 — a human said so. Acting-up pay is NOT added: a typed amount is the whole answer, otherwise
  // the person approving it would see a different number than the one they entered.
  if (isRate(input.manualRate)) {
    const rate = round2(Number(input.manualRate));
    return {
      ...blank,
      rate,
      source: 'manual',
      explanation: `${money(rate)}/hr — set by hand for this entry.`,
      outOfBand: bandCheck(rate, input.band),
    };
  }

  // 2 — a standing pin on this person. Same reasoning: a pinned rate is the whole answer.
  const fixed = input.override?.fixed_rate;
  if (isRate(fixed)) {
    const rate = round2(Number(fixed));
    return {
      ...blank,
      rate,
      source: 'override',
      explanation: `${money(rate)}/hr — a fixed rate is set for this person.`,
      outOfBand: bandCheck(rate, input.band),
    };
  }

  // 3 — the activity stack, when we know what the work was.
  if (input.workType) {
    const breakdown = computeEffectiveRate({
      workType: input.workType,
      tier: input.tier ?? null,
      yearsEmployed: input.yearsEmployed ?? 0,
      seniority: input.seniority ?? [],
      earnedCredentialKeys: input.earnedCredentialKeys ?? [],
      credentials: input.credentials ?? [],
      totalXp: input.totalXp ?? 0,
      xpMilestones: input.xpMilestones ?? [],
      override: input.override ?? null,
      caps: input.caps,
    });

    const computed = round2(breakdown.effectiveRate + acting);
    // The floor compares against the computed rate INCLUDING acting-up pay — a technician acting as
    // party chief has genuinely earned that dollar, and floating the floor above it would erase a
    // bonus somebody was promised.
    const floorApplied = base !== null && computed < base;
    const rate = floorApplied ? round2(base) : computed;

    const parts = [`${money(breakdown.baseRate)} ${input.workType.work_type.replace(/_/g, ' ')}`];
    if (breakdown.roleBonus) parts.push(`${money(breakdown.roleBonus)} ${input.tier?.role_key?.replace(/_/g, ' ') ?? 'role'}`);
    if (breakdown.seniorityBonus) parts.push(`${money(breakdown.seniorityBonus)} seniority`);
    if (breakdown.credentialBonusCapped) parts.push(`${money(breakdown.credentialBonusCapped)} credentials`);
    if (breakdown.xpBonusCapped) parts.push(`${money(breakdown.xpBonusCapped)} experience`);
    if (breakdown.flatAddition) parts.push(`${money(breakdown.flatAddition)} adjustment`);
    if (acting) parts.push(`${money(acting)} acting up`);

    const explanation = floorApplied
      ? `${money(rate)}/hr — agreed base pay, which is above the ${money(computed)} this work would pay.`
      : `${money(rate)}/hr — ${parts.join(' + ')}.`;

    return {
      rate,
      source: 'activity',
      explanation,
      breakdown,
      floorApplied,
      actingBonus: acting,
      outOfBand: bandCheck(rate, input.band),
    };
  }

  // 4 — no activity on the hour. The agreed rate is what it costs until somebody decides otherwise.
  if (base !== null) {
    const rate = round2(base + acting);
    return {
      ...blank,
      rate,
      source: 'base',
      actingBonus: acting,
      explanation: acting
        ? `${money(rate)}/hr — agreed base pay plus ${money(acting)} acting up.`
        : `${money(rate)}/hr — agreed base pay, no activity recorded.`,
      outOfBand: bandCheck(rate, input.band),
    };
  }

  // 5 — nothing to go on. Say so.
  return {
    ...blank,
    rate: null,
    source: 'unset',
    explanation: 'No rate set — this person has no agreed pay and the hours carry no activity.',
  };
}

/**
 * Total a set of hour-blocks under the one model.
 *
 * This is the shape the owner described: *"someone might draw for a couple hours, and also work in
 * the field for about 6 hours… the boss might choose to pay the rate for drawing for 2 hours and
 * the field work rate for 6 hours, or just give them the base pay for the whole time."* Each block
 * resolves independently, so a day can mix sources — two hours on `activity`, six on `manual` — and
 * the total still adds up from stated parts rather than one blended figure.
 *
 * Blocks whose rate is `unset` contribute **no money and are counted separately**, so an
 * undecided block cannot quietly total as free labour.
 */
export interface HourBlock {
  hours: number;
  resolved: ResolvedRate;
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
    if (block.resolved.rate === null) {
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

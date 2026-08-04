// lib/payroll/pay-context.ts
//
// ONE READ, ONE ANSWER
// ════════════════════
//
// The server-side half of the pay model. `resolve-rate.ts` is the rule; this is the load.
//
// Two tables, and that is the whole of it:
//
//   • `employee_profiles.hourly_rate` — this person's base pay.
//   • `work_type_rates` — the flat activity rates, the same for everybody.
//
// Plus `user_pay_overrides_current` for a standing pinned rate, which is rare and usually empty.
//
// ── WHAT IS NOT LOADED, ON PURPOSE (owner decision, 2026-08-04) ─────────────────────────────────
//
// `role_tiers`, `seniority_brackets`, `credential_bonuses`, `xp_pay_milestones`,
// `pay_rate_standards` and `role_pay_adjustments` are **parked**. They stay seeded and
// `lib/payroll/effective-rate.ts` still holds the graduated formula with its tests, so restoring
// them is wiring rather than a rebuild. Nothing in the live pay path reads them:
//
//   *"Let's just simplify the whole thing and put the whole pay progression and seniority thing on
//   hold and hide it from surfacing for now… Eventually we might work with balancing everything for
//   job types, role types, seniority, certifications/education level, etc, but for now we need to
//   just keep it super simple."*
//
// `role_tiers` IS still read here — for the job-title label only, never for money. A grade is a
// useful thing to show next to somebody's name; it just does not change what they are paid.
//
// This is also the only place that knows which tables a rate depends on. Four separate readers is
// how the platform came to hold three different hourly rates for the same person.

import { supabaseAdmin } from '@/lib/supabase';
import { resolvePayRate, UNPRICED_WORK_TYPE, type PayOverride, type ResolvedRate } from './resolve-rate';
import { matchTier, resolveTierKey } from './tier-match';

/** A work type as the UI needs it — the flat rate plus its display fields. */
export interface WorkTypeOption {
  work_type: string;
  label: string;
  /** Only meaningful when `rate_mode` is 'flat'. */
  base_rate: number;
  /** 'base' = pays the person's own rate; 'flat' = pays `base_rate` to everybody. */
  rate_mode: 'base' | 'flat';
  icon: string | null;
  description: string | null;
}

interface TierRow {
  role_key: string;
  label: string;
  aliases: string[] | null;
}

export interface PayConfigTables {
  /** The flat activity rates. The same for everybody, by design. */
  workTypes: WorkTypeOption[];
  /** Grades — read for their labels only. They do not affect pay while progression is parked. */
  tiers: TierRow[];
}

export interface PersonPayFacts {
  email: string;
  name: string | null;
  /** `employee_profiles.hourly_rate` — this person's base pay. Null when never set. */
  basePay: number | null;
  tierKey: string | null;
  tierLabel: string | null;
  hireDate: string | null;
  override: PayOverride | null;
  /** False when the person has no `employee_profiles` row at all. */
  hasProfile: boolean;
}

/**
 * Load the firm-wide pay configuration. One round-trip per table, in parallel.
 *
 * Both lists default to empty rather than throwing, because a missing config table should degrade
 * a rate to "base pay only" rather than take down the hours page. What it must never do is
 * *silently* degrade — callers get the tables and can see for themselves that a list is empty.
 */
export async function loadPayConfig(): Promise<PayConfigTables> {
  const [workTypes, tiers] = await Promise.all([
    supabaseAdmin.from('work_type_rates').select('work_type, label, base_rate, rate_mode, icon, description').eq('is_active', true).order('sort_order'),
    supabaseAdmin.from('role_tiers').select('role_key, label, aliases').order('sort_order'),
  ]);

  return {
    workTypes: (workTypes.data ?? []) as WorkTypeOption[],
    tiers: (tiers.data ?? []) as TierRow[],
  };
}

/** Load the per-person facts a rate depends on: their base pay, their pin, and their job title. */
export async function loadPersonPayFacts(email: string, config: PayConfigTables): Promise<PersonPayFacts> {
  const [profileRes, overrideRes, userRes] = await Promise.all([
    supabaseAdmin.from('employee_profiles').select('user_name, job_title, tier_key, hourly_rate, hire_date').eq('user_email', email).maybeSingle(),
    supabaseAdmin.from('user_pay_overrides_current').select('fixed_rate').eq('user_email', email).maybeSingle(),
    supabaseAdmin.from('registered_users').select('name').eq('email', email).maybeSingle(),
  ]);

  const profile = profileRes.data as {
    user_name: string | null; job_title: string | null; tier_key: string | null;
    hourly_rate: number | null; hire_date: string | null;
  } | null;

  // `tier_key` first, `job_title` as the fallback — see the trap documented in `tier-match.ts`.
  // Live data has `tier_key` NULL for everybody, so the fallback is what carries the job title.
  const tierKey = resolveTierKey(profile);
  const tier = matchTier(config.tiers, tierKey);

  return {
    email,
    name: profile?.user_name ?? (userRes.data as { name: string | null } | null)?.name ?? null,
    basePay: profile?.hourly_rate ?? null,
    tierKey: tier?.role_key ?? tierKey,
    tierLabel: tier?.label ?? null,
    hireDate: profile?.hire_date ?? null,
    override: (overrideRes.data as PayOverride | null) ?? null,
    hasProfile: profile !== null,
  };
}

export interface RateRequest {
  /** The activity. Omit for an ordinary hour, which pays this person's base pay. */
  workType?: string | null;
  /** A rate typed by whoever is paying. Outranks everything. */
  manualRate?: number | null;
}

/** Resolve one rate for one person from already-loaded facts. No I/O. */
export function rateFor(person: PersonPayFacts, config: PayConfigTables, request: RateRequest = {}): ResolvedRate {
  // The sentinel means "no rate on purpose" and matches no `work_type_rates` row, so it must be
  // recognised here rather than falling through the lookup into base pay.
  const unpriced = request.workType === UNPRICED_WORK_TYPE;
  const activity = request.workType && !unpriced
    ? config.workTypes.find((w) => w.work_type === request.workType) ?? null
    : null;

  return resolvePayRate({
    manualRate: request.manualRate,
    override: person.override,
    activity,
    basePay: person.basePay,
    unpriced,
  });
}

export interface RateMenuEntry {
  work_type: string;
  label: string;
  icon: string | null;
  /** The set rate, when this activity has one. Meaningless for `base` activities. */
  base_rate: number;
  rate_mode: 'base' | 'flat';
  /** What this person is paid for it: the set rate, or their own base pay. */
  resolved: ResolvedRate;
}

/**
 * Every option an hour could be logged against, priced.
 *
 * The employee choosing an activity and the manager approving it read the same numbers from the
 * same call. The `base` entry is deliberately first: it is the ordinary case, and it is what
 * *"submit the hours without any payment option"* resolves to.
 */
export function rateMenuFor(person: PersonPayFacts, config: PayConfigTables) {
  return {
    person,
    /** No rate at all — the hours are recorded and the money is left to whoever approves. */
    unpriced: rateFor(person, config, { workType: UNPRICED_WORK_TYPE }),
    /** The no-activity option: this person's base pay, or `unset` when they have none. */
    base: rateFor(person, config),
    activities: config.workTypes.map<RateMenuEntry>((workType) => ({
      work_type: workType.work_type,
      label: workType.label,
      icon: workType.icon,
      base_rate: Number(workType.base_rate),
      rate_mode: workType.rate_mode === 'flat' ? 'flat' : 'base',
      resolved: rateFor(person, config, { workType: workType.work_type }),
    })),
  };
}

/** Load config and one person's facts together — the common case for a single-person screen. */
export async function loadPayContextFor(email: string) {
  const config = await loadPayConfig();
  const person = await loadPersonPayFacts(email, config);
  return { config, person };
}

// lib/payroll/pay-context.ts
//
// ONE READ, ONE ANSWER (owner request, 2026-08-04)
// ═══════════════════════════════════════════════
//
// The server-side half of the pay consolidation. `resolve-rate.ts` is the rule; this is the load.
//
// Before this file, four places computed a rate and each fetched its own inputs:
//
//   • `app/api/admin/time-logs/route.ts` — a private `calculateEffectiveRate()`, ~90 lines,
//     six sequential round-trips per rate, matching tiers with `.eq('role_key', job_title)` and
//     **no alias bridge**, so a profile reading `survey_technician` found no tier and lost its $6.
//   • `app/api/admin/payroll/runs/route.ts` — `hourly_rate + certBump + roleAdj`, an entirely
//     different formula off entirely different tables. This one writes pay stubs.
//   • `app/admin/pay-progression/*` — `computeEffectiveRate`, the designed model.
//   • `app/api/admin/time-logs/rates/route.ts` — `computeEffectiveRate`, added 2026-08-04.
//
// Four readers cannot stay in step by discipline. One loader can, so this is the only place that
// knows which tables a rate depends on.
//
// It also fixes a cost problem worth naming: the old per-rate loader issued six queries **per work
// type per person**, so pricing ten activities for one employee was sixty round-trips. Config is
// firm-wide and small — ten work types, fourteen tiers, nine brackets — so it is fetched once and
// the maths is done in memory.

import { supabaseAdmin } from '@/lib/supabase';
import {
  resolvePayRate,
  type RateBand,
  type ResolvedRate,
} from './resolve-rate';
import type {
  CredentialRow,
  PayOverrideRow,
  RoleTierRow,
  SeniorityBracketRow,
  SystemCaps,
  WorkTypeRow,
  XpMilestoneRow,
} from './effective-rate';
import { actingBonusFor, bandForTier, matchTier, resolveTierKey, type ActingAdjustmentLike, type RateStandardLike } from './tier-match';

/** A work type as the UI needs it — the rate row plus its display fields. */
export interface WorkTypeOption extends WorkTypeRow {
  label: string;
  icon: string | null;
  description: string | null;
}

interface TierRow extends RoleTierRow {
  label: string;
  aliases: string[] | null;
}

export interface PayConfigTables {
  workTypes: WorkTypeOption[];
  tiers: TierRow[];
  seniority: SeniorityBracketRow[];
  credentials: CredentialRow[];
  xpMilestones: XpMilestoneRow[];
  caps: SystemCaps;
  standards: RateStandardLike[];
  actingAdjustments: ActingAdjustmentLike[];
}

export interface PersonPayFacts {
  email: string;
  name: string | null;
  /** `employee_profiles.hourly_rate` — the agreed rate, and the floor. Null when never set. */
  basePay: number | null;
  tierKey: string | null;
  tierLabel: string | null;
  hireDate: string | null;
  yearsEmployed: number;
  earnedCredentialKeys: string[];
  totalXp: number;
  override: PayOverrideRow | null;
  band: RateBand | null;
  /** False when the person has no `employee_profiles` row at all. */
  hasProfile: boolean;
}

/** Milliseconds in an average Gregorian year — the same constant the pay-progression pages use. */
const YEAR_MS = 31_557_600_000;

/**
 * Load the firm-wide pay configuration. One round-trip per table, in parallel.
 *
 * Every list defaults to empty rather than throwing, because a missing config table should degrade
 * a rate to "base activity only" rather than take down the hours page. What it must never do is
 * *silently* degrade — callers get the tables and can see for themselves that a list is empty.
 */
export async function loadPayConfig(): Promise<PayConfigTables> {
  const [workTypes, tiers, seniority, credentials, xpMilestones, config, standards, adjustments] = await Promise.all([
    supabaseAdmin.from('work_type_rates').select('*').eq('is_active', true).order('sort_order'),
    supabaseAdmin.from('role_tiers').select('*').order('sort_order'),
    supabaseAdmin.from('seniority_brackets').select('*').order('min_years'),
    supabaseAdmin.from('credential_bonuses').select('*').order('sort_order'),
    supabaseAdmin.from('xp_pay_milestones').select('*').order('xp_threshold'),
    supabaseAdmin.from('pay_system_config').select('key, value'),
    supabaseAdmin.from('pay_rate_standards').select('job_title, min_rate, max_rate, default_rate'),
    supabaseAdmin.from('role_pay_adjustments').select('base_title, role_on_job, adjustment_type, adjustment_amount').eq('is_active', true),
  ]);

  const cfg: Record<string, number> = {};
  for (const row of (config.data ?? []) as { key: string; value: number }[]) cfg[row.key] = Number(row.value);

  return {
    workTypes: (workTypes.data ?? []) as WorkTypeOption[],
    tiers: (tiers.data ?? []) as TierRow[],
    seniority: (seniority.data ?? []) as SeniorityBracketRow[],
    credentials: (credentials.data ?? []) as CredentialRow[],
    xpMilestones: (xpMilestones.data ?? []) as XpMilestoneRow[],
    caps: {
      max_credential_stack: cfg.max_credential_stack ?? 8,
      max_xp_milestone_bonus: cfg.max_xp_milestone_bonus ?? 3,
    },
    standards: (standards.data ?? []) as RateStandardLike[],
    actingAdjustments: (adjustments.data ?? []) as ActingAdjustmentLike[],
  };
}

/**
 * Load the per-person facts a rate depends on.
 *
 * `verified` credentials only — an unverified claim to an RPLS licence must not raise anybody's
 * pay, which is the whole reason the column exists.
 */
export async function loadPersonPayFacts(email: string, config: PayConfigTables): Promise<PersonPayFacts> {
  const [profileRes, credsRes, xpRes, overrideRes, userRes] = await Promise.all([
    supabaseAdmin.from('employee_profiles').select('user_name, job_title, tier_key, hourly_rate, hire_date, total_earned').eq('user_email', email).maybeSingle(),
    supabaseAdmin.from('employee_earned_credentials').select('credential_key').eq('user_email', email).eq('verified', true),
    supabaseAdmin.from('xp_milestone_achievements').select('id', { count: 'exact', head: true }).eq('user_email', email),
    supabaseAdmin.from('user_pay_overrides_current').select('*').eq('user_email', email).maybeSingle(),
    supabaseAdmin.from('registered_users').select('name').eq('email', email).maybeSingle(),
  ]);

  const profile = profileRes.data as {
    user_name: string | null; job_title: string | null; tier_key: string | null;
    hourly_rate: number | null; hire_date: string | null; total_earned: number | null;
  } | null;

  // `tier_key` first, `job_title` as the fallback — see the trap documented in `tier-match.ts`.
  // Live data has tier_key NULL for everybody, so the fallback is what carries the role bonus today.
  const tierKey = resolveTierKey(profile);
  const tier = matchTier(config.tiers, tierKey);

  const yearsEmployed = profile?.hire_date
    ? Math.max(0, Math.floor((Date.now() - new Date(profile.hire_date).getTime()) / YEAR_MS))
    : 0;

  return {
    email,
    name: profile?.user_name ?? (userRes.data as { name: string | null } | null)?.name ?? null,
    basePay: profile?.hourly_rate ?? null,
    tierKey: tier?.role_key ?? tierKey,
    tierLabel: tier?.label ?? null,
    hireDate: profile?.hire_date ?? null,
    yearsEmployed,
    earnedCredentialKeys: ((credsRes.data ?? []) as { credential_key: string }[]).map((c) => c.credential_key),
    // XP is counted in milestones reached, matching what the old inline calculation did. The
    // pay-progression page reads `total_earned` instead; that discrepancy is noted in the plan doc
    // rather than papered over here, because picking one silently is how the split started.
    totalXp: (xpRes.count ?? 0) * 10_000,
    override: (overrideRes.data as PayOverrideRow | null) ?? null,
    band: bandForTier(config.standards, config.tiers, tierKey),
    hasProfile: profile !== null,
  };
}

export interface RateRequest {
  /** The activity. Omit for an uncategorised hour, which resolves to the agreed base pay. */
  workType?: string | null;
  /** A bigger role filled for this entry (acting-up pay). */
  roleOnJob?: string | null;
  /** A hand-set amount, which outranks every table. */
  manualRate?: number | null;
}

/** Resolve one rate for one person from already-loaded facts. No I/O. */
export function rateFor(person: PersonPayFacts, config: PayConfigTables, request: RateRequest = {}): ResolvedRate {
  const workType = request.workType
    ? config.workTypes.find((w) => w.work_type === request.workType) ?? null
    : null;

  return resolvePayRate({
    manualRate: request.manualRate,
    override: person.override,
    workType,
    basePay: person.basePay,
    tier: matchTier(config.tiers, person.tierKey),
    actingBonus: actingBonusFor(config.actingAdjustments, person.tierKey, request.roleOnJob),
    yearsEmployed: person.yearsEmployed,
    seniority: config.seniority,
    earnedCredentialKeys: person.earnedCredentialKeys,
    credentials: config.credentials,
    totalXp: person.totalXp,
    xpMilestones: config.xpMilestones,
    caps: config.caps,
    band: person.band,
  });
}

export interface RateMenuEntry {
  work_type: string;
  label: string;
  icon: string | null;
  /** The activity's list price — what everybody sees on the rate card. */
  base_rate: number;
  /** What THIS person earns for it, all rules applied. */
  resolved: ResolvedRate;
}

/**
 * Every option a person could log an hour against, priced for them.
 *
 * This is what the hours picker and the approval screen both render, which is the point: the
 * employee choosing an activity and the manager approving it are reading the same numbers from the
 * same call. The `base` entry is deliberately first — the owner asked to *"just have it where we
 * can apply the base pay too"* and to be able to submit *"without any payment option"*, and both of
 * those are this row.
 */
export function rateMenuFor(person: PersonPayFacts, config: PayConfigTables, roleOnJob?: string | null) {
  return {
    person,
    /** The no-activity option: the agreed rate, or `unset` when the person has no agreed rate. */
    base: rateFor(person, config, { roleOnJob }),
    activities: config.workTypes.map<RateMenuEntry>((workType) => ({
      work_type: workType.work_type,
      label: workType.label,
      icon: workType.icon,
      base_rate: Number(workType.base_rate),
      resolved: rateFor(person, config, { workType: workType.work_type, roleOnJob }),
    })),
  };
}

/** Load config and one person's facts together — the common case for a single-person screen. */
export async function loadPayContextFor(email: string) {
  const config = await loadPayConfig();
  const person = await loadPersonPayFacts(email, config);
  return { config, person };
}

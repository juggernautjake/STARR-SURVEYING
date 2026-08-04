// lib/payroll/tier-match.ts
//
// THREE VOCABULARIES FOR ONE JOB TITLE
// ════════════════════════════════════
//
// Part of the pay consolidation (see `resolve-rate.ts`). The pay tables do not agree on what a job
// is called, and the disagreement is invisible because a mismatched join returns no row rather
// than an error:
//
//   `employee_profiles.job_title`   → 'party_chief'      (free text, whatever the form wrote)
//   `role_tiers.role_key`           → 'survey_tech', 'rpls', 'admin_staff'
//   `pay_rate_standards.job_title`  → 'survey_technician', 'lead_rpls', 'office_tech'
//
// So `pay_rate_standards` and `role_tiers` describe the same six grades under different keys, and
// a naive `role_key === job_title` match finds nothing for half of them. Nothing found means no
// role bonus, which means a quiet pay cut — the failure mode is money, not an exception.
//
// `role_tiers.aliases` already carries every spelling ('survey_technician' and 'Survey Technician'
// both live under `survey_tech`). This module is the one place that uses it, so the bridge exists
// once instead of being re-derived per route.
//
// ── THE tier_key TRAP ───────────────────────────────────────────────────────────────────────────
//
// `PAY_PROGRESSION_OVERHAUL.md` P-6 added `employee_profiles.tier_key` intending it to replace
// `job_title`, with a backfill. **Live data as of 2026-08-04: `tier_key` is NULL and `job_title` is
// 'party_chief'** — the seed was written but the column never filled. Code that reads `tier_key`
// alone therefore finds no tier for anybody, and pays every person their activity base rate with no
// role bonus at all. `resolveTierKey` reads `tier_key` first and falls back to `job_title`, so the
// migration can finish whenever without a pay incident in between.

export interface TierLike {
  role_key: string;
  aliases?: string[] | null;
}

export interface RateStandardLike {
  job_title: string;
  min_rate: number | null;
  max_rate: number | null;
  default_rate?: number | null;
}

/** Lower-case and strip separators so 'Survey Technician', 'survey_technician' and 'survey tech' compare equal. */
function norm(value: string): string {
  return value.toLowerCase().replace(/[\s_-]+/g, '');
}

/**
 * Find the tier a title belongs to, by key or by any alias.
 *
 * Returns null rather than guessing. A wrong tier is worse than no tier: no tier shows as "grade
 * not set" and gets fixed, whereas a wrong one pays a wrong amount that looks deliberate.
 */
export function matchTier<T extends TierLike>(tiers: T[], title: string | null | undefined): T | null {
  if (!title) return null;
  const want = norm(title);
  for (const tier of tiers) {
    if (norm(tier.role_key) === want) return tier;
    for (const alias of tier.aliases ?? []) {
      if (norm(alias) === want) return tier;
    }
  }
  return null;
}

/**
 * The tier key for an employee profile, preferring the new column and falling back to the old one.
 * See the `tier_key` trap above — the fallback is load-bearing today, not defensive tidiness.
 */
export function resolveTierKey(
  profile: { tier_key?: string | null; job_title?: string | null } | null | undefined,
): string | null {
  return profile?.tier_key || profile?.job_title || null;
}

/**
 * The advisory min/max band for a grade, folded in from `pay_rate_standards`.
 *
 * Matched through the same alias bridge, because the two tables spell the grades differently. A
 * band with no usable numbers returns null rather than `{min: 0, max: 0}`, which would flag every
 * rate in the firm as "above band".
 */
export function bandForTier(
  standards: RateStandardLike[],
  tiers: TierLike[],
  tierKey: string | null | undefined,
): { min: number; max: number } | null {
  if (!tierKey) return null;
  const tier = matchTier(tiers, tierKey);
  const keys = new Set([norm(tierKey), ...(tier ? [norm(tier.role_key), ...(tier.aliases ?? []).map(norm)] : [])]);

  for (const standard of standards) {
    if (!keys.has(norm(standard.job_title))) continue;
    const min = Number(standard.min_rate);
    const max = Number(standard.max_rate);
    if (!Number.isFinite(min) || !Number.isFinite(max) || max <= 0) return null;
    return { min, max };
  }
  return null;
}

export interface ActingAdjustmentLike {
  base_title: string;
  role_on_job: string;
  adjustment_type: string;
  adjustment_amount: number;
}

/**
 * Acting-up pay: the extra $/hr for filling a bigger role than your grade for this entry.
 *
 * Folded in from `role_pay_adjustments`, the one idea the activity stack could not express —
 * `work_type_rates` says what kind of work it was, `role_tiers` says what grade you are, and
 * neither says "you ran the crew today". Only `flat` adjustments are honoured; a percentage type
 * would need a base to apply to, and which base (activity? agreed? computed?) is undecided, so
 * returning 0 is more honest than picking one silently.
 */
export function actingBonusFor(
  adjustments: ActingAdjustmentLike[],
  baseTitle: string | null | undefined,
  roleOnJob: string | null | undefined,
): number {
  if (!baseTitle || !roleOnJob) return 0;
  if (norm(baseTitle) === norm(roleOnJob)) return 0;   // your own grade is not acting up

  let best = 0;
  for (const adjustment of adjustments) {
    if (norm(adjustment.base_title) !== norm(baseTitle)) continue;
    if (norm(adjustment.role_on_job) !== norm(roleOnJob)) continue;
    if (adjustment.adjustment_type !== 'flat') continue;
    const amount = Number(adjustment.adjustment_amount);
    if (Number.isFinite(amount) && amount > best) best = amount;
  }
  return best;
}

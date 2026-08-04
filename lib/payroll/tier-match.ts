// lib/payroll/tier-match.ts
//
// JOB TITLES, NOT PAY GRADES (owner decision, 2026-08-04)
// ══════════════════════════════════════════════════════
//
// Under the simple pay model a grade is a **label** — something to show next to somebody's name —
// and nothing more. It does not change what they are paid; base pay and the flat activity rates do
// that, and only those. See `resolve-rate.ts`.
//
// This module exists because the tables do not agree on what a job is called, and the disagreement
// is invisible: a mismatched join returns no row rather than an error.
//
//   `employee_profiles.job_title`   → 'party_chief'      (free text, whatever the form wrote)
//   `role_tiers.role_key`           → 'survey_tech', 'rpls', 'admin_staff'
//   `pay_rate_standards.job_title`  → 'survey_technician', 'lead_rpls', 'office_tech'
//
// `role_tiers.aliases` already carries every spelling ('survey_technician' and 'Survey Technician'
// both live under `survey_tech'), so the bridge exists once here instead of being re-derived per
// route.
//
// ── THE tier_key TRAP ───────────────────────────────────────────────────────────────────────────
//
// `PAY_PROGRESSION_OVERHAUL.md` P-6 added `employee_profiles.tier_key` intending it to replace
// `job_title`, with a backfill. **Live data as of 2026-08-04: `tier_key` is NULL and `job_title` is
// 'party_chief'** — the seed was written but the column never filled. Code reading `tier_key` alone
// finds no title for anybody. `resolveTierKey` reads `tier_key` first and falls back to
// `job_title`, so the migration can finish whenever without a blank job title in between.

export interface TierLike {
  role_key: string;
  aliases?: string[] | null;
}

/** Lower-case and strip separators so 'Survey Technician', 'survey_technician' and 'survey tech' compare equal. */
function norm(value: string): string {
  return value.toLowerCase().replace(/[\s_-]+/g, '');
}

/**
 * Find the grade a title belongs to, by key or by any alias.
 *
 * Returns null rather than guessing. A wrong grade shown next to somebody's name is worse than a
 * blank one: blank reads as "not set" and gets fixed, wrong reads as deliberate.
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
 * The grade key for an employee profile, preferring the new column and falling back to the old one.
 * See the `tier_key` trap above — the fallback is load-bearing today, not defensive tidiness.
 */
export function resolveTierKey(
  profile: { tier_key?: string | null; job_title?: string | null } | null | undefined,
): string | null {
  return profile?.tier_key || profile?.job_title || null;
}

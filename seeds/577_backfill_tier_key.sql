-- seeds/577_backfill_tier_key.sql
--
-- FILLING THE COLUMN THAT WAS ADDED AND NEVER POPULATED (pay consolidation C-18, 2026-08-04)
-- ═════════════════════════════════════════════════════════════════════════════════════════
--
-- `PAY_PROGRESSION_OVERHAUL.md` P-6 added `employee_profiles.tier_key`, intending it to replace the
-- free-text `job_title`, and shipped a backfill. **The backfill never ran.** Live data as of
-- 2026-08-04: `tier_key` is NULL for every profile while `job_title` holds 'party_chief'.
--
-- The consequence is the kind this codebase keeps producing: any code that reads `tier_key` alone
-- finds nothing for anybody, and an absence renders as a legitimate blank rather than an error.
-- Under the graduated pay model that was a silent pay cut — no grade meant no role bonus. Under the
-- simple model it is "milder": the job title just disappears from every screen that shows one.
-- `lib/payroll/tier-match.ts` carries a `tier_key ?? job_title` fallback precisely because of this,
-- and that fallback stays after this seed — a backfill fixes today's rows, not tomorrow's writes.
--
-- ── THE MATCH ───────────────────────────────────────────────────────────────────────────────────
--
-- Matched through `role_tiers.aliases`, because the two columns do not share a vocabulary:
-- `job_title` may say 'survey_technician', 'Survey Technician' or 'survey technician' where
-- `role_tiers.role_key` says 'survey_tech'. An equality join would match some rows and silently skip
-- others, which is worse than skipping all of them — a half-filled column looks filled.
--
-- Comparison is on a normalised form (lower-cased, separators stripped) so all three spellings land
-- on the same grade. That mirrors `norm()` in `lib/payroll/tier-match.ts`; if one changes, change
-- both.
--
-- Only rows where `tier_key IS NULL` are touched, so re-running cannot overwrite a grade somebody
-- has since set by hand.

UPDATE employee_profiles p
   SET tier_key = t.role_key
  FROM role_tiers t
 WHERE p.tier_key IS NULL
   AND p.job_title IS NOT NULL
   AND (
        lower(regexp_replace(t.role_key, '[\s_-]+', '', 'g'))
          = lower(regexp_replace(p.job_title, '[\s_-]+', '', 'g'))
     OR EXISTS (
          SELECT 1 FROM unnest(COALESCE(t.aliases, ARRAY[]::TEXT[])) AS alias
           WHERE lower(regexp_replace(alias, '[\s_-]+', '', 'g'))
               = lower(regexp_replace(p.job_title, '[\s_-]+', '', 'g'))
        )
   );

-- ── Say what could not be matched ──────────────────────────────────────────────────────────────
--
-- A job title with no corresponding grade is left alone rather than guessed at: a wrong grade reads
-- as deliberate, a blank one reads as "not set" and gets fixed. Raised as a NOTICE so applying this
-- seed reports the gap instead of leaving somebody to find it later.
DO $$
DECLARE
  unmatched INTEGER;
  filled    INTEGER;
BEGIN
  SELECT count(*) INTO unmatched
    FROM employee_profiles
   WHERE tier_key IS NULL AND job_title IS NOT NULL AND job_title <> '';

  SELECT count(*) INTO filled FROM employee_profiles WHERE tier_key IS NOT NULL;

  RAISE NOTICE 'tier_key backfill: % profile(s) now have a grade; % have a job_title that matches no role_tier.', filled, unmatched;
END $$;

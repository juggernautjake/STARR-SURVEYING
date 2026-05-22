-- seeds/285_pay_progression_tier_key.sql
--
-- P-6 of PAY_PROGRESSION_OVERHAUL.md.
--
-- Add `tier_key` to employee_profiles + `aliases` to role_tiers so the
-- pay calculation can resolve an employee to their pay tier via a real
-- foreign-key relationship instead of the legacy "lowercase + replace
-- spaces" match on `job_title`. `job_title` stays writable for now;
-- P-26 (final cleanup) drops it once every read site is migrated.
--
-- Idempotent: re-running is safe via ADD COLUMN IF NOT EXISTS and
-- ON CONFLICT DO NOTHING.

-- ─── 1. Extend role_tiers with an aliases array + icon column ───────────────
ALTER TABLE public.role_tiers
  ADD COLUMN IF NOT EXISTS aliases TEXT[] DEFAULT ARRAY[]::TEXT[];

ALTER TABLE public.role_tiers
  ADD COLUMN IF NOT EXISTS icon TEXT;

COMMENT ON COLUMN public.role_tiers.aliases IS
  'Legacy/alternate strings that should resolve to this tier (e.g. "Party Chief" → party_chief). Used by the backfill in this seed and going forward by any code that needs to match a free-text job_title to a tier.';

COMMENT ON COLUMN public.role_tiers.icon IS
  'Emoji or short identifier displayed next to the tier in admin UIs and the pay-progression page. Admin-editable via the Phase 3 CRUD surface.';

-- Default icons for the seeded tiers (admin can change later).
UPDATE public.role_tiers SET icon = '🌱' WHERE role_key = 'intern' AND icon IS NULL;
UPDATE public.role_tiers SET icon = '👷' WHERE role_key = 'field_hand' AND icon IS NULL;
UPDATE public.role_tiers SET icon = '📏' WHERE role_key = 'rodman' AND icon IS NULL;
UPDATE public.role_tiers SET icon = '📡' WHERE role_key = 'instrument_op' AND icon IS NULL;
UPDATE public.role_tiers SET icon = '🔧' WHERE role_key = 'survey_tech' AND icon IS NULL;
UPDATE public.role_tiers SET icon = '👷‍♂️' WHERE role_key = 'party_chief' AND icon IS NULL;
UPDATE public.role_tiers SET icon = '🎓' WHERE role_key = 'sit' AND icon IS NULL;
UPDATE public.role_tiers SET icon = '📐' WHERE role_key = 'survey_drafter' AND icon IS NULL;
UPDATE public.role_tiers SET icon = '🗂️' WHERE role_key = 'project_manager' AND icon IS NULL;
UPDATE public.role_tiers SET icon = '📜' WHERE role_key = 'rpls' AND icon IS NULL;
UPDATE public.role_tiers SET icon = '🏅' WHERE role_key = 'senior_rpls' AND icon IS NULL;
UPDATE public.role_tiers SET icon = '👑' WHERE role_key = 'owner' AND icon IS NULL;
UPDATE public.role_tiers SET icon = '🖥️' WHERE role_key = 'admin_staff' AND icon IS NULL;
UPDATE public.role_tiers SET icon = '🛠️' WHERE role_key = 'it_support' AND icon IS NULL;

-- Seed the common aliases for the 14 default tiers. ON CONFLICT here
-- means re-running the seed leaves prior edits alone.
UPDATE public.role_tiers SET aliases = ARRAY['intern','Intern'] WHERE role_key = 'intern' AND (aliases IS NULL OR aliases = ARRAY[]::TEXT[]);
UPDATE public.role_tiers SET aliases = ARRAY['field_hand','Field Hand','field hand'] WHERE role_key = 'field_hand' AND (aliases IS NULL OR aliases = ARRAY[]::TEXT[]);
UPDATE public.role_tiers SET aliases = ARRAY['rodman','Rodman'] WHERE role_key = 'rodman' AND (aliases IS NULL OR aliases = ARRAY[]::TEXT[]);
UPDATE public.role_tiers SET aliases = ARRAY['instrument_op','instrument_operator','Instrument Operator','instrument operator'] WHERE role_key = 'instrument_op' AND (aliases IS NULL OR aliases = ARRAY[]::TEXT[]);
UPDATE public.role_tiers SET aliases = ARRAY['survey_tech','survey_technician','Survey Technician','survey technician'] WHERE role_key = 'survey_tech' AND (aliases IS NULL OR aliases = ARRAY[]::TEXT[]);
UPDATE public.role_tiers SET aliases = ARRAY['party_chief','Party Chief','party chief'] WHERE role_key = 'party_chief' AND (aliases IS NULL OR aliases = ARRAY[]::TEXT[]);
UPDATE public.role_tiers SET aliases = ARRAY['sit','SIT','Surveyor in Training','surveyor_in_training'] WHERE role_key = 'sit' AND (aliases IS NULL OR aliases = ARRAY[]::TEXT[]);
UPDATE public.role_tiers SET aliases = ARRAY['survey_drafter','Survey Drafter','survey drafter','drafter'] WHERE role_key = 'survey_drafter' AND (aliases IS NULL OR aliases = ARRAY[]::TEXT[]);
UPDATE public.role_tiers SET aliases = ARRAY['project_manager','Project Manager','project manager','PM'] WHERE role_key = 'project_manager' AND (aliases IS NULL OR aliases = ARRAY[]::TEXT[]);
UPDATE public.role_tiers SET aliases = ARRAY['rpls','RPLS','lead_rpls','Lead RPLS'] WHERE role_key = 'rpls' AND (aliases IS NULL OR aliases = ARRAY[]::TEXT[]);
UPDATE public.role_tiers SET aliases = ARRAY['senior_rpls','Senior RPLS','senior rpls'] WHERE role_key = 'senior_rpls' AND (aliases IS NULL OR aliases = ARRAY[]::TEXT[]);
UPDATE public.role_tiers SET aliases = ARRAY['owner','Owner','principal','Principal','Owner / Principal'] WHERE role_key = 'owner' AND (aliases IS NULL OR aliases = ARRAY[]::TEXT[]);
UPDATE public.role_tiers SET aliases = ARRAY['admin_staff','Administrative Staff','admin','office_tech','Office Technician'] WHERE role_key = 'admin_staff' AND (aliases IS NULL OR aliases = ARRAY[]::TEXT[]);
UPDATE public.role_tiers SET aliases = ARRAY['it_support','IT Support','tech_support','Tech Support'] WHERE role_key = 'it_support' AND (aliases IS NULL OR aliases = ARRAY[]::TEXT[]);

CREATE INDEX IF NOT EXISTS idx_role_tiers_aliases_gin ON public.role_tiers USING GIN (aliases);

-- ─── 2. Add tier_key to employee_profiles with a soft FK ────────────────────
ALTER TABLE public.employee_profiles
  ADD COLUMN IF NOT EXISTS tier_key TEXT;

-- Soft FK (no cascade — admin shouldn't be able to drop a tier that
-- has anyone in it; the CRUD UI in P-11 enforces this via a count
-- check before deletion).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'employee_profiles_tier_key_fkey'
    AND table_name = 'employee_profiles'
  ) THEN
    ALTER TABLE public.employee_profiles
      ADD CONSTRAINT employee_profiles_tier_key_fkey
      FOREIGN KEY (tier_key) REFERENCES public.role_tiers(role_key)
      ON UPDATE CASCADE ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_employee_profiles_tier_key
  ON public.employee_profiles(tier_key);

-- ─── 3. Backfill tier_key from existing job_title via alias match ───────────
-- For each employee with a non-null job_title, find the role_tier whose
-- aliases array contains the job_title (case-sensitive ANY). Skip employees
-- who already have tier_key set (idempotent).
UPDATE public.employee_profiles ep
SET tier_key = rt.role_key
FROM public.role_tiers rt
WHERE ep.tier_key IS NULL
  AND ep.job_title IS NOT NULL
  AND ep.job_title = ANY(rt.aliases);

-- ─── Verification ───────────────────────────────────────────────────────────
-- Run after applying:
-- SELECT role_key, label, array_length(aliases, 1) AS n_aliases
-- FROM role_tiers
-- ORDER BY base_bonus;
--
-- Expect: all 14 tiers, each with ≥1 alias.
--
-- SELECT user_email, job_title, tier_key
-- FROM employee_profiles
-- ORDER BY user_email;
--
-- Expect: every active employee has a tier_key set (matching the alias of
-- their job_title). Any nulls are employees whose job_title doesn't match
-- any alias — fix by adding the alias to the appropriate tier, then re-run
-- this seed.

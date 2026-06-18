-- ============================================================================
-- 310_employee_profile_personal_info.sql
--
-- Slice EP1 (employee-profile-buildout-2026-06-17) — extend
-- public.employee_profiles with the personal-info columns the user
-- asked for:
--
--   "This will have all of the user's roles, jobs they have worked
--    on, dob, gender, age, certifications/achievements, phone
--    number, email, ect."
--
-- This migration covers the still-unmodelled personal-info fields.
-- Phones / emails / images / jobs land in EP2-EP5; salary +
-- bonuses are already modelled by the existing employee_* tables.
--
-- date_of_birth  DATE. Nullable so existing rows don't have to be
--                back-filled; age is derived at render-time from
--                this column (no stored age column).
-- gender         TEXT. Free-form per the spec — no CHECK constraint
--                so the user can write anything they want without a
--                follow-up migration when a new option comes up.
-- pronouns       TEXT. Free-form, same reasoning.
-- bio            TEXT. Free-form "About me" prose, surfaced as a
--                paragraph block on the profile card.
--
-- Spec: docs/planning/in-progress/employee-profile-buildout-2026-06-17.md
-- ============================================================================

BEGIN;

ALTER TABLE public.employee_profiles
  ADD COLUMN IF NOT EXISTS date_of_birth DATE,
  ADD COLUMN IF NOT EXISTS gender        TEXT,
  ADD COLUMN IF NOT EXISTS pronouns      TEXT,
  ADD COLUMN IF NOT EXISTS bio           TEXT;

COMMENT ON COLUMN public.employee_profiles.date_of_birth IS
  'Optional DOB. Age is derived at render-time; never stored.';
COMMENT ON COLUMN public.employee_profiles.gender IS
  'Free-form gender string. No CHECK constraint by design.';
COMMENT ON COLUMN public.employee_profiles.pronouns IS
  'Free-form pronouns (e.g. she/her, they/them).';
COMMENT ON COLUMN public.employee_profiles.bio IS
  'Free-form "About me" prose. Markdown is not parsed; the UI
   wraps + trims whitespace.';

COMMIT;

-- Verification:
--   SELECT column_name, data_type, is_nullable
--     FROM information_schema.columns
--    WHERE table_name = 'employee_profiles'
--      AND column_name IN ('date_of_birth', 'gender', 'pronouns', 'bio');

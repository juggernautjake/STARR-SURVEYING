-- ============================================================================
-- 295_employee_privacy.sql
--
-- employee-pond Slice E12 — per-user privacy toggles that drive which
-- fields are visible to non-admin co-workers on the new employee
-- viewer (`/admin/employees` pond) + every future surface that
-- consumes the `filterEmployeeView` helper in
-- lib/employee-pond/visibility.ts.
--
-- One row per registered user. Missing row → sensible defaults
-- applied by the helper at read time (no need to backfill on user
-- signup). RLS-friendly: reads gated by the user themselves OR by
-- the admin-visibility roles (admin / developer / tech_support /
-- equipment_manager).
--
-- Salary + payout columns are intentionally NOT here — those
-- categories are always admin-only, regardless of any user toggle.
-- The visibility helper enforces that at the JS layer too.
--
-- Spec: docs/planning/in-progress/employee-pond-2026-06-16.md (E12)
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.employee_privacy (
  user_email                       TEXT PRIMARY KEY,

  -- Contact info
  show_full_name_to_employees      BOOLEAN NOT NULL DEFAULT true,
  show_email_to_employees          BOOLEAN NOT NULL DEFAULT true,
  show_phone_to_employees          BOOLEAN NOT NULL DEFAULT true,

  -- Personal info — default to private (pay-adjacent / sensitive)
  show_dob_to_employees            BOOLEAN NOT NULL DEFAULT false,
  show_gender_to_employees         BOOLEAN NOT NULL DEFAULT false,
  show_address_to_employees        BOOLEAN NOT NULL DEFAULT false,

  -- Employment info — default to visible (team context)
  show_hire_date_to_employees      BOOLEAN NOT NULL DEFAULT true,
  show_job_title_to_employees      BOOLEAN NOT NULL DEFAULT true,
  show_employment_type_to_employees BOOLEAN NOT NULL DEFAULT true,

  -- Media + activity
  show_photos_to_employees         BOOLEAN NOT NULL DEFAULT true,
  show_jobs_history_to_employees   BOOLEAN NOT NULL DEFAULT true,
  show_hours_to_employees          BOOLEAN NOT NULL DEFAULT false,
  show_bonuses_to_employees        BOOLEAN NOT NULL DEFAULT false,

  created_at                       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                       TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.employee_privacy IS
  'Per-user privacy toggles. Owner: the user themselves (PK = their email). '
  'Missing row falls back to defaults defined in '
  'lib/employee-pond/visibility.ts → DEFAULT_EMPLOYEE_PRIVACY.';

CREATE INDEX IF NOT EXISTS idx_employee_privacy_updated_at
  ON public.employee_privacy (updated_at DESC);

COMMIT;

-- Verification:
--   \d+ public.employee_privacy
--   SELECT count(*) FROM public.employee_privacy;

-- ============================================================================
-- 296_employee_bonuses.sql
--
-- employee-pond Slice E13 — per-employee bonus log. Backs the
-- /admin/employees/manage/[email]/history "Bonuses" tab (E14) and
-- the user's own "My history" page when the privacy toggle
-- (`show_bonuses_to_employees`) is on.
--
-- One row per bonus awarded. Amount in cents to dodge floating-
-- point bookkeeping; `related_job_id` is optional so a "general
-- year-end" bonus can sit at job_id=NULL while a per-job spot
-- bonus links forward.
--
-- Read gate (enforced at the API layer via lib/employee-pond/
-- visibility.ts): admins always; the user themselves always;
-- general roles only when the user's privacy row has
-- `show_bonuses_to_employees = true` (default false).
--
-- Spec: docs/planning/in-progress/employee-pond-2026-06-16.md (E13)
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.employee_bonuses (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email        TEXT NOT NULL,
  amount_cents      BIGINT NOT NULL,
  reason            TEXT NOT NULL,
  awarded_by        TEXT,                                 -- admin email or system
  awarded_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  related_job_id    UUID REFERENCES public.jobs(id) ON DELETE SET NULL,
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.employee_bonuses IS
  'Per-employee bonus log. amount_cents = the bonus amount in cents '
  '(integer dollars × 100). reason is required so finance has a paper '
  'trail. awarded_by is the admin email that approved the bonus. '
  'related_job_id is optional — null for year-end / quarterly bonuses '
  'not tied to a specific job.';

CREATE INDEX IF NOT EXISTS idx_employee_bonuses_user_email_awarded_at
  ON public.employee_bonuses (user_email, awarded_at DESC);
CREATE INDEX IF NOT EXISTS idx_employee_bonuses_related_job_id
  ON public.employee_bonuses (related_job_id)
  WHERE related_job_id IS NOT NULL;

COMMIT;

-- Verification:
--   \d+ public.employee_bonuses
--   SELECT count(*) FROM public.employee_bonuses;

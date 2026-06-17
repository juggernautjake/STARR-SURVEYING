-- ============================================================================
-- 297_employee_salary_history.sql
--
-- employee-pond Slice E13 — per-employee salary change log. Backs
-- the admin "everything" view's Salary tab (E14) and the user's
-- own "My history" Salary tab when they look at their own profile.
-- Salary is ALWAYS admin-only when a non-admin viewer looks at
-- someone ELSE's history — `ALWAYS_ADMIN_ONLY_FIELDS` in
-- lib/employee-pond/visibility.ts enforces that at the JS layer.
--
-- One row per salary change. Hourly rate + annual salary can
-- co-exist (some employees are FT salaried with overtime; others
-- are pure hourly). `effective_to` is nullable — the current
-- compensation row has it open-ended. A new effective_from row
-- closes the prior row's effective_to via an app-level UPDATE.
--
-- Spec: docs/planning/in-progress/employee-pond-2026-06-16.md (E13)
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.employee_salary_history (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email               TEXT NOT NULL,
  base_hourly_rate_cents   BIGINT,                       -- cents per hour
  base_annual_salary_cents BIGINT,                       -- cents per year
  effective_from           TIMESTAMPTZ NOT NULL,
  effective_to             TIMESTAMPTZ,                  -- null = current row
  changed_by               TEXT,                         -- admin email
  change_reason            TEXT,                         -- promotion, COLA, etc.
  notes                    TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT employee_salary_history_some_rate
    CHECK (base_hourly_rate_cents IS NOT NULL OR base_annual_salary_cents IS NOT NULL),
  CONSTRAINT employee_salary_history_effective_window
    CHECK (effective_to IS NULL OR effective_from <= effective_to)
);

COMMENT ON TABLE public.employee_salary_history IS
  'Per-employee salary change log. Either hourly_rate or annual_salary '
  '(or both) must be set on each row. effective_to is null for the '
  'current compensation row; the app closes the prior row on every '
  'new INSERT. Read access ALWAYS admin-only for non-self viewers.';

CREATE INDEX IF NOT EXISTS idx_employee_salary_history_user_email
  ON public.employee_salary_history (user_email, effective_from DESC);
-- Partial index for "current compensation" queries; the user's
-- current rate row is the one with effective_to IS NULL.
CREATE INDEX IF NOT EXISTS idx_employee_salary_history_current
  ON public.employee_salary_history (user_email)
  WHERE effective_to IS NULL;

COMMIT;

-- Verification:
--   \d+ public.employee_salary_history
--   SELECT count(*) FROM public.employee_salary_history;

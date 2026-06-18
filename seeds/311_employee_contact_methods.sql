-- ============================================================================
-- 311_employee_contact_methods.sql
--
-- Slice EP2 (employee-profile-buildout-2026-06-17) — model the
-- user's "add phone numbers, emails, etc." ask. Each row is one
-- labelled contact method (phone, email, or address) for a user.
-- The auth email stays on registered_users; this table holds
-- ADDITIONAL contact rows on top of that.
--
-- user_email   The owning employee (matches registered_users.email
--              and employee_profiles.user_email).
-- kind         Enum-via-CHECK: 'phone' | 'email' | 'address'.
-- value        The free-form contact value. Validation lives in
--              the API + the form; we keep TEXT here so addresses
--              don't need a separate schema.
-- label        Optional short label ("Mobile", "Work", "Home").
-- is_primary   True when this row is the primary for its (user,
--              kind). The API enforces at-most-one primary per
--              kind via a transaction in the POST/PATCH path so
--              the constraint doesn't need a partial unique
--              index (the trade-off keeps writes simple).
--
-- Spec: docs/planning/in-progress/employee-profile-buildout-2026-06-17.md
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.employee_contact_methods (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email  TEXT NOT NULL,
  kind        TEXT NOT NULL CHECK (kind IN ('phone', 'email', 'address')),
  value       TEXT NOT NULL,
  label       TEXT,
  is_primary  BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.employee_contact_methods IS
  'Additional contact methods on top of registered_users.email.
   One row per labelled phone/email/address.';

CREATE INDEX IF NOT EXISTS idx_employee_contact_methods_user
  ON public.employee_contact_methods(user_email);

-- A small index on (user_email, kind) speeds up the most common
-- "show me all my phones" lookup.
CREATE INDEX IF NOT EXISTS idx_employee_contact_methods_user_kind
  ON public.employee_contact_methods(user_email, kind);

COMMIT;

-- Verification:
--   SELECT column_name, data_type, is_nullable
--     FROM information_schema.columns
--    WHERE table_name = 'employee_contact_methods'
--    ORDER BY ordinal_position;

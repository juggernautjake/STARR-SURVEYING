-- ============================================================================
-- 313_custom_roles.sql
--
-- Slice W7 (hub-cad-roles-polish-2026-06-18) — user spec:
--
--   "We need a way to create new roles with special permissions.
--    Like a role builder page."
--
-- Stores administrator-defined roles on top of the built-in
-- ALL_ROLES enum from lib/auth.ts. The built-in roles still live
-- in registered_users.roles TEXT[]; this table just registers
-- NEW role keys + their human-readable label + a permissions
-- JSONB blob so the admin UI can describe what each role is
-- allowed to do.
--
-- key             URL-safe identifier the app stores in
--                 `registered_users.roles` for users who hold the
--                 role. Lower-snake. Unique.
-- label           Display name shown in nav badges and the role
--                 picker.
-- description     Short blurb the role builder UI surfaces.
-- permissions     JSONB grant set; shape is owned by the app
--                 layer (e.g. { "routes": ["/admin/cad"],
--                 "actions": ["new-job"] }). Stored as JSONB so
--                 the schema can evolve without a follow-up
--                 migration.
-- created_by      Admin email that created the role (audit).
--
-- Spec: docs/planning/in-progress/hub-cad-roles-polish-2026-06-18.md
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.custom_roles (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key          TEXT NOT NULL UNIQUE
    CHECK (key ~ '^[a-z][a-z0-9_]{1,40}$'),
  label        TEXT NOT NULL,
  description  TEXT,
  permissions  JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.custom_roles IS
  'Admin-defined roles on top of the built-in ALL_ROLES enum.
   Holders carry the role key in registered_users.roles[].';

CREATE INDEX IF NOT EXISTS idx_custom_roles_key
  ON public.custom_roles(key);

COMMIT;

-- Verification:
--   SELECT key, label FROM public.custom_roles;

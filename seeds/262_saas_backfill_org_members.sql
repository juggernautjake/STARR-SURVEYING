-- ============================================================================
-- 262_saas_backfill_org_members.sql
--
-- SaaS pivot — Phase A slice M-3: backfill organization_members from
-- existing registered_users. Every active user becomes a member of Starr
-- (tenant #1, seeded in M-2). Role is mapped from their existing global
-- roles per MULTI_TENANCY_FOUNDATION.md §6.3.
--
-- Idempotent via PRIMARY KEY conflict.
--
-- Spec: docs/planning/in-progress/MULTI_TENANCY_FOUNDATION.md §6.2 (M-3) + §6.3.
-- ============================================================================

BEGIN;

DO $$
DECLARE
  starr_org_id UUID := '00000000-0000-0000-0000-000000000001';
  v_user RECORD;
  v_role public.org_role_enum;
BEGIN
  -- Bail early if registered_users doesn't exist (fresh DB, no Starr data
  -- to migrate). This makes the migration safe to run on a brand-new
  -- environment.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'registered_users'
  ) THEN
    RAISE NOTICE 'No registered_users table; skipping M-3 backfill.';
    RETURN;
  END IF;

  FOR v_user IN
    SELECT email, roles, is_approved, is_banned
      FROM public.registered_users
     WHERE email IS NOT NULL
  LOOP
    -- Role mapping per MULTI_TENANCY_FOUNDATION §6.3. Order matters —
    -- most-specific first. A user with multiple hats gets the most-
    -- permissive matching role.
    v_role :=
      CASE
        WHEN 'admin'             = ANY(COALESCE(v_user.roles, '{}'::text[])) THEN 'admin'::public.org_role_enum
        WHEN 'developer'         = ANY(COALESCE(v_user.roles, '{}'::text[])) THEN 'admin'::public.org_role_enum
        WHEN 'tech_support'      = ANY(COALESCE(v_user.roles, '{}'::text[])) THEN 'admin'::public.org_role_enum
        WHEN 'teacher'           = ANY(COALESCE(v_user.roles, '{}'::text[])) THEN 'admin'::public.org_role_enum
        WHEN 'equipment_manager' = ANY(COALESCE(v_user.roles, '{}'::text[])) THEN 'admin'::public.org_role_enum
        WHEN 'field_crew'        = ANY(COALESCE(v_user.roles, '{}'::text[])) THEN 'surveyor'::public.org_role_enum
        WHEN 'researcher'        = ANY(COALESCE(v_user.roles, '{}'::text[])) THEN 'surveyor'::public.org_role_enum
        WHEN 'drawer'            = ANY(COALESCE(v_user.roles, '{}'::text[])) THEN 'surveyor'::public.org_role_enum
        WHEN 'student'           = ANY(COALESCE(v_user.roles, '{}'::text[])) THEN 'view_only'::public.org_role_enum
        ELSE 'view_only'::public.org_role_enum
      END;

    INSERT INTO public.organization_members (
      org_id, user_email, role, status, joined_at
    ) VALUES (
      starr_org_id,
      v_user.email,
      v_role,
      CASE
        WHEN COALESCE(v_user.is_banned, false)   THEN 'suspended'
        WHEN COALESCE(v_user.is_approved, true)  THEN 'active'
        ELSE 'suspended'
      END,
      now()
    ) ON CONFLICT (org_id, user_email) DO NOTHING;
  END LOOP;

  RAISE NOTICE 'M-3 backfill complete: % members in Starr',
    (SELECT count(*) FROM public.organization_members WHERE org_id = starr_org_id);
END $$;

-- Also seed registered_users.default_org_id for everyone — slice M-9 reads
-- this to pick the active org at sign-in time when no JWT is yet minted.
DO $$
DECLARE
  starr_org_id UUID := '00000000-0000-0000-0000-000000000001';
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'registered_users' AND column_name = 'default_org_id'
  ) THEN
    UPDATE public.registered_users
       SET default_org_id = starr_org_id
     WHERE default_org_id IS NULL;
    RAISE NOTICE 'M-3 default_org_id backfill: % users set to Starr',
      (SELECT count(*) FROM public.registered_users WHERE default_org_id = starr_org_id);
  END IF;
END $$;

COMMIT;

-- ── Verification ─────────────────────────────────────────────────────────
--
--   SELECT count(*) FROM public.organization_members
--    WHERE org_id = '00000000-0000-0000-0000-000000000001';
--   -- expected: matches active count of registered_users
--
--   SELECT role, count(*) FROM public.organization_members
--    WHERE org_id = '00000000-0000-0000-0000-000000000001'
--    GROUP BY role ORDER BY role;
--
--   SELECT count(*) FROM public.registered_users WHERE default_org_id IS NOT NULL;

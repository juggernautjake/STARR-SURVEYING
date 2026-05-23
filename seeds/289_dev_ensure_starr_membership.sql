-- ============================================================================
-- 289_dev_ensure_starr_membership.sql
--
-- Dev-bootstrap guard: guarantees every registered user lands in the
-- Starr Surveying org (tenant #1) with a default_org_id set and an
-- organization_members row.
--
-- WHY THIS EXISTS
--   Seed 262 backfilled organization_members + registered_users.default_org_id
--   for every user that existed AT THE TIME IT RAN. Any account created or
--   recreated afterwards (manual dev inserts, a fresh credentials signup, a
--   first-time Google OAuth user) keeps default_org_id = NULL. Because the
--   jobs table requires org_id (NOT NULL, seed 264), those users hit:
--
--     null value in column "org_id" of relation "jobs"
--       violates not-null constraint
--
--   when they try to create a job. Nothing re-runs 262's backfill, so the
--   gap is permanent until a guard like this one closes it.
--
-- WHAT IT DOES (all idempotent — safe to re-run, safe in prod)
--   1. Self-heals the Starr org row in case seed 261 was skipped.
--   2. Sets default_org_id = Starr for every user whose it is still NULL.
--   3. Ensures an organization_members row for every registered user,
--      mapping their global roles to an org role (same logic as 262).
--   4. Explicitly guarantees the platform-owner admin
--      (jacobmaddux@starr-surveying.com) is an active Starr admin.
--
-- Run order: must come AFTER 260-264 (multi-tenancy) and 284 (jacobmaddux
-- admin roles). As seed 289 it does.
-- ============================================================================

BEGIN;

DO $$
DECLARE
  starr_org_id UUID := '00000000-0000-0000-0000-000000000001';
  v_user RECORD;
  v_role public.org_role_enum;
BEGIN
  -- Fresh-DB guard: nothing to do until the multi-tenancy tables exist.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'organizations'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'registered_users'
  ) THEN
    RAISE NOTICE '289: multi-tenancy tables absent; skipping (run seeds 260-264 first).';
    RETURN;
  END IF;

  -- 1. Self-heal the Starr org (no-op if 261 already created it).
  INSERT INTO public.organizations (
    id, slug, name, status, state, country,
    primary_admin_email, billing_contact_email, founded_at, metadata
  ) VALUES (
    starr_org_id, 'starr', 'Starr Surveying', 'active', 'TX', 'US',
    'jacobmaddux@starr-surveying.com', 'info@starr-surveying.com',
    '2024-01-01T00:00:00Z',
    jsonb_build_object('is_platform_owner', true,
      'note', 'Tenant #1: Starr Surveying. Re-asserted by dev-bootstrap seed 289.')
  ) ON CONFLICT (id) DO NOTHING;

  -- 2. Backfill default_org_id for any user still missing one.
  UPDATE public.registered_users
     SET default_org_id = starr_org_id
   WHERE default_org_id IS NULL;
  RAISE NOTICE '289: default_org_id backfilled; % users now point at Starr',
    (SELECT count(*) FROM public.registered_users WHERE default_org_id = starr_org_id);

  -- 3. Ensure a membership row for every registered user. Role mapping
  --    mirrors seed 262 §6.3 so a user's org role is consistent however
  --    they entered the system.
  FOR v_user IN
    SELECT email, roles, is_approved, is_banned
      FROM public.registered_users
     WHERE email IS NOT NULL
  LOOP
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
      starr_org_id, v_user.email, v_role,
      CASE
        WHEN COALESCE(v_user.is_banned, false)  THEN 'suspended'
        WHEN COALESCE(v_user.is_approved, true) THEN 'active'
        ELSE 'suspended'
      END,
      now()
    ) ON CONFLICT (org_id, user_email) DO NOTHING;
  END LOOP;

  -- 4. Explicitly guarantee the platform-owner admin. Promotes the
  --    membership to admin/active even if a prior row had a lesser role,
  --    and pins their default org. This is the canonical dev login.
  UPDATE public.registered_users
     SET default_org_id = starr_org_id
   WHERE email = 'jacobmaddux@starr-surveying.com';

  IF EXISTS (SELECT 1 FROM public.registered_users
              WHERE email = 'jacobmaddux@starr-surveying.com') THEN
    INSERT INTO public.organization_members (
      org_id, user_email, role, status, joined_at
    ) VALUES (
      starr_org_id, 'jacobmaddux@starr-surveying.com',
      'admin'::public.org_role_enum, 'active', now()
    )
    ON CONFLICT (org_id, user_email)
    DO UPDATE SET role = 'admin'::public.org_role_enum, status = 'active';
  END IF;

  RAISE NOTICE '289: Starr membership ensured; % active members',
    (SELECT count(*) FROM public.organization_members
      WHERE org_id = starr_org_id AND status = 'active');
END $$;

COMMIT;

-- ── Verification ─────────────────────────────────────────────────────────
--
--   -- Every user has a home org (expect 0 rows):
--   SELECT email FROM public.registered_users WHERE default_org_id IS NULL;
--
--   -- The dev admin is an active Starr admin (expect 1 row):
--   SELECT m.user_email, m.role, m.status
--     FROM public.organization_members m
--    WHERE m.org_id = '00000000-0000-0000-0000-000000000001'
--      AND m.user_email = 'jacobmaddux@starr-surveying.com';
--
--   -- Job creation will now satisfy the org_id NOT NULL constraint for
--   -- any signed-in user.

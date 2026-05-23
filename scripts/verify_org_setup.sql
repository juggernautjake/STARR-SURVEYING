-- ============================================================================
-- verify_org_setup.sql
--
-- Paste into the Supabase SQL Editor (or `psql "$DATABASE_URL" -f` this file)
-- to confirm the multi-tenancy / org setup is correct end-to-end. Each block
-- RAISEs PASS or FAIL so you can read the result at a glance.
--
-- Covers the chain that job creation depends on:
--   seeds 260 (schema) → 261 (Starr org) → 262 (members + default_org_id)
--   → 263 (backfill org_id) → 264 (org_id NOT NULL) → 289 (dev bootstrap).
--
-- Read-only. Safe to run anytime, against any environment.
-- ============================================================================

DO $$
DECLARE
  starr_org_id UUID := '00000000-0000-0000-0000-000000000001';
  v_count INT;
  v_exists BOOLEAN;
  v_nullable TEXT;
BEGIN
  RAISE NOTICE '=== Starr org setup verification ===';

  -- 1. Multi-tenancy tables exist (seed 260).
  v_exists := EXISTS (SELECT 1 FROM information_schema.tables
                       WHERE table_schema='public' AND table_name='organizations');
  RAISE NOTICE '[%] organizations table exists', CASE WHEN v_exists THEN 'PASS' ELSE 'FAIL — run seeds 260+' END;
  IF NOT v_exists THEN RETURN; END IF;

  -- 2. Starr org row (seed 261).
  SELECT count(*) INTO v_count FROM public.organizations WHERE id = starr_org_id;
  RAISE NOTICE '[%] Starr Surveying org row present (%)',
    CASE WHEN v_count = 1 THEN 'PASS' ELSE 'FAIL — run seed 261/289' END, v_count;

  -- 3. Starr subscription + settings (seed 261).
  SELECT count(*) INTO v_count FROM public.subscriptions WHERE org_id = starr_org_id;
  RAISE NOTICE '[%] Starr subscription present (%)',
    CASE WHEN v_count >= 1 THEN 'PASS' ELSE 'WARN — run seed 261' END, v_count;
  SELECT count(*) INTO v_count FROM public.org_settings WHERE org_id = starr_org_id;
  RAISE NOTICE '[%] Starr org_settings present (%)',
    CASE WHEN v_count >= 1 THEN 'PASS' ELSE 'WARN — run seed 261' END, v_count;

  -- 4. jobs.org_id is NOT NULL (seed 264) — the constraint behind the error.
  SELECT is_nullable INTO v_nullable FROM information_schema.columns
   WHERE table_schema='public' AND table_name='jobs' AND column_name='org_id';
  RAISE NOTICE '[%] jobs.org_id NOT NULL (is_nullable=%)',
    CASE WHEN v_nullable = 'NO' THEN 'PASS' ELSE 'WARN — seed 264 not applied' END,
    COALESCE(v_nullable, '(column missing!)');

  -- 5. No users orphaned without a home org (seeds 262 + 289).
  SELECT count(*) INTO v_count FROM public.registered_users WHERE default_org_id IS NULL;
  RAISE NOTICE '[%] users with NULL default_org_id (%)',
    CASE WHEN v_count = 0 THEN 'PASS' ELSE 'FAIL — run seed 289' END, v_count;

  -- 6. Membership count.
  SELECT count(*) INTO v_count FROM public.organization_members WHERE org_id = starr_org_id;
  RAISE NOTICE '[INFO] Starr organization_members rows: %', v_count;

  -- 7. The dev admin is an active Starr admin (seeds 284 + 289).
  SELECT count(*) INTO v_count FROM public.organization_members
   WHERE org_id = starr_org_id
     AND user_email = 'jacobmaddux@starr-surveying.com'
     AND role = 'admin'::public.org_role_enum
     AND status = 'active';
  RAISE NOTICE '[%] jacobmaddux is an active Starr admin member',
    CASE WHEN v_count = 1 THEN 'PASS' ELSE 'FAIL — run seed 289' END;

  RAISE NOTICE '=== done ===';
END $$;

-- Detail rows for eyeballing (run separately if you want the data):
SELECT id, slug, name, status FROM public.organizations;
SELECT email, default_org_id, roles FROM public.registered_users
 WHERE email = 'jacobmaddux@starr-surveying.com';
SELECT user_email, role, status FROM public.organization_members
 WHERE org_id = '00000000-0000-0000-0000-000000000001'
 ORDER BY role, user_email;

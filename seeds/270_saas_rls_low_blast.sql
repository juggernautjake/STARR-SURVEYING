-- ============================================================================
-- 270_saas_rls_low_blast.sql
--
-- SaaS pivot — Phase A slice M-6: enable Row-Level Security on the
-- low-blast-radius tenant tables. These are the tables where a missed
-- WHERE clause is least catastrophic — notifications, audit logs,
-- in-app messages — and where the existing code already uses
-- supabaseAdmin (which BYPASSES RLS), so enabling policies here is
-- a no-op for the live app.
--
-- After M-9 (auth refactor) lands and customer-side queries shift to
-- the anon client + a tenant-scoped JWT, these policies start firing.
-- For now they're "armed and ready" but inert against today's queries.
--
-- Idempotent: every ENABLE / CREATE is guarded via DO blocks.
--
-- Spec: docs/planning/in-progress/MULTI_TENANCY_FOUNDATION.md §3.2 + §6.2 M-6.
-- ============================================================================

BEGIN;

-- ── Helper: extract the authenticated user's email from JWT ──────────────
-- Supabase's auth.email() returns the JWT's `email` claim. We rely on
-- this rather than auth.uid() because the existing data model is
-- keyed on email (registered_users.email is the FK target).

-- ── Generic RLS pattern for tenant tables ───────────────────────────────
-- 1. ENABLE ROW LEVEL SECURITY
-- 2. FORCE ROW LEVEL SECURITY (so table owner is also subject to RLS;
--    paranoia against accidental drift)
-- 3. CREATE POLICY for SELECT / INSERT / UPDATE / DELETE
--
-- Policies use a CTE-like membership lookup:
--     org_id IN (SELECT org_id FROM organization_members
--                WHERE user_email = auth.email() AND status = 'active')

CREATE OR REPLACE FUNCTION public._enable_tenant_rls(p_table TEXT) RETURNS VOID
LANGUAGE plpgsql AS $$
DECLARE
  rls_enabled BOOLEAN;
BEGIN
  -- Skip if the table doesn't exist on this DB
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = p_table
  ) THEN
    RAISE NOTICE 'Skipping % — table does not exist', p_table;
    RETURN;
  END IF;
  -- Skip if org_id column doesn't exist (table is platform content)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = p_table AND column_name = 'org_id'
  ) THEN
    RAISE NOTICE 'Skipping % — no org_id column', p_table;
    RETURN;
  END IF;
  -- Check if RLS is already enabled (idempotent)
  SELECT pg_class.relrowsecurity INTO rls_enabled
    FROM pg_class
    JOIN pg_namespace ON pg_namespace.oid = pg_class.relnamespace
   WHERE pg_class.relname = p_table AND pg_namespace.nspname = 'public';
  IF rls_enabled IS NOT NULL AND rls_enabled THEN
    RAISE NOTICE 'Skipping % — RLS already enabled', p_table;
    RETURN;
  END IF;
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', p_table);
  EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', p_table);
  -- Member SELECT: any active org member can read their org's rows
  EXECUTE format($f$
    CREATE POLICY %I ON public.%I FOR SELECT
    USING (
      org_id IN (
        SELECT org_id FROM public.organization_members
         WHERE user_email = auth.email()
           AND status = 'active'
      )
    )$f$,
    p_table || '_tenant_select', p_table);
  -- Member INSERT: org members can insert rows for their org. Role gate
  -- via app layer (UI hides destructive surfaces from non-admin members
  -- already).
  EXECUTE format($f$
    CREATE POLICY %I ON public.%I FOR INSERT
    WITH CHECK (
      org_id IN (
        SELECT org_id FROM public.organization_members
         WHERE user_email = auth.email()
           AND status = 'active'
      )
    )$f$,
    p_table || '_tenant_insert', p_table);
  -- Member UPDATE: same membership predicate. Per-column write
  -- restrictions are enforced at the app layer.
  EXECUTE format($f$
    CREATE POLICY %I ON public.%I FOR UPDATE
    USING (
      org_id IN (
        SELECT org_id FROM public.organization_members
         WHERE user_email = auth.email()
           AND status = 'active'
      )
    )$f$,
    p_table || '_tenant_update', p_table);
  -- Admin-only DELETE
  EXECUTE format($f$
    CREATE POLICY %I ON public.%I FOR DELETE
    USING (
      org_id IN (
        SELECT org_id FROM public.organization_members
         WHERE user_email = auth.email()
           AND role = 'admin'
           AND status = 'active'
      )
    )$f$,
    p_table || '_tenant_delete', p_table);
  RAISE NOTICE 'RLS enabled on %', p_table;
END $$;

-- ── Low-blast-radius tables (M-6) ───────────────────────────────────────
-- The order here is deliberately the *safest first* — tables where the
-- existing app code is purely supabaseAdmin so policies have zero
-- effect on today's queries.

DO $$
DECLARE
  low_blast_tables TEXT[] := ARRAY[
    'notifications',           -- existing internal notifications (org_id added M-1)
    'org_notifications',       -- new SaaS-side notifications (M-7 ships these)
    'error_reports',           -- per-user error reports (org_id added M-1)
    'audit_log',               -- operator + customer audit trail
    'message_contacts',        -- internal contact directory
    'discussion_messages'      -- discussion thread replies
  ];
  t TEXT;
BEGIN
  FOREACH t IN ARRAY low_blast_tables LOOP
    PERFORM public._enable_tenant_rls(t);
  END LOOP;
END $$;

-- Note: the helper function stays — M-7 + M-8 reuse it for the next
-- waves of RLS enablement.

COMMIT;

-- ── Verification ─────────────────────────────────────────────────────────
--
--   SELECT relname, relrowsecurity FROM pg_class
--    WHERE relname IN ('notifications', 'org_notifications', 'error_reports',
--                      'audit_log', 'message_contacts', 'discussion_messages')
--    ORDER BY relname;
--   -- expected: relrowsecurity = true for every row
--
--   SELECT polname, polrelid::regclass FROM pg_policy
--    WHERE polrelid::regclass::text LIKE 'public.%'
--      AND polrelid::regclass::text IN ('public.notifications', 'public.org_notifications',
--                                       'public.error_reports', 'public.audit_log',
--                                       'public.message_contacts', 'public.discussion_messages')
--    ORDER BY polrelid::regclass, polname;
--   -- expected: 4 policies (select/insert/update/delete) per table
--
--   -- Isolation smoke test (after M-9 lands; today these queries use
--   -- supabaseAdmin which bypasses RLS):
--   SET ROLE authenticated;
--   SET request.jwt.claims TO '{"email": "alice@acme.com"}';
--   SELECT count(*) FROM public.notifications;
--   -- expected: only Acme's rows

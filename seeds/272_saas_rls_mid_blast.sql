-- ============================================================================
-- 272_saas_rls_mid_blast.sql
--
-- SaaS pivot — Phase A slice M-7: enable Row-Level Security on the
-- mid-blast-radius tenant tables. These hold the firm's operational
-- data — jobs, field data, equipment, vehicles, learning progress.
-- A leaked row would be a real privacy + compliance issue, but the
-- data isn't financial (M-8's job).
--
-- Pre-conditions:
--   - seeds/270 (M-6) has shipped low-blast RLS on notifications etc.
--   - seeds/264 (M-5) has confirmed org_id is NOT NULL on every tenant
--     table — RLS policies that reference a NULL org_id would silently
--     fail-open.
--
-- Like seeds/270, this is inert against today's app code (which uses
-- supabaseAdmin). M-9 (auth refactor) shifts customer queries to the
-- anon client + tenant-scoped JWT, at which point these policies fire.
--
-- Spec: docs/planning/in-progress/MULTI_TENANCY_FOUNDATION.md §3.2 + §6.2 M-7.
-- ============================================================================

BEGIN;

-- Helper function (same shape as in seeds/270 — recreated since 270
-- dropped it at the end of the transaction).
CREATE OR REPLACE FUNCTION public._enable_tenant_rls(p_table TEXT) RETURNS VOID
LANGUAGE plpgsql AS $$
DECLARE
  rls_enabled BOOLEAN;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = p_table
  ) THEN
    RAISE NOTICE 'Skipping % — table does not exist', p_table;
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = p_table AND column_name = 'org_id'
  ) THEN
    RAISE NOTICE 'Skipping % — no org_id column', p_table;
    RETURN;
  END IF;
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
  EXECUTE format($f$
    CREATE POLICY %I ON public.%I FOR SELECT
    USING (
      org_id IN (
        SELECT org_id FROM public.organization_members
         WHERE user_email = auth.email() AND status = 'active'
      )
    )$f$,
    p_table || '_tenant_select', p_table);
  EXECUTE format($f$
    CREATE POLICY %I ON public.%I FOR INSERT
    WITH CHECK (
      org_id IN (
        SELECT org_id FROM public.organization_members
         WHERE user_email = auth.email() AND status = 'active'
      )
    )$f$,
    p_table || '_tenant_insert', p_table);
  EXECUTE format($f$
    CREATE POLICY %I ON public.%I FOR UPDATE
    USING (
      org_id IN (
        SELECT org_id FROM public.organization_members
         WHERE user_email = auth.email() AND status = 'active'
      )
    )$f$,
    p_table || '_tenant_update', p_table);
  EXECUTE format($f$
    CREATE POLICY %I ON public.%I FOR DELETE
    USING (
      org_id IN (
        SELECT org_id FROM public.organization_members
         WHERE user_email = auth.email() AND role = 'admin' AND status = 'active'
      )
    )$f$,
    p_table || '_tenant_delete', p_table);
  RAISE NOTICE 'RLS enabled on %', p_table;
END $$;

-- Mid-blast tables (M-7): operational data with personal info but
-- not financial. Order doesn't matter — each is self-contained.
DO $$
DECLARE
  mid_blast_tables TEXT[] := ARRAY[
    -- Work / business management operational data
    'jobs', 'job_team', 'job_tags', 'job_files',
    'assignments', 'leads', 'schedule_events',
    -- Field data
    'field_data_points', 'field_data_attachments',
    -- Equipment (everything except financial valuations)
    'equipment', 'equipment_assignments', 'equipment_templates',
    'equipment_template_items', 'equipment_maintenance',
    'equipment_maintenance_events', 'equipment_consumables',
    'equipment_overrides', 'equipment_photos',
    -- Vehicles + mileage
    'vehicles', 'mileage_entries',
    -- Research operational tables (not the financial ones — those
    -- are M-8: research_subscriptions, document_wallet_balance, etc.)
    'research_projects', 'research_documents',
    'research_document_versions', 'research_artifacts',
    'research_runs', 'research_pipeline_jobs',
    'research_report_shares', 'research_lidar_runs',
    -- Learning progress + fieldbook (personal but not financial)
    'learning_progress', 'quiz_attempts', 'module_completions',
    'fieldbook_entries', 'fieldbook_entry_attachments', 'learning_credits',
    -- Communication
    'messages', 'discussions', 'discussion_threads',
    'notes'
  ];
  t TEXT;
BEGIN
  FOREACH t IN ARRAY mid_blast_tables LOOP
    PERFORM public._enable_tenant_rls(t);
  END LOOP;
END $$;

-- Helper persists for M-8 to reuse.

COMMIT;

-- ── Verification ─────────────────────────────────────────────────────────
--
--   -- Confirm RLS enabled on every mid-blast table:
--   SELECT relname, relrowsecurity FROM pg_class
--    WHERE relname IN ('jobs', 'field_data_points', 'equipment',
--                      'vehicles', 'learning_progress', 'research_projects')
--    ORDER BY relname;

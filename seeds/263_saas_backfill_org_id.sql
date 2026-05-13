-- ============================================================================
-- 263_saas_backfill_org_id.sql
--
-- SaaS pivot — Phase A slice M-4: backfill org_id on every tenant table
-- to Starr's id. All existing rows belong to Starr because today's
-- production data is single-tenant.
--
-- Slice M-5 (next migration) tightens to NOT NULL after this completes
-- successfully. Slice M-6+ enables RLS once the columns are populated.
--
-- Idempotent: only updates WHERE org_id IS NULL. Re-running is a no-op.
--
-- Safety: each table is in its own statement. If one fails (e.g. table
-- doesn't exist on this DB), the rest still complete. RAISE NOTICE is the
-- audit trail; check the seeds log post-deploy.
--
-- Spec: docs/planning/in-progress/MULTI_TENANCY_FOUNDATION.md §6.2 (M-4).
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public._maybe_backfill_org_id(p_table TEXT, p_org_id UUID) RETURNS VOID
LANGUAGE plpgsql AS $$
DECLARE
  affected BIGINT;
BEGIN
  -- Skip tables that don't exist on this DB.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = p_table
  ) THEN
    RAISE NOTICE 'Skipping % — table does not exist', p_table;
    RETURN;
  END IF;
  -- Skip tables that didn't get the org_id column in M-1 (probably means
  -- the table didn't exist when M-1 ran; harmless either way).
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = p_table AND column_name = 'org_id'
  ) THEN
    RAISE NOTICE 'Skipping % — org_id column does not exist (M-1 may not have run)', p_table;
    RETURN;
  END IF;
  EXECUTE format(
    'UPDATE public.%I SET org_id = $1 WHERE org_id IS NULL',
    p_table
  ) USING p_org_id;
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected > 0 THEN
    RAISE NOTICE 'Backfilled % rows in %', affected, p_table;
  END IF;
END $$;

DO $$
DECLARE
  starr_org_id UUID := '00000000-0000-0000-0000-000000000001';
  tenant_tables TEXT[] := ARRAY[
    -- Same list as M-1's ALTER pass. Order is irrelevant since each is
    -- self-contained.
    'jobs', 'job_team', 'job_tags', 'job_files',
    'employees', 'time_logs', 'time_log_advances', 'time_log_bonuses', 'time_log_rates',
    'assignments', 'leads', 'mileage_entries', 'vehicles', 'schedule_events',
    'field_data_points', 'field_data_attachments',
    'equipment', 'equipment_assignments', 'equipment_templates', 'equipment_template_items',
    'equipment_maintenance', 'equipment_maintenance_events', 'equipment_consumables',
    'equipment_overrides', 'equipment_tax_elections', 'equipment_photos',
    'research_projects', 'research_documents', 'research_document_versions',
    'research_artifacts', 'research_runs', 'research_pipeline_jobs',
    'research_report_shares', 'research_lidar_runs',
    'document_wallet_balance', 'document_purchase_history', 'research_usage_events',
    'research_subscriptions',
    'payroll_periods', 'payroll_entries', 'payout_log', 'pay_progression',
    'pay_advances', 'pay_bonuses', 'certifications', 'profile_changes',
    'receipts', 'receipt_attachments',
    'messages', 'message_contacts', 'discussions', 'discussion_threads',
    'discussion_messages', 'notes',
    'learning_progress', 'quiz_attempts', 'module_completions',
    'fieldbook_entries', 'fieldbook_entry_attachments', 'learning_credits',
    'notifications', 'error_reports',
    'rewards_balance', 'rewards_history', 'rewards_store_purchases'
  ];
  t TEXT;
BEGIN
  FOREACH t IN ARRAY tenant_tables LOOP
    PERFORM public._maybe_backfill_org_id(t, starr_org_id);
  END LOOP;
END $$;

DROP FUNCTION public._maybe_backfill_org_id(TEXT, UUID);

COMMIT;

-- ── Verification ─────────────────────────────────────────────────────────
--
-- After this slice, every row in every tenant table should have
-- org_id = Starr's id. Run this to catch any stragglers:
--
--   DO $$
--   DECLARE r RECORD; n BIGINT;
--   BEGIN
--     FOR r IN
--       SELECT table_name FROM information_schema.columns
--        WHERE table_schema = 'public' AND column_name = 'org_id'
--     LOOP
--       EXECUTE format('SELECT count(*) FROM public.%I WHERE org_id IS NULL', r.table_name)
--          INTO n;
--       IF n > 0 THEN
--         RAISE NOTICE 'STRAGGLER: %.org_id has % NULL rows', r.table_name, n;
--       END IF;
--     END LOOP;
--   END $$;

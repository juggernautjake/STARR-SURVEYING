-- ============================================================================
-- 264_saas_org_id_not_null.sql
--
-- SaaS pivot — Phase A slice M-5: tighten org_id to NOT NULL across every
-- tenant table after M-4 backfill has populated the column.
--
-- This migration MUST run after 263 (M-4 backfill) has completed
-- successfully. seeds/run_all.sh applies in lexicographic order so the
-- 264 prefix guarantees that.
--
-- The constraint fails if M-4 left any NULLs. Failure is loud + safe
-- (the ALTER aborts; no partial state). The verification query at the
-- bottom of seeds/263 catches stragglers before this slice runs.
--
-- Spec: docs/planning/in-progress/MULTI_TENANCY_FOUNDATION.md §6.2 (M-5).
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public._maybe_tighten_org_id(p_table TEXT) RETURNS VOID
LANGUAGE plpgsql AS $$
DECLARE
  null_count BIGINT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = p_table
  ) THEN
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = p_table AND column_name = 'org_id'
  ) THEN
    RETURN;
  END IF;
  -- Skip tables that are already NOT NULL (idempotency).
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = p_table AND column_name = 'org_id'
      AND is_nullable = 'NO'
  ) THEN
    RAISE NOTICE 'Skipping % — org_id already NOT NULL', p_table;
    RETURN;
  END IF;
  -- Pre-flight: refuse to tighten if any NULLs remain. Better to fail
  -- loudly than silently corrupt the schema.
  EXECUTE format('SELECT count(*) FROM public.%I WHERE org_id IS NULL', p_table)
     INTO null_count;
  IF null_count > 0 THEN
    RAISE EXCEPTION '%.org_id still has % NULL rows — re-run seeds/263 first', p_table, null_count;
  END IF;
  EXECUTE format('ALTER TABLE public.%I ALTER COLUMN org_id SET NOT NULL', p_table);
  RAISE NOTICE 'Tightened %.org_id to NOT NULL', p_table;
END $$;

DO $$
DECLARE
  tenant_tables TEXT[] := ARRAY[
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
    PERFORM public._maybe_tighten_org_id(t);
  END LOOP;
END $$;

DROP FUNCTION public._maybe_tighten_org_id(TEXT);

COMMIT;

-- ── Verification ─────────────────────────────────────────────────────────
--
--   SELECT table_name, is_nullable FROM information_schema.columns
--    WHERE table_schema = 'public' AND column_name = 'org_id'
--    ORDER BY table_name;
--   -- expected: every row's is_nullable = 'NO'

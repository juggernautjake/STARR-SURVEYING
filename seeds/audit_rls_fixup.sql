-- ============================================================================
-- audit_rls_fixup.sql
--
-- One-shot fixup for any SaaS-pivot table whose RLS got missed because
-- the table didn't exist when seeds/270, 272, or 273 first ran. Common
-- cause: those seeds ran before seeds/266 (billing) successfully landed.
--
-- Idempotent — skips tables that already have RLS enabled, the same
-- way the original helper did. Drops the helper at the end so the DB
-- state matches what seeds 270/272/273 leave behind.
-- ============================================================================

BEGIN;

-- Recreate the helper temporarily.
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
         WHERE user_email = auth.email()
           AND status = 'active'
      )
    )$f$,
    p_table || '_tenant_select', p_table);
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

-- Apply to every SaaS-pivot table that should have RLS. Idempotent.
DO $$
DECLARE
  tables_to_check TEXT[] := ARRAY[
    -- Low-blast (M-6)
    'notifications', 'org_notifications', 'error_reports', 'audit_log',
    'message_contacts', 'discussion_messages',
    -- Mid-blast (M-7)
    'jobs', 'job_team', 'job_tags', 'job_equipment', 'job_files', 'job_field_data',
    'job_time_entries', 'equipment_inventory', 'equipment_reservations',
    'vehicles', 'research_projects', 'research_documents',
    'learning_progress', 'messages', 'discussions', 'notes', 'mileage_entries',
    'assignments', 'leads', 'schedule_events',
    -- High-blast (M-8)
    'payroll_periods', 'payroll_entries', 'payout_log',
    'pay_progression', 'pay_advances', 'pay_bonuses',
    'time_logs', 'time_log_advances', 'time_log_bonuses', 'time_log_rates',
    'certifications', 'profile_changes', 'employees',
    'receipts', 'receipt_attachments',
    'equipment_tax_elections', 'equipment_fleet_valuation',
    'research_subscriptions', 'document_wallet_balance',
    'document_purchase_history', 'research_usage_events',
    'rewards_balance', 'rewards_history', 'rewards_store_purchases',
    'subscriptions', 'invoices', 'subscription_events',
    'org_invitations'
  ];
  t TEXT;
BEGIN
  FOREACH t IN ARRAY tables_to_check LOOP
    PERFORM public._enable_tenant_rls(t);
  END LOOP;
END $$;

-- Drop the helper.
DROP FUNCTION public._enable_tenant_rls(TEXT);

COMMIT;

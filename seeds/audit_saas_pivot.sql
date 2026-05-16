-- ============================================================================
-- audit_saas_pivot.sql
--
-- One-shot diagnostic for the SaaS pivot schema (seeds 260–281). Run this
-- in the Supabase SQL Editor to see exactly what's been applied and
-- what's still missing.
--
-- Read-only. Safe to run anytime.
-- ============================================================================

WITH expected_tables(t) AS (
  VALUES
    ('organizations'), ('organization_members'), ('subscriptions'), ('org_settings'),
    ('user_active_org'),
    ('operator_users'), ('impersonation_sessions'), ('audit_log'), ('pending_operator_actions'),
    ('invoices'), ('subscription_events'), ('usage_events'), ('processed_webhook_events'),
    ('org_invitations'), ('org_notifications'), ('releases'), ('release_acks'),
    ('support_tickets'), ('support_ticket_messages'),
    ('kb_articles'), ('ticket_subscribers'), ('ticket_kb_links'),
    ('email_templates'), ('broadcasts'),
    ('user_notification_prefs'),
    ('employee_payouts')
),
present AS (
  SELECT table_name AS t
  FROM information_schema.tables
  WHERE table_schema = 'public'
),
table_audit AS (
  SELECT
    e.t,
    CASE WHEN p.t IS NULL THEN 'MISSING' ELSE 'present' END AS status
  FROM expected_tables e
  LEFT JOIN present p ON e.t = p.t
)
SELECT 'TABLE: ' || t AS check_name, status AS result
FROM table_audit
UNION ALL
SELECT 'COLUMN: jobs.result',
       CASE WHEN EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_schema='public' AND table_name='jobs' AND column_name='result'
       ) THEN 'present' ELSE 'MISSING' END
UNION ALL
SELECT 'COLUMN: jobs.result_set_at',
       CASE WHEN EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_schema='public' AND table_name='jobs' AND column_name='result_set_at'
       ) THEN 'present' ELSE 'MISSING' END
UNION ALL
SELECT 'COLUMN: jobs.result_reason',
       CASE WHEN EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_schema='public' AND table_name='jobs' AND column_name='result_reason'
       ) THEN 'present' ELSE 'MISSING' END
UNION ALL
SELECT 'DATA: Starr organization seeded',
       CASE WHEN EXISTS (
         SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='organizations'
       ) AND EXISTS (
         SELECT 1 FROM public.organizations
         WHERE id = '00000000-0000-0000-0000-000000000001'
       ) THEN 'present' ELSE 'MISSING' END
UNION ALL
SELECT 'DATA: Starr subscription with all bundles',
       CASE WHEN EXISTS (
         SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='subscriptions'
       ) AND EXISTS (
         SELECT 1 FROM public.subscriptions
         WHERE org_id = '00000000-0000-0000-0000-000000000001'
           AND array_length(bundles, 1) >= 6
       ) THEN 'present' ELSE 'MISSING' END
UNION ALL
SELECT 'DATA: at least one operator_users row',
       CASE WHEN EXISTS (
         SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='operator_users'
       ) AND EXISTS (
         SELECT 1 FROM public.operator_users WHERE status='active'
       ) THEN 'present' ELSE 'MISSING (insert yourself after seeds run)' END
UNION ALL
SELECT 'RLS: ' || rls_check.tbl AS check_name,
       CASE WHEN rls_check.enabled THEN 'enabled'
            WHEN rls_check.tbl_exists THEN 'exists but RLS off'
            ELSE 'table missing' END
FROM (
  SELECT
    expected.tbl,
    EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename=expected.tbl) AS tbl_exists,
    COALESCE((
      SELECT c.relrowsecurity
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname='public' AND c.relname=expected.tbl
    ), false) AS enabled
  FROM (VALUES
    ('subscriptions'), ('invoices'), ('receipts'),
    ('payroll_runs'), ('pay_stubs'), ('employee_profiles'),
    ('org_invitations')
  ) AS expected(tbl)
) rls_check
UNION ALL
SELECT 'HELPER: _enable_tenant_rls function (should be dropped after 273)',
       CASE WHEN EXISTS (
         SELECT 1 FROM information_schema.routines
         WHERE routine_schema='public' AND routine_name='_enable_tenant_rls'
       ) THEN 'still present (273 may not have run cleanly)' ELSE 'dropped (good)' END
ORDER BY 1;

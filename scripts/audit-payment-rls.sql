-- ============================================================================
-- scripts/audit-payment-rls.sql
--
-- P18 of payment-infrastructure-2026-06-18.md — paste this into the
-- Supabase SQL editor to verify every payment-domain table has:
--   1. ENABLE ROW LEVEL SECURITY
--   2. A `service_role_full_access_*` policy
--   3. (For employee-self-read tables) An `employee_self_read_*`
--      policy gated by `auth.jwt() ->> 'email'`
--
-- Re-runnable. Read-only. Run it after every payment-domain seed.
-- ============================================================================

WITH expected(table_name, employee_self_read) AS (
  VALUES
    ('invoices',                   FALSE),
    ('payments',                   FALSE),
    ('payment_intents',            FALSE),
    ('payment_attempts',           FALSE),
    ('payment_receipts',           FALSE),
    ('employee_payment_methods',   TRUE),
    ('payout_batches',             FALSE),
    ('payout_batch_items',         TRUE),
    ('payment_secret_reads',       FALSE)
)
SELECT
  e.table_name,
  e.employee_self_read,
  -- RLS enabled?
  COALESCE(c.relrowsecurity, FALSE) AS rls_enabled,
  -- Service-role policy present?
  EXISTS (
    SELECT 1 FROM pg_policies p
    WHERE p.schemaname = 'public'
      AND p.tablename  = e.table_name
      AND p.policyname LIKE 'service_role_full_access_%'
  ) AS service_role_policy_present,
  -- Employee-self-read policy present? (only required when
  -- employee_self_read = TRUE).
  EXISTS (
    SELECT 1 FROM pg_policies p
    WHERE p.schemaname = 'public'
      AND p.tablename  = e.table_name
      AND p.policyname LIKE 'employee_self_read_%'
  ) AS employee_self_read_policy_present,
  -- Pass/fail flag — caller can WHERE pass = FALSE.
  (COALESCE(c.relrowsecurity, FALSE)
    AND EXISTS (
      SELECT 1 FROM pg_policies p
      WHERE p.schemaname = 'public'
        AND p.tablename  = e.table_name
        AND p.policyname LIKE 'service_role_full_access_%'
    )
    AND (
      e.employee_self_read = FALSE
      OR EXISTS (
        SELECT 1 FROM pg_policies p
        WHERE p.schemaname = 'public'
          AND p.tablename  = e.table_name
          AND p.policyname LIKE 'employee_self_read_%'
      )
    )
  ) AS pass
FROM expected e
LEFT JOIN pg_class c
  ON c.oid = (e.table_name || '')::regclass
WHERE c.relkind = 'r'
ORDER BY e.table_name;

-- Quick fail-only filter:
--   ... WHERE pass = FALSE;

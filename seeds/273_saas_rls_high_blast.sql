-- ============================================================================
-- 273_saas_rls_high_blast.sql
--
-- SaaS pivot — Phase A slice M-8: enable Row-Level Security on the
-- HIGH-blast-radius tenant tables — the financial ones. A leaked row
-- from these means a customer sees another firm's payroll, receipts,
-- Stripe transactions. Worst-case-scenario tables; highest review bar.
--
-- Pre-conditions:
--   - seeds/270 (M-6) + 272 (M-7) have shipped lower-tier RLS without
--     incident.
--   - seeds/264 (M-5) confirmed org_id is NOT NULL on every tenant
--     table.
--
-- Policies are the same shape as M-6 / M-7 — member-tenant SELECT/
-- INSERT/UPDATE, admin-only DELETE. The bar for *correctness* is
-- higher: every row's org_id must trace to a real organization, and
-- the policy must never let cross-tenant SELECT through.
--
-- Spec: docs/planning/in-progress/MULTI_TENANCY_FOUNDATION.md §3.2 + §6.2 M-8.
-- ============================================================================

BEGIN;

-- Helper was preserved across M-6 + M-7 in seeds/272. Verify it exists
-- — if not (because someone ran 273 standalone), recreate.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.routines
    WHERE routine_schema = 'public' AND routine_name = '_enable_tenant_rls'
  ) THEN
    RAISE EXCEPTION 'Helper public._enable_tenant_rls missing; run seeds/270 or 272 first.';
  END IF;
END $$;

-- High-blast tables (M-8): financial data. Treat these as
-- worst-case-if-leaked.
DO $$
DECLARE
  high_blast_tables TEXT[] := ARRAY[
    -- Payroll + pay
    'payroll_periods', 'payroll_entries', 'payout_log',
    'pay_progression', 'pay_advances', 'pay_bonuses',
    'time_logs', 'time_log_advances', 'time_log_bonuses', 'time_log_rates',
    'certifications', 'profile_changes',
    -- Employees roster (has SSN-adjacent data)
    'employees',
    -- Receipts + financial records
    'receipts', 'receipt_attachments',
    -- Finance + valuations
    'equipment_tax_elections', 'equipment_fleet_valuation',
    -- Research billing / wallet / subscriptions
    'research_subscriptions', 'document_wallet_balance',
    'document_purchase_history', 'research_usage_events',
    -- Rewards (point balances; redeemable)
    'rewards_balance', 'rewards_history', 'rewards_store_purchases',
    -- SaaS-side subscriptions + invoices + payment events
    'subscriptions', 'invoices', 'subscription_events',
    -- Org-side billing + admin metadata
    'org_invitations', 'message_contacts', 'discussion_messages'
  ];
  t TEXT;
BEGIN
  FOREACH t IN ARRAY high_blast_tables LOOP
    PERFORM public._enable_tenant_rls(t);
  END LOOP;
END $$;

-- Drop the helper now that M-6/7/8 are all shipped. Future RLS work
-- recreates as needed.
DROP FUNCTION public._enable_tenant_rls(TEXT);

COMMIT;

-- ── Verification ─────────────────────────────────────────────────────────
--
-- After this slice + M-9 auth refactor, every tenant table should have
-- RLS enabled. The audit query:
--
--   SELECT t.table_name, c.relrowsecurity
--     FROM information_schema.tables t
--     JOIN pg_class c ON c.relname = t.table_name
--     JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
--    WHERE t.table_schema = 'public'
--      AND EXISTS (
--        SELECT 1 FROM information_schema.columns
--         WHERE table_schema = 'public' AND table_name = t.table_name AND column_name = 'org_id'
--      )
--    ORDER BY c.relrowsecurity, t.table_name;
--   -- expected: every row's relrowsecurity = true post-M-8

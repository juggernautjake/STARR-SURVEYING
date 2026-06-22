-- ============================================================================
-- 360_customer_invoice_deposits.sql
--
-- S2 of CUSTOMER_INVOICING_BUILD_2026-06-21.md — upfront / deposit support on
-- customer_invoices.
--
-- A customer must pay AT LEAST the upfront amount (which can be $0) on their
-- first payment and AT MOST the invoice total. We store the rule (type + value)
-- AND the resolved cents amount so the customer-facing math is a simple compare.
--
--   deposit_type        'none' | 'percent' | 'fixed'
--   deposit_value       percent (0-100) when 'percent'; dollars when 'fixed'
--   deposit_amount_cents resolved upfront requirement in cents (set at create)
--   upfront_paid_at     stamped when cumulative succeeded payments first meet
--                       deposit_amount_cents
--
-- Idempotent — ADD COLUMN IF NOT EXISTS.
-- ============================================================================

BEGIN;

ALTER TABLE public.customer_invoices
  ADD COLUMN IF NOT EXISTS deposit_type TEXT NOT NULL DEFAULT 'none'
    CHECK (deposit_type IN ('none', 'percent', 'fixed')),
  ADD COLUMN IF NOT EXISTS deposit_value         NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS deposit_amount_cents  BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS upfront_paid_at       TIMESTAMPTZ;

COMMENT ON COLUMN public.customer_invoices.deposit_amount_cents IS
  'Resolved upfront requirement in cents (from deposit_type/value at create time). 0 = no upfront.';

COMMIT;

-- Verification:
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name='customer_invoices'
--     AND column_name IN ('deposit_type','deposit_value','deposit_amount_cents','upfront_paid_at');
--   -- four rows

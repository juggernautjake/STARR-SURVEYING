-- ============================================================================
-- 298_employee_payouts.sql
--
-- employee-pond Slice E13 — per-employee payout ledger. Backs the
-- admin "everything" view's Payouts tab (E14). ALWAYS admin-only
-- for non-self viewers — enforced by ALWAYS_ADMIN_ONLY_FIELDS in
-- lib/employee-pond/visibility.ts.
--
-- One row per paycheck / direct deposit / cash advance / payroll
-- run. Period bounds identify the pay window; gross + net are in
-- cents. `items` carries the line-item breakdown
-- (regular_hours, ot_hours, mileage, bonuses, deductions, etc.) as
-- a JSONB blob — the structure is intentionally flexible because
-- early payroll runs were ad-hoc spreadsheets and we don't want to
-- carve a rigid schema before the second-or-third use case lands.
--
-- Spec: docs/planning/in-progress/employee-pond-2026-06-16.md (E13)
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.employee_payouts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email      TEXT NOT NULL,
  period_start    DATE NOT NULL,
  period_end      DATE NOT NULL,
  gross_cents     BIGINT NOT NULL,
  net_cents       BIGINT NOT NULL,
  items           JSONB NOT NULL DEFAULT '[]'::jsonb,
  paid_at         TIMESTAMPTZ NOT NULL,
  method          TEXT NOT NULL DEFAULT 'direct_deposit',  -- direct_deposit | check | cash | other
  reference       TEXT,                                    -- check #, ACH ref, etc.
  notes           TEXT,
  created_by      TEXT,                                    -- admin email
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT employee_payouts_period_window
    CHECK (period_start <= period_end),
  CONSTRAINT employee_payouts_amounts_sane
    CHECK (gross_cents >= 0 AND net_cents >= 0 AND net_cents <= gross_cents)
);

COMMENT ON TABLE public.employee_payouts IS
  'Per-employee payout ledger. gross_cents = total earned; net_cents '
  '= after taxes/deductions; items = JSONB array of line items so the '
  'schema stays flexible while the bookkeeping shape settles. '
  'method enumerates the payment channel. Always admin-only for '
  'non-self viewers per lib/employee-pond/visibility.ts.';

CREATE INDEX IF NOT EXISTS idx_employee_payouts_user_email_paid_at
  ON public.employee_payouts (user_email, paid_at DESC);
CREATE INDEX IF NOT EXISTS idx_employee_payouts_period_end
  ON public.employee_payouts (period_end DESC);

COMMIT;

-- Verification:
--   \d+ public.employee_payouts
--   SELECT count(*) FROM public.employee_payouts;

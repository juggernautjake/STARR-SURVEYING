-- seeds/281_employee_payouts.sql
--
-- R-13 of OWNER_REPORTS.md. Adds an outflow ledger for owner-paid
-- employee compensation outside the formal payroll runs. Captures
-- the actual rail (Venmo / CashApp / Stripe / Check / Cash / Other)
-- and a free-text reference (txn id / check number).
--
-- Additive; idempotent.

CREATE TABLE IF NOT EXISTS public.employee_payouts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_email      TEXT NOT NULL,
  amount_cents    BIGINT NOT NULL CHECK (amount_cents > 0),
  method          TEXT NOT NULL CHECK (method IN ('venmo','cashapp','stripe','check','cash','ach','zelle','other')),
  reference       TEXT,                            -- txn id / check number / Stripe payment id
  period_start    DATE,                            -- pay-period covered (optional; for one-off bonuses leave null)
  period_end      DATE,
  notes           TEXT,
  paid_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      TEXT NOT NULL,                   -- recording admin's email
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_employee_payouts_org_paid_at
  ON public.employee_payouts(org_id, paid_at DESC);

CREATE INDEX IF NOT EXISTS idx_employee_payouts_user
  ON public.employee_payouts(org_id, user_email, paid_at DESC);

CREATE INDEX IF NOT EXISTS idx_employee_payouts_method
  ON public.employee_payouts(org_id, method, paid_at DESC);

COMMENT ON TABLE public.employee_payouts IS
  'Owner-initiated employee compensation outflows. Records the actual
   rail used (Venmo / CashApp / Stripe / Check / Cash / etc.) for
   audit + reconciliation. Distinct from the formal payroll_runs +
   pay_stubs flow — captures the day-to-day "I just sent you $300 via
   Venmo for that side job" reality.';

COMMENT ON COLUMN public.employee_payouts.method IS
  'Payment rail. venmo / cashapp / stripe / check / cash / ach / zelle / other.';

COMMENT ON COLUMN public.employee_payouts.reference IS
  'Free-text reference: transaction id, check number, Stripe payment intent id, etc.';

COMMENT ON COLUMN public.employee_payouts.period_start IS
  'Optional pay-period start. Null for one-off bonuses / reimbursements.';

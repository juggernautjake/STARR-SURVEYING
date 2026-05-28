-- ============================================================================
-- 298_pto_accrual.sql
--
-- PTO balance + accrual system. Closes the Slice 4 deferred "PTO Balance"
-- dashboard tile.
--
-- pto_balances              one row per employee
--   user_email TEXT PK
--   accrual_rate_hours      hours accrued per pay period (default 3.08 ≈
--                           80 h / 26 biweekly periods, the US 2-weeks-of-
--                           PTO industry default)
--   accrual_period          'biweekly' | 'monthly' | 'annual'
--   balance_hours           current available balance (negative allowed
--                           but flagged on the UI)
--   carryover_cap_hours     ceiling at end of year; rollover is min(bal, cap)
--   last_accrued_at         when the cron last ran for this user
--
-- pto_transactions          audit trail of credits + debits
--   id, user_email, delta_hours, kind ('accrual' | 'time_off' | 'manual' |
--   'rollover' | 'payout'), reason TEXT, schedule_event_id (nullable),
--   created_at
--
-- A simple SQL function pto_accrue_user(email) is provided so an external
-- cron can call it on the configured schedule. The accrual is idempotent
-- within the same period via last_accrued_at.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.pto_balances (
  user_email           TEXT PRIMARY KEY,
  accrual_rate_hours   NUMERIC(6,2) NOT NULL DEFAULT 3.08,
  accrual_period       TEXT NOT NULL DEFAULT 'biweekly'
    CHECK (accrual_period IN ('biweekly', 'monthly', 'annual')),
  balance_hours        NUMERIC(8,2) NOT NULL DEFAULT 0,
  carryover_cap_hours  NUMERIC(8,2) NOT NULL DEFAULT 80,
  last_accrued_at      TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.pto_transactions (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email           TEXT NOT NULL,
  delta_hours          NUMERIC(8,2) NOT NULL,
  kind                 TEXT NOT NULL
    CHECK (kind IN ('accrual', 'time_off', 'manual', 'rollover', 'payout')),
  reason               TEXT,
  schedule_event_id    UUID REFERENCES public.schedule_events(id) ON DELETE SET NULL,
  created_by           TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pto_txn_user_email
  ON public.pto_transactions(user_email, created_at DESC);

-- Convert accrual_period to the interval used for the idempotency window.
CREATE OR REPLACE FUNCTION pto_accrual_interval(period TEXT)
RETURNS INTERVAL LANGUAGE SQL IMMUTABLE AS $$
  SELECT CASE period
    WHEN 'biweekly' THEN INTERVAL '14 days'
    WHEN 'monthly'  THEN INTERVAL '1 month'
    WHEN 'annual'   THEN INTERVAL '1 year'
  END;
$$;

-- Accrue PTO for a single user, idempotent within the configured period.
-- Returns the hours credited (0 if already accrued for this period).
CREATE OR REPLACE FUNCTION pto_accrue_user(p_email TEXT)
RETURNS NUMERIC LANGUAGE plpgsql AS $$
DECLARE
  r RECORD;
  due BOOLEAN;
BEGIN
  SELECT * INTO r FROM public.pto_balances WHERE user_email = p_email;
  IF NOT FOUND THEN RETURN 0; END IF;

  due := r.last_accrued_at IS NULL
      OR now() - r.last_accrued_at >= pto_accrual_interval(r.accrual_period);
  IF NOT due THEN RETURN 0; END IF;

  UPDATE public.pto_balances
    SET balance_hours    = balance_hours + r.accrual_rate_hours,
        last_accrued_at  = now(),
        updated_at       = now()
    WHERE user_email = p_email;

  INSERT INTO public.pto_transactions (user_email, delta_hours, kind, reason)
    VALUES (p_email, r.accrual_rate_hours, 'accrual',
            'Periodic accrual (' || r.accrual_period || ')');

  RETURN r.accrual_rate_hours;
END;
$$;

COMMIT;

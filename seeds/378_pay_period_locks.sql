-- ============================================================================
-- 378_pay_period_locks.sql
--
-- Slice H6 of docs/planning/in-progress/01_HOURS_TIME_CORRECTION_2026-06-24.md
--
-- Pay-period lock. Once whoever is in charge approves & locks a pay period,
-- employees can no longer edit or delete their own daily_time_logs whose
-- log_date falls inside that range — enforced in the time-logs API
-- (app/api/admin/time-logs/route.ts via lib/hours/period-lock.ts). Admins can
-- still adjust a locked log (with a reason; the worker is notified). One row
-- per locked period; unlocking deletes the row.
--
-- Idempotent. No dependency on the daily_time_logs table (the check is a
-- date-range overlap, not a foreign key).
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.pay_period_locks (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start date        NOT NULL,
  period_end   date        NOT NULL,
  locked_by    text        NOT NULL,
  locked_at    timestamptz NOT NULL DEFAULT now(),
  note         text,
  CONSTRAINT pay_period_locks_range_ck CHECK (period_end >= period_start)
);

-- Fast "is this date locked?" range lookup.
CREATE INDEX IF NOT EXISTS pay_period_locks_range_idx
  ON public.pay_period_locks (period_start, period_end);

-- One lock per exact range (re-locking the same period is a no-op upsert).
CREATE UNIQUE INDEX IF NOT EXISTS pay_period_locks_unique_range_idx
  ON public.pay_period_locks (period_start, period_end);

COMMIT;

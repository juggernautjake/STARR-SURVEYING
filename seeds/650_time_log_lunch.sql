-- seeds/650_time_log_lunch.sql — how long they were at lunch.
--
-- Owner, 2026-09-19: "employees need to be able to log their lunch time too. Like, if someone
-- clocks in at the beginning of the work day, works all day, and then logs out at the end, whenever
-- they log out, they should have the option of recording how long their lunch time was. That way
-- whoever is approving hours and paying people can see what the total lunch time is for each day
-- and the week and they can revize the payment to account for the time spent at lunch."
--
-- ── IT IS RECORDED, NOT DEDUCTED ────────────────────────────────────────────────────────────────
--
-- Confirmed with the owner before building: a day still reports the hours that were clocked, and
-- the lunch sits beside it as its own number. The approver sees both and decides.
--
-- That is the whole reason this is a separate column rather than an adjustment to `hours`. Silently
-- subtracting would make the number an employee clocked and the number they are paid for two
-- different things with no record of why they differ — and a mistyped "90" would quietly cut
-- somebody's pay with nothing on the row to show it happened. `adjusted_hours` already exists for
-- when an approver decides to change what is payable, and that is the column that should move.
--
-- ── NULL IS NOT ZERO ────────────────────────────────────────────────────────────────────────────
--
-- NULL means nobody was asked, or nobody answered: every row written before today, and every row
-- entered by the office on somebody's behalf. 0 means a person was asked and said they did not take
-- one. Those are different facts and an approver reading a timesheet needs to tell them apart —
-- "no lunch recorded" is a question to ask, "no lunch taken" is an answer. Defaulting to 0 would
-- turn every historical row into a claim nobody made.

BEGIN;

ALTER TABLE public.daily_time_logs
  ADD COLUMN IF NOT EXISTS lunch_minutes integer;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'daily_time_logs_lunch_minutes_check') THEN
    ALTER TABLE public.daily_time_logs
      ADD CONSTRAINT daily_time_logs_lunch_minutes_check
      -- 0 to 8 hours. The upper bound is not a policy about how long lunch may be; it is a
      -- typo guard, because the realistic way this column goes wrong is somebody entering 45 in a
      -- box they think is hours, or 300 in a box they think is minutes and meaning 3:00.
      CHECK (lunch_minutes IS NULL OR (lunch_minutes >= 0 AND lunch_minutes <= 480));
  END IF;
END $$;

COMMENT ON COLUMN public.daily_time_logs.lunch_minutes IS
  'Minutes at lunch on this day, as reported by the person at clock-out. NULL = never recorded (including every row before 2026-09-19 and rows entered by the office); 0 = asked and no lunch taken. Deliberately NOT subtracted from `hours` — the approver sees it and decides, and `adjusted_hours` is the column that moves when they do. See seeds/650.';

-- The approver's question, asked per person per period: how much lunch is on this timesheet?
CREATE INDEX IF NOT EXISTS idx_daily_time_logs_lunch
  ON public.daily_time_logs (user_email, log_date)
  WHERE lunch_minutes IS NOT NULL;

COMMIT;

-- ============================================================================
-- 309_schedule_reminders.sql
--
-- Slice S3 (calendar-day-create-and-alerts-2026-06-17) — extend
-- public.schedule_events with the per-event reminder lead-time list
-- the user asked for:
--
--   "We need a whole alert system so that we can set reminders for
--    events coming up."
--
-- reminder_minutes_before  Array of "how many minutes before the
--                          start should we ping the assignee?" leads.
--                          The default `{60}` mirrors the previous
--                          hard-coded 1-hour behavior, so rows
--                          written before this migration keep their
--                          single-hour reminder.
--
-- The hourly schedule-event-reminders cron reads this array and fires
-- one notification per lead whose "ready to fire" moment
-- (start_time - lead) falls in the current hour's window. An empty
-- array means "no reminders for this event".
--
-- Spec: docs/planning/in-progress/calendar-day-create-and-alerts-2026-06-17.md
-- ============================================================================

BEGIN;

ALTER TABLE public.schedule_events
  ADD COLUMN IF NOT EXISTS reminder_minutes_before INTEGER[] NOT NULL DEFAULT '{60}';

-- The cron scans by `start_time` for the next ~25-hour window
-- (max-lead 24h + the cron's own 1h window). No additional index
-- needed; the existing idx_schedule_start_time covers it.

COMMIT;

-- Verification:
--   SELECT column_name, data_type, column_default
--     FROM information_schema.columns
--    WHERE table_name = 'schedule_events'
--      AND column_name = 'reminder_minutes_before';
--   -- reminder_minutes_before | ARRAY | '{60}'::integer[]

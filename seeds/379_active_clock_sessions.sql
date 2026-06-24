-- ============================================================================
-- 379_active_clock_sessions.sql
--
-- Slice C1 of docs/planning/in-progress/02_CLOCK_IN_WORK_MODE_2026-06-24.md
--
-- Server-side record of the hub "work-mode" clock. Until now clocking in only
-- wrote localStorage, so the server (and the 6pm still-clocked-in reminder cron
-- from the hours plan) couldn't tell who was on the clock. job_time_entries is
-- job-scoped (requires a job_id) so it can't represent a job-less work-mode
-- shift; this table holds exactly one open session per user.
--
-- Written on clock-in, deleted on clock-out (app/api/admin/clock-session).
-- Idempotent.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.active_clock_sessions (
  user_email text        PRIMARY KEY,
  started_at  timestamptz NOT NULL DEFAULT now(),
  job_id      text,
  tag_ids     jsonb       NOT NULL DEFAULT '[]'::jsonb,
  source      text,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- The reminder cron scans by start time; index it.
CREATE INDEX IF NOT EXISTS active_clock_sessions_started_at_idx
  ON public.active_clock_sessions (started_at);

COMMIT;

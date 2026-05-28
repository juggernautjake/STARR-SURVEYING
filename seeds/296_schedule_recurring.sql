-- ============================================================================
-- 296_schedule_recurring.sql
--
-- Extend public.schedule_events with the recurrence + status + series columns
-- used by Slice 26 (recurring events) and Slice 27 (time-off approval).
--
-- recurrence_rule  RFC-5545-ish RRULE string (e.g. 'FREQ=WEEKLY;BYDAY=MO,WE,FR')
--                  Stored as text; the API expands it on read into virtual
--                  occurrences within the requested window.
-- recurrence_end   Last date (inclusive) at which occurrences are generated.
--                  Null = infinite (the API caps expansion at ~1 year out).
-- series_id        Groups occurrences. NULL for non-recurring events.
-- status           For time-off requests: pending / approved / denied.
--                  Defaults to 'approved' so non-time-off events stay visible.
--
-- Spec: docs/planning/in-progress/backend-audit-and-improvements-2026-05-27.md
--       (Slice 12 deferred items)
-- ============================================================================

BEGIN;

ALTER TABLE public.schedule_events
  ADD COLUMN IF NOT EXISTS recurrence_rule TEXT,
  ADD COLUMN IF NOT EXISTS recurrence_end  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS series_id       UUID,
  ADD COLUMN IF NOT EXISTS status          TEXT NOT NULL DEFAULT 'approved'
    CHECK (status IN ('approved', 'pending', 'denied'));

CREATE INDEX IF NOT EXISTS idx_schedule_series_id
  ON public.schedule_events(series_id) WHERE series_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_schedule_status
  ON public.schedule_events(status);

COMMIT;

-- Verification:
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name = 'schedule_events'
--      AND column_name IN ('recurrence_rule', 'recurrence_end', 'series_id', 'status');

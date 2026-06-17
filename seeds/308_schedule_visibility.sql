-- ============================================================================
-- 308_schedule_visibility.sql
--
-- Slice S2 (calendar-day-create-and-alerts-2026-06-17) — extend
-- public.schedule_events with the visibility model the user asked for:
--
--   "We can either include specific users, or all users, or keep it
--    private. This way people can use the calendar as a private
--    scheduler."
--
-- visibility       Enum-via-CHECK. 'private' (creator + assignee only),
--                  'specific_users' (the creator picks the viewers via
--                  viewer_emails), or 'all_users' (everyone on the
--                  team). Defaults to 'private' so existing rows
--                  written before this migration keep behaving like
--                  the assignee-only events they were.
-- viewer_emails    Array of user emails that get to SEE the event in
--                  addition to the assignee. Only consulted when
--                  visibility = 'specific_users'. Empty array is the
--                  safe default; we never silently expose an event.
--
-- The /api/admin/schedule GET endpoint reads these columns and ORs
-- them into its access filter (S2 wiring lands in the same slice).
--
-- Spec: docs/planning/in-progress/calendar-day-create-and-alerts-2026-06-17.md
-- ============================================================================

BEGIN;

ALTER TABLE public.schedule_events
  ADD COLUMN IF NOT EXISTS visibility    TEXT NOT NULL DEFAULT 'private'
    CHECK (visibility IN ('private', 'specific_users', 'all_users')),
  ADD COLUMN IF NOT EXISTS viewer_emails TEXT[] NOT NULL DEFAULT '{}';

-- A GIN index on viewer_emails lets the API answer "events this user
-- can see" with an index-backed `viewer_emails @> ARRAY[<email>]` lookup.
CREATE INDEX IF NOT EXISTS idx_schedule_viewer_emails
  ON public.schedule_events USING GIN (viewer_emails);

-- A small btree on visibility helps the common filter paths split
-- private/specific/all without a sequential scan once the table grows.
CREATE INDEX IF NOT EXISTS idx_schedule_visibility
  ON public.schedule_events(visibility);

COMMIT;

-- Verification:
--   SELECT column_name, data_type, is_nullable
--     FROM information_schema.columns
--    WHERE table_name = 'schedule_events'
--      AND column_name IN ('visibility', 'viewer_emails');
--   -- visibility    | text     | NO
--   -- viewer_emails | ARRAY    | NO

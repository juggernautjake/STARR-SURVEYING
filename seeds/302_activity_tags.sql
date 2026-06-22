-- seeds/302_activity_tags.sql
--
-- Activity tag catalog. Tags auto-classify time entries against
-- work_type multipliers (Slice 181). System tags are seeded by the
-- migration; user-defined tags carry `system = false`.
--
-- Slice 180 of customizable-hub-and-work-mode-2026-05-28.md.

CREATE TABLE IF NOT EXISTS public.activity_tags (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label         text NOT NULL,
  color         text NOT NULL,
  -- True = built-in (cannot be deleted); false = user-defined.
  system        boolean NOT NULL DEFAULT false,
  -- Optional pay-multiplier key — if set, joining via work_type_rates
  -- adjusts the time entry's effective hourly rate. Default 1.0 when
  -- omitted.
  work_type_key text,
  created_by    text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activity_tags_system ON public.activity_tags (system);

-- Optional: bind activity tags to time-log rows. NULL when the user
-- skipped the tag picker (legacy + first-load case).
ALTER TABLE public.daily_time_logs
  ADD COLUMN IF NOT EXISTS activity_tag_ids uuid[];

-- Seed the system tags. The original `ON CONFLICT DO NOTHING` clause
-- below was a no-op until seed 375 added the matching unique index on
-- `(label) WHERE system = true`. Once 375 has run, `DO NOTHING` properly
-- skips re-inserts of these 8 rows; before 375 had run, this seed could
-- produce duplicates. (See activity-tag-dedupe-2026-06-22.)
INSERT INTO public.activity_tags (label, color, system, work_type_key)
VALUES
  ('Field work',     '#10B981', true, 'field'),
  ('Drafting',       '#3B82F6', true, 'cad'),
  ('Research',       '#8B5CF6', true, 'research'),
  ('Office',         '#6366F1', true, 'office'),
  ('Travel',         '#F59E0B', true, 'travel'),
  ('Meeting',        '#7C3AED', true, NULL),
  ('Equipment',      '#0891B2', true, NULL),
  ('Training',       '#D97706', true, NULL)
ON CONFLICT DO NOTHING;

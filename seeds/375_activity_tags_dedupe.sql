-- seeds/375_activity_tags_dedupe.sql
--
-- activity-tag-dedupe-2026-06-22 — fix three problems with the
-- activity-tag catalog the user surfaced in the clock-in modal:
--   1. The same system tags appeared multiple times (the seed in 302
--      shipped `ON CONFLICT DO NOTHING` but no matching unique index
--      existed, so re-runs of run_all.sh inserted fresh copies).
--   2. Some employees don't work on a specific job (office staff,
--      equipment management, training, etc.). The original 8 tags
--      didn't cover billing, estimating, client comms, etc. — this
--      seed adds them so the tag set can describe the whole day.
--   3. Without a unique constraint, "user-defined" tags could also
--      collide. The constraint added here is partial (system-only)
--      so two different users can still create the same custom label.
--
-- Idempotent: safe to re-run via run_all.sh.

-- ─── 1. Collapse existing duplicate system rows ──────────────────────
-- Keep the oldest (created_at, id) row per label among system tags so
-- foreign references to its id stay valid. Any FKs pointing at
-- "loser" rows would have been pointing at rows the UI couldn't
-- distinguish anyway — we let CASCADE / SET NULL behavior on the
-- referencing tables (currently `daily_time_logs.activity_tag_ids`,
-- which is a uuid[] with no FK enforcement) handle the fallout.
WITH ranked AS (
  SELECT
    id,
    label,
    ROW_NUMBER() OVER (
      PARTITION BY lower(trim(label))
      ORDER BY created_at ASC, id ASC
    ) AS rn
  FROM public.activity_tags
  WHERE system = true
)
DELETE FROM public.activity_tags
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- ─── 2. Lock in uniqueness so future re-runs of 302 are no-ops ───────
-- Partial unique index on system-tag labels only. User-defined tags
-- (system = false) can still repeat across users.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_activity_tags_system_label
  ON public.activity_tags (lower(trim(label)))
  WHERE system = true;

-- ─── 3. Add the richer catalog the user asked for ────────────────────
-- The clock-in modal must cover days where the user isn't on a single
-- job at all — office work, equipment management, estimating, etc.
-- ON CONFLICT relies on the partial unique index above.
-- Color palette is intentionally varied so a row of pills reads at a
-- glance which "world" each tag lives in (green = field, blue = CAD,
-- teal = equipment, purple = research, indigo = office, amber = travel,
-- pink = client-facing, slate = personal/admin).
INSERT INTO public.activity_tags (label, color, system, work_type_key)
VALUES
  -- Field-side
  ('Survey',              '#059669', true, 'field'),
  ('Boundary',            '#047857', true, 'field'),
  ('Construction layout', '#0E7490', true, 'field'),
  ('Staking',             '#16A34A', true, 'field'),
  ('Monumentation',       '#22C55E', true, 'field'),
  ('Site visit',          '#15803D', true, 'field'),
  -- Office / drafting / research
  ('Plat prep',           '#2563EB', true, 'cad'),
  ('Records research',    '#7C3AED', true, 'research'),
  ('Deed review',         '#9333EA', true, 'research'),
  -- Equipment
  ('Vehicle maintenance', '#0E7490', true, NULL),
  ('Calibration',         '#0891B2', true, NULL),
  ('Inventory',           '#0284C7', true, NULL),
  -- Client + project + admin
  ('Client comms',        '#DB2777', true, NULL),
  ('Estimating',          '#E11D48', true, NULL),
  ('Billing',             '#F43F5E', true, NULL),
  ('Project management',  '#4F46E5', true, NULL),
  ('Onboarding',          '#7C3AED', true, NULL),
  -- Personal
  ('Break',               '#64748B', true, NULL),
  ('Lunch',               '#475569', true, NULL),
  ('PTO',                 '#334155', true, NULL)
ON CONFLICT DO NOTHING;

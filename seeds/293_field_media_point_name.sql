-- ============================================================================
-- 293_field_media_point_name.sql
--
-- mobile-and-customer-query-gap Slice D1 — let mobile photos defer their
-- data_point_id binding until a TRV import or manual "+" Point capture
-- creates the matching `field_data_points` row.
--
-- Today, `field_media` rows captured BEFORE the matching point exists go
-- in with `data_point_id = NULL` and live forever as "job-level uploads".
-- The surveyor knew the point number when they captured the photo (the
-- crew member writes "BM-01" on the rover screen first), so we just
-- didn't have a column to remember it on the media row.
--
-- This seed:
--   1. Adds `point_name` to `field_media` (nullable text). Optional —
--      every mobile-captured row from the existing flow keeps working.
--   2. Adds a composite index `(job_id, point_name)` filtered to rows
--      where `data_point_id IS NULL` so the reconcile query stays fast
--      even on jobs with hundreds of orphan rows.
--
-- Read by `lib/leads/intake.ts` siblings to come (Slice D1 reconcile
-- helper); written by `mobile/lib/fieldMedia.ts` once Slice D1b ships
-- on the mobile side.
--
-- Spec: docs/planning/in-progress/mobile-and-customer-query-gap-2026-06-14.md (Slice D1)
-- ============================================================================

BEGIN;

ALTER TABLE field_media
  ADD COLUMN IF NOT EXISTS point_name TEXT;

COMMENT ON COLUMN field_media.point_name IS
  'Optional 179-code point name the surveyor entered at capture time. Used by '
  'the TRV-import reconcile helper to late-bind data_point_id once the matching '
  'field_data_points row exists. NULL on legacy rows + on captures where the '
  'point identity was unknown at capture time.';

-- Partial index so the reconcile query
--   WHERE job_id = $1 AND point_name = $2 AND data_point_id IS NULL
-- stays O(log n). Doesn't index rows that are already bound.
CREATE INDEX IF NOT EXISTS idx_field_media_orphan_by_point_name
  ON field_media (job_id, point_name)
  WHERE data_point_id IS NULL;

COMMIT;

-- Verification:
--   \d+ field_media       -- new column visible
--   SELECT indexname FROM pg_indexes WHERE tablename = 'field_media';

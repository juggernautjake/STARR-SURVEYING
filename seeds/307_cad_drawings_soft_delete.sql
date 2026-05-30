-- ============================================================================
-- 307_cad_drawings_soft_delete.sql
-- job-soft-delete plan Slice 2 — true delete with a 30-day recovery
-- window for CAD drawings, mirroring the jobs soft-delete (seeds/306).
--
-- The DELETE /api/admin/cad/drawings handler previously HARD-deleted
-- the row, so a fat-fingered delete was unrecoverable. `deleted_at`
-- is the tombstone: NULL = live, a timestamp = soft-deleted + in the
-- trash. Lists filter `deleted_at IS NULL`; the trash view reads the
-- non-null rows; the daily purge cron (Slice 3) hard-deletes past the
-- 30-day window.
--
-- Nullable on purpose: every existing drawing stays live.
-- ============================================================================

BEGIN;

ALTER TABLE cad_drawings
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS cad_drawings_deleted_at_idx
  ON cad_drawings (deleted_at)
  WHERE deleted_at IS NOT NULL;

COMMIT;

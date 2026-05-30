-- ============================================================================
-- 306_jobs_soft_delete.sql
-- job-soft-delete plan Slice 1 — true delete with a 30-day recovery
-- window, distinct from the existing `is_archived` flag (archive ≠
-- delete; an archived job is still a live job, a deleted one is in the
-- trash and auto-purges after 30 days).
--
-- `deleted_at` is the tombstone: NULL = live, a timestamp = soft-
-- deleted at that instant. Every job list filters `deleted_at IS NULL`
-- so a deleted job disappears from the normal + archived views; the
-- trash view (`?deleted=true`) reads the non-null rows. A daily purge
-- cron (Slice 2) hard-deletes rows past now() - 30 days.
--
-- Nullable on purpose: every existing row stays live.
-- ============================================================================

BEGIN;

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Partial index: the trash view + the purge-cron window scan both
-- filter on non-null deleted_at, so only tombstoned rows are indexed.
CREATE INDEX IF NOT EXISTS jobs_deleted_at_idx
  ON jobs (deleted_at)
  WHERE deleted_at IS NOT NULL;

COMMIT;

-- ============================================================================
-- 304_jobs_deliverables.sql
-- job-editing 2026-05-30 — add a free-form `deliverables` column to
-- `jobs` so the surveyor can describe what's being delivered on the
-- job (e.g., "boundary survey + topo + ALTA cert; recorded plat by
-- 2026-06-15"). Edited inline on the job detail page via the existing
-- InlineEditField + saveField pattern; persisted by the existing PUT
-- /api/admin/jobs handler with no shape change to the API.
--
-- Nullable on purpose: every existing row keeps loading + the field
-- starts empty for legacy jobs.
-- ============================================================================

BEGIN;

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS deliverables TEXT;

COMMIT;

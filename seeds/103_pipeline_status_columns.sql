-- ============================================================================
-- 103_pipeline_status_columns.sql
-- Add research_status and research_message columns to research_projects.
--
-- These columns are written by the worker's updateStatus() function during
-- deep research pipeline execution (worker/src/services/pipeline.ts).
-- They carry real-time stage labels like "Stage 1: Searching Bell CAD…"
-- which the frontend's PipelineProgressPanel polls for via the worker API.
--
-- Previously missing → all updateStatus() writes silently failed, meaning
-- the UI always showed "Stage 0" throughout the entire pipeline run.
-- ============================================================================

BEGIN;

ALTER TABLE research_projects
  ADD COLUMN IF NOT EXISTS research_status  TEXT,
  ADD COLUMN IF NOT EXISTS research_message TEXT;

COMMENT ON COLUMN research_projects.research_status  IS
  'Current stage label set by the worker pipeline (e.g. "running", "complete", "failed")';
COMMENT ON COLUMN research_projects.research_message IS
  'Latest human-readable status message from the worker pipeline (e.g. "Stage 2: Retrieving documents…")';

COMMIT;

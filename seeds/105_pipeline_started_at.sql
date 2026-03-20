-- Migration 105: Add pipeline_started_at to research_projects
-- Persists the timestamp when the pipeline run was initiated so the
-- elapsed timer can be accurately restored after page refresh or tab switch.

ALTER TABLE research_projects
  ADD COLUMN IF NOT EXISTS pipeline_started_at TIMESTAMPTZ;

COMMENT ON COLUMN research_projects.pipeline_started_at IS
  'Timestamp when the most recent pipeline run started. Used to restore the elapsed timer on page refresh.';

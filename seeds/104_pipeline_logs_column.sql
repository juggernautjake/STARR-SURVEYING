-- Migration 104: Add persisted pipeline run logs to research_projects
-- research_logs stores the complete LayerAttempt[] log from the worker pipeline
-- as a JSONB array so logs survive page refreshes and can be retrieved on demand.

ALTER TABLE research_projects
  ADD COLUMN IF NOT EXISTS research_logs JSONB;

COMMENT ON COLUMN research_projects.research_logs IS
  'Full pipeline run log (array of LayerAttempt objects) saved by the worker on completion.';

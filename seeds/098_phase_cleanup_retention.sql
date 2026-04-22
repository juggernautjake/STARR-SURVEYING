-- seeds/098_phase_cleanup_retention.sql
-- Phase 19: Cleanup / Retention Policy — audit log table

CREATE TABLE IF NOT EXISTS project_cleanup_log (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id     TEXT        NOT NULL,
  action         TEXT        NOT NULL CHECK (action IN ('archive', 'delete')),
  bytes_freed    BIGINT      NOT NULL DEFAULT 0,
  archived_path  TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Indexes ──────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_project_cleanup_log_project_id
  ON project_cleanup_log (project_id);

CREATE INDEX IF NOT EXISTS idx_project_cleanup_log_created_at
  ON project_cleanup_log (created_at DESC);

-- ── RLS ───────────────────────────────────────────────────────────────────────

ALTER TABLE project_cleanup_log ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read their own project cleanup records
CREATE POLICY "authenticated_read_cleanup_log"
  ON project_cleanup_log
  FOR SELECT
  TO authenticated
  USING (true);

-- Only service role can insert/update/delete
CREATE POLICY "service_role_write_cleanup_log"
  ON project_cleanup_log
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

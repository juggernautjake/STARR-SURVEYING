-- seeds/096_phase18_versions.sql
-- Phase 18: Data Versioning & Pipeline Diff Engine
--
-- Creates the pipeline_versions table used to track every run of the STARR
-- RECON pipeline for a research project. Each row records high-level stats
-- and a path to the full JSON snapshot so two versions can be diffed later.
--
-- Integrates with:
--   • worker/src/services/pipeline-version-store.ts  (runtime store)
--   • worker/src/services/pipeline-diff-engine.ts    (diff logic)
--   • app/api/admin/research/[projectId]/versions/route.ts  (CRUD API)
--
-- Phase 18 Spec §18.2 — Pipeline Versions Schema
-- v1.0: Initial implementation

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. pipeline_versions table
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pipeline_versions (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id       text        NOT NULL UNIQUE,   -- matches PipelineVersion.versionId
  project_id       uuid        NOT NULL REFERENCES research_projects(id) ON DELETE CASCADE,
  version_number   integer     NOT NULL,
  label            text        NOT NULL,
  trigger          text        NOT NULL
                               CHECK (trigger IN (
                                 'initial_run',
                                 'document_purchased',
                                 'manual_rerun',
                                 'adjacent_update',
                                 'txdot_update'
                               )),
  overall_confidence  numeric(5,2),
  overall_grade       text,
  closure_error_ft    numeric(10,4),
  call_count          integer     NOT NULL DEFAULT 0,
  document_count      integer     NOT NULL DEFAULT 0,
  snapshot_path       text        NOT NULL,
  metadata            jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),

  UNIQUE (project_id, version_number)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Indexes
-- ─────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_pipeline_versions_project_id
  ON pipeline_versions (project_id);

CREATE INDEX IF NOT EXISTS idx_pipeline_versions_version_id
  ON pipeline_versions (version_id);

CREATE INDEX IF NOT EXISTS idx_pipeline_versions_trigger
  ON pipeline_versions (trigger);

CREATE INDEX IF NOT EXISTS idx_pipeline_versions_created_at
  ON pipeline_versions (created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Row Level Security
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE pipeline_versions ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read versions for their own projects
CREATE POLICY pipeline_versions_select_authenticated
  ON pipeline_versions
  FOR SELECT
  TO authenticated
  USING (
    project_id IN (
      SELECT id FROM research_projects
      WHERE created_by = auth.jwt() ->> 'email'
    )
  );

-- Service role has unrestricted access (used by API routes and worker)
CREATE POLICY pipeline_versions_all_service_role
  ON pipeline_versions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Service role grants
-- ─────────────────────────────────────────────────────────────────────────────

GRANT SELECT ON pipeline_versions TO authenticated;
GRANT ALL    ON pipeline_versions TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Helper function: get_version_history(p_project_id uuid)
--    Returns all versions for a project, newest first.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_version_history(p_project_id uuid)
RETURNS SETOF pipeline_versions
LANGUAGE sql STABLE AS $$
  SELECT *
  FROM   pipeline_versions
  WHERE  project_id = p_project_id
  ORDER BY version_number DESC;
$$;

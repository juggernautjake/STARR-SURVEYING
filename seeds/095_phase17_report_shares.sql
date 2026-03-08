-- seeds/095_phase17_report_shares.sql
-- Phase 17: Report Sharing & Client Portal Schema
--
-- Creates the report_shares table used by the ReportShareService to persist
-- per-project share tokens in Supabase. Each token carries a permission tier,
-- optional expiry, view-count limit, and optional password hash so research
-- reports can be safely shared with clients via a public URL.
--
-- Integrates with:
--   • worker/src/services/report-share-service.ts (runtime token store)
--   • app/api/admin/research/[projectId]/share/route.ts (CRUD API)
--   • app/api/share/[token]/route.ts (public read endpoint)
--
-- Phase 17 Spec §17.2 — Report Shares Schema
-- v1.0: Initial implementation

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. report_shares table
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS report_shares (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  token          text        NOT NULL UNIQUE,
  project_id     uuid        NOT NULL REFERENCES research_projects(id) ON DELETE CASCADE,
  permission     text        NOT NULL DEFAULT 'full_report'
                             CHECK (permission IN (
                               'full_report',
                               'summary_only',
                               'boundary_only',
                               'documents_excluded'
                             )),
  created_by     text        NOT NULL,
  expires_at     timestamptz,
  view_count     integer     NOT NULL DEFAULT 0,
  max_views      integer,
  label          text,
  password_hash  text,
  is_revoked     boolean     NOT NULL DEFAULT false,
  last_viewed_at timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Indexes
-- ─────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_report_shares_token
  ON report_shares (token);

CREATE INDEX IF NOT EXISTS idx_report_shares_project_id
  ON report_shares (project_id);

CREATE INDEX IF NOT EXISTS idx_report_shares_created_by
  ON report_shares (created_by);

CREATE INDEX IF NOT EXISTS idx_report_shares_expires_at
  ON report_shares (expires_at)
  WHERE expires_at IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. updated_at trigger
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_report_shares_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_report_shares_updated_at
  BEFORE UPDATE ON report_shares
  FOR EACH ROW EXECUTE FUNCTION update_report_shares_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Row Level Security
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE report_shares ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read and manage share tokens they created
CREATE POLICY report_shares_select_own
  ON report_shares
  FOR SELECT
  TO authenticated
  USING (created_by = auth.jwt() ->> 'email');

CREATE POLICY report_shares_insert_own
  ON report_shares
  FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.jwt() ->> 'email');

CREATE POLICY report_shares_update_own
  ON report_shares
  FOR UPDATE
  TO authenticated
  USING (created_by = auth.jwt() ->> 'email');

CREATE POLICY report_shares_delete_own
  ON report_shares
  FOR DELETE
  TO authenticated
  USING (created_by = auth.jwt() ->> 'email');

-- Service role (used by admin API routes and public share endpoint) has full access
CREATE POLICY report_shares_all_service_role
  ON report_shares
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Service role grants
-- ─────────────────────────────────────────────────────────────────────────────

GRANT SELECT ON report_shares TO authenticated;
GRANT ALL    ON report_shares TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Helper function: get_active_shares(project_id uuid)
--    Returns all non-revoked, non-expired share tokens for a project.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_active_shares(p_project_id uuid)
RETURNS SETOF report_shares
LANGUAGE sql STABLE AS $$
  SELECT *
  FROM   report_shares
  WHERE  project_id  = p_project_id
    AND  is_revoked  = false
    AND  (expires_at IS NULL OR expires_at > now())
  ORDER BY created_at DESC;
$$;

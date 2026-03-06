-- ============================================================================
-- 100_cad_drawings.sql
-- CAD drawing persistence table for STARR CAD editor.
-- Stores full .starr drawing documents in the database, linked to jobs.
--
-- Depends on: jobs table (from existing schema)
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS cad_drawings (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    created_by      TEXT        NOT NULL,
    job_id          UUID        REFERENCES jobs(id) ON DELETE SET NULL,
    name            TEXT        NOT NULL,
    description     TEXT,
    -- Full serialised drawing document (same payload as .starr file)
    document        JSONB       NOT NULL,
    version         TEXT        NOT NULL DEFAULT '1.0',
    application     TEXT        NOT NULL DEFAULT 'starr-cad',
    -- Denormalised metadata for quick listing (avoids scanning JSONB)
    feature_count   INTEGER     NOT NULL DEFAULT 0,
    layer_count     INTEGER     NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Fast lookups by owner and job
CREATE INDEX IF NOT EXISTS cad_drawings_created_by_idx ON cad_drawings (created_by);
CREATE INDEX IF NOT EXISTS cad_drawings_job_id_idx     ON cad_drawings (job_id);
CREATE INDEX IF NOT EXISTS cad_drawings_updated_at_idx ON cad_drawings (updated_at DESC);

-- Automatically refresh updated_at on every row update
CREATE OR REPLACE FUNCTION cad_drawings_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS cad_drawings_updated_at_trigger ON cad_drawings;
CREATE TRIGGER cad_drawings_updated_at_trigger
  BEFORE UPDATE ON cad_drawings
  FOR EACH ROW EXECUTE FUNCTION cad_drawings_set_updated_at();

-- Row-Level Security (mirror the pattern used by other tables in this project)
ALTER TABLE cad_drawings ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read their own drawings
CREATE POLICY IF NOT EXISTS "cad_drawings_select"
  ON cad_drawings FOR SELECT
  USING (created_by = current_setting('request.jwt.claims', true)::json->>'email');

-- Authenticated users can insert their own drawings
CREATE POLICY IF NOT EXISTS "cad_drawings_insert"
  ON cad_drawings FOR INSERT
  WITH CHECK (created_by = current_setting('request.jwt.claims', true)::json->>'email');

-- Authenticated users can update their own drawings
CREATE POLICY IF NOT EXISTS "cad_drawings_update"
  ON cad_drawings FOR UPDATE
  USING (created_by = current_setting('request.jwt.claims', true)::json->>'email');

-- Authenticated users can delete their own drawings
CREATE POLICY IF NOT EXISTS "cad_drawings_delete"
  ON cad_drawings FOR DELETE
  USING (created_by = current_setting('request.jwt.claims', true)::json->>'email');

COMMIT;

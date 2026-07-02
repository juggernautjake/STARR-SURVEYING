-- ============================================================================
-- 386_cad_drawing_branches.sql
-- GitHub-style branching + review for STARR CAD drawings, plus a shared
-- point-file library that every authenticated user can pull from to start a
-- new survey from scratch.
--
-- Two pieces:
--   1. Branch columns on cad_drawings — a "branch" is just another cad_drawings
--      row whose parent_id points at the drawing it was forked from. This lets
--      branches reuse the whole existing open/save/autosave editor pipeline
--      (open a branch === open a drawing by id). The owner of the parent
--      accepts (promote branch.document onto the parent) or rejects.
--   2. cad_point_files — a shared, org-wide library of uploaded coordinate
--      files (CSV/TXT/RW5/…). Readable by everyone so anyone can begin a new
--      drawing from an existing point file.
--
-- Depends on: seeds/100_cad_drawings.sql (cad_drawings)
-- ============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Branch / review columns on cad_drawings
-- ─────────────────────────────────────────────────────────────────────────

-- Parent drawing this row was forked from. NULL => this row IS a main drawing.
ALTER TABLE cad_drawings ADD COLUMN IF NOT EXISTS parent_id UUID
  REFERENCES cad_drawings(id) ON DELETE CASCADE;

-- Review lifecycle for a branch row. NULL for main drawings.
--   'draft'     — forked, author still working, not yet submitted
--   'in_review' — author submitted; awaits the parent owner's decision
--   'accepted'  — owner promoted this branch onto the parent (merged)
--   'rejected'  — owner declined; the parent is unchanged
ALTER TABLE cad_drawings ADD COLUMN IF NOT EXISTS branch_status TEXT;

-- Free-text message the author attaches when submitting for review.
ALTER TABLE cad_drawings ADD COLUMN IF NOT EXISTS branch_note TEXT;

-- When the branch was forked, and the parent's updated_at AT THAT MOMENT, so
-- the review UI can warn when the parent drew further edits after the fork
-- (accepting would overwrite them).
ALTER TABLE cad_drawings ADD COLUMN IF NOT EXISTS forked_at TIMESTAMPTZ;
ALTER TABLE cad_drawings ADD COLUMN IF NOT EXISTS forked_from_updated_at TIMESTAMPTZ;

-- Review audit stamps.
ALTER TABLE cad_drawings ADD COLUMN IF NOT EXISTS review_requested_at TIMESTAMPTZ;
ALTER TABLE cad_drawings ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
ALTER TABLE cad_drawings ADD COLUMN IF NOT EXISTS reviewed_by TEXT;

-- Fast "branches of this drawing" and "my review inbox" lookups.
CREATE INDEX IF NOT EXISTS cad_drawings_parent_id_idx     ON cad_drawings (parent_id);
CREATE INDEX IF NOT EXISTS cad_drawings_branch_status_idx ON cad_drawings (branch_status)
  WHERE branch_status IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Shared point-file library
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS cad_point_files (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    uploaded_by     TEXT        NOT NULL,           -- email of uploader
    name            TEXT        NOT NULL,
    description     TEXT,
    -- Raw uploaded text (CSV/TXT/…). Point files are small; keeping the raw
    -- text in-row lets the existing client-side parser run at "new drawing
    -- from file" time without a storage-bucket round trip.
    content         TEXT        NOT NULL,
    format          TEXT        NOT NULL DEFAULT 'CSV',   -- CSV | TXT | RW5 | JXL | XML
    point_count     INTEGER     NOT NULL DEFAULT 0,       -- denormalised for listing
    byte_size       INTEGER     NOT NULL DEFAULT 0,
    job_id          UUID        REFERENCES jobs(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cad_point_files_uploaded_by_idx ON cad_point_files (uploaded_by);
CREATE INDEX IF NOT EXISTS cad_point_files_created_at_idx  ON cad_point_files (created_at DESC);

ALTER TABLE cad_point_files ENABLE ROW LEVEL SECURITY;

-- Shared library: every authenticated user can read every point file (that is
-- the whole point — start a survey from any uploaded file). Mirrors the
-- cad_drawings shared-workspace policies in seeds/100.
DROP POLICY IF EXISTS cad_point_files_select ON cad_point_files;
CREATE POLICY cad_point_files_select
  ON cad_point_files FOR SELECT
  USING (auth.jwt() ->> 'email' IS NOT NULL);

-- Authenticated users upload files recorded under their own email.
DROP POLICY IF EXISTS cad_point_files_insert ON cad_point_files;
CREATE POLICY cad_point_files_insert
  ON cad_point_files FOR INSERT
  WITH CHECK (uploaded_by = auth.jwt() ->> 'email');

-- Only the uploader may delete their own file from the shared library.
DROP POLICY IF EXISTS cad_point_files_delete ON cad_point_files;
CREATE POLICY cad_point_files_delete
  ON cad_point_files FOR DELETE
  USING (uploaded_by = auth.jwt() ->> 'email');

DROP POLICY IF EXISTS cad_point_files_service_role ON cad_point_files;
CREATE POLICY cad_point_files_service_role
  ON cad_point_files FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, DELETE ON cad_point_files TO authenticated;
GRANT ALL ON cad_point_files TO service_role;

COMMIT;

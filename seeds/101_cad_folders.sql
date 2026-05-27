-- ============================================================================
-- 101_cad_folders.sql
-- Folder tree for organising STARR CAD drawings into folders / subfolders.
-- Folders + drawings are a shared workspace: any authenticated CAD user can
-- see and manage everyone's folders and files.
--
-- Idempotent and additive — safe to run on an existing database without
-- --reset (CREATE … IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).
--
-- Depends on: cad_drawings (100_cad_drawings.sql)
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS cad_folders (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    created_by  TEXT        NOT NULL,
    -- NULL parent = a top-level (root) folder
    parent_id   UUID        REFERENCES cad_folders(id) ON DELETE CASCADE,
    name        TEXT        NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cad_folders_parent_id_idx  ON cad_folders (parent_id);
CREATE INDEX IF NOT EXISTS cad_folders_created_by_idx ON cad_folders (created_by);

-- Place drawings inside a folder. NULL = the root (uncategorised) folder.
-- ON DELETE SET NULL: deleting a folder never deletes its drawings; they fall
-- back to the root so files are never lost.
ALTER TABLE cad_drawings
  ADD COLUMN IF NOT EXISTS folder_id UUID REFERENCES cad_folders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS cad_drawings_folder_id_idx ON cad_drawings (folder_id);

-- Refresh updated_at on folder updates (mirror cad_drawings).
CREATE OR REPLACE FUNCTION cad_folders_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS cad_folders_updated_at_trigger ON cad_folders;
CREATE TRIGGER cad_folders_updated_at_trigger
  BEFORE UPDATE ON cad_folders
  FOR EACH ROW EXECUTE FUNCTION cad_folders_set_updated_at();

-- Row-Level Security — shared workspace (any authenticated user).
ALTER TABLE cad_folders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cad_folders_select ON cad_folders;
CREATE POLICY cad_folders_select
  ON cad_folders FOR SELECT
  USING (auth.jwt() ->> 'email' IS NOT NULL);

DROP POLICY IF EXISTS cad_folders_insert ON cad_folders;
CREATE POLICY cad_folders_insert
  ON cad_folders FOR INSERT
  WITH CHECK (created_by = auth.jwt() ->> 'email');

DROP POLICY IF EXISTS cad_folders_update ON cad_folders;
CREATE POLICY cad_folders_update
  ON cad_folders FOR UPDATE
  USING (auth.jwt() ->> 'email' IS NOT NULL);

DROP POLICY IF EXISTS cad_folders_delete ON cad_folders;
CREATE POLICY cad_folders_delete
  ON cad_folders FOR DELETE
  USING (auth.jwt() ->> 'email' IS NOT NULL);

DROP POLICY IF EXISTS cad_folders_service_role ON cad_folders;
CREATE POLICY cad_folders_service_role
  ON cad_folders FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON cad_folders TO authenticated;
GRANT ALL ON cad_folders TO service_role;

COMMIT;

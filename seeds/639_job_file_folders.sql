-- seeds/639_job_file_folders.sql — folders people name themselves, inside a job's files
--
-- Owner, 2026-09-15: "the user will be required to choose which folder in a job the file(s) will
-- upload to … They should be able to choose from a dropdown list of available folders in the job,
-- and they should even be able to create and name a new folder to drop the file(s) into."
--
-- ── WHY A TABLE, NOT A PATH STRING ON THE FILE ──────────────────────────────────────────────────
--
-- A job's standard folders (Research / CAD / Photos / Videos / Documents) are not rows — they are
-- the vocabulary in lib/files/job-folders.ts, and a file lands in one through `job_files.section`.
-- A NAMED folder has to exist before anything is in it: somebody creates "Boundary letters" in the
-- upload pop-up and then chooses it for three files. A path string on each file would make that
-- folder vanish the moment it was empty, and renaming it would be an UPDATE over every file.
--
--   job_file_folders   one row per named folder; `parent_key` says which standard folder it sits
--                      in (NULL = the job's top level), `parent_id` nests it inside another named
--                      folder (whose `parent_key` it copies, so every row knows its standard root)
--   job_files.folder_id   the named folder a file is in; NULL = directly in its standard folder
--
-- `ON DELETE SET NULL` on the file link: a folder that disappears drops its files back into their
-- standard folder rather than taking them with it. The app soft-deletes (`deleted_at`) and re-homes
-- the files to the parent first; the FK is the backstop.

BEGIN;

CREATE TABLE IF NOT EXISTS public.job_file_folders (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  job_id      uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  -- The standard folder this sits in. NULL = the job's top level, beside Research / CAD / ….
  parent_key  text CHECK (parent_key IS NULL OR parent_key IN ('research', 'cad', 'photos', 'videos', 'documents')),
  parent_id   uuid REFERENCES public.job_file_folders(id) ON DELETE CASCADE,
  name        text NOT NULL CHECK (btrim(name) <> '' AND char_length(name) <= 80),
  created_by  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz,
  CHECK (parent_id IS NULL OR parent_id <> id)
);

COMMENT ON TABLE public.job_file_folders IS
  'Folders people create and name inside a job''s files (upload pop-up, 2026-09-15). parent_key = the standard folder it sits in (NULL = job top level); parent_id = a named folder it is nested in.';

-- The one listing query: every live folder of a job.
CREATE INDEX IF NOT EXISTS idx_job_file_folders_job ON public.job_file_folders (job_id) WHERE deleted_at IS NULL;

-- Two live folders with the same name in the same place are one folder somebody made twice.
CREATE UNIQUE INDEX IF NOT EXISTS uq_job_file_folders_sibling_name
  ON public.job_file_folders (job_id, COALESCE(parent_key, ''), COALESCE(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(btrim(name)))
  WHERE deleted_at IS NULL;

-- Server-only, like file_comments: every read and write goes through the API with the service role.
ALTER TABLE public.job_file_folders ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.job_files ADD COLUMN IF NOT EXISTS folder_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'job_files_folder_id_fkey') THEN
    ALTER TABLE public.job_files
      ADD CONSTRAINT job_files_folder_id_fkey FOREIGN KEY (folder_id)
      REFERENCES public.job_file_folders(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_job_files_folder ON public.job_files (folder_id) WHERE folder_id IS NOT NULL;

COMMENT ON COLUMN public.job_files.folder_id IS
  'The named folder (job_file_folders) the file is in. NULL = directly in the standard folder its section says.';

COMMIT;

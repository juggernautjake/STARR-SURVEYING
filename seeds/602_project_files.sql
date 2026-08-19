-- seeds/602_project_files.sql — a file can belong to the project, not only to one job
--
-- Owner, 2026-08-19: *"I also need to be able to upload images and files and stuff to the
-- project/job. I need to be able to upload files and stuff so that they can be accessed."*
--
-- ── WHY A JOB IS NOT ALWAYS THE RIGHT OWNER ─────────────────────────────────────────────────────
--
-- `job_files.job_id` was NOT NULL, so every attachment had to be filed against exactly one job. But
-- an engagement has documents that are not any one job's: the signed contract, the title
-- commitment, the client's deed, the aerial the whole tract was quoted from. Filing the contract
-- under "Boundary Survey" because it was the first job created is how a document becomes findable
-- only by the person who filed it.
--
-- So `job_id` becomes nullable and `project_id` is added, with a CHECK that a row still belongs to
-- SOMETHING. A file is now owned by a job, or by a project, never by neither.
--
-- ── THE BACKFILL IS NOT JUST FOR THE NEW ROWS ───────────────────────────────────────────────────
--
-- Every existing job file also gets its job's `project_id`. That is denormalised on purpose: the
-- project's folder in the File Explorer can then answer "everything for this engagement" with ONE
-- indexed query instead of first fetching the project's jobs and then querying files by that list.
-- The trigger below keeps it true for rows inserted later without every caller having to remember.

BEGIN;

ALTER TABLE public.job_files ADD COLUMN IF NOT EXISTS project_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'job_files_project_id_fkey') THEN
    ALTER TABLE public.job_files
      ADD CONSTRAINT job_files_project_id_fkey FOREIGN KEY (project_id)
      REFERENCES public.projects(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Backfill from the owning job before relaxing anything, so no row is ever ownerless mid-migration.
UPDATE public.job_files f
SET project_id = j.project_id
FROM public.jobs j
WHERE f.job_id = j.id AND f.project_id IS NULL;

ALTER TABLE public.job_files ALTER COLUMN job_id DROP NOT NULL;

-- A file belongs to a job, or to a project, or to both (a job file also carries its project). What
-- it may never be is unattached — that is a row nothing lists and nobody can find.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'job_files_has_an_owner') THEN
    ALTER TABLE public.job_files
      ADD CONSTRAINT job_files_has_an_owner
      CHECK (job_id IS NOT NULL OR project_id IS NOT NULL);
  END IF;
END $$;

-- Keep `project_id` true for job files inserted later, so no caller has to remember to set both.
-- Written as a trigger rather than left to the API because `job_files` has three writers already
-- (the job page, the mobile app, the F5 attach path) and a rule enforced in one of them is a rule
-- the other two break.
CREATE OR REPLACE FUNCTION public.job_files_fill_project_id()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.project_id IS NULL AND NEW.job_id IS NOT NULL THEN
    SELECT j.project_id INTO NEW.project_id FROM public.jobs j WHERE j.id = NEW.job_id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS job_files_fill_project_id_trg ON public.job_files;
CREATE TRIGGER job_files_fill_project_id_trg
  BEFORE INSERT OR UPDATE OF job_id ON public.job_files
  FOR EACH ROW EXECUTE FUNCTION public.job_files_fill_project_id();

CREATE INDEX IF NOT EXISTS job_files_project_idx ON public.job_files (project_id, is_deleted);

COMMENT ON COLUMN public.job_files.project_id IS
  'The engagement this file belongs to. Set automatically from the job for job files (trigger); set directly for project-level documents that are not any one job''s — the contract, the title commitment. Either job_id or project_id must be present.';

COMMIT;

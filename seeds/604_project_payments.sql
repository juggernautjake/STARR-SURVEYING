-- seeds/604_project_payments.sql — a payment can be against the engagement, not only one job
--
-- Owner, 2026-08-19: *"Please make sure we have a straight forward way to record payments, even
-- partial payments on jobs and projects."*
--
-- ── WHY A JOB IS NOT ALWAYS THE RIGHT OWNER ─────────────────────────────────────────────────────
--
-- Same shape as the file problem solved in seed 602, and for the same reason. A client writing one
-- cheque for the whole Smith Tract engagement is not paying "the boundary survey" — they are paying
-- the project. Forcing that cheque onto whichever job happened to be created first makes that job
-- look overpaid and its siblings look unpaid, and every report built on those rows is then wrong in
-- two directions at once.
--
-- So `job_id` becomes nullable and `project_id` is added, with a CHECK that a payment still belongs
-- to something. As with files, job payments are ALSO stamped with their job's project (backfill +
-- trigger), so "how much has this engagement paid us?" is one indexed query rather than a fetch of
-- the project's jobs followed by a second query keyed on that list.

BEGIN;

ALTER TABLE public.job_payments ADD COLUMN IF NOT EXISTS project_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'job_payments_project_id_fkey') THEN
    ALTER TABLE public.job_payments
      ADD CONSTRAINT job_payments_project_id_fkey FOREIGN KEY (project_id)
      REFERENCES public.projects(id) ON DELETE CASCADE;
  END IF;
END $$;

UPDATE public.job_payments p
SET project_id = j.project_id
FROM public.jobs j
WHERE p.job_id = j.id AND p.project_id IS NULL;

ALTER TABLE public.job_payments ALTER COLUMN job_id DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'job_payments_has_an_owner') THEN
    ALTER TABLE public.job_payments
      ADD CONSTRAINT job_payments_has_an_owner
      CHECK (job_id IS NOT NULL OR project_id IS NOT NULL);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.job_payments_fill_project_id()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.project_id IS NULL AND NEW.job_id IS NOT NULL THEN
    SELECT j.project_id INTO NEW.project_id FROM public.jobs j WHERE j.id = NEW.job_id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS job_payments_fill_project_id_trg ON public.job_payments;
CREATE TRIGGER job_payments_fill_project_id_trg
  BEFORE INSERT OR UPDATE OF job_id ON public.job_payments
  FOR EACH ROW EXECUTE FUNCTION public.job_payments_fill_project_id();

CREATE INDEX IF NOT EXISTS job_payments_project_idx ON public.job_payments (project_id, paid_at DESC);

COMMENT ON COLUMN public.job_payments.project_id IS
  'The engagement this payment is against. Set automatically from the job for job payments (trigger); set directly for a payment covering the whole project — a retainer, or one cheque for several jobs. Either job_id or project_id must be present.';

COMMIT;

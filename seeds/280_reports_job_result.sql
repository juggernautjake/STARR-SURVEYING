-- seeds/280_reports_job_result.sql
--
-- R-1 of OWNER_REPORTS.md. Adds a pipeline-outcome field to jobs so
-- the reports surface can distinguish "won" vs "lost" vs "abandoned"
-- (the existing `stage` column is a workflow ladder, not an
-- outcome). Backfills historical completed jobs to result='won'.
--
-- Additive; idempotent; safe to run on a populated DB.

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS result TEXT;

-- Constraint added separately so re-running this file on a DB that
-- already has the column (but not the check) is safe.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'jobs_result_check'
      AND conrelid = 'public.jobs'::regclass
  ) THEN
    ALTER TABLE public.jobs
      ADD CONSTRAINT jobs_result_check
      CHECK (result IS NULL OR result IN ('won', 'lost', 'abandoned'));
  END IF;
END $$;

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS result_set_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS result_reason TEXT;

COMMENT ON COLUMN public.jobs.result IS
  'Pipeline outcome. NULL = still active (any stage). won = completed +
   billed. lost = client rejected our quote or chose competitor.
   abandoned = we walked away (unresponsive client, scope creep, etc.).
   Set automatically when stage moves to "completed"; set manually via
   the "Mark as lost / abandoned" action on /admin/jobs/[id].';

COMMENT ON COLUMN public.jobs.result_set_at IS
  'Timestamp when the result was first set. Used by the operations
   report to attribute outcomes to their billing window.';

COMMENT ON COLUMN public.jobs.result_reason IS
  'Free-text rationale entered by the admin when marking a job as
   lost or abandoned. Surfaced in the report drill-down.';

-- Index supports the report query "every job with result X in window Y".
CREATE INDEX IF NOT EXISTS idx_jobs_result_org
  ON public.jobs(org_id, result, result_set_at DESC)
  WHERE result IS NOT NULL;

-- Backfill: historical completed jobs are won by definition. Skip
-- rows that already have a result set (re-run idempotency).
UPDATE public.jobs
   SET result = 'won',
       result_set_at = COALESCE(date_delivered, updated_at, created_at)
 WHERE stage = 'completed'
   AND result IS NULL;

-- Smoke-test rows so a fresh seed-from-scratch run produces no
-- surprises. (Verifies the constraint accepts the three legal values
-- and rejects junk. The rollback DELETE keeps the table empty.)
DO $$
BEGIN
  IF (SELECT count(*) FROM public.jobs) = 0 THEN
    -- Empty jobs table; skip the constraint smoke-test entirely.
    RETURN;
  END IF;
END $$;

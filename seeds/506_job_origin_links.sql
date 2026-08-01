-- ============================================================================
-- 506_job_origin_links.sql
--
-- A6 of docs/planning/in-progress/LEAD_TO_CASH_ATTRIBUTION_AND_GOOGLE_ADS_2026-07-31.md.
--
-- ── THE LINK ONLY POINTED ONE WAY, AND THE WRONG WAY ────────────────────────
--
-- `leads.converted_job_id` records which job a lead became. Asking the opposite
-- question — "where did this job come from?" — is what
-- `app/api/admin/jobs/[id]/origin-lead/route.ts` does, and it does it by
-- scanning `leads` for a matching `converted_job_id`.
--
-- That column has **no index**. Verified against the live database before
-- writing this: `pg_indexes` returns nothing for it. So every render of a job
-- page sequentially scans the leads table. With four leads that is invisible;
-- it is invisible right up until it isn't, and by then it is a page that "feels
-- slow" for reasons nobody connects to a missing index.
--
-- Both fixes are here because they are the same bug seen from two sides:
--   · `jobs.origin_lead_id` — the forward link, so the common question is a
--     primary-key lookup instead of a scan;
--   · an index on `leads.converted_job_id` — so the reverse question is fast
--     TOO, and every existing caller gets the fix without being rewritten.
--
-- Adding only the forward FK would leave the old path slow for anything not yet
-- migrated, which is the sort of half-fix that looks complete in a diff.
--
-- ── WHY NOT COPY THE ATTRIBUTION ONTO THE JOB ───────────────────────────────
--
-- The plan says the conversion should "carry the attribution stamp onto the
-- job", and this deliberately does not copy the thirteen attribution columns.
-- Two reasons:
--
--   1. `origin_lead_id` makes the lead's attribution reachable in one join, so
--      copying would be duplicating a fact that can then drift — and the copy
--      would be the one nobody updates.
--   2. The thing that genuinely must be frozen at the moment it happens is the
--      CONVERSION EVENT, not the job row, and that is already handled:
--      `lead_lifecycle_events` and `google_conversion_events` both copy the
--      click identifiers at emit time, on purpose, because they are ledgers.
--
-- So the job points at its origin, and anything that needs the click reads it
-- through that link or off the event that recorded it.
-- ============================================================================

BEGIN;

-- The forward link. ON DELETE SET NULL: deleting a lead must never delete the
-- job it became — the job is the business record and the lead is its origin story.
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS origin_lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL;

-- Which quote the customer actually accepted. Without this, a job built from a
-- revised quote has no way to say WHICH version it was priced from, and the
-- lead's mirror column is the only clue — a number, with no version behind it.
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS accepted_quote_id UUID REFERENCES public.lead_quotes(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.jobs.origin_lead_id IS
  'Forward link to the lead this job came from. Makes "where did this job come from" a key lookup instead of the unindexed reverse scan over leads.converted_job_id that origin-lead/route.ts was doing.';
COMMENT ON COLUMN public.jobs.accepted_quote_id IS
  'The lead_quotes version the customer accepted. Without it, a job priced from a revision cannot say which one — only the mirrored number survives.';

CREATE INDEX IF NOT EXISTS idx_jobs_origin_lead ON public.jobs(origin_lead_id) WHERE origin_lead_id IS NOT NULL;

-- THE MISSING INDEX. Every existing caller of the reverse lookup gets this for
-- free, with no code change — which is what makes it worth adding even though
-- the forward FK above is the better path.
CREATE INDEX IF NOT EXISTS idx_leads_converted_job ON public.leads(converted_job_id) WHERE converted_job_id IS NOT NULL;

-- Backfill the forward link from the reverse one that already exists, so jobs
-- converted before today are not left as the only ones needing a scan.
UPDATE public.jobs j
   SET origin_lead_id = l.id
  FROM public.leads l
 WHERE l.converted_job_id = j.id
   AND j.origin_lead_id IS NULL;

COMMIT;

-- Verification:
--   SELECT indexname FROM pg_indexes
--     WHERE tablename IN ('jobs','leads')
--       AND indexname IN ('idx_jobs_origin_lead','idx_leads_converted_job');   -- 2 rows
--   -- forward and reverse must agree wherever both are set:
--   SELECT count(*) FROM public.jobs j JOIN public.leads l ON l.converted_job_id = j.id
--    WHERE j.origin_lead_id IS DISTINCT FROM l.id;   -- expect 0

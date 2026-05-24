-- ============================================================================
-- cleanup_ghost_jobs.sql
--
-- Finds (and, once you confirm, removes) "ghost" job rows created during
-- the window when job creation returned a 500 but had actually inserted
-- the row first. Because the failure happened AFTER the main insert
-- (on the advisory activity_log .catch), the job + its stage-history
-- row exist even though the UI showed an error — so you may have
-- retried and produced duplicates.
--
-- SAFE BY DEFAULT: the queries below only SELECT. The DELETE/ARCHIVE
-- statements are commented out — review the list first, then act on
-- explicit IDs.
--
-- Replace the email if a different account was creating jobs.
-- ============================================================================

-- ── 1. Recent jobs for Starr, newest first ─────────────────────────────────
-- Eyeball this for rows you didn't mean to keep (failed-attempt retries).
SELECT
  j.id,
  j.job_number,
  j.name,
  j.stage,
  j.created_by,
  j.created_at,
  j.is_archived,
  -- did the create flow get far enough to log stage history?
  EXISTS (SELECT 1 FROM public.job_stages_history h WHERE h.job_id = j.id) AS has_stage_history,
  -- advisory activity-log row only exists if the OLD buggy .catch
  -- line was reached without throwing (it always threw) — so ghosts
  -- from the bug typically have has_activity = false.
  -- NB: activity_log.entity_id is text; jobs.id is uuid → cast.
  EXISTS (SELECT 1 FROM public.activity_log a WHERE a.entity_type = 'job' AND a.entity_id = j.id::text) AS has_activity
FROM public.jobs j
WHERE j.org_id = '00000000-0000-0000-0000-000000000001'
  AND j.created_at >= now() - interval '3 days'
ORDER BY j.created_at DESC;

-- ── 2. Likely duplicates: same name created more than once ─────────────────
-- A name appearing multiple times in the recent window is the strongest
-- signal of failed-attempt retries.
SELECT
  j.name,
  count(*)                         AS copies,
  min(j.created_at)                AS first_created,
  max(j.created_at)                AS last_created,
  array_agg(j.id ORDER BY j.created_at) AS job_ids,
  array_agg(j.job_number ORDER BY j.created_at) AS job_numbers
FROM public.jobs j
WHERE j.org_id = '00000000-0000-0000-0000-000000000001'
  AND j.created_at >= now() - interval '3 days'
  AND j.is_archived = false
GROUP BY j.name
HAVING count(*) > 1
ORDER BY copies DESC, last_created DESC;

-- ============================================================================
-- 3. ACT — pick ONE approach, paste the specific IDs from step 1/2, then
--    uncomment and run. Nothing below executes as-is.
-- ============================================================================

-- 3a. SOFT-ARCHIVE (recommended — matches the app's own delete behaviour;
--     fully reversible by flipping is_archived back to false):
--
-- UPDATE public.jobs
--    SET is_archived = true
--  WHERE id IN (
--    '00000000-0000-0000-0000-000000000000'   -- <- replace with the ghost ids
--  );

-- 3b. HARD-DELETE (irreversible). Removes child rows first to satisfy FKs,
--     then the job. Only use for rows you are certain are junk.
--
-- WITH doomed AS (
--   SELECT unnest(ARRAY[
--     '00000000-0000-0000-0000-000000000000'   -- <- replace with the ghost ids
--   ]::uuid[]) AS id
-- )
-- DELETE FROM public.job_stages_history WHERE job_id IN (SELECT id FROM doomed);
-- WITH doomed AS (SELECT unnest(ARRAY['...']::uuid[]) AS id)
-- DELETE FROM public.job_tags          WHERE job_id IN (SELECT id FROM doomed);
-- WITH doomed AS (SELECT unnest(ARRAY['...']::uuid[]) AS id)
-- DELETE FROM public.job_team          WHERE job_id IN (SELECT id FROM doomed);
-- WITH doomed AS (SELECT unnest(ARRAY['...']::uuid[]) AS id)
-- DELETE FROM public.activity_log      WHERE entity_type = 'job' AND entity_id IN (SELECT id::text FROM doomed);
-- WITH doomed AS (SELECT unnest(ARRAY['...']::uuid[]) AS id)
-- DELETE FROM public.jobs              WHERE id IN (SELECT id FROM doomed);

-- ── 4. Verify after acting ──────────────────────────────────────────────────
-- Re-run step 2; it should return no rows (no remaining duplicates).

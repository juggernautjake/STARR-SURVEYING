-- seeds/646_job_map_media_many_points.sql — one photograph, as many points as it belongs on
--
-- Owner, 2026-09-18: "We also need to be able to assign files and pictures and videos to multiple
-- different points if we want to."
--
-- ── THIS DELIBERATELY REVERSES seeds/643 ────────────────────────────────────────────────────────
--
-- Two days ago the owner asked for the opposite, and 643 made it a database rule:
--
--   "once a file has been assigned to a point, it cannot be assigned to another point. It will still
--    be in the … panel, but it will be a bit transparent and marked as already assigned."
--
-- 643's argument was that the file panel is a to-do list — "what have I not placed yet?" — and that
-- the greyed-out state is a lie the moment one photograph can hang on three pins. That argument was
-- sound and it is worth saying plainly why it no longer decides this.
--
-- It was reasoning about the PANEL, and the panel's answer survives: a file is faded once it is on
-- at least one point, which is still exactly "have I placed this yet?". What 643 actually forbade is
-- the real situation the owner has now hit — one photograph down a fence line genuinely showing the
-- corner post AND the gate AND the encroachment, three points that each want it. Under 643 the only
-- way to record that was to upload the same file three times, which makes the panel a worse to-do
-- list, not a better one.
--
-- So the constraint goes back to what it was before 643: the same file cannot hang on the same point
-- twice — which is what stops a double-click — and nothing stops it hanging on a second point.
--
-- ── WHAT DOES NOT CHANGE ────────────────────────────────────────────────────────────────────────
--
-- Unassigning stays a soft delete, so "this photo was on point 4" survives for the audit trail.
-- Nothing is migrated: every existing assignment is already legal under the looser rule. This is
-- purely a widening, so it cannot fail on existing data and it does not need a backfill.

BEGIN;

-- The rule 643 added. Dropped, not left in place "just in case": a unique index that contradicts the
-- feature would refuse the second drag with a database error the UI cannot explain.
DROP INDEX IF EXISTS public.uq_job_map_point_media_one_point;

-- Back to the original, from seeds/641: the same file, twice, on ONE point is a double-click rather
-- than an intention — and that is still true and still worth refusing. `CREATE IF NOT EXISTS`
-- because 643 dropped this one only on databases that had already run 641.
CREATE UNIQUE INDEX IF NOT EXISTS uq_job_map_point_media_file
  ON public.job_map_point_media (point_id, job_file_id) WHERE deleted_at IS NULL;

COMMENT ON INDEX public.uq_job_map_point_media_file IS
  'The same file cannot hang on the same point twice — a double-click, not an intention. It CAN hang on as many different points as it belongs on (owner, 2026-09-18); seeds/646 removed the one-point-only rule seeds/643 had added.';

COMMIT;

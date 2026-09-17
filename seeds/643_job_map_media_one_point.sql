-- seeds/643_job_map_media_one_point.sql — a file belongs to one point, and the database says so
--
-- Owner, 2026-09-16: "I think I want it so that once a file has been assigned to a point, it cannot
-- be assigned to another point. It will still be in the file/image/video/audio file panel, but it
-- will be a bit transparent and marked as already assigned. There will be an option to unassign it
-- which will require confirmation."
--
-- Spec: docs/planning/in-progress/interactive-property-map-2026-09-16.md
--
-- ── WHY THIS IS A CONSTRAINT AND NOT A CHECK IN THE ROUTE ───────────────────────────────────────
--
-- The rule is not a preference about tidiness; it is what makes the file panel legible. The panel's
-- whole job is to answer "what have I not placed yet?" at a glance, and it can only do that if
-- "assigned" is a property of the FILE rather than a list of points to cross-reference. The moment
-- one photograph can hang on three pins, the greyed-out state is a lie and the panel stops being a
-- to-do list.
--
-- Which is also why it is enforced here rather than in the API route that normally guards it. Two
-- fast drags onto two different pins are two requests in flight at once; a check-then-insert in the
-- route passes both and leaves exactly the state the owner asked us to make impossible. A partial
-- unique index cannot be raced.
--
-- WHAT IT REPLACES: uq_job_map_point_media_file was UNIQUE (point_id, job_file_id) — "the same file
-- cannot hang on the same point twice", which stopped a double-click and nothing else. The new one
-- drops point_id from the key, so the same file cannot hang on ANY second point. The old index is
-- redundant under the new one (a file that can appear at most once overall certainly cannot appear
-- twice on one point) and is dropped rather than left to mislead whoever reads the schema next.
--
-- UNASSIGNING stays a soft delete, so the row that recorded "this photo was on point 4" survives
-- for the audit trail — and because `WHERE deleted_at IS NULL` means a detached file is instantly
-- free to be assigned somewhere else, which is exactly the behaviour the confirmation dialog
-- promises.

BEGIN;

-- Any file that is somehow already on two points has to lose the later assignments before a unique
-- index can exist. Newest wins: if somebody assigned the same photo twice, the one they did last is
-- the one they meant.
WITH ranked AS (
  SELECT id,
         row_number() OVER (PARTITION BY job_file_id ORDER BY created_at DESC, id DESC) AS rn
  FROM public.job_map_point_media
  WHERE deleted_at IS NULL
)
UPDATE public.job_map_point_media m
SET deleted_at = now()
FROM ranked
WHERE m.id = ranked.id AND ranked.rn > 1;

DROP INDEX IF EXISTS public.uq_job_map_point_media_file;

-- One live assignment per file, across every point of every map on the job.
CREATE UNIQUE INDEX IF NOT EXISTS uq_job_map_point_media_one_point
  ON public.job_map_point_media (job_file_id) WHERE deleted_at IS NULL;

COMMENT ON INDEX public.uq_job_map_point_media_one_point IS
  'A job file may be attached to at most ONE point of interest at a time (owner, 2026-09-16). Unassigning soft-deletes the row, which frees the file immediately. Enforced here, not in the route, because two fast drags are two concurrent requests and a check-then-insert cannot see the other one.';

COMMIT;

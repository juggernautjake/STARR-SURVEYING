-- ============================================================================
-- 593_jobs_geofence_columns.sql
--
-- C0d of docs/planning/completed/CAD_EXCELLENCE_AND_PLATFORM_COMPLETION_2026-08-15.md
--
-- The migration that was never written.
--
-- ── WHAT WAS BROKEN ─────────────────────────────────────────────────────────
--
-- `jobs.centroid_lat`, `jobs.centroid_lon` and `jobs.geofence_radius_m` are
-- read by four separate code paths, and NO seed in this repository ever
-- created them. Seed 227's own header describes them as "populated either via
-- the new /api/admin/jobs/[id]/geofence endpoint OR auto-captured via the
-- 'Set as job site' button on /admin/timeline" — the columns were assumed into
-- existence and the ALTER TABLE was never written.
--
-- Confirmed against the live database on 2026-08-15: `jobs` has `latitude` and
-- `longitude`, and none of the three columns below. Everything that touched
-- them failed:
--
--   GET  /api/admin/jobs/[id]/field-data  -> 500 "column jobs.centroid_lat
--                                            does not exist". This is the ONLY
--                                            source of mobile-captured job
--                                            media, and the Work Mode gallery
--                                            that read it swallowed the error
--                                            (`r.ok ? … : { job_media: [] }`)
--                                            and displayed "No media captured
--                                            for this job yet." So the failure
--                                            looked like an empty job.
--   PUT  /api/admin/jobs/[id]/geofence    -> could never persist a geofence.
--   /admin/timeline "Set as job site"     -> same.
--   derive_location_timeline() (seed 227) -> its geofence branch reads
--                                            j.centroid_lat, so stop
--                                            classification could not work.
--
-- ── WHY NOT REUSE jobs.latitude / jobs.longitude ────────────────────────────
--
-- They are not the same thing. `latitude`/`longitude` is the job's address
-- location — geocoded from where the property is. The centroid is a geofence
-- ANCHOR the crew sets from where they actually stood, with a radius, and it is
-- what stop-classification matches against. Collapsing the two would move a
-- job's mapped address every time somebody adjusted a geofence.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS. Adds no data and changes no existing
-- column, so a re-run is a no-op.
-- ============================================================================

BEGIN;

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS centroid_lat      DOUBLE PRECISION
    CHECK (centroid_lat IS NULL OR (centroid_lat >= -90  AND centroid_lat <= 90)),
  ADD COLUMN IF NOT EXISTS centroid_lon      DOUBLE PRECISION
    CHECK (centroid_lon IS NULL OR (centroid_lon >= -180 AND centroid_lon <= 180)),
  -- Bounds mirror MIN_RADIUS_M / MAX_RADIUS_M in the geofence route, so the API
  -- and the table agree on what a usable radius is rather than the check living
  -- in only one of them.
  ADD COLUMN IF NOT EXISTS geofence_radius_m INTEGER
    CHECK (geofence_radius_m IS NULL OR (geofence_radius_m >= 25 AND geofence_radius_m <= 5000));

COMMENT ON COLUMN public.jobs.centroid_lat IS
  'Geofence anchor latitude — where the crew actually stood, set via /api/admin/jobs/[id]/geofence or the "Set as job site" button. NOT the same as jobs.latitude, which is the geocoded address.';
COMMENT ON COLUMN public.jobs.centroid_lon IS
  'Geofence anchor longitude. See centroid_lat.';
COMMENT ON COLUMN public.jobs.geofence_radius_m IS
  'Radius in metres around the centroid within which a derived location stop is classified as this job. 25..5000, matching the geofence API bounds.';

-- The geofence classifier in seed 227 scans every job with a centroid set on
-- each derive call; a partial index keeps that scan proportional to the number
-- of jobs that actually have one rather than the whole table.
CREATE INDEX IF NOT EXISTS idx_jobs_geofence_centroid
  ON public.jobs (centroid_lat, centroid_lon)
  WHERE centroid_lat IS NOT NULL AND centroid_lon IS NOT NULL;

COMMIT;

-- Verification:
--   SELECT column_name, data_type FROM information_schema.columns
--    WHERE table_name = 'jobs'
--      AND column_name IN ('centroid_lat','centroid_lon','geofence_radius_m');  -- 3 rows
--   -- and the route that was 500ing:
--   --   GET /api/admin/jobs/<id>/field-data  -> 200 with a job_media array

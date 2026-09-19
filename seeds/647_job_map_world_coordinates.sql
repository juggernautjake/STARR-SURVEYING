-- seeds/647_job_map_world_coordinates.sql — the map becomes the earth, not a picture of it
--
-- Owner, 2026-09-18: "Would it be possible to use google earth or something? … we just have google
-- earth in a viewer, just like we do for the current map set up, but we can zoom around and scroll
-- in … say we put in an address and the map zooms us to that location. if we have stored points at
-- that property with files and stuff assigned to them, then we will be able to see them show up."
--
-- And then: "For the one interactive map that we had already built out that doesn't use geocoder or
-- the map, you can get rid of it and build the new system. I will re-apply all of the points and
-- stuff to the map."
--
-- ── WHAT CHANGES, AND WHAT DELIBERATELY DOES NOT ────────────────────────────────────────────────
--
-- A point used to be stored as a fraction of an uploaded image — `x: 0.42, y: 0.67` — which means
-- nothing without that exact image behind it. Two points on two different jobs' aerials could not be
-- compared, drawn on one map, or found by address. That is the whole reason this feature could not
-- do what was asked of it.
--
-- So `lat`/`lng` become the position of record. They have existed on this table since seeds/641,
-- nullable, described as "filled once the map is georeferenced" — and nothing ever filled them.
--
-- Everything ELSE about a point survives untouched: its title, notes, type, status, ordinal, the
-- layer it sits on (seeds/645), and every file attached to it (seeds/641, 646). This is a change of
-- coordinate system, not a rewrite — which is why the layers and multi-point attachment work from
-- earlier today carries straight over.
--
-- ── THE OLD POINTS ARE KEPT, NOT DELETED ────────────────────────────────────────────────────────
--
-- The owner said they would re-apply their points. This migration still does not delete them: they
-- keep their x/y, they simply have no lat/lng and so do not appear on a world map. Destroying survey
-- work to change a display format is not a trade worth making, and if an aerial is ever georeferenced
-- the affine in lib/jobs/property-map.ts can still turn those fractions into coordinates.
--
-- That is why x and y become NULLABLE rather than being dropped: a new point has no image fractions
-- to record, and an old point's are worth keeping.

BEGIN;

-- ── A POINT LIVES ON THE EARTH ──────────────────────────────────────────────────────────────────

-- The image fractions stop being required. A point placed on satellite imagery has no image to be a
-- fraction of; the CHECKs went with the NOT NULLs because a null cannot satisfy a range check.
ALTER TABLE public.job_map_points ALTER COLUMN x DROP NOT NULL;
ALTER TABLE public.job_map_points ALTER COLUMN y DROP NOT NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'job_map_points_x_check') THEN
    ALTER TABLE public.job_map_points DROP CONSTRAINT job_map_points_x_check;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'job_map_points_y_check') THEN
    ALTER TABLE public.job_map_points DROP CONSTRAINT job_map_points_y_check;
  END IF;
END $$;

-- Re-added as conditional checks: still 0..1 WHEN PRESENT, because a stray 47.3 in there would be a
-- bug worth catching, but absent is now the normal case.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'job_map_points_xy_fraction_check') THEN
    ALTER TABLE public.job_map_points ADD CONSTRAINT job_map_points_xy_fraction_check
      CHECK ((x IS NULL OR (x >= 0 AND x <= 1)) AND (y IS NULL OR (y >= 0 AND y <= 1)));
  END IF;
END $$;

-- lat/lng already exist and are already nullable. What they lacked was a rule saying they are real
-- coordinates: 0,0 is the Gulf of Guinea and is what a failed parse looks like, not a Texas survey.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'job_map_points_latlng_check') THEN
    ALTER TABLE public.job_map_points ADD CONSTRAINT job_map_points_latlng_check
      CHECK (
        (lat IS NULL AND lng IS NULL)
        OR (lat BETWEEN -90 AND 90 AND lng BETWEEN -180 AND 180 AND NOT (lat = 0 AND lng = 0))
      );
  END IF;
END $$;

COMMENT ON COLUMN public.job_map_points.lat IS
  'Where this point actually is. The position of record since seeds/647 — x/y are the legacy image fractions of a point placed on an uploaded aerial before the map moved to the world.';

-- ── THE ONE QUERY THE GLOBAL MAP MAKES ──────────────────────────────────────────────────────────
--
-- "Every live point inside these bounds." A plain btree on (lat, lng) serves a bounding box well
-- enough here: this is thousands of rows, not millions, and PostGIS is not installed. The partial
-- clause is what keeps the index to the rows that can actually be drawn.
CREATE INDEX IF NOT EXISTS idx_job_map_points_latlng
  ON public.job_map_points (lat, lng)
  WHERE deleted_at IS NULL AND lat IS NOT NULL AND lng IS NOT NULL;

-- ── THE MAP RECORD KEEPS ITS JOB, AND LOSES ITS PICTURE ─────────────────────────────────────────
--
-- `job_property_maps` stays: it is what a job's points and layers hang off, and throwing it away
-- would take the layers (seeds/645) and every attachment with it. What changes is that `file_id` —
-- the uploaded aerial — is no longer what the map IS. It was already nullable; now it is simply
-- unused by the new surface, and the comment says so rather than leaving the next reader to guess.
COMMENT ON COLUMN public.job_property_maps.file_id IS
  'The uploaded aerial this map used to be drawn on. Unused since seeds/647, when the map moved to Google satellite imagery. Kept so an existing map can still be georeferenced against its original picture.';

-- Where the map opens when somebody arrives from the job. Filled from the job''s own geocoded
-- address, or from wherever the person last left the view.
ALTER TABLE public.job_property_maps
  ADD COLUMN IF NOT EXISTS center_lat double precision,
  ADD COLUMN IF NOT EXISTS center_lng double precision,
  -- Google's zoom scale: 1 is the planet, ~18 is a rooftop, 21 is as far as satellite imagery goes.
  ADD COLUMN IF NOT EXISTS default_zoom integer;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'job_property_maps_center_check') THEN
    ALTER TABLE public.job_property_maps ADD CONSTRAINT job_property_maps_center_check
      CHECK (
        (center_lat IS NULL AND center_lng IS NULL)
        OR (center_lat BETWEEN -90 AND 90 AND center_lng BETWEEN -180 AND 180)
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'job_property_maps_zoom_check') THEN
    ALTER TABLE public.job_property_maps ADD CONSTRAINT job_property_maps_zoom_check
      CHECK (default_zoom IS NULL OR (default_zoom BETWEEN 1 AND 22));
  END IF;
END $$;

COMMENT ON COLUMN public.job_property_maps.center_lat IS
  'Where this job''s map opens. Seeded from jobs.latitude when the job was geocoded; null means fall back to the job address, then to the office.';

-- "Which jobs have points, and roughly where?" — the global map's job index, and the button on the
-- job page that decides whether to say "Create" or "View".
CREATE INDEX IF NOT EXISTS idx_job_property_maps_center
  ON public.job_property_maps (center_lat, center_lng)
  WHERE deleted_at IS NULL AND center_lat IS NOT NULL;

COMMIT;

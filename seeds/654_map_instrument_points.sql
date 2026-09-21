-- seeds/654_map_instrument_points.sql — collector points reaching the map.
--
-- Owner, 2026-09-20: "if we have a specific job opened up on a tsc5 and are shooting points, then
-- is it possible to stream those points as soon as they are shot so that they then show up in our
-- backend … Then could we have it where the interactive map point layer gets automatically updated
-- with the newly streamed points?"
--
-- Yes. `lib/field-ingest/` has parsed LandXML, GSI, RW5, JobXML and CSV into `instrument_points`
-- since 2026-08, with an idempotent content hash and two clocks — and nothing has ever read those
-- rows onto the map. This seed is the two columns that let it.
--
-- ── THE ZONE HAS TO BE DECLARED, AND IT CANNOT BE GUESSED ───────────────────────────────────────
--
-- `instrument_points` stores `northing`, `easting` and a free-text `unit`, and records no
-- coordinate reference system at all. A collector file does not carry one either: the surveyor
-- configured the zone on the instrument and the file assumes you know.
--
-- Verified 2026-09-21 against job 26146 in Milam County. Its corners, read in Texas Central, come
-- back within 0.004 ft. The same numbers read as Texas North land at 52.3°N 90.3°W — Ontario,
-- Canada, 1,553 miles away — and are still a perfectly ordinary-looking pair of coordinates. No
-- error, no warning, nothing to notice.
--
-- So the zone lives on the MAP, declared once by a person, and the bridge refuses to place points
-- until it is set. A default here would be the most expensive kind of convenience: it would work
-- silently and be wrong for any firm that is not in Central Texas, and wrong for this one on any
-- job that is not.
--
-- `lib/cad/geo/texas-state-plane.ts` has the longer argument, including the time EPSG:2277 was
-- described as two different zones in two different modules of this repository.

BEGIN;

-- ── WHICH ZONE THIS MAP'S GRID COORDINATES ARE IN ───────────────────────────────────────────────
--
-- NULL means "nobody has said", which is the honest state for every existing map and the state the
-- bridge refuses to work in. It is deliberately NOT defaulted to CENTRAL.
--
-- Constrained to the five keys rather than free text, so a typo is a failed write instead of a
-- silent fallback at read time.
ALTER TABLE public.job_property_maps
  ADD COLUMN IF NOT EXISTS stateplane_zone text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'job_property_maps_zone_check') THEN
    ALTER TABLE public.job_property_maps ADD CONSTRAINT job_property_maps_zone_check
      CHECK (stateplane_zone IS NULL OR stateplane_zone IN
        ('NORTH', 'NORTH_CENTRAL', 'CENTRAL', 'SOUTH_CENTRAL', 'SOUTH'));
  END IF;
END $$;

COMMENT ON COLUMN public.job_property_maps.stateplane_zone IS
  'Which NAD83 Texas State Plane zone this job''s grid coordinates are in, for projecting collector and point-file data onto the map. NULL means nobody has declared one, and the importer refuses rather than assuming — a wrong zone places every point hundreds of miles away with no error anywhere.';

-- ── WHICH COLLECTOR SHOT THIS PIN CAME FROM ─────────────────────────────────────────────────────
--
-- The identity that makes a re-sync idempotent. Trimble Connect's Object Sync re-reports a file
-- whenever its version changes, and a poll overlaps the previous one by two minutes on purpose
-- (lib/field-ingest/trimble-connect.ts), so the same point WILL arrive more than once. Without a
-- stable link, an afternoon of syncing produces a map with forty copies of corner 104 stacked on
-- one spot — which does not look like a bug, it looks like one pin.
ALTER TABLE public.job_map_points
  ADD COLUMN IF NOT EXISTS from_instrument_point_id uuid
    REFERENCES public.instrument_points(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.job_map_points.from_instrument_point_id IS
  'The instrument_points row this pin was derived from. NULL means a person placed it. Makes a re-sync update the existing pin instead of stacking another one on top of it.';

-- One pin per collector point per map. Partial, so the 44 hand-placed points (all NULL) are
-- unaffected and a soft-deleted pin does not block a re-import.
CREATE UNIQUE INDEX IF NOT EXISTS uq_job_map_points_from_instrument
  ON public.job_map_points (map_id, from_instrument_point_id)
  WHERE from_instrument_point_id IS NOT NULL AND deleted_at IS NULL;

-- "What has already been brought across for this job?" — the bridge's own lookup.
CREATE INDEX IF NOT EXISTS idx_job_map_points_instrument
  ON public.job_map_points (from_instrument_point_id)
  WHERE from_instrument_point_id IS NOT NULL;

COMMIT;

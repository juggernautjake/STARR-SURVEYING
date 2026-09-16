-- seeds/642_job_map_point_shapes.sql — a point of interest that is not always a point
--
-- Owner, 2026-09-16: "I want to be able to create a point that is just a single point on the map.
-- Then I want to create a point that has a field of view feature, where you can set the point, and
-- then you can show the field of view of that point. This would be for pictures that are taken and
-- the uploader wanted to show where they were and what direction they were facing and what their
-- field of view was when they took the picture. I also want to create a mechanic where the user
-- create the first point, then can click to draw connected lines that represent what path they
-- walked. This would be for if the user takes a video and starts at one point and then walks to
-- another point, taking a video of the property as they go."
--
-- Spec: docs/planning/in-progress/interactive-property-map-2026-09-16.md
--
-- ── ONE TABLE, FOUR SHAPES — NOT FOUR TABLES ────────────────────────────────────────────────────
--
-- The temptation is a table per shape: points, cones, paths, areas. Resist it. What the owner
-- described is not four features; it is one feature — "here is a thing on this property, and here
-- is what I know about it" — drawn four ways. Everything that makes a point of interest useful is
-- identical across all four: the number, the title, the notes, the type and its colour, the status,
-- the photos and video and voice notes hanging off it. Split the table and every one of those has
-- to be joined four ways, and the side list — which is the whole point of the feature — becomes a
-- union query that can never be ordered properly.
--
-- So a point grows a `geometry` and the handful of columns each shape needs:
--
--   point   the dot we already had. Nothing extra.
--   fov     where a photograph was taken from and which way the camera faced: a bearing, a cone
--           width, and how far out to draw it. `x`/`y` is where the photographer stood.
--   path    a walk, for a video recorded while moving: `x`/`y` is where it started, `vertices` are
--           the bends after it.
--   area    a region — heavy brush, a flood-prone corner, the bit of fence that is wrong. Same
--           `vertices`, closed.
--
-- `x`/`y` stays meaningful and required for ALL of them: it is where the numbered marker sits, what
-- the list scrolls to, and what still renders if a browser cannot draw the rest. A path whose
-- vertices failed to parse is a labelled dot at the trailhead, not a missing row.
--
-- ── WHY VERTICES ARE JSONB AND NOT POSTGIS ──────────────────────────────────────────────────────
-- These are fractions of an image, not points on the earth. PostGIS would demand a spatial
-- reference system this data does not have — most of these maps are a screenshot of an aerial with
-- no georeference at all — and would buy nothing, since every query is "give me the shapes of this
-- map" and never "which shapes intersect". Real coordinates, where a map has been tied down, are
-- computed for display from lib/jobs/property-map.ts and stored per point in lat/lng.

BEGIN;

ALTER TABLE public.job_map_points
  ADD COLUMN IF NOT EXISTS geometry text NOT NULL DEFAULT 'point',
  -- The bends after the first, for `path` and `area`: [{"x":0.31,"y":0.42}, …], each 0–1 of the
  -- image's own box, exactly like x/y. NULL for a dot or a cone.
  ADD COLUMN IF NOT EXISTS vertices jsonb,
  -- Compass degrees clockwise from the top of the image (0 = up). Which way the camera faced.
  ADD COLUMN IF NOT EXISTS bearing_deg double precision,
  -- How wide the cone is. A phone's main camera is roughly 65–75°; a wide lens 90–120°.
  ADD COLUMN IF NOT EXISTS fov_deg double precision,
  -- How far the cone is drawn, as a fraction of the image width. Not a measurement — a drawing
  -- choice, so the cone reaches the thing being photographed rather than the edge of the world.
  ADD COLUMN IF NOT EXISTS fov_radius double precision;

-- The vocabulary lives in lib/jobs/property-map.ts (POINT_GEOMETRIES) so adding a fifth shape is a
-- line of TypeScript — but the column may not hold something no renderer knows how to draw.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'job_map_points_geometry_check') THEN
    ALTER TABLE public.job_map_points
      ADD CONSTRAINT job_map_points_geometry_check
      CHECK (geometry IN ('point', 'fov', 'path', 'area'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'job_map_points_fov_check') THEN
    ALTER TABLE public.job_map_points
      ADD CONSTRAINT job_map_points_fov_check
      CHECK (
        (bearing_deg IS NULL OR (bearing_deg >= 0 AND bearing_deg < 360)) AND
        (fov_deg     IS NULL OR (fov_deg     > 0 AND fov_deg    <= 360)) AND
        (fov_radius  IS NULL OR (fov_radius  > 0 AND fov_radius <= 2))
      );
  END IF;
END $$;

COMMENT ON COLUMN public.job_map_points.geometry IS
  'How this point of interest is drawn: point (a dot), fov (a camera cone: where somebody stood and which way they faced), path (a walk, for a video recorded while moving), area (a closed region). All four carry the same notes, media, type and status — see seeds/642.';
COMMENT ON COLUMN public.job_map_points.vertices IS
  'The bends after x/y for path and area, as [{"x":0-1,"y":0-1}, …] fractions of the image box. NULL for point and fov.';
COMMENT ON COLUMN public.job_map_points.bearing_deg IS
  'Compass degrees clockwise from the top of the image (0 = up). The direction the camera faced.';

-- Rows written before this migration are dots, which is what they were.
UPDATE public.job_map_points SET geometry = 'point' WHERE geometry IS NULL;

COMMIT;

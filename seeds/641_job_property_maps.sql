-- seeds/641_job_property_maps.sql — an aerial of the property, with numbered points on it
--
-- Owner, 2026-09-16: "For each job, I want it so that we can create an interactive map … we can
-- upload an aerial/satellite view of the property, and then … place points of interest on the map
-- image … with that dot we can attach meta data. We can attach notes, and we can attach images and
-- videos. We can attach audio recordings … This will help us document specific features of a job
-- easily and keep track of them and where they are at on the property."
--
-- Spec: docs/planning/in-progress/interactive-property-map-2026-09-16.md
--
-- ── THREE DECISIONS THIS SCHEMA MAKES ───────────────────────────────────────────────────────────
--
-- 1. COORDINATES ARE FRACTIONS, NOT PIXELS. `x` and `y` are 0–1 of the image's own box. The aerial
--    can be replaced with a better scan, the browser can be any width, the phone can be sideways,
--    and every pin stays on the fence corner it was put on. Pixels would tie the data to one file
--    at one size, and the first re-scan would move forty points at once.
--
-- 2. MEDIA IS LINKED, NEVER COPIED. `job_map_point_media` points at a `job_files` row. A photo
--    pinned to a point is still in the job's Photos folder, still in search, still in the file
--    viewer — one file, two ways to find it. Copying bytes would double the storage bill and, worse,
--    make "the photo on the map" and "the photo in the folder" drift apart the moment one is
--    renamed or deleted.
--
-- 3. A POINT'S TYPE IS A COLUMN FROM DAY ONE. Owner, same day: "we should be able to make the points
--    of interest appear as different colors depending on what they are … The default for a new point
--    of interest is the generic kind." A map where every dot looks alike is a list. The vocabulary
--    lives in lib/jobs/property-map.ts (POINT_TYPES) rather than in a CHECK constraint, because
--    adding "cattle guard" next spring should be a line of TypeScript and a colour token, not a
--    migration — but the column is NOT NULL with a default so no row can exist without one.
--
-- A job may have more than one map (an overall aerial and a detail inset of the crowded corner), so
-- these are lists, not singletons. Soft delete throughout, like every other job-owned table here.

BEGIN;

-- ── THE MAP ─────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.job_property_maps (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  job_id        uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  title         text NOT NULL DEFAULT 'Property map' CHECK (btrim(title) <> '' AND char_length(title) <= 120),
  -- The aerial itself, as an ordinary job file. NULL only in the moment between creating the map
  -- and the upload finishing.
  file_id       uuid REFERENCES public.job_files(id) ON DELETE SET NULL,
  image_width   integer CHECK (image_width IS NULL OR image_width > 0),
  image_height  integer CHECK (image_height IS NULL OR image_height > 0),
  -- Two known points and their real-world coordinates, once somebody georeferences the map
  -- (Phase 7). Shape: { "a": {"x":0.1,"y":0.2,"lat":31.05,"lng":-97.46}, "b": {…} }
  georeference  jsonb,
  created_by    text,
  updated_by    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz
);

COMMENT ON TABLE public.job_property_maps IS
  'An aerial/satellite image of a job''s property with numbered points of interest on it (2026-09-16). The image is an ordinary job_files row; points live in job_map_points.';
COMMENT ON COLUMN public.job_property_maps.georeference IS
  'Optional two-point affine tie to real coordinates, so a pin can report lat/long. NULL = the map is picture-only, which is fully supported.';

-- The one listing query: the live maps of a job.
CREATE INDEX IF NOT EXISTS idx_job_property_maps_job ON public.job_property_maps (job_id) WHERE deleted_at IS NULL;

-- ── THE POINTS ──────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.job_map_points (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  map_id      uuid NOT NULL REFERENCES public.job_property_maps(id) ON DELETE CASCADE,
  -- The number the viewer shows, 1-based and contiguous among live points. Renumbered on delete by
  -- lib/jobs/property-map.ts, which is also where the renumbering is unit-tested.
  ordinal     integer NOT NULL CHECK (ordinal > 0),
  title       text NOT NULL DEFAULT 'Point of interest' CHECK (btrim(title) <> '' AND char_length(title) <= 160),
  notes       text,
  -- 0–1 of the image's own box. See decision 1 in the header.
  x           double precision NOT NULL CHECK (x >= 0 AND x <= 1),
  y           double precision NOT NULL CHECK (y >= 0 AND y <= 1),
  -- The vocabulary is POINT_TYPES in lib/jobs/property-map.ts; 'generic' is what a new point gets.
  point_type  text NOT NULL DEFAULT 'generic' CHECK (btrim(point_type) <> ''),
  status      text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'attention')),
  -- Filled once the map is georeferenced, or typed in by hand for a point that was GPS'd on site.
  lat         double precision,
  lng         double precision,
  created_by  text,
  updated_by  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);

COMMENT ON TABLE public.job_map_points IS
  'A numbered point of interest on a job property map: where it is (x/y as 0-1 fractions of the image), what it is (point_type), and what was found there (notes + job_map_point_media).';

-- The one hot query: every live point of a map, in the order the list and the numbers use.
CREATE INDEX IF NOT EXISTS idx_job_map_points_map ON public.job_map_points (map_id, ordinal) WHERE deleted_at IS NULL;

-- Two live points cannot share a number on the same map — that is a renumbering bug, and the
-- viewer's "point 7" would be ambiguous.
CREATE UNIQUE INDEX IF NOT EXISTS uq_job_map_points_ordinal
  ON public.job_map_points (map_id, ordinal) WHERE deleted_at IS NULL;

-- ── THE MEDIA ON A POINT ────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.job_map_point_media (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  point_id      uuid NOT NULL REFERENCES public.job_map_points(id) ON DELETE CASCADE,
  -- The file itself. CASCADE: a file deleted from the job is not a thing the map can still show.
  job_file_id   uuid NOT NULL REFERENCES public.job_files(id) ON DELETE CASCADE,
  kind          text NOT NULL CHECK (kind IN ('image', 'video', 'audio', 'document')),
  -- A 400px preview generated at attach time (images: sharp; video: a poster frame captured in the
  -- browser). NULL for audio and documents, which show an icon.
  thumb_path    text,
  thumb_bucket  text,
  caption       text,
  ordinal       integer NOT NULL DEFAULT 1 CHECK (ordinal > 0),
  created_by    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz
);

COMMENT ON TABLE public.job_map_point_media IS
  'What is attached to a point of interest: a link to a job_files row (never a copy of the bytes) plus the preview thumbnail generated when it was attached.';

-- The one hot query: everything attached to the points of one map, fetched in a single round trip.
CREATE INDEX IF NOT EXISTS idx_job_map_point_media_point ON public.job_map_point_media (point_id, ordinal) WHERE deleted_at IS NULL;
-- "Is this file pinned anywhere?" — asked when a file is deleted or shown in the file viewer.
CREATE INDEX IF NOT EXISTS idx_job_map_point_media_file ON public.job_map_point_media (job_file_id) WHERE deleted_at IS NULL;
-- The same file twice on the same point is a double-click, not an intention.
CREATE UNIQUE INDEX IF NOT EXISTS uq_job_map_point_media_file
  ON public.job_map_point_media (point_id, job_file_id) WHERE deleted_at IS NULL;

-- Server-only, like every other job-owned table: reads and writes go through the API with the
-- service role, which is where the job's permissions are actually checked.
ALTER TABLE public.job_property_maps   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_map_points      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_map_point_media ENABLE ROW LEVEL SECURITY;

-- updated_at, the same way every other table in this schema does it.
DO $$
DECLARE t text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'set_updated_at') THEN
    FOREACH t IN ARRAY ARRAY['job_property_maps', 'job_map_points', 'job_map_point_media'] LOOP
      EXECUTE format('DROP TRIGGER IF EXISTS trg_%1$s_updated_at ON public.%1$s', t);
      EXECUTE format('CREATE TRIGGER trg_%1$s_updated_at BEFORE UPDATE ON public.%1$s FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()', t);
    END LOOP;
  END IF;
END $$;

COMMIT;

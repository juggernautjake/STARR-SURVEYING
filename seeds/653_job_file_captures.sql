-- seeds/653_job_file_captures.sql — where a photograph was taken.
--
-- Owner, 2026-09-20: "Pictures and videos taken on the job will have their positioning data used to
-- place them on the map, and we will show the path the user walked for videos, if they walked far
-- enough for it to matter at least."
--
-- Designed on 2026-09-19 in docs/planning/in-progress/gps-capture-2026-09-19.md, which has carried
-- the status line "designed, not built" since. This is the build.
--
-- ── WHY THE FILE AND NOT THE POINT ──────────────────────────────────────────────────────────────
--
-- This is the one decision in the feature that is expensive to get wrong, and it was settled by a
-- question the owner asked rather than by taste:
--
--   "it could be that a user is clocked into the wrong job, or they are in the wrong job profile,
--    and they record some videos and images without realizing… we need it so that we can move
--    files/photos/videos easily to other jobs in the same project or other projects and still
--    retain the lat/long and other data for the capture."
--
-- If the fix lives on `job_map_points`, moving a file to another job loses it: the point stays
-- behind holding the coordinates and the photograph arrives somewhere else naked.
--
-- So the FILE is the subject and the point is a consequence. One row per captured file, keyed on
-- `job_file_id`. Move the file and its position moves with it; the point can be recreated in the
-- new job from data the file still holds.
--
-- ── WHY NOT REUSE field_media, WHICH ALREADY HAS device_lat/device_lon ──────────────────────────
--
-- Because it hangs off `field_data_points`, which the interactive map cannot see at all. There are
-- two unconnected media lineages in this database: `field_media` (mobile, has GPS, attached to
-- field data points, currently zero rows) and `job_files` → `job_map_point_media` (the map, no GPS,
-- 81 live rows). The map's media model links `job_files`. Putting capture data anywhere else means
-- the map still cannot read it.
--
-- `field_media.device_lat/device_lon` is left alone. It is written by mobile/lib/fieldMedia.ts and
-- is not this table's business; a later slice can bridge or retire it, and doing that here would
-- mean changing a live mobile write path in a migration about map points.
--
-- ── THE TRACK, AND WHY IT STORES TIME ───────────────────────────────────────────────────────────
--
-- `track` is video only: [{ t, lat, lng, acc }] where `t` is seconds into the clip, NOT a wall
-- clock. That is what lets a marker move along the path as the video plays, driven off the <video>
-- element's currentTime rather than a timer running beside it — so scrubbing, pausing and rewinding
-- all work for free because position is a function of playback time.
--
-- ── ACCURACY IS STORED BECAUSE IT DECIDES WHAT IS REAL ──────────────────────────────────────────
--
-- Phone GPS is 3-5 m at best and worse under canopy. The owner's "far enough for it to matter" is
-- 15 ft, about 4.6 m, which sits AT the noise floor — a phone lying still on a tailgate appears to
-- wander that far, so a video shot standing still would otherwise draw a bird's nest of invented
-- movement. The filter keeps a sample only when it is further than BOTH 15 ft and the accuracy the
-- phone reported for that fix. That arithmetic lives in lib/jobs/capture-track.ts where it can be
-- tested without a phone; this column is what makes it possible, which is why accuracy is stored
-- per sample inside `track` as well as once for the file.
--
-- ── NULL ISLAND ────────────────────────────────────────────────────────────────────────────────
--
-- A CHECK rejects exactly (0, 0). It is a real coordinate in the Gulf of Guinea and it is what a
-- zeroed struct looks like, so every mapping system on earth accumulates a pile of points there.
-- Cheaper to refuse than to explain later.

BEGIN;

CREATE TABLE IF NOT EXISTS public.job_file_captures (
  -- The file IS the identity. One capture per file, and it dies with the file.
  job_file_id   uuid PRIMARY KEY REFERENCES public.job_files(id) ON DELETE CASCADE,
  org_id        uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,

  -- When the shutter went, from the device. Distinct from job_files.uploaded_at, which can be days
  -- later when a crew is out of signal — the same two-clock problem seeds/522 and seeds/527 record
  -- for collector points. Sorting a day's work by upload time reorders the shots.
  captured_at   timestamptz,

  lat           double precision,
  lng           double precision,
  accuracy_m    double precision CHECK (accuracy_m IS NULL OR accuracy_m >= 0),
  altitude_m    double precision,
  -- 0-360. Which way the camera was pointing, for a street-view style cone on the map.
  heading_deg   double precision CHECK (heading_deg IS NULL OR (heading_deg >= 0 AND heading_deg < 360)),

  -- Video only. [{ t: seconds-into-clip, lat, lng, acc }]. NULL for a still.
  track         jsonb,

  -- Where the coordinates came from, so a map can say it rather than imply it. 'exif' is a
  -- photograph's own metadata; 'device' is the mobile app's sensor reading at capture time;
  -- 'manual' is somebody dragging a pin, which must not be silently overwritten by a later re-read
  -- of the file's EXIF.
  source        text NOT NULL DEFAULT 'exif'
                CHECK (source IN ('exif', 'device', 'manual', 'import')),

  device        text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  -- Either both coordinates or neither. A row with a latitude and no longitude is not a position,
  -- and letting one exist means every reader has to check both forever.
  CONSTRAINT job_file_captures_latlng_pair
    CHECK ((lat IS NULL) = (lng IS NULL)),
  CONSTRAINT job_file_captures_latlng_range
    CHECK (lat IS NULL OR (lat BETWEEN -90 AND 90 AND lng BETWEEN -180 AND 180)),
  -- Null Island. See the header.
  CONSTRAINT job_file_captures_not_null_island
    CHECK (lat IS NULL OR NOT (lat = 0 AND lng = 0))
);

COMMENT ON TABLE public.job_file_captures IS
  'Where and when a file was captured. Keyed on the FILE, not on a map point, so moving a photo or video between jobs carries its coordinates with it (owner, 2026-09-19). The map point is derived from this and can be recreated in the new job.';

COMMENT ON COLUMN public.job_file_captures.track IS
  'Video only: [{ t, lat, lng, acc }] where t is SECONDS INTO THE CLIP, not a wall clock — so a marker can be positioned from the video element''s currentTime and scrubbing works without a second timer.';

COMMENT ON COLUMN public.job_file_captures.source IS
  'exif = read from the file''s own metadata; device = the mobile app''s sensors at capture; manual = somebody placed it, and a later EXIF re-read must not overwrite it; import = came in with a point file.';

-- "Which of this job's files have a position?" — the map's placement query. Joined through
-- job_files, so this index is on the coordinate presence rather than on a job id this table does
-- not carry. It does not carry one ON PURPOSE: the job lives on job_files, and duplicating it here
-- would give a moved file two answers to "which job is this?"
CREATE INDEX IF NOT EXISTS idx_job_file_captures_located
  ON public.job_file_captures (job_file_id) WHERE lat IS NOT NULL;

-- Chronological review of a day's captures.
CREATE INDEX IF NOT EXISTS idx_job_file_captures_time
  ON public.job_file_captures (captured_at DESC NULLS LAST);

-- Server-only, like every other job-owned table: reads and writes go through the API with the
-- service role, which is where the job's permissions are actually checked.
ALTER TABLE public.job_file_captures ENABLE ROW LEVEL SECURITY;

-- ── THE POINT KNOWS WHICH FILE MADE IT ──────────────────────────────────────────────────────────
--
-- So a re-import does not create a second pin for the same photograph, and so deleting the file's
-- capture can find the point it produced. NULL for every point somebody placed by hand, which is
-- all 44 of them today.
ALTER TABLE public.job_map_points
  ADD COLUMN IF NOT EXISTS from_file_id uuid REFERENCES public.job_files(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.job_map_points.from_file_id IS
  'The file this point was DERIVED from, for points placed automatically from a capture. NULL means a person placed it. Stops a re-read of the same photo creating a second pin.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_job_map_points_from_file
  ON public.job_map_points (map_id, from_file_id) WHERE from_file_id IS NOT NULL AND deleted_at IS NULL;

COMMIT;

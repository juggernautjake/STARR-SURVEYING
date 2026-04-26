-- ============================================================================
-- 221_starr_field_data_points.sql
-- Starr Field — Phase F3 data points + media (camera capture, photos,
-- videos, voice memos) per STARR_FIELD_MOBILE_APP_PLAN.md §5.3 + §5.4.
--
-- Tables added:
--   field_data_points  — one row per surveyor "+" Point capture; the
--                        name matches the GPS-rover shot and aggregates
--                        photos/videos/voice/notes captured offline
--                        against the same identifier.
--   field_media        — every photo / video / voice memo captured,
--                        either attached to a data point (data_point_id
--                        set) or directly to a job (job_id only — see
--                        plan §5.4 "Job-level photo upload").
--
-- Plus three private Supabase Storage buckets — separate per-type so
-- file_size_limit + allowed_mime_types can differ:
--   starr-field-photos   — 25 MB cap, JPEG/PNG/HEIC/WEBP
--   starr-field-videos   — 500 MB cap, MP4/MOV/QuickTime
--   starr-field-voice    — 25 MB cap, M4A/MP3/AAC
--
-- All three follow the F2 path convention: {user_id}/{...}.{ext} so
-- per-user-folder RLS works the same way (the leading folder MUST
-- equal auth.uid()::text on insert/select/delete).
--
-- Identity: created_by / user_id columns reference auth.users(id) per
-- plan §5.10. Same convention as receipts; differs from the legacy
-- email-keyed daily_time_logs / job_time_entries / fieldbook_notes.
--
-- IMPORTANT — depends on `jobs` and `field_data_points` (the latter is
-- created in this very seed and field_media references it). The `jobs`
-- FK is added via a deferred DO block (same idempotent pattern as
-- seeds/220_*.sql) so a fresh `seeds/run_all.sh` against an empty DB
-- still applies the table-create successfully.
--
-- Phases that follow:
--   222_starr_field_location.sql      — F6 location_stops + segments
--   223_starr_field_vehicles.sql      — F1+ fleet
-- ============================================================================

BEGIN;

-- ── field_data_points ──────────────────────────────────────────────────────
-- One row per "+" Point capture. Name follows the 179-code Starr
-- Surveying taxonomy (BM01, IR03, FL-CORNER-NE, etc.); the
-- code_category column is a server-side denorm derived from the
-- prefix so the admin UI can group / colour by category without
-- re-parsing the name on every render.
CREATE TABLE IF NOT EXISTS field_data_points (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Required job link. ON DELETE CASCADE: archiving a job sweeps
  -- its associated points (photos cascade via field_media).
  job_id                  UUID NOT NULL,

  -- Plan §5.3: name comes from the 179-code library (BM01, IR03, …).
  name                    TEXT NOT NULL,
  code_category           TEXT,                              -- denorm from name prefix

  -- Free-text description.
  description             TEXT,

  -- Phone-side metadata captured at "+" Point time.
  device_lat              NUMERIC,
  device_lon              NUMERIC,
  device_altitude_m       NUMERIC,
  device_accuracy_m       NUMERIC,
  device_compass_heading  NUMERIC,                           -- 0-360 deg; null when sensor unavailable

  -- Special point-type flags per plan §5.3.
  is_offset               BOOLEAN NOT NULL DEFAULT false,
  is_correction           BOOLEAN NOT NULL DEFAULT false,
  corrects_point_id       UUID REFERENCES field_data_points  -- self-ref; corrections link back
                                       ON DELETE SET NULL,

  -- Owner — auth.users.id (UUID). Mobile reads from session.user.id.
  created_by              UUID REFERENCES auth.users,

  -- Offline-sync dedup key (PowerSync writes; PK is the actual dedup
  -- mechanism, but we keep this column so the audit can correlate
  -- mobile retries to server-side rows).
  client_id               TEXT,

  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'field_data_points_name_chk') THEN
    -- Reject empty names. The mobile UI validates but the DB is the
    -- source of truth — without this, a malformed sync write could
    -- land an unnamed point that the admin UI can't display.
    ALTER TABLE field_data_points
      ADD CONSTRAINT field_data_points_name_chk
        CHECK (length(trim(name)) > 0);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'field_data_points_job_name_uniq') THEN
    -- Plan §6.3: UNIQUE(job_id, name) — two surveyors on the same job
    -- can't both create "BM01" without conflict. The mobile autocomplete
    -- helps avoid this; the constraint is the DB-side guard.
    ALTER TABLE field_data_points
      ADD CONSTRAINT field_data_points_job_name_uniq
        UNIQUE (job_id, name);
  END IF;
END $$;

-- Hot lookups:
--   1. "show me all points on this job" (admin job detail, mobile job page)
--   2. "show me everything I created today / this week" (my-points feed)
--   3. "find points correcting an earlier one" (admin reconciliation view)
CREATE INDEX IF NOT EXISTS idx_field_data_points_job
  ON field_data_points (job_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_field_data_points_created_by
  ON field_data_points (created_by, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_field_data_points_corrects
  ON field_data_points (corrects_point_id) WHERE corrects_point_id IS NOT NULL;

-- updated_at trigger.
CREATE OR REPLACE FUNCTION update_field_data_points_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_field_data_points_updated_at ON field_data_points;
CREATE TRIGGER trg_field_data_points_updated_at
  BEFORE UPDATE ON field_data_points
  FOR EACH ROW
  EXECUTE FUNCTION update_field_data_points_updated_at();


-- ── field_media ────────────────────────────────────────────────────────────
-- Photos, videos, voice memos. Three states:
--   1. Attached to a data point — both data_point_id and job_id set.
--      Most common — the "+" Point flow takes the user straight into
--      camera mode.
--   2. Job-level upload — data_point_id null, job_id set. Per plan
--      §5.4 ("Job-level photo upload — no point assignment").
--   3. (post-v1) Cross-job library — both null. Not allowed today;
--      enforced by the chk constraint below.
CREATE TABLE IF NOT EXISTS field_media (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  job_id                  UUID NOT NULL,                     -- always required
  data_point_id           UUID REFERENCES field_data_points  -- null for job-level uploads
                                       ON DELETE CASCADE,

  -- 'photo' | 'video' | 'voice'
  media_type              TEXT NOT NULL,

  -- Storage paths (relative to the bucket — the bucket is implied by
  -- media_type). The user's signed-URL hook resolves these at view
  -- time. Path convention: {user_id}/{data_point_id-or-job_id}-{seq}.{ext}.
  --   storage_url      — display tier (medium-quality, fast-sync)
  --   thumbnail_url    — list view tile (videos: poster frame; photos:
  --                      small JPEG)
  --   original_url     — full-resolution; uploads on WiFi only by
  --                      default (plan §5.4 compression strategy)
  --   annotated_url    — rendered overlay (arrows/circles/text per
  --                      plan §5.4 photo annotation). null until the
  --                      user adds annotations; original is ALWAYS
  --                      preserved unmodified.
  storage_url             TEXT NOT NULL,
  thumbnail_url           TEXT,
  original_url            TEXT,
  annotated_url           TEXT,

  -- Upload-state tracking per audit recommendation. The mobile client
  -- writes 'pending' on capture, 'wifi-waiting' once medium-quality
  -- has uploaded, 'done' when the original lands. Admin "where's my
  -- high-res?" diagnostic reads this directly.
  upload_state            TEXT NOT NULL DEFAULT 'pending',   -- 'pending'|'wifi-waiting'|'done'|'failed'

  -- Burst / sequence support per plan §5.4. burst_group_id is a UUID
  -- shared by all shots in a single burst; position is the order
  -- within the burst (or 0 for one-off captures). The admin UI groups
  -- bursts so a 12-shot panorama doesn't flood the timeline.
  burst_group_id          UUID,
  position                INT NOT NULL DEFAULT 0,

  -- Container metadata.
  duration_seconds        INT,                               -- video / voice
  file_size_bytes         BIGINT,

  -- Phone-side capture metadata. EXIF embeds the same; the columns
  -- duplicate for query speed (admin "where was this shot?" map view).
  device_lat              NUMERIC,
  device_lon              NUMERIC,
  device_compass_heading  NUMERIC,

  captured_at             TIMESTAMPTZ,
  uploaded_at             TIMESTAMPTZ,

  -- Voice transcript (auto-generated post-upload via F4 worker;
  -- editable by the user). null until F4 ships.
  transcription           TEXT,

  -- Annotation layer (the *data*, not the rendered overlay). Mobile
  -- writes a JSON list of {kind: 'arrow'|'circle'|'text', x, y, …}
  -- entries; the rendered overlay lands at annotated_url. Storing
  -- both lets us re-render the overlay if styling changes later.
  annotations             JSONB,

  created_by              UUID REFERENCES auth.users,
  client_id               TEXT,

  created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'field_media_type_chk') THEN
    ALTER TABLE field_media
      ADD CONSTRAINT field_media_type_chk
        CHECK (media_type IN ('photo','video','voice'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'field_media_upload_state_chk') THEN
    ALTER TABLE field_media
      ADD CONSTRAINT field_media_upload_state_chk
        CHECK (upload_state IN ('pending','wifi-waiting','done','failed'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'field_media_size_chk') THEN
    ALTER TABLE field_media
      ADD CONSTRAINT field_media_size_chk
        CHECK (
          (duration_seconds IS NULL OR duration_seconds >= 0) AND
          (file_size_bytes  IS NULL OR file_size_bytes  >= 0) AND
          (position >= 0)
        );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_field_media_job
  ON field_media (job_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_field_media_data_point
  ON field_media (data_point_id, position) WHERE data_point_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_field_media_burst
  ON field_media (burst_group_id, position) WHERE burst_group_id IS NOT NULL;
-- Worker poll for the F4 transcription queue (voice memos awaiting
-- speech-to-text). Partial — most rows are 'photo'.
CREATE INDEX IF NOT EXISTS idx_field_media_voice_pending
  ON field_media (created_at)
  WHERE media_type = 'voice' AND transcription IS NULL;
-- Mobile + admin "show me high-res that hasn't synced yet" diagnostic.
CREATE INDEX IF NOT EXISTS idx_field_media_pending_upload
  ON field_media (created_at)
  WHERE upload_state IN ('pending','wifi-waiting');


-- ── Deferred FKs to existing tables ────────────────────────────────────────
-- Same conditional pattern as seeds/220 — attach the FK only when the
-- parent table exists. Live Supabase has `jobs`, so the constraint
-- attaches normally on production. Fresh `run_all.sh` against an empty
-- DB succeeds at this seed without it.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'jobs'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'field_data_points_job_fk'
  ) THEN
    ALTER TABLE field_data_points
      ADD CONSTRAINT field_data_points_job_fk
        FOREIGN KEY (job_id)
        REFERENCES jobs(id)
        ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'jobs'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'field_media_job_fk'
  ) THEN
    ALTER TABLE field_media
      ADD CONSTRAINT field_media_job_fk
        FOREIGN KEY (job_id)
        REFERENCES jobs(id)
        ON DELETE CASCADE;
  END IF;
END $$;


-- ── RLS — field_data_points ────────────────────────────────────────────────
-- Service role bypasses RLS automatically; the explicit policy below
-- is for clarity. Owner-scope: a surveyor can read + write their own
-- points. Crew co-visibility ("Jacob sees Henry's points on the same
-- job") needs a company-membership helper that lands in seeds/210
-- post-F3 polish — for now the admin API surfaces cross-user views.
ALTER TABLE field_data_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE field_media       ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY service_role_full_access_field_data_points ON field_data_points
    FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY service_role_full_access_field_media ON field_media
    FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Owner-scoped read — surveyor sees their own points.
DO $$ BEGIN
  CREATE POLICY field_data_points_owner_select ON field_data_points
    FOR SELECT TO authenticated
    USING (created_by = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Owner-scoped insert.
DO $$ BEGIN
  CREATE POLICY field_data_points_owner_insert ON field_data_points
    FOR INSERT TO authenticated
    WITH CHECK (created_by = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Owner-scoped update — same defence-in-depth pattern as receipts:
-- the column-level GRANT below restricts WHICH columns can be touched.
DO $$ BEGIN
  CREATE POLICY field_data_points_owner_update ON field_data_points
    FOR UPDATE TO authenticated
    USING (created_by = auth.uid())
    WITH CHECK (created_by = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Owner-scoped delete — surveyor can delete their own points within
-- the first 24 h (typo / wrong-job correction). Beyond that the admin
-- API soft-deletes via service role.
DO $$ BEGIN
  CREATE POLICY field_data_points_owner_delete ON field_data_points
    FOR DELETE TO authenticated
    USING (
      created_by = auth.uid()
      AND created_at > (now() - interval '24 hours')
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ── RLS — field_media (inherits via parent point + own job) ────────────────
-- Owner can see media they captured. Cross-crew visibility on the
-- same job is admin-side for v1.
DO $$ BEGIN
  CREATE POLICY field_media_owner_select ON field_media
    FOR SELECT TO authenticated
    USING (created_by = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY field_media_owner_insert ON field_media
    FOR INSERT TO authenticated
    WITH CHECK (created_by = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY field_media_owner_update ON field_media
    FOR UPDATE TO authenticated
    USING (created_by = auth.uid())
    WITH CHECK (created_by = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY field_media_owner_delete ON field_media
    FOR DELETE TO authenticated
    USING (
      created_by = auth.uid()
      AND created_at > (now() - interval '24 hours')
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ── Column-level UPDATE allowlist for the `authenticated` role ─────────────
-- Defence in depth: RLS already gates WHICH rows owners can touch;
-- this gates WHICH columns. Worker / admin writes go through
-- service_role and bypass both.
--
-- Columns NOT in the allowlist (owners cannot touch via direct UPDATE):
--   field_data_points: created_by (immutable post-insert), created_at
--   field_media:       created_by, created_at, transcription
--                      (transcription is worker-owned in F4)
REVOKE UPDATE ON field_data_points FROM authenticated;
GRANT UPDATE (
  job_id, name, code_category, description,
  device_lat, device_lon, device_altitude_m, device_accuracy_m,
  device_compass_heading,
  is_offset, is_correction, corrects_point_id,
  updated_at, client_id
) ON field_data_points TO authenticated;

REVOKE UPDATE ON field_media FROM authenticated;
GRANT UPDATE (
  job_id, data_point_id, media_type,
  storage_url, thumbnail_url, original_url, annotated_url,
  upload_state, burst_group_id, position,
  duration_seconds, file_size_bytes,
  device_lat, device_lon, device_compass_heading,
  captured_at, uploaded_at,
  annotations, client_id
) ON field_media TO authenticated;


-- ── Storage buckets — three private per-media-type ─────────────────────────
-- Per-type buckets so file_size_limit + allowed_mime_types differ
-- (videos need 500 MB+, voice files are <25 MB, photos cap at 25 MB).
-- Path convention shared across all three: {user_id}/{...}.{ext} so
-- the per-user-folder RLS pattern from F2 receipts applies identically.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'starr-field-photos',
  'starr-field-photos',
  false,
  26214400,                                                     -- 25 MB
  ARRAY['image/jpeg','image/png','image/heic','image/heif','image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 26214400,
  allowed_mime_types = ARRAY['image/jpeg','image/png','image/heic','image/heif','image/webp'];

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'starr-field-videos',
  'starr-field-videos',
  false,
  524288000,                                                    -- 500 MB
  ARRAY['video/mp4','video/quicktime','video/x-m4v']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 524288000,
  allowed_mime_types = ARRAY['video/mp4','video/quicktime','video/x-m4v'];

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'starr-field-voice',
  'starr-field-voice',
  false,
  26214400,                                                     -- 25 MB
  ARRAY['audio/mp4','audio/m4a','audio/x-m4a','audio/mpeg','audio/aac','audio/wav']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 26214400,
  allowed_mime_types = ARRAY['audio/mp4','audio/m4a','audio/x-m4a','audio/mpeg','audio/aac','audio/wav'];

-- Storage RLS — three policy blocks, one per bucket. Same shape as
-- F2 receipts: service_role full access; authenticated insert/select/
-- delete only into their own user-id prefix folder.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'starr_field_photos_service_role_all'
  ) THEN
    CREATE POLICY starr_field_photos_service_role_all
      ON storage.objects FOR ALL TO service_role
      USING (bucket_id = 'starr-field-photos')
      WITH CHECK (bucket_id = 'starr-field-photos');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'starr_field_photos_owner_insert'
  ) THEN
    CREATE POLICY starr_field_photos_owner_insert
      ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (
        bucket_id = 'starr-field-photos'
        AND (storage.foldername(name))[1] = auth.uid()::text
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'starr_field_photos_owner_select'
  ) THEN
    CREATE POLICY starr_field_photos_owner_select
      ON storage.objects FOR SELECT TO authenticated
      USING (
        bucket_id = 'starr-field-photos'
        AND (storage.foldername(name))[1] = auth.uid()::text
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'starr_field_photos_owner_delete'
  ) THEN
    CREATE POLICY starr_field_photos_owner_delete
      ON storage.objects FOR DELETE TO authenticated
      USING (
        bucket_id = 'starr-field-photos'
        AND (storage.foldername(name))[1] = auth.uid()::text
      );
  END IF;
END $$;

-- starr-field-videos
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'starr_field_videos_service_role_all'
  ) THEN
    CREATE POLICY starr_field_videos_service_role_all
      ON storage.objects FOR ALL TO service_role
      USING (bucket_id = 'starr-field-videos')
      WITH CHECK (bucket_id = 'starr-field-videos');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'starr_field_videos_owner_insert'
  ) THEN
    CREATE POLICY starr_field_videos_owner_insert
      ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (
        bucket_id = 'starr-field-videos'
        AND (storage.foldername(name))[1] = auth.uid()::text
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'starr_field_videos_owner_select'
  ) THEN
    CREATE POLICY starr_field_videos_owner_select
      ON storage.objects FOR SELECT TO authenticated
      USING (
        bucket_id = 'starr-field-videos'
        AND (storage.foldername(name))[1] = auth.uid()::text
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'starr_field_videos_owner_delete'
  ) THEN
    CREATE POLICY starr_field_videos_owner_delete
      ON storage.objects FOR DELETE TO authenticated
      USING (
        bucket_id = 'starr-field-videos'
        AND (storage.foldername(name))[1] = auth.uid()::text
      );
  END IF;
END $$;

-- starr-field-voice
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'starr_field_voice_service_role_all'
  ) THEN
    CREATE POLICY starr_field_voice_service_role_all
      ON storage.objects FOR ALL TO service_role
      USING (bucket_id = 'starr-field-voice')
      WITH CHECK (bucket_id = 'starr-field-voice');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'starr_field_voice_owner_insert'
  ) THEN
    CREATE POLICY starr_field_voice_owner_insert
      ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (
        bucket_id = 'starr-field-voice'
        AND (storage.foldername(name))[1] = auth.uid()::text
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'starr_field_voice_owner_select'
  ) THEN
    CREATE POLICY starr_field_voice_owner_select
      ON storage.objects FOR SELECT TO authenticated
      USING (
        bucket_id = 'starr-field-voice'
        AND (storage.foldername(name))[1] = auth.uid()::text
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'starr_field_voice_owner_delete'
  ) THEN
    CREATE POLICY starr_field_voice_owner_delete
      ON storage.objects FOR DELETE TO authenticated
      USING (
        bucket_id = 'starr-field-voice'
        AND (storage.foldername(name))[1] = auth.uid()::text
      );
  END IF;
END $$;

COMMIT;

-- ============================================================================
-- 226_starr_field_files.sql
-- Starr Field — generic file attachments (PDF, CSV, instrument exports,
-- random reference docs) on jobs and data points.
--
-- Per F5 plan (Files + CSV) and the user's "make sure we can upload
-- audio and videos and pictures and files to job or specific points
-- in a job" requirement. field_media handles photo/voice/video; this
-- table handles everything else surveyors need to attach (Trimble
-- JobXML exports, raw P,N,E,Z,D coordinate dumps, scanned plans,
-- scope-of-work PDFs, third-party survey records, etc.).
--
-- Identity: created_by = auth.users.id (UUID), same as field_data_points
-- + receipts. Mobile reads session.user.id for writes.
--
-- Storage: starr-field-files bucket (created below). Path convention
-- {user_id}/{job_id_or_point_id}-{file_id}-{filename} so the
-- per-user-folder RLS works identically to the photos / voice / video
-- buckets.
--
-- IMPORTANT — depends on auth.users (Supabase). Optional FKs to
-- jobs / field_data_points handled defensively. Apply BEFORE the
-- mobile lib/jobFiles.ts capture flow + /admin/field-data viewer
-- update light up.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS job_files (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Required job link. Files can be job-level (no point) OR
  -- attached to a specific point.
  job_id          UUID NOT NULL,

  -- Optional FK to a data point. Null = job-level file.
  data_point_id   UUID,

  -- Display name as the user knows it. We DON'T derive from
  -- storage_path because the path includes the UUID prefix and
  -- isn't user-readable. Editable on mobile if the user catches
  -- a typo at upload time.
  name            TEXT NOT NULL,

  -- Free-form note from the surveyor — "Trimble export from morning
  -- session" / "scope of work amendment" / etc. Optional.
  description     TEXT,

  -- Source-of-truth storage path inside the starr-field-files
  -- bucket. Convention: {user_id}/{job_or_point_id}-{file_id}-{name}.
  storage_path    TEXT NOT NULL,
  -- MIME at upload time. Used by the admin viewer to pick the
  -- right preview (PDF / image / CSV / generic).
  content_type    TEXT,
  -- Reported file size at upload. Drives "this is a 12 MB file"
  -- copy + the cellular-budget heuristic.
  file_size_bytes INTEGER,

  -- 'pending' | 'wifi-waiting' | 'done' | 'failed' — same enum as
  -- field_media.upload_state so the upload queue's branch logic
  -- in mobile/lib/uploadQueue.ts can mirror.
  upload_state    TEXT NOT NULL DEFAULT 'pending',

  -- Audit.
  created_by      UUID NOT NULL REFERENCES auth.users,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  uploaded_at     TIMESTAMPTZ,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Mobile-side dedup key for offline replay.
  client_id       TEXT
);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'job_files_name_chk'
  ) THEN
    ALTER TABLE job_files
      ADD CONSTRAINT job_files_name_chk
        CHECK (length(trim(name)) > 0);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'job_files_upload_state_chk'
  ) THEN
    ALTER TABLE job_files
      ADD CONSTRAINT job_files_upload_state_chk
        CHECK (upload_state IN ('pending','wifi-waiting','done','failed'));
  END IF;
END $$;

-- Defensive FKs.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'jobs'
  )
  AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'job_files_job_id_fkey'
  ) THEN
    ALTER TABLE job_files
      ADD CONSTRAINT job_files_job_id_fkey
        FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'field_data_points'
  )
  AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'job_files_point_id_fkey'
  ) THEN
    ALTER TABLE job_files
      ADD CONSTRAINT job_files_point_id_fkey
        FOREIGN KEY (data_point_id)
        REFERENCES field_data_points(id) ON DELETE CASCADE;
  END IF;
END $$;


-- ── Indexes ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_job_files_job_recent
  ON job_files (job_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_job_files_point_recent
  ON job_files (data_point_id, created_at DESC)
  WHERE data_point_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_job_files_creator_recent
  ON job_files (created_by, created_at DESC);


-- ── Storage bucket ──────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'starr-field-files',
  'starr-field-files',
  false,
  104857600, -- 100 MB cap per file (PDF + CSV + instrument exports
             -- routinely fit; videos go in starr-field-videos).
  NULL       -- no MIME restriction; PDF / CSV / DXF / DWG / TXT etc.
)
ON CONFLICT (id) DO NOTHING;

-- ── RLS — table ─────────────────────────────────────────────────────────────
ALTER TABLE job_files ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY service_role_full_access_job_files ON job_files
    FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY job_files_owner_select ON job_files
    FOR SELECT TO authenticated
    USING (created_by = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY job_files_owner_insert ON job_files
    FOR INSERT TO authenticated
    WITH CHECK (created_by = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY job_files_owner_update ON job_files
    FOR UPDATE TO authenticated
    USING (created_by = auth.uid())
    WITH CHECK (created_by = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY job_files_owner_delete ON job_files
    FOR DELETE TO authenticated
    USING (created_by = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Owners can update only metadata + lifecycle, not the storage_path
-- or created_by (defence in depth — RLS already gates row access).
REVOKE UPDATE ON job_files FROM authenticated;
GRANT  UPDATE (name, description, upload_state, uploaded_at, updated_at)
  ON job_files TO authenticated;

-- ── RLS — storage object ───────────────────────────────────────────────────
-- Mirror the photos/voice/video bucket pattern: leading folder MUST
-- equal auth.uid()::text. Owners CRUD their own; service role does it
-- all (admin viewer reads via signed URLs).
DO $$ BEGIN
  CREATE POLICY service_role_full_access_files_bucket ON storage.objects
    FOR ALL TO service_role
    USING  (bucket_id = 'starr-field-files')
    WITH CHECK (bucket_id = 'starr-field-files');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY files_bucket_owner_select ON storage.objects
    FOR SELECT TO authenticated
    USING (
      bucket_id = 'starr-field-files'
      AND (storage.foldername(name))[1] = auth.uid()::text
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY files_bucket_owner_insert ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
      bucket_id = 'starr-field-files'
      AND (storage.foldername(name))[1] = auth.uid()::text
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY files_bucket_owner_delete ON storage.objects
    FOR DELETE TO authenticated
    USING (
      bucket_id = 'starr-field-files'
      AND (storage.foldername(name))[1] = auth.uid()::text
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMIT;

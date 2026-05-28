-- ============================================================================
-- 295_user_files.sql
--
-- Personal file storage backing /admin/my-files (and Hub ?tab=files).
-- Two parts: a PRIVATE `user-files` storage bucket (bytes live here,
-- accessed via short-lived signed URLs) and a `user_files` metadata table
-- (one row per uploaded file, scoped to the owner's email).
--
-- Read/write via app/api/admin/my-files/route.ts (service-role
-- supabaseAdmin; the API scopes every query to the caller's email).
-- The bucket is also auto-created at runtime by ensureStorageBucket() on
-- first upload, so applying this seed is recommended but not required.
--
-- Spec: docs/planning/in-progress/backend-audit-and-improvements-2026-05-27.md (Slice 14)
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.user_files (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email   TEXT NOT NULL,
  file_name    TEXT NOT NULL,
  file_type    TEXT,
  file_size    BIGINT,
  storage_path TEXT NOT NULL,
  folder       TEXT NOT NULL DEFAULT 'other',
  description  TEXT,
  job_id       UUID REFERENCES public.jobs(id) ON DELETE SET NULL,
  uploaded_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.user_files IS
  'Per-user personal file metadata for /admin/my-files. Bytes in the private user-files bucket at storage_path; managed via app/api/admin/my-files/route.ts.';

CREATE INDEX IF NOT EXISTS idx_user_files_email  ON public.user_files(user_email, uploaded_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_files_folder ON public.user_files(folder);

COMMIT;

-- ── Private storage bucket (signed-URL access only) ─────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('user-files', 'user-files', false, 52428800, NULL)   -- 50 MB/file
ON CONFLICT (id) DO UPDATE SET public = false;

ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'user_files_service_role_all'
  ) THEN
    CREATE POLICY user_files_service_role_all
      ON storage.objects FOR ALL TO service_role
      USING      (bucket_id = 'user-files')
      WITH CHECK (bucket_id = 'user-files');
  END IF;
END;
$$;

-- Verification:
--   SELECT id, public, file_size_limit FROM storage.buckets WHERE id = 'user-files';
--   SELECT count(*) FROM public.user_files;   -- 0

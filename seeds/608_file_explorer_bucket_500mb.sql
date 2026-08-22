-- ============================================================================
-- 608_file_explorer_bucket_500mb.sql
--
-- The File Explorer's bucket, which never existed.
--
-- ── WHAT WAS WRONG ──────────────────────────────────────────────────────────
--
-- `lib/files/upload.ts` has named a `file-explorer` bucket since F3 and capped
-- uploads at 100 MB. The bucket was never created by any seed. The upload route
-- calls `ensureStorageBucket(FILE_EXPLORER_BUCKET, { public: false })`, whose
-- fallback is **50 MB** — so the first real upload would have created a 50 MB
-- bucket underneath a 100 MB client cap.
--
-- That is the fail-at-100% defect of 2026-08-19 lying in wait in a second
-- place: a 60 MB video would have transferred in full and been refused at the
-- very end, because a client cap above the server's spends every byte before
-- anybody is told no. Measured, not assumed — `storage.buckets` held no
-- `file-explorer` row on 2026-08-22, and all 24 `file_nodes` rows had
-- `storage_bucket IS NULL` (folders and read-only `mnt:` mounts), so nothing
-- has ever been stored there.
--
-- ── WHY 500 MB ──────────────────────────────────────────────────────────────
--
-- Owner: *"I need to know that video uploading for files and for projects/jobs
-- allows us to upload longer videos successfully."*
--
-- Same number as `starr-field-videos` (seed 605) and `starr-field-files`
-- (seed 607), because the app now has ONE cap constant for every upload
-- surface — `STORAGE_UPLOAD_CAP_BYTES` in `lib/storage/uploads.ts`. A bucket
-- below that constant re-creates the defect above; a bucket above it is merely
-- unused headroom. The Supabase PROJECT ceiling is 2 GB since 2026-08-22, so
-- 500 MB is reachable rather than theoretical:
--
--     app cap 500 MB  ≤  buckets 500 MB  ≤  project ceiling 2 GB
--
-- No MIME allowlist. The job side keeps one on the video bucket, where its
-- purpose is routing — stopping a drone flight being filed as "the survey".
-- The Files area is a filesystem: a person files what they file.
--
-- Idempotent — re-runnable, and it also REPAIRS a bucket that runtime
-- auto-creation already made at 50 MB.
-- ============================================================================

BEGIN;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'file-explorer',
  'file-explorer',
  FALSE,                 -- private; the route hands out short-lived signed URLs
  524288000,             -- 500 MB per file
  NULL                   -- any type; this is a filesystem, not a media library
)
ON CONFLICT (id) DO UPDATE
  SET public = FALSE,
      file_size_limit = EXCLUDED.file_size_limit;

COMMIT;

-- ── Apply via dashboard ──────────────────────────────────────────────────────
-- storage.objects is owned by supabase_admin, so policy SQL cannot run from the
-- web editor (same pattern as seeds 290 / 295 / 318). Supabase → Storage →
-- file-explorer → Policies → New policy:
--   Name:          file-explorer service-role all
--   Operations:    SELECT, INSERT, UPDATE, DELETE
--   Target roles:  service_role
--   Definition:    bucket_id = 'file-explorer'
--
-- Everything in this app reaches the bucket through `supabaseAdmin` (service
-- role) and signs URLs for the browser, so no anon/authenticated policy is
-- wanted: permission lives in `file_permissions`, not in RLS.
--
-- ── Verification ─────────────────────────────────────────────────────────────
--   SELECT id, public, file_size_limit FROM storage.buckets
--    WHERE id = 'file-explorer';      -- public=false, 524288000
--
-- And prove it the only way that counts — by transferring real bytes:
--   node scripts/check-upload-ceiling.mjs --bucket file-explorer --expect 500

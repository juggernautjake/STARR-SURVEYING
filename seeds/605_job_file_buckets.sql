-- seeds/605_job_file_buckets.sql — a job file remembers which bucket it is in
--
-- Owner, 2026-08-19: *"I need to be able to upload videos from phones, including android and
-- iphones. Please make sure we can do that."*
--
-- ── THE BLOCKER, MEASURED ───────────────────────────────────────────────────────────────────────
--
-- `starr-field-files` has a **100 MB** per-object cap. Seed 226 says why, in its own comment:
-- *"videos go in starr-field-videos"* — a bucket that already exists, allows video MIME types, and
-- caps at **500 MB**. The Videos tab was uploading to the wrong one.
--
-- That is not a marginal difference. A phone shoots roughly:
--
--   iPhone 4K/30      ~350 MB per minute
--   iPhone 1080p/30    ~65 MB per minute
--   Android 4K/30     ~300–400 MB per minute
--
-- So at default iPhone settings, anything over ~17 seconds of 4K was refused, and a two-minute
-- walkthrough of an access road — exactly the thing a crew films — never had a chance.
--
-- ── WHY A COLUMN RATHER THAN JUST RAISING THE CAP ───────────────────────────────────────────────
--
-- Raising `starr-field-files` to 500 MB would have been one line. It also removes the reason the
-- two buckets exist: `starr-field-videos` carries a video MIME allowlist, so a mislabelled archive
-- cannot be parked there, and the 100 MB cap on the documents bucket is a real guard against
-- somebody uploading a drone flight as "the survey".
--
-- The cost of doing it properly is that a row must now say where its bytes are, because the bucket
-- was a hardcoded constant in four places. `NULL` means the original files bucket, so every row
-- written before today keeps working untouched.

BEGIN;

ALTER TABLE public.job_files ADD COLUMN IF NOT EXISTS storage_bucket text;

COMMENT ON COLUMN public.job_files.storage_bucket IS
  'Which storage bucket holds this row''s object. NULL means starr-field-files (the original, and still the default for documents and photos). Video goes to starr-field-videos, which allows video MIME types and caps at 500 MB rather than 100 MB.';

-- Existing storage rows are all in the files bucket. Stated explicitly rather than left to the
-- NULL default, so a later change to what NULL means cannot silently relocate them.
UPDATE public.job_files
SET storage_bucket = 'starr-field-files'
WHERE storage_bucket IS NULL AND storage_path IS NOT NULL;

-- ── Widen the video bucket to what phones actually produce ─────────────────────────────────────
--
-- The allowlist was mp4 / quicktime / x-m4v / webm / x-matroska. Android sends `video/3gpp` for
-- some camera apps, and a few send an empty or `application/octet-stream` content type — which
-- storage rejects with a message about MIME types that means nothing to the person holding the
-- phone. The upload path now always sends an explicit video content type, and this list covers the
-- rest of what real devices emit.
UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
      'video/mp4', 'video/quicktime', 'video/x-m4v', 'video/webm', 'video/x-matroska',
      'video/3gpp', 'video/3gpp2', 'video/mpeg', 'video/x-msvideo', 'video/avi', 'video/hevc'
    ]
WHERE id = 'starr-field-videos';

COMMIT;

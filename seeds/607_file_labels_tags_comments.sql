-- seeds/607_file_labels_tags_comments.sql — a file can be named, tagged, and talked about
--
-- Owner, 2026-08-22: *"I also want it so that I can label files and videos and pictures. I need to
-- be able to name them and write notes for them too that people can review at a later time."*
--
-- ── WHAT WAS ACTUALLY MISSING ───────────────────────────────────────────────────────────────────
--
-- Not the columns. `job_files` has had `name` and `description` the whole time. What it has never
-- had is a way to CHANGE either one after the upload: there is no PATCH route on
-- `/api/admin/jobs/files`, and the only place `description` is ever written is the upload form. So
-- a video that arrives from a phone as `IMG_4417.MOV` is called `IMG_4417.MOV` forever, and the one
-- sentence explaining what it shows had to be typed before the person had watched it back.
--
-- That is the difference between a field that exists and a field that works.
--
-- ── THREE COLUMNS AND A TABLE, AND WHY EACH IS SEPARATE ─────────────────────────────────────────
--
--   label      what a human decided to call this file. NOT a rename of `file_name`, which stays
--              exactly as uploaded — the storage key is derived from it, the download's
--              `Content-Disposition` uses it, and a crew member searching for the file their phone
--              made needs the phone's name to still be there. `label` is a display layer over it.
--
--   tags       reusable words to filter a job's files by ("monument", "access", "before"). Free
--              text rather than a fixed list because the fixed lists already exist next door
--              (`file_type`, `section`) and have been quietly wrong for every job that needed a
--              word nobody thought of in advance. A closed vocabulary is why people name files
--              `plat-FINAL-2-actual.pdf`.
--
--   comments   a running thread, in its own table. A single editable notes field was the other
--              option and it loses the thing the owner actually asked for — *"that people can
--              review at a later time"*. Two people editing one box means the second one silently
--              erases the first, and neither is attributable a month later when it matters.
--
-- ── WHY `file_comments` IS POLYMORPHIC ──────────────────────────────────────────────────────────
--
-- Photos and videos captured in Work Mode land in `field_media`, not `job_files` — two tables, both
-- of which the owner calls "files and videos and pictures". `subject_type` + `subject_id` means the
-- thread is built once and `field_media` plugs into it without a second near-identical table that
-- would drift from this one within a month. `field_media` currently holds zero rows, so nothing is
-- backfilled; the door is simply open.
--
-- No foreign key, deliberately — a polymorphic subject cannot have one. The trade is real and is
-- paid for by `subject_type` being CHECK-constrained to a known set and by orphan comments being
-- unreachable rather than harmful (nothing lists a comment except through its subject).

BEGIN;

-- ── job_files: a display name and tags ─────────────────────────────────────────────────────────

ALTER TABLE public.job_files ADD COLUMN IF NOT EXISTS label text;
ALTER TABLE public.job_files ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.job_files.label IS
  'What a person decided to call this file, shown in place of file_name. NULL means "no one has renamed it, use the uploaded name". file_name is never overwritten: the storage key is derived from it and the phone''s own name has to stay findable.';

COMMENT ON COLUMN public.job_files.tags IS
  'Free-text tags for filtering a job''s files. Lower-cased and de-duplicated by lib/files/labels.ts before it gets here, so a GIN containment lookup is exact rather than fuzzy.';

-- Containment (`tags @> ARRAY['monument']`) is the only query shape the filter uses, and GIN is the
-- index for it. On six rows this earns nothing; it is here so that the first job with four hundred
-- photos does not need a schema change on the day it becomes slow.
CREATE INDEX IF NOT EXISTS idx_job_files_tags ON public.job_files USING GIN (tags);

-- ── file_comments: the thread ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.file_comments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid,

  -- Which file this is about. Copied from the subject row rather than trusted from the client, so a
  -- comment can never be filed against a tenant the author cannot see.
  subject_type  text NOT NULL CHECK (subject_type IN ('job_file', 'field_media')),
  subject_id    uuid NOT NULL,

  body          text NOT NULL CHECK (btrim(body) <> ''),

  -- Email is the identity this platform actually has everywhere (`uploaded_by`, `created_by` on
  -- half these tables, the NextAuth session). `author_name` is denormalised on purpose: a comment
  -- read two years from now should still say who wrote it even if that person's account is gone.
  author_email  text NOT NULL,
  author_name   text,

  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  -- Distinct from `updated_at`, which any write touches. `edited_at` is non-null only when the
  -- BODY changed, because "edited" is a thing the reader of a thread is entitled to see.
  edited_at     timestamptz,
  -- Soft delete: a removed comment leaves a gap in a conversation, and a thread that silently
  -- re-numbers itself is how "but it said X" becomes unresolvable.
  deleted_at    timestamptz
);

COMMENT ON TABLE public.file_comments IS
  'Notes people leave on a file, photo or video, so it can be reviewed later. Polymorphic over job_files and field_media (see subject_type). Flat, not nested: this is a thread on one file, not a discussion board.';

-- The one query the thread makes: every live comment on this file, oldest first.
CREATE INDEX IF NOT EXISTS idx_file_comments_subject
  ON public.file_comments (subject_type, subject_id, created_at)
  WHERE deleted_at IS NULL;

-- "How many notes does each file have?" for the list badges, answered without reading bodies.
CREATE INDEX IF NOT EXISTS idx_file_comments_subject_live
  ON public.file_comments (subject_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_file_comments_author ON public.file_comments (author_email);

-- ── The documents bucket, raised to match the video bucket ─────────────────────────────────────
--
-- `starr-field-files` caps at 100 MB and `starr-field-videos` at 500 MB. The application has ONE
-- cap constant (`MAX_JOB_FILE_BYTES` === `MAX_JOB_VIDEO_BYTES`, both from
-- `NEXT_PUBLIC_MAX_UPLOAD_BYTES`), which is deliberate — seed 605 and commit de7fb1c2f exist
-- because this codebase previously believed three different numbers, none of which was the real
-- one, and a client cap LARGER than the server's spends every byte of a 375 MB upload before
-- anybody finds out it was refused.
--
-- So raising the app's cap to 500 MB without raising this bucket would recreate that exact defect
-- for every NON-video file: a 200 MB point cloud would transfer in full and be refused at 100%.
--
-- Seed 605 argued the 100 MB cap was "a real guard against somebody uploading a drone flight as
-- the survey". The guard that actually does that work is the video bucket's MIME allowlist, which
-- is untouched — a `.mp4` still cannot be parked in here. What the 100 MB number guards against is
-- large legitimate files: Trimble exports, point clouds and CAD deliverables, which is the reason
-- this table exists.
--
-- Both buckets now equal the app cap, and the app cap sits BELOW the Supabase project ceiling.
-- Every number in the chain matches, which is the property that was missing.
UPDATE storage.buckets
SET file_size_limit = 524288000   -- 500 MB, same as starr-field-videos
WHERE id = 'starr-field-files';

COMMIT;

-- ── RESOLVED 2026-08-22 — the note below is kept for its reasoning ──────────────────────────────
--
-- The owner raised the project ceiling to 2 GB, and 500 MB was then proven on both buckets by
-- transferring real bytes (202s and 199s). The app cap is 500 MB, set in lib/storage/uploads.ts.
-- Seed 608 brought the File Explorer's own bucket — which had never been created — to the same
-- number. Nothing below is outstanding; read it for WHY a bucket limit alone never mattered.
--
-- ── STILL REQUIRED, AND NOT DOABLE FROM SQL (as of 2026-08-19) ──────────────────────────────────
--
-- Supabase caps every upload at the PROJECT level and that ceiling overrides both buckets above.
-- It is currently 50 MB, so until it is raised in the dashboard (Storage → Settings → Upload file
-- size limit) these two `file_size_limit` values are ceilings that can never be reached — exactly
-- as seed 605's 500 MB was. A bucket limit can only ever be LOWER than the project ceiling.
--
-- Raise it to 1 GB, then set NEXT_PUBLIC_MAX_UPLOAD_BYTES=524288000 (500 MB). The app cap stays
-- deliberately below the project ceiling: that ordering is what makes an over-size file fail
-- INSTANTLY on the client instead of after a forty-minute transfer. See docs/BLOCKERS.md.

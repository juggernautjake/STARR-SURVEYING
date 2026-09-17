-- seeds/644_job_file_thumbnails.sql — a preview for the things that are not photographs
--
-- Owner, 2026-09-16: "we need to make it so that we can see the first page thumbnail and poster
-- frames for videos."
--
-- Spec: docs/planning/in-progress/interactive-property-map-2026-09-16.md
--
-- ── WHY THIS COLUMN EXISTS AT ALL ───────────────────────────────────────────────────────────────
--
-- The file panel beside the property map is a to-do list: what have I not placed on the map yet?
-- The first real job it met has twenty PDFs and two photographs, and a grid of twenty identical
-- document icons answers no question anybody has. A survey job's files are mostly PDFs — deeds,
-- plats, tax statements, field notes — and they are only telling apart by looking at them.
--
-- ── WHY THE BROWSER MAKES THEM, AND THE SERVER ONLY KEEPS THEM ──────────────────────────────────
--
-- A PDF's first page needs a PDF renderer and a video's poster frame needs a video decoder. This
-- platform runs on serverless functions with no ffmpeg and no poppler, and adding either to the
-- deployment to save a browser 200 ms of work is a bad trade. Meanwhile every browser that opens
-- this panel already has both: pdf.js is loaded by the file viewer, and a <video> element seeking
-- to 0.1 s and painting into a <canvas> is four lines.
--
-- So the FIRST browser to look at a file generates its preview and posts it here; every browser
-- after that is handed a signed URL. The work happens once, in the background, on a machine that
-- was idle anyway.
--
-- `thumb_state` is what stops that becoming a loop. A scanned PDF that pdf.js cannot open, a video
-- codec the browser will not decode, a file whose bytes have gone — each is recorded as `failed`
-- or `unsupported` so the next panel does not queue it again, forever, for everyone.

BEGIN;

ALTER TABLE public.job_files
  -- Where the preview lives, beside the file it previews.
  ADD COLUMN IF NOT EXISTS thumb_path text,
  ADD COLUMN IF NOT EXISTS thumb_bucket text,
  -- pending  : nobody has tried yet (also the state of every row written before today)
  -- ok       : thumb_path holds a preview
  -- failed   : generation was attempted and did not work — do not keep retrying
  -- unsupported: this kind never gets one (audio, a .dwg, a text file)
  ADD COLUMN IF NOT EXISTS thumb_state text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS thumb_updated_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'job_files_thumb_state_check') THEN
    ALTER TABLE public.job_files
      ADD CONSTRAINT job_files_thumb_state_check
      CHECK (thumb_state IN ('pending', 'ok', 'failed', 'unsupported'));
  END IF;
END $$;

COMMENT ON COLUMN public.job_files.thumb_state IS
  'Whether this file has a generated preview: pending (nobody has tried), ok, failed (tried, do not retry), unsupported (never will have one). Previews are made by the first browser to need one — the deployment has no PDF renderer or video decoder — and kept here so the work happens once. See seeds/644.';

-- The panel's question: which of this job's files still need a preview making?
CREATE INDEX IF NOT EXISTS idx_job_files_thumb_pending
  ON public.job_files (job_id) WHERE thumb_state = 'pending' AND is_deleted = false;

COMMIT;

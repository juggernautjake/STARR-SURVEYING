-- seeds/231_starr_field_video_thumbnails.sql
--
-- Server-side video thumbnail extraction (Batch GG).
--
-- Closes the F4 deferral *"server-side thumbnail extraction (FFmpeg
-- via worker) so the gallery thumbnail isn't a placeholder."*
--
-- The worker (`worker/src/services/video-thumbnail-extraction.ts`)
-- polls field_media rows where:
--   media_type = 'video'
-- AND upload_state = 'done'              (bytes are in storage)
-- AND thumbnail_extraction_status = 'queued'
-- For each, it downloads the video, runs ffmpeg to grab a frame at
-- ~1s in, uploads the JPEG to the photo bucket, and writes the
-- thumbnail's storage path back to thumbnail_url.
--
-- Mirrors the columns + state machine the receipt-extraction and
-- voice-transcription workers use. Status enum:
--     'queued'  → row is waiting for the next worker batch
--     'running' → a worker has claimed the row (race-safe via
--                 the same `claimRow` UPDATE pattern as receipts)
--     'done'    → thumbnail_url is populated; worker is finished
--     'failed'  → ffmpeg or upload failed; thumbnail_extraction_error
--                 carries a truncated reason. UI falls back to the
--                 placeholder glyph.
--
-- Idempotent: every ALTER + index guards on existence. Apply AFTER
-- seeds/221.

BEGIN;

ALTER TABLE field_media
  ADD COLUMN IF NOT EXISTS thumbnail_extraction_status        TEXT,
  ADD COLUMN IF NOT EXISTS thumbnail_extraction_error         TEXT,
  ADD COLUMN IF NOT EXISTS thumbnail_extraction_started_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS thumbnail_extraction_completed_at  TIMESTAMPTZ;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'field_media_thumbnail_extraction_status_chk'
  ) THEN
    ALTER TABLE field_media
      ADD CONSTRAINT field_media_thumbnail_extraction_status_chk
        CHECK (
          thumbnail_extraction_status IS NULL
          OR thumbnail_extraction_status IN
             ('queued','running','done','failed')
        );
  END IF;
END $$;

-- Partial index for the worker poll. Fires only on rows the worker
-- can actually claim — done/failed/null states are skipped.
CREATE INDEX IF NOT EXISTS idx_field_media_thumb_extract_queued
  ON field_media (created_at ASC)
  WHERE media_type = 'video'
    AND upload_state = 'done'
    AND thumbnail_extraction_status = 'queued';

-- Watchdog index: lets the worker re-queue rows whose claim went
-- stale (process killed mid-batch, container restart, etc).
CREATE INDEX IF NOT EXISTS idx_field_media_thumb_extract_running
  ON field_media (thumbnail_extraction_started_at)
  WHERE thumbnail_extraction_status = 'running';

COMMIT;

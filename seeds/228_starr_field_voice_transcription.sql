-- ============================================================================
-- 228_starr_field_voice_transcription.sql
-- Starr Field — voice memo transcription tracking columns + index.
--
-- Per F4 plan ("Voice memo + on-device transcription"). Server-side
-- Whisper via OpenAI handles the transcription job (cheaper + better-
-- quality than on-device for most accents in the field). Mirrors the
-- receipts.extraction_* pattern (seeds/220) so the worker write-back
-- + the mobile / admin UI surfaces are uniform.
--
-- Columns added to field_media (only when missing — idempotent):
--   transcription_status      'queued' | 'running' | 'done' | 'failed'
--   transcription_error       TEXT (truncated; populated on 'failed')
--   transcription_started_at  TIMESTAMPTZ (when worker claimed)
--   transcription_completed_at TIMESTAMPTZ
--   transcription_cost_cents  INTEGER (per-row spend for audit)
--
-- The existing `transcription` TEXT column (seeds/221) keeps holding
-- the actual transcript text on success.
--
-- Mobile inserts voice rows with transcription_status='queued' (set
-- in `lib/fieldMedia.ts useAttachVoice` going forward). Worker polls
-- for queued rows where upload_state='done', claims, transcribes,
-- writes back. Idempotent: re-running the worker on a 'done' row is
-- a no-op (the WHERE filter excludes done).
--
-- Apply order: AFTER seeds/221 (which created field_media + the
-- transcription column).
-- ============================================================================

BEGIN;

ALTER TABLE field_media
  ADD COLUMN IF NOT EXISTS transcription_status      TEXT,
  ADD COLUMN IF NOT EXISTS transcription_error       TEXT,
  ADD COLUMN IF NOT EXISTS transcription_started_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS transcription_completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS transcription_cost_cents  INTEGER;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'field_media_transcription_status_chk'
  ) THEN
    ALTER TABLE field_media
      ADD CONSTRAINT field_media_transcription_status_chk
        CHECK (
          transcription_status IS NULL
          OR transcription_status IN ('queued','running','done','failed')
        );
  END IF;
END $$;

-- Worker poll: "show me the next batch of queued voice memos
-- whose audio has finished uploading." Partial index keeps the hot
-- path tiny (most rows are 'done' or non-voice).
CREATE INDEX IF NOT EXISTS idx_field_media_transcription_queued
  ON field_media (created_at ASC)
  WHERE media_type = 'voice'
    AND upload_state = 'done'
    AND transcription_status = 'queued';

-- Watchdog: rows stuck in 'running' past the watchdog window get
-- re-queued by the worker via this lookup.
CREATE INDEX IF NOT EXISTS idx_field_media_transcription_running
  ON field_media (transcription_started_at)
  WHERE transcription_status = 'running';

COMMIT;

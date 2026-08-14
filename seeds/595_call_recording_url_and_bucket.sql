-- seeds/595_call_recording_url_and_bucket.sql — slice T1 of
-- docs/planning/completed/PHONE_CALLS_AND_VOICEMAIL_2026-08-14.md
--
-- Two things the recording copy needs that 594 did not anticipate.
--
-- ── provider_recording_url ──────────────────────────────────────────────────────────────────────
--
-- 594 stored only `recording_path`, our own copy. That is enough right up until a copy fails — and
-- then the call has a recording that exists at Twilio, a NULL path, and no way to find it again.
-- Keeping the provider's URL beside ours makes a failed copy retryable instead of lost, which is
-- the difference between a transient error and a permanently missing voicemail.
--
-- ── the bucket ──────────────────────────────────────────────────────────────────────────────────
--
-- Private, following the `starr-*` convention used by starr-field-voice and the receipt buckets.
-- Recordings are customers discussing their property and their money; they are served through
-- short-lived signed URLs to admins, never publicly.

BEGIN;

ALTER TABLE public.calls ADD COLUMN IF NOT EXISTS provider_recording_url TEXT;

COMMENT ON COLUMN public.calls.provider_recording_url IS
  'Twilio''s own URL for the recording. Kept so a failed copy into recording_path can be retried rather than lost.';

-- Rows whose audio exists at Twilio but was never copied — the retry queue.
CREATE INDEX IF NOT EXISTS calls_uncopied_recording_idx
  ON public.calls (started_at DESC)
  WHERE provider_recording_url IS NOT NULL AND recording_path IS NULL;

INSERT INTO storage.buckets (id, name, public)
VALUES ('starr-call-recordings', 'starr-call-recordings', false)
ON CONFLICT (id) DO NOTHING;

COMMIT;

-- Verification:
--   SELECT column_name FROM information_schema.columns
--     WHERE table_name='calls' AND column_name='provider_recording_url';   -- 1 row
--   SELECT id, public FROM storage.buckets WHERE id='starr-call-recordings';  -- public = false

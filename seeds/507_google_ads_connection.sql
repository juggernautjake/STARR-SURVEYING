-- ============================================================================
-- 507_google_ads_connection.sql
--
-- A8 of docs/planning/in-progress/LEAD_TO_CASH_ATTRIBUTION_AND_GOOGLE_ADS_2026-07-31.md.
-- (Doc claims 473; taken. Its seed numbers are stale.)
--
-- The storage the API path needs. Shipped NOW, inert until the credentials
-- arrive — per the owner's instruction to "make google integration prepared and
-- we will track our ad campaign tokens when we get them."
--
-- ── WHY MIRROR `google_calendar_connections` ────────────────────────────────
--
-- Because that pattern already works in this codebase. The plan says it
-- explicitly — *"copied from lib/integrations/google-calendar.ts; do not invent
-- a second one"* — and it is right: a second, subtly different OAuth token store
-- is two places to get refresh-expiry wrong, and the one that breaks is always
-- the one nobody has looked at for six months.
--
-- ── conversion_upload_log IS THE POINT OF THIS SLICE ────────────────────────
--
-- A conversion upload can fail in a way that looks exactly like success: Google
-- accepts the request, then rejects individual rows in a `partial_failure`
-- payload that nothing reads. Without a log per row, the symptom is "the numbers
-- in Ads are lower than ours" three weeks later, with nothing to inspect.
--
-- So every attempt is recorded with Google's OWN error text. The plan's phrasing
-- is worth keeping: *a silent failed upload is worse than no upload* — no upload
-- is a gap you can see.
--
-- `payload_hash` exists so a retry can tell "the same row again" from "the same
-- row, corrected". Re-sending an identical payload is a no-op worth skipping;
-- re-sending a corrected one is an adjustment that must go.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.google_ads_connections (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Who authorised it. One row per Ads account, keyed by the customer id.
  customer_id        TEXT NOT NULL UNIQUE,
  login_customer_id  TEXT,          -- set when the account sits under an MCC
  user_email         TEXT NOT NULL,
  access_token       TEXT,
  refresh_token      TEXT,
  token_expires_at   TIMESTAMPTZ,
  scope              TEXT,
  -- Null until the first successful upload. A connection that has never uploaded
  -- is a different state from one that uploaded and then started failing, and
  -- the admin screen must be able to tell them apart.
  last_uploaded_at   TIMESTAMPTZ,
  last_error         TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.google_ads_connections IS
  'OAuth tokens for the Google Ads API, mirroring google_calendar_connections deliberately — a second, subtly different token store is two places to get refresh-expiry wrong.';

CREATE TABLE IF NOT EXISTS public.conversion_upload_log (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id          UUID REFERENCES public.lead_lifecycle_events(id) ON DELETE SET NULL,
  conversion_action TEXT NOT NULL,
  -- Distinguishes "the same row again" from "the same row, corrected" on a retry.
  payload_hash      TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','uploaded','failed','skipped')),
  -- GOOGLE'S OWN WORDS, not ours. A paraphrased error is a support ticket.
  error_code        TEXT,
  error_detail      TEXT,
  attempts          INTEGER NOT NULL DEFAULT 0,
  uploaded_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.conversion_upload_log IS
  'One row per upload ATTEMPT, with Google''s own error text. Without it, a partial_failure rejection looks exactly like success and surfaces three weeks later as "the numbers in Ads are lower than ours" with nothing to inspect. A silent failed upload is worse than no upload.';
COMMENT ON COLUMN public.conversion_upload_log.payload_hash IS
  'Lets a retry tell "the same row again" (skip) from "the same row, corrected" (send as an adjustment).';

CREATE INDEX IF NOT EXISTS idx_upload_log_event ON public.conversion_upload_log(event_id) WHERE event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_upload_log_failed ON public.conversion_upload_log(created_at DESC) WHERE status = 'failed';
CREATE INDEX IF NOT EXISTS idx_upload_log_pending ON public.conversion_upload_log(created_at) WHERE status = 'pending';

COMMIT;

-- Verification:
--   SELECT count(*) FROM public.google_ads_connections;  -- 0 until the owner connects an account
--   SELECT count(*) FROM public.conversion_upload_log;   -- 0

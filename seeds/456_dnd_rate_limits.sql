-- seeds/456_dnd_rate_limits.sql — a rate-limit counter, because there is currently no throttling at all.
--
-- THE FINDING (audit F-1, the top security item once F-4 turned out to be already fixed): nothing in
-- `app/api/dnd` or `lib/dnd` implements throttling, quotas or a 429. The only `429` in the tree is in the
-- Anthropic client's RETRY logic — i.e. we back off when *they* throttle *us*. Nine routes reach a paid
-- model, and anyone can obtain an account with a four-character name and a four-character password and then
-- call them in a loop. There is no per-user budget and no kill switch short of unsetting the API key.
--
-- WHY POSTGRES AND NOT AN IN-MEMORY MAP. The obvious implementation is a `Map` in module scope. On
-- serverless that is worth roughly nothing: every cold start gets a fresh map, concurrent instances each
-- keep their own, and the effective limit becomes `limit × instances` — which looks like it works in
-- development and does not in production. A shared counter has to live somewhere shared.
--
-- FIXED WINDOW, not a sliding log. A sliding window needs one row per request and a range scan to count
-- them; a fixed window needs one row per (bucket, subject, window) and a single UPSERT. The cost is a
-- burst at a window boundary — up to 2× the limit across two adjacent windows. For "stop someone looping an
-- expensive endpoint" that is entirely acceptable, and it keeps the hot path to one statement.
BEGIN;

CREATE TABLE IF NOT EXISTS dnd_rate_limits (
  -- What is being limited ('ai', 'login', 'write'), from `RATE_LIMIT_BUCKETS` in lib/dnd/rate-limit.ts.
  bucket        text NOT NULL,
  -- WHO: normally 'user:<uuid>'; 'ip:<addr>' for unauthenticated routes like login, where there is no user
  -- yet and the address is the only thing to key on.
  subject       text NOT NULL,
  -- The window's start, truncated to the bucket's size. Part of the key, so a new window is a new row and
  -- expiry is "the row is old" rather than a reset job that has to run.
  window_start  timestamptz NOT NULL,
  count         integer NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket, subject, window_start)
);

ALTER TABLE dnd_rate_limits ENABLE ROW LEVEL SECURITY;

-- Sweeping old windows. Not a TTL and not a cron: the check itself deletes rows older than a day
-- opportunistically, so the table stays small without needing a scheduler that could silently stop running.
CREATE INDEX IF NOT EXISTS idx_dnd_rate_limits_window
  ON dnd_rate_limits (window_start);

COMMENT ON TABLE dnd_rate_limits IS
  'Fixed-window request counters. Shared storage rather than an in-memory map because on serverless a module-scope Map makes the effective limit (limit × instances) — it appears to work in development and does not in production.';
COMMENT ON COLUMN dnd_rate_limits.subject IS
  'user:<uuid>, or ip:<addr> for routes with no authenticated caller yet (login).';

COMMIT;

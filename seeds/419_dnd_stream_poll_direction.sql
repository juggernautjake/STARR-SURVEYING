-- seeds/419_dnd_stream_poll_direction.sql — DM-directed stream polls.
--
-- The original poll (seed 410) auto-resolved with a random client sim. This upgrades it to
-- the "streamer proposes, DM decides" flow:
--   • Susie (the streamer/owner) creates a poll from her chat box → status 'pending'.
--   • Andrew (the DM) sets each option's percentage with sliders (summing to 100), the total
--     vote count is scaled from the live viewer count (≥25% turnout), and he submits →
--     status 'open', opened_at = now. Votes then trickle in over ~60s, client-interpolated
--     from opened_at so every viewer sees the same fill. Highest percentage wins.
--   • After the minute the controller marks it 'closed'.
-- Additive + idempotent — safe to re-run.

-- Widen the status check to allow the new 'pending' (awaiting the DM's call) stage.
ALTER TABLE dnd_stream_polls DROP CONSTRAINT IF EXISTS dnd_stream_polls_status_check;
ALTER TABLE dnd_stream_polls
  ADD CONSTRAINT dnd_stream_polls_status_check CHECK (status IN ('pending','open','closed'));

ALTER TABLE dnd_stream_polls
  -- { [optionLabel]: percent } the DM dialed in (0..100, summing to 100).
  ADD COLUMN IF NOT EXISTS target_percentages jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Total votes cast, scaled from the viewer count at submit time. bigint for vanity-scale
  -- viewer counts (billions/quadrillions); capped under 2^53 by the API so it round-trips.
  ADD COLUMN IF NOT EXISTS total_votes bigint NOT NULL DEFAULT 0,
  -- When the DM submitted — the anchor for the 60-second vote trickle + auto-conclude.
  ADD COLUMN IF NOT EXISTS opened_at timestamptz;

-- The API always reads the newest poll for a character; back the ordering with an index.
CREATE INDEX IF NOT EXISTS idx_dnd_stream_polls_char
  ON dnd_stream_polls (character_id, created_at DESC);

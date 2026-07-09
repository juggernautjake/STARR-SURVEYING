-- seeds/418_dnd_suggestions.sql — the /dnd suggestion box (Phase T).
--
-- A single collection where anyone on the hidden hub can drop a tip, feature request, or
-- quality-of-life idea (a player wanting a build/item/mechanic, a DM wanting a campaign
-- setup, etc). The submit field lives in the site footer on every /dnd page; the review
-- page (/dnd/suggestions) lists them all so they can be read, copied, and deleted.
-- Idempotent.
CREATE TABLE IF NOT EXISTS dnd_suggestions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  body         text NOT NULL,
  -- Optional signer + which /dnd page it came from (for context when reviewing).
  author_name  text,
  page_path    text,
  user_id      uuid REFERENCES dnd_users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE dnd_suggestions ENABLE ROW LEVEL SECURITY; -- service role (app code) bypasses.
CREATE INDEX IF NOT EXISTS idx_dnd_suggestions_created ON dnd_suggestions (created_at DESC);

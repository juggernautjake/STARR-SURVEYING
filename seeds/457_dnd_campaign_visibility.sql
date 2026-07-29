-- seeds/457_dnd_campaign_visibility.sql — campaigns can be hidden, archived and deleted (P2-5, audit D-2).
--
-- THE FINDING. `loadAllCampaignSummaries()` selects EVERY row of `dnd_campaigns` — no visibility filter, no
-- pagination, no recency ordering — and returns the DM's name, every player's name and every character's
-- name. In open-access mode (the default) that renders to anyone who opens `/dnd`. Compounding it,
-- `dnd_campaigns` had no visibility or archive column and `/api/dnd/campaigns/[id]` exposed only GET and
-- PATCH: **a campaign, once created, could never be removed or hidden by anyone.** Every abandoned test
-- table was permanent public furniture.
--
-- BACKFILL DECISION, and it is the interesting one. Existing campaigns are set to **'unlisted'**, not
-- 'public'.
--
--   · Backfilling to 'public' would preserve the exact leak this migration exists to close, which makes the
--     migration decorative.
--   · 'unlisted' is NOT destructive: every existing link keeps working, nothing is hidden from members, and
--     the campaign is unchanged in every way except that strangers stop seeing its roster on a public index.
--     A DM who wants it listed clicks once.
--
-- That is the same shape as seed 454's reasoning about character art: choose the direction that is
-- recoverable in one click, and never the one that leaves data exposed that nobody chose to expose.
--
-- New campaigns also default to 'unlisted' — private-by-default, opt in to being listed.
BEGIN;

ALTER TABLE dnd_campaigns
  ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'unlisted',
  -- Soft delete. A campaign holds sessions, recaps, roll history and a roster; dropping the row cascades
  -- through all of it, so "delete" archives first and the hard delete is a separate, deliberate act.
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

ALTER TABLE dnd_campaigns
  DROP CONSTRAINT IF EXISTS dnd_campaigns_visibility_valid;
ALTER TABLE dnd_campaigns
  ADD CONSTRAINT dnd_campaigns_visibility_valid
  CHECK (visibility IN ('public', 'unlisted', 'private'));

-- Every campaign that already existed becomes unlisted — see the backfill note above. Explicitly scoped to
-- rows that still hold the column default, so re-running this never overwrites a DM's later choice.
UPDATE dnd_campaigns SET visibility = 'unlisted' WHERE visibility IS NULL;

-- The public index reads exactly this pair, ordered by recency.
CREATE INDEX IF NOT EXISTS idx_dnd_campaigns_public
  ON dnd_campaigns (visibility, created_at DESC)
  WHERE archived_at IS NULL;

COMMENT ON COLUMN dnd_campaigns.visibility IS
  'public = listed on /dnd for anyone; unlisted = reachable by link, never listed; private = members only. Existing campaigns were backfilled to unlisted rather than public, because backfilling to public would preserve the leak this column exists to close.';
COMMENT ON COLUMN dnd_campaigns.archived_at IS
  'Soft delete. A campaign cascades to sessions, recaps, rolls and the roster, so removing one archives first; the hard delete is a separate deliberate act.';

COMMIT;

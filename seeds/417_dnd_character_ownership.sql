-- seeds/417_dnd_character_ownership.sql — character ownership + multi-campaign (Phase S).
--
-- New model: a character is OWNED by whoever created it (owner_user_id, permanent). The
-- owner can let someone else PLAY it (played_by_user_id) without giving up ownership. And
-- a character can live in MULTIPLE campaigns via the dnd_campaign_characters join table —
-- dnd_characters.campaign_id stays as the character's "home" campaign for back-compat.
-- This replaces the old "claim" mechanic (claimable column kept but unused). Idempotent.

-- Who currently plays the character (null = the owner plays it themselves).
ALTER TABLE dnd_characters
  ADD COLUMN IF NOT EXISTS played_by_user_id uuid REFERENCES dnd_users(id) ON DELETE SET NULL;

-- The roster join: which campaigns a character is in.
CREATE TABLE IF NOT EXISTS dnd_campaign_characters (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id  uuid NOT NULL REFERENCES dnd_campaigns(id) ON DELETE CASCADE,
  character_id uuid NOT NULL REFERENCES dnd_characters(id) ON DELETE CASCADE,
  added_by     uuid REFERENCES dnd_users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, character_id)
);
ALTER TABLE dnd_campaign_characters ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_dnd_cc_campaign ON dnd_campaign_characters (campaign_id);
CREATE INDEX IF NOT EXISTS idx_dnd_cc_character ON dnd_campaign_characters (character_id);

-- Backfill a join row for every character that already belongs to a campaign.
INSERT INTO dnd_campaign_characters (campaign_id, character_id, added_by)
SELECT campaign_id, id, owner_user_id FROM dnd_characters WHERE campaign_id IS NOT NULL
ON CONFLICT (campaign_id, character_id) DO NOTHING;

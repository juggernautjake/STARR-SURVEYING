-- seeds/415_dnd_claimable_characters.sql — claimable characters (Phase Q).
--
-- A DM can mark any character (including an NPC they built) as `claimable`, letting a
-- player in the campaign take it over and play as it. Unclaimed characters (owner_user_id
-- IS NULL) are also claimable. On claim the character becomes the player's private PC
-- (owner set, is_npc=false, claimable back to false). Additive + idempotent.
ALTER TABLE dnd_characters
  ADD COLUMN IF NOT EXISTS claimable boolean NOT NULL DEFAULT false;

-- Fast lookup of the claim pool in a campaign (claimable, or ownerless).
CREATE INDEX IF NOT EXISTS idx_dnd_characters_claimable
  ON dnd_characters (campaign_id)
  WHERE claimable = true OR owner_user_id IS NULL;

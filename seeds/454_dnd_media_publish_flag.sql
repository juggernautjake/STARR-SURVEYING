-- seeds/454_dnd_media_publish_flag.sql — character art no longer auto-publishes to the campaign gallery.
--
-- Owner report 2026-07-20: a player uploading art to their character sheet found it appear in the
-- MAIN CAMPAIGN GALLERY without asking. The character-media upload route stamps `campaign_id` on
-- the row so the image is scoped to the right campaign, and the campaign gallery reads every row
-- with that campaign_id — so scoping and publishing were the same thing.
--
-- This splits them. `published_to_campaign` is the deliberate act of putting an image in the shared
-- gallery; `campaign_id` stays what it always was, the scope the image belongs to.
--
-- BACKFILL DECISION: existing character art is set to NOT published. That is the owner's stated
-- intent ("should not necessarily appear in the main campaign gallery") and it is the safe
-- direction — un-publishing something that was visible is recoverable in one click, whereas
-- leaving art published that the player never chose to share is the complaint being fixed.
-- Campaign-level uploads (character_id IS NULL) are the DM's own gallery images and stay visible.
BEGIN;

ALTER TABLE dnd_media
  ADD COLUMN IF NOT EXISTS published_to_campaign BOOLEAN NOT NULL DEFAULT FALSE;

-- Campaign-level media (no character) IS the campaign gallery — it was never character art.
UPDATE dnd_media
   SET published_to_campaign = TRUE
 WHERE character_id IS NULL
   AND campaign_id IS NOT NULL
   AND published_to_campaign = FALSE;

-- The campaign gallery reads this; index the pair it filters on.
CREATE INDEX IF NOT EXISTS idx_dnd_media_campaign_published
  ON dnd_media (campaign_id, published_to_campaign)
  WHERE campaign_id IS NOT NULL;

COMMENT ON COLUMN dnd_media.published_to_campaign IS
  'Whether this image appears in the campaign gallery. Character art defaults FALSE — it lives on the character''s own gallery until the owner or DM publishes it. Set TRUE for campaign-level uploads. See DND_2024_COMPLETE_LIBRARY_2026-07-20 S1.';

COMMIT;

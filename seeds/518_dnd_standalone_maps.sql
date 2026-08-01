-- seeds/518_dnd_standalone_maps.sql — a map can exist without a campaign (owner request 2026-08-01).
--
-- Owner's words: *"User's should be able to build and save maps independently of a campaign."*
--
-- Seed 421 made `campaign_id NOT NULL`, which encoded a stronger claim than the product needed: that a
-- map only means something inside a campaign. In practice a DM builds a system map before deciding which
-- table it belongs to, and a player who is not running anything still wants the Studio. The nav has said
-- so the whole time — the header's "＋ Map" pointed at `/dnd?new=map`, a query nothing has ever read.
--
-- ── OWNERSHIP HAS TO SURVIVE, SO created_by CANNOT STAY "SET NULL" ─────────────────────────────────
--
-- With a campaign, authorization is the campaign's: `getCampaignRole()` answers who may read or write.
-- Without one, the only fact that answers it is who made the map. `created_by` already existed but was
-- `ON DELETE SET NULL`, which is right for a campaign map (the campaign still owns it after the DM's
-- account goes) and catastrophic for a personal one: the row becomes unreadable and undeletable by
-- anyone, forever, while still counting against storage.
--
-- So a standalone map gets `owner_id` with `ON DELETE CASCADE`, and a CHECK asserts that every row has
-- at least one of the two owners. A row with neither is a row no permission check can decide on, and the
-- only safe answer for such a row would be to hide it from everybody — which is a leak in the other
-- direction: data nobody can reach and nobody can delete.
--
-- Idempotent.

ALTER TABLE dnd_maps ALTER COLUMN campaign_id DROP NOT NULL;

ALTER TABLE dnd_maps ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES dnd_users(id) ON DELETE CASCADE;

-- Backfill: every existing row is a campaign map, so none of them need an owner. Stated rather than
-- assumed — if a future row arrives with neither, the constraint below refuses it at write time.
UPDATE dnd_maps SET owner_id = NULL WHERE campaign_id IS NOT NULL AND owner_id IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dnd_maps_has_an_owner') THEN
    ALTER TABLE dnd_maps
      ADD CONSTRAINT dnd_maps_has_an_owner
      CHECK (campaign_id IS NOT NULL OR owner_id IS NOT NULL);
  END IF;
END $$;

-- The personal library's only query: "my maps, newest first". Partial, because campaign maps are ~all of
-- the table today and indexing them here would be dead weight on every campaign-map write.
CREATE INDEX IF NOT EXISTS idx_dnd_maps_owner
  ON dnd_maps (owner_id, updated_at DESC)
  WHERE campaign_id IS NULL;

COMMENT ON COLUMN dnd_maps.owner_id IS
  'The dnd_user who owns a STANDALONE map (campaign_id IS NULL). Campaign maps leave this null and are '
  'authorized by campaign membership instead. CASCADE, not SET NULL: a personal map with no owner is a '
  'row no permission check can decide on.';

COMMENT ON COLUMN dnd_maps.campaign_id IS
  'The campaign this map belongs to, or NULL for a standalone map in its owner''s personal library. '
  'A standalone map can be copied into a campaign later; the copy is a new row.';

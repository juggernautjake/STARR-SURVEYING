-- seeds/448_dnd_roster_role.sql — a character's ROSTER category (Slice 30).
--
-- The DM wants three editorial buckets: player characters, special NPCs (named, statted, recurring),
-- and generic NPCs (the guard, the shopkeep). This is EDITORIAL, not mechanical — a generic NPC is
-- the same character on the same engine, just triaged differently — so "promote a generic NPC to
-- special" is a one-column update, never a rebuild.
--
-- Existing rows are seeded from the pre-existing is_npc flag: a PC if is_npc is false, otherwise a
-- generic NPC (the DM re-tags the few that are special). Idempotent; default 'pc'.
ALTER TABLE dnd_characters ADD COLUMN IF NOT EXISTS roster_role text NOT NULL DEFAULT 'pc';

-- Backfill from is_npc, but only rows still sitting at the default (so a later deliberate
-- categorisation is never stomped by a re-run).
UPDATE dnd_characters
SET roster_role = CASE WHEN is_npc THEN 'generic_npc' ELSE 'pc' END
WHERE roster_role = 'pc' AND is_npc IS TRUE;

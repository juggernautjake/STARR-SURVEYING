-- seeds/447_dnd_campaign_system.sql — a campaign declares its game SYSTEM (Slice 38a).
--
-- A campaign is run in one rulebook, and that choice drives everything downstream: which builder a
-- new character uses, and — the point of Slice 38 — whether a character brought in from another
-- system needs translating. Until now only CHARACTERS carried a system (seed 422); the campaign
-- itself had none, so "the campaign's system" had nowhere to live.
--
-- Keys match lib/dnd/systems.ts GAME_SYSTEMS. Default 'ambiguous' so existing campaigns are
-- unchanged and the DM picks explicitly. Idempotent.
ALTER TABLE dnd_campaigns ADD COLUMN IF NOT EXISTS system text NOT NULL DEFAULT 'ambiguous';

-- The Neon Odyssey demo campaign runs D&D 5e (2024), matching its characters (seed 446).
UPDATE dnd_campaigns
SET system = 'dnd5e-2024'
WHERE id = '1a2200aa-0000-4000-8000-0000000000c1' AND system = 'ambiguous';

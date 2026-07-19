-- seeds/451_campaign_character_override.sql — the isolated in-campaign character copy (owner 2026-07-18).
--
-- A character's ORIGINAL sheet lives in dnd_characters.data (the creator's canonical copy). A campaign holds
-- an OPTIONAL override of that sheet on the roster join row: while null, the campaign shows the original; the
-- first DM edit inside the campaign forks a deep copy into `data_override`, and thereafter the campaign renders
-- + edits ONLY that copy (the original is untouched and stays with the creator). The creator may later promote
-- the override back over their original. See lib/dnd/campaign-character-copy.ts + lib/dnd/character-visibility.ts.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS (the jobs/campaign tables are live-only, altered in place).
ALTER TABLE dnd_campaign_characters
  ADD COLUMN IF NOT EXISTS data_override JSONB;

-- Who last touched the campaign copy + when, for the roster to show "edited by the DM" and for promote to
-- reason about staleness. Both nullable — an un-forked character has neither.
ALTER TABLE dnd_campaign_characters
  ADD COLUMN IF NOT EXISTS override_updated_at TIMESTAMPTZ;
ALTER TABLE dnd_campaign_characters
  ADD COLUMN IF NOT EXISTS override_updated_by UUID;

COMMENT ON COLUMN dnd_campaign_characters.data_override IS
  'The isolated in-campaign copy of the character sheet (null = show the original). Forked on the first DM edit; the original stays with the creator.';

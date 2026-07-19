-- seeds/453_characters_public_by_default.sql — characters are PUBLIC by default (owner 2026-07-18: "make all
-- profiles public by default and have to be made private in the preferences"). Public = anyone at the table can
-- VIEW the sheet (they still can't edit it — see resolveCharacterAccess); the owner opts INTO private via the
-- sheet's visibility toggle. NPCs stay private (DM tools, not player profiles). Idempotent.
ALTER TABLE dnd_characters ALTER COLUMN visibility SET DEFAULT 'public';

-- Bring existing PLAYER characters (not NPCs) up to the new default so a fellow player can open them — this is
-- what was bouncing Jacob to /dnd when he clicked Jack's (private) character. NPCs are left as-is.
UPDATE dnd_characters SET visibility = 'public'
  WHERE visibility <> 'public' AND COALESCE(is_npc, false) = false;

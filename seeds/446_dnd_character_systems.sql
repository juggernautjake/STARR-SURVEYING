-- seeds/446_dnd_character_systems.sql — give the demo characters a real system designation.
--
-- Why this matters (Slice 21): the AI librarian grounds every answer in the character's system
-- (app/api/dnd/library/chat/route.ts). A character whose `system` is 'ambiguous' gets the
-- edition-neutral prompt — "pick a system and the answers get specific" — on the very sheets the
-- librarian should be most useful on. Jack was already 'dnd5e-2024' and adjudicates correctly;
-- the other four were not, and that is the whole difference.
--
-- THE POINT WORTH REMEMBERING: a system designation and homebrew are ORTHOGONAL. These sheets are
-- heavily customized — Jack's Rangor/Pugilist, Lazzuh's transformation kit, the streamer sheets —
-- and they stay exactly as they are. The system says WHICH RULEBOOK ADJUDICATES; provenance
-- (summarizeCharacterProvenance) says which parts are house-ruled. Marking a customized sheet
-- 'ambiguous' does not make it "honest about being homebrew" — it just deprives the AI of the
-- rulebook it needs to reason about the other 90% of the sheet.
--
-- Keys MUST match lib/dnd/systems.ts GAME_SYSTEMS ('dnd5e-2024', not 'dnd-5e-2024').
-- Idempotent: only touches rows still sitting at 'ambiguous', so a later deliberate change to
-- another system is never stomped by a re-run.
UPDATE dnd_characters
SET system = 'dnd5e-2024'
WHERE system IS NULL OR system = 'ambiguous';

-- Verify: every character now names the rulebook that adjudicates it.
DO $$
DECLARE n INT;
BEGIN
  SELECT COUNT(*) INTO n FROM dnd_characters WHERE system IS NULL OR system = 'ambiguous';
  IF n > 0 THEN
    RAISE WARNING 'seeds/446: % character(s) still have no system designation', n;
  END IF;
END $$;

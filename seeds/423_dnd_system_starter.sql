-- seeds/423_dnd_system_starter.sql — a tiny, generic starter set of rules entries per seeded system
-- so the browse UI + scoped retrieval work end-to-end before full curation. These are basic,
-- edition-generic concepts (kept short and non-verbatim). Embeddings are NULL here; a keyed backfill
-- embeds them for semantic search. Idempotent: skips an entry that already exists for the system.

-- Helper insert: add (kind,name,body,source) to a system by key only if that name isn't already there.
DO $$
DECLARE
  rec record;
  sid uuid;
BEGIN
  FOR rec IN
    SELECT * FROM (VALUES
      ('dnd5e-2014','rule','Proficiency Bonus','A bonus tied to level, added to attacks, saves and skills you are proficient in. It scales up as you gain levels.','PHB 2014'),
      ('dnd5e-2014','rule','Advantage and Disadvantage','Roll two d20 and take the higher (advantage) or lower (disadvantage); they do not stack and cancel each other out.','PHB 2014'),
      ('dnd5e-2014','condition','Prone','A prone creature''s only movement option is to crawl; attackers within 5 ft have advantage, ranged attacks against it have disadvantage.','PHB 2014'),
      ('dnd5e-2024','rule','Proficiency Bonus','A level-based bonus added to your proficient rolls; the 2024 revision keeps the same progression as 2014.','PHB 2024'),
      ('dnd5e-2024','rule','Weapon Mastery','2024 martial characters gain mastery properties (e.g. Cleave, Push, Vex) on weapons they know how to use.','PHB 2024'),
      ('dnd5e-2024','condition','Exhaustion','2024 exhaustion is a single stacking penalty: each level subtracts from d20 tests and reduces speed, removed by long rests.','PHB 2024'),
      ('pathfinder2e','rule','Three-Action Economy','On your turn you have three actions (plus one reaction); most activities cost one to three actions.','Player Core'),
      ('pathfinder2e','rule','Proficiency Ranks','Proficiency is a rank — untrained, trained, expert, master, legendary — each adding a bigger bonus plus your level.','Player Core'),
      ('pathfinder2e','condition','Flat-Footed / Off-Guard','An off-guard creature takes a -2 circumstance penalty to AC; many effects (flanking, being unaware) impose it.','Player Core')
    ) AS t(system_key, kind, name, body, source)
  LOOP
    SELECT id INTO sid FROM dnd_systems WHERE key = rec.system_key;
    IF sid IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM dnd_system_entries e WHERE e.system_id = sid AND lower(e.name) = lower(rec.name)
    ) THEN
      INSERT INTO dnd_system_entries (system_id, kind, name, body, source)
      VALUES (sid, rec.kind, rec.name, rec.body, rec.source);
    END IF;
  END LOOP;
END $$;

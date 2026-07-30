-- seeds/464_dnd_bestiary_first_creatures.sql — the first three creatures in the catalogue (B1-1/B1-2).
--
-- WHY THREE AND NOT THREE HUNDRED. `dnd_creatures` has existed with zero rows and no page for weeks, which is why
-- the plan puts the PAGE before the CONTENT: three creatures on a real surface tell you whether the taxonomy, the
-- filters, the aura derivation and the stat block layout are right, and nine hundred rows behind no surface tell you
-- nothing at all. The bulk import (slice B1-3) fills the catalogue; this makes the surface verifiable.
--
-- THESE THREE, SPECIFICALLY, because they exercise different code paths rather than because they were the first
-- three to hand:
--   * Goblin — a humanoid with two attacks, so the stat block's roll controls appear twice and the `folklore` name
--     rule fires.
--   * Zombie — the owner's own aura example ("a green stench kind of effect"), and the `undead` type. Also carries
--     damage and condition immunities, which are separate lines in the printed form and separate fields in ours.
--   * Wolf — a beast the `woodland` and `companion` name rules both match, so the multi-tag path is covered, and its
--     bite has a rider ("DC 11 Strength saving throw") that must survive as prose rather than being parsed.
--
-- LICENCE. All three are from the D&D 5.1 System Reference Document, released by Wizards of the Coast under
-- CC-BY-4.0. `source`, `licence` and `attribution` are NOT NULL on this table precisely so that content cannot be
-- catalogued without the attribution the licence requires, and the creature page prints it.
--
-- The `tags` and `variant_eligible` values here are what `deriveCreature` produces for these rows. They are stored
-- rather than computed at read time because the taxonomy is deliberately re-derivable in bulk: re-running the import
-- rewrites them, which is what makes "I disagree that an owlbear is woodland" a one-line change rather than a
-- data-entry project.
BEGIN;

INSERT INTO dnd_creatures (slug, name, system, type, size, alignment, cr, cr_sort, description, tags, environments, source, licence, attribution, source_url, variant_eligible, statblock)
VALUES
  (
    'srd51:goblin', 'Goblin', 'dnd5e-2014', 'humanoid', 'Small', 'neutral evil', '1/4', 0.25,
    'Small, black-hearted humanoids that lair in caves, abandoned mines and despoiled dungeons. They gather in overwhelming numbers and fight with cowardly cunning.',
    ARRAY['folklore'], ARRAY['caves', 'forest', 'ruins'],
    'SRD 5.1', 'CC-BY-4.0', 'This work includes material from the System Reference Document 5.1 by Wizards of the Coast LLC, available under the Creative Commons Attribution 4.0 International License.',
    'https://dnd.wizards.com/resources/systems-reference-document', false,
    '{
      "ac": 15, "acNote": "leather armor, shield", "hp": 7, "hitDice": "2d6", "speed": "30 ft.",
      "abilities": { "str": 8, "dex": 14, "con": 10, "int": 10, "wis": 8, "cha": 8 },
      "skills": "Stealth +6",
      "senses": "darkvision 60 ft., passive Perception 9",
      "languages": "Common, Goblin",
      "cr": "1/4", "xp": 50,
      "entries": [
        { "kind": "trait", "name": "Nimble Escape.", "body": "The goblin can take the Disengage or Hide action as a bonus action on each of its turns." },
        { "kind": "action", "name": "Scimitar.", "body": "Melee Weapon Attack: reach 5 ft., one target. Hit: 5 (1d6 + 2) slashing damage.", "toHit": "+4", "damage": "1d6 + 2" },
        { "kind": "action", "name": "Shortbow.", "body": "Ranged Weapon Attack: range 80/320 ft., one target. Hit: 5 (1d6 + 2) piercing damage.", "toHit": "+4", "damage": "1d6 + 2" }
      ]
    }'::jsonb
  ),
  (
    'srd51:zombie', 'Zombie', 'dnd5e-2014', 'undead', 'Medium', 'neutral evil', '1/4', 0.25,
    'A shambling corpse animated by dark magic. It moves with a terrible, single-minded slowness and keeps coming long after any living thing would have fallen.',
    ARRAY['undead'], ARRAY['crypts', 'ruins', 'swamp'],
    'SRD 5.1', 'CC-BY-4.0', 'This work includes material from the System Reference Document 5.1 by Wizards of the Coast LLC, available under the Creative Commons Attribution 4.0 International License.',
    'https://dnd.wizards.com/resources/systems-reference-document', false,
    '{
      "ac": 8, "hp": 22, "hitDice": "3d8 + 9", "speed": "20 ft.",
      "abilities": { "str": 13, "dex": 6, "con": 16, "int": 3, "wis": 6, "cha": 5 },
      "saves": "WIS +0",
      "immunities": "poison",
      "conditionImmunities": "poisoned",
      "senses": "darkvision 60 ft., passive Perception 8",
      "languages": "understands the languages it knew in life but can''t speak",
      "cr": "1/4", "xp": 50,
      "entries": [
        { "kind": "trait", "name": "Undead Fortitude.", "body": "If damage reduces the zombie to 0 hit points, it must make a Constitution saving throw with a DC of 5 + the damage taken, unless the damage is radiant or from a critical hit. On a success, the zombie drops to 1 hit point instead." },
        { "kind": "action", "name": "Slam.", "body": "Melee Weapon Attack: reach 5 ft., one target. Hit: 4 (1d6 + 1) bludgeoning damage.", "toHit": "+3", "damage": "1d6 + 1" }
      ]
    }'::jsonb
  ),
  (
    'srd51:wolf', 'Wolf', 'dnd5e-2014', 'beast', 'Medium', 'unaligned', '1/4', 0.25,
    'A pack hunter of forest and tundra, dangerous less for its bite than for the certainty that it is not hunting alone.',
    ARRAY['woodland', 'companion'], ARRAY['forest', 'grassland', 'hill'],
    'SRD 5.1', 'CC-BY-4.0', 'This work includes material from the System Reference Document 5.1 by Wizards of the Coast LLC, available under the Creative Commons Attribution 4.0 International License.',
    'https://dnd.wizards.com/resources/systems-reference-document', false,
    '{
      "ac": 13, "acNote": "natural armor", "hp": 11, "hitDice": "2d8 + 2", "speed": "40 ft.",
      "abilities": { "str": 12, "dex": 15, "con": 12, "int": 3, "wis": 12, "cha": 6 },
      "skills": "Perception +3, Stealth +4",
      "senses": "passive Perception 13",
      "cr": "1/4", "xp": 50,
      "entries": [
        { "kind": "trait", "name": "Keen Hearing and Smell.", "body": "The wolf has advantage on Wisdom (Perception) checks that rely on hearing or smell." },
        { "kind": "trait", "name": "Pack Tactics.", "body": "The wolf has advantage on an attack roll against a creature if at least one of the wolf''s allies is within 5 feet of the creature and the ally isn''t incapacitated." },
        { "kind": "action", "name": "Bite.", "body": "Melee Weapon Attack: reach 5 ft., one target. Hit: 7 (2d4 + 2) piercing damage. If the target is a creature, it must succeed on a DC 11 Strength saving throw or be knocked prone.", "toHit": "+4", "damage": "2d4 + 2" }
      ]
    }'::jsonb
  )
-- (slug, system) — the table's actual unique constraint (`dnd_creatures_slug_system_unique`), because the
-- same creature legitimately exists once per system: B4 transposes a 5e creature into PF2 and IG, and a
-- bare `(slug)` would make the second of those a conflict rather than a new row. `ON CONFLICT (slug)` does
-- not merely mis-target here, it ABORTS — Postgres rejects an inference clause that matches no constraint,
-- so the seed failed outright on a fresh database rather than silently mis-upserting.
ON CONFLICT (slug, system) DO UPDATE SET
  name = EXCLUDED.name,
  type = EXCLUDED.type,
  size = EXCLUDED.size,
  alignment = EXCLUDED.alignment,
  cr = EXCLUDED.cr,
  cr_sort = EXCLUDED.cr_sort,
  description = EXCLUDED.description,
  tags = EXCLUDED.tags,
  environments = EXCLUDED.environments,
  statblock = EXCLUDED.statblock,
  updated_at = now();

COMMIT;

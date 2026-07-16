-- seeds/445_dnd_more_systems.sql — register the additional game systems for the rules library.
--
-- Seed 422 created dnd_systems/dnd_system_entries and registered the first three; this adds the
-- rest so the library covers ten systems. Keys MUST match lib/dnd/systems.ts GAME_SYSTEMS and
-- lib/dnd/system-rules.ts SYSTEM_RULES — the entries themselves are projected from that
-- authoritative in-code catalog by scripts/dnd-seed-system-rules.ts (run it after this).
--
-- Note the spread beyond d20 is deliberate: Call of Cthulhu is percentile roll-under, Blades is a
-- d6 pool read on the highest die, Cyberpunk RED is 1d10+STAT+SKILL, Shadowrun counts hits on
-- 5–6. None of them have levels or hit dice, which is exactly what keeps the sheet engine honest.
-- Idempotent.
INSERT INTO dnd_systems (key, name, publisher, notes) VALUES
  ('intuitive-games', 'Intuitive Games',    'Intuitive Games',        'A d20 system (levels 1-10, degrees of success, 3-action economy). Rules from intuitivegames.net.'),
  ('pathfinder1e',    'Pathfinder 1e',      'Paizo',                  'The classic 3.x-derived d20: BAB, three saves, skill ranks, confirmed criticals.'),
  ('starfinder1e',    'Starfinder 1e',      'Paizo',                  'PF1-derived d20 in space: EAC/KAC, Stamina + Hit Points, Resolve Points.'),
  ('coc7e',           'Call of Cthulhu 7e', 'Chaosium',               'Percentile (d100) roll-under BRP. No levels, no classes; Sanity and Luck.'),
  ('blades',          'Blades in the Dark', 'Evil Hat / John Harper', 'Forged in the Dark: d6 pools read on the highest die, position & effect, stress and trauma. No levels.'),
  ('cyberpunk-red',   'Cyberpunk RED',      'R. Talsorian Games',     '1d10 + STAT + SKILL, exploding 10s. No levels; Roles, Humanity and Stopping Power.'),
  ('shadowrun6e',     'Shadowrun 6e',       'Catalyst Game Labs',     'd6 dice pool counting hits on 5-6. No levels; Attribute+Skill, Edge, Essence vs Magic.')
ON CONFLICT (key) DO UPDATE
  SET name = EXCLUDED.name, publisher = EXCLUDED.publisher, notes = EXCLUDED.notes, updated_at = now();

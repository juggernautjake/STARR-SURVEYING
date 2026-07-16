-- seeds/444_dnd_rage_field_migration.sql — strip the barbarian-specific field names out of
-- every stored character sheet.
--
-- Background: the sheet engine was Lazzuh Gun's sheet generalized in place, so his schema
-- was baked into the shared `Character` type and every character inherited it — a Warlock's
-- pact slots and a Cleric's MLM ranks were literally stored in fields named `rages` /
-- `rageDmg`, and every sheet carried `combat.rageDamageBonus`. The type is now generic:
--   combat.rageDamageBonus → combat.formDamageBonus
--   progression[].rages    → progression[].col3
--   progression[].rageDmg  → progression[].col4
--   attacks[].rageable     → attacks[].formBoosted
--
-- The app also migrates on read (normalizeCharacter in app/dnd/_sheet/data/blank.ts), so this
-- is belt-and-braces: it cleans rows written before the rename — including AI-generated NPCs
-- that inherited the fields from the old blank template — so the DB matches the new model.
--
-- Idempotent: rows already migrated have no legacy keys, so the updates match nothing.
BEGIN;

-- 1. combat.rageDamageBonus → combat.formDamageBonus (keep an existing new value if present).
UPDATE dnd_characters
SET data = jsonb_set(
      data #- '{combat,rageDamageBonus}',
      '{combat,formDamageBonus}',
      COALESCE(data #> '{combat,formDamageBonus}', data #> '{combat,rageDamageBonus}', '0'::jsonb)
    )
WHERE data #> '{combat,rageDamageBonus}' IS NOT NULL;

-- 2. progression[].rages/rageDmg → col3/col4, rebuilding the array element-by-element.
UPDATE dnd_characters c
SET data = jsonb_set(c.data, '{progression}', mig.arr)
FROM (
  SELECT
    x.id,
    COALESCE(
      jsonb_agg(
        (elem - 'rages' - 'rageDmg')
          || jsonb_build_object('col3', COALESCE(elem -> 'col3', elem -> 'rages', '""'::jsonb))
          || jsonb_build_object('col4', COALESCE(elem -> 'col4', elem -> 'rageDmg', '""'::jsonb))
        ORDER BY ord
      ),
      '[]'::jsonb
    ) AS arr
  FROM (SELECT id, data FROM dnd_characters) x,
       LATERAL jsonb_array_elements(x.data -> 'progression') WITH ORDINALITY AS t(elem, ord)
  WHERE jsonb_typeof(x.data -> 'progression') = 'array'
    AND EXISTS (
      SELECT 1 FROM jsonb_array_elements(x.data -> 'progression') e
      WHERE e ? 'rages' OR e ? 'rageDmg'
    )
  GROUP BY x.id
) mig
WHERE c.id = mig.id;

-- 3. attacks[].rageable → attacks[].formBoosted.
UPDATE dnd_characters c
SET data = jsonb_set(c.data, '{attacks}', mig.arr)
FROM (
  SELECT
    x.id,
    COALESCE(
      jsonb_agg(
        CASE
          WHEN elem ? 'rageable'
            THEN (elem - 'rageable') || jsonb_build_object('formBoosted', COALESCE(elem -> 'formBoosted', elem -> 'rageable'))
          ELSE elem
        END
        ORDER BY ord
      ),
      '[]'::jsonb
    ) AS arr
  FROM (SELECT id, data FROM dnd_characters) x,
       LATERAL jsonb_array_elements(x.data -> 'attacks') WITH ORDINALITY AS t(elem, ord)
  WHERE jsonb_typeof(x.data -> 'attacks') = 'array'
    AND EXISTS (
      SELECT 1 FROM jsonb_array_elements(x.data -> 'attacks') e WHERE e ? 'rageable'
    )
  GROUP BY x.id
) mig
WHERE c.id = mig.id;

-- 4. Same three renames inside the per-system variant sheets (seed 442), each of which
--    stores a full { data, sheet_type, ... } payload keyed by system.
UPDATE dnd_characters c
SET system_variants = mig.obj
FROM (
  SELECT
    x.id,
    jsonb_object_agg(
      key,
      CASE
        WHEN val #> '{data,combat,rageDamageBonus}' IS NOT NULL
          THEN jsonb_set(
                 val #- '{data,combat,rageDamageBonus}',
                 '{data,combat,formDamageBonus}',
                 COALESCE(val #> '{data,combat,formDamageBonus}', val #> '{data,combat,rageDamageBonus}', '0'::jsonb)
               )
        ELSE val
      END
    ) AS obj
  FROM (SELECT id, system_variants FROM dnd_characters) x,
       LATERAL jsonb_each(x.system_variants) AS t(key, val)
  WHERE jsonb_typeof(x.system_variants) = 'object'
    AND x.system_variants <> '{}'::jsonb
  GROUP BY x.id
) mig
WHERE c.id = mig.id;

COMMIT;

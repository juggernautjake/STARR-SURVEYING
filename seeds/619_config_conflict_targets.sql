-- seeds/619_config_conflict_targets.sql — the unique constraints 001_config.sql has always assumed.
--
-- ── WHAT WAS BROKEN ─────────────────────────────────────────────────────────────────────────────
--
-- `npm run db:seed` stopped on the second file:
--
--     ✗ FAILED on 001_config.sql: 42P10 there is no unique or exclusion constraint
--       matching the ON CONFLICT specification
--
-- Three of the ten upserts in `001_config.sql` name a conflict target that no constraint backs:
--
--     INSERT INTO rewards_catalog    … ON CONFLICT (name)
--     INSERT INTO seniority_brackets … ON CONFLICT (min_years)
--     INSERT INTO module_xp_config   … ON CONFLICT (module_type, coalesce(module_id::text, ''))
--
-- `000_baseline_tables.sql` creates all three with a PRIMARY KEY on `id` and nothing else. So this
-- is not drift between the seeds and the live database — **the seed set has never been internally
-- consistent.** Applying it to an empty database fails at file 2 of 413, and always would have.
--
-- The live tables were therefore populated some other way, or populated before those `ON CONFLICT`
-- clauses were written. Either way the intent is unambiguous: a rewards catalogue keyed by name, one
-- bracket per `min_years`, one XP rule per (module_type, module_id). Duplicates in any of the three
-- would be a bug in their own right.
--
-- ── WHY A CONSTRAINT AND NOT A CHANGE TO 001 ────────────────────────────────────────────────────
--
-- The alternative was to weaken `001_config.sql` to a bare `ON CONFLICT DO NOTHING`. That file
-- already carries a comment arguing against exactly that:
--
--     "Named target. A bare ON CONFLICT DO NOTHING fires only when a unique constraint is actually
--      [present]"
--
-- A bare clause would silently insert duplicates on every re-run instead of failing loudly. The
-- constraint is what the upsert was written for; adding it makes the file mean what it says.
--
-- ── SAFE TO APPLY ───────────────────────────────────────────────────────────────────────────────
--
-- Checked against production 2026-08-29 before writing this: zero duplicate keys in all three
-- (27, 9 and 38 rows respectively). `ADD CONSTRAINT` on a table with duplicates would fail; on
-- these it cannot.
--
-- Idempotent by the same catalogue guard the rest of the set uses, so re-running is a no-op.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rewards_catalog_name_key') THEN
    ALTER TABLE rewards_catalog ADD CONSTRAINT rewards_catalog_name_key UNIQUE (name);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'seniority_brackets_min_years_key') THEN
    ALTER TABLE seniority_brackets ADD CONSTRAINT seniority_brackets_min_years_key UNIQUE (min_years);
  END IF;
END $$;

-- `module_xp_config`'s target is an EXPRESSION — `coalesce(module_id::text, '')` — because
-- `module_id` is nullable and NULLs do not collide in a plain unique constraint. A table-level
-- UNIQUE cannot express that; a unique INDEX can, and `ON CONFLICT` accepts an index whose
-- expression matches the inference clause exactly.
CREATE UNIQUE INDEX IF NOT EXISTS module_xp_config_type_module_key
  ON module_xp_config (module_type, coalesce(module_id::text, ''));

COMMIT;

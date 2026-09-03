-- seeds/628_adjoiner_conflict_target.sql — `research_adjoiners` has never held a row, and this is why.
--
-- ── MEASURED, NOT INFERRED ──────────────────────────────────────────────────────────────────────
--
--   worker/src/infra/adjoiner-persistence.ts:137
--     onConflict: 'research_project_id,parcel_id,owner_name,identified_by'
--
--   seeds/539_adjoiner_register.sql
--     CREATE UNIQUE INDEX idx_adjoiners_unique ON research_adjoiners
--       (research_project_id, COALESCE(parcel_id, ''), COALESCE(owner_name, ''), identified_by)
--
-- The index is on EXPRESSIONS. Postgres matches an `ON CONFLICT (a, b, c)` inference target against
-- an index's expressions, and `parcel_id` is not `COALESCE(parcel_id, '')` — so no index matches and
-- the statement raises **42P10: there is no unique or exclusion constraint matching the ON CONFLICT
-- specification**. Not a duplicate-key error, not a partial write: the whole statement fails, and
-- nothing in the message says the word "conflict target".
--
-- So every neighbour every run has ever identified was discarded at the database boundary, while
-- `describePersist` reported `0 neighbour(s) recorded` as though the research had found none — a
-- fact about our SQL, rendered as a finding about the property. That is the failure mode the
-- adjoiner register's own header warns about: *"NULL means 'we do not know', never 'none' — the two
-- are different answers and only one of them is a finding."*
--
-- ── THE COALESCE WAS RIGHT, AND IS KEPT ─────────────────────────────────────────────────────────
--
-- Seed 539's comment explains it: a neighbour found only by a name in a deed call has no parcel id,
-- and NULLs are distinct in a plain unique index — so two nameless GIS neighbours would not
-- conflict, and every re-run would pile up another copy of every neighbour.
--
-- Dropping the COALESCE to make the index targetable would therefore fix the write by breaking the
-- deduplication it exists for. Generated columns keep both: the same collapsing rule, in a column
-- an `ON CONFLICT` can name.

-- ── 1. The keys ────────────────────────────────────────────────────────────────────────────────
--
-- STORED, not VIRTUAL: a unique index requires a stored generated column, and this is what the
-- index is for. GENERATED ALWAYS means nothing can write them directly — including the worker,
-- which does not try, and must not start.
ALTER TABLE research_adjoiners
  ADD COLUMN IF NOT EXISTS parcel_key TEXT
    GENERATED ALWAYS AS (COALESCE(parcel_id, '')) STORED;

ALTER TABLE research_adjoiners
  ADD COLUMN IF NOT EXISTS owner_key TEXT
    GENERATED ALWAYS AS (COALESCE(owner_name, '')) STORED;

COMMENT ON COLUMN research_adjoiners.parcel_key IS
  'COALESCE(parcel_id, ''''), stored, so the unique index is on plain columns an ON CONFLICT can '
  'name. Never written directly. Exists because the expression index it replaces made every upsert '
  'fail 42P10 — see seed 628.';
COMMENT ON COLUMN research_adjoiners.owner_key IS
  'COALESCE(owner_name, ''''), stored. See parcel_key.';

-- ── 2. The index the writer can actually target ────────────────────────────────────────────────
--
-- Identical semantics to idx_adjoiners_unique: one row per (project, parcel-or-blank,
-- owner-or-blank, how-we-found-them).
CREATE UNIQUE INDEX IF NOT EXISTS idx_adjoiners_conflict_target
  ON research_adjoiners (research_project_id, parcel_key, owner_key, identified_by);

-- The expression index is now redundant — same columns, same collapsing, no longer the only one —
-- and keeping two unique indexes over the same tuple costs a second write on every insert while
-- offering nothing. Dropped rather than left as a puzzle for whoever reads this table next.
DROP INDEX IF EXISTS idx_adjoiners_unique;

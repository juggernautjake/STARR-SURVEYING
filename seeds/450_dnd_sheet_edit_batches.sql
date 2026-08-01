-- seeds/450_dnd_sheet_edit_batches.sql — group sheet edits by the request that made them.
--
-- The audit table (seeds/410) logs one row per edit but has no way to reconstruct "the N edits from
-- ONE AI request" as a unit — so "undo that change" (the whole batch) wasn't possible. This adds:
--   * batch_id — a uuid shared by every edit from one request, so a batch can be reverted atomically.
--   * source   — where the edit came from ('ai' | 'manual' | 'revert'), previously only inferable.
--   * summary  — the request's human label (what the AI said it did), for the history timeline.
-- Idempotent. Existing rows keep NULL batch_id (ungrouped, still individually revertable).
ALTER TABLE dnd_sheet_edits ADD COLUMN IF NOT EXISTS batch_id uuid;
ALTER TABLE dnd_sheet_edits ADD COLUMN IF NOT EXISTS source   text;
ALTER TABLE dnd_sheet_edits ADD COLUMN IF NOT EXISTS summary  text;

-- ── A MIGRATION MUST NOT CLOBBER A LATER ONE (fixed 2026-08-01) ─────────────────────────────────────
--
-- This was `DROP CONSTRAINT IF EXISTS` followed by an unconditional `ADD`, and it made the whole seed
-- set un-re-runnable. On an empty database the chain is fine: 450 adds the narrow constraint and
-- `463_dnd_sheet_edits_sources.sql` later widens it to include `library-grant`, `homebrew-adopt` and
-- `ig-edit`. Against a LIVE database it is not: 450 drops 463's wider rule, re-adds the narrow one, and
-- Postgres refuses because real `library-grant` rows already exist —
--   `23514 check constraint "dnd_sheet_edits_source_chk" is violated by some row`
-- — which halts `scripts/apply-seeds.mjs` at file 274 of 305 and takes every later seed with it.
--
-- That matters more than it looks. "Apply all the seeds" is this project's rebuild path, and a rebuild
-- that only works on an empty database is a rebuild nobody has actually got. It is the same thing as an
-- unrehearsed backup: a belief.
--
-- So the ADD is now conditional. Re-running 450 on a database that already has the constraint — from
-- 463, or from a previous run of 450 — leaves it exactly as it is. History stays honest (this file still
-- records what the rule was in its day) without reaching forward and undoing its successor.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'dnd_sheet_edits_source_chk'
  ) THEN
    ALTER TABLE dnd_sheet_edits ADD CONSTRAINT dnd_sheet_edits_source_chk
      CHECK (source IS NULL OR source IN ('ai', 'manual', 'revert'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_dnd_sheet_edits_batch ON dnd_sheet_edits (character_id, batch_id, created_at DESC);

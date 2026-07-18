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

ALTER TABLE dnd_sheet_edits DROP CONSTRAINT IF EXISTS dnd_sheet_edits_source_chk;
ALTER TABLE dnd_sheet_edits ADD  CONSTRAINT dnd_sheet_edits_source_chk
  CHECK (source IS NULL OR source IN ('ai', 'manual', 'revert'));

CREATE INDEX IF NOT EXISTS idx_dnd_sheet_edits_batch ON dnd_sheet_edits (character_id, batch_id, created_at DESC);

-- seeds/232_starr_field_finances_lock.sql
--
-- Tax-period lock + audit-trail timestamps (Batch QQ).
--
-- Per the user's directive: *"if data has already been managed or
-- used for it's intended purpose, such as old receipts being
-- calculated into business costs, that they are handled and marked
-- well so that there is no confusion. We don't want things getting
-- counted twice, or not counted at all in the total."*
--
-- We already have `receipts.status='exported'` (from seeds/220) which
-- the existing CSV-export endpoint sets when the bookkeeper downloads
-- a Schedule-C-shaped report. What's missing is **when**, and a way
-- to seal an entire tax period in one operation.
--
-- This seed adds two columns + an index:
--
--   1. `receipts.exported_at TIMESTAMPTZ` — wall-clock when the row
--      was first marked as exported. NULL = never exported. Set by
--      the new POST /api/admin/finances/mark-exported endpoint.
--      Also touched by the existing per-row PATCH when a single
--      row is flipped to status='exported'.
--
--   2. `receipts.exported_period TEXT` — human-readable label for
--      the tax period this row was filed under (e.g. '2025',
--      '2025-Q4', '2025-Apr'). Lets the bookkeeper trace back from
--      a row to "which CPA submission did this go in?" without
--      cross-referencing CSV downloads.
--
-- Apply AFTER seeds/220 + 230. Idempotent — every ALTER + index
-- guards on existence.

BEGIN;

ALTER TABLE receipts
  ADD COLUMN IF NOT EXISTS exported_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS exported_period  TEXT;

-- Partial index for "which rows still need to be locked into a
-- tax period?" — drives the /admin/finances page's "X new since
-- last export" count without scanning the full table.
CREATE INDEX IF NOT EXISTS idx_receipts_export_pending
  ON receipts (created_at DESC)
  WHERE status IN ('approved', 'exported')
    AND deleted_at IS NULL
    AND exported_at IS NULL;

COMMIT;

-- seeds/229_starr_field_receipt_review.sql
--
-- Receipt duplicate detection + user-review-before-save (Batch Z).
--
-- Per the user's directive: *"We also need to make sure we are not
-- uploading duplicate receipts, so AI needs to be able to recognize
-- whenever there is likely a duplicate receipt and needs to prompt
-- the user to ask them if they still want to save it or discard the
-- duplicate. Also, whenever a receipt is uploaded, it needs to scan
-- the receipt and store the data, but it needs to ask the user to
-- review the information to make sure it is actually correct."*
--
-- Adds five columns to `receipts`:
--   1. `dedup_fingerprint`  — TEXT, computed by the worker after
--      AI extraction completes:
--         lower(alnum-only(vendor_name)) || '|' || total_cents || '|'
--         || to_char(transaction_at::date,'YYYY-MM-DD')
--      Indexed (per user) so the worker can detect duplicates with a
--      cheap point lookup. NULL until extraction completes.
--
--   2. `dedup_match_id`     — UUID, FK to receipts.id. Set by the
--      worker when it finds a prior non-rejected receipt for the
--      same user with the same fingerprint. The user reviews the
--      duplicate-warning card on the mobile detail screen and
--      either keeps both (different physical receipt that happens
--      to match the fingerprint, e.g. two $5.00 coffee runs at the
--      same shop on the same day) or discards as duplicate.
--
--   3. `dedup_decision`     — TEXT 'keep' | 'discard' | NULL. Set by
--      the user when the duplicate-warning card is acted on. 'keep'
--      means the user confirmed it's not a real dup; 'discard' is a
--      shortcut to status='rejected' with rejected_reason='duplicate'.
--
--   4. `user_reviewed_at`   — TIMESTAMPTZ, set the moment the user
--      taps "Confirm receipt" on the review screen. Until this is
--      set, the receipt shows the yellow "Tap to review" badge in
--      the list. After it's set, the row is treated as
--      user-confirmed (the bookkeeper still has the final
--      approve/reject step, but the captured data is no longer
--      "AI-only").
--
--   5. `user_review_edits`  — JSONB, optional record of what the
--      user changed during review (so an audit trail of "AI said X,
--      user changed it to Y" survives even if category_source flips
--      to 'user'). Sparse — only populated when the user actually
--      changes a field.
--
-- Idempotent: every ALTER guards on column existence. Apply AFTER
-- seeds/220.

BEGIN;

ALTER TABLE receipts ADD COLUMN IF NOT EXISTS dedup_fingerprint TEXT;
ALTER TABLE receipts ADD COLUMN IF NOT EXISTS dedup_match_id    UUID REFERENCES receipts(id) ON DELETE SET NULL;
ALTER TABLE receipts ADD COLUMN IF NOT EXISTS dedup_decision    TEXT;
ALTER TABLE receipts ADD COLUMN IF NOT EXISTS user_reviewed_at  TIMESTAMPTZ;
ALTER TABLE receipts ADD COLUMN IF NOT EXISTS user_review_edits JSONB;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'receipts_dedup_decision_chk'
  ) THEN
    ALTER TABLE receipts
      ADD CONSTRAINT receipts_dedup_decision_chk
        CHECK (dedup_decision IS NULL OR dedup_decision IN ('keep','discard'));
  END IF;
END $$;

-- Per-user lookup index for the worker's dedup query. Partial on
-- non-null fingerprint + non-rejected status so we don't index
-- noise (failed extractions, user-rejected rows).
CREATE INDEX IF NOT EXISTS idx_receipts_dedup_lookup
  ON receipts (user_id, dedup_fingerprint)
  WHERE dedup_fingerprint IS NOT NULL AND status != 'rejected';

-- Index for "show me everything that needs my review." Partial so
-- it stays small — the index only carries rows the user hasn't
-- confirmed yet, which is the exact set the mobile UI queries.
CREATE INDEX IF NOT EXISTS idx_receipts_needs_review
  ON receipts (user_id, created_at DESC)
  WHERE user_reviewed_at IS NULL
    AND extraction_status = 'done'
    AND status = 'pending';

COMMIT;

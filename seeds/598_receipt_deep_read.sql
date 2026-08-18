-- seeds/598_receipt_deep_read.sql — keep the evidence, not just the answer.
--
-- Owner, 2026-08-18: *"We need the AI to break down the receipt into smaller images and have OCR
-- review it all and very carefully capture everything … For any discrepancies, then we can have
-- warnings and stuff to let the reviewer know that there is a discrepancy."*
--
-- ── WHY THE TRANSCRIPT IS STORED, AND NOT ONLY THE FIELDS ────────────────────────────────────────
--
-- The deep reader looks at a receipt nine ways and produces one set of fields. Storing only the
-- fields throws away the reason to trust them. A bookkeeper looking at "$20.98" has no way to tell a
-- figure read cleanly off crisp print from one reconstructed out of a faded smear — and those two
-- deserve very different amounts of scrutiny.
--
-- The transcript is what the machine actually had in front of it. With it on the row, "why does it
-- think that?" is answerable without re-running anything, and a wrong reading can be diagnosed
-- rather than merely disbelieved.
--
-- ── AND WHY THE DISCREPANCIES ARE A COLUMN, NOT A DERIVED VIEW ───────────────────────────────────
--
-- They are a statement about a PARTICULAR reading. Re-deriving them later from the stored fields
-- would lose exactly the ones that matter most: "the close-up said $20.90 and the whole-receipt pass
-- said $20.98" cannot be recovered from a row that now holds one number.

ALTER TABLE public.receipts
  -- When the deep read last ran. NULL means it never has — the honest distinction from "ran and
  -- found nothing", which every count on the review screen depends on.
  ADD COLUMN IF NOT EXISTS deep_read_at        timestamptz,
  -- Every line the band readers saw, stitched, in order. jsonb rather than text[] so it survives a
  -- reader returning something unexpected without failing the whole write.
  ADD COLUMN IF NOT EXISTS deep_transcript     jsonb,
  -- [{ code, field, severity, message, readings }] — see lib/receipts/deep-merge.ts.
  ADD COLUMN IF NOT EXISTS deep_discrepancies  jsonb,
  -- Per-stage timings and failures, so a slow or degraded run can be diagnosed from the row.
  ADD COLUMN IF NOT EXISTS deep_stages         jsonb,
  -- What the address lookup said, including its status when it was skipped.
  ADD COLUMN IF NOT EXISTS deep_vendor_check   jsonb,
  -- The crop that was applied, so the operator can be shown where the machine thought the paper was.
  ADD COLUMN IF NOT EXISTS deep_crop           jsonb,
  -- Bands read, and how long the whole thing took. Cheap to store, and the first two questions
  -- anybody asks when a run looks wrong.
  ADD COLUMN IF NOT EXISTS deep_band_count     integer,
  ADD COLUMN IF NOT EXISTS deep_duration_ms    integer,
  ADD COLUMN IF NOT EXISTS deep_cost_cents     integer;

COMMENT ON COLUMN public.receipts.deep_transcript IS
  'Every line the banded readers transcribed, stitched in order. The evidence behind the extracted '
  'fields — kept so "why does it think that?" is answerable without re-running the read.';

COMMENT ON COLUMN public.receipts.deep_discrepancies IS
  'Where the independent passes disagreed, or a deterministic check failed. A statement about one '
  'particular reading, which is why it is stored rather than re-derived.';

-- The review screen asks for "receipts with an unresolved high-severity discrepancy" on every load.
-- Without this that is a full scan plus a jsonb walk per row.
CREATE INDEX IF NOT EXISTS receipts_deep_read_at_idx
  ON public.receipts (deep_read_at DESC NULLS LAST)
  WHERE deleted_at IS NULL;

-- seeds/599_receipt_note_confirmations.sql — what the person's own note confirmed.
--
-- Owner, 2026-08-18: *"If the user puts down the total and location and job number and all that,
-- then the AI should track that and use it in the summary if it is correct."*
--
-- The operative words are *"if it is correct"*. A note is a claim by somebody who was holding the
-- paper — strong evidence, and not a fact. So the deep read compares it against what was actually
-- read and splits the outcome in two: disagreements go to `deep_discrepancies`, and the parts that
-- CHECK OUT land here.
--
-- Stored rather than recomputed because it is a statement about one particular reading. Re-deriving
-- it later from the note and the current fields would report agreement with whatever a person has
-- since typed in, which is not the same claim at all — and is the flattering version of it.
ALTER TABLE public.receipts
  ADD COLUMN IF NOT EXISTS deep_note_confirmations jsonb;

COMMENT ON COLUMN public.receipts.deep_note_confirmations IS
  'Parts of the submitter''s own note that the deep read verified against the receipt — e.g. "the '
  'total matches the $27.89 you noted". Disagreements go to deep_discrepancies instead.';

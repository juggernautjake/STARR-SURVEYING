-- seeds/600_receipt_declared_fields.sql — who said this, the person or the machine?
--
-- Owner, 2026-08-18: *"For each receipt, before it can be submitted, please make it so that the user
-- has to put in the date, business name, and total amount before being able to submit it."*
--
-- The three fields themselves already have columns — `transaction_at`, `vendor_name`, `total_cents`.
-- What was missing is the ability to tell WHERE a value came from.
--
-- ── WHY THAT DISTINCTION IS WORTH A COLUMN ───────────────────────────────────────────────────────
--
-- A total of $27.89 on a row means two very different things depending on its origin. Read off a
-- 480×640 photo of faded thermal print, it is a reading that has been wrong before — measured on
-- this firm's own receipts, and wrong in a way the arithmetic could not detect, because
-- 25.62 + 2.07 = 27.69 balances exactly as well as 25.82 + 2.07 = 27.89. Typed into a required box
-- by somebody holding the paper, it is close to ground truth.
--
-- Without this flag those two are indistinguishable on the row, and "who said this?" is the first
-- question anybody asks when a figure turns out to be wrong.
--
-- It also documents an invariant that is otherwise invisible: because these land at INSERT, the
-- extractor's `fillIfEmpty` merge can never overwrite them. They are protected by arriving first
-- rather than by any rule, and a future change to the insert order would quietly remove that
-- protection with nothing to notice it.
ALTER TABLE public.receipts
  ADD COLUMN IF NOT EXISTS declared_by_submitter boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.receipts.declared_by_submitter IS
  'True when transaction_at, vendor_name and total_cents were typed by the submitter at capture '
  'time rather than read by the AI. Set at INSERT, which is also what protects them from the '
  'extractor''s fill-if-empty merge.';

-- The bookkeeper queue wants "receipts where the AI disagreed with what the submitter declared",
-- which starts by finding the declared ones.
CREATE INDEX IF NOT EXISTS receipts_declared_idx
  ON public.receipts (declared_by_submitter)
  WHERE declared_by_submitter AND deleted_at IS NULL;

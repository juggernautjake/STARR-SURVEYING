-- seeds/584_receipt_card_match.sql
--
-- "Was this bought on a company card we know about?" — owner request, 2026-08-12:
-- *"if a receipt uses a card that is not on file, it needs to be flagged and show that the card number
-- or card name or card name holder is not on file."*
--
-- ── WHY A COLUMN AND NOT JUST A REVIEW FLAG ──────────────────────────────────────────────────────
--
-- The matcher already writes a sentence into `ai_extras.review_flags`, which is what a bookkeeper
-- reads on the row. That is enough to SEE the problem and not enough to ASK about it: "show me every
-- receipt this quarter charged to a card we do not own" is a query, and a phrase buried in a jsonb
-- array is not a queryable answer. A column with a fixed vocabulary is.
--
-- The five values are deliberately distinct outcomes, not a boolean:
--
--   not_a_card   — cash or cheque. There is no card, so there is nothing to be on file.
--   unknown      — a card was used but the last four are illegible. We CANNOT say whether it is ours,
--                  and recording that as "not on file" would be a false accusation about somebody's
--                  expense claim.
--   on_file      — matches an active company card.
--   retired      — matches a card we own that has since been retired. The purchase is explained, but
--                  it is worth a look: "you used the old fuel card" is a different conversation from
--                  "we have never seen this card".
--   not_on_file  — the last four are legible and nothing we own matches.
--
-- Collapsing `unknown` into `not_on_file` is the tempting simplification and the wrong one: a flag
-- that fires on every blurry photo is a flag people learn to scroll past, which is how the one real
-- unauthorised charge gets approved with the rest.

ALTER TABLE receipts
  ADD COLUMN IF NOT EXISTS card_match_status TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'receipts_card_match_status_chk'
  ) THEN
    ALTER TABLE receipts ADD CONSTRAINT receipts_card_match_status_chk
      CHECK (card_match_status IS NULL OR card_match_status IN
        ('not_a_card', 'unknown', 'on_file', 'retired', 'not_on_file'));
  END IF;
END $$;

COMMENT ON COLUMN receipts.card_match_status IS
  'Result of matching the card printed on the receipt against `payment_cards` (see '
  'lib/receipts/card-on-file.ts). NULL means the check has not run — every receipt extracted before '
  '2026-08-12, and any extraction where the card table was unavailable. NULL is deliberately '
  'distinguishable from `unknown`: one means "not checked", the other means "checked and could not '
  'tell", and only the second is a statement about the receipt.';

-- Partial: the daily question is "what needs a human?", and that is two of the five values. Indexing
-- `on_file` rows would be indexing the overwhelming majority to find the minority.
CREATE INDEX IF NOT EXISTS idx_receipts_card_needs_review
  ON receipts (card_match_status)
  WHERE card_match_status IN ('not_on_file', 'retired');

-- seeds/591_receipt_payer_decision.sql
--
-- Whose money was it, and was it even a business purchase?
--
-- Owner, 2026-08-13: *"if we do not have a card on file, then the receipt should be flagged and it
-- should tell us that the card is not recognized… maybe one of the employees paid for something
-- without using the business card. They might have used their own personal card. In which case we
-- might reimburse them, or maybe not depending. We might want to disregard the receipt entirely from
-- our taxes because it might have just been a personal purchase."*
--
-- ── TWO QUESTIONS, NOT ONE ───────────────────────────────────────────────────────────────────────
--
-- Seed 572 already models WHOSE card it is (`payment_cards.role`: company, an owner's personal, an
-- employee's personal, a client's), and seed 584 already matches a receipt's last four against that
-- list. Neither answers the question the owner just asked, because a personal card is used for both
-- kinds of purchase:
--
--     an employee's personal card, business purchase  → we owe them the money
--     an employee's personal card, personal purchase  → it is not ours at all; keep it out of the books
--
-- Those two rows are identical in every column the database had. Only a person knows which is which,
-- so the answer is stored rather than derived: `expense_nature`.
--
-- ── WHY A MATCH IS NOT A CONFIRMATION ────────────────────────────────────────────────────────────
--
-- `payment_card_id` is written by the matcher from four printed digits. Four digits are not an
-- identifier — with a dozen cards a collision is ordinary — and `lib/finance/tax-summary.ts` has
-- refused since it was written to file anything on an unconfirmed suggestion. It had no way to tell
-- the two apart, because nothing recorded that a person had agreed. `card_confirmed_at` is that
-- record. Until it is set, a matched card is a suggestion and the receipt says so.
--
-- All nullable, and NULL means "nobody has decided", which is deliberately different from any
-- decision — including the common and correct one, "this was the company card, as expected".

ALTER TABLE receipts
  ADD COLUMN IF NOT EXISTS card_confirmed_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS card_confirmed_by   UUID,
  ADD COLUMN IF NOT EXISTS expense_nature      TEXT,
  ADD COLUMN IF NOT EXISTS expense_nature_note TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'receipts_expense_nature_chk') THEN
    ALTER TABLE receipts ADD CONSTRAINT receipts_expense_nature_chk
      CHECK (expense_nature IS NULL OR expense_nature IN ('business', 'personal'));
  END IF;
END $$;

COMMENT ON COLUMN receipts.expense_nature IS
  'Was this purchase for the business at all? ''business'' = ours (deductible per its category, and '
  'owed back to the payer if they used their own card). ''personal'' = not a business purchase — '
  'excluded from every expense and tax total, and never reimbursed. NULL = nobody has decided, which '
  'is the state a receipt on an unrecognised card sits in until somebody answers.';
COMMENT ON COLUMN receipts.card_confirmed_at IS
  'When a person confirmed which card on file actually paid. `payment_card_id` alone is a match on '
  'four printed digits, which is a suggestion — tax treatment is never derived from an unconfirmed '
  'one. See lib/finance/tax-summary.ts, which has always refused to file on a suggestion and until '
  'now had no way to know it had one.';

-- "Which receipts is somebody still waiting on a decision for?" — the only question these columns
-- exist to answer quickly, and it reads exactly one small slice of the table.
CREATE INDEX IF NOT EXISTS idx_receipts_undecided_payer
  ON receipts (card_match_status)
  WHERE expense_nature IS NULL AND card_match_status IN ('not_on_file', 'unknown', 'retired');

-- seeds/590_receipt_same_purchase_and_charges.sql
--
-- Two receipts, one purchase — and who added what to the bill.
--
-- Owner, 2026-08-13: *"I think I added two receipts for texas roadhouse… one that is $100 and one
-- that is $84.34, but really they are for the same meal… we need to recognize how much tax and tip
-- the business applied, and how much tip I gave besides that… so that we don't count the purchase
-- twice."*
--
-- ── WHY `dedup_fingerprint` COULD NOT ANSWER THIS ────────────────────────────────────────────────
--
-- That fingerprint is `vendor | total | date`, which finds one receipt photographed twice. The pair
-- that prompted this is not that. It is the two pieces of paper a restaurant hands you for ONE meal:
--
--     itemised bill   7791 food + 643 tax             = 8434
--     card slip       8434 subtotal + 1566 by hand    = 10000
--
-- Different totals, so different fingerprints, so no match — and the timestamps straddled midnight
-- (23:59 and 00:04), so a same-calendar-day rule would have missed it too. The signature that DOES
-- find it is that one receipt's TOTAL is the other's SUBTOTAL, which is what a card slip *is*.
--
-- ── SUPERSEDED, NOT DELETED ──────────────────────────────────────────────────────────────────────
--
-- `superseded_by_receipt_id` points from the itemised bill to the card slip. The slip is what left
-- the bank account and is the row that counts; the bill is the only record of what the food cost and
-- what the tax was, so it is kept and simply not counted.
--
-- Deleting it would destroy the itemisation. Counting it would double the meal. Neither is
-- acceptable, which is why this is a link rather than a status.
--
-- ── THREE THINGS THAT ARE NOT THE FOOD ───────────────────────────────────────────────────────────
--
-- `tip_cents` already existed and is ambiguous — it holds whatever the extractor read on a line
-- labelled "tip", which may be an auto-gratuity the business imposed OR a figure the payer wrote.
-- Those are different facts and the owner asked for them apart:
--
--   `service_charge_cents` — the business added it (18% on a large party, a service fee). The payer
--                            had no say, and it is part of what the business billed.
--   `customer_tip_cents`   — the payer chose it, usually written after the bill was printed and so
--                            absent from the itemised bill entirely.
--
-- A party of twelve billed an 18% auto-gratuity has not tipped voluntarily; somebody who wrote
-- $15.66 on a slip did not have it imposed. Reporting either as the other misstates both.
--
-- All nullable. NULL means "not established", which is deliberately distinguishable from 0 ("there
-- was none") — the same rule the rest of this schema follows for money.

ALTER TABLE receipts
  ADD COLUMN IF NOT EXISTS superseded_by_receipt_id UUID REFERENCES receipts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS same_purchase_kind       TEXT,
  ADD COLUMN IF NOT EXISTS same_purchase_confidence TEXT,
  ADD COLUMN IF NOT EXISTS service_charge_cents     INTEGER,
  ADD COLUMN IF NOT EXISTS customer_tip_cents       INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'receipts_same_purchase_kind_chk') THEN
    ALTER TABLE receipts ADD CONSTRAINT receipts_same_purchase_kind_chk
      CHECK (same_purchase_kind IS NULL OR same_purchase_kind IN ('duplicate_photo', 'bill_and_slip'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'receipts_same_purchase_confidence_chk') THEN
    ALTER TABLE receipts ADD CONSTRAINT receipts_same_purchase_confidence_chk
      CHECK (same_purchase_confidence IS NULL OR same_purchase_confidence IN ('certain', 'likely'));
  END IF;

  -- A receipt cannot supersede itself. Trivially true and trivially catastrophic if it ever were
  -- not: every total that reads through the link would recurse.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'receipts_not_self_superseded') THEN
    ALTER TABLE receipts ADD CONSTRAINT receipts_not_self_superseded
      CHECK (superseded_by_receipt_id IS NULL OR superseded_by_receipt_id <> id);
  END IF;
END $$;

COMMENT ON COLUMN receipts.superseded_by_receipt_id IS
  'This receipt records the same purchase as the receipt named here, which is the one that counts. '
  'Set on the ITEMISED BILL, pointing at the CARD SLIP: the slip is what left the account. The bill '
  'is kept because it is the only record of the food and the tax — every expense total must exclude '
  'rows where this is set, or the purchase is counted twice.';
COMMENT ON COLUMN receipts.service_charge_cents IS
  'Auto-gratuity or service charge the BUSINESS added. Not chosen by the payer. NULL = not '
  'established, 0 = there was none.';
COMMENT ON COLUMN receipts.customer_tip_cents IS
  'The tip the PAYER chose to add, usually written on the slip after the bill printed and therefore '
  'absent from the itemised bill. Distinct from service_charge_cents, which the business imposed.';

-- "What is being double-counted right now?" and "exclude the superseded rows from this total" are
-- both queries over a small minority of rows, so a partial index rather than one over every receipt.
CREATE INDEX IF NOT EXISTS idx_receipts_superseded
  ON receipts (superseded_by_receipt_id)
  WHERE superseded_by_receipt_id IS NOT NULL;

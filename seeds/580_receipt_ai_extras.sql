-- seeds/580_receipt_ai_extras.sql
--
-- EVERYTHING THE RECEIPT SAYS, NOT JUST THE COLUMNS WE HAPPENED TO HAVE (2026-08-11)
-- ═════════════════════════════════════════════════════════════════════════════════
--
-- Owner: *"We need to make sure that we track all of the info from each receipt and format it all.
-- We need to make sure that AI is properly hooked up to analyze everything properly and
-- thoroughly."*
--
-- The extractor already read a receipt well. What it was allowed to KEEP was narrower than what it
-- could see: a receipt's phone number, card brand, transaction number, coupon line and currency all
-- got read and then thrown away, because there was nowhere to put them. The queue then showed a
-- bookkeeper a photo and eight numbers, and every question beyond those eight ("which card was
-- this?", "is this the invoice the vendor is chasing us about?") meant squinting at the image.
--
-- ── ONE JSONB COLUMN, NOT SEVEN NEW ONES ────────────────────────────────────────────────────────
--
-- These are the AI's READING of a document. They are not accounting fields: nothing sums them, no
-- export column maps to them, and a bookkeeper never edits them — the edit surface stays exactly the
-- money fields it already was. Promoting each to its own column would widen every `select('*')` in
-- the product to carry data only one panel reads, and would need a migration again the next time the
-- prompt learns to read one more thing off a receipt.
--
-- The two fields that ARE decision-shaped get called out inside it and are documented here so they
-- are not mistaken for decoration:
--
--   summary       — one sentence for a person skimming fifty rows. Advisory.
--   review_flags  — the receipts that need a human: totals that do not add up, an illegible date, a
--                   personal item on a company card. An EMPTY array is the common, correct answer,
--                   and that matters: a flag that fires on ordinary receipts is a flag people learn
--                   to scroll past, which is how the one real problem gets approved with the rest.
--
-- Nothing here changes an existing value, so the column is additive and safe to re-run. Rows written
-- before this seed simply have NULL, which the UI renders as "AI has not looked at this yet" —
-- honest, and distinguishable from "AI looked and found nothing".

ALTER TABLE receipts ADD COLUMN IF NOT EXISTS ai_extras JSONB;

COMMENT ON COLUMN receipts.ai_extras IS
  'Vision extraction detail that is not an accounting field: {summary, review_flags[], vendor_phone, card_brand, receipt_number, discount_cents, currency}. Written only by the extractor; never edited by a bookkeeper. NULL means no extraction has run.';

-- Finding the receipts that need a person is the whole point of `review_flags`, and the bookkeeper
-- queue asks for exactly that ("show me what needs looking at"). Without an index that question is a
-- sequential scan over every receipt the firm has ever filed.
--
-- Partial, on purpose: the index only covers rows that actually carry a flag. Most receipts are
-- clean, so this stays small enough to be worth having.
CREATE INDEX IF NOT EXISTS idx_receipts_review_flags
  ON receipts USING GIN ((ai_extras -> 'review_flags'))
  WHERE ai_extras -> 'review_flags' IS NOT NULL;

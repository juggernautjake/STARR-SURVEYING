-- seeds/675_receipt_reading_v2.sql — read every receipt closely, twice; categorise every line.
--
-- Owner, 2026-10-07: "It really seems like it could be better at reading and understanding the
-- structure and contents of different receipts … make sure our receipt analysis system is as robust
-- as possible so that it picks up the details for each receipt every time … We need the analysis to
-- be good every time and to get consistent results every time." And: "The system also needs to be
-- able to split off all of the receipt items into categories … daily, weekly, monthly, quarterly,
-- bi-yearly, and yearly analysis of and filtering by type of item."
--
-- 1. receipt_line_items.category — every line gets its own category (a receipt can hold meals AND
--    supplies), set by the reader (`category_source = 'ai'`) or a person ('user', never overwritten).
-- 2. receipts.read_status — the outcome of the zoomed, two-read reading (lib/receipts/zoom-read.ts):
--      agreed        two independent reads gave the same figures, and the arithmetic holds
--      verified      the reads disagreed (or the arithmetic did not hold) and a zoomed re-read of the
--                    disputed area settled it
--      needs_review  something is still uncertain — a person must check it before a period is locked
--    plus read_details (what agreed, what was disputed and how it was settled) and read_model.
-- 3. Indexes for the spending report (line items by category; receipts by date).
--
-- Additive; safe twice.

BEGIN;

ALTER TABLE public.receipt_line_items ADD COLUMN IF NOT EXISTS category text;
ALTER TABLE public.receipt_line_items ADD COLUMN IF NOT EXISTS category_source text;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'receipt_line_items_category_source_check') THEN
    ALTER TABLE public.receipt_line_items ADD CONSTRAINT receipt_line_items_category_source_check
      CHECK (category_source IS NULL OR category_source IN ('ai', 'user'));
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_receipt_line_items_category ON public.receipt_line_items (category) WHERE removed_at IS NULL;

ALTER TABLE public.receipts ADD COLUMN IF NOT EXISTS read_status text;
ALTER TABLE public.receipts ADD COLUMN IF NOT EXISTS read_details jsonb;
ALTER TABLE public.receipts ADD COLUMN IF NOT EXISTS read_model text;
ALTER TABLE public.receipts ADD COLUMN IF NOT EXISTS read_at timestamptz;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'receipts_read_status_check') THEN
    ALTER TABLE public.receipts ADD CONSTRAINT receipts_read_status_check
      CHECK (read_status IS NULL OR read_status IN ('agreed', 'verified', 'needs_review'));
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_receipts_read_status ON public.receipts (read_status) WHERE read_status = 'needs_review';
CREATE INDEX IF NOT EXISTS idx_receipts_transaction_at ON public.receipts (transaction_at) WHERE deleted_at IS NULL;

COMMIT;

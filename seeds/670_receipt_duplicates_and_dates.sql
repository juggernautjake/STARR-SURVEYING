-- seeds/670_receipt_duplicates_and_dates.sql — duplicate receipts a person can review; dates on the right day.
--
-- Owner, 2026-10-06: "spot duplicate entries of the same receipt and … flag the receipts and let the
-- user review them together and decide what to do. It should look at receipt date, place, total,
-- items purchased, etc."
--
-- 1. receipt_duplicate_candidates — one row per pair of receipts that look like the same receipt,
--    written by lib/receipts/duplicate-scan.ts (scoring in lib/receipts/duplicates.ts). Ordered pair
--    (receipt_a < receipt_b) so A–B and B–A are one row. A decision is kept forever: a pair somebody
--    marked "keep both" is never re-flagged.
--
-- 2. Dates. Most receipts were stored at midnight UTC — 7 PM the previous day in Texas — so every
--    screen showed them a day early. Date-only values move to noon UTC (same calendar day in every US
--    zone). Code paths fixed in the same change (upload route, receiptInstant in the extraction core).
--
-- 3. Five receipts carry years that cannot be right (2000–2020 on receipts photographed in 2026).
--    Flagged for a person, never rewritten.
--
-- Idempotent.

BEGIN;

CREATE TABLE IF NOT EXISTS public.receipt_duplicate_candidates (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_a      uuid NOT NULL REFERENCES public.receipts(id) ON DELETE CASCADE,
  receipt_b      uuid NOT NULL REFERENCES public.receipts(id) ON DELETE CASCADE,
  confidence     text NOT NULL CHECK (confidence IN ('certain', 'likely', 'possible')),
  score          integer NOT NULL DEFAULT 0,
  reasons        jsonb NOT NULL DEFAULT '[]'::jsonb,
  matches        jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- open: waiting on a person · keep_both: not a duplicate · removed_a / removed_b: that one was removed
  status         text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'keep_both', 'removed_a', 'removed_b', 'gone')),
  decided_by     text,
  decided_at     timestamptz,
  decision_note  text,
  org_id         uuid DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT receipt_dup_pair_ordered CHECK (receipt_a < receipt_b),
  CONSTRAINT receipt_dup_pair_unique UNIQUE (receipt_a, receipt_b)
);
CREATE INDEX IF NOT EXISTS idx_receipt_dup_open ON public.receipt_duplicate_candidates (status, score DESC) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_receipt_dup_a ON public.receipt_duplicate_candidates (receipt_a);
CREATE INDEX IF NOT EXISTS idx_receipt_dup_b ON public.receipt_duplicate_candidates (receipt_b);

ALTER TABLE public.receipt_duplicate_candidates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS service_role_all ON public.receipt_duplicate_candidates;
CREATE POLICY service_role_all ON public.receipt_duplicate_candidates FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 2. Date-only receipts: midnight UTC → noon UTC (the calendar day they were printed).
UPDATE public.receipts
SET transaction_at = transaction_at + interval '12 hours'
WHERE transaction_at IS NOT NULL
  AND (transaction_at AT TIME ZONE 'UTC')::time = '00:00:00';

-- 3. Impossible years: flagged for review (never rewritten).
UPDATE public.receipts
SET ai_extras = jsonb_set(
  coalesce(ai_extras, '{}'::jsonb),
  '{review_flags}',
  coalesce(ai_extras->'review_flags', '[]'::jsonb)
    || to_jsonb('The date reads ' || to_char(transaction_at AT TIME ZONE 'America/Chicago', 'Mon DD, YYYY')
       || ', more than a year before it was uploaded — the year was probably misread. Check it on the paper.')
)
WHERE transaction_at < created_at - interval '366 days'
  AND deleted_at IS NULL
  AND NOT coalesce(ai_extras->'review_flags', '[]'::jsonb)::text LIKE '%year was probably misread%';

COMMIT;

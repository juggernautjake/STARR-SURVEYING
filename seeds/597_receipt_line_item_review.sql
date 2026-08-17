-- 597_receipt_line_item_review.sql
--
-- Owner, 2026-08-17: *"We should also be able to edit the list of items on the receipt, both the
-- name, quantity and cost, and we should be able to mark each individual item as a business expense
-- or not. We might have some receipts where there are some things on it that are business expenses
-- and some that are not. We need to be able to remove items, and we need to be able to add items
-- too, just in case they do not show up properly on the receipt, or the AI hallucinates. All
-- removed/added items should be flagged as such. Like, removed items should not actually be
-- removed, they should just be flagged. The user should have to give a reason associated with
-- adding or removing an item. All of this needs to be reviewable when the user looks at the
-- receipt."*
--
-- ── WHY A SOFT DELETE, AND WHY THE REASON IS NOT OPTIONAL ───────────────────────────────────────
--
-- A receipt is a tax record. "This line was on the paper and we are not claiming it" and "this line
-- was never on the paper" are different assertions, and only one of them is a correction — so a
-- hard DELETE destroys the evidence that the decision was ever made. `removed_at` keeps the row and
-- `removed_reason` keeps the argument, which is the half that matters if anybody ever asks.
--
-- The reason is enforced by a CHECK rather than by the form, because a form is one caller. A row
-- that is removed with no reason is a decision nobody can defend later, and the database is the
-- only place that can refuse it on behalf of every future caller.
--
-- ── is_business_expense IS NULLABLE ON PURPOSE ──────────────────────────────────────────────────
--
-- Three states, not two: TRUE claim it, FALSE do not, NULL nobody has said. NULL inherits whatever
-- the receipt as a whole is set to, which is the common case — most receipts are entirely business
-- and nobody should have to tick twenty lines to say so. Defaulting to TRUE would silently claim
-- every line of a mixed receipt; defaulting to FALSE would silently drop them.

ALTER TABLE public.receipt_line_items
  -- NULL = follow the receipt. TRUE/FALSE = somebody decided about this line specifically.
  ADD COLUMN IF NOT EXISTS is_business_expense boolean,
  ADD COLUMN IF NOT EXISTS business_expense_note text,

  -- Where the line came from. 'ai' is a transcription; 'user' is a line a person says was on the
  -- paper and the AI missed. They are not interchangeable: a re-extraction may replace the first
  -- and must never touch the second.
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'ai',
  ADD COLUMN IF NOT EXISTS added_by text,
  ADD COLUMN IF NOT EXISTS added_reason text,

  -- Soft delete. The row stays; it stops counting.
  ADD COLUMN IF NOT EXISTS removed_at timestamptz,
  ADD COLUMN IF NOT EXISTS removed_by text,
  ADD COLUMN IF NOT EXISTS removed_reason text,

  -- Set the first time a human changes description/amount/quantity, so a re-extraction can tell an
  -- untouched transcription from one somebody has already corrected.
  ADD COLUMN IF NOT EXISTS edited_at timestamptz,
  ADD COLUMN IF NOT EXISTS edited_by text;

COMMENT ON COLUMN public.receipt_line_items.is_business_expense IS
  'TRUE claim it, FALSE do not, NULL follow the receipt. NULL is the default because most receipts are wholly one or the other.';
COMMENT ON COLUMN public.receipt_line_items.source IS
  'ai = transcribed from the photo. user = a person added it. A re-extraction replaces ai rows only.';
COMMENT ON COLUMN public.receipt_line_items.removed_at IS
  'Soft delete. The row is kept because "we saw this and are not claiming it" is evidence, not noise.';

DO $$
BEGIN
  -- A source we do not recognise would be treated as 'ai' by the re-extraction rule and silently
  -- wiped, so the set is closed here rather than trusted to callers.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'receipt_line_items_source_check') THEN
    ALTER TABLE public.receipt_line_items
      ADD CONSTRAINT receipt_line_items_source_check CHECK (source IN ('ai', 'user'));
  END IF;

  -- The reason is the point of the soft delete. Enforced here so no caller can skip it.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'receipt_line_items_removed_reason_check') THEN
    ALTER TABLE public.receipt_line_items
      ADD CONSTRAINT receipt_line_items_removed_reason_check
      CHECK (removed_at IS NULL OR (removed_reason IS NOT NULL AND length(btrim(removed_reason)) > 0));
  END IF;

  -- Same for an added line: a line that is not on the paper needs to say why it is on the record.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'receipt_line_items_added_reason_check') THEN
    ALTER TABLE public.receipt_line_items
      ADD CONSTRAINT receipt_line_items_added_reason_check
      CHECK (source <> 'user' OR (added_reason IS NOT NULL AND length(btrim(added_reason)) > 0));
  END IF;
END $$;

-- The viewer asks for one receipt's lines including removed ones, newest decisions last.
CREATE INDEX IF NOT EXISTS idx_receipt_line_items_receipt
  ON public.receipt_line_items (receipt_id, position);

-- "Show me every line somebody excluded, and why" — the review question this whole slice exists for.
CREATE INDEX IF NOT EXISTS idx_receipt_line_items_removed
  ON public.receipt_line_items (removed_at) WHERE removed_at IS NOT NULL;

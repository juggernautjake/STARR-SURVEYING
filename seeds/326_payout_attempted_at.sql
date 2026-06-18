-- ============================================================================
-- 326_payout_attempted_at.sql
--
-- P14 of payment-infrastructure-2026-06-18.md — add `attempted_at`
-- to payout_batch_items so the audit trail can distinguish:
--
--   created_at    — row added to the batch (when the office built it)
--   attempted_at  — first transition out of pending (when dispatch
--                   actually fired — even if it later failed)
--   paid_at       — confirmed cleared (terminal happy path)
--   updated_at    — last touch (anything moves this)
--
-- Idempotent — re-runnable.
-- ============================================================================

BEGIN;

ALTER TABLE public.payout_batch_items
  ADD COLUMN IF NOT EXISTS attempted_at TIMESTAMPTZ;

COMMENT ON COLUMN public.payout_batch_items.attempted_at IS
  'Timestamp of the first transition out of pending (sent / paid / failed). '
  'Distinct from created_at (row added to batch) and paid_at (terminal '
  'cleared). Stamped by the dispatch mark route.';

CREATE INDEX IF NOT EXISTS idx_payout_batch_items_user_attempted
  ON public.payout_batch_items (user_email, attempted_at DESC);

COMMIT;

-- ============================================================================
-- 322_lead_replies_direction.sql
--
-- LR7 of lead-reply-expansion-2026-06-18.md — extend `lead_replies` so
-- inbound (customer-side) messages can live in the same table as the
-- outbound (office-side) replies. The lead detail page renders both
-- in a single time-sorted thread.
--
-- New columns:
--   - direction   TEXT NOT NULL DEFAULT 'outbound'
--                 CHECK (direction IN ('outbound', 'inbound'))
--   - from_email  TEXT       — the inbound sender (the customer);
--                             null for outbound rows (we already have
--                             sender_email).
--   - inbound_message_id TEXT — provider-supplied message id so the
--                             webhook can dedupe on resend.
--   - body_html nullable now — inbound providers often only deliver
--                             plain text (Resend Inbound, Postmark,
--                             SendGrid all send `text` separately).
--
-- Idempotent — every ALTER is `ADD COLUMN IF NOT EXISTS` so a fresh
-- DB and an existing DB end up with the same shape.
-- ============================================================================

BEGIN;

ALTER TABLE public.lead_replies
  ADD COLUMN IF NOT EXISTS direction          TEXT NOT NULL DEFAULT 'outbound',
  ADD COLUMN IF NOT EXISTS from_email         TEXT,
  ADD COLUMN IF NOT EXISTS inbound_message_id TEXT;

-- body_html was NOT NULL when seed 319 created the table; inbound
-- providers don't always carry an HTML part. Relax the constraint so
-- a text-only inbound row can land. The existing outbound writers
-- still populate it.
DO $$ BEGIN
  ALTER TABLE public.lead_replies ALTER COLUMN body_html DROP NOT NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

-- Backfill the new direction column on existing rows so the CHECK
-- constraint we're about to add can take.
UPDATE public.lead_replies SET direction = 'outbound' WHERE direction IS NULL;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'lead_replies_direction_check'
  ) THEN
    ALTER TABLE public.lead_replies
      ADD CONSTRAINT lead_replies_direction_check
      CHECK (direction IN ('outbound', 'inbound'));
  END IF;
EXCEPTION WHEN others THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_lead_replies_lead_direction_sent
  ON public.lead_replies (lead_id, direction, sent_at DESC);

-- Unique constraint on (direction, inbound_message_id) where the id
-- exists, so a webhook retry doesn't double-insert. Outbound rows
-- have null inbound_message_id and the partial index excludes them
-- so they don't compete for the unique slot.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_lead_replies_inbound_message_id
  ON public.lead_replies (inbound_message_id)
  WHERE inbound_message_id IS NOT NULL;

COMMIT;

-- Verification:
--   SELECT column_name, is_nullable, column_default
--     FROM information_schema.columns
--    WHERE table_schema='public' AND table_name='lead_replies'
--      AND column_name IN ('direction','from_email','inbound_message_id','body_html')
--    ORDER BY column_name;

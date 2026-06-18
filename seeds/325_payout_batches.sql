-- ============================================================================
-- 325_payout_batches.sql
--
-- P11 of payment-infrastructure-2026-06-18.md — weekly payout batches.
-- Two tables:
--
--   1. payout_batches      — header row per weekly batch (or ad-hoc
--                            one-off bonus from P15)
--   2. payout_batch_items  — per-employee line on the batch
--
-- Status enum on the header tracks the approval + dispatch cycle:
--   draft       — office is building the batch
--   approved    — designated payout admin signed off (P12)
--   dispatched  — per-method dispatch fired (P13)
--   completed   — every line is paid + reconciled
--   voided      — batch was cancelled before dispatch
--
-- Per-line status mirrors the per-employee progress:
--   pending     — not yet dispatched
--   sent        — Venmo / NACHA / etc. fired
--   paid        — confirmed cleared (or cash handed out)
--   failed      — bounced ACH, declined Venmo, etc.
--
-- Idempotent — re-runnable.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.payout_batches (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Identifier the office reads: "Week 2026-06-15 → 2026-06-21".
  -- Computed from week_start; ad-hoc batches set kind='ad_hoc'.
  label              TEXT NOT NULL,
  kind               TEXT NOT NULL DEFAULT 'weekly'
                       CHECK (kind IN ('weekly', 'ad_hoc')),
  week_start         DATE,
  week_end           DATE,
  status             TEXT NOT NULL DEFAULT 'draft'
                       CHECK (status IN ('draft', 'approved', 'dispatched', 'completed', 'voided')),
  total_cents        INTEGER NOT NULL DEFAULT 0,
  notes              TEXT,
  created_by         TEXT NOT NULL,
  approved_by        TEXT,
  approved_at        TIMESTAMPTZ,
  -- Approval signature — admin email + IP at approval time so we
  -- have a clean audit trail for any disputed payouts (P12).
  approval_ip        TEXT,
  dispatched_at      TIMESTAMPTZ,
  completed_at       TIMESTAMPTZ,
  voided_at          TIMESTAMPTZ,
  voided_by          TEXT,
  org_id             UUID DEFAULT '00000000-0000-0000-0000-000000000001'::UUID,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT payout_batches_week_window
    CHECK ((kind = 'weekly' AND week_start IS NOT NULL AND week_end IS NOT NULL)
        OR (kind = 'ad_hoc'))
);

COMMENT ON TABLE public.payout_batches IS
  'Weekly payroll batches (kind=weekly) + one-off bonuses (kind=ad_hoc). '
  'Status drives the approval / dispatch / completion lifecycle. Approval '
  'admin email + IP stored at approval time for the audit trail.';

CREATE INDEX IF NOT EXISTS idx_payout_batches_status
  ON public.payout_batches (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payout_batches_week
  ON public.payout_batches (week_start DESC, week_end DESC);

CREATE TABLE IF NOT EXISTS public.payout_batch_items (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id                 UUID NOT NULL REFERENCES public.payout_batches(id) ON DELETE CASCADE,
  user_email               TEXT NOT NULL,
  user_name                TEXT,
  -- The component totals are the office's working numbers. Sum
  -- lives on `total_cents` (computed at insert / update time by
  -- the app layer).
  hours_cents              INTEGER NOT NULL DEFAULT 0,
  bonuses_cents            INTEGER NOT NULL DEFAULT 0,
  reimbursements_cents     INTEGER NOT NULL DEFAULT 0,
  adjustments_cents        INTEGER NOT NULL DEFAULT 0,
  total_cents              INTEGER NOT NULL DEFAULT 0,
  -- Dispatch method snapshotted at batch-build time so a later
  -- change to the employee's preferred method doesn't retroactively
  -- alter the dispatch path. Mirrors the P2 method enum.
  method                   TEXT
                             CHECK (method IN ('venmo', 'cashapp', 'zelle', 'ach', 'cash')),
  method_handle            TEXT,
  status                   TEXT NOT NULL DEFAULT 'pending'
                             CHECK (status IN ('pending', 'sent', 'paid', 'failed')),
  external_ref             TEXT,
  paid_at                  TIMESTAMPTZ,
  failure_reason           TEXT,
  notes                    TEXT,
  org_id                   UUID DEFAULT '00000000-0000-0000-0000-000000000001'::UUID,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.payout_batch_items IS
  'One row per (batch, employee). Component cents columns are the '
  'office working numbers; total_cents is the per-row sum that '
  'flows into payout_batches.total_cents.';

-- One row per employee per batch — prevents accidental double-add.
CREATE UNIQUE INDEX IF NOT EXISTS idx_payout_batch_items_unique
  ON public.payout_batch_items (batch_id, user_email);

CREATE INDEX IF NOT EXISTS idx_payout_batch_items_status
  ON public.payout_batch_items (status, paid_at DESC);

-- Shared updated_at trigger from seed 323.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['payout_batches', 'payout_batch_items'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I_updated_at ON public.%I', t, t);
    EXECUTE format(
      'CREATE TRIGGER %I_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.payments_set_updated_at()',
      t, t
    );
  END LOOP;
END $$;

-- RLS — service role full access; employees can read their own line
-- items (so an "I got paid" page works in a future slice).
ALTER TABLE public.payout_batches      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payout_batch_items  ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY service_role_full_access_payout_batches
    ON public.payout_batches FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY service_role_full_access_payout_batch_items
    ON public.payout_batch_items FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY employee_self_read_payout_batch_items
    ON public.payout_batch_items FOR SELECT TO authenticated
    USING (user_email = (auth.jwt() ->> 'email'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMIT;

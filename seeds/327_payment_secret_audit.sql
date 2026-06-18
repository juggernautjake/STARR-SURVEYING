-- ============================================================================
-- 327_payment_secret_audit.sql
--
-- P17 of payment-infrastructure-2026-06-18.md — audit log for every
-- read of an encrypted ACH column.
--
-- The encryption itself ships in seed 324 (employee_payment_methods
-- ACH columns + pgp_sym_encrypt / pgp_sym_decrypt SQL helpers). This
-- log gives us a paper trail: WHO read WHICH employee's ACH and WHY
-- (filing a payroll batch, IRS inquiry, employee asked to update,
-- etc.).
--
-- Read = a decrypt operation through the app-layer helper in
-- lib/payments/secrets.ts. The helper INSERTs one row per read
-- before returning the plaintext.
--
-- Idempotent — re-runnable.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.payment_secret_reads (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Who triggered the read.
  reader_email    TEXT NOT NULL,
  reader_ip       TEXT,
  -- What was read.
  target_table    TEXT NOT NULL,             -- 'employee_payment_methods'
  target_id       UUID,                       -- payment_methods.id
  subject_email   TEXT,                       -- employee whose secret was read
  field_name      TEXT NOT NULL,              -- 'ach_account_number_enc' / 'ach_routing_number_enc'
  -- Why.
  reason          TEXT NOT NULL,              -- 'payroll_dispatch', 'employee_self_view', 'audit', etc.
  -- Result.
  succeeded       BOOLEAN NOT NULL DEFAULT TRUE,
  error_message   TEXT,
  org_id          UUID DEFAULT '00000000-0000-0000-0000-000000000001'::UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.payment_secret_reads IS
  'Audit log — one row per decrypt of an encrypted ACH column. '
  'Inserted by the app-layer helper before the plaintext is returned. '
  'Append-only: rows are never updated or deleted (the table is the '
  'paper trail). Service-role only for both read + write.';

CREATE INDEX IF NOT EXISTS idx_payment_secret_reads_subject
  ON public.payment_secret_reads (subject_email, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_secret_reads_reader
  ON public.payment_secret_reads (reader_email, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_secret_reads_target
  ON public.payment_secret_reads (target_table, target_id, created_at DESC);

-- RLS — service role only. No employee-self-read; the table is for
-- the office's compliance officer to query, not for the employee
-- whose secret was read (that data is what's already shown on
-- their profile).
ALTER TABLE public.payment_secret_reads ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY service_role_full_access_payment_secret_reads
    ON public.payment_secret_reads FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMIT;

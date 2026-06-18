-- ============================================================================
-- 324_employee_payment_methods.sql
--
-- P2 of payment-infrastructure-2026-06-18.md — per-employee preferred
-- payment methods for outbound payouts.
--
-- One row per (user_email, kind, handle) combination. An employee can
-- have several methods on file (e.g. Venmo + ACH); exactly one is
-- marked `is_primary = TRUE` and routes the default payout. The office
-- can fall back to a non-primary method when the primary one fails.
--
-- Encryption posture (per the plan's "Top notch security" line):
--   - venmo / cashapp / zelle handles are PUBLIC on those platforms
--     (anyone with the handle can send to them, that's the whole
--     point). They live in plaintext under `handle`.
--   - ACH account + routing numbers are sensitive. They live in the
--     encrypted columns `ach_account_number_enc` and
--     `ach_routing_number_enc` as `pgp_sym_encrypt` BYTEA blobs keyed
--     by env var `PAYMENT_ENCRYPTION_KEY`. The plaintext columns are
--     never present on this row.
--   - `cash` is a marker — no handle stored; the employee just
--     receives currency in person.
--
-- Idempotent — re-runnable.
-- ============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.employee_payment_methods (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email               TEXT NOT NULL,
  kind                     TEXT NOT NULL
                             CHECK (kind IN ('venmo', 'cashapp', 'zelle', 'ach', 'cash')),
  -- Public-handle methods (venmo / cashapp / zelle) store their
  -- platform handle here. NULL for ach + cash.
  handle                   TEXT,
  display_name             TEXT,
  -- ACH-only: encrypted account + routing via pgcrypto's pgp_sym_encrypt.
  -- App layer derives the key from env var PAYMENT_ENCRYPTION_KEY; the
  -- key never lives in this table.
  ach_account_number_enc   BYTEA,
  ach_routing_number_enc   BYTEA,
  ach_account_type         TEXT CHECK (ach_account_type IN ('checking', 'savings')),
  is_primary               BOOLEAN NOT NULL DEFAULT FALSE,
  verified                 BOOLEAN NOT NULL DEFAULT FALSE,
  verified_at              TIMESTAMPTZ,
  verified_by              TEXT,
  notes                    TEXT,
  org_id                   UUID DEFAULT '00000000-0000-0000-0000-000000000001'::UUID,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Public-handle methods MUST carry a handle; ACH + cash MUST NOT.
  CONSTRAINT employee_payment_methods_handle_shape
    CHECK (
      (kind IN ('venmo', 'cashapp', 'zelle') AND handle IS NOT NULL AND length(handle) > 0)
      OR (kind = 'cash' AND handle IS NULL)
      OR (kind = 'ach' AND handle IS NULL)
    ),
  -- ACH columns must travel together — never one without the other.
  CONSTRAINT employee_payment_methods_ach_shape
    CHECK (
      (kind = 'ach' AND ach_account_number_enc IS NOT NULL AND ach_routing_number_enc IS NOT NULL)
      OR (kind <> 'ach' AND ach_account_number_enc IS NULL AND ach_routing_number_enc IS NULL)
    )
);

COMMENT ON TABLE public.employee_payment_methods IS
  'Per-employee payout methods. Public handles (venmo/cashapp/zelle) '
  'live plaintext; ACH account + routing live encrypted via pgcrypto. '
  'Exactly one row per user is is_primary = TRUE (enforced by partial '
  'unique index idx_employee_payment_methods_primary).';

-- One primary method per employee — enforced via partial unique index
-- so non-primary rows don't conflict with each other.
CREATE UNIQUE INDEX IF NOT EXISTS idx_employee_payment_methods_primary
  ON public.employee_payment_methods (user_email)
  WHERE is_primary = TRUE;

-- No duplicate public handles per (user, kind) — Venmo "@mary" once
-- per user, not five times.
CREATE UNIQUE INDEX IF NOT EXISTS idx_employee_payment_methods_kind_handle
  ON public.employee_payment_methods (user_email, kind, handle)
  WHERE handle IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_employee_payment_methods_user
  ON public.employee_payment_methods (user_email);

-- ── updated_at trigger ───────────────────────────────────────────────────────
-- Shares the trigger function from seed 323 so the payment schema
-- has a single maintainer.
DROP TRIGGER IF EXISTS employee_payment_methods_updated_at
  ON public.employee_payment_methods;
CREATE TRIGGER employee_payment_methods_updated_at
  BEFORE UPDATE ON public.employee_payment_methods
  FOR EACH ROW EXECUTE FUNCTION public.payments_set_updated_at();

-- ── pgcrypto helpers ─────────────────────────────────────────────────────────
-- Thin SECURITY DEFINER wrappers so the app never has to splice the
-- raw key into a query — it passes the plaintext + the key and gets
-- back the BYTEA blob (or the reverse).
CREATE OR REPLACE FUNCTION public.encrypt_ach_secret(plaintext TEXT, key TEXT)
RETURNS BYTEA AS $$
  SELECT pgp_sym_encrypt(plaintext, key);
$$ LANGUAGE SQL STRICT;

CREATE OR REPLACE FUNCTION public.decrypt_ach_secret(ciphertext BYTEA, key TEXT)
RETURNS TEXT AS $$
  SELECT pgp_sym_decrypt(ciphertext, key);
$$ LANGUAGE SQL STRICT;

COMMENT ON FUNCTION public.encrypt_ach_secret(TEXT, TEXT) IS
  'Encrypt an ACH account or routing number with the key from env '
  'PAYMENT_ENCRYPTION_KEY. App layer keeps the key out of the DB.';

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- Customers never see this table. Service role gets full access; the
-- employee-owns-own-row policy lets an employee read THEIR own
-- methods (Supabase JWT email claim).
ALTER TABLE public.employee_payment_methods ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY service_role_full_access_employee_payment_methods
    ON public.employee_payment_methods
    FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY employee_self_read_payment_methods
    ON public.employee_payment_methods
    FOR SELECT TO authenticated
    USING (user_email = (auth.jwt() ->> 'email'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMIT;

-- Verification:
--   SELECT to_regclass('public.employee_payment_methods');
--   SELECT proname FROM pg_proc
--    WHERE proname IN ('encrypt_ach_secret', 'decrypt_ach_secret');

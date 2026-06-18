-- ============================================================================
-- 323_payment_foundations.sql
--
-- P1 of payment-infrastructure-2026-06-18.md — five payment tables
-- that everything else hangs off. Status columns use CHECK constraints
-- (not Postgres ENUMs) so future statuses ship without an ALTER TYPE
-- dance.
--
--   1. invoices             — the customer-facing record
--   2. payments             — completed payment records
--   3. payment_intents      — Stripe PaymentIntent shadow rows
--   4. payment_attempts     — every attempt incl. cash/check pledges
--   5. payment_receipts     — generated receipt PDFs / Resend sends
--
-- Public-facing surface: `/pay` looks up invoices by EITHER
-- invoice_number (printed on the paper invoice) OR public_slug
-- (the URL-safe token in deep links). Both unique; the slug
-- prevents enumeration / scraping.
--
-- Idempotent — re-runnable.
-- ============================================================================

BEGIN;

-- ── 1. invoices ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.invoices (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number  TEXT NOT NULL UNIQUE,
  public_slug     TEXT NOT NULL UNIQUE,
  job_id          UUID REFERENCES public.jobs(id) ON DELETE SET NULL,
  -- Snapshot the customer's contact at invoice time so receipts always
  -- have somewhere to land even if the lead's contact info changes later.
  customer_email     TEXT,
  customer_name      TEXT,
  customer_phone     TEXT,
  billing_address    JSONB NOT NULL DEFAULT '{}'::JSONB,
  -- Line items: [{ description, quantity, unit_price_cents, total_cents }]
  line_items         JSONB NOT NULL DEFAULT '[]'::JSONB,
  subtotal_cents     INTEGER NOT NULL DEFAULT 0,
  tax_cents          INTEGER NOT NULL DEFAULT 0,
  total_cents        INTEGER NOT NULL DEFAULT 0,
  status             TEXT NOT NULL DEFAULT 'draft'
                       CHECK (status IN ('draft', 'issued', 'partial', 'paid', 'voided', 'overdue', 'refunded')),
  issued_at          TIMESTAMPTZ,
  due_at             TIMESTAMPTZ,
  paid_at            TIMESTAMPTZ,
  voided_at          TIMESTAMPTZ,
  notes              TEXT,
  created_by         TEXT,
  org_id             UUID DEFAULT '00000000-0000-0000-0000-000000000001'::UUID,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.invoices IS
  'Customer-facing invoices. Identified to customers by invoice_number; URL-safe via public_slug.';

CREATE INDEX IF NOT EXISTS idx_invoices_status_issued
  ON public.invoices (status, issued_at DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_job
  ON public.invoices (job_id);
CREATE INDEX IF NOT EXISTS idx_invoices_customer_email
  ON public.invoices (customer_email);

-- ── 2. payments ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.payments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id          UUID NOT NULL REFERENCES public.invoices(id) ON DELETE RESTRICT,
  amount_cents        INTEGER NOT NULL CHECK (amount_cents >= 0),
  method              TEXT NOT NULL
                        CHECK (method IN ('stripe', 'venmo', 'cashapp', 'zelle', 'ach', 'cash', 'check', 'other')),
  status              TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'succeeded', 'failed', 'refunded', 'voided')),
  external_id         TEXT,    -- Stripe charge id, Venmo tx id, check number…
  external_provider   TEXT,    -- 'stripe' / 'venmo' / 'cashapp' / 'zelle' / 'pnc' / 'manual'
  payer_email         TEXT,
  payer_note          TEXT,
  cleared_at          TIMESTAMPTZ,
  reconciled_by       TEXT,    -- staff email for cash/check confirms
  notes               TEXT,
  org_id              UUID DEFAULT '00000000-0000-0000-0000-000000000001'::UUID,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.payments IS
  'Cleared payment records. Multiple payments per invoice supports partial / split-tender.';

CREATE INDEX IF NOT EXISTS idx_payments_invoice
  ON public.payments (invoice_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_status
  ON public.payments (status, cleared_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_external
  ON public.payments (external_provider, external_id);

-- ── 3. payment_intents ───────────────────────────────────────────────────────
-- Shadow rows for Stripe PaymentIntents — lets the webhook find the
-- invoice quickly when an intent succeeds.
CREATE TABLE IF NOT EXISTS public.payment_intents (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id          UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  provider            TEXT NOT NULL DEFAULT 'stripe',
  external_intent_id  TEXT NOT NULL UNIQUE,
  amount_cents        INTEGER NOT NULL,
  currency            TEXT NOT NULL DEFAULT 'usd',
  status              TEXT NOT NULL DEFAULT 'requires_payment_method',
  client_secret       TEXT,
  metadata            JSONB NOT NULL DEFAULT '{}'::JSONB,
  last_error          TEXT,
  org_id              UUID DEFAULT '00000000-0000-0000-0000-000000000001'::UUID,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_intents_invoice
  ON public.payment_intents (invoice_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_intents_status
  ON public.payment_intents (status);

-- ── 4. payment_attempts ──────────────────────────────────────────────────────
-- Every attempt the customer makes on /pay, including:
--   - Stripe card/ACH attempts (`started` → `succeeded`/`failed`)
--   - Cash/check pledges (`pledged` → office close-out → `succeeded`)
--   - Venmo/CashApp/Zelle "I sent it" claims (`pending_confirmation`
--     → office matches the platform tx → `succeeded`)
CREATE TABLE IF NOT EXISTS public.payment_attempts (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id               UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  method                   TEXT NOT NULL
                             CHECK (method IN ('stripe', 'venmo', 'cashapp', 'zelle', 'ach', 'cash', 'check', 'other')),
  intended_amount_cents    INTEGER NOT NULL CHECK (intended_amount_cents >= 0),
  status                   TEXT NOT NULL DEFAULT 'started'
                             CHECK (status IN ('started', 'pledged', 'pending_confirmation', 'succeeded', 'failed', 'abandoned')),
  external_ref             TEXT,
  payer_email              TEXT,
  payer_message            TEXT,
  confirmed_by             TEXT,
  confirmed_at             TIMESTAMPTZ,
  resulted_in_payment_id   UUID REFERENCES public.payments(id) ON DELETE SET NULL,
  org_id                   UUID DEFAULT '00000000-0000-0000-0000-000000000001'::UUID,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_attempts_invoice
  ON public.payment_attempts (invoice_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_attempts_status_method
  ON public.payment_attempts (status, method);
CREATE INDEX IF NOT EXISTS idx_payment_attempts_pending
  ON public.payment_attempts (status)
  WHERE status IN ('pledged', 'pending_confirmation');

-- ── 5. payment_receipts ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.payment_receipts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id          UUID NOT NULL REFERENCES public.payments(id) ON DELETE CASCADE,
  invoice_id          UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  storage_path        TEXT,    -- path in the (future) receipts bucket
  sent_to_email       TEXT,
  sent_at             TIMESTAMPTZ,
  resend_id           TEXT,
  send_error          TEXT,
  org_id              UUID DEFAULT '00000000-0000-0000-0000-000000000001'::UUID,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_receipts_payment
  ON public.payment_receipts (payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_receipts_invoice
  ON public.payment_receipts (invoice_id);

-- ── updated_at triggers ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.payments_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['invoices', 'payments', 'payment_intents', 'payment_attempts'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I_updated_at ON public.%I', t, t);
    EXECUTE format(
      'CREATE TRIGGER %I_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.payments_set_updated_at()',
      t, t
    );
  END LOOP;
END $$;

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- Customer-facing reads route through service-role API endpoints that
-- gate by invoice_number / public_slug. Service role gets full access;
-- anon / authenticated direct table access is blocked.
ALTER TABLE public.invoices         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_intents  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_receipts ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY service_role_full_access_invoices ON public.invoices
    FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY service_role_full_access_payments ON public.payments
    FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY service_role_full_access_payment_intents ON public.payment_intents
    FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY service_role_full_access_payment_attempts ON public.payment_attempts
    FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY service_role_full_access_payment_receipts ON public.payment_receipts
    FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMIT;

-- Verification:
--   SELECT to_regclass('public.invoices'),
--          to_regclass('public.payments'),
--          to_regclass('public.payment_intents'),
--          to_regclass('public.payment_attempts'),
--          to_regclass('public.payment_receipts');
--   -- all five non-null

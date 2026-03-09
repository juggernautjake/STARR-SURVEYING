-- seeds/093_phase15_wallet_tables.sql
-- Phase 15: Document Wallet & Purchase History Schema
--
-- Creates the two tables deferred from Phase 14:
--   1. document_wallet_balance  — Per-user pre-funded document purchase wallet
--   2. document_purchase_history — Complete audit trail of all document transactions
--
-- These tables integrate with:
--   • app/api/webhooks/stripe/route.ts (credit/debit on payment events)
--   • worker/src/services/document-access-orchestrator.ts (debit on purchases)
--   • app/api/admin/research/billing/route.ts (balance display)
--   • app/admin/research/billing/page.tsx (wallet UI)
--
-- Phase 15 Spec §15.10 — Document Wallet Schema
-- v1.0: Initial implementation

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Document Wallet Balance
-- ─────────────────────────────────────────────────────────────────────────────
-- Stores the current pre-funded wallet balance for each user.
-- Funded via Stripe Checkout; debited on each automated document purchase.

CREATE TABLE IF NOT EXISTS document_wallet_balance (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email      text NOT NULL UNIQUE,
  balance_usd     numeric(10, 2) NOT NULL DEFAULT 0.00 CHECK (balance_usd >= 0),
  lifetime_funded_usd  numeric(10, 2) NOT NULL DEFAULT 0.00,
  lifetime_spent_usd   numeric(10, 2) NOT NULL DEFAULT 0.00,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Index for common query pattern (lookup by user)
CREATE INDEX IF NOT EXISTS idx_document_wallet_user_email
  ON document_wallet_balance (user_email);

-- RLS: Users can read their own wallet; service role can write
ALTER TABLE document_wallet_balance ENABLE ROW LEVEL SECURITY;

CREATE POLICY document_wallet_select_own
  ON document_wallet_balance
  FOR SELECT
  USING (auth.jwt() ->> 'email' = user_email);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Document Purchase History
-- ─────────────────────────────────────────────────────────────────────────────
-- Immutable audit log of every document wallet transaction:
--   wallet_credit    — User funded wallet via Stripe Checkout
--   document_purchase — Document purchased via paid platform (debit)
--   refund           — Partial/full refund credited back
--   payment_failed   — Stripe payment attempt that failed

CREATE TABLE IF NOT EXISTS document_purchase_history (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email          text NOT NULL,
  transaction_type    text NOT NULL CHECK (
    transaction_type IN (
      'wallet_credit',
      'document_purchase',
      'refund',
      'payment_failed'
    )
  ),
  amount_usd          numeric(10, 2) NOT NULL DEFAULT 0.00,

  -- Purchase context (populated for document_purchase rows)
  project_id          text,
  instrument_number   text,
  county_fips         text,
  county_name         text,
  document_type       text,
  platform            text,  -- PaidPlatformId (e.g. 'tyler_pay', 'texasfile')
  pages               integer,
  cost_per_page_usd   numeric(10, 4),

  -- Document delivery
  image_paths         text[],          -- Local file paths on worker droplet
  download_url        text,            -- Supabase signed URL (expires)
  quality_score       integer,         -- 0–100 image quality estimate
  is_watermarked      boolean NOT NULL DEFAULT false,

  -- Payment reference
  stripe_session_id   text,
  stripe_payment_intent_id text,

  -- Status
  status              text NOT NULL DEFAULT 'completed' CHECK (
    status IN ('completed', 'failed', 'pending', 'refunded')
  ),
  error_message       text,

  -- Metadata (JSON bag for platform-specific fields)
  metadata            jsonb,

  created_at          timestamptz NOT NULL DEFAULT now()
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_doc_purchase_user_email
  ON document_purchase_history (user_email, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_doc_purchase_project
  ON document_purchase_history (project_id)
  WHERE project_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_doc_purchase_instrument
  ON document_purchase_history (instrument_number)
  WHERE instrument_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_doc_purchase_type
  ON document_purchase_history (transaction_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_doc_purchase_stripe_session
  ON document_purchase_history (stripe_session_id)
  WHERE stripe_session_id IS NOT NULL;

-- RLS: Users can read their own history; service role can write
ALTER TABLE document_purchase_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY document_purchase_history_select_own
  ON document_purchase_history
  FOR SELECT
  USING (auth.jwt() ->> 'email' = user_email);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Wallet Balance Trigger
-- ─────────────────────────────────────────────────────────────────────────────
-- Automatically update lifetime_funded_usd and lifetime_spent_usd on the
-- wallet balance row whenever a document_purchase_history row is inserted.

CREATE OR REPLACE FUNCTION sync_wallet_lifetime_totals()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Upsert wallet balance row if it doesn't exist yet
  INSERT INTO document_wallet_balance (user_email, balance_usd, lifetime_funded_usd, lifetime_spent_usd)
  VALUES (NEW.user_email, 0.00, 0.00, 0.00)
  ON CONFLICT (user_email) DO NOTHING;

  IF NEW.transaction_type = 'wallet_credit' AND NEW.status = 'completed' THEN
    UPDATE document_wallet_balance
    SET
      balance_usd = balance_usd + NEW.amount_usd,
      lifetime_funded_usd = lifetime_funded_usd + NEW.amount_usd,
      updated_at = now()
    WHERE user_email = NEW.user_email;

  ELSIF NEW.transaction_type = 'document_purchase' AND NEW.status = 'completed' THEN
    UPDATE document_wallet_balance
    SET
      balance_usd = GREATEST(0.00, balance_usd - NEW.amount_usd),
      lifetime_spent_usd = lifetime_spent_usd + NEW.amount_usd,
      updated_at = now()
    WHERE user_email = NEW.user_email;

  ELSIF NEW.transaction_type = 'refund' AND NEW.status = 'completed' THEN
    UPDATE document_wallet_balance
    SET
      balance_usd = balance_usd + NEW.amount_usd,
      updated_at = now()
    WHERE user_email = NEW.user_email;
  END IF;

  RETURN NEW;
END;
$$;

-- Drop old trigger if exists, then create
DROP TRIGGER IF EXISTS trg_sync_wallet_lifetime_totals ON document_purchase_history;

CREATE TRIGGER trg_sync_wallet_lifetime_totals
  AFTER INSERT ON document_purchase_history
  FOR EACH ROW EXECUTE FUNCTION sync_wallet_lifetime_totals();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Helper: Get wallet balance for a user (used in API queries)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_wallet_balance(p_user_email text)
RETURNS numeric(10, 2) LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT COALESCE(balance_usd, 0.00)
  FROM document_wallet_balance
  WHERE user_email = p_user_email;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Grants
-- ─────────────────────────────────────────────────────────────────────────────

GRANT SELECT ON document_wallet_balance TO authenticated;
GRANT SELECT ON document_purchase_history TO authenticated;
GRANT ALL ON document_wallet_balance TO service_role;
GRANT ALL ON document_purchase_history TO service_role;
GRANT EXECUTE ON FUNCTION get_wallet_balance TO authenticated;
GRANT EXECUTE ON FUNCTION get_wallet_balance TO service_role;

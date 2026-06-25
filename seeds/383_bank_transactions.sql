-- seeds/383_bank_transactions.sql
--
-- G3 / Phase 2.3 of BUSINESS_GO_LIVE_FINANCE_PAYMENTS_2026-06-25.md — imported
-- bank (PNC) transactions for reconciliation. Each row is matched to a payout,
-- an expense (receipt), or a customer payment so every dollar that moves
-- through the bank account is explained.
--
--   amount_cents is SIGNED: negative = debit (money out), positive = credit (in).
--
-- Idempotent.

BEGIN;

CREATE TABLE IF NOT EXISTS bank_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID,
  posted_at DATE NOT NULL,
  amount_cents INTEGER NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('debit', 'credit')),
  description TEXT,
  external_ref TEXT,
  source TEXT NOT NULL DEFAULT 'pnc_csv' CHECK (source IN ('pnc_csv', 'manual')),
  status TEXT NOT NULL DEFAULT 'unmatched' CHECK (status IN ('unmatched', 'matched', 'ignored')),
  matched_kind TEXT CHECK (matched_kind IN ('payout', 'expense', 'payment')),
  matched_id UUID,
  matched_at TIMESTAMPTZ,
  matched_by TEXT,
  notes TEXT,
  -- dedupe key so re-importing the same CSV doesn't double-insert.
  import_fingerprint TEXT,
  raw JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_bank_txn_fingerprint
  ON bank_transactions (import_fingerprint) WHERE import_fingerprint IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bank_txn_status ON bank_transactions (status, posted_at DESC);
CREATE INDEX IF NOT EXISTS idx_bank_txn_posted ON bank_transactions (posted_at DESC);

-- Reuse the payments-domain updated_at trigger fn (seed 323).
DROP TRIGGER IF EXISTS bank_transactions_set_updated_at ON bank_transactions;
CREATE TRIGGER bank_transactions_set_updated_at
  BEFORE UPDATE ON bank_transactions
  FOR EACH ROW EXECUTE FUNCTION payments_set_updated_at();

ALTER TABLE bank_transactions ENABLE ROW LEVEL SECURITY;

-- Reconciliation is an office/admin-only surface routed through the service
-- role; no employee-self-read (mirrors invoices/payments in seed 323).
DROP POLICY IF EXISTS service_role_full_access_bank_transactions ON bank_transactions;
CREATE POLICY service_role_full_access_bank_transactions ON bank_transactions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE bank_transactions IS
  'Imported bank (PNC) transactions for reconciliation against payouts / expenses / payments. amount_cents is signed (negative = debit). G3 / Phase 2.3.';

COMMIT;

-- seeds/576_pay_advance_repayment.sql
--
-- AN ADVANCE THAT IS NEVER RECOVERED IS A GIFT (pay consolidation C-17, 2026-08-04)
-- ════════════════════════════════════════════════════════════════════════════════
--
-- *"Please make sure the week history and pay advances are totally built out and functional too."*
--
-- `pay_advance_requests` could be requested, approved, denied and cancelled. What it could not do
-- was the thing that makes an advance an advance: **come back out of a later paycheque.** There was
-- no repaid amount, no instalment plan, no link to the stub that recovered it, and no state past
-- 'approved'. An approved advance was money out with nothing anywhere expecting it back.
--
-- Nobody had noticed because the table is empty — the firm has not run payroll yet. That is the
-- moment to fix it, before the first advance rather than after.
--
-- ── WHAT IS ADDED ───────────────────────────────────────────────────────────────────────────────
--
--   repaid_amount     — how much has come back so far. Outstanding is `amount - repaid_amount`.
--   repay_per_period  — optional instalment cap. NULL means "take it all from the next stub", which
--                       is the right default for the $200-until-Friday case; a bigger advance can be
--                       spread by setting a per-period figure.
--   paid_at           — already existed but was never written. Now the marker that the money
--                       actually left, which is what starts recovery.
--
-- Status flow: pending → approved → paid → repaid. Plus denied and cancelled, which are terminal.
-- 'approved' and 'paid' are deliberately separate: approving is a decision, paying is an event, and
-- collapsing them means a request that was blessed but never handed over still gets deducted from
-- somebody's wages.

ALTER TABLE pay_advance_requests
  ADD COLUMN IF NOT EXISTS repaid_amount     NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS repay_per_period  NUMERIC(10,2);

COMMENT ON COLUMN pay_advance_requests.repaid_amount IS
  'How much of the advance has been recovered from pay. Outstanding = amount - repaid_amount.';
COMMENT ON COLUMN pay_advance_requests.repay_per_period IS
  'Optional per-pay-period instalment cap. NULL recovers the full outstanding balance from the next stub.';

-- A ledger row per recovery, rather than only a running total on the request.
--
-- Two reasons it is a table and not a number. A person querying "why is my cheque short" needs the
-- specific stub and amount, not a balance that moved. And a voided payroll run has to give the money
-- back — that is only possible if each recovery is a row that can be reversed, rather than an
-- arithmetic result nobody kept the inputs for.
CREATE TABLE IF NOT EXISTS pay_advance_repayments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  advance_id   UUID NOT NULL REFERENCES pay_advance_requests(id) ON DELETE CASCADE,
  pay_stub_id  UUID REFERENCES pay_stubs(id) ON DELETE SET NULL,
  user_email   TEXT NOT NULL,
  amount       NUMERIC(10,2) NOT NULL,
  note         TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  org_id       UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'
);

CREATE INDEX IF NOT EXISTS pay_advance_repayments_advance_idx
  ON pay_advance_repayments (advance_id, created_at);

CREATE INDEX IF NOT EXISTS pay_advance_repayments_user_idx
  ON pay_advance_repayments (user_email, created_at DESC);

-- One recovery per advance per stub. Re-running a payroll run must not double-deduct: without this
-- a retried run would take the same instalment twice and the only evidence would be somebody's
-- short cheque.
CREATE UNIQUE INDEX IF NOT EXISTS pay_advance_repayments_stub_uniq
  ON pay_advance_repayments (advance_id, pay_stub_id)
  WHERE pay_stub_id IS NOT NULL;

-- ── What a person owes right now ───────────────────────────────────────────────────────────────
--
-- 'paid' only. An approved-but-unpaid advance is money the firm has not handed over, and deducting
-- it would take back something never given. A denied or cancelled one is not owed at all.
CREATE OR REPLACE VIEW pay_advances_outstanding AS
SELECT
  a.id,
  a.user_email,
  a.amount,
  a.repaid_amount,
  (a.amount - a.repaid_amount) AS outstanding,
  a.repay_per_period,
  a.reason,
  a.pay_date,
  a.paid_at,
  a.org_id
FROM pay_advance_requests a
WHERE a.status = 'paid'
  AND (a.amount - a.repaid_amount) > 0;

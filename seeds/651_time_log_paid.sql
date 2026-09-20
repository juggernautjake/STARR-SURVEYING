-- seeds/651_time_log_paid.sql — which hours have actually been paid for.
--
-- Owner, 2026-09-19: "I want it so that we can mark hours as approved and as paid. Eventually we
-- will link this to the payroll system so that once the hours are approved, the admin can run the
-- payroll to pay people for whatever hours they have that have been approved."
--
-- ── WHY THIS DID NOT EXIST, AND WHY IT HAS TO NOW ───────────────────────────────────────────────
--
-- Until today nothing in the schema said whether a single day's hours had been paid. The only
-- foreign key into `daily_time_logs` anywhere is `time_log_pay_decisions.time_log_id`, and that
-- records PRICING — what an hour was worth — not disbursement. Money out is tracked per PERSON:
-- `payout_batch_items` is unique per (batch, user_email), and `lib/payroll/owed.ts` opens by saying
-- the answer is a running balance, "everything approved, minus everything paid".
--
-- A balance answers "how much do we owe Jacob". It cannot answer "were THESE eight hours paid",
-- which is the question the approvals page asks once it is arranged by person and period. The
-- approvals page was therefore built to show the balance instead, with the gap written down rather
-- than papered over with cents ÷ rate.
--
-- The owner has now asked for the gap to be closed, so this is the linkage.
--
-- ── WHY A COLUMN HERE AND NOT A JOIN TABLE ──────────────────────────────────────────────────────
--
-- A join table (`payout_item_time_logs`) would be the textbook answer and is the wrong one for the
-- shape of this problem. An hour is paid at most once; there is no many-to-many to model. A nullable
-- `paid_at` on the row is the whole fact, it is indexable, and every query that already reads a time
-- log gets the answer for free rather than through a join it has to remember to write.
--
-- `payout_batch_id` is nullable ON PURPOSE. Hours get marked paid by hand today — the owner said
-- the payroll link comes "eventually" — and a NOT NULL batch would have made the feature impossible
-- to use until the payroll run existed. When a run does the marking it stamps the batch, and the two
-- cases stay distinguishable forever: a NULL batch means a person decided, a batch id means a run
-- did.
--
-- ── ONLY APPROVED HOURS MAY BE PAID ─────────────────────────────────────────────────────────────
--
-- Enforced in the route rather than here. A CHECK across two columns would also forbid the legitimate
-- repair of un-approving something already paid — which happens, and the fix for it is a conversation
-- and a correction, not a constraint failure with somebody's wages behind it.

BEGIN;

ALTER TABLE public.daily_time_logs
  -- When these hours were paid. NULL = not yet.
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  -- Who said so. An email for a person; NULL when a payroll run did it unattended.
  ADD COLUMN IF NOT EXISTS paid_by text,
  -- The payout run that paid it, when one did. Null for a hand-marked row — see above.
  ADD COLUMN IF NOT EXISTS payout_batch_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'daily_time_logs_payout_batch_fk'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'payout_batches'
  ) THEN
    ALTER TABLE public.daily_time_logs
      ADD CONSTRAINT daily_time_logs_payout_batch_fk
      FOREIGN KEY (payout_batch_id) REFERENCES public.payout_batches(id)
      -- SET NULL, not CASCADE. Voiding a payout run must never delete the record that somebody's
      -- hours were paid; it means the LINK is gone, not the payment.
      ON DELETE SET NULL;
  END IF;
END $$;

COMMENT ON COLUMN public.daily_time_logs.paid_at IS
  'When these hours were paid out. NULL = not yet. Set by an admin marking them paid, or by a payroll run (which also sets payout_batch_id). Only approved hours may be marked — enforced in the route, not by a CHECK, so that un-approving a paid row stays repairable. See seeds/651.';

-- The approvals page's question, per person per period: which approved hours are still unpaid?
CREATE INDEX IF NOT EXISTS idx_daily_time_logs_unpaid
  ON public.daily_time_logs (user_email, log_date)
  WHERE paid_at IS NULL;

-- And the payroll side's: what did this run pay for?
CREATE INDEX IF NOT EXISTS idx_daily_time_logs_payout_batch
  ON public.daily_time_logs (payout_batch_id)
  WHERE payout_batch_id IS NOT NULL;

COMMIT;

-- seeds/589_pay_period_close_batch_link.sql
--
-- Which payout settled the week you closed.
--
-- S7 of PAYROLL_HOURS_AND_EMPLOYEE_MONEY. Closing a period and paying for it were two unconnected
-- acts: `pay_period_locks` froze the week (and, since seed 587, recorded what it held at that
-- moment), while a payout batch was built separately with nothing tying the two together. So
-- "did we ever pay the week we closed on the 10th?" could only be answered by comparing dates by eye.
--
-- ── WHY THIS COLUMN COULD NOT BE ADDED UNTIL NOW ────────────────────────────────────────────────
--
-- It names a `payout_batches` row, and until D2 was decided (2026-08-12) there were two engines that
-- could settle a week — `payroll_runs` and `payout_batches` — with no answer to which one a close
-- should point at. A column referencing the loser would have been migrated or dropped. D2 chose
-- batches, so this is now a settled question and the FK can be written down.
--
-- ── WHAT IT DOES NOT MEAN ───────────────────────────────────────────────────────────────────────
--
-- **NOT "this batch contains exactly this week's hours".** The surviving engine is balance-driven,
-- not period-driven: `loadOwed` pays approved-minus-committed across all time, deliberately, so that
-- an hour logged late is never dropped. A batch prepared when a week is closed therefore settles
-- whatever was owed at that moment — usually this week's hours, plus anything older that had not
-- been paid yet.
--
-- So this records *"closing that week is what prompted this payout"*, which is the question a person
-- actually asks. Reading it as "these hours, exactly" would re-introduce the period-window thinking
-- the owed model exists to avoid.
--
-- Nullable, and null is the ordinary case: a week can be closed without paying anything that day,
-- and every lock taken before today has none. ON DELETE SET NULL because voiding and deleting a
-- batch must not take the lock with it — the week stays closed either way.

ALTER TABLE pay_period_locks
  ADD COLUMN IF NOT EXISTS payout_batch_id UUID REFERENCES payout_batches(id) ON DELETE SET NULL;

COMMENT ON COLUMN pay_period_locks.payout_batch_id IS
  'The payout batch prepared when this period was closed, when one was. NOT a claim that the batch '
  'contains exactly this period''s hours — payouts are balance-driven (lib/payroll/owed.ts), so a '
  'batch settles everything owed at that moment. It records what prompted the payout. NULL means '
  'the period was closed without preparing one, which is ordinary.';

CREATE INDEX IF NOT EXISTS idx_pay_period_locks_batch
  ON pay_period_locks (payout_batch_id)
  WHERE payout_batch_id IS NOT NULL;

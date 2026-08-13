-- seeds/588_payout_item_advance_recovery.sql
--
-- Recovering a pay advance out of a PAYOUT BATCH, now that batches are the surviving engine.
--
-- ── THE PROBLEM THIS SOLVES ──────────────────────────────────────────────────────────────────────
--
-- `planAdvanceRecovery` (lib/payroll/advance-recovery.ts) is called in exactly one place: the
-- payroll-run creation body. D2 retires that engine, and the batch path does not recover advances at
-- all — so retiring it first would silently turn every advance into a gift. This is the column that
-- has to exist before that can happen.
--
-- ── WHY A NEW COLUMN AND NOT `adjustments_cents` ─────────────────────────────────────────────────
--
-- `adjustments_cents` is a COMPONENT: seed 325 states that `total_cents` is the sum of hours +
-- bonuses + reimbursements + adjustments. Putting a −$200 recovery there would reduce `total_cents`
-- to $800 — and `total_cents` is what `lib/payroll/owed.ts` counts as paid, through
-- `payout-ledger.ts`'s `amount_cents`.
--
-- The consequence would be silent and permanent: somebody who earned $1,000 and repaid a $200
-- advance would have $800 counted against their earnings, leaving them **owed $200 for ever**. The
-- firm would pay the advance back to them, having just taken it. Nothing would look wrong; the
-- balance would simply never reach zero.
--
-- So the recovery is NOT a component of the total. It is a WITHHOLDING FROM it:
--
--     total_cents      — what this settles. All $1,000 of hours is discharged, because $800 went to
--                        the person and $200 went against a debt they already had. `owed` is right
--                        with no change at all to the owed model.
--     recovered_cents  — how much of that total stayed with the firm.
--     disbursed        — total_cents − recovered_cents. The figure that goes to a bank, a Venmo
--                        handle, or an envelope. Derived, never stored, so the two can never disagree.
--
-- Default 0 means every existing row and every row written before the recovery logic is wired has
-- `disbursed == total_cents`, which is exactly today's behaviour. Nothing changes until something
-- writes a non-zero value.

ALTER TABLE payout_batch_items
  ADD COLUMN IF NOT EXISTS recovered_cents INTEGER NOT NULL DEFAULT 0;

-- A recovery cannot exceed what is being paid, and cannot be negative. Enforced here as well as in
-- `planAdvanceRecovery` because a negative recovery would PAY somebody their own debt again, and one
-- larger than the total would produce a negative disbursement — neither of which any downstream
-- screen is written to survive.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payout_batch_items_recovered_range') THEN
    ALTER TABLE payout_batch_items
      ADD CONSTRAINT payout_batch_items_recovered_range
      CHECK (recovered_cents >= 0 AND recovered_cents <= total_cents);
  END IF;
END $$;

COMMENT ON COLUMN payout_batch_items.recovered_cents IS
  'Of total_cents, how much was withheld to repay an outstanding pay advance rather than sent to the '
  'person. NOT a component of total_cents — total_cents stays the full amount this item settles, so '
  'lib/payroll/owed.ts clears the hours correctly. What actually goes out is '
  'total_cents - recovered_cents; see disbursedCents() in lib/payroll/disbursement.ts.';

-- ── THE REPAYMENT'S OTHER END ────────────────────────────────────────────────────────────────────
--
-- `pay_advance_repayments` (seed 576) links each repayment to the pay stub that took it. Batches have
-- no stubs, so the link needs a second target rather than a reused one: a repayment belongs to
-- exactly one settlement, and which KIND it was is the thing an audit asks about first.
ALTER TABLE pay_advance_repayments
  ADD COLUMN IF NOT EXISTS payout_batch_item_id UUID REFERENCES payout_batch_items(id) ON DELETE SET NULL;

-- `pay_stub_id` was already nullable in seed 576 (`UUID REFERENCES pay_stubs(id) ON DELETE SET NULL`,
-- no NOT NULL), so nothing needs relaxing — checked rather than assumed, because an unnecessary
-- ALTER on a live table is a lock nobody asked for.
--
-- Exactly one of the two sources, never both and never neither. A repayment attached to nothing
-- cannot be reversed when its settlement is voided; one attached to BOTH would be reversed twice.
-- Written as NOT VALID first so an existing row that somehow has neither cannot block the deploy —
-- the constraint still applies to everything written from now on, and the validation is a separate
-- decision somebody can make after looking at whatever it caught.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pay_advance_repayments_one_source') THEN
    ALTER TABLE pay_advance_repayments
      ADD CONSTRAINT pay_advance_repayments_one_source
      CHECK ((pay_stub_id IS NOT NULL) <> (payout_batch_item_id IS NOT NULL)) NOT VALID;
  END IF;
END $$;

-- Mirrors `pay_advance_repayments_stub_uniq` from seed 576, for the batch side. Same reason, and it
-- is the reason that matters: **re-running a build must not deduct the same instalment twice.** On
-- the stub side the only evidence would have been somebody's short cheque; here it would be a
-- payout that quietly withheld twice.
CREATE UNIQUE INDEX IF NOT EXISTS pay_advance_repayments_batch_item_uniq
  ON pay_advance_repayments (advance_id, payout_batch_item_id)
  WHERE payout_batch_item_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_advance_repayments_batch_item
  ON pay_advance_repayments (payout_batch_item_id)
  WHERE payout_batch_item_id IS NOT NULL;

-- seeds/586_payout_method_allows_account.sql
--
-- Let an employee's payout method be `account`.
--
-- ── THE GAP THIS CLOSES ──────────────────────────────────────────────────────────────────────────
--
-- Seed 578 added `employee_profiles.payout_method` with a CHECK listing seven methods. The eighth —
-- `account`, meaning "credit their balance instead of sending it out" — was added to
-- `lib/payouts/methods.ts` afterwards, and the constraint was never widened. So the one payout
-- method that funds an employee's balance could not be stored against an employee at all.
--
-- That is why the "online bank account" reads $0.00. Not because the crediting is missing —
-- `lib/payroll/account-credit.ts` is complete, tested and wired, and `planAccountCredit` guards
-- against double-crediting. The path was simply unreachable: `payout_method` was written by no UI
-- at all, and even had one existed, this constraint would have rejected the only value that mattered.
--
-- ── WHY THE LIST IS RESTATED RATHER THAN RELAXED ─────────────────────────────────────────────────
--
-- The tempting fix is to drop the CHECK and let the application be the only guard. It is the wrong
-- one: `payout_method` is read by a cron and by the ad-hoc pay route, both of which pass whatever is
-- there to `isPayoutMethod`, which answers NO to an unrecognised string — so a typo'd method stores
-- happily, reads back as nothing, and every payout for that person silently lands under "Method not
-- assigned" with no error anywhere. The constraint is what turns that into a failed write somebody
-- sees.
--
-- Kept in sync with `PAYOUT_METHODS` in lib/payouts/methods.ts by hand, and that is a real cost —
-- but the alternative is a column whose invalid values are invisible until payday.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employee_profiles_payout_method_check') THEN
    ALTER TABLE employee_profiles DROP CONSTRAINT employee_profiles_payout_method_check;
  END IF;

  ALTER TABLE employee_profiles
    ADD CONSTRAINT employee_profiles_payout_method_check
    CHECK (payout_method IS NULL OR payout_method IN
      ('cash', 'check', 'venmo', 'cashapp', 'zelle', 'ach', 'account', 'other'));
END $$;

COMMENT ON COLUMN employee_profiles.payout_method IS
  'Preferred payout method, from lib/payouts/methods.ts. NULL = not on file, which is NOT the same '
  'as cash — an item built with no method arrives on the dispatch screen as "Method not assigned". '
  '`account` credits their balance rather than sending money out; it leaves when they withdraw it.';

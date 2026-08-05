-- seeds/578_employee_payout_method.sql
--
-- HOW EACH PERSON PREFERS TO BE PAID (H-7/H-8, 2026-08-05)
-- ═══════════════════════════════════════════════════════
--
-- *"We need to also be able to pay people by cash or check or venmo or cashapp and record it."*
--
-- `employee_profiles` carried bank fields — `bank_name`, `bank_routing_last4`,
-- `bank_account_last4`, `bank_account_type`, `bank_verified` — and nothing else. So the only
-- payment method the platform could remember for a person was ACH, while the payout ledger has
-- always accepted Venmo, Cash App, Zelle, cash and cheques.
--
-- The consequence: building a payout batch had no way to fill in a line's method, so every line
-- landed in the dispatch screen's "Method not assigned" column and somebody re-chose, per person,
-- every single time.
--
--   payout_method  — one of the seven in lib/payouts/methods.ts. NULL means "not on file", which is
--                    different from "cash" and must stay different: a line with no method is a
--                    question, and a line marked cash is an instruction.
--   payout_handle  — the Venmo/Cash App/Zelle identifier, or the address a cheque goes to. NULL for
--                    cash, which needs no destination.
--
-- ── LAST FOUR ONLY, STILL ───────────────────────────────────────────────────────────────────────
--
-- The bank columns store `_last4` deliberately and this seed does not change that. Full account and
-- routing numbers are not stored here, and `payout_handle` must never be used to smuggle one in —
-- a Venmo handle is a public username, an account number is not. Reading real balances (H-14) needs
-- a provider like Plaid holding those credentials, precisely so this database does not.

ALTER TABLE employee_profiles
  ADD COLUMN IF NOT EXISTS payout_method TEXT,
  ADD COLUMN IF NOT EXISTS payout_handle TEXT;

-- Named check rather than free text: a typo like 'Venmo' or 'check ' would read as an unrecognised
-- method, land the line in "unassigned", and look like missing data rather than a bad value.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employee_profiles_payout_method_check') THEN
    ALTER TABLE employee_profiles
      ADD CONSTRAINT employee_profiles_payout_method_check
      CHECK (payout_method IS NULL OR payout_method IN ('cash', 'check', 'venmo', 'cashapp', 'zelle', 'ach', 'other'));
  END IF;
END $$;

COMMENT ON COLUMN employee_profiles.payout_method IS
  'Preferred payout method, from lib/payouts/methods.ts. NULL = not on file, which is NOT the same as cash.';
COMMENT ON COLUMN employee_profiles.payout_handle IS
  'Venmo/Cash App/Zelle identifier, or where a cheque goes. Never a full account number — the bank columns store last-4 only.';

-- Anyone whose bank details are already on file is paid by ACH unless somebody says otherwise. This
-- backfills a preference the firm has effectively already expressed, rather than inventing one:
-- profiles with no bank details keep NULL and get asked.
UPDATE employee_profiles
   SET payout_method = 'ach'
 WHERE payout_method IS NULL
   AND bank_account_last4 IS NOT NULL
   AND bank_account_last4 <> '';

DO $$
DECLARE
  with_method INTEGER;
  without     INTEGER;
BEGIN
  SELECT count(*) INTO with_method FROM employee_profiles WHERE payout_method IS NOT NULL;
  SELECT count(*) INTO without     FROM employee_profiles WHERE payout_method IS NULL;
  RAISE NOTICE 'payout method: % profile(s) set, % still to be asked.', with_method, without;
END $$;

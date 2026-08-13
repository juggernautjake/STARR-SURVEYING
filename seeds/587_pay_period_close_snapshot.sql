-- seeds/587_pay_period_close_snapshot.sql
--
-- What a pay period contained at the moment it was closed.
--
-- Owner, 2026-08-12: *"the employer can finalize it at the end of the pay period."*
--
-- ── WHY THIS IS ON `pay_period_locks` AND NOT A NEW `pay_period_closes` TABLE ────────────────────
--
-- The plan (PAYROLL_HOURS_AND_EMPLOYEE_MONEY §S7) sketched a separate `pay_period_closes` row
-- carrying "the batch it produced". That column is the problem: whether a close produces a payout
-- batch or a payroll run is exactly the question D2 has not answered, and a second table whose
-- relationship to `pay_period_locks` is undecided would have to be reshaped once it is.
--
-- What IS decided is that closing a period and locking it are the same act — the plan says so
-- ("closing implies locking, so the two stop being separate rituals"). So the snapshot goes on the
-- lock, which already records the period, who closed it and when. When D2 lands, a `payout_batch_id`
-- can be added here or the rows migrated; neither is made harder by this.
--
-- ── WHY A SNAPSHOT AT ALL, WHEN THE ENTRIES ARE STILL THERE ─────────────────────────────────────
--
-- Because they do not stay the same. Admins are exempt from locks by design, so a closed week keeps
-- moving: hours get adjusted, pay decisions get revised, and since 2026-08-12 the office can add
-- days on somebody's behalf. Re-totalling the week later tells you what it holds NOW, and there is
-- no way to recover what it held when somebody decided it was finished.
--
-- That figure is the one a payment was made against. Without it, "we closed the week at $4,210 and
-- it now reads $4,510" is unanswerable, and the late-entry marker (lib/hours/late-entry.ts) can say
-- an entry arrived after the close without being able to say what the close was.
--
-- Every column is NULLABLE, and NULL means "closed before this was recorded" — every lock that
-- already exists. Deliberately not backfilled by re-totalling those weeks: that would compute
-- today's figure and store it as though it were the historical one, which is precisely the
-- fabrication this column exists to prevent.

ALTER TABLE pay_period_locks
  ADD COLUMN IF NOT EXISTS closed_hours       NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS closed_pay_cents   BIGINT,
  ADD COLUMN IF NOT EXISTS closed_entry_count INTEGER,
  ADD COLUMN IF NOT EXISTS closed_people      INTEGER;

COMMENT ON COLUMN pay_period_locks.closed_hours IS
  'Approvable hours the period held at the instant it was closed, using adjusted hours where an '
  'approver set them. NULL = closed before snapshots were recorded; never backfilled, because a '
  'recomputed figure would be today''s number wearing a historical date.';
COMMENT ON COLUMN pay_period_locks.closed_pay_cents IS
  'What those hours were priced at when the period closed — the approver''s pay decision where one '
  'exists, else the rules'' figure. Hours with no rate contribute nothing rather than zero.';
COMMENT ON COLUMN pay_period_locks.closed_entry_count IS
  'Time-log entries in the period at close. Compare with the live count to see what has been added '
  'since — see lib/hours/late-entry.ts.';
COMMENT ON COLUMN pay_period_locks.closed_people IS
  'Distinct employees with hours in the period at close.';

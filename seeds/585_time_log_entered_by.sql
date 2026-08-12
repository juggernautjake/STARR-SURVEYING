-- seeds/585_time_log_entered_by.sql
--
-- Who put this on the timesheet.
--
-- Owner, 2026-08-12: *"The employer will also be able to log hours for employees and create entries
-- setting the hours and pay for the employee."*
--
-- Until now there was exactly ONE insert into `daily_time_logs` in the whole codebase, and it
-- hard-coded `user_email: session.user.email`. Every row was self-submitted, so "whose hours are
-- these" and "who typed them" were the same question and one column answered both.
--
-- ── WHY A COLUMN AND NOT AN ASSUMPTION ───────────────────────────────────────────────────────────
--
-- The moment the office can enter hours on somebody's behalf, those two questions come apart, and
-- both matter:
--
--   * **To the employee.** Hours appearing on your timesheet that you did not submit is a thing you
--     must be able to see, and "8h, 2026-08-11" with no author is indistinguishable from an entry you
--     forgot making. Somebody disputing their pay needs to know who to ask.
--
--   * **To an audit.** "The employee claimed this" and "the office recorded this" are different
--     assertions about the same eight hours, and a wage dispute turns on which one it was. Losing
--     that distinction cannot be recovered afterwards — you cannot reconstruct from an approved row
--     whether the person ever agreed it was right.
--
-- NULL means self-submitted. Deliberately not "backfill every existing row with its own
-- `user_email`": every row that exists today WAS self-submitted, and writing an author onto them
-- would be inventing a fact that happens to be true now and would be indistinguishable from a real
-- office entry later. Absence is the honest record of "nobody else was involved".
--
-- `approved_by` is not a substitute. An admin approves their own entry at creation, so the two
-- columns would agree on office-entered rows and `approved_by` alone cannot tell an office entry
-- from an ordinary approval.

ALTER TABLE daily_time_logs
  ADD COLUMN IF NOT EXISTS entered_by TEXT;

COMMENT ON COLUMN daily_time_logs.entered_by IS
  'Email of the person who created this entry, when that is NOT the employee it belongs to. NULL '
  'means the employee submitted it themselves — which is every row created before 2026-08-12. Set '
  'only by the admin-on-behalf path in POST /api/admin/time-logs.';

-- "Show me everything the office entered for this person" is the question a pay dispute starts
-- with, and it is a small minority of rows — so a partial index rather than one over every entry
-- ever submitted.
CREATE INDEX IF NOT EXISTS idx_time_logs_entered_by
  ON daily_time_logs (user_email, log_date)
  WHERE entered_by IS NOT NULL;

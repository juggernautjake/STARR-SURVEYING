-- seeds/574_time_log_pay_decisions.sql
--
-- THE BOSS'S DECISION IS ITS OWN RECORD (owner request, 2026-08-04)
-- ════════════════════════════════════════════════════════════════
--
-- *"Someone might draw for a couple hours, and also work in the field for about 6 hours. They can
-- submit that they worked 8 hours, but the boss might choose to pay the rate for drawing for 2
-- hours and the field work rate for 6 hours, or he might want to just give them the base pay for
-- the whole time, or he will pay them some unique amount. The boss, or whoever is handling the
-- payments, can add notes to the payout if they want."*
--
-- Two things follow from that sentence, and they are why this is a table rather than more columns
-- on `daily_time_logs`:
--
--   1. **One submitted entry can pay at several rates.** `daily_time_logs` holds one `work_type`
--      and one `effective_rate` per row, so a split has nowhere to live. Splitting the row itself
--      would rewrite what the employee submitted, which destroys the record of what they said.
--   2. **The submission and the decision are different claims by different people.** The employee
--      says "I worked 8 hours". The approver says "6 at field rate, 2 at drafting, and here is
--      why". Keeping them apart means a decision can be revised, or disputed, without the original
--      claim changing underneath it — which is the whole point of an approval step.
--
-- `daily_time_logs.effective_rate` and `total_pay` stay as the resolved-at-submission figures: what
-- the rules said the day was worth before anybody looked at it. This table is what is actually
-- being paid, and the two being visibly different is information, not a conflict.

CREATE TABLE IF NOT EXISTS time_log_pay_decisions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  time_log_id       UUID NOT NULL REFERENCES daily_time_logs(id) ON DELETE CASCADE,
  user_email        TEXT NOT NULL,

  -- The split. Each element is one block of hours priced one way:
  --   { "hours": 6, "work_type": "field_work", "rate": 30.50, "source": "activity",
  --     "label": "Field work", "explanation": "$30.50/hr — $20.00 field work + $10.00 party chief…" }
  -- Stored resolved rather than as a recipe, so a later change to `work_type_rates` cannot silently
  -- restate what somebody was already paid. `source` is the rule that produced the rate, from
  -- lib/payroll/resolve-rate.ts.
  blocks            JSONB NOT NULL DEFAULT '[]'::JSONB,

  -- Totals, denormalised from `blocks` at write time. Kept so payroll reads do not have to
  -- re-derive money from JSON, and so a mismatch between the two is detectable.
  total_hours       NUMERIC(6,2) NOT NULL DEFAULT 0,
  total_pay         NUMERIC(10,2) NOT NULL DEFAULT 0,
  -- Hours in this decision that were deliberately left unpriced. Separate from `total_hours`, so
  -- "not decided yet" can never be read as "worth nothing".
  undecided_hours   NUMERIC(6,2) NOT NULL DEFAULT 0,

  -- *"can add notes to the payout if they want, if they want to make any explanations for why the
  -- pay is what it is."* Visible to the employee — an unexplained adjustment is what generates the
  -- dispute this is meant to prevent.
  payout_note       TEXT,

  decided_by        TEXT NOT NULL,
  decided_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  org_id            UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'
);

-- One live decision per entry. A revision replaces it (the previous version is kept in
-- `time_log_pay_decision_history` below), so a payroll read can never pick up two answers.
CREATE UNIQUE INDEX IF NOT EXISTS time_log_pay_decisions_log_uniq
  ON time_log_pay_decisions (time_log_id);

CREATE INDEX IF NOT EXISTS time_log_pay_decisions_user_idx
  ON time_log_pay_decisions (user_email, decided_at DESC);

CREATE INDEX IF NOT EXISTS time_log_pay_decisions_org_idx
  ON time_log_pay_decisions (org_id);

-- Every prior version of a decision. Pay changes are the kind of thing people argue about later,
-- and "what did it say before you changed it" needs an answer that is not "we overwrote it".
CREATE TABLE IF NOT EXISTS time_log_pay_decision_history (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  time_log_id       UUID NOT NULL,
  user_email        TEXT NOT NULL,
  blocks            JSONB NOT NULL DEFAULT '[]'::JSONB,
  total_hours       NUMERIC(6,2) NOT NULL DEFAULT 0,
  total_pay         NUMERIC(10,2) NOT NULL DEFAULT 0,
  undecided_hours   NUMERIC(6,2) NOT NULL DEFAULT 0,
  payout_note       TEXT,
  decided_by        TEXT NOT NULL,
  decided_at        TIMESTAMPTZ NOT NULL,
  superseded_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  superseded_by     TEXT,
  org_id            UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'
);

CREATE INDEX IF NOT EXISTS time_log_pay_decision_history_log_idx
  ON time_log_pay_decision_history (time_log_id, superseded_at DESC);

-- ── The submitted-vs-paid view ────────────────────────────────────────────────────────────────
--
-- What payroll reads. `paid_total` falls back to the resolved-at-submission figure when nobody has
-- made a decision, which is the correct default: the rules already priced the hour, and an approver
-- who changes nothing is agreeing with them.
--
-- COALESCE only on the total, deliberately — `decision_id` stays NULL so a caller can always tell
-- "the rules priced this" from "a person priced this". Collapsing that distinction is how an
-- automatic figure comes to look like somebody signed off on it.
CREATE OR REPLACE VIEW time_log_pay AS
SELECT
  l.id                AS time_log_id,
  l.user_email,
  l.log_date,
  l.work_type,
  l.hours,
  l.adjusted_hours,
  l.status,
  l.effective_rate    AS resolved_rate,
  l.total_pay         AS resolved_total,
  d.id                AS decision_id,
  d.blocks            AS decision_blocks,
  d.payout_note,
  d.decided_by,
  d.decided_at,
  d.undecided_hours,
  COALESCE(d.total_pay, l.total_pay) AS paid_total,
  l.org_id
FROM daily_time_logs l
LEFT JOIN time_log_pay_decisions d ON d.time_log_id = l.id;

-- RLS is applied uniformly by seeds/audit_rls_fixup.sql; these tables are reached only through
-- service-role routes that gate on `isAdmin`, matching every other pay table.

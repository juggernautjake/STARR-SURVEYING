-- seeds/579_hours_notification_preferences.sql
--
-- WHO ACTUALLY WANTS THE BELL (H-12, 2026-08-05)
-- ══════════════════════════════════════════════
--
-- *"My dad needs to get notifications whenever hours are submitted. He is Hank Maddux."*
--
-- Hours-submitted notifications go to everyone who can decide hours — everyone holding `admin`.
-- The firm currently has **five** such people, so one crew member logging a Tuesday produces five
-- bells. Four of those people may not want it, and a notification stream somebody has learned to
-- ignore is worse than no notification at all: it stops working for the one person who did want it.
--
-- The alternative was hard-coding an address. That breaks the day somebody else starts approving
-- hours, and it hides the other four rather than letting them choose.
--
-- ── OPT-OUT, NOT OPT-IN ─────────────────────────────────────────────────────────────────────────
--
-- A missing row means "notify me". That direction is deliberate: an opt-IN default would mean
-- shipping this seed silently turns Hank's notifications OFF until somebody finds a settings page,
-- and the failure would look exactly like the feature not working. A new admin therefore starts
-- notified and turns it off if they want to — the safe direction for a message about money.

CREATE TABLE IF NOT EXISTS hours_notification_preferences (
  user_email        TEXT PRIMARY KEY,
  /** FALSE means "do not send me hours-submitted notifications". Absent row = TRUE. */
  notify_on_submit  BOOLEAN NOT NULL DEFAULT TRUE,
  /**
   * Optional: only notify about these people's hours.
   *
   * NULL means everybody, which is different from an empty array — empty means "notify me about
   * nobody", which is a way of saying off while keeping the row. Collapsing the two would make it
   * impossible to express "I only want my own crew".
   */
  only_for_emails   TEXT[],
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by        TEXT,
  org_id            UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'
);

COMMENT ON TABLE hours_notification_preferences IS
  'Per-person opt-out for hours-submitted notifications. A MISSING row means notify — opt-out, not opt-in, so shipping this never silently turns somebody off.';
COMMENT ON COLUMN hours_notification_preferences.only_for_emails IS
  'NULL = everybody. An EMPTY array = nobody, which is a deliberate "off" that keeps the row.';

CREATE INDEX IF NOT EXISTS hours_notification_preferences_org_idx
  ON hours_notification_preferences (org_id);

-- No rows are inserted. Every admin is notified by default, which is the state the firm is in
-- today, so applying this seed changes nothing until somebody opts out — and a seed that quietly
-- altered who hears about money would be exactly the wrong kind of migration.
DO $$
DECLARE
  admins INTEGER;
BEGIN
  SELECT count(*) INTO admins FROM registered_users WHERE 'admin' = ANY(roles);
  RAISE NOTICE 'hours notifications: % admin(s) are notified by default; none have opted out yet.', admins;
END $$;

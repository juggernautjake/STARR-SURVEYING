-- seeds/660_notification_preferences.sql
--
-- PER-PERSON OPT-OUT FOR BROADCAST NOTIFICATIONS (2026-09-23)
-- ══════════════════════════════════════════════════════════
--
-- Owner: *"Work on determining what roles should exist and what all they should have access to, and
-- which roles should get what notifications."*
--
-- Role is the wrong instrument on its own. It answers "who is ALLOWED to hear this", and the
-- question a person actually has is "do I want to". Those differ: five people hold `admin` and all
-- five can act on a customer call, but only some of them want a bell for every one.
--
-- `seeds/579_hours_notification_preferences.sql` solved this for hours alone and wrote down the
-- reasoning. This generalises it to every broadcast kind listed in `lib/notifications/audience.ts`
-- — phone calls, website queries, equipment, money.
--
-- ── OPT-OUT, NOT OPT-IN (the same choice 579 made, for the same reason) ─────────────────────────
--
-- A MISSING row means "notify me". An opt-IN default would mean applying this seed silently turns
-- everybody's notifications OFF until somebody finds a settings page, and that failure looks
-- exactly like the feature being broken. So applying this changes nothing for anyone: every
-- eligible person stays notified until they choose otherwise.
--
-- ── WHY `kind` IS TEXT AND NOT AN ENUM ──────────────────────────────────────────────────────────
--
-- The list of broadcast kinds lives in TypeScript (`BROADCAST_KINDS`), which is where it is read,
-- rendered on the settings page and reasoned about. A Postgres enum would put half the definition
-- somewhere the application cannot see and make adding a kind a migration. The cost is that a typo
-- in `kind` stores a preference nobody reads — which is why the settings API only accepts ids it
-- finds in that list, rather than whatever it is handed.
--
-- ── WHY NOT REPLACE 579 ─────────────────────────────────────────────────────────────────────────
--
-- `hours_notification_preferences` works and carries a column this table has no equivalent for
-- (`only_for_emails`, "notify me only about my own crew"). Folding it in would mean migrating live
-- opt-outs about money to gain tidiness, which is a bad trade. It stays the authority for
-- `hours.submitted`; `lib/notifications/notification-preferences.ts` routes that kind to it and
-- says so at both ends.

CREATE TABLE IF NOT EXISTS notification_preferences (
  user_email TEXT NOT NULL,
  /** A `BROADCAST_KINDS` id from lib/notifications/audience.ts, e.g. 'call.received'. */
  kind       TEXT NOT NULL,
  /** FALSE means "do not send me this kind". An absent row means TRUE. */
  enabled    BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by TEXT,
  org_id     UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  PRIMARY KEY (user_email, kind)
);

COMMENT ON TABLE notification_preferences IS
  'Per-person opt-out for broadcast notifications (lib/notifications/audience.ts). A MISSING row means notify — opt-out, not opt-in, so applying this never silently turns somebody off. hours.submitted is the exception: seeds/579 remains its authority.';
COMMENT ON COLUMN notification_preferences.kind IS
  'A BROADCAST_KINDS id. Not an enum: the list lives in TypeScript, where it is read and rendered. The settings API validates against that list.';
COMMENT ON COLUMN notification_preferences.enabled IS
  'FALSE = opted out. There is no TRUE row to create — absence already means notify — but storing TRUE is harmless and is what turning a toggle back on writes.';

-- The lookup is always "these people, this kind", once per broadcast.
CREATE INDEX IF NOT EXISTS notification_preferences_kind_idx
  ON notification_preferences (kind, user_email);
CREATE INDEX IF NOT EXISTS notification_preferences_org_idx
  ON notification_preferences (org_id);

-- No rows are inserted, deliberately. Applying this seed must not change who hears anything.
DO $$
DECLARE
  admins INTEGER;
  crew   INTEGER;
BEGIN
  SELECT count(*) INTO admins FROM registered_users WHERE 'admin' = ANY(roles) AND NOT COALESCE(is_banned, FALSE);
  SELECT count(*) INTO crew   FROM registered_users WHERE 'field_crew' = ANY(roles) AND NOT 'admin' = ANY(roles);
  RAISE NOTICE 'notification_preferences: % admin(s) eligible for broadcasts; nobody has opted out yet.', admins;
  RAISE NOTICE 'Note: % non-admin field crew no longer receive customer-call bells (they could not action them).', crew;
END $$;

-- ── THE INDEX THE REVISE-IN-PLACE DEDUPE NEEDS ─────────────────────────────────────────────────
--
-- `lib/receptionist/notify.ts` now looks a call's existing bell rows up by
-- (source_type, source_id) on every webhook, so it can revise the row rather than insert a second
-- one. The four indexes on `notifications` (seeds/315) are all keyed on user_email or
-- target_user_id; none of them helps that lookup, which was a sequential scan of the whole table
-- once per notification.
--
-- Partial, because every row this query wants has a source_id and the majority of the table does
-- not — a person-targeted notification carries none. That keeps the index to the rows it serves.
CREATE INDEX IF NOT EXISTS notifications_source_idx
  ON notifications (source_type, source_id)
  WHERE source_id IS NOT NULL;

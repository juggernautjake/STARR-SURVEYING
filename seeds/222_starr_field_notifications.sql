-- ============================================================================
-- 222_starr_field_notifications.sql
-- Starr Field — extends the EXISTING `notifications` table for the
-- dispatcher-ping flow.
--
-- Per the user's resilience requirements: "The admin/dispatcher needs
-- to be able to notify the user that they need to log their hours."
--
-- IMPORTANT — schema collision discovered:
--
--   The web admin already has a `notifications` table and a
--   NotificationBell UI (app/admin/components/NotificationBell.tsx)
--   plus a centralized helper (lib/notifications.ts) that inserts
--   rows for many event kinds (assignment, payment, promotion,
--   hours_decision, task_assignment, etc.). Identity is `user_email`
--   (TEXT), not auth.users.id (UUID), and lifecycle is is_read +
--   is_dismissed booleans plus read_at TIMESTAMPTZ.
--
--   Rather than create a parallel table for the mobile flow (which
--   would force the dispatcher UI to choose between two inboxes), we
--   PIGGYBACK on the existing table. Mobile clients consume rows via
--   PowerSync, scoped by user_email (matches daily_time_logs identity).
--
-- This seed adds the columns + RLS policies that mobile needs WITHOUT
-- breaking the web admin path:
--
--   - target_user_id UUID  — auth.users.id mirror for the user_email,
--                            so mobile sync rules can scope by
--                            auth.uid() directly. Backfilled from
--                            auth.users on first run; trigger keeps
--                            it in sync for new rows.
--   - delivered_at         — mobile flips this on first observation;
--                            powers the dispatcher's "delivered ✓"
--                            indicator. Distinct from is_read (which
--                            requires user engagement).
--   - dismissed_at         — paired-timestamp companion to the
--                            existing is_dismissed boolean. Mobile
--                            flips both atomically; web NotificationBell
--                            only writes is_dismissed (back-compat).
--   - expires_at           — soft-delete: dispatcher pings are
--                            ephemeral (most are throwaway after 24h).
--                            Mobile sync rule filters on this.
--
-- And RLS:
--
--   - service_role keeps full access (the web admin API uses it).
--   - Authenticated role (mobile clients) gets SELECT + UPDATE on
--     OWN rows. Column-level GRANT keeps owners from rewriting body /
--     title / link — only delivered_at, read_at, is_read,
--     dismissed_at, is_dismissed are writable from mobile.
--
-- IMPORTANT — depends on auth.users (Supabase). Apply BEFORE the
-- mobile lib/notificationsInbox subscriber lights up.
-- ============================================================================

BEGIN;

-- ── Column additions ─────────────────────────────────────────────────────────
-- Defensive ADD COLUMN IF NOT EXISTS so the seed is idempotent and
-- safe to re-run after the existing notifications table changes shape.

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS target_user_id UUID,
  ADD COLUMN IF NOT EXISTS delivered_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dismissed_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS expires_at     TIMESTAMPTZ;

-- Backfill target_user_id for existing rows. The existing notifications
-- table is keyed on user_email; we derive the UUID by joining to
-- auth.users. Skipped where the email no longer maps to a user (which
-- can happen for rows about ex-employees) so the migration completes.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name   = 'notifications'
       AND column_name  = 'user_email'
  ) THEN
    UPDATE notifications n
       SET target_user_id = u.id
      FROM auth.users u
     WHERE n.user_email = u.email
       AND n.target_user_id IS NULL;
  END IF;
END $$;

-- Trigger: keep target_user_id in sync with user_email for new rows /
-- email changes. The web admin's notify() helper inserts rows with
-- user_email only — this trigger fills target_user_id automatically so
-- mobile sync rules don't need every web call site updated.
--
-- SECURITY DEFINER: the trigger reads auth.users.email which the
-- 'authenticated' role can't query directly. Without DEFINER any
-- future role with INSERT privilege but no auth.users access would
-- fail the trigger (and thus the insert). The function only writes
-- target_user_id — no other side effects — so the elevated read is
-- bounded.
CREATE OR REPLACE FUNCTION notifications_sync_target_user_id()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF NEW.target_user_id IS NULL AND NEW.user_email IS NOT NULL THEN
    -- Case-insensitive match: the web admin has historically allowed
    -- mixed-case emails, while Supabase auth.users.email is normalised
    -- lowercase. A literal '=' would silently miss those users.
    SELECT id INTO NEW.target_user_id
      FROM auth.users
     WHERE LOWER(email) = LOWER(NEW.user_email)
     LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Lock down execution so only the roles that actually insert (web
-- admin = service_role, future dispatcher functions) can call it.
REVOKE ALL ON FUNCTION notifications_sync_target_user_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION notifications_sync_target_user_id()
  TO service_role, authenticated;

DROP TRIGGER IF EXISTS notifications_sync_target_user_id_trg ON notifications;
CREATE TRIGGER notifications_sync_target_user_id_trg
  BEFORE INSERT OR UPDATE OF user_email ON notifications
  FOR EACH ROW
  EXECUTE FUNCTION notifications_sync_target_user_id();

-- ── Indexes ──────────────────────────────────────────────────────────────────
-- Mobile poll: "show me my unread notifications, newest first." Partial
-- index keeps it tiny (most rows on a working employee are read).
CREATE INDEX IF NOT EXISTS idx_notifications_target_uuid_unread
  ON notifications (target_user_id, created_at DESC)
  WHERE is_read = false AND is_dismissed = false;

-- Dispatcher's "delivered yet?" lookup — scoped by user_email since the
-- web admin keys on email throughout. Drives the per-user delivered ✓
-- column in the F1+ Team page.
CREATE INDEX IF NOT EXISTS idx_notifications_user_email_recent
  ON notifications (user_email, created_at DESC);

-- Mobile sync rule efficiency: "fetch fresh, undelivered, unexpired."
CREATE INDEX IF NOT EXISTS idx_notifications_target_uuid_undelivered
  ON notifications (target_user_id)
  WHERE delivered_at IS NULL AND is_dismissed = false;


-- ── RLS ──────────────────────────────────────────────────────────────────────
-- Service role does it all (the web admin API uses supabaseAdmin which
-- is service-role; existing /api/admin/notifications continues to work
-- exactly as before). Authenticated users (mobile clients) see their
-- OWN unread notifications + can mark read/dismissed.
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY service_role_full_access_notifications ON notifications
    FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Mobile owner SELECT — match by UUID first (preferred), fall back to
-- email so newly-inserted rows are visible to the recipient even if
-- the trigger hasn't filled target_user_id yet (race-safe).
DO $$ BEGIN
  CREATE POLICY notifications_owner_select ON notifications
    FOR SELECT TO authenticated
    USING (
      target_user_id = auth.uid()
      OR user_email = auth.jwt() ->> 'email'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Mobile owner UPDATE (only flag columns, enforced by GRANT below).
DO $$ BEGIN
  CREATE POLICY notifications_owner_update ON notifications
    FOR UPDATE TO authenticated
    USING (
      target_user_id = auth.uid()
      OR user_email = auth.jwt() ->> 'email'
    )
    WITH CHECK (
      target_user_id = auth.uid()
      OR user_email = auth.jwt() ->> 'email'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Defence-in-depth: even though the policy gates WHICH rows owners can
-- update, a column-level GRANT enforces WHICH columns. Mobile users
-- cannot rewrite the message body, change the recipient, change the
-- escalation, etc. — only flip lifecycle flags.
REVOKE UPDATE ON notifications FROM authenticated;
GRANT UPDATE (
  is_read,
  read_at,
  is_dismissed,
  dismissed_at,
  delivered_at
) ON notifications TO authenticated;

-- ── Helper view (optional read-side affordance) ─────────────────────────────
-- The mobile inbox treats the existing is_read/is_dismissed booleans
-- as authoritative; this view is a convenience for SQL consumers that
-- prefer the timestamp-only shape. Mobile reads the table directly.
CREATE OR REPLACE VIEW notifications_inbox AS
SELECT
  id,
  target_user_id,
  user_email,
  type,
  source_type,
  source_id,
  title,
  body,
  icon,
  link,
  escalation_level,
  is_read,
  is_dismissed,
  delivered_at,
  read_at,
  dismissed_at,
  expires_at,
  created_at
FROM notifications
WHERE is_dismissed = false
  AND (expires_at IS NULL OR expires_at > now());

GRANT SELECT ON notifications_inbox TO authenticated, service_role;

COMMIT;

-- ============================================================================
-- 315_notifications_base.sql
--
-- BASE notifications table — the central inbox the web admin's bell icon
-- + lib/notifications.ts notify() / notifyMany() helpers insert into.
--
-- Historical note: seed 222 ("starr-field-notifications") says it "extends
-- the EXISTING `notifications` table". That assumes the table was created
-- manually before the seed era. In a fresh database, every notify() call
-- silently fails and the bell shows nothing. This seed creates the base
-- table with the FULL column set so:
--   - lib/notifications.ts inserts succeed
--   - the bell-icon GET in /api/admin/notifications returns rows
--   - seed 222's column adds become no-ops (the columns already exist)
--   - seed 248's borrow-notification trigger fires correctly
--
-- Idempotent — every column / index / policy uses IF NOT EXISTS.
-- ============================================================================

BEGIN;

-- ── Table ────────────────────────────────────────────────────────────────────
-- Column set merges what lib/notifications.ts writes + what seed 222 adds:
--   Helper writes:    user_email, type, title, body, icon, link,
--                     source_type, source_id, escalation_level, thread_id
--   Lifecycle flags:  is_read, is_dismissed, read_at
--   Seed-222 adds:    target_user_id, delivered_at, dismissed_at, expires_at
-- Keeping them all on the base table means seed 222's `ALTER ADD COLUMN IF
-- NOT EXISTS` calls turn into no-ops.
CREATE TABLE IF NOT EXISTS public.notifications (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email       TEXT NOT NULL,
  type             TEXT NOT NULL,
  title            TEXT NOT NULL,
  body             TEXT,
  icon             TEXT,
  link             TEXT,
  source_type      TEXT,
  source_id        TEXT,
  escalation_level TEXT NOT NULL DEFAULT 'normal'
                     CHECK (escalation_level IN ('low', 'normal', 'high', 'urgent', 'critical')),
  thread_id        TEXT,
  is_read          BOOLEAN NOT NULL DEFAULT FALSE,
  is_dismissed     BOOLEAN NOT NULL DEFAULT FALSE,
  read_at          TIMESTAMPTZ,
  target_user_id   UUID,
  delivered_at     TIMESTAMPTZ,
  dismissed_at     TIMESTAMPTZ,
  expires_at       TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.notifications IS
  'Central notification inbox. Written via lib/notifications.ts; read by NotificationBell + /api/admin/notifications.';

-- ── Indexes ──────────────────────────────────────────────────────────────────
-- Bell-icon poll: "show me my unread notifications, newest first."
CREATE INDEX IF NOT EXISTS idx_notifications_user_email_recent
  ON public.notifications (user_email, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_user_email_unread
  ON public.notifications (user_email, created_at DESC)
  WHERE is_read = FALSE AND is_dismissed = FALSE;

-- Mobile (seed 222 alignment).
CREATE INDEX IF NOT EXISTS idx_notifications_target_uuid_unread
  ON public.notifications (target_user_id, created_at DESC)
  WHERE is_read = FALSE AND is_dismissed = FALSE;
CREATE INDEX IF NOT EXISTS idx_notifications_target_uuid_undelivered
  ON public.notifications (target_user_id)
  WHERE delivered_at IS NULL AND is_dismissed = FALSE;

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- service_role has full access (the web admin API uses supabaseAdmin which
-- runs as service_role). Authenticated mobile clients see + update their
-- own rows (seed 222 sets the column-level GRANT separately).
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY service_role_full_access_notifications ON public.notifications
    FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY notifications_owner_select ON public.notifications
    FOR SELECT TO authenticated
    USING (
      target_user_id = auth.uid()
      OR user_email = auth.jwt() ->> 'email'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY notifications_owner_update ON public.notifications
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

COMMIT;

-- ── Verification ─────────────────────────────────────────────────────────────
--   SELECT to_regclass('public.notifications');     -- non-null
--   SELECT count(*) FROM public.notifications;      -- 0 on first apply

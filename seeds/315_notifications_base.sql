-- ============================================================================
-- 315_notifications_base.sql
--
-- BASE notifications table — the central inbox the web admin's bell icon
-- + lib/notifications.ts notify() / notifyMany() helpers insert into.
--
-- Historical note: seed 222 ("starr-field-notifications") says it "extends
-- the EXISTING `notifications` table". That assumes the table was created
-- manually before the seed era. In a fresh database, every notify() call
-- silently fails and the bell shows nothing. In an existing DB where the
-- legacy table is present but missing the columns seed 222 + this seed
-- expect, a naive CREATE TABLE IF NOT EXISTS leaves the schema as-is and
-- the indexes below blow up with 42703 ("column does not exist").
--
-- Strategy: CREATE TABLE IF NOT EXISTS with a minimal core, then
-- ADD COLUMN IF NOT EXISTS for every other column. Both fresh + legacy
-- databases end up with the same schema after this runs.
--
-- After this seed, the helper inserts succeed, the bell-icon GET in
-- /api/admin/notifications returns rows, seed 222's column adds become
-- no-ops, and seed 248's borrow-notification trigger fires correctly.
--
-- Idempotent — every column / index / policy uses IF NOT EXISTS guards.
-- ============================================================================

BEGIN;

-- ── Table (minimal core) ─────────────────────────────────────────────────────
-- Just the always-required columns. Every other column gets added below via
-- ALTER ADD COLUMN IF NOT EXISTS so we don't fight a pre-existing table.
CREATE TABLE IF NOT EXISTS public.notifications (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.notifications IS
  'Central notification inbox. Written via lib/notifications.ts; read by NotificationBell + /api/admin/notifications.';

-- ── Backfill every other column the app + seed 222 expect ────────────────────
-- Order matters where one column references another — none do here, so this
-- is straightforward additive ALTERs.
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS type             TEXT,
  ADD COLUMN IF NOT EXISTS title            TEXT,
  ADD COLUMN IF NOT EXISTS body             TEXT,
  ADD COLUMN IF NOT EXISTS icon             TEXT,
  ADD COLUMN IF NOT EXISTS link             TEXT,
  ADD COLUMN IF NOT EXISTS source_type      TEXT,
  ADD COLUMN IF NOT EXISTS source_id        TEXT,
  ADD COLUMN IF NOT EXISTS escalation_level TEXT DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS thread_id        TEXT,
  ADD COLUMN IF NOT EXISTS is_read          BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_dismissed     BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS read_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS target_user_id   UUID,
  ADD COLUMN IF NOT EXISTS delivered_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dismissed_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS expires_at       TIMESTAMPTZ;

-- type + title were NOT NULL on the fresh-database path; preserve that
-- invariant by tightening the constraint AFTER the column-add backfill.
-- Wrapped in a DO so a legacy table where these are already NOT NULL
-- doesn't error out a second time.
DO $$ BEGIN
  -- Default any NULL rows so the SET NOT NULL doesn't blow up on legacy data.
  UPDATE public.notifications SET type = COALESCE(type, 'info') WHERE type IS NULL;
  UPDATE public.notifications SET title = COALESCE(title, 'Notification') WHERE title IS NULL;
  ALTER TABLE public.notifications ALTER COLUMN type SET NOT NULL;
  ALTER TABLE public.notifications ALTER COLUMN title SET NOT NULL;
EXCEPTION
  WHEN others THEN
    -- Non-fatal: if a downstream constraint complains, leave the columns
    -- nullable rather than fail the migration.
    NULL;
END $$;

-- Constraint on escalation_level — add only when missing.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'notifications_escalation_level_check'
  ) THEN
    ALTER TABLE public.notifications
      ADD CONSTRAINT notifications_escalation_level_check
      CHECK (escalation_level IN ('low', 'normal', 'high', 'urgent', 'critical'));
  END IF;
EXCEPTION WHEN others THEN NULL;
END $$;

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
--   -- Confirm every expected column is present:
--   SELECT column_name FROM information_schema.columns
--    WHERE table_schema='public' AND table_name='notifications'
--    ORDER BY ordinal_position;

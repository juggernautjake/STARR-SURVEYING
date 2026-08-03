-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- 571 — Web Push subscriptions for the BUSINESS app (/admin/).
--
-- PWA plan W4b. W4 made the sender scope-agnostic (`lib/push/web-push.ts`); W2 gave /admin/ its own
-- service worker. The missing piece was somewhere to keep a crew member's subscription: the only
-- table that existed, `va_push_subscriptions`, is keyed to `va_users` and belongs to the AndrewAsh
-- studio. A surveyor is not a row in that table and never will be.
--
-- Deliberately a separate table rather than a `scope` column on the studio's:
--   * the FKs point at different identity tables (`registered_users` vs `va_users`), so one table
--     would need a nullable FK pair and a CHECK to keep them exclusive — a constraint that is one
--     forgotten branch away from a crew member's device being linked to a studio user;
--   * the two apps have different retention needs. Sign-out on a shared work tablet should drop a
--     crew subscription; the studio is a single-operator app on personal devices.
--
-- The columns mirror 539 on purpose. Every one of them was there for a reason that still applies,
-- and re-deriving them differently would be how the two drift.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS admin_push_subscriptions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES registered_users(id) ON DELETE CASCADE,

    -- UNIQUE for the reason 539 records: the Web Push endpoint is unique per browser install and
    -- re-subscribing on the same device returns the SAME endpoint. Without this, a phone accumulates
    -- one subscription per app launch and the crew member gets eleven copies of every alert.
    endpoint        TEXT NOT NULL UNIQUE,
    p256dh          TEXT NOT NULL,
    auth            TEXT NOT NULL,

    -- So "notifications are on for: iPhone, work tablet" can be shown and revoked per device. A
    -- crew member who left a tablet in a truck needs to be able to point at which one.
    device_label    TEXT,
    user_agent      TEXT,

    -- Push services return 404/410 for a subscription the browser discarded. Recording the failure
    -- rather than deleting on the first error is what stops a transient outage from unsubscribing
    -- every device at once — see the `gone` vs transient distinction in lib/push/web-push.ts.
    failure_count   INTEGER NOT NULL DEFAULT 0,
    last_failure_at TIMESTAMPTZ,
    disabled_at     TIMESTAMPTZ,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_used_at    TIMESTAMPTZ
);

-- Partial index: every send starts by asking for a user's LIVE subscriptions, so the disabled rows
-- (kept for diagnostics) are dead weight in that lookup.
CREATE INDEX IF NOT EXISTS idx_admin_push_user
    ON admin_push_subscriptions (user_id) WHERE disabled_at IS NULL;

-- ── RLS ─────────────────────────────────────────────────────────────────────────────────────────
-- Deny-by-default, same floor as the rest of the admin schema. There is no client-side policy here
-- on purpose: a subscription row carries the exact endpoint needed to push to someone's phone, so
-- every read and write goes through a service-role route that has already checked the session.
ALTER TABLE admin_push_subscriptions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'admin_push_subscriptions' AND policyname = 'admin_push_no_direct_access'
  ) THEN
    -- A policy that grants nothing, stated explicitly. With RLS enabled and no policy at all the
    -- effect is identical, but "no policy" reads as an oversight and invites someone to add a
    -- permissive one; this records that the absence is the decision.
    CREATE POLICY admin_push_no_direct_access ON admin_push_subscriptions
      FOR ALL USING (false) WITH CHECK (false);
  END IF;
END $$;

-- ============================================================================
-- 271_saas_user_notification_prefs.sql
--
-- SaaS pivot — Phase F-4: per-user notification preferences. Each row
-- captures one user's opt-in/opt-out for each notification event ×
-- channel pair. Default behavior (no row, or no entry for an event) =
-- the event's own `defaults` field in lib/saas/notifications/events.ts.
--
-- Lookup pattern: SELECT prefs FROM user_notification_prefs WHERE
-- user_email = $1; if row missing OR event not in prefs jsonb, use
-- event default. App layer (lib/saas/notifications/prefs.ts) handles
-- the lookup + fallback.
--
-- Spec: docs/planning/completed/CUSTOMER_MESSAGING_PLAN.md §3 + §6 F-4.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.user_notification_prefs (
  user_email TEXT PRIMARY KEY,
  -- Shape: { "<event>": { "email": bool, "in_app": bool, "sms": bool } }
  -- e.g. {"trial_ending_d7": {"email": false}} = user opted out of
  -- trial-ending emails but accepts in-app + sms defaults
  prefs      JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now()
);
COMMENT ON TABLE public.user_notification_prefs IS
  'Per-user opt-in/opt-out for each notification event × channel pair. ' ||
  'Missing entry = use the event''s own defaults. Read via ' ||
  'lib/saas/notifications/prefs.ts:getUserPrefs.';

CREATE INDEX IF NOT EXISTS idx_user_prefs_email ON public.user_notification_prefs(user_email);

COMMIT;

-- Verification:
--   SELECT count(*) FROM public.user_notification_prefs;   -- 0
--
--   -- Example prefs writeback:
--   INSERT INTO public.user_notification_prefs (user_email, prefs)
--     VALUES ('alice@acme.com', '{"trial_ending_d7": {"email": false}}');
--   SELECT prefs FROM public.user_notification_prefs WHERE user_email = 'alice@acme.com';

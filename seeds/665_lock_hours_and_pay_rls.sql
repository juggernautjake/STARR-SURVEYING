-- seeds/665_lock_hours_and_pay_rls.sql — the public key can no longer read or rewrite pay.
--
-- Found 2026-10-05 while tracing deleted hours. Each of these tables had exactly one policy, named
-- like `service_role_all_*`, but granted `TO public USING (true) WITH CHECK (true)`. "public" is
-- every role, including `anon` — and the anon key ships inside every browser bundle and the mobile
-- app. Verified live before this file: an anon client read rows of `daily_time_logs`. The same
-- client could have updated or deleted anybody's hours, payouts, advances and bonuses.
--
-- Nothing in the app depends on that: every query on these tables goes through `supabaseAdmin`
-- (the service role), which bypasses RLS entirely. So the policy is narrowed to what its name
-- always claimed — service role only — plus one read-only policy letting a signed-in person see
-- their OWN hours (for the mobile app; the web reads through the API).
--
-- Idempotent: drops by name, recreates.

BEGIN;

DO $$
DECLARE
  t record;
BEGIN
  FOR t IN SELECT * FROM (VALUES
    ('daily_time_logs',      'service_role_all_dtl'),
    ('weekly_pay_periods',   'service_role_all_wpp'),
    ('credential_bonuses',   'service_role_all_cb'),
    ('pay_system_config',    'service_role_all_psc'),
    ('payout_log',           'service_all'),
    ('pay_advance_requests', 'service_role_all_par'),
    ('scheduled_bonuses',    'service_role_all_sbo')
  ) AS v(tbl, pol)
  LOOP
    IF to_regclass('public.' || t.tbl) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t.pol, t.tbl);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)', t.pol, t.tbl);
  END LOOP;
END $$;

DROP POLICY IF EXISTS own_hours_read ON public.daily_time_logs;
CREATE POLICY own_hours_read ON public.daily_time_logs
  FOR SELECT TO authenticated
  USING (lower(user_email) = lower(coalesce(auth.jwt() ->> 'email', '')));

-- The history table: service role only (RLS on, no other policy).
ALTER TABLE public.time_log_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS service_role_all_tle ON public.time_log_events;
CREATE POLICY service_role_all_tle ON public.time_log_events FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMIT;

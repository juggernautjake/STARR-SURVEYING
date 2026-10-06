-- seeds/667_rls_on_every_public_table.sql — no table is readable with the public key by accident.
--
-- Found 2026-10-05 (after 665/666 closed the open POLICIES): 140 tables in `public` had row-level
-- security switched OFF entirely. Supabase grants `anon` and `authenticated` full privileges on
-- `public` by default, so every one of them was readable — and writable — with the anon key that
-- ships in every browser bundle. Verified live before this file:
--   · google_ads_connections → access_token, refresh_token
--   · operator_users          → password_hash, mfa_secret
--   · customers               → primary_email, primary_phone
--   · views time_log_pay, ar_aging (views run as their owner, so RLS never applied to them)
--
-- The app does not depend on any of it: server code uses the service role (`supabaseAdmin`, the
-- worker's SUPABASE_SERVICE_ROLE_KEY), which bypasses RLS. The only public-client table reads
-- (mobile) touch equipment_events / equipment_inventory / field_data_points / receipts /
-- registered_users, none of which is changed here.
--
-- So: RLS on for every public table that has it off, with a service-role policy (documentation —
-- the service role bypasses RLS anyway), and the views revoked from anon/authenticated.
--
-- Deliberately DYNAMIC rather than a list: a table created tomorrow without RLS is the same hole,
-- and re-running the seeds closes it. Idempotent.

BEGIN;

DO $$
DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND NOT c.relrowsecurity
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.relname);
    EXECUTE format('DROP POLICY IF EXISTS service_role_all ON public.%I', t.relname);
    EXECUTE format('CREATE POLICY service_role_all ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)', t.relname);
  END LOOP;

  FOR t IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('v', 'm')
  LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t.relname);
    EXECUTE format('GRANT SELECT ON public.%I TO service_role', t.relname);
  END LOOP;
END $$;

COMMIT;

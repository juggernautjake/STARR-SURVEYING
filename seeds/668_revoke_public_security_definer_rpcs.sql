-- seeds/668_revoke_public_security_definer_rpcs.sql — elevated functions are server-only.
--
-- A SECURITY DEFINER function runs with its owner's rights, so RLS does not apply inside it — and
-- PostgREST exposes every function in `public` as `/rest/v1/rpc/<name>`. Verified 2026-10-05: the
-- anon key could call `derive_location_timeline` (an employee's location history for a day), and
-- by the same grant `sync_job_team_to_conversation` (add anybody to a job's message thread),
-- `ensure_job_conversation`, `get_wallet_balance` and `refresh_dnd_creatures_canonical`.
--
-- None is called through the public client anywhere in the app, mobile app or worker; the server
-- calls them with the service role, which keeps EXECUTE. Trigger functions are unaffected (they run
-- as part of the write that fires them, not by grant).
--
-- Dynamic, so a security-definer function added later without thinking about this is closed by the
-- next seed run too. Idempotent.

BEGIN;

DO $$
DECLARE
  f record;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    JOIN pg_type t ON t.oid = p.prorettype
    WHERE n.nspname = 'public' AND p.prokind = 'f' AND p.prosecdef AND t.typname <> 'trigger'
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', f.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f.sig);
  END LOOP;
END $$;

COMMIT;

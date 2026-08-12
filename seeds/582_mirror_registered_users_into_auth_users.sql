-- seeds/582_mirror_registered_users_into_auth_users.sql
--
-- R9 / BLOCKERS.md §A — owner decision 2026-08-12: `auth.users.id == registered_users.id`.
--
-- ── THE PROBLEM THIS FIXES ────────────────────────────────────────────────────────────────────────
--
-- The app authenticates against `registered_users` (its own credentials table, with `password_hash`,
-- plus Google sign-in that auto-creates a row there). But a large part of the schema was designed
-- around Supabase Auth: 14 foreign keys across 10 tables reference `auth.users`, and FIVE of them are
-- NOT NULL --
--
--   receipts.user_id
--   equipment_reservations.reserved_by
--   location_pings.user_id
--   location_stops.user_id
--   location_segments.user_id
--
-- `auth.users` held **zero rows** while `registered_users` held all 7 staff accounts, and nothing in
-- the codebase ever created one (there is no `auth.admin.createUser` call anywhere). So every write
-- through those five paths failed for every person at the firm. Receipt upload returned
-- `422 auth_users_row_missing` to the owner and to every admin, which is why the `receipts` table was
-- empty: not "nobody tried", but "nobody could".
--
-- ── WHY MIRRORING THE ID RATHER THAN REPOINTING THE FKs ───────────────────────────────────────────
--
-- The alternative was to repoint those five FKs at `registered_users(id)`. That matches what the app
-- actually authenticates against, and there is precedent in the same table
-- (`receipts.payment_card_confirmed_by` already references `registered_users`). It was rejected
-- because `receipts` carries four RLS policies keyed on `user_id = auth.uid()` — the mobile app's
-- design — and repointing would leave every one of them unable to match.
--
-- Reusing `registered_users.id` AS the auth id makes both correct at once: the FKs resolve, and
-- `auth.uid()` equals `registered_users.id` for a Supabase-Auth session, so the RLS policies mean
-- what they say. One identity value, two tables that agree about it.
--
-- ── WHAT THIS ROW IS, AND WHAT IT IS NOT ──────────────────────────────────────────────────────────
--
-- It is a REFERENTIAL identity, not a login credential. Staff sign in through `registered_users`
-- (credentials or Google); nothing here changes that. `encrypted_password` is deliberately left NULL,
-- which is the same shape GoTrue uses for OAuth-only users: it cannot be used to log in with a
-- password, and it cannot be brute-forced, because there is no hash to match. If Supabase Auth logins
-- are ever enabled, these accounts go through a password reset / magic link like any OAuth user.
--
-- `email_confirmed_at` is set to the `registered_users.created_at` — these are staff accounts an admin
-- already approved (`is_approved`), so an unconfirmed row would be a worse description of reality than
-- a confirmed one. **Nothing here sends email.** A direct INSERT does not go through GoTrue, so no
-- invite, confirmation, or notification is generated for any of the 7 people.
--
-- Verified before writing this: only `id` is NOT NULL without a default on `auth.users`, and there are
-- ZERO non-internal triggers on the table, so a plain INSERT cannot fire signup side effects.
--
-- ── IDEMPOTENT ───────────────────────────────────────────────────────────────────────────────────
--
-- Keyed on `registered_users`, skipping anyone who already has an auth row by id OR by email, so
-- re-running is a no-op and it cannot collide with an account created through GoTrue later.

-- ── THE TOKEN COLUMNS MUST BE '' AND NOT NULL, OR GOTRUE 500s ─────────────────────────────────────
--
-- Found the hard way: the first version of this seed omitted them, and although `auth.users` accepted
-- the rows (they are all nullable), the Supabase Auth admin API immediately began returning
-- `500 {"error_code":"unexpected_failure","msg":"Database error finding users"}` for EVERY request —
-- including `supabaseAdmin.auth.admin.listUsers()`, which is what `resolveUserIdByEmail` in the receipt
-- upload route calls. So the mirror silently broke the very lookup it was supposed to satisfy, and it
-- broke it for all users, not just the mirrored ones.
--
-- The cause is that GoTrue scans these columns into non-nullable Go strings. Nullable in Postgres,
-- NOT NULL in the reader. `''` is what GoTrue itself writes for "no token outstanding", so that is what
-- a mirrored row has to carry. This is the difference between a row the database accepts and a row the
-- application can read — worth stating, because the INSERT succeeding proves only the former.
INSERT INTO auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  email_confirmed_at,
  created_at,
  updated_at,
  confirmation_token,
  recovery_token,
  email_change,
  email_change_token_new,
  email_change_token_current,
  phone_change,
  phone_change_token,
  reauthentication_token,
  raw_app_meta_data,
  raw_user_meta_data
)
SELECT
  ru.id,
  '00000000-0000-0000-0000-000000000000'::uuid,
  'authenticated',
  'authenticated',
  lower(ru.email),
  COALESCE(ru.created_at, now()),
  COALESCE(ru.created_at, now()),
  now(),
  '', '', '', '', '', '', '', '',
  -- `provider`/`providers` is what GoTrue reads to decide which login methods an account has. Naming
  -- the real source of truth here keeps the row honest: these identities are mirrored from the app's
  -- own table, not created by a Supabase signup flow.
  jsonb_build_object('provider', 'starr_registered_users', 'providers', jsonb_build_array('starr_registered_users')),
  jsonb_build_object('name', ru.name, 'mirrored_from', 'registered_users', 'mirrored_at', now())
FROM registered_users ru
WHERE ru.email IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM auth.users au WHERE au.id = ru.id)
  AND NOT EXISTS (SELECT 1 FROM auth.users au WHERE lower(au.email) = lower(ru.email));

-- Repair pass for rows this seed's first version created with NULL token columns (see the note above).
-- Scoped to mirrored rows so it can never touch an account GoTrue created itself, where a non-empty
-- token is meaningful state — blanking a real `confirmation_token` would invalidate a pending email
-- confirmation. Idempotent, and a no-op on a database that only ever ran the corrected version.
UPDATE auth.users SET
  confirmation_token         = COALESCE(confirmation_token, ''),
  recovery_token             = COALESCE(recovery_token, ''),
  email_change               = COALESCE(email_change, ''),
  email_change_token_new     = COALESCE(email_change_token_new, ''),
  email_change_token_current = COALESCE(email_change_token_current, ''),
  phone_change               = COALESCE(phone_change, ''),
  phone_change_token         = COALESCE(phone_change_token, ''),
  reauthentication_token     = COALESCE(reauthentication_token, '')
WHERE raw_app_meta_data->>'provider' = 'starr_registered_users'
  AND (confirmation_token IS NULL OR recovery_token IS NULL OR email_change IS NULL
       OR email_change_token_new IS NULL OR email_change_token_current IS NULL
       OR phone_change IS NULL OR phone_change_token IS NULL OR reauthentication_token IS NULL);

-- ── KEEPING IT TRUE FOR THE NEXT HIRE ─────────────────────────────────────────────────────────────
--
-- The backfill above fixes the 7 accounts that exist today. Without this function the next person
-- invited or registered would land in `registered_users` only and hit exactly the same 422 — the bug
-- would come back one account at a time, which is the worse version of it, because the table would no
-- longer be conspicuously empty.
--
-- It has to be a database function rather than app code: PostgREST does not expose the `auth` schema,
-- so `supabaseAdmin.from('auth.users')` cannot write here. SECURITY DEFINER so the caller does not
-- need rights on `auth`, and locked to `service_role` below — an anon or authenticated caller able to
-- mint auth identities would be a privilege-escalation hole, so the GRANTs are part of the fix, not
-- housekeeping.
--
-- `search_path` is pinned empty and every reference schema-qualified: a SECURITY DEFINER function that
-- resolves names through the caller's `search_path` can be hijacked by a same-named object in a schema
-- the caller controls.
CREATE OR REPLACE FUNCTION public.ensure_auth_user(p_id uuid, p_email text, p_name text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_existing uuid;
BEGIN
  IF p_id IS NULL OR p_email IS NULL OR btrim(p_email) = '' THEN
    RETURN NULL;
  END IF;

  -- Already mirrored, by id or by email. Returning the row that exists (rather than the id we were
  -- handed) matters: if an account was created through GoTrue first, its id is the real one and the
  -- caller should be told so instead of assuming its own value won.
  SELECT au.id INTO v_existing FROM auth.users au
   WHERE au.id = p_id OR lower(au.email) = lower(p_email)
   LIMIT 1;
  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  -- The eight '' token columns are required, not decoration: GoTrue reads them into non-nullable Go
  -- strings, and a NULL makes its admin API 500 for every user. See the long note above the backfill.
  INSERT INTO auth.users (
    id, instance_id, aud, role, email, email_confirmed_at,
    created_at, updated_at,
    confirmation_token, recovery_token, email_change, email_change_token_new,
    email_change_token_current, phone_change, phone_change_token, reauthentication_token,
    raw_app_meta_data, raw_user_meta_data
  ) VALUES (
    p_id, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated',
    lower(p_email), now(), now(), now(),
    '', '', '', '', '', '', '', '',
    jsonb_build_object('provider', 'starr_registered_users',
                       'providers', jsonb_build_array('starr_registered_users')),
    jsonb_build_object('name', p_name, 'mirrored_from', 'registered_users', 'mirrored_at', now())
  );

  RETURN p_id;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_auth_user(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ensure_auth_user(uuid, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.ensure_auth_user(uuid, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_auth_user(uuid, text, text) TO service_role;

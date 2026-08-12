// lib/auth/mirror-auth-user.ts
//
// Keep `auth.users` in step with `registered_users`, one account at a time.
//
// ── WHY THIS EXISTS ───────────────────────────────────────────────────────────────────────────────
//
// This app authenticates against `registered_users` — its own credentials table, plus Google sign-in
// that auto-creates a row there. But a large part of the schema was designed around Supabase Auth: 14
// foreign keys across 10 tables reference `auth.users`, and five of them are NOT NULL —
// `receipts.user_id`, `equipment_reservations.reserved_by`, and `location_pings` / `location_stops` /
// `location_segments`.`user_id`.
//
// Nothing ever created an `auth.users` row, so that table was empty and all five write paths failed
// for every person at the firm. Receipt upload returned 422 to the owner and to every admin — which is
// why `receipts` was empty. Not "nobody tried": nobody could.
//
// Seed 582 backfilled the accounts that existed. This function is the other half: without it the next
// person invited or registered lands in `registered_users` only and hits the same wall, and the bug
// returns one account at a time — the worse version, because the table is no longer conspicuously
// empty and the failure looks like a per-user glitch.
//
// ── WHY IT GOES THROUGH AN RPC ────────────────────────────────────────────────────────────────────
//
// PostgREST does not expose the `auth` schema, so `supabaseAdmin.from('auth.users').insert(...)` cannot
// work — the write has to happen inside the database. Seed 582 defines
// `public.ensure_auth_user(uuid, text, text)` as SECURITY DEFINER, granted to `service_role` only, and
// idempotent (it returns an existing row's id rather than inserting a second one).
//
// ── WHY FAILURE IS NON-FATAL ──────────────────────────────────────────────────────────────────────
//
// Callers are account-creation paths. If the mirror fails, the right outcome is a usable account that
// cannot yet file a receipt — not a failed signup. So this logs loudly and returns null rather than
// throwing: the account is the user's, and the mirror is our bookkeeping. The 422 on the upload route
// names this condition precisely, so a missed mirror is diagnosable rather than mysterious.
import { supabaseAdmin } from '@/lib/supabase';

/**
 * Ensure an `auth.users` row exists for a `registered_users` account, sharing its id.
 *
 * The shared id is the whole point: `receipts.user_id` resolves through the FK, and `auth.uid()`
 * equals `registered_users.id` for a Supabase-Auth session, so the four `user_id = auth.uid()` RLS
 * policies on `receipts` keep meaning what they say. One identity value, two tables that agree.
 *
 * @returns the auth user id, or null when the mirror could not be made (logged, never thrown).
 */
export async function ensureAuthUser(
  id: string | null | undefined,
  email: string | null | undefined,
  name?: string | null,
): Promise<string | null> {
  if (!id || !email?.trim()) return null;
  try {
    const { data, error } = await supabaseAdmin.rpc('ensure_auth_user', {
      p_id: id,
      p_email: email.trim().toLowerCase(),
      p_name: name ?? null,
    });
    if (error) {
      // Named explicitly because the recovery differs: a missing function means seed 582 has not been
      // applied to this database, which is a deploy problem, not a data problem.
      console.error(
        `[ensureAuthUser] could not mirror ${email} into auth.users: ${error.message}. ` +
          'If this says the function does not exist, seeds/582_mirror_registered_users_into_auth_users.sql ' +
          'has not been applied to this database. Receipt upload and equipment/location writes will 422 ' +
          'for this account until it is.',
      );
      return null;
    }
    // The function returns the pre-existing id when one is already present, which can differ from the
    // id we passed if the account was created through GoTrue first. Returning it lets a caller notice.
    return (data as string | null) ?? null;
  } catch (err) {
    console.error('[ensureAuthUser] threw:', err);
    return null;
  }
}

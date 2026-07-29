// lib/dnd/password-policy.ts — the password floor, and the login throttle's subjects (P2-3, audit F-2).
//
// TWO THINGS THIS SLICE FOUND, both worse than the finding described.
//
// **1. The throttle was on the route nobody uses.** P2-1 added the `login` bucket to
// `app/api/dnd/auth/login/route.ts` — the LEGACY email login. The pseudo-login the hub actually signs people
// in with is `auth/quick` ("SIGN IN / CLAIM NAME"), which verifies a password against a stored bcrypt hash
// and had **no throttle at all**. So F-2's exposure was live the whole time P2-1 was marked done, on the
// route that carries every real sign-in. `auth/register` was likewise unlimited.
//
// **2. Raising the minimum in the obvious place would lock people out.** `auth/quick` is one handler that
// both CLAIMS a name and SIGNS IN to an existing one, and its length check ran before that branch. Bumping
// the constant from 4 to 8 there would have rejected every existing player whose password is four
// characters — at sign-in, on their own account, with a message about password length. The slice's "for
// **new** accounts only" is the whole point, and the structure of that route makes getting it wrong the
// path of least resistance.

/** Names are unchanged at 4. A name is a handle, not a secret, and shortening the pool hurts nobody. */
export const MIN_NAME_LENGTH = 4;

/**
 * The floor for passwords set from now on. Applies ONLY where an account is created or a password changed —
 * never on a sign-in path, where the stored hash is the authority and the plaintext length is not our
 * business.
 */
export const MIN_NEW_PASSWORD_LENGTH = 8;

/**
 * The floor an EXISTING account's sign-in must satisfy: none.
 *
 * Exported as a named constant rather than left implicit, because "we do not check length at sign-in" is a
 * deliberate decision that looks like an oversight. Checking it would lock out every account created under
 * the old rule, and would leak nothing useful in exchange — an attacker learns a password is short only by
 * guessing it, at which point the length no longer matters.
 */
export const MIN_SIGNIN_PASSWORD_LENGTH = 0;

export interface PasswordCheck { ok: boolean; error?: string }

/** Validate a password being SET. The message names the requirement, since the user can act on it. */
export function checkNewPassword(password: string): PasswordCheck {
  if ((password ?? '').length < MIN_NEW_PASSWORD_LENGTH) {
    return { ok: false, error: `Password must be at least ${MIN_NEW_PASSWORD_LENGTH} characters.` };
  }
  return { ok: true };
}

/** Validate a display name being claimed. */
export function checkName(name: string): PasswordCheck {
  if ((name ?? '').trim().length < MIN_NAME_LENGTH) {
    return { ok: false, error: `Name must be at least ${MIN_NAME_LENGTH} characters.` };
  }
  return { ok: true };
}

/**
 * The subjects a sign-in attempt is counted against: the caller's address AND the name being attempted.
 *
 * Both, because either alone has a blind spot. Address-only misses a distributed attack on one account,
 * where every source looks quiet; name-only misses someone spraying one password across many names from a
 * single host. Shared here so `login`, `quick` and `register` cannot drift into limiting different things —
 * which is the specific way this control was already half-applied.
 */
export function loginSubjects(nameOrEmail: string, ip: string | null): string[] {
  const who = (nameOrEmail ?? '').trim().toLowerCase();
  return [`ip:${(ip ?? '').trim() || 'unknown'}`, `name:${who}`];
}

/** The first forwarded address, which is the caller in a proxied deployment. */
export function callerIp(headers: { get(name: string): string | null }): string | null {
  return headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;
}

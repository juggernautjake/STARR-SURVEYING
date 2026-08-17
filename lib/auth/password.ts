// lib/auth/password.ts — whether an account HAS a password, and whether a proposed one is allowed.
//
// Owner, 2026-08-16: *"if a user uses their org registered credentials to login in the employee
// portal they can successfully login without necessarily having to use the login with google
// option … They should be able to both use the google login and the raw credentials to log in."*
//
// ── WHAT WAS ACTUALLY BROKEN ────────────────────────────────────────────────────────────────────
//
// Not the credentials provider, and not the login form. `lib/auth.ts` has had a `Credentials`
// provider the whole time and `/admin/login` has always rendered an email + password form beside the
// Google button. Both were wired correctly.
//
// The gap was that **four of the five active staff had no password to type**. `password_hash` is
// `TEXT NOT NULL`, so the two code paths that create an account without one write an EMPTY STRING:
// `ensureRegisteredUser` (the Google auto-create, `lib/auth.ts`) and `POST /api/admin/users`. A real
// hash only ever came from public self-registration, which no employee used. Measured 2026-08-16:
//
//   hankmaddux · jackcabaniss · johnharding · michaelgibbs  →  password_hash = '' (length 0)
//   jacobmaddux@starr-surveying.com                          →  $2b$10$… (60)
//
// `bcrypt.compare(anything, '')` returns false rather than throwing, so those four got
// "Invalid email or password" forever — a message describing a wrong password, for an account that
// had never had one, with no screen anywhere in the app to set one.
//
// So the fix is not "enable credentials login". It is: give an account a way to GET a password.
//
// ── WHY AN EMPTY HASH IS ITS OWN STATE, NOT A BAD PASSWORD ──────────────────────────────────────
//
// `hasPassword()` exists so that "this account cannot use password login" is answerable without
// touching bcrypt, and so the two cases stay distinguishable everywhere:
//
//   · no password set  → the person must set one (or use Google). Requiring a CURRENT password to
//                        set the first one would be unsatisfiable: there is nothing to type.
//   · password set     → changing it requires proving you know the old one, even inside a session,
//                        because a borrowed unlocked laptop should not become a permanent takeover.
//
// Pure module: no I/O, no bcrypt, no Next. Tested in `__tests__/auth/password.test.ts`.

/** The shortest password the platform accepts. Matches `POST /api/auth/register`, which has always
 *  used 8 — a second, different minimum would mean a password you can register with but not change
 *  to. */
export const MIN_PASSWORD_LENGTH = 8;

/** bcrypt cost. 12 matches the newest hashes in the table; the one $2b$10$ row predates it and is
 *  left alone — a rehash on next successful sign-in is a separate, optional slice. */
export const BCRYPT_COST = 12;

/**
 * Does this account have a usable password?
 *
 * The column is `NOT NULL`, so "none" is stored as `''` — but `null`/`undefined` are accepted here
 * too rather than trusted to be impossible. A guard that assumes its input shape is the guard that
 * throws on the one row that disagrees.
 */
export function hasPassword(hash: string | null | undefined): boolean {
  return typeof hash === 'string' && hash.trim().length > 0;
}

export type PasswordProblem =
  | { ok: true }
  | { ok: false; reason: 'TOO_SHORT' | 'EMPTY' | 'SAME_AS_CURRENT' | 'TOO_LONG'; message: string };

/**
 * Is this an acceptable new password?
 *
 * `currentPlain` is optional and only used to refuse a no-op change. It is never logged and never
 * returned.
 */
export function validateNewPassword(candidate: unknown, currentPlain?: string): PasswordProblem {
  if (typeof candidate !== 'string' || candidate.length === 0) {
    return { ok: false, reason: 'EMPTY', message: 'Enter a new password.' };
  }
  if (candidate.length < MIN_PASSWORD_LENGTH) {
    return {
      ok: false,
      reason: 'TOO_SHORT',
      message: `Use at least ${MIN_PASSWORD_LENGTH} characters.`,
    };
  }
  // bcrypt silently truncates at 72 BYTES. Accepting more would mean two different passwords that
  // both work, which is a surprise nobody needs to discover during an audit.
  if (new TextEncoder().encode(candidate).length > 72) {
    return { ok: false, reason: 'TOO_LONG', message: 'That password is too long (72 bytes max).' };
  }
  if (currentPlain && candidate === currentPlain) {
    return { ok: false, reason: 'SAME_AS_CURRENT', message: 'That is already your password.' };
  }
  return { ok: true };
}

/**
 * What the caller must supply to change a password, given what the account already has.
 *
 * Split out from the route so the rule is stated once and can be tested without a session: the
 * FIRST password needs no proof beyond being signed in, every later one does.
 */
export function requiresCurrentPassword(existingHash: string | null | undefined): boolean {
  return hasPassword(existingHash);
}

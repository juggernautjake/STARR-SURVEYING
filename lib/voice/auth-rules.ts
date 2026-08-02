// lib/voice/auth-rules.ts — password rules, shared by the browser and the server.
//
// Split out of `lib/voice/auth.ts` for the same reason `usage.ts` was split out of `contracts.ts`:
// the login form is a CLIENT component and needs this one function for instant feedback, while
// `auth.ts` imports bcryptjs, `node:crypto` and `next/headers` — none of which can exist in a browser
// bundle. Webpack follows the module graph, not the usage, so importing one function from `auth.ts`
// would drag the session-signing secret's module into client JavaScript.
//
// The rule to keep: any value the client needs lives in a module with no server-only imports, and the
// server module re-exports it so there is still exactly one definition.

/**
 * Why length only, and no composition rules.
 *
 * "One uppercase, one number, one symbol" pushes people to `Password1!` — which is short, predictable
 * and appears in every credential list ever leaked. A 10-character minimum with no other constraints
 * is current NIST guidance and is the rule that actually helps a single-user studio account, because
 * it nudges toward a passphrase instead of a mangled word.
 *
 * The upper bound exists because bcrypt silently truncates input at 72 bytes: without a limit,
 * everything a user types past that character is ignored, which is a security property nobody expects
 * and nobody is told about. Refusing very long input is more honest than pretending to use it.
 */
export function passwordProblem(pw: string): string | null {
  if (typeof pw !== 'string' || pw.length < 10) {
    return 'Use at least 10 characters. A short phrase you can remember beats a short scramble you cannot.';
  }
  if (pw.length > 200) return 'That password is too long — 200 characters is the limit.';
  return null;
}

/**
 * The login identifier may be an email OR a plain username.
 *
 * `va_users.email` is really "the unique login key" — it is never used to send mail from this
 * platform (notifications go through the studio and Web Push). So there is no reason to force an
 * address on someone who would rather type `juggernautjake`, and every reason not to: a login that
 * demands an email from a two-person studio is friction with nothing on the other side of it.
 *
 * Usernames are constrained to a conservative set because this string is compared, indexed and shown
 * in the studio — allowing whitespace or unicode look-alikes would make two visually identical
 * accounts possible.
 */
export function emailProblem(identifier: string): string | null {
  const v = String(identifier ?? '').trim();
  if (!v) return 'Enter your username or email.';
  if (v.length > 200) return 'That is too long.';

  if (v.includes('@')) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) return 'That does not look like an email address.';
    return null;
  }

  if (!/^[a-zA-Z0-9._-]{3,60}$/.test(v)) {
    return 'A username can use letters, numbers, dots, dashes and underscores — 3 characters or more.';
  }
  return null;
}

/** Normalises an identifier for storage and lookup. Lower-cased so `Andrew` and `andrew` are the
 *  same account rather than two accounts nobody can tell apart. */
export function normalizeIdentifier(identifier: string): string {
  return String(identifier ?? '').trim().toLowerCase();
}

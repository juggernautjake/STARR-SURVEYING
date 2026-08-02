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

/** Loose email shape check. Permissive on purpose: this guards a form, not a mailbox. */
export function emailProblem(email: string): string | null {
  const v = String(email ?? '').trim();
  if (!v) return 'Enter your email address.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) return 'That does not look like an email address.';
  if (v.length > 200) return 'That email address is too long.';
  return null;
}

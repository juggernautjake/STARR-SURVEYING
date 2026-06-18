// lib/payouts/approval.ts
//
// P12 of payment-infrastructure-2026-06-18.md — pure helper for the
// payout-admin gate. Today, the user spec names "daddy / Hank" as
// the only approver; tomorrow this becomes a role + threshold-based
// flow. Keeping it env-driven means we can add admins without a
// migration.
//
// Resolution order:
//   1. PAYOUT_ADMIN_EMAILS env var — comma-separated allowlist
//   2. fall through to isAdmin(user.roles) when no env var is set
//      (dev mode + initial rollout)

export interface SessionUserLike {
  email?: string | null;
  roles?: string[] | null;
}

/** Pure helper — does the env var explicitly list this user? */
export function isInPayoutAdminAllowlist(
  email: string | null | undefined,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const raw = env.PAYOUT_ADMIN_EMAILS;
  if (!raw || raw.trim().length === 0 || !email) return false;
  const allowlist = raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  return allowlist.includes(email.trim().toLowerCase());
}

/** Pure helper — combined gate. Allowlist hit wins; otherwise fall
 *  back to the role check via the injected `isAdmin` (passed in so
 *  this module doesn't have to import from `lib/auth` and stays
 *  pure-testable). `isAdmin` is loosely typed — the live impl
 *  accepts both `string[]` and an email; the gate only ever passes
 *  it the roles array. */
export function canApprovePayoutBatch(
  user: SessionUserLike | null | undefined,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  isAdmin: (roles?: any) => boolean,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (!user?.email) return false;
  if (isInPayoutAdminAllowlist(user.email, env)) return true;
  return isAdmin(user.roles ?? []);
}

/** Pure helper — extract the client IP from a NextRequest's headers.
 *  Vercel sets `x-forwarded-for`; we honor the FIRST entry (the
 *  client). Behind a custom reverse proxy use `x-real-ip`. */
export function extractRequestIp(headers: Headers): string | null {
  const fwd = headers.get('x-forwarded-for');
  if (fwd) {
    const first = fwd.split(',')[0]?.trim();
    if (first) return first;
  }
  const real = headers.get('x-real-ip');
  if (real) return real.trim();
  return null;
}

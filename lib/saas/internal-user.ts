// lib/saas/internal-user.ts — "is this person staff at the firm?" (audit §3c.3, item 8h; Q39).
//
// ── THE OLD TEST WAS WRONG FOR TWO OF SIX LIVE ACCOUNTS ─────────────────────────────────────────
//
// `lib/auth.ts` answered this with `email.endsWith('@starr-surveying.com')`, and every `internalOnly`
// route in the registry hangs off it. Measured against production before changing anything:
//
//   organization_members       6 active rows, all in the single Starr org
//   …with a company address    4
//   …WITHOUT one               2 — johntoddharding@gmail.com (role `admin`) and jacobmaddux96@gmail.com
//
// So two people the firm has explicitly made members — one of them an org admin — were failing the
// staff test and losing Assignments, Schedule, My Hours, My Pay, Files, Jobs, Leads, Hours Approval,
// Field Team and the rest. That is question-bank **Q39** ("will contractors have company emails? If
// not, they lose most of the app") already happening, not a hypothetical about a future tenant.
//
// It is also unsellable as-is: a second firm has no @starr-surveying.com addresses at all, so *every*
// one of their staff would fail. Both problems have the same root — an email suffix was standing in
// for a fact the database already records.
//
// ── MEMBERSHIP IS THE TEST; THE DOMAIN IS A CONVENIENCE ─────────────────────────────────────────
//
// A person is internal to a firm when the firm says so: an **active row in `organization_members`**.
// That is a deliberate, revocable act by an admin, it is per-tenant by construction, and it is already
// resolved into the JWT at sign-in (`populateSaasContext`), so this costs no extra query.
//
// The configured email domain stays as a SECOND way to qualify, for the ordinary case of a firm that
// has a company domain and has not got round to adding everyone. It can only ever ADD people, never
// remove them — a firm with no domain configured (which is how Starr's row sits today, and how most
// small firms will sit) must not thereby have zero staff.
//
// ── WHY THIS IS SAFE TO SHIP INTO A LIVE BUSINESS ───────────────────────────────────────────────
//
// It only grants. Every account that passed the old suffix test is an active member of the Starr org,
// so it still passes; the two that were wrongly excluded now pass too. Nobody loses access. The
// external LMS accounts have no membership and remain external, exactly as before.

import type { UserRole } from '@/lib/auth';

/** The shape this needs from a session — spelled out rather than importing the whole NextAuth type, so
 *  it can be called from a server component, a client component, or a test with a literal. */
export interface InternalUserSessionLike {
  user?: {
    email?: string | null;
    roles?: UserRole[];
    memberships?: Array<{ orgId: string }>;
    activeOrgId?: string | null;
    isCompanyUser?: boolean;
  } | null;
}

/** Is this session's user staff at a firm?
 *
 *  Reads the boolean the JWT already resolved when it can. The fallback recomputes from memberships
 *  for a session minted before this field existed — without it, every signed-in user would drop to
 *  "external" the moment this deploys, and stay there until their token refreshed. A migration that
 *  logs the whole company out of half the app for thirty seconds is not an acceptable one. */
export function isInternalUser(session: InternalUserSessionLike | null | undefined): boolean {
  const user = session?.user;
  if (!user) return false;
  if (typeof user.isCompanyUser === 'boolean') return user.isCompanyUser;
  return (user.memberships?.length ?? 0) > 0;
}

/** The server-side rule, for `populateSaasContext` and for tests that want to assert it directly.
 *
 *  `memberOfAnyOrg` — not "member of the ACTIVE org". A person who belongs to two firms is staff in
 *  both; the active org decides which firm's *data* they see (that is `org-scope.ts`'s job), not
 *  whether they are staff at all. Conflating the two would make switching orgs briefly demote you. */
export function resolveIsCompanyUser(opts: {
  email: string | null | undefined;
  memberOfAnyOrg: boolean;
  /** The active org's `domain_restriction`, normalised without the '@'. Null = the firm doesn't use one. */
  emailDomain: string | null | undefined;
}): boolean {
  if (opts.memberOfAnyOrg) return true;
  const domain = opts.emailDomain?.replace(/^@/, '').toLowerCase();
  if (!domain || !opts.email) return false;
  return opts.email.toLowerCase().endsWith(`@${domain}`);
}

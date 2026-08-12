import { auth } from '@/lib/auth';
import { NextResponse } from 'next/server';
import type { UserRole } from '@/lib/auth';
import { canAccessRoute, upgradePromptUrl, bundleForRoute } from '@/lib/saas/bundle-gate';
import { apiGateFor } from '@/lib/saas/api-bundle-gate';
import type { BundleId } from '@/lib/saas/bundles';
import { hasBundle } from '@/lib/saas/bundles';
// consolidation Slice 2 (2026-05-30) — legacy `my-*` + `/admin/profile`
// pages were 4-line `redirect()` calls per the 2024 hub redesign Phase
// 2 slice 2c. The page files are now deleted; these middleware-level
// redirects keep external bookmarks + saved notification deep-links
// working. Lives in lib/admin/ so the spec can import it without
// dragging in next-auth's `next/server` dependency.
import { LEGACY_REDIRECTS } from '@/lib/admin/legacy-redirects';

// ── Route-level role enforcement ──
// Maps route prefixes to the roles allowed to access them.
// Admin always bypasses (checked below). Developer has broad access.
// If a route is not listed here, any authenticated user can access it.
//
// IMPORTANT: More specific routes MUST appear before less specific ones.
// e.g. /admin/jobs/new before /admin/jobs, /admin/research/testing before /admin/research

const ROUTE_ROLES: { prefix: string; roles: UserRole[] }[] = [
  // ── Admin-only ──
  { prefix: '/admin/settings', roles: ['admin'] },
  { prefix: '/admin/payroll', roles: ['admin'] },

  // ── People / User Management ──
  { prefix: '/admin/users', roles: ['admin', 'tech_support'] },
  // Slice W7 — role builder. Admin-only at the request level.
  { prefix: '/admin/roles', roles: ['admin'] },
  { prefix: '/admin/employees', roles: ['admin', 'developer', 'tech_support'] },

  // ── Work (specific before general) ──
  { prefix: '/admin/jobs/new', roles: ['admin'] },
  { prefix: '/admin/jobs/import', roles: ['admin'] },
  { prefix: '/admin/jobs', roles: ['admin', 'developer', 'field_crew', 'researcher', 'tech_support'] },
  // /admin/my-jobs + /admin/my-hours role-gates removed in
  // consolidation Slice 2 — the redirect at the top of the handler
  // takes the user to /admin/me?tab=… before we reach the role check.
  { prefix: '/admin/leads', roles: ['admin', 'developer', 'tech_support'] },
  // A7 — admin only, and narrower than /admin/leads on purpose: this page hands out a file containing
  // customer conversion values and hashed identifiers, and it writes into the ad account's record of what
  // has been uploaded. That is a commercial control, not a work queue.
  { prefix: '/admin/marketing', roles: ['admin'] },
  // Editing what an activity pays changes everybody's wages, so it sits with payroll rather than
  // with the work queues that tech_support can reach.
  { prefix: '/admin/pay-rates', roles: ['admin', 'developer'] },
  // Reading who was paid what is a money question, same gate as the rest of payouts.
  { prefix: '/admin/payouts/search', roles: ['admin'] },
  { prefix: '/admin/hours-approval', roles: ['admin', 'developer', 'tech_support'] },
  // `researcher` added 2026-08-04, when 'My Jobs' was folded into 'Assignments'. The retired entry
  // offered it to researchers and pointed at the Hub, which is open to everyone — so the mismatch
  // only became visible once the link went somewhere real. A researcher assigned to a job needs to
  // see that they are assigned to it.
  { prefix: '/admin/assignments', roles: ['admin', 'developer', 'employee', 'field_crew', 'researcher', 'tech_support'] },
  { prefix: '/admin/schedule', roles: ['admin', 'developer', 'employee', 'field_crew', 'tech_support'] },

  // ── Money & bookkeeping (audit S19) ──
  // Every prefix here was reachable by ANY authenticated user until 2026-08-04. The pages never
  // leaked: all seven fetch through `/api/admin/*` routes that check `isAdmin`, so a field-crew
  // visitor got a bookkeeping shell full of 403s rather than anyone's money. That is the failure
  // mode this section closes — a broken page that looks like a permissions bug, and a gate living
  // in exactly one layer instead of two.
  //
  // Each role list MATCHES THE NAV REGISTRY's list for the same href, deliberately, and is a
  // superset of what the backing API allows. Two layers, two jobs:
  //
  //   middleware (here) — keeps out roles the product never offers the page to at all
  //   the API           — decides who actually gets the data, and is the real boundary
  //
  // Copying the API's stricter `isAdmin` down to here instead would bounce every `developer` and
  // `tech_support` user to /admin/me the moment they clicked a link their own sidebar still shows
  // them. Trading a broken page for a vanishing one is not a fix.
  //
  // KNOWN MISMATCH, left for the owner: the nav offers these to developer/tech_support while the
  // APIs answer only to `admin`, so those roles get a 403 shell today. Closing it means either
  // widening the APIs (a permissions decision) or dropping the nav links (a product one). Both are
  // the owner's call, not a side effect of a middleware slice — see FINANCE_TAX_AND_INTAKE §S19.
  // Capture Receipt belongs to EVERY signed-in member of staff, and the list below is exhaustive on
  // purpose rather than lazily broad. Its API (`/api/admin/receipts/upload`) checks only that there
  // is a session — no role at all — so anyone who can sign in can file an expense, and that is the
  // right rule: the person holding the fuel receipt is whoever happened to fill the truck.
  //
  // This entry MUST precede '/admin/receipts'. That prefix also matches '/admin/receipts/new', and
  // first-match-wins means the approval queue's admin-only list would otherwise bounce a crew member
  // at the moment they tried to file the expense. Deleting this entry does not open the route — it
  // hands it to the queue's gate. It has to be listed, and listed first.
  //
  // S19 first shipped this with the nav registry's seven roles, which silently dropped `employee` —
  // the DEFAULT role every staff member falls back to in this very file. A new hire could file a
  // receipt before that gate existed and could not afterwards. Found by driving the app at phone
  // width, not by review; see W6c in the PWA doc.
  // F1b — the card registry. Admin only, matching `/api/admin/payment-cards`, which checks
  // `isAdmin`. Not wider: the page lists holder names and what each card means for the books, and
  // there is no nav entry offering it to anyone else, so nothing bounces. (W6c's rule cuts the other
  // way here — the danger is a gate STRICTER than its API, and this one is equal to it.)
  { prefix: '/admin/cards', roles: ['admin'] },
  // F2b — pass-through recovery. Admin only for the same reason and by the same rule: it matches
  // `/api/admin/cost-recoveries` exactly. The rows say what a job really cost and what the customer
  // was really charged, which is the margin on the job stated out loud.
  { prefix: '/admin/pass-through', roles: ['admin'] },
  { prefix: '/admin/receipts/new', roles: ['admin', 'developer', 'teacher', 'student', 'researcher', 'drawer', 'field_crew', 'employee', 'guest', 'tech_support', 'equipment_manager'] },
  { prefix: '/admin/receipts', roles: ['admin', 'developer', 'tech_support'] },
  { prefix: '/admin/invoicing', roles: ['admin', 'developer', 'tech_support'] },
  { prefix: '/admin/receivables', roles: ['admin', 'developer'] },
  { prefix: '/admin/reports', roles: ['admin', 'developer', 'tech_support'] },
  { prefix: '/admin/compliance', roles: ['admin', 'developer', 'tech_support'] },
  { prefix: '/admin/team', roles: ['admin', 'developer', 'tech_support'] },
  { prefix: '/admin/finances', roles: ['admin', 'developer', 'tech_support'] },
  //
  // NOT gated here, deliberately, and each for a different reason:
  //   /admin/people   — the staff directory is open to staff BY DESIGN ("a crew member looking up a
  //                     colleague's number is the most common use of it"). Its API strips roles and
  //                     account state for non-admins rather than refusing the request, so a gate
  //                     here would remove a feature rather than protect one.
  //   /admin/billing, /admin/payouts, /admin/audit, /admin/org-settings, /admin/orgs, /admin/invites
  //                   — SaaS surfaces scoped by org membership via resolveAdminOrg(), not by Starr's
  //                     internal roles. Gating them on `admin` would lock out the org admins they
  //                     exist for, which is a worse bug than the one being fixed.
  //   /admin/money    — a link hub (WorkspaceLanding); every destination it lists is gated above.

  // ── Learning (management routes before general) ──
  { prefix: '/admin/learn/manage', roles: ['admin', 'developer', 'teacher', 'tech_support'] },
  { prefix: '/admin/learn/students', roles: ['admin', 'developer', 'teacher', 'tech_support'] },
  // All other /admin/learn/* routes are open to any authenticated user

  // ── Research (specific before general) ──
  { prefix: '/admin/research/testing', roles: ['admin', 'developer', 'tech_support'] },
  { prefix: '/admin/research', roles: ['admin', 'developer', 'researcher', 'drawer', 'field_crew', 'tech_support'] },

  // ── CAD ──
  // Slice W4 (hub-cad-roles-polish-2026-06-18) — user spec: "If
  // a user does not have the drawing role and clicks the cad
  // button … they are still routed to the cad software. We
  // might change this in the future, but for now leave it."
  // The middleware role gate is widened to every UserRole so
  // any signed-in user lands on the CAD editor. Restore a
  // narrower list once permissions (W7) lands and the user
  // decides the long-term policy.
  { prefix: '/admin/cad', roles: ['admin', 'developer', 'drawer', 'researcher', 'field_crew', 'tech_support', 'equipment_manager', 'employee', 'teacher', 'student', 'guest'] },

  // ── Rewards & Pay ──
  { prefix: '/admin/rewards/admin', roles: ['admin', 'developer', 'tech_support'] },
  { prefix: '/admin/rewards', roles: ['admin', 'developer', 'employee', 'field_crew', 'tech_support'] },
  { prefix: '/admin/pay-progression', roles: ['admin', 'developer', 'field_crew', 'tech_support'] },
  // /admin/my-pay role-gate removed in consolidation Slice 2 — handled
  // by the LEGACY_REDIRECTS table at the top of the handler.
  { prefix: '/admin/payout-log', roles: ['admin', 'developer', 'field_crew', 'tech_support'] },

  // ── Communication ──
  { prefix: '/admin/messages', roles: ['admin', 'developer', 'employee', 'teacher', 'researcher', 'drawer', 'field_crew', 'tech_support'] },

  // ── Notes & Files ──
  { prefix: '/admin/notes', roles: ['admin', 'developer', 'tech_support'] },

  // ── Admin tools ──
  { prefix: '/admin/error-log', roles: ['admin', 'developer', 'tech_support'] },
  { prefix: '/admin/discussions', roles: ['admin', 'developer', 'employee', 'teacher', 'researcher', 'drawer', 'field_crew', 'tech_support'] },
];

function matchesRoute(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(prefix + '/');
}

// ── /dnd (hidden D&D platform) gate — Phase B, B6 ──
// The /dnd area has its OWN cookie-based auth (lib/dnd/auth.ts), separate from
// staff next-auth. Middleware runs on the Edge runtime, where the node:crypto
// HMAC verify used by the session lib isn't available — so here we only do a
// cheap PRESENCE check on the `dnd_session` cookie for a fast redirect. Full
// signature verification still happens server-side in every /dnd page/route
// via getDndUser() (a forged/expired cookie passes this gate but resolves to
// null there and bounces to login), so this layer is UX, not the security
// boundary.
function dndGate(req: Parameters<Parameters<typeof auth>[0]>[0]): NextResponse | null {
  const { pathname } = req.nextUrl;
  if (!pathname.startsWith('/dnd')) return null;

  // Access model (user decision 2026-07-06): /dnd is PUBLIC by default — reachable by
  // direct link only (noindex + no marketing links in). Let every /dnd route through;
  // pages that still need an identity redirect themselves (the visitor enters via a
  // roster card first). The invite/login flow (B1–B7) is retained and re-enabled by
  // setting DND_REQUIRE_LOGIN=1, which falls through to the cookie gate below.
  if (process.env.DND_REQUIRE_LOGIN !== '1') return NextResponse.next();

  // Public within /dnd: the sign-in + invite-acceptance pages, and the Lazzuh_Gun
  // sheet — both the legacy iframe bridge and the C2 native preview at
  // /dnd/Lazzuh_Gun/native (this sheet has always been hidden-by-URL, not
  // auth-gated; C6 consolidates it and retires the iframe).
  const isPublic =
    pathname === '/dnd/login' ||
    // Account recovery (P2-4). MUST be public: everyone who needs it is locked out by definition, so
    // gating it behind a session would redirect them to the sign-in page they cannot get past — a
    // recovery route that only works for people who do not need it.
    pathname === '/dnd/recover' ||
    pathname.startsWith('/dnd/join') ||
    // The RULES LIBRARY is readable by anyone with the link, even when login is enforced
    // (owner 2026-07-20): the owner shares library URLs with people who have no account.
    // Reading rules is open; building a character or campaign still needs a session.
    pathname.startsWith('/dnd/library') ||
    pathname === '/dnd/Lazzuh_Gun' ||
    pathname.startsWith('/dnd/Lazzuh_Gun/');

  const hasSession = Boolean(req.cookies.get('dnd_session')?.value);

  // Signed-in user hitting login/join → send them into the app.
  if (hasSession && (pathname === '/dnd/login' || pathname.startsWith('/dnd/join'))) {
    return NextResponse.redirect(new URL('/dnd', req.url));
  }
  if (isPublic) return NextResponse.next();
  if (!hasSession) {
    const loginUrl = new URL('/dnd/login', req.url);
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }
  return NextResponse.next();
}

/** Bundle enforcement for `/api/admin/*` (§3c.1, item 8f).
 *
 *  Three properties, each deliberate:
 *
 *  · **It never touches authentication.** An unauthenticated request falls straight through to the
 *    handler, which returns its own 401. Making middleware answer that too would give the same
 *    question two answers, and the handler's is the one that has been right for 351 routes.
 *  · **It is inert for a session with no org memberships** — which is every Starr session today.
 *    Single-tenant behaviour is unchanged by construction, not by testing every route.
 *  · **It answers in JSON.** The page gate redirects to an upgrade prompt; doing that to a `fetch`
 *    yields an HTML login page parsed as JSON, and the caller reports a parse error instead of
 *    "you do not have this bundle". A 402 says what is wrong and what would fix it. */
function apiBundleGate(
  req: Parameters<Parameters<typeof auth>[0]>[0],
  pathname: string,
): NextResponse {
  const user = req.auth?.user as unknown as {
    isOperator?: boolean;
    memberships?: Array<{ orgId: string; bundles: BundleId[] }>;
    activeOrgId?: string | null;
  } | undefined;

  // No session, no operator bypass needed, no memberships → not a tenant request. Let the handler
  // do its own auth exactly as it does today.
  if (!user || user.isOperator) return NextResponse.next();
  const memberships = user.memberships;
  if (!memberships || memberships.length === 0) return NextResponse.next();

  const active = memberships.find((m) => m.orgId === user.activeOrgId) ?? memberships[0];
  const bundles = active?.bundles ?? [];
  const decision = apiGateFor(pathname);

  if (decision.kind === 'open') return NextResponse.next();

  if (decision.kind === 'unclassified') {
    // Refused rather than guessed. A route wrongly blocked is a support call in minutes; a route
    // wrongly open is a paid feature given away silently and forever. The message names the file to
    // fix, because the person who sees this is the person who can fix it.
    return NextResponse.json(
      {
        error: 'This endpoint has no bundle classification, so access was refused.',
        detail: `Classify ${pathname} in lib/saas/api-bundle-gate.ts (API_GROUP_GATES) or register its page.`,
      },
      { status: 403 },
    );
  }

  if (!hasBundle(bundles, decision.bundle)) {
    return NextResponse.json(
      {
        error: 'Your plan does not include this feature.',
        requiredBundle: decision.bundle,
        upgradeUrl: upgradePromptUrl(pathname, decision.bundle),
      },
      { status: 402 }, // Payment Required — literally true, and distinguishable from 401/403.
    );
  }

  return NextResponse.next();
}

export default auth((req) => {
  const { pathname } = req.nextUrl;

  // /dnd runs its own auth; handle it before the staff /admin logic.
  const dnd = dndGate(req);
  if (dnd) return dnd;

  // ── SaaS bundle gate for the API (8f) ──
  // The page gate below has always worked; the matcher simply never included `/api`, so all 351
  // admin API handlers were reachable by a firm that had not bought them. Auth is enforced inside
  // each handler and stays there — this asks the other question, "did you buy this".
  if (pathname.startsWith('/api/admin/')) return apiBundleGate(req, pathname);

  if (!pathname.startsWith('/admin')) return NextResponse.next();

  // consolidation Slice 2 (2026-05-30) — legacy URL redirects run
  // BEFORE auth so even a logged-out user hitting an old bookmark
  // lands on the right canonical URL (then the auth check below sends
  // them to /admin/login with the correct callbackUrl).
  const redirectTarget = LEGACY_REDIRECTS[pathname];
  if (redirectTarget) {
    return NextResponse.redirect(new URL(redirectTarget, req.url));
  }

  // Allow login and register pages.
  // post-signup-landing-hub-2026-06-18 — a signed-in user hitting /login
  // or /register bounces to the Hub instead of the legacy dashboard, so
  // newly-created accounts land at /admin/me on their first sign-in.
  if (pathname === '/admin/login' || pathname === '/admin/register') {
    if (req.auth?.user) return NextResponse.redirect(new URL('/admin/me', req.url));
    return NextResponse.next();
  }

  // Require authentication
  if (!req.auth?.user) {
    const loginUrl = new URL('/admin/login', req.url);
    loginUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // If the JWT was marked as blocked (banned/unapproved), force sign-out
  if ((req.auth as any).blocked) {
    const loginUrl = new URL('/admin/login', req.url);
    loginUrl.searchParams.set('error', 'AccountBlocked');
    return NextResponse.redirect(loginUrl);
  }

  const userRoles: UserRole[] = (req.auth.user as any).roles || [(req.auth.user as any).role || 'employee'];

  // Admin bypasses all route restrictions
  if (userRoles.includes('admin')) return NextResponse.next();

  // Check route-specific role restrictions (first match wins — order matters)
  // post-signup-landing-hub-2026-06-18 — fall-back bounce target is the
  // Hub so a forbidden route lands the user on their personal home, not
  // a less-useful dashboard.
  for (const route of ROUTE_ROLES) {
    if (matchesRoute(pathname, route.prefix)) {
      if (!route.roles.some(r => userRoles.includes(r))) {
        return NextResponse.redirect(new URL('/admin/me', req.url));
      }
      break;
    }
  }

  // ── SaaS bundle gate (M-9b) ──
  // Runs after role gate passes. Operators bypass (Starr employees who
  // are also operator_users hit the operator console directly anyway).
  // Sessions without a memberships array (legacy JWTs minted before
  // M-9a's populateSaasContext) fall through unrestricted — they get
  // bundle-gated once the JWT refresh tick repopulates.
  const auth_user = req.auth.user as unknown as {
    isOperator?: boolean;
    memberships?: Array<{ orgId: string; bundles: BundleId[] }>;
    activeOrgId?: string | null;
  };
  const memberships = auth_user.memberships;
  if (!auth_user.isOperator && memberships && memberships.length > 0) {
    const requiredBundle = bundleForRoute(pathname);
    if (requiredBundle) {
      const active = memberships.find((m) => m.orgId === auth_user.activeOrgId) ?? memberships[0];
      const activeBundles = active?.bundles ?? [];
      if (!canAccessRoute({ pathname, bundles: activeBundles })) {
        return NextResponse.redirect(new URL(upgradePromptUrl(pathname, requiredBundle), req.url));
      }
    }
  }

  return NextResponse.next();
});

// '/api/admin/:path*' added 2026-08-01 (audit 8f). Its absence was the entire reason 351 admin API
// handlers had never been bundle-gated: '/api/...' does not start with '/admin', so the gate below
// — which has worked correctly for pages since M-9b — was never consulted for the data path.
export const config = { matcher: ['/admin/:path*', '/api/admin/:path*', '/dnd/:path*'] };

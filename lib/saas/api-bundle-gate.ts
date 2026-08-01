// lib/saas/api-bundle-gate.ts — bundle enforcement for the API, not just the menu (§3c.1, item 8f).
//
// Owner objective 2026-08-01: *"package the different parts of the app and have a subscription
// service so that surveying firms can use our product."*
//
// ── WHAT WAS ACTUALLY WRONG ────────────────────────────────────────────────────────────────────
//
// The audit recorded this as "1 of 131 routes carries a requiredBundle", which reads as "packaging is
// undeclared". Measured, it is not: `bundleForRoute()` already resolves a bundle for *every* admin
// page, via workspace defaults plus a small override map, and `middleware.ts` already redirects a
// firm that lacks it.
//
// The hole is one line — the middleware matcher:
//
//     export const config = { matcher: ['/admin/:path*', '/dnd/:path*'] }
//
// `/api/...` does not start with `/admin`, so **not one of the 351 admin API handlers has ever been
// bundle-gated**. A firm without Recon cannot open `/admin/research` in a browser, and could read
// every byte of it from `/api/admin/research/*` with a fetch. Auth is checked there (every admin API
// route does that, and §7 of the audit is right to call it solid) — but auth answers *"are you a
// user"*, and packaging asks *"did you buy this"*. Nothing was asking the second question.
//
// So this is the audit's "a bundle gate that only hides a menu item is decoration" in its literal
// form. The page gate is real; it just guards the door to a room with no wall behind it.
//
// ── WHY THE MAPPING IS DERIVED AND NOT LISTED ──────────────────────────────────────────────────
//
// The obvious fix is a second table: 351 API paths → bundles. This repo has already paid for that
// shape twice — §1.3's two navigation lists drifted 32 routes apart, and §1.1b's three queries
// pointed at tables that never existed. A second list here would drift the same way, and its drift
// would be invisible: a route silently losing its gate looks exactly like a route that works.
//
// `/api/admin/X` mirrors `/admin/X` almost everywhere, so the bundle is DERIVED from the page
// registry that already answers this question. Only the 18 API groups with no page at all are listed
// below, each with the reason it is classified the way it is.

import type { BundleId } from './bundles';
import { hasBundle } from './bundles';
import { bundleForRoute } from './bundle-gate';
// Statically imported: this module runs inside `middleware.ts` on the Edge runtime, where `require`
// does not exist. `bundle-gate` already depends on the registry, so this adds no new surface.
import { workspaceOf, ADMIN_ROUTES } from '@/lib/admin/route-registry';

/** What the gate decided about a request path. */
export type ApiGateDecision =
  /** Requires this bundle (or one that implies it). */
  | { kind: 'bundle'; bundle: BundleId }
  /** Deliberately ungated, with the reason recorded so "why is this open" is answerable. */
  | { kind: 'open'; reason: string }
  /** Nobody has classified this route. Refused rather than guessed — see `apiGateFor`. */
  | { kind: 'unclassified' };

/**
 * API groups with no `/admin` page to derive from. Prefix-matched, longest first.
 *
 * A `null` bundle means deliberately always-available. The reason is not decoration: an ungated route
 * in a product that sells access is a revenue hole, and one nobody wrote a reason for is
 * indistinguishable from one somebody forgot.
 */
export const API_GROUP_GATES: Record<string, { bundle: BundleId | null; reason: string }> = {
  // ── Always available, whatever the firm bought ───────────────────────────────────────────────
  // An error reporter that requires a subscription cannot report a broken subscription. This one is
  // load-bearing precisely when everything else is failing.
  'errors': { bundle: null, reason: 'Error reporting must work when nothing else does.' },
  // The user's own record. Personal surfaces follow the person, not the firm's plan (§1.2 classified
  // the same tables "per-user" for the same reason).
  'profile': { bundle: null, reason: 'A person\'s own profile is not a product feature.' },
  'me': { bundle: null, reason: 'The Hub is always available; its tabs gate their own content.' },
  // Account and money surfaces must stay reachable for a firm whose subscription has lapsed —
  // otherwise the one page that could fix the lapse is behind the lapse.
  'billing': { bundle: null, reason: 'Account and payment surfaces must survive a lapsed plan.' },
  'payment-attempts': { bundle: null, reason: 'Account and payment surfaces must survive a lapsed plan.' },
  'org-settings': { bundle: null, reason: 'Account and payment surfaces must survive a lapsed plan.' },
  'org-notifications': { bundle: null, reason: 'Account and payment surfaces must survive a lapsed plan.' },
  'orgs': { bundle: null, reason: 'Account and payment surfaces must survive a lapsed plan.' },
  'invites': { bundle: null, reason: 'Seat management is part of the account, not a bundle.' },
  'support': { bundle: null, reason: 'A firm that cannot reach support cannot report being wrongly gated.' },
  'notifications': { bundle: null, reason: 'Alerts span every bundle a firm holds.' },
  'search': { bundle: null, reason: 'Search spans corpora and filters each by its own permissions (§3b).' },
  'nav-events': { bundle: null, reason: 'Navigation telemetry for the palette — UI plumbing, not a feature.' },
  'install': { bundle: null, reason: 'App install/PWA metadata.' },
  'users': { bundle: null, reason: 'Identity and roles are account-level, not bundle-level.' },
  'roles': { bundle: null, reason: 'Identity and roles are account-level, not bundle-level.' },
  'audit': { bundle: null, reason: 'An audit trail a firm cannot read is not an audit trail.' },
  'settings': { bundle: null, reason: 'Account-level configuration.' },
  // The firm's own name, phone and address (audit item 8h). Every screen renders it, including the
  // ones that stay reachable on a lapsed plan — gating it would leave a firm looking at an app with
  // no name on it while trying to fix their subscription.
  'tenant': { bundle: null, reason: 'A firm\'s own identity is not a product feature.' },
  // Getting field data OUT of a collector and into the app (audit §3d). Gated to `field`: this is
  // the crew-facing product, and a firm that bought only Office has no crews to collect it. Named
  // explicitly rather than derived, because the page it mirrors lives under Work Mode while the
  // capability being sold is Field.
  'field-ingest': { bundle: 'field', reason: 'Collector ingestion is the field product.' },
  // Ephemeral almanac/utility lookups. Gating a sunrise time sells nothing and breaks scheduling for
  // a firm that bought the wrong half.
  'sun': { bundle: null, reason: 'An almanac lookup is not a product tier.' },
  'weather': { bundle: null, reason: 'An almanac lookup is not a product tier.' },
  'calculator-state': { bundle: null, reason: 'Scratch state for a calculator — no data of value behind it.' },

  // ── Office: how a firm runs itself ───────────────────────────────────────────────────────────
  'clock-session': { bundle: 'office', reason: 'Time capture — the "clock in → get paid" spine (D3).' },
  'time-logs': { bundle: 'office', reason: 'Time capture — the "clock in → get paid" spine (D3).' },
  'pto': { bundle: 'office', reason: 'Leave management is people operations.' },
  'pay-config': { bundle: 'office', reason: 'Pay rules are people operations.' },
  'badges': { bundle: 'office', reason: 'Rewards/XP sit in the Office workspace with pay progression.' },
  'xp': { bundle: 'office', reason: 'Rewards/XP sit in the Office workspace with pay progression.' },
  'reply-templates': { bundle: 'office', reason: 'Lead handling is Office (lead → job → invoice).' },
  'google-calendar': { bundle: 'office', reason: 'Scheduling integration.' },
  'activity-tags': { bundle: 'office', reason: 'Taxonomy for the activity log and timeline.' },
  'maintenance': { bundle: 'office', reason: 'Equipment upkeep — the Equipment workspace defaults to Office.' },
  'media': { bundle: 'office', reason: 'The shared media library is general business content.' },
};

/** Turn an API pathname into the page path whose bundle it inherits.
 *  `/api/admin/research/abc/full-extract` → `/admin/research/abc/full-extract`. */
export function pagePathForApi(pathname: string): string | null {
  if (!pathname.startsWith('/api/admin')) return null;
  return '/admin' + pathname.slice('/api/admin'.length);
}

const groupOf = (pathname: string): string | null => {
  const rest = pathname.slice('/api/admin/'.length);
  const seg = rest.split(/[/?]/)[0];
  return seg || null;
};

/**
 * Decide the bundle gate for an API pathname.
 *
 * **Unclassified is refused, not allowed.** The cost of being wrong runs one way, and the deciding
 * factor is how fast the mistake is found: a route wrongly *blocked* produces a support call within
 * minutes from a paying customer, and a route wrongly *open* produces a paid feature given away
 * silently, forever, discovered by nobody. §1.2 made the same call for the same reason.
 *
 * This is safe to fail closed on because it cannot fire for Starr — the gate only applies to a
 * session carrying org memberships, and the ratchet test means a route reaches production classified
 * or does not reach it at all.
 */
export function apiGateFor(pathname: string): ApiGateDecision {
  if (!pathname.startsWith('/api/admin/')) {
    return { kind: 'open', reason: 'Not an admin API route; gated by its own handler.' };
  }

  const group = groupOf(pathname);
  if (group && group in API_GROUP_GATES) {
    const g = API_GROUP_GATES[group];
    return g.bundle ? { kind: 'bundle', bundle: g.bundle } : { kind: 'open', reason: g.reason };
  }

  // Derived from the page registry — the single source of truth for what a route belongs to.
  const page = pagePathForApi(pathname);
  if (page) {
    const bundle = bundleForRoute(page);
    if (bundle) return { kind: 'bundle', bundle };
    // `bundleForRoute` returning null is a real answer for a KNOWN route (always-available or
    // operator-only). It is not an answer for a path it has never heard of, and the two are
    // indistinguishable from here — which is exactly what `unclassified` exists to catch.
    if (knownToRegistry(page)) {
      return { kind: 'open', reason: 'The page this mirrors is always-available or operator-only.' };
    }

    // Some page trees are registered only at their LEAVES. `/admin/email/new` and `/admin/email/sent`
    // exist; `/admin/email` does not — so `/api/admin/email/log` mirrors a path the registry cannot
    // resolve, despite the feature plainly being registered. Found by the ratchet below, which is
    // what it is for.
    //
    // The workspace is therefore taken from the group's registered descendants. This stays a
    // derivation rather than becoming a list, and it refuses when the descendants DISAGREE — a group
    // spanning two bundles is a real product question (which half did the firm buy?) and guessing it
    // would silently pick one.
    const sibling = bundleFromSiblings(page);
    if (sibling !== undefined) {
      return sibling === null
        ? { kind: 'open', reason: 'Every registered page in this group is always-available.' }
        : { kind: 'bundle', bundle: sibling };
    }
  }

  return { kind: 'unclassified' };
}

/** The bundle every registered page under `/admin/<group>` agrees on.
 *  `undefined` = no registered descendants, or they disagree. */
function bundleFromSiblings(pagePath: string): BundleId | null | undefined {
  const group = '/admin/' + pagePath.slice('/admin/'.length).split('/')[0];
  if (group === '/admin/') return undefined;

  const found = new Set<BundleId | null>();
  for (const r of ADMIN_ROUTES) {
    if (r.href === group || r.href.startsWith(group + '/')) found.add(bundleForRoute(r.href));
  }
  return found.size === 1 ? [...found][0] : undefined;
}

/** Whether the page registry resolves this path to a workspace at all. Kept separate so the "null
 *  means always-available" and "null means never heard of it" cases stay distinguishable. */
function knownToRegistry(pagePath: string): boolean {
  // Prefix-based: returns a workspace for anything under a registered tree.
  return workspaceOf(pagePath) != null;
}

/** Whether a caller holding `bundles` may reach `pathname`. */
export function canAccessApi(pathname: string, bundles: BundleId[]): boolean {
  const decision = apiGateFor(pathname);
  if (decision.kind === 'open') return true;
  if (decision.kind === 'unclassified') return false;
  return hasBundle(bundles, decision.bundle);
}

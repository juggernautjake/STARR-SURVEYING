// lib/research/access.ts — who may READ research data.
//
// C11b-0 of §8 in docs/planning/in-progress/PAGE_CONSOLIDATION_2026-08-24.md.
//
// ── WHY THIS EXISTS ─────────────────────────────────────────────────────────────────────────────
//
// C11b was going to make six research pages into tabs, each tab carrying its registry row's role
// list. Before writing those lists it was worth measuring what they would be worth, because §5.1
// says the tab list is a courtesy and the API is the boundary. Measured against a running server
// with a plain `employee` token — no research role of any kind:
//
//     GET /api/admin/research/coverage   200
//     GET /api/admin/research/library    200
//     GET /api/admin/research/pipeline   200
//     GET /api/admin/research/billing    200
//     GET /api/admin/research/sites      200
//     GET /api/admin/research/self-heal/proposals   403   ← the only one that refused
//
// Five of six answered anybody who was signed in. They check `auth()` and stop there.
//
// The reason is structural rather than careless: `middleware.ts`'s `ROUTE_ROLES` only ever ran on
// PAGE paths. `/api/admin/*` goes through the bundle gate and nothing else, and four of these routes
// are deliberately bundle-exempt (they are operator tools). So the role gate everybody could see on
// `/admin/research` was never in front of the data — only in front of the screen that draws it.
//
// ── WHY THIS IS NOT A PRODUCT DECISION ──────────────────────────────────────────────────────────
//
// C10 met the mirror image of this — a door wider than its boundary — and left the boundary alone,
// because who may see leads is the owner's call. The asymmetry that makes this one different: there,
// the extra roles could reach a page that refused them everything, so narrowing the door removed
// nothing anybody had. Here the boundary is wider than the product's own stated intent, said twice
// and in agreement: `middleware.ts` gates the `/admin/research` PAGES to six roles, and the registry
// rows say the same or narrower. A plain `employee` is in neither list. Refusing them is not a new
// policy, it is the existing policy finally reaching the data.
//
// So this deliberately enforces the WIDEST of the product's own statements — the page gate — rather
// than the narrower per-row lists. Nobody who can open a research page loses anything; the hole this
// closes is people who could never open one.

import { RESEARCH_ROLES } from '@/lib/admin/route-registry';
import type { UserRole } from '@/lib/auth-roles';

/** The roles `middleware.ts` lets through the `/admin/research` PAGE prefix.
 *
 *  Derived from `RESEARCH_ROLES` rather than retyped, so the two cannot drift apart in the half of
 *  the pair that nobody looks at. `__tests__/research/api-access.test.ts` pins it to the literal
 *  middleware entry — that mirror has broken seven times in seven slices of this plan, and the only
 *  version of it that has ever held is one a test compares against the source. */
export const RESEARCH_READ_ROLES: UserRole[] = [
  ...RESEARCH_ROLES,
  'field_crew',
  'tech_support',
];

/** May this set of roles READ research data?
 *
 *  Pure, and takes the roles rather than a session on purpose: the caller does the `auth()` and owns
 *  the 401, this owns the 403, and the decision stays testable without a server. */
export function canReadResearch(roles: UserRole[] | string[] | null | undefined): boolean {
  if (!roles || !Array.isArray(roles)) return false;
  return roles.some((r) => (RESEARCH_READ_ROLES as string[]).includes(r as string));
}

// lib/admin/route-usage.ts
//
// Which admin route is this, for counting purposes?
//
// ── WHY THIS EXISTS ─────────────────────────────────────────────────────────────────────────────
//
// C0 of docs/planning/in-progress/PAGE_CONSOLIDATION_2026-08-24.md. That plan proposes folding 111
// sidebar links into 17 portals, and the first question anyone should ask about a plan like that is
// "which of these does anybody actually open?"
//
// The product could not answer it. `nav_events` held 239 rows spanning three months and recorded
// workspace clicks, command-palette opens and persona switches — not page views. There is no
// `page_views` table and no `route_visits` table. So the honest position was: a page missing from
// the data is UNOBSERVED, not unused, and nothing could be deleted on the strength of it.
//
// ── WHY A SHARED NORMALISER AND NOT A REGEX AT EACH END ─────────────────────────────────────────
//
// A raw pathname is useless for counting: `/admin/jobs/58a62727-…` and `/admin/jobs/8d787d88-…` are
// two visits to ONE page. Something has to fold them together, and the emitter and the report both
// need to agree about how — otherwise the report counts a route the emitter never wrote.
//
// That is exactly the defect the design conformance check shipped with: two signature rules, one at
// each end, disagreeing about the name of the same element, producing a score that was really
// measuring class-attribute order. One rule, exported, used by both ends.

/** Segments that are an identity rather than a place. */
const ID_SEGMENT = [
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, // uuid
  /^[0-9a-f]{16,}$/i,                                                // long hex id
  /^\d+$/,                                                           // numeric id
  /^[^@/]+@[^@/]+\.[^@/]+$/,                                         // an email — /admin/team/[email]
  /^[A-Za-z0-9_-]{21,}$/,                                            // nanoid / cuid-shaped
];

/**
 * Fold a live pathname into the route it belongs to.
 *
 *   /admin/jobs/58a62727-ac8d-46ff-96c9-d6ec71732c6a  →  /admin/jobs/[id]
 *   /admin/team/someone@example.com                   →  /admin/team/[id]
 *   /admin/hours-approval                             →  /admin/hours-approval
 *
 * Every id-shaped segment becomes the same `[id]` regardless of WHICH kind it was. The distinction
 * between a uuid route and an email route matters to the router and not at all to the question this
 * is here to answer, and keeping it would split one page's count across two rows.
 */
export function normaliseRoutePath(pathname: string): string {
  if (!pathname || typeof pathname !== 'string') return '/';
  const [clean] = pathname.split(/[?#]/);
  const parts = clean.split('/').filter(Boolean).map((seg) => {
    const decoded = (() => { try { return decodeURIComponent(seg); } catch { return seg; } })();
    return ID_SEGMENT.some((re) => re.test(decoded)) ? '[id]' : decoded;
  });
  // Trailing slash normalised away so `/admin/jobs` and `/admin/jobs/` are one route, not two.
  return `/${parts.join('/')}`;
}

/** Is this a route worth recording? */
export function isCountableRoute(pathname: string): boolean {
  // Only the admin app. The public site has its own analytics story and is not what the
  // consolidation plan is about.
  if (!pathname.startsWith('/admin')) return false;
  // `/admin/login` is where you are when you are not yet anybody, and it would be the most-visited
  // "page" in the product while telling us nothing about which tools people use.
  if (/^\/admin\/(login|logout|signin|signout)\b/.test(pathname)) return false;
  return true;
}

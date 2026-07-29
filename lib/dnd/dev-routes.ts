// lib/dnd/dev-routes.ts — one rule for "is this a developer-only page, and may it render?" (P1-4, audit D-5).
//
// WHAT THE AUDIT GOT RIGHT AND WRONG. D-5 named four routes as "shipping to production unlisted and
// indexable". Checked against the code, one of those four was a real defect:
//
//   · `/dnd/hextech-demo` — REAL. Its own header says "Auth-gated with the rest of /dnd", and that has been
//     false since the owner made /dnd public-by-direct-link on 2026-07-06. An internal style guide, live to
//     anyone with the URL, describing itself as protected. This is what the slice fixes.
//   · `/dnd/preview/edit-flow` — already gated, and more strictly than the slice proposed: it calls
//     `notFound()` when `NODE_ENV === 'production'`.
//   · `/dnd/login` — not a page. It is a four-line `redirect('/dnd')` kept so old bookmarks resolve.
//   · `/dnd/Lazzuh_Gun` — not a dev route at all. It is the owner's personal sheet, deliberately public and
//     localStorage-backed, and explicitly exempted in `middleware.ts`. Gating it would break it.
//
// And the "indexable" half was wrong for all four: `app/dnd/layout.tsx` sets `robots: { index: false,
// follow: false }` on the whole subtree, and both pages that could matter re-declare it themselves.
//
// The lesson is the one from F-4 earlier in this audit: a planning doc's claim about the state of the code
// is a lead, never a finding. Three of four here dissolved on contact with the source.

/**
 * May a developer-only route render?
 *
 * True outside production, or in production when `NEXT_PUBLIC_E2E_HARNESS=1` — the flag the UX harness
 * already uses, so a deployed preview can still be screenshotted without opening the pages to everyone.
 *
 * Read as a plain env comparison rather than a cached constant: Next inlines `NEXT_PUBLIC_*` at build time,
 * and a module-level constant would additionally freeze `NODE_ENV` at import, which makes this untestable.
 */
export function devRouteVisible(): boolean {
  return process.env.NODE_ENV !== 'production' || process.env.NEXT_PUBLIC_E2E_HARNESS === '1';
}

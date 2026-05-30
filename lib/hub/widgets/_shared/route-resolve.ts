// lib/hub/widgets/_shared/route-resolve.ts
//
// hub-widget-excellence-15 — shared route-resolution used by the
// nav-fed widgets (pinned-pages, recent-activity) to honour the R2
// guardrail "never render a dead link". An href resolves when it
// exactly matches a registered route OR sits in a registered route's
// subtree (a real deep page like /admin/jobs/abc under /admin/jobs);
// anything else is a stale href to a retired route and is dropped.
//
// Pure + dependency-free (callers inject the route table) → unit-tested
// in node.

export interface RouteLike {
  href: string;
  label: string;
  iconName?: string;
}

export interface ResolvedRoute {
  href: string;
  label: string;
  iconName?: string;
}

/**
 * Resolve hrefs against the registered routes, dropping any that don't
 * resolve. Exact matches keep the route's label + icon; deep matches
 * inherit the deepest-prefix route's label + icon (the original deep
 * href is preserved so the link still lands on the exact page).
 */
export function resolveRouteHrefs(
  hrefs: readonly string[],
  routes: readonly RouteLike[],
): ResolvedRoute[] {
  const byHref = new Map(routes.map((r) => [r.href, r]));
  const out: ResolvedRoute[] = [];
  for (const href of hrefs) {
    const exact = byHref.get(href);
    if (exact) {
      out.push({ href, label: exact.label, iconName: exact.iconName });
      continue;
    }
    const parent = deepestPrefix(href, routes);
    if (parent) {
      out.push({ href, label: parent.label, iconName: parent.iconName });
    }
    // else: stale href → dropped (dead link guardrail).
  }
  return out;
}

/** The registered route with the longest `href` that is a strict path
 *  ancestor of `href` (i.e. `href` starts with `route.href + '/'`). */
export function deepestPrefix(
  href: string,
  routes: readonly RouteLike[],
): RouteLike | undefined {
  let best: RouteLike | undefined;
  for (const r of routes) {
    if (href.startsWith(r.href + '/')) {
      if (!best || r.href.length > best.href.length) best = r;
    }
  }
  return best;
}

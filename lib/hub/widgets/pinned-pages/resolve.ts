// lib/hub/widgets/pinned-pages/resolve.ts
//
// hub-widget-excellence-15 — pinned-pages R2: "never render a dead
// link". A pinned href resolves when it exactly matches a registered
// route OR sits in a registered route's subtree (a real deep page like
// /admin/jobs/abc under /admin/jobs). Anything else is a stale pin to a
// retired route → dropped, so the widget never links somewhere 404.
//
// Pure + dependency-free (the widget injects the real route table), so
// it's unit-tested in node.

export interface RouteLike {
  href: string;
  label: string;
  iconName?: string;
}

export interface PinnedItem {
  href: string;
  label: string;
  iconName?: string;
}

/**
 * Resolve pinned hrefs against the registered routes, dropping any that
 * don't resolve (R2). Exact matches keep the route's label + icon; deep
 * matches inherit the deepest-prefix route's label + icon.
 */
export function resolvePinnedRoutes(
  hrefs: readonly string[],
  routes: readonly RouteLike[],
): PinnedItem[] {
  const byHref = new Map(routes.map((r) => [r.href, r]));
  const out: PinnedItem[] = [];
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
    // else: stale pin → dropped (dead link guardrail).
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

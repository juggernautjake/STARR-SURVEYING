// lib/hub/quick-actions-validator.ts
//
// Slice W6 — pure validator. Confirms every `link`-kind entry in
// the quick-actions catalog points at a real admin route from
// `lib/admin/route-registry.ts`. Hrefs may carry a query string
// (e.g. `/admin/me?tab=hours`); the path portion before `?` is
// what we look up.
//
// `findBrokenQuickActionHrefs(catalog, registry)` is the public
// API. The test asserts it returns []; the dev console can call
// it directly for spot-checks.

import type { QuickActionDef } from './quick-actions-catalog';

interface RegistryEntry {
  href: string;
}

/** Strip the query / fragment so we look up the path alone. */
export function hrefPath(href: string): string {
  const q = href.indexOf('?');
  const h = href.indexOf('#');
  const cut = Math.min(
    q >= 0 ? q : href.length,
    h >= 0 ? h : href.length,
  );
  return href.slice(0, cut);
}

export interface BrokenQuickAction {
  id: string;
  href: string;
  reason: 'missing-href' | 'not-in-registry';
}

/** Walk the catalog. For every `link` entry, ensure the href's
 *  path lives in the registry. Returns a list of offending
 *  entries (empty when all are good). */
export function findBrokenQuickActionHrefs(
  catalog: ReadonlyArray<QuickActionDef>,
  registry: ReadonlyArray<RegistryEntry>,
): BrokenQuickAction[] {
  const paths = new Set(registry.map((r) => hrefPath(r.href)));
  const broken: BrokenQuickAction[] = [];
  for (const action of catalog) {
    if (action.kind !== 'link') continue;
    if (!action.href) {
      broken.push({ id: action.id, href: '', reason: 'missing-href' });
      continue;
    }
    const path = hrefPath(action.href);
    if (!paths.has(path)) {
      broken.push({ id: action.id, href: action.href, reason: 'not-in-registry' });
    }
  }
  return broken;
}

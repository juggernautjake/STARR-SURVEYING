// lib/hub/widget-catalog-filter.ts
//
// Pure helpers behind the Add-Widget modal: catalog filtering by
// role + bundle access, search-term scoring, and category grouping
// of the filtered result. Splitting these out of the modal keeps
// vitest coverage cheap (no React, no DOM) and lets future surfaces
// (palette quick-add, settings panel) reuse the same scoring.
//
// Slice 100 of customizable-hub-and-work-mode-2026-05-28.md.

import type { UserRole } from '@/lib/auth';
import type { BundleId } from '@/lib/saas/bundles';
import { expandBundles } from '@/lib/saas/bundles';
import type {
  WidgetCategory,
  WidgetDefinition,
} from '@/lib/hub/widget-registry';

export interface CatalogFilterOptions {
  /** Roles the current user holds. Empty array still allows widgets
   *  whose `allowedRoles` is empty (everyone). */
  roles: UserRole[];
  /** Subscription bundles the user's org has active. `null` skips the
   *  gate (treated as "every bundle available", useful for previews
   *  and for hubs that haven't pivoted to SaaS yet). */
  activeBundles?: BundleId[] | null;
  /** Optional search term. Matched against id, label, description,
   *  and category. */
  search?: string;
  /** Optional category filter — when set, only widgets in this
   *  category appear in the result. */
  category?: WidgetCategory | 'all';
}

/** Returns the subset of `catalog` that the user can add given their
 *  roles + active bundles + the current search & category filter.
 *  Results are sorted by relevance when a search term is provided,
 *  otherwise by their original catalog order. */
export function filterCatalog(
  catalog: WidgetDefinition[],
  options: CatalogFilterOptions,
): WidgetDefinition[] {
  const { roles, activeBundles, search, category } = options;
  const term = search?.trim().toLowerCase() ?? '';
  const grantedBundles = activeBundles
    ? new Set(expandBundles(activeBundles))
    : null;

  const filtered = catalog.filter((w) => {
    if (category && category !== 'all' && w.category !== category) return false;
    if (!isRoleAllowed(w, roles)) return false;
    if (!isBundleAllowed(w, grantedBundles)) return false;
    if (term && scoreEntry(w, term) === 0) return false;
    return true;
  });

  if (term) {
    return filtered
      .map((w) => ({ w, score: scoreEntry(w, term) }))
      .sort((a, b) => b.score - a.score)
      .map((x) => x.w);
  }

  return filtered;
}

/** Group a filtered list by category. The same widget never appears in
 *  more than one group. Returns category → widgets in catalog order
 *  (or score order if the caller already sorted). */
export function groupByCategory(
  widgets: WidgetDefinition[],
): Map<WidgetCategory, WidgetDefinition[]> {
  const out = new Map<WidgetCategory, WidgetDefinition[]>();
  for (const w of widgets) {
    const bucket = out.get(w.category) ?? [];
    bucket.push(w);
    out.set(w.category, bucket);
  }
  return out;
}

/** True when at least one of the user's roles is in `widget.allowedRoles`,
 *  or `widget.allowedRoles` is empty (universal). */
export function isRoleAllowed(widget: WidgetDefinition, roles: UserRole[]): boolean {
  if (widget.allowedRoles.length === 0) return true;
  return widget.allowedRoles.some((r) => roles.includes(r));
}

/** True when the widget either declares no bundle requirement, or the
 *  `granted` set contains its `requiresBundle`. `null` granted means
 *  the bundle gate is skipped entirely (legacy installs). */
export function isBundleAllowed(
  widget: WidgetDefinition,
  granted: Set<BundleId> | null,
): boolean {
  if (!widget.requiresBundle) return true;
  if (granted === null) return true;
  return granted.has(widget.requiresBundle);
}

/** Score how strongly a search term matches a widget. Higher = better.
 *  0 means no match. */
export function scoreEntry(widget: WidgetDefinition, term: string): number {
  if (!term) return 1;
  const id = widget.id.toLowerCase();
  const label = widget.label.toLowerCase();
  const description = widget.description.toLowerCase();
  const category = widget.category.toLowerCase();

  // Exact label match wins.
  if (label === term) return 100;
  if (id === term) return 90;
  // Prefix wins over substring.
  if (label.startsWith(term)) return 80;
  if (id.startsWith(term)) return 70;
  if (label.includes(term)) return 60;
  if (id.includes(term)) return 50;
  if (description.includes(term)) return 30;
  if (category.includes(term)) return 20;
  return 0;
}

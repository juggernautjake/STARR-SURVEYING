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

// ── Category-level search ───────────────────────────────────────────────────────────────────────
//
// H3 of HUB_CUSTOMIZER_2026-08-27.md: *"Searching should not scan every widget across every
// category. Instead, each category carries the tags of its own widgets."*
//
// `filterCatalog` above answers a per-widget question and leaves grouping as a rendering detail.
// That produces a flat list of survivors which the modal then buckets — so a category is only ever
// as present as its widgets, and there is no way to express "this whole box is irrelevant, remove
// it" separately from "these tiles inside it are irrelevant".
//
// The distinction matters because the two hide different amounts of screen. With 11 categories and
// 55 widgets, a search matching three widgets should leave the user looking at ONE box, not eleven
// boxes of which ten are empty.
//
// ── A CATEGORY'S TAGS ARE ITS WIDGETS' TAGS ─────────────────────────────────────────────────────
//
// Deliberately derived rather than declared. A hand-maintained tag list on each category is a second
// source of truth that goes stale the first time somebody adds a widget and forgets it — and the
// failure is silent, because a missing tag looks exactly like a search with no results.

/** Everything searchable about one widget, lower-cased. The category name is included so searching
 *  "cad" finds the CAD widgets even when none of them says "cad" in its own label. */
export function widgetTags(widget: WidgetDefinition): string[] {
  return [widget.id, widget.label, widget.description, widget.category]
    .join(' ')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** The union of every tag carried by the widgets in a category. */
export function categoryTags(widgets: readonly WidgetDefinition[]): Set<string> {
  const out = new Set<string>();
  for (const w of widgets) for (const t of widgetTags(w)) out.add(t);
  return out;
}

/**
 * Does a category carry this term at all?
 *
 * Prefix rather than exact match, because the user is typing and "equip" must find Equipment before
 * they finish the word — the whole feature updates per keystroke.
 */
export function categoryMatches(tags: ReadonlySet<string>, term: string): boolean {
  // THE QUERY IS SPLIT THE SAME WAY THE TAGS WERE.
  //
  // `widgetTags` breaks on every non-alphanumeric character, so "Today's Schedule" is stored as
  // `today`, `s`, `schedule`. Splitting the query on whitespace alone left the apostrophe attached,
  // and typing a widget's own label back into the search box returned nothing — two normalisations
  // that have to agree, and did not. Punctuation in a query is now dropped, not searched for.
  const words = term.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  if (!words.length) return true;
  // Multi-word queries: every word must appear somewhere in the category, in any order.
  return words.every((word) => {
    for (const tag of tags) if (tag.startsWith(word) || tag.includes(word)) return true;
    return false;
  });
}

export interface CategorySection {
  category: WidgetCategory;
  /** The widgets to render inside this box — already narrowed by the search. */
  widgets: WidgetDefinition[];
  /** True when the search surfaced this category. Drives H4's auto-open. */
  matched: boolean;
  /** How many widgets this category holds with no search applied. Shown on the closed box so a
   *  collapsed category still says how much is inside it. */
  total: number;
}

/** Render order. Fixed rather than alphabetical so the catalog does not reshuffle between visits. */
export const CATEGORY_ORDER: WidgetCategory[] = [
  'personal', 'work', 'time-pay', 'equipment',
  'cad', 'research', 'learning', 'communication',
  'office', 'financial', 'operational',
];

/**
 * Build the category boxes for the catalog.
 *
 * Returns ONLY the categories that survive the search — H3's *"categories with no matching keyword
 * or phrase are hidden entirely"*. Within a surviving category, widgets that do not match are
 * dropped too, so a box opened by a search shows the reason it opened rather than everything it owns.
 *
 * A category matching on its own NAME keeps all of its widgets: searching "cad" means "show me the
 * CAD things", not "show me CAD things whose description also says cad".
 */
export function buildCategorySections(
  catalog: WidgetDefinition[],
  options: Omit<CatalogFilterOptions, 'category' | 'search'> & { search?: string },
): CategorySection[] {
  const term = options.search?.trim().toLowerCase() ?? '';

  // Role and bundle gating first, and independently of the search: a widget the user may not add
  // must not be counted in a category's total, or a box advertises tiles that will never appear.
  const permitted = filterCatalog(catalog, { ...options, search: '', category: 'all' });
  const byCategory = groupByCategory(permitted);

  const sections: CategorySection[] = [];

  for (const category of CATEGORY_ORDER) {
    const all = byCategory.get(category) ?? [];
    if (all.length === 0) continue;

    if (!term) {
      sections.push({ category, widgets: all, matched: false, total: all.length });
      continue;
    }

    const tags = categoryTags(all);
    if (!categoryMatches(tags, term)) continue;

    // The category name itself matching is a request for the whole box.
    const nameHit = category.toLowerCase().includes(term);
    const widgets = nameHit ? all : all.filter((w) => scoreEntry(w, term) > 0);

    // The category matched on a tag that no individual widget scores on — a description word split
    // across fields, say. Showing an empty box would be worse than showing the box's contents.
    sections.push({ category, widgets: widgets.length > 0 ? widgets : all, matched: true, total: all.length });
  }

  return sections;
}

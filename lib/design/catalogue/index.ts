// lib/design/catalogue/index.ts — the palette, assembled.
//
// One place that knows every entry, so the palette, the search index, the canvas renderer and the
// export cannot disagree about what exists. Adding a category means importing its file here and
// nothing else.

import { BUTTON_ENTRIES, BUTTON_EXCLUSIONS } from './curated/buttons';
import { CORE_ENTRIES, ANNOTATION_ENTRY_IDS } from './curated/core';
import { STATUS_ENTRIES } from './curated/status';
import { STRUCTURE_ENTRIES } from './curated/structure';
import { CATEGORY_ORDER } from './categories';
import type { AreaId, CatalogueEntry, CategoryId, CurationExclusion } from './types';

export const ENTRIES: CatalogueEntry[] = [
  ...BUTTON_ENTRIES,
  ...CORE_ENTRIES,
  ...STATUS_ENTRIES,
  ...STRUCTURE_ENTRIES,
];

export const EXCLUSIONS: CurationExclusion[] = [...BUTTON_EXCLUSIONS];

export const ENTRY_BY_ID: Map<string, CatalogueEntry> = new Map(ENTRIES.map((e) => [e.id, e]));

export function getEntry(id: string): CatalogueEntry | undefined {
  return ENTRY_BY_ID.get(id);
}

/** Is this entry a note ABOUT the design rather than part of it? Drives the annotation layer and
 *  the export's two arrays. */
export function isAnnotationEntry(id: string): boolean {
  return ANNOTATION_ENTRY_IDS.has(id);
}

/**
 * Entries for a category, ranked the way the palette shows them: by how much the real app uses
 * them. The button used 274 times should be the first button you see — a palette sorted
 * alphabetically makes you hunt for the common case.
 */
export function entriesInCategory(category: CategoryId, areas?: AreaId[]): CatalogueEntry[] {
  return ENTRIES
    .filter((e) => e.category === category)
    .filter((e) => !areas || e.areas.some((a) => areas.includes(a)))
    .sort((a, b) => b.usageCount - a.usageCount || a.label.localeCompare(b.label));
}

/** Categories that actually have something in them, in tab order. An empty tab is a promise the
 *  palette cannot keep. */
export function populatedCategories(areas?: AreaId[]): CategoryId[] {
  return CATEGORY_ORDER.filter((id) => entriesInCategory(id, areas).length > 0);
}

export { CATEGORIES, CATEGORY_BY_ID, CATEGORY_ORDER } from './categories';
export type { CatalogueEntry, CategoryId, AreaId } from './types';

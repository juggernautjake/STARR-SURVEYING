// lib/dnd/systems/intuitive-games/taxonomy.ts — the canonical Intuitive Games class taxonomy (Area T1).
//
// Brendan's site organises IG classes as FOUR parent classes, each with named subclasses — not the flat
// 13-class list our earlier data implied. This module is the single source of that structure, taken VERBATIM
// from the site (Ground Rule 2: IG content only from Brendan's site, never invented). The per-class mechanical
// detail lives in `IG_CLASS_DETAILS` (content.ts); this owns the parent→subclass shape that the builder,
// grounding, provenance and library all read, so a subclass is always offered under its real parent and never
// leaks across families.
//
// Note: `Champion` (Fighter), `Magician` and `Shaman` (Wizard) are site-recognised subclass NAMES whose full
// mechanical detail is still pending on Brendan's site — they belong in the taxonomy (the site lists them) even
// though their `IG_CLASS_DETAILS` entries are thin/absent. That is a content gap, not a taxonomy gap.

export interface IGClassTaxon {
  /** The parent class. */
  parent: string;
  /** Its subclasses, in the site's order. */
  subclasses: string[];
}

/** The site's real taxonomy: 4 parents × their subclasses. Verbatim from Brendan's IG class pages. */
export const IG_CLASS_TAXONOMY: IGClassTaxon[] = [
  { parent: 'Archon', subclasses: ['Beastmaster', 'Eldritch Binder', 'Packmaster', 'Summoner'] },
  { parent: 'Conduit', subclasses: ['Druid', 'Shifter', 'Witch'] },
  { parent: 'Fighter', subclasses: ['Champion', 'Freebooter', 'Marksman', 'Sohei'] },
  { parent: 'Wizard', subclasses: ['Arcanist', 'Magician', 'Shaman'] },
];

/** The four parent class names, in taxonomy order. */
export function igParentClasses(): string[] {
  return IG_CLASS_TAXONOMY.map((t) => t.parent);
}

/** The subclasses of a parent (empty if the name isn't a parent). Case-insensitive on the parent. */
export function igSubclassesOf(parent: string): string[] {
  const t = IG_CLASS_TAXONOMY.find((x) => x.parent.toLowerCase() === parent.trim().toLowerCase());
  return t ? [...t.subclasses] : [];
}

/** The parent class of a subclass, or null when the name is a parent itself / unknown. Case-insensitive. */
export function igParentOf(name: string): string | null {
  const n = name.trim().toLowerCase();
  const t = IG_CLASS_TAXONOMY.find((x) => x.subclasses.some((s) => s.toLowerCase() === n));
  return t ? t.parent : null;
}

export function igIsParentClass(name: string): boolean {
  const n = name.trim().toLowerCase();
  return IG_CLASS_TAXONOMY.some((t) => t.parent.toLowerCase() === n);
}

export function igIsSubclass(name: string): boolean {
  return igParentOf(name) !== null;
}

/** Every class name in the taxonomy — the 4 parents plus every subclass (parents first). */
export function igAllTaxonomyClasses(): string[] {
  return IG_CLASS_TAXONOMY.flatMap((t) => [t.parent, ...t.subclasses]);
}

/** A "Parent · Subclass" label for a subclass (or just the name for a parent/unknown) — used by the builder,
 *  provenance and library so a class is always shown in its family context. */
export function igClassLabel(name: string): string {
  const parent = igParentOf(name);
  return parent ? `${parent} · ${name}` : name;
}

// lib/dnd/library-anchors.ts — the shared address book for library deep links.
//
// A search hit and the library page have to agree on two things or a "click a result to read it"
// link silently lands nowhere: WHICH SECTION a kind lives in, and WHAT ID an entry carries. Those
// two facts were previously implicit — the page generated ids nowhere at all, and `term-index.ts`
// hard-coded section hrefs at each call site.
//
// Both now come from here. If the search box and the page ever disagree about where a Condition
// lives, it is one bug in one file rather than two files that drifted.
//
// WHY THE SECTION MATTERS AND NOT JUST THE ENTRY. The library renders every section AND every entry
// as a native `<details>`, default-closed (a deliberate choice — the page opens as a scannable list
// of headers). A bare `#id` link to a closed `<details>` scrolls to a collapsed strip showing
// nothing, which reads exactly like a broken link. So a deep link has to name the entry, and the
// opener has to walk UP and open every ancestor. `sectionForKind` is what makes that walk possible
// from a search result that only knows a kind.

/** Search-hit kinds, as emitted by `librarySearch` in ./library.ts. */
export type LibraryKind =
  | 'armor' | 'background' | 'class' | 'combat-skill' | 'companion' | 'companion-aspect'
  | 'companion-feature' | 'condition' | 'cover' | 'damage-type' | 'defensive-power' | 'equipment'
  | 'feat' | 'feature' | 'magic-item' | 'power' | 'rule' | 'shield' | 'skill' | 'species'
  | 'spell' | 'stance' | 'subclass' | 'trait' | 'weapon' | 'weapon-property';

/**
 * Which page section a search hit of this kind lives in.
 *
 * `null` means "this kind has no section of its own" — it is NOT an error and must not be treated
 * as one. Spells are the clearest case: they deliberately have no section because `SpellBrowser`
 * renders the whole catalog with facets, which a static section could not do. A `null` here means
 * the link should go to the system page rather than to a section that does not exist.
 */
const SECTION_BY_KIND: Record<LibraryKind, string | null> = {
  armor: 'armor',
  background: 'backgrounds',
  class: 'classes',
  'combat-skill': 'combat-skills',
  companion: 'companions',
  'companion-aspect': 'companions',
  'companion-feature': 'companion-powers',
  condition: 'conditions',
  cover: 'core',
  'damage-type': 'damage',
  'defensive-power': 'defensive-powers',
  equipment: 'equipment',
  feat: 'feats',
  feature: 'classes',
  'magic-item': 'magical-items',
  power: 'powers',
  rule: 'core',
  shield: 'shields',
  skill: 'skills',
  species: 'species',
  // Spells have no section by design — SpellBrowser owns them. See the doc comment above.
  spell: null,
  stance: 'stances',
  subclass: 'classes',
  trait: 'species',
  weapon: 'weapons',
  'weapon-property': 'weapon-properties',
};

/** The section id a kind belongs to, or null when the kind has no section (see SECTION_BY_KIND). */
export function sectionForKind(kind: string): string | null {
  return SECTION_BY_KIND[kind as LibraryKind] ?? null;
}

/**
 * A stable DOM id for one library entry.
 *
 * Derived from the NAME rather than from an index, because an index shifts the moment a catalog
 * gains an entry — which would silently repoint every bookmarked link. Names are what the search
 * box matches on and what a reader sees, so a name-derived id also stays legible in the URL bar.
 *
 * Prefixed with `entry-` so it can never collide with a section id: a `weapons` section and a
 * hypothetical entry named "Weapons" would otherwise produce the same id, and the opener would
 * scroll to whichever the browser found first.
 */
export function entryAnchorId(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize('NFKD')
    // Strip combining marks so "Cloak of Elvenkind" and an accented variant agree.
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  // A name of only punctuation would slug to '' and produce the bare id `entry-`, which several
  // entries could share. Falling back keeps ids unique-ish and, more importantly, non-empty.
  return `entry-${slug || 'unnamed'}`;
}

/**
 * The href that takes a reader from a search hit to the thing itself.
 *
 * Entry anchor when we can name one, section anchor when we cannot, and the bare system page when
 * the kind has no section at all. Always returns SOMETHING navigable — a search result that is not
 * clickable is the bug this module exists to fix, so degrading to the system page beats rendering
 * plain text.
 */
export function libraryHref(system: string, kind: string, name?: string): string {
  const base = `/dnd/library/${encodeURIComponent(system)}`;
  const section = sectionForKind(kind);
  if (!section) return base;
  if (!name) return `${base}#${section}`;
  return `${base}#${entryAnchorId(name)}`;
}

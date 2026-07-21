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
  | 'feat' | 'feature' | 'key-fact' | 'language' | 'magic-item' | 'power' | 'rule' | 'shield'
  | 'skill' | 'species' | 'spell' | 'stance' | 'subclass' | 'tool' | 'trait' | 'weapon'
  | 'weapon-property';

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
  // The "Must-know facts" section — NOT `core`. Key facts are prose bullets with no name of their
  // own ("Key fact 3"), so there is no per-entry anchor to stamp and the section is the destination.
  'key-fact': 'gotchas',
  language: 'languages',
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
  // The Tools table is grouped by FAMILY, so an individual tool has no row of its own to anchor —
  // the section is the destination, and `resolveLibraryHref` reaches it without a per-tool id.
  tool: 'tools',
  trait: 'species',
  weapon: 'weapons',
  'weapon-property': 'weapon-properties',
};

/** The section id a kind belongs to, or null when the kind has no section (see SECTION_BY_KIND). */
export function sectionForKind(kind: string): string | null {
  return SECTION_BY_KIND[kind as LibraryKind] ?? null;
}

/**
 * The slug half of every anchor id on the library page — shared so the two prefixes below can only
 * ever differ by their prefix. That exactness is load-bearing: `anchorAliases` swaps one prefix for
 * the other to find an entry's text wherever it actually lives, and a slug that differed by so much
 * as an apostrophe would break the swap for exactly the entries with punctuation in their names.
 */
function anchorSlug(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize('NFKD')
    // Strip combining marks so "Cloak of Elvenkind" and an accented variant agree.
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  // A name of only punctuation would slug to '' and produce the bare id `entry-`, which several
  // entries could share. Falling back keeps ids unique-ish and, more importantly, non-empty.
  return slug || 'unnamed';
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
  return `entry-${anchorSlug(name)}`;
}

/**
 * The DOM id of a GLOSSARY term's row — a different prefix on purpose.
 *
 * The same word is very often BOTH a catalog entry and a glossary article (a 5e "Grappled" is a
 * condition in the conditions section AND a written article in the glossary). Two elements cannot
 * share an id, so the two renderers get one prefix each and `anchorAliases` bridges them.
 *
 * This is the id `term-index.ts` has always linked to; it lives here now so it is generated by the
 * same slug as everything else rather than by a hand-rolled `replace(/\s+/g,'-')` at each call site,
 * which disagreed with `entryAnchorId` for any term containing punctuation.
 */
export function glossaryAnchorId(term: string): string {
  return `term-${anchorSlug(term)}`;
}

/**
 * Every id that could plausibly hold this anchor's content, best first.
 *
 * WHY THIS EXISTS. A link is written before anyone knows which renderer will end up owning the
 * entry: a condition may be a full section entry today and only a glossary article tomorrow (or the
 * reverse). Rather than let that choice break old links, the opener tries the id it was given and
 * then the SAME SLUG under the other prefix. Cheap, and it turns a whole class of "the text is right
 * there on the page under a different id" dead links into working ones.
 */
export function anchorAliases(id: string): string[] {
  if (id.startsWith('entry-')) return [id, `term-${id.slice('entry-'.length)}`];
  if (id.startsWith('term-')) return [id, `entry-${id.slice('term-'.length)}`];
  return [id];
}

/**
 * The href that takes a reader from a search hit to the thing itself.
 *
 * Entry anchor when we can name one, section anchor when we cannot, and the bare system page when
 * the kind has no section at all. Always returns SOMETHING navigable — a search result that is not
 * clickable is the bug this module exists to fix, so degrading to the system page beats rendering
 * plain text.
 *
 * OPTIMISTIC BY DESIGN, AND NOT THE LAST WORD. This function assumes the page stamps
 * `entryAnchorId(name)` for the name it is handed; it cannot check, because checking means loading
 * every catalog and this module is imported by a CLIENT component. That assumption was wrong for
 * years for conditions/skills/feats, and the link failed silently. `resolveLibraryHref` in
 * ./library-anchor-map.ts is the server-side version that VERIFIES the id against the page's real
 * content and degrades to the section when it is absent; the search API attaches its answer to each
 * hit, and this remains the client-side fallback for a hit that arrives without one.
 */
export function libraryHref(system: string, kind: string, name?: string): string {
  const base = `/dnd/library/${encodeURIComponent(system)}`;
  const section = sectionForKind(kind);
  if (!section) return base;
  if (!name) return `${base}#${section}`;
  return `${base}#${entryAnchorId(name)}`;
}

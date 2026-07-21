// lib/dnd/library-anchor-map.ts — which anchors the library page ACTUALLY stamps, and the link that
// therefore lands somewhere.
//
// THE BUG THIS EXISTS TO PREVENT. `libraryHref` used to emit `#entry-<slug>` for every kind that had
// a section, on the assumption that the page stamped that id. The page only stamped ids on ONE of
// its five renderers (`s.entries`). So a weapon deep-linked perfectly and a condition, a skill or a
// feat — rendered as chips or as table rows — navigated to an id nothing on the page carried. The
// reader clicked a search result and the page just sat there. Nothing threw, nothing logged, and the
// reachability test passed, because it checked that the SECTION existed and never that the ENTRY id
// was stamped.
//
// So the honest question — "does the page carry this id?" — is answered here, from the same page
// data the renderer walks, instead of assumed. A name we cannot place degrades to its section, which
// is a worse landing but never a dead one.
//
// WHY IT IS A SEPARATE MODULE FROM library-anchors.ts. This one imports the whole catalog and every
// glossary; that one is imported by `LibrarySearch`, a client component. Keeping them apart keeps
// several hundred kilobytes of rules data out of the browser bundle.
import { libraryPageFor, type LibrarySystemPage } from './library';
import { glossaryFor } from './glossary';
import { classesForSystem } from './classes/registry';
import { entryAnchorId, glossaryAnchorId, sectionForKind } from './library-anchors';
import type { CharacterSystem } from './systems';

/**
 * The anchors one system's library page stamps, split by how much the reader SEES on arrival.
 *
 * The split exists because "it has an id" is not the same as "it answers the question", and once
 * several renderers stamp ids the same name is often addressable in more than one place. Ranking
 * them lets the link pick the best one instead of the first one.
 *
 * `entry` — expands to its full text: a `<details>` entry, a fact row, a class-table feature.
 * `glossary` — the fully-written article, under the `term-` prefix.
 * `row` — a table row. Real content, but a Skill row is "Athletics · STR" where the article is three
 *   paragraphs, so it loses to the glossary.
 * `chip` — the name and nothing else. Last, and still infinitely better than a dead link.
 */
export interface SystemAnchors {
  entry: Set<string>;
  row: Set<string>;
  chip: Set<string>;
  glossary: Set<string>;
}

/**
 * Derive the anchor sets from the page data.
 *
 * MUST STAY IN STEP WITH app/dnd/library/[key]/page.tsx — every branch below mirrors one renderer
 * there. That duplication is deliberate rather than nice: the alternative is the page importing this
 * module and stamping from it, which would make the two agree by construction but would also make
 * "the page stamps what this file says" unfalsifiable. Keeping them independent lets the deep-link
 * test render the real page and compare, which is what actually catches drift.
 */
function anchorsFor(page: LibrarySystemPage, glossaryTerms: string[], featureNames: string[]): SystemAnchors {
  const entry = new Set<string>();
  const row = new Set<string>();
  const chip = new Set<string>();

  for (const s of page.sections) {
    // Facts: label + value are both on screen, so the label anchors real text.
    for (const f of s.facts ?? []) entry.add(entryAnchorId(f.label));
    // Entries: the per-entry <details>, which DeepLinkOpener expands on arrival.
    for (const e of s.entries ?? []) entry.add(entryAnchorId(e.name));
    // Table rows are keyed on the FIRST cell — the name column, by convention across every table
    // the library builds.
    for (const r of s.table?.rows ?? []) if (r[0]) row.add(entryAnchorId(r[0]));
    for (const c of s.chips ?? []) chip.add(entryAnchorId(c));
  }
  // Class-table feature rows (the `progression` section), which is where a `feature` hit's text
  // lives — the `classes` section only lists the classes themselves.
  for (const n of featureNames) entry.add(entryAnchorId(n));

  // A name rendered more than one way keeps only its best class. Membership is deliberately
  // order-independent, so it cannot depend on section order the way the page's first-wins
  // de-duplication does — the page decides which ELEMENT carries the id, this decides how good a
  // landing that id is, and the two must not be able to disagree about the second thing.
  for (const id of entry) { row.delete(id); chip.delete(id); }
  for (const id of row) chip.delete(id);

  return { entry, row, chip, glossary: new Set(glossaryTerms.map(glossaryAnchorId)) };
}

/** Built once per system — the catalogs are static, so recomputing per search hit is pure waste. */
const CACHE = new Map<string, SystemAnchors>();

export function anchorsForSystem(system: string): SystemAnchors {
  const hit = CACHE.get(system);
  if (hit) return hit;
  const page = libraryPageFor(system as CharacterSystem);
  const anchors = page
    ? anchorsFor(
        page,
        glossaryFor(system).map((e) => e.term),
        classesForSystem(system).flatMap((c) => c.features.map((f) => f.name)),
      )
    : { entry: new Set<string>(), row: new Set<string>(), chip: new Set<string>(), glossary: new Set<string>() };
  CACHE.set(system, anchors);
  return anchors;
}

/**
 * The href for a search hit, resolved against what the page really renders.
 *
 * Order is "where will the reader learn the most", not "which id did we think of first":
 *   1. a full entry / fact / class feature — the thing itself, expanded;
 *   2. the glossary article — full prose, and the best landing for a skill or a rule, whose catalog
 *      row is two columns while the article is three paragraphs;
 *   3. a table row;
 *   4. a bare chip — the name, highlighted, in its section;
 *   5. the section — nothing names this entry, so show the reader the shelf it would be on;
 *   6. the system page — the kind has no section at all (spells: SpellBrowser owns them).
 *
 * Step 5 is the safety net. Any future content that search can emit but the page has not learned to
 * render still lands the reader in the right neighbourhood instead of nowhere.
 */
export function resolveLibraryHref(system: string, kind: string, name?: string): string {
  const base = `/dnd/library/${encodeURIComponent(system)}`;
  const section = sectionForKind(kind);
  if (!name) return section ? `${base}#${section}` : base;

  const a = anchorsForSystem(system);
  const entry = entryAnchorId(name);
  const term = glossaryAnchorId(name);
  if (a.entry.has(entry)) return `${base}#${entry}`;
  if (a.glossary.has(term)) return `${base}#${term}`;
  if (a.row.has(entry) || a.chip.has(entry)) return `${base}#${entry}`;
  return section ? `${base}#${section}` : base;
}

// __tests__/dnd/library-deep-links.test.tsx — a search result must land on the thing it names.
//
// THE BUG THIS EXISTS BECAUSE OF (2026-07-21, found by driving the app in a browser). Typing
// "grappl" into the 5e 2014 library returned five correct results as real links. Clicking
// "Grappled" navigated to `#entry-grappled` — and nothing on the page carried that id.
// `document.getElementById('entry-grappled')` was null. Same for the Athletics skill and the
// Grappler feat. The reader clicked a result and the page did not move.
//
// WHY THE EXISTING TEST DID NOT CATCH IT. `library-anchors.test.ts` asserted that every kind
// `librarySearch` can emit maps to a SECTION some page renders. Conditions map to `conditions`, and
// a `conditions` section exists, so it passed — while the section rendered its contents as chips
// that carried no per-entry id at all. Checking the shelf exists is not checking the book is on it.
//
// WHAT THIS ONE DOES INSTEAD. It renders the REAL page component for each system, scrapes the ids
// out of the resulting HTML, and walks the REAL catalog — every kind, every name search can return —
// asserting the href each one resolves to points at an id that HTML actually contains. Nothing is
// sampled and nothing is hand-listed: a new kind, a new catalog, or a section re-rendered in a shape
// that drops its ids all fail here automatically.
//
// Deliberately NOT a `toContain` over the page source. The original bug survived exactly that class
// of test: the source plainly contained `id={entryAnchorId(e.name)}`, and it was on the one renderer
// out of five that conditions did not use.
import { describe, it, expect } from 'vitest';
// Explicit, because vitest transforms this file with the CLASSIC JSX runtime (the project's
// tsconfig leaves `jsx: preserve` for Next to handle) — without it `<LibrarySystemPage/>` compiles
// to a `React.createElement` call against an undefined `React`.
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import LibrarySystemPage from '@/app/dnd/library/[key]/page';
import { libraryCatalogFor, libraryPageFor } from '@/lib/dnd/library';
import { glossaryFor } from '@/lib/dnd/glossary';
import { resolveLibraryHref, anchorsForSystem } from '@/lib/dnd/library-anchor-map';
import { entryAnchorId, glossaryAnchorId, libraryHref, sectionForKind } from '@/lib/dnd/library-anchors';
import { GAME_SYSTEMS, isSystemAvailable, type CharacterSystem } from '@/lib/dnd/systems';

const SYSTEMS = GAME_SYSTEMS.filter((s) => isSystemAvailable(s.key)).map((s) => s.key);

/** Every `id="…"` the server actually emits for one system's library page. */
function renderedIds(system: string): Set<string> {
  const html = renderToStaticMarkup(<LibrarySystemPage params={{ key: system }} />);
  return new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
}

/** The fragment of an href, or null for a link to the bare system page. */
function fragmentOf(href: string): string | null {
  const i = href.indexOf('#');
  return i < 0 ? null : href.slice(i + 1);
}

const IDS = new Map<string, Set<string>>(SYSTEMS.map((s) => [s, renderedIds(s)]));

describe('the library page stamps an id for everything search can name', () => {
  it('renders enough of a page to be worth asserting against', () => {
    // Guards the guard. If the render silently produced nothing (a broken import, a changed page
    // signature), every assertion below would pass vacuously — which is precisely the failure mode
    // that let the original bug ship.
    for (const s of SYSTEMS) {
      expect(IDS.get(s)!.size, `${s} rendered almost no ids — the page render is broken, not clean`).toBeGreaterThan(50);
      expect(IDS.get(s)!.has('glossary'), `${s} did not render its glossary`).toBe(true);
    }
    expect(SYSTEMS.length).toBeGreaterThanOrEqual(4);
  });

  for (const system of SYSTEMS) {
    describe(system, () => {
      it('lands EVERY catalog entry on an id the page really carries', () => {
        const ids = IDS.get(system)!;
        const catalog = libraryCatalogFor(system as CharacterSystem);
        expect(catalog.length, 'no catalog to check — the enumeration is broken').toBeGreaterThan(50);

        const dead: string[] = [];
        for (const c of catalog) {
          const frag = fragmentOf(resolveLibraryHref(system, c.kind, c.name));
          // No fragment is legitimate for a kind with no section of its own (spells — SpellBrowser
          // owns them), and that link goes to the system page, which certainly exists.
          if (frag === null) {
            expect(sectionForKind(c.kind), `${c.kind} dropped its fragment but HAS a section`).toBeNull();
            continue;
          }
          if (!ids.has(frag)) dead.push(`${c.kind} "${c.name}" → #${frag}`);
        }
        expect(
          dead.slice(0, 25),
          `${dead.length} search result(s) link to an id this page does not stamp. A reader clicking ` +
          'one of these sees nothing happen. Either render the entry (page.tsx) or teach ' +
          'library-anchor-map.ts that it is not rendered, so the link degrades to its section.',
        ).toEqual([]);
      });

      it('lands every glossary article too', () => {
        // The glossary opens by React state, not by a <details>, so it is a separate renderer with a
        // separate prefix — and search returns glossary terms directly (with the catalog's kind
        // grafted on). Its rows have to be addressable for the same reason.
        const ids = IDS.get(system)!;
        const missing = glossaryFor(system).map((e) => e.term).filter((t) => !ids.has(glossaryAnchorId(t)));
        expect(missing.slice(0, 10), 'glossary terms whose article carries no id').toEqual([]);
      });

      it('claims only anchors it can back up', () => {
        // The other direction: library-anchor-map.ts tells the search API which ids exist, and if it
        // over-claims, the API hands out hrefs that go nowhere while every "does the page render
        // this?" check still passes. The map must be a SUBSET of what the page emits.
        const ids = IDS.get(system)!;
        const a = anchorsForSystem(system);
        // First-name-wins de-duplication on the page means a name claimed by an earlier section is
        // not re-stamped later, so the RANK the map assigns an id can differ from the element that
        // ended up carrying it. What must never happen is an id in none of the sets being on the page.
        const overclaimed = [...a.entry, ...a.row, ...a.chip, ...a.glossary].filter((id) => !ids.has(id));
        expect(overclaimed.slice(0, 10), 'anchors the map advertises but the page never stamps').toEqual([]);
      });
    });
  }
});

describe('the specific results that were dead in the browser', () => {
  // Regression pins, named exactly as reported: 2014 "grappl" returned these and all of them
  // navigated to nothing. Spelled out so a future refactor that re-breaks one says WHICH.
  const cases: { system: string; kind: string; name: string }[] = [
    { system: 'dnd5e-2014', kind: 'condition', name: 'Grappled' },
    { system: 'dnd5e-2014', kind: 'skill', name: 'Athletics' },
    { system: 'dnd5e-2014', kind: 'feat', name: 'Grappler' },
    { system: 'dnd5e-2014', kind: 'weapon', name: 'Longsword' },
    { system: 'pathfinder2e', kind: 'condition', name: 'Frightened' },
    { system: 'pathfinder2e', kind: 'skill', name: 'Athletics' },
  ];

  for (const c of cases) {
    it(`${c.system} · ${c.kind} "${c.name}" opens something`, () => {
      const frag = fragmentOf(resolveLibraryHref(c.system, c.kind, c.name));
      expect(frag, 'resolved to the bare system page').not.toBeNull();
      expect(IDS.get(c.system)!.has(frag!), `#${frag} is not on the page`).toBe(true);
    });
  }

  it('renders the 2014 Grappled condition with its RULES, not just its name', () => {
    // Landing on a chip that says "Grappled" is not a dead link, but it is not an answer either.
    // The conditions section reads the written article in, so the accordion opens onto the rules.
    const conditions = libraryPageFor('dnd5e-2014')!.sections.find((s) => s.id === 'conditions')!;
    const grappled = conditions.entries?.find((e) => e.name === 'Grappled');
    expect(grappled, 'Grappled is not an expandable entry').toBeTruthy();
    expect(grappled!.detail.length).toBeGreaterThan(80);
    expect(grappled!.detail).toMatch(/speed/i);
  });

  it('renders the full 2014 feat catalog, not a ten-name sample', () => {
    // Grappler was searchable and simply absent from the page — the feats section rendered only
    // `sampleFeats`. A link cannot be fixed to point at something that is not there.
    const feats = libraryPageFor('dnd5e-2014')!.sections.find((s) => s.id === 'feats')!;
    expect(feats.entries?.some((e) => e.name === 'Grappler')).toBe(true);
  });
});

describe('the client-side approximation degrades, it does not lie', () => {
  it('agrees with the server resolver wherever the page really stamps the entry', () => {
    // `libraryHref` runs in the browser and cannot load the catalogs, so it assumes `entry-<name>`.
    // For everything the page stamps strongly that assumption is right, and the two must agree —
    // otherwise a hit rendered before the API's href arrives would flicker to a different target.
    const a = anchorsForSystem('dnd5e-2014');
    for (const name of ['Grappled', 'Longsword', 'Grappler']) {
      if (!a.entry.has(entryAnchorId(name))) continue;
      expect(libraryHref('dnd5e-2014', 'condition', name)).toBe(resolveLibraryHref('dnd5e-2014', 'condition', name));
    }
  });

  it('sends an unrenderable name to its section rather than to a dead id', () => {
    // The safety net. Nothing renders a condition called this, so the link must not pretend.
    const href = resolveLibraryHref('dnd5e-2014', 'condition', 'Definitely Not A Condition');
    expect(href).toBe('/dnd/library/dnd5e-2014#conditions');
    expect(IDS.get('dnd5e-2014')!.has('conditions')).toBe(true);
  });
});

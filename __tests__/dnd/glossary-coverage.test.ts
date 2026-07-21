// __tests__/dnd/glossary-coverage.test.ts — every term a tooltip can ask for has something to show.
//
// CX-12. The owner's report that started this: markers and tips that "don't tell me anything" on
// hover. Two separate causes were found — the marker never opening (CX-10/CX-11) and the marker
// opening onto NOTHING because the term had no article. This file guards the second one.
//
// THE FAILING CASE IS THE POINT. `every demanded term resolves to an article` fails, by name, on any
// condition / skill / damage type / stance that has no glossary entry in ITS OWN system. Adding a
// condition to a system's content list without an article breaks this test in the same commit, which
// is the only way "full coverage" stays true after the session that claimed it.
//
// Honest-coverage pattern, mirroring __tests__/dnd/pf2-catalog-status.test.ts: counts are asserted as
// lower bounds so authoring more never breaks the suite, `complete` is never allowed to overstate,
// and the recorded gaps must exist in the repo rather than only in a chat log.
import { describe, it, expect } from 'vitest';
import {
  GLOSSARY_COVERAGE_SYSTEMS, GLOSSARY_COVERAGE_STATUS, GLOSSARY_KNOWN_GAPS,
  glossaryCoverageFor, glossaryDemandFor, glossaryHasArticle, glossaryCoverageIsComplete,
} from '@/lib/dnd/glossary/coverage';
import { findTerm, glossaryFor } from '@/lib/dnd/glossary';

describe.each(GLOSSARY_COVERAGE_SYSTEMS)('%s — tooltip coverage', (system) => {
  const coverage = glossaryCoverageFor(system);

  it('every demanded term resolves to an article', () => {
    // The whole slice in one assertion. The message names the misses so a failure is actionable
    // without re-deriving the demand surface by hand.
    const names = coverage.missing.map((m) => `${m.kind}: ${m.term}`);
    expect(names, `${system} terms with no glossary article`).toEqual([]);
  });

  it('demands a non-trivial number of terms, so an empty demand cannot fake a pass', () => {
    // A bug that made `glossaryDemandFor` return [] would otherwise turn this whole file green.
    expect(coverage.demanded).toBeGreaterThan(40);
  });

  it('every article a demanded term resolves to is substantive, not a stub', () => {
    // Coverage is worthless if the article it finds says nothing. glossary.test.ts already holds every
    // ENTRY to this bar; this holds the entries the DEMAND actually reaches, which is the set a player
    // sees. A term whose only article were a one-liner would pass the test above and still read as an
    // empty tooltip at the table.
    for (const d of glossaryDemandFor(system)) {
      const entry = findTerm(system, d.term);
      expect(entry, `${system} ${d.kind} "${d.term}"`).toBeTruthy();
      expect(entry!.body.trim().length, `${system} ${d.kind} "${d.term}" body`).toBeGreaterThan(120);
      expect(entry!.short.trim().length, `${system} ${d.kind} "${d.term}" short`).toBeGreaterThan(15);
    }
  });

  it('reports its own numbers from the arrays rather than hand-typed counts', () => {
    // A typed count is a lie the moment content changes — the same rule PF2_CATALOG_STATUS follows.
    const status = GLOSSARY_COVERAGE_STATUS[system];
    expect(status.demanded).toBe(coverage.demanded);
    expect(status.covered).toBe(coverage.covered);
    expect(status.complete).toBe(coverage.missing.length === 0);
  });

  it('says what a reader is actually getting, even where coverage is complete', () => {
    // `complete: true` means every term resolves — NOT that every article is rulebook-deep. IG's skill
    // articles are deliberately thin, and a bare green tick would imply otherwise.
    expect(GLOSSARY_COVERAGE_STATUS[system].note?.length ?? 0).toBeGreaterThan(40);
  });
});

describe('the demand surface is real and strictly system-scoped', () => {
  it('covers all four categories where the system has them', () => {
    for (const system of GLOSSARY_COVERAGE_SYSTEMS) {
      const kinds = new Set(glossaryDemandFor(system).map((d) => d.kind));
      for (const k of ['condition', 'skill', 'damage']) {
        expect(kinds.has(k as never), `${system} should demand ${k} terms`).toBe(true);
      }
    }
  });

  it('stances are demanded for Intuitive Games and for nobody else', () => {
    // The clearest single check that the demand is built per-system rather than from one shape: only
    // IG has stances, and a 5e or PF2 sheet asking for one would mean a list had been copied across.
    for (const system of GLOSSARY_COVERAGE_SYSTEMS) {
      const hasStances = glossaryDemandFor(system).some((d) => d.kind === 'stance');
      expect(hasStances, system).toBe(system === 'intuitive-games');
    }
  });

  it('a term is only ever counted as covered against its OWN system', () => {
    // Edition bleed, guarded at the coverage helper. IG's Heatstroke and PF2's Off-Guard are each
    // defined in exactly one system; if `glossaryHasArticle` ever consulted a shared or fallback
    // glossary, these would start passing everywhere.
    expect(glossaryHasArticle('intuitive-games', 'Heatstroke')).toBe(true);
    expect(glossaryHasArticle('dnd5e-2024', 'Heatstroke')).toBe(false);
    expect(glossaryHasArticle('pathfinder2e', 'Heatstroke')).toBe(false);

    expect(glossaryHasArticle('pathfinder2e', 'Off-Guard')).toBe(true);
    expect(glossaryHasArticle('dnd5e-2014', 'Off-Guard')).toBe(false);
    expect(glossaryHasArticle('intuitive-games', 'Off-Guard')).toBe(false);
  });

  it('does not accept a prefix near-miss as coverage', () => {
    // `findTerm` falls back to prefix matching, which is right for a search box and wrong here: it
    // resolves "Prone" against "Pronouncement". If this helper ever starts using it, a system could
    // report full coverage while a term opened somebody else's article.
    // "Athl" is a prefix of Athletics and nothing else — findTerm resolves it, coverage must not.
    // (Note "Blind" would NOT work as the example: it is a real ALIAS of the Blinded condition, so
    // both correctly accept it. An alias is coverage; a prefix is not.)
    expect(glossaryHasArticle('dnd5e-2024', 'Athl')).toBe(false);
    expect(findTerm('dnd5e-2024', 'Athl')?.term).toBe('Athletics');
    expect(glossaryHasArticle('dnd5e-2024', 'Blind')).toBe(true); // a real alias of Blinded
  });
});

describe('the status object never overstates coverage', () => {
  it('claims completeness only when every term in every system resolves', () => {
    const everyTermResolves = GLOSSARY_COVERAGE_SYSTEMS.every(
      (s) => glossaryCoverageFor(s).missing.length === 0,
    );
    expect(glossaryCoverageIsComplete()).toBe(everyTermResolves);
  });

  it('records the gaps it chose not to invent its way out of', () => {
    // The repo's standing rule: an honestly reported gap beats a plausible invention, and the record
    // lives next to the data. These three are the specific judgement calls this sweep made.
    const all = GLOSSARY_KNOWN_GAPS.join('\n');
    expect(GLOSSARY_KNOWN_GAPS.length).toBeGreaterThan(5);
    // IG has no per-skill rules text anywhere in the repo — the articles say so instead of borrowing
    // another game's version of "Appraise".
    expect(all).toMatch(/no per-skill rules text/i);
    // PF2 has no canonical damage-type list, so spirit/holy/unholy were left out rather than guessed.
    expect(all).toMatch(/spirit, holy and unholy/i);
    // Several PF2 skills have no catalogued actions, and their articles admit it.
    expect(all).toMatch(/no catalogued\s+skill actions/i);
  });

  it('lower-bound counts, so authoring more content never breaks this suite', () => {
    expect(glossaryFor('dnd5e-2024').length).toBeGreaterThanOrEqual(70);
    expect(glossaryFor('dnd5e-2014').length).toBeGreaterThanOrEqual(70);
    expect(glossaryFor('pathfinder2e').length).toBeGreaterThanOrEqual(120);
    expect(glossaryFor('intuitive-games').length).toBeGreaterThanOrEqual(90);
  });
});

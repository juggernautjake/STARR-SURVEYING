// __tests__/dnd/ig-glossary-coverage.test.ts — what Intuitive Games' library actually covers (P8-3).
//
// The plan's item read: *"Intuitive Games has 32 terms — fewer than every unbuilt system (Blades 60,
// Shadowrun 55, CoC 51) and a third of PF2's 96. Another scrape pass of intuitivegames.net."*
//
// **Every number in that sentence is stale**, and I only found out by trying to build it. IG's glossary is
// well over a hundred entries, its tooltip demand is fully covered, and its powers, feats and ancestries
// have been searchable through the library the whole time. There is no scrape to do.
//
// So this file exists instead of the scrape: it PINS the coverage, in both directions. A future reader who
// finds a "32 terms" note somewhere runs this and sees the real numbers, and a regression that quietly
// drops IG content fails here rather than being discovered by a player who cannot look up Toughness.
import { describe, it, expect } from 'vitest';
import { glossaryFor } from '@/lib/dnd/glossary';
import { glossaryCoverageFor } from '@/lib/dnd/glossary/coverage';
import { searchLibrary } from '@/lib/dnd/library';
import { igAllFeats } from '@/lib/dnd/systems/intuitive-games/feats';
import { IG_POWERS, IG_DEFENSIVE_POWERS, IG_ANCESTRIES, IG_CONDITIONS } from '@/lib/dnd/systems/intuitive-games/content';

describe('the glossary is not thin — the plan’s figure was wrong', () => {
  const ig = glossaryFor('intuitive-games');

  it('has well over a hundred articles, not thirty-two', () => {
    expect(ig.length).toBeGreaterThan(100);
  });

  it('and is comparable to Pathfinder 2e rather than a third of it', () => {
    const pf2 = glossaryFor('pathfinder2e');
    // Not "more than", because that would pin a race between two growing catalogues. Half is the claim
    // the plan actually made ("a third of PF2's 96") and the one worth disproving.
    expect(ig.length).toBeGreaterThan(pf2.length * 0.5);
  });
});

describe('TOOLTIP COVERAGE IS COMPLETE, which is the number that matters', () => {
  // Entry count is a vanity metric — a glossary of a thousand articles that misses the word on the sheet
  // in front of you is worse than a small one that does not. `glossaryCoverageFor` measures the terms IG
  // content actually NAMES against the articles that exist for them.
  const cov = glossaryCoverageFor('intuitive-games');

  it('every demanded term resolves to an article', () => {
    expect(cov.missing.map((m) => m.term)).toEqual([]);
    expect(cov.covered).toBe(cov.demanded);
  });

  it('and the demand is real, not an empty set passing vacuously', () => {
    expect(cov.demanded).toBeGreaterThan(50);
  });

  it('to the same standard Pathfinder 2e meets', () => {
    const pf2 = glossaryCoverageFor('pathfinder2e');
    expect(pf2.covered).toBe(pf2.demanded);
  });
});

describe('powers, feats and ancestries are ALREADY searchable — through the library, not the glossary', () => {
  // This is the half of the picture the plan's item missed, and the half that made the "obvious" fix a
  // regression: adding these to the glossary shadowed the library's own richer entries in search. The
  // existing `library.test.ts` caught it, which is exactly what that test is for.
  const find = (q: string) => searchLibrary(q, 'intuitive-games');

  it('a power, with its effect text', () => {
    const hit = find('elemental blast').find((h) => h.kind === 'power');
    expect(hit, 'Elemental Blast').toBeTruthy();
    expect(hit!.body.length).toBeGreaterThan(40);
  });

  it('a defensive power', () => {
    expect(find('sidestep').some((h) => h.kind === 'defensive-power')).toBe(true);
  });

  it('an individual FEAT, not just the "Feats" article', () => {
    // The one that looked like a gap at a glance: searching "toughness" returns the general Feats entry
    // first. The feat itself is there too, one row down.
    expect(find('toughness').some((h) => h.kind === 'feat' && h.name === 'Toughness')).toBe(true);
    expect(find('advanced magic').some((h) => h.kind === 'feat')).toBe(true);
  });

  it('an ancestry', () => {
    expect(find('dwarf').some((h) => h.kind === 'species')).toBe(true);
  });

  it('and a condition, which the glossary owns', () => {
    expect(find('flat-footed').some((h) => h.kind === 'condition')).toBe(true);
  });
});

describe('the catalogues behind all of that are the size they should be', () => {
  // Pinned so a truncated re-scrape is loud. These are the numbers the claims above rest on.
  it('151 feats, 63 powers, 6 defensive powers, 10 ancestries, 18 conditions', () => {
    expect(igAllFeats().length).toBeGreaterThanOrEqual(151);
    expect(IG_POWERS.length).toBeGreaterThanOrEqual(63);
    expect(IG_DEFENSIVE_POWERS.length).toBeGreaterThanOrEqual(6);
    expect(IG_ANCESTRIES.length).toBeGreaterThanOrEqual(10);
    expect(IG_CONDITIONS.length).toBeGreaterThanOrEqual(18);
  });

  it('and every feat carries real rules text', () => {
    // `content.ts`'s IG_FEATS is a name+category list with NO effect text — the thin one of the two feat
    // sources, four directories from the real one. Anything reading feats must read `igAllFeats()`.
    for (const f of igAllFeats()) expect(f.effect?.trim(), f.name).toBeTruthy();
  });
});

// __tests__/dnd/bestiary-eligibility.test.ts — which creatures earn variants (P13-9).
//
// The brief names two examples and they are the two anchors of this suite: a woodland rabbit must NOT be
// eligible, and a vampire and a lion MUST be. Everything else is the reasoning that gets you from one to
// the other without hand-marking 1,500 rows.
import { describe, it, expect } from 'vitest';
import { isVariantEligible, variantReason, parseCr, explainVariantReason } from '@/lib/dnd/bestiary/eligibility';

const c = (over: Partial<Parameters<typeof variantReason>[0]>) =>
  ({ name: 'Thing', system: 'dnd5e-2024', ...over }) as Parameters<typeof variantReason>[0];

describe("the brief's own examples", () => {
  it('a woodland rabbit does NOT get three stat blocks', () => {
    expect(isVariantEligible(c({ name: 'Rabbit', type: 'beast', cr: '0' }))).toBe(false);
  });

  it('a vampire does', () => {
    expect(variantReason(c({ name: 'Vampire', type: 'undead', cr: '13' }))).toBe('scaling-family');
    // …and so does the low-CR member of the same family, which is the point of a FAMILY rule: a CR floor
    // alone would have excluded the spawn while including a CR 5 giant frog.
    expect(isVariantEligible(c({ name: 'Vampire Spawn', type: 'undead', cr: '5' }))).toBe(true);
  });

  it('a lion does, despite being a beast', () => {
    // Named specifically in the brief. Its type does not ladder, so the type rule alone would miss it.
    expect(variantReason(c({ name: 'Lion', type: 'beast', cr: '1' }))).toBe('named-tier');
  });
});

describe('the rules, and what each one is FOR', () => {
  it('a scaling family qualifies at any rating', () => {
    for (const t of ['dragon', 'giant', 'undead', 'fiend', 'celestial', 'elemental']) {
      expect(isVariantEligible(c({ type: t, cr: '1/4' })), t).toBe(true);
    }
  });

  it('a non-scaling type does NOT qualify on type alone', () => {
    // A dire wolf is not a tier of wolf the way an adult dragon is a tier of dragon. This is the rule that
    // keeps the rabbit out, and it is the one most likely to be loosened by accident.
    for (const t of ['beast', 'plant', 'ooze', 'humanoid']) {
      expect(isVariantEligible(c({ name: 'Thing', type: t, cr: '4' })), t).toBe(false);
    }
  });

  it('a set piece qualifies on rating whatever its type', () => {
    expect(variantReason(c({ name: 'Thing', type: 'plant', cr: '10' }))).toBe('boss-tier');
    expect(isVariantEligible(c({ name: 'Thing', type: 'plant', cr: '9' }))).toBe(false);
  });

  it('a `boss` tag qualifies where the rating does not say so', () => {
    expect(variantReason(c({ name: 'Thing', type: 'humanoid', cr: '2', tags: ['boss'] }))).toBe('boss-tier');
  });

  it('reports the MOST SPECIFIC reason when several apply', () => {
    // An ancient dragon is both a scaling family and a set piece. "Its kind comes in tiers" is the more
    // useful sentence to show a DM than "it is big".
    expect(variantReason(c({ name: 'Ancient Red Dragon', type: 'dragon', cr: '24' }))).toBe('scaling-family');
  });

  it('matches a named family as a WHOLE WORD', () => {
    // 'lionfish' is not a lion; 'spider' should still catch 'Giant Spider' and the plural.
    expect(isVariantEligible(c({ name: 'Lionfish', type: 'beast', cr: '1' }))).toBe(false);
    expect(isVariantEligible(c({ name: 'Giant Spider', type: 'beast', cr: '1' }))).toBe(true);
    expect(isVariantEligible(c({ name: 'Swarm of Spiders', type: 'beast', cr: '1' }))).toBe(true);
  });
});

describe('parseCr', () => {
  it('reads 5e fractions and plain integers', () => {
    expect(parseCr('1/8')).toBeCloseTo(0.125);
    expect(parseCr('1/2')).toBe(0.5);
    expect(parseCr('13')).toBe(13);
  });

  it('reads a negative PF2/IG level', () => {
    expect(parseCr('-1')).toBe(-1);
  });

  it('returns null — never 0 — for anything unparseable', () => {
    // Treating an unreadable rating as 0 would silently make every mis-scraped row ineligible, which is
    // the kind of bug that shows up as "the bestiary just has fewer variants than it should".
    for (const v of ['', '   ', 'unknown', '1/0', null, undefined]) expect(parseCr(v)).toBeNull();
  });

  it('an unknown rating does not by itself grant boss tier', () => {
    expect(isVariantEligible(c({ name: 'Thing', type: 'beast', cr: 'unknown' }))).toBe(false);
  });
});

describe('the decision is explainable', () => {
  it('every reason has a sentence', () => {
    for (const r of ['scaling-family', 'named-tier', 'boss-tier', 'none'] as const) {
      expect(explainVariantReason(r).length).toBeGreaterThan(20);
    }
  });
});

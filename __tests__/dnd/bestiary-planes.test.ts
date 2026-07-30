// __tests__/dnd/bestiary-planes.test.ts — "creatures from every plane" as a filter, not a claim (B5-2).
//
// The judgement here is the same one B6-4 had to make about stances: which statements are PUBLISHED and
// which would be ours. A fiend's plane of origin is published — it is what the type means. A wolf's is
// not, and neither is a forest.
import { describe, it, expect } from 'vitest';
import { PLANES, planeByKey, planeFor } from '@/lib/dnd/bestiary/planes';
import { CREATURE_TAGS } from '@/lib/dnd/bestiary/taxonomy';

describe('planeFor — what the type states', () => {
  it('reads a plane of origin off the four types that define one', () => {
    expect(planeFor({ tags: ['fiend'] })?.label).toBe('The Lower Planes');
    expect(planeFor({ tags: ['celestial'] })?.label).toBe('The Upper Planes');
    expect(planeFor({ tags: ['elemental'] })?.label).toBe('The Elemental Planes');
    expect(planeFor({ tags: ['fey'] })?.label).toBe('The Feywild');
  });

  it('RETURNS NULL for a creature whose type implies nothing', () => {
    // The important one. A wolf, a goblin and a dragon are Material Plane natives, and giving them a
    // planar origin to fill the column would be the invention this module exists to avoid.
    expect(planeFor({ tags: ['beast'] })).toBeNull();
    expect(planeFor({ tags: ['humanoid'] })).toBeNull();
    expect(planeFor({ tags: ['dragon'] })).toBeNull();
    expect(planeFor({ tags: [] })).toBeNull();
    expect(planeFor({})).toBeNull();
  });

  it('leaves UNDEAD and CONSTRUCTS without one, because both are made rather than born', () => {
    // A skeleton is animated on the Material Plane and a golem is built there. Filing them under a plane
    // would state something the rules do not.
    expect(planeFor({ tags: ['undead'] })).toBeNull();
    expect(planeFor({ tags: ['construct'] })).toBeNull();
  });

  it('hedges the aberration entry, because the source hedges it', () => {
    // Published wording is "alien entities … MANY of them from the Far Realm" — many, not all. Stating it
    // as flatly as the other four would overclaim on 281 creatures.
    const far = planeFor({ tags: ['aberration'] })!;
    expect(far.label).toMatch(/many/i);
    expect(far.basis).toMatch(/"many", not "all"/);
  });
});

describe('planeFor — refined by the creature\'s own text', () => {
  it('names the specific plane when the prose does', () => {
    // 223 creatures name the Abyss in their own description. "The Lower Planes" is true for all of them;
    // "The Abyss" is truer for these, and it comes from the creature rather than from us.
    const demon = planeFor({ tags: ['fiend'], description: 'A native of the Abyss, it delights in ruin.' })!;
    expect(demon.label).toBe('The Abyss');
    expect(demon.specific).toBe(true);
    expect(demon.basis).toMatch(/own text names The Abyss/i);
  });

  it('falls back to the family when the prose names nothing', () => {
    const devil = planeFor({ tags: ['fiend'], description: 'It bargains coldly.' })!;
    expect(devil.label).toBe('The Lower Planes');
    expect(devil.specific).toBe(false);
  });

  it('does not let one fiend\'s prose claim another\'s plane', () => {
    expect(planeFor({ tags: ['fiend'], description: 'Bound in the Nine Hells by contract.' })!.label)
      .toBe('The Nine Hells');
  });
});

describe('the plane list itself', () => {
  it('only names creature types the taxonomy actually has', () => {
    // A plane pointing at a type that does not exist would compile and then filter to nothing forever.
    for (const p of PLANES) expect(CREATURE_TAGS).toContain(p.tag);
  });

  it('has unique keys, since they appear in URLs', () => {
    expect(new Set(PLANES.map((p) => p.key)).size).toBe(PLANES.length);
  });

  it('resolves an unknown key to null, so a bad URL shows the catalogue rather than an empty page', () => {
    // Matching nothing would read as "there are no fiends" instead of "that filter does not exist".
    expect(planeByKey('nonsense')).toBeNull();
    expect(planeByKey(null)).toBeNull();
    expect(planeByKey('lower')?.tag).toBe('fiend');
  });

  it('states a basis for every plane, because the label alone reads as our decision', () => {
    for (const p of PLANES) expect(p.basis.length).toBeGreaterThan(20);
  });
});

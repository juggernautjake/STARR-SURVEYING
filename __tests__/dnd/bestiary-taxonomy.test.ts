// __tests__/dnd/bestiary-taxonomy.test.ts — the brief's categories, and the seam that composes them
// (P13-6, plus `deriveCreature`).
import { describe, it, expect } from 'vitest';
import { creatureTags, CREATURE_TAGS, TAG_LABELS } from '@/lib/dnd/bestiary/taxonomy';
import { deriveCreature } from '@/lib/dnd/bestiary/derive';

const c = (o: Record<string, unknown>) => ({ name: 'Thing', system: 'dnd5e-2024', ...o }) as never;

describe("the brief's own categories", () => {
  it('reads the ones it names', () => {
    expect(creatureTags(c({ name: 'Owlbear', type: 'monstrosity' }))).toContain('woodland');
    expect(creatureTags(c({ name: 'Giant Octopus', type: 'beast', size: 'Large' }))).toContain('sea');
    expect(creatureTags(c({ name: 'Giant Eagle', type: 'beast' }))).toContain('bird');
    expect(creatureTags(c({ name: 'Mastiff', type: 'beast' }))).toContain('companion');
    expect(creatureTags(c({ name: 'Gargoyle', type: 'elemental' }))).toContain('folklore');
    expect(creatureTags(c({ name: 'Vrock', type: 'fiend' }))).toContain('demonic');
  });

  it('tags massive by SIZE and boss by RATING', () => {
    expect(creatureTags(c({ size: 'Gargantuan' }))).toContain('massive');
    expect(creatureTags(c({ size: 'Medium' }))).not.toContain('massive');
    expect(creatureTags(c({ cr: '12' }))).toContain('boss');
    expect(creatureTags(c({ cr: '9' }))).not.toContain('boss');
  });

  it('gives a creature AS MANY tags as apply', () => {
    // A single `category` column would have made the filters lie. A kraken is sea AND massive AND a boss.
    const t = creatureTags(c({ name: 'Kraken', type: 'monstrosity', size: 'Gargantuan', cr: '23' }));
    expect(t).toEqual(expect.arrayContaining(['sea', 'massive', 'boss']));
  });

  it('implies abyssal from demonic, but not the reverse', () => {
    expect(creatureTags(c({ type: 'fiend' }))).toContain('abyssal');
    expect(creatureTags(c({ name: 'Abyssal Chicken', type: 'beast' }))).not.toContain('demonic');
  });

  it('is order-stable, so a re-import diffs cleanly', () => {
    const t = creatureTags(c({ name: 'Kraken', type: 'monstrosity', size: 'Gargantuan', cr: '23' }));
    expect(t).toEqual(CREATURE_TAGS.filter((x) => t.includes(x)));
  });

  it('matches names as whole words', () => {
    expect(creatureTags(c({ name: 'Ratatosk', type: 'beast' }))).not.toContain('companion');
    expect(creatureTags(c({ name: 'Giant Rat', type: 'beast' }))).toContain('companion');
  });

  it('every tag has a label', () => {
    for (const t of CREATURE_TAGS) expect(TAG_LABELS[t]).toBeTruthy();
  });
});

describe('deriveCreature composes the three rules in the right order', () => {
  it('tags BEFORE eligibility, so a tag-qualified creature is caught', () => {
    // The bug this ordering prevents: `variantReason` reads the `boss` tag, so deriving eligibility from
    // an untagged row silently misses every creature that qualifies on the tag rather than the rating.
    const d = deriveCreature(c({ name: 'Thing', type: 'humanoid', cr: '14', statblock: { ac: 15, hp: 100 } }));
    expect(d.tags).toContain('boss');
    expect(d.variantEligible).toBe(true);
    expect(d.reason).toBe('boss-tier');
  });

  it('emits weak AND elite, in that order, for an eligible creature', () => {
    const d = deriveCreature(c({ name: 'Vampire', type: 'undead', cr: '13', statblock: { ac: 16, hp: 144 } }));
    expect(d.variants.map((v) => v.tier)).toEqual(['weak', 'elite']);
  });

  it('emits NO variants for the rabbit', () => {
    // Never a partial pair, and never three versions of something that does not need them.
    const d = deriveCreature(c({ name: 'Rabbit', type: 'beast', cr: '0', statblock: { ac: 10, hp: 2 } }));
    expect(d.variantEligible).toBe(false);
    expect(d.variants).toEqual([]);
    expect(d.tags).toContain('woodland');   // still catalogued and browsable, just not versioned
  });
});

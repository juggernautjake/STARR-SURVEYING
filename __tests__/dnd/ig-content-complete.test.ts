// __tests__/dnd/ig-content-complete.test.ts — Data-Sheet content completeness (full-sheet Slice 1).
// Powers carry effect text; the actions taxonomy and the full bestiary are present and correctly grouped;
// the classifier recognizes both creature groups and individual bestiary entries; the catalog exposes them.
import { describe, it, expect } from 'vitest';
import {
  IG_POWERS, IG_ACTIONS, IG_ACTION_ECONOMIES, IG_CREATURES, igActionsByEconomy, igCreaturesByGroup, igIsVanilla,
} from '@/lib/dnd/systems/intuitive-games/content';
import { igCatalog } from '@/lib/dnd/systems/intuitive-games/catalog';
import { classifyElement } from '@/lib/dnd/provenance';

describe('IG content completeness (full-sheet Slice 1)', () => {
  it('every power now carries a mechanical effect summary', () => {
    expect(IG_POWERS.length).toBeGreaterThanOrEqual(37);
    expect(IG_POWERS.every((p) => (p.effect ?? '').length > 10)).toBe(true);
    expect(IG_POWERS.find((p) => p.name === 'Mirror Image')?.effect).toMatch(/1d4 mirror images/i);
    expect(IG_POWERS.find((p) => p.name === 'Elemental Blast')?.effect).toMatch(/Acid.*Cold.*Fire|damage type/i);
  });

  it('the actions taxonomy covers the whole economy', () => {
    const by = igActionsByEconomy();
    for (const e of IG_ACTION_ECONOMIES) expect(by[e].length).toBeGreaterThan(0);
    expect(by.Single.some((a) => a.name === 'Attack')).toBe(true);
    expect(by.Reaction.some((a) => a.name === 'Attack of Opportunity')).toBe(true);
    expect(by.Triple.some((a) => a.name === 'Death Spiral')).toBe(true);
    expect(IG_ACTIONS.length).toBeGreaterThanOrEqual(18);
  });

  it('the bestiary is complete and grouped, and classifies vanilla by name or group', () => {
    const groups = igCreaturesByGroup();
    expect(Object.keys(groups)).toEqual(expect.arrayContaining(['Animals', 'Dragons', 'Elementals', 'Fey', 'Magical Beasts', 'Undead']));
    expect(IG_CREATURES.length).toBeGreaterThan(70);
    // a specific bestiary entry AND its group both read as vanilla creature-types
    expect(igIsVanilla('creature-type', 'Griffon')).toBe(true);
    expect(igIsVanilla('creature-type', 'Dragons')).toBe(true);
    expect(classifyElement('intuitive-games', 'creature-type', 'Phoenix')).toBe('vanilla');
    expect(classifyElement('intuitive-games', 'creature-type', 'Sasquatch')).toBe('custom'); // not in the bestiary
  });

  it('the catalog surfaces the bestiary + actions sections', () => {
    const titles = igCatalog().map((g) => g.title);
    expect(titles.some((t) => t.startsWith('Creatures · '))).toBe(true);
    expect(titles.some((t) => t.startsWith('Actions · '))).toBe(true);
  });
});

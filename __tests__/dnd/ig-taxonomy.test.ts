// __tests__/dnd/ig-taxonomy.test.ts — Area T2. The IG class taxonomy is golden-pinned to Brendan's site
// (4 parents × subclasses), self-consistent (each subclass has exactly one parent — no leak), and agrees with
// the mechanical IG_CLASS_DETAILS data.
import { describe, it, expect } from 'vitest';
import {
  IG_CLASS_TAXONOMY, igParentClasses, igSubclassesOf, igParentOf, igIsParentClass, igIsSubclass,
  igAllTaxonomyClasses, igClassLabel,
} from '@/lib/dnd/systems/intuitive-games/taxonomy';
import { IG_CLASS_DETAILS } from '@/lib/dnd/systems/intuitive-games/content';

describe('the site taxonomy is golden-pinned (T2)', () => {
  it('has exactly the four parents with their subclasses, verbatim', () => {
    expect(igParentClasses()).toEqual(['Archon', 'Conduit', 'Fighter', 'Wizard']);
    expect(igSubclassesOf('Archon')).toEqual(['Beastmaster', 'Eldritch Binder', 'Packmaster', 'Summoner']);
    expect(igSubclassesOf('Conduit')).toEqual(['Druid', 'Shifter', 'Witch']);
    expect(igSubclassesOf('Fighter')).toEqual(['Champion', 'Freebooter', 'Marksman', 'Sohei']);
    expect(igSubclassesOf('Wizard')).toEqual(['Arcanist', 'Magician', 'Shaman']);
  });
});

describe('taxonomy queries are consistent — no leak (T2)', () => {
  it('every subclass maps to exactly one parent; parents are not subclasses', () => {
    for (const t of IG_CLASS_TAXONOMY) {
      expect(igIsParentClass(t.parent)).toBe(true);
      expect(igParentOf(t.parent)).toBeNull();
      for (const s of t.subclasses) {
        expect(igParentOf(s)).toBe(t.parent);
        expect(igIsSubclass(s)).toBe(true);
        expect(igIsParentClass(s)).toBe(false);
      }
    }
  });
  it('a subclass name appears under only ONE parent across the whole taxonomy', () => {
    const subs = IG_CLASS_TAXONOMY.flatMap((t) => t.subclasses);
    expect(new Set(subs).size).toBe(subs.length); // no duplicate subclass across families
  });
  it('queries are case-insensitive + labelled in family context', () => {
    expect(igParentOf('marksman')).toBe('Fighter');
    expect(igClassLabel('Marksman')).toBe('Fighter · Marksman');
    expect(igClassLabel('Fighter')).toBe('Fighter');
    expect(igAllTaxonomyClasses()).toContain('Archon');
    expect(igAllTaxonomyClasses()).toContain('Summoner');
    expect(igAllTaxonomyClasses()).toHaveLength(4 + 4 + 3 + 4 + 3); // 4 parents + 14 subclasses
  });
});

describe('the taxonomy agrees with IG_CLASS_DETAILS (T2)', () => {
  it('every detail row with a classification is consistent with the taxonomy', () => {
    for (const d of IG_CLASS_DETAILS) {
      if (!d.classification) continue;
      if (d.classification === 'class') {
        expect(igIsParentClass(d.name)).toBe(true); // a "class" row is one of the four parents
      } else {
        const m = /^subclass of (.+)$/.exec(d.classification);
        expect(m).toBeTruthy();
        const parent = m![1];
        expect(igParentOf(d.name)).toBe(parent); // its declared parent matches the taxonomy
        expect(igSubclassesOf(parent)).toContain(d.name);
      }
    }
  });
});

import { systemGroundingBlock } from '@/lib/dnd/grounding';

describe('taxonomy in the IG grounding (T1)', () => {
  it('grounds an IG build on the parent→subclass structure', async () => {
    const g = await systemGroundingBlock('intuitive-games', 'build a summoner');
    expect(g.block).toMatch(/CLASS TAXONOMY/);
    expect(g.block).toMatch(/Archon: Beastmaster, Eldritch Binder, Packmaster, Summoner/);
    expect(g.block).toMatch(/PARENT class \+ one of ITS subclasses/);
  });
  it('does not add the IG taxonomy to another system’s grounding', async () => {
    const g = await systemGroundingBlock('dnd5e-2024', 'build a fighter');
    expect(g.block).not.toMatch(/INTUITIVE GAMES CLASS TAXONOMY/);
  });
});

import { classifyElement } from '@/lib/dnd/provenance';

describe('every taxonomy subclass is provenance-vanilla (T1 catalog fix)', () => {
  it('all 14 subclasses classify vanilla, not custom (previously only 5 did)', () => {
    for (const t of IG_CLASS_TAXONOMY) {
      for (const s of t.subclasses) {
        expect(classifyElement('intuitive-games', 'subclass', s)).toBe('vanilla');
      }
    }
    // the four parents classify vanilla as classes
    for (const p of ['Archon', 'Conduit', 'Fighter', 'Wizard']) {
      expect(classifyElement('intuitive-games', 'class', p)).toBe('vanilla');
    }
  });
});

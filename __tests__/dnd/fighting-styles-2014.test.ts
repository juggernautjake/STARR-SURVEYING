// __tests__/dnd/fighting-styles-2014.test.ts — the 2014 half of the "a demanded choice must be offerable"
// fix (final-QA walkthrough, slices 4–6).
//
// Slice 4 fixed Fighting Style for 2024 by pulling `category: 'fighting-style'` feats out of the catalog.
// That silently did nothing for 2014, because `featCatalogForSystem('dnd5e-2014')` returns `category: null`
// for every feat — so the 2014 Fighter/Ranger/Paladin still demanded a Fighting Style and offered none.
// 2014 keeps its styles as prose in each class's feature body, and the list differs per class.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fightingStyles2014, FIGHTING_STYLES_2014 } from '@/lib/dnd/classes/dnd5e-2014/fighting-styles';
import { planLevelUp } from '@/lib/dnd/classes/levelup';
import { classesForSystem, findClass } from '@/lib/dnd/classes/registry';

describe('2014 Fighting Styles are per-class data, not a shared list', () => {
  it('gives the Fighter all six', () => {
    expect(fightingStyles2014('fighter').map((s) => s.name)).toEqual(
      ['Archery', 'Defense', 'Dueling', 'Great Weapon Fighting', 'Protection', 'Two-Weapon Fighting']);
  });

  it('does NOT offer a Paladin the Ranger’s list, or vice versa', () => {
    // The reason this is per-class rather than one array: a shared list would hand a 2014 Paladin
    // "Archery", which the rules do not.
    expect(fightingStyles2014('paladin').map((s) => s.name)).not.toContain('Archery');
    expect(fightingStyles2014('paladin').map((s) => s.name)).toContain('Protection');
    expect(fightingStyles2014('ranger').map((s) => s.name)).toContain('Archery');
    expect(fightingStyles2014('ranger').map((s) => s.name)).not.toContain('Protection');
  });

  it('returns an empty list for a class that grants no style, rather than a default one', () => {
    expect(fightingStyles2014('wizard')).toEqual([]);
    expect(fightingStyles2014('barbarian')).toEqual([]);
  });

  it('every entry is renderable — a blank name or description is a blank card in the picker', () => {
    for (const [cls, list] of Object.entries(FIGHTING_STYLES_2014)) {
      for (const s of list) {
        expect(s.key, `${cls} key`).toMatch(/^fs14-/);
        expect(s.name.length, `${cls}/${s.key} name`).toBeGreaterThan(0);
        expect(s.description.length, `${cls}/${s.key} description`).toBeGreaterThan(20);
      }
    }
  });

  it('the levels route branches on edition instead of relying on the (null) 2014 categories', () => {
    const SRC = readFileSync(join(process.cwd(), 'app/api/dnd/characters/[id]/levels/route.ts'), 'utf8');
    expect(SRC).toContain('fightingStyles2014');
    expect(SRC).toMatch(/def\.system === 'dnd5e-2014'/);
  });
});

describe('every 2014 class demands exactly the ASIs it declares', () => {
  // Barbarian 2014 annotated only its level-4 ASI while declaring [4,8,12,16,19], so the level walker
  // never asked for the other four — every sibling class listed all of theirs. Found by probing the
  // whole ladder; fixed by completing the data, not by changing the derivation.
  it('walker ASI levels === asiLevels, for all of them', () => {
    for (const c of classesForSystem('dnd5e-2014')) {
      const def = findClass('dnd5e-2014', c.key)!;
      const plan = planLevelUp(def, { from: 0, to: 20, recorded: [] });
      const walker = plan.outstanding.filter((o) => o.kind === 'asi').map((o) => o.level);
      expect(walker, `${c.key} ASI levels`).toEqual(def.asiLevels ?? []);
    }
  });

  it('barbarian specifically — the class the gap was found on', () => {
    const def = findClass('dnd5e-2014', 'barbarian')!;
    const plan = planLevelUp(def, { from: 0, to: 20, recorded: [] });
    expect(plan.outstanding.filter((o) => o.kind === 'asi').map((o) => o.level)).toEqual([4, 8, 12, 16, 19]);
  });
});

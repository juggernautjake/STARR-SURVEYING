// __tests__/dnd/ledger-set-max.test.ts — the ledger's `set` semantics, split by source.
//
//   • ITEM / feature `set` — resolves as `Math.max(base, override)`: it can RAISE a value but never LOWER it
//     below the character's own base. A Belt of Giant Strength "sets STR to 21" but does nothing to a STR-24
//     hero. This is the deliberate rule and is unchanged.
//   • FORM `set` (a shape-shift) — REPLACES the base outright, up OR down, per the shapeshiftStats preference
//     (default 'full' = RAW: a druid who turns into a rat becomes STR 2). This is the resolved form-stat
//     decision (see shapeshift-feat-prefs.test.ts for the full full/partial/none matrix).
import { describe, it, expect } from 'vitest';
import { buildLedger } from '@/lib/dnd/effects/ledger';
import { blankCharacter } from '@/app/dnd/_sheet/data/blank';
import type { Character, CharForm } from '@/app/dnd/_sheet/types';

// A STR-setting effect delivered by an EQUIPPED item (the max-rule case).
function withItem(baseStr: number, itemStr: number): Character {
  const c = blankCharacter('Hero');
  c.abilities = { ...c.abilities, str: baseStr };
  c.inventory = [{
    id: 'belt', name: 'Belt of Giant Strength', desc: '', qty: 1, tags: [], equipped: true,
    effects: [{ target: 'ability_str', operation: 'set', value: itemStr }],
  }] as Character['inventory'];
  return c;
}

// A STR-setting effect delivered by an active FORM (the replace case).
function withForm(baseStr: number, formStr: number): Character {
  const c = blankCharacter('Shifter');
  c.abilities = { ...c.abilities, str: baseStr };
  c.forms = [
    { id: 'base', name: 'Base', subtitle: '', cls: '', unlockLevel: 1, gating: 'held', flavor: '', bullets: [] },
    { id: 'form', name: 'Form', subtitle: '', cls: '', unlockLevel: 1, gating: 'held', flavor: '', bullets: [],
      effects: [{ target: 'ability_str', operation: 'set', value: formStr }] },
  ] as CharForm[];
  c.activeFormId = 'form';
  return c;
}

describe('an item `set` raises but never lowers below the base (max semantics)', () => {
  it('a stronger set RAISES the value (Belt of Giant Strength on a weaker hero)', () => {
    expect(buildLedger(withItem(10, 19)).value('ability_str', 10)).toBe(19);
  });

  it('a lesser set does NOT lower a stronger character (the item rule this exists for)', () => {
    // Base STR 20, an item sets STR to 15 → stays 20. Correct for a Belt of Giant Strength.
    expect(buildLedger(withItem(20, 15)).value('ability_str', 20)).toBe(20);
  });
});

describe('a FORM `set` replaces the base outright (the resolved shapeshift rule)', () => {
  it('a weaker form LOWERS physical stats by default (Rat form → STR 2)', () => {
    // A Rat form (STR 2) on a STR-20 hero. RAW Wild Shape replaces, so the ledger now reports STR 2.
    expect(buildLedger(withForm(20, 2)).value('ability_str', 20)).toBe(2);
  });

  it('a stronger form still raises', () => {
    expect(buildLedger(withForm(10, 19)).value('ability_str', 10)).toBe(19);
  });

  it("shapeshiftStats 'none' leaves the base untouched", () => {
    expect(buildLedger(withForm(20, 2), { shapeshiftStats: 'none' }).value('ability_str', 20)).toBe(20);
  });
});

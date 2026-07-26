// __tests__/dnd/weapon-mastery.test.ts — the 2024 mastery a player picks is one they can still see.
//
// Third instance of the same shape in this doc, after weapon `properties` and the armour STR requirement:
// the DATA was fully authored and nothing let a player use it. `equipment/dnd5e-2024.ts` has carried
// `MasteryProperty` and all eight `MASTERY_PROPERTIES` with their effect text since the 2024 tables landed
// — "THE 2024 HEADLINE IS WEAPON MASTERY", says its own header — and `WeaponStats` had no field for it, so
// a homebrew greataxe could not have Cleave.
//
// Deliberately a REMINDER rather than an automation, and the distinction is the point: every mastery is an
// on-hit or on-miss rider (Graze deals damage on a miss, Topple forces a save, Vex grants advantage on the
// next attack) and this roll pipeline has no rider stage to run them in. Claiming to apply them would be
// worse than not applying them — a player would trust it. So the name reaches the attack row, where it is
// read at the moment of rolling, and the mechanic stays in the player's hands.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { attacksFromWeaponItems } from '@/app/dnd/_sheet/engine/weapon-items';
import { MASTERY_PROPERTIES } from '@/lib/dnd/equipment/dnd5e-2024';
import type { InvItem } from '@/app/dnd/_sheet/types';

const MODS = { str: 3, dex: 1, con: 0, int: 0, wis: 0, cha: 0 };
const axe = (extra: Record<string, unknown> = {}): InvItem => ({
  id: 'axe', name: 'Greataxe', desc: '', qty: 1, tags: [], kind: 'weapon',
  weapon: { damage: { dice: '1d12', type: 'slashing' }, proficient: true, ...extra },
} as InvItem);

describe('the mastery reaches the attack row', () => {
  it('appears in the row\'s notes, which the sheet already renders', () => {
    const [row] = attacksFromWeaponItems([axe({ mastery: 'Cleave' })], MODS);
    expect(row.atk.notes).toContain('mastery: Cleave');
  });

  it('shares the line with bonus dice rather than displacing them', () => {
    const [row] = attacksFromWeaponItems(
      [axe({ mastery: 'Graze', bonus: [{ dice: '1d6', type: 'fire' }] })], MODS,
    );
    expect(row.atk.notes).toContain('+1d6 fire');
    expect(row.atk.notes).toContain('mastery: Graze');
  });

  it('adds nothing when no mastery is set — a 2014 weapon stays exactly as it was', () => {
    const [row] = attacksFromWeaponItems([axe()], MODS);
    expect(row.atk.notes).toBeUndefined();
  });

  it('ignores whitespace rather than printing an empty mastery', () => {
    const [row] = attacksFromWeaponItems([axe({ mastery: '   ' })], MODS);
    expect(row.atk.notes).toBeUndefined();
  });
});

describe('it changes no number — it is a reminder, not an automation', () => {
  it('leaves to-hit, damage and ability identical', () => {
    const [plain] = attacksFromWeaponItems([axe()], MODS);
    const [mastered] = attacksFromWeaponItems([axe({ mastery: 'Topple' })], MODS);
    expect(mastered.atk.ability).toBe(plain.atk.ability);
    expect(mastered.atk.damage).toBe(plain.atk.damage);
    expect(mastered.atk.bonusToHit).toBe(plain.atk.bonusToHit);
    expect(mastered.atk.bonusDamage).toBe(plain.atk.bonusDamage);
  });

  it('the engine does not pretend to run the riders', () => {
    // If a rider stage ever lands, THIS is the test that should be replaced rather than deleted.
    const SRC = readFileSync(join(process.cwd(), 'app/dnd/_sheet/engine/weapon-items.ts'), 'utf8');
    expect(SRC).toContain('no rider stage in the roll pipeline');
  });
});

describe('the control offers the published set, not free text', () => {
  const BUILDER = readFileSync(join(process.cwd(), 'app/dnd/_sheet/components/ItemBuilder.tsx'), 'utf8');

  it('lists all eight from the shared catalog', () => {
    expect(MASTERY_PROPERTIES).toHaveLength(8);
    for (const k of ['Cleave', 'Graze', 'Nick', 'Push', 'Sap', 'Slow', 'Topple', 'Vex']) {
      expect(MASTERY_PROPERTIES.map((m) => m.key)).toContain(k);
    }
    expect(BUILDER).toContain('MASTERY_PROPERTIES.map((m) =>');
  });

  it('reads them from the catalog rather than re-typing the list', () => {
    expect(BUILDER).toContain("from '@/lib/dnd/equipment/dnd5e-2024'");
  });

  it('shows what the chosen one DOES, so the player is not left to remember', () => {
    expect(BUILDER).toContain('MASTERY_PROPERTIES.find((m) => m.key === w.mastery)?.effect');
  });

  it('clears to undefined, so "none" does not persist an empty string', () => {
    expect(BUILDER).toContain('mastery: e.target.value || undefined');
  });

  it('every mastery in the catalog explains itself', () => {
    for (const m of MASTERY_PROPERTIES) {
      expect(m.effect.length, `${m.key} should describe its effect`).toBeGreaterThan(30);
    }
  });
});

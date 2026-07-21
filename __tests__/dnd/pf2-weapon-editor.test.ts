// __tests__/dnd/pf2-weapon-editor.test.ts — weapons compute, not just display (S15d).
//
// The sheet stored a pre-computed damage STRING and rendered it directly, so an edited weapon
// displayed correctly and rolled wrong: deadly, fatal, two-hand, agile and the striking rune line
// never computed. A Rapier and a Shortsword critted identically.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { applyPf2Edit, parsePf2Edit, PF2_EDIT_OPS } from '@/lib/dnd/systems/pathfinder2e/edit';
import { blankPF2Character } from '@/lib/dnd/systems/pathfinder2e/model';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');
const sheet = read('app/dnd/_ui/PF2Sheet.tsx');
const editor = read('app/dnd/_ui/PF2WeaponEditor.tsx');

describe('weapon ops', () => {
  it('are registered', () => {
    for (const op of ['add_attack', 'update_attack', 'remove_attack']) {
      expect(PF2_EDIT_OPS as readonly string[]).toContain(op);
    }
  });

  it('adds a weapon carrying its traits', () => {
    const c = applyPf2Edit(blankPF2Character('T'), {
      op: 'add_attack', name: 'Rapier', damage: '1d6', damageType: 'piercing', traits: ['deadly d8', 'finesse'],
    });
    expect(c.attacks[0]).toMatchObject({ name: 'Rapier', damage: '1d6', traits: ['deadly d8', 'finesse'] });
  });

  it('inherits the character’s attack proficiency rather than assuming trained', () => {
    // A Fighter's weapons must not silently downgrade when one is added.
    const base = blankPF2Character('T');
    const fighter = { ...base, combat: { ...base.combat, attackRank: 'expert' as const } };
    const c = applyPf2Edit(fighter, { op: 'add_attack', name: 'Longsword' });
    expect(c.attacks[0].rank).toBe('expert');
  });

  it('clamps potency to +3 rather than storing a nonsense bonus', () => {
    const r = parsePf2Edit({ op: 'add_attack', name: 'X', weaponBonus: 99 });
    expect('edit' in r && (r.edit as { weaponBonus?: number }).weaponBonus).toBe(3);
  });

  it('rejects an unrecognised striking value instead of storing it', () => {
    const r = parsePf2Edit({ op: 'add_attack', name: 'X', striking: 'ultra' });
    expect('edit' in r && (r.edit as { striking?: string }).striking).toBeUndefined();
  });

  it('update never CREATES, and stamps customized', () => {
    const before = blankPF2Character('T');
    expect(applyPf2Edit(before, { op: 'update_attack', name: 'Ghost', damage: '1d12' })).toEqual(before);
    const withW = applyPf2Edit(before, { op: 'add_attack', name: 'Axe', damage: '1d6' });
    const edited = applyPf2Edit(withW, { op: 'update_attack', name: 'Axe', damage: '1d12' });
    expect(edited.attacks[0]).toMatchObject({ damage: '1d12', customized: true });
  });

  it('removes by name', () => {
    const withW = applyPf2Edit(blankPF2Character('T'), { op: 'add_attack', name: 'Axe' });
    expect(applyPf2Edit(withW, { op: 'remove_attack', name: 'axe' }).attacks).toHaveLength(0);
  });
});

describe('the sheet resolves traits instead of rendering a stored string', () => {
  it('calls pf2ResolveStrike', () => {
    // Via `pf2ResolveStrikeInPlay`, which wraps `pf2ResolveStrike` and adds the multiple attack
    // penalty and condition modifiers the bare resolver does not know about.
    const resolve = fs.readFileSync(path.join(process.cwd(), 'lib/dnd/systems/pathfinder2e/resolve.ts'), 'utf8');
    expect(sheet).toContain('pf2ResolveStrikeInPlay');
    expect(resolve).toContain('pf2ResolveStrike(');
    expect(sheet).toContain('strike.damage');
  });

  it('surfaces the CRITICAL damage, which is what a player miscomputes by hand', () => {
    // PF2 doubles the whole total and THEN adds deadly/fatal dice.
    expect(sheet).toContain('strike.critDamage');
  });

  it('rolls the resolved expression, not the stored die', () => {
    expect(sheet).toContain("rollDamage(`${a.name} damage`, strike.damage)");
  });

  it('shows the Strikes block to an editor even with no weapons yet', () => {
    // Otherwise the ＋ Weapon button is unreachable for a character who has none.
    expect(sheet).toContain('(pf2.attacks.length > 0 || canDoEdit)');
  });
});

describe('the editor treats traits as mechanics, not decoration', () => {
  it('offers the number-changing traits as controls rather than free text', () => {
    // A typo in "agile" silently disables the weapon's defining property.
    expect(editor).toContain('MECHANICAL_TRAITS');
    expect(editor).toContain('DIE_TRAITS');
    for (const t of ['agile', 'finesse', 'deadly', 'fatal', 'two-hand']) {
      expect(editor, `${t} should be offered`).toContain(t);
    }
  });

  it('takes the BASE die, leaving striking and two-hand to the resolver', () => {
    expect(editor).toContain('Base die');
    expect(editor).toContain('striking');
  });

  it('validates the die format before saving', () => {
    // Asserted by behaviour rather than by matching the regex literal — a regex that matches a
    // regex is unreadable and breaks on any equivalent rewrite.
    expect(editor).toContain('const canSave');
    expect(editor).toContain('.test(damage.trim())');
    expect(editor).toContain('if (!canSave) return');
  });

  it('accepts a flat-damage weapon, since some PF2 weapons have no die', () => {
    // The blowgun deals exactly 1 piercing. A die-only validator would reject it, and the Strike
    // resolver already handles the flat case.
    expect(editor).toContain('^\\d+$');
  });
});

// __tests__/dnd/sheet-edits.test.ts — structured sheet edits (Phase I2).
import { describe, it, expect } from 'vitest';
import { applySheetEdits, editPath, type SheetEdit } from '@/lib/dnd/sheet-edits';
import { blankCharacter } from '@/app/dnd/_sheet/data/blank';

describe('applySheetEdits', () => {
  it('sets meta, level, abilities, and combat', () => {
    const out = applySheetEdits(blankCharacter('X'), [
      { op: 'set_name', value: 'Bandit Captain' },
      { op: 'set_meta', field: 'species', value: 'Human' },
      { op: 'set_level', value: 4 },
      { op: 'set_ability', ability: 'str', value: 16 },
      { op: 'set_combat', field: 'ac', value: 15 },
      { op: 'set_combat', field: 'maxHp', value: 30 },
    ]);
    expect(out.meta.name).toBe('Bandit Captain');
    expect(out.meta.species).toBe('Human');
    expect(out.meta.level).toBe(4);
    expect(out.abilities.str).toBe(16);
    expect(out.combat.ac).toBe(15);
    expect(out.combat.maxHp).toBe(30);
  });

  it('clamps ability scores and level to valid ranges', () => {
    const out = applySheetEdits(blankCharacter('X'), [
      { op: 'set_ability', ability: 'dex', value: 99 },
      { op: 'set_level', value: 40 },
    ]);
    expect(out.abilities.dex).toBe(30);
    expect(out.meta.level).toBe(20);
  });

  it('adds attacks, dedupes by name, and removes them', () => {
    let out = applySheetEdits(blankCharacter('X'), [
      { op: 'add_attack', name: 'Scimitar', ability: 'dex', damage: '1d6', damageType: 'slashing' },
      { op: 'add_attack', name: 'Scimitar', ability: 'dex', damage: '2d6', damageType: 'slashing' }, // replaces
    ]);
    expect(out.attacks).toHaveLength(1);
    expect(out.attacks[0].damage).toBe('2d6');
    expect(out.attacks[0].proficient).toBe(true);
    out = applySheetEdits(out, [{ op: 'remove_attack', name: 'scimitar' }]); // case-insensitive
    expect(out.attacks).toHaveLength(0);
  });

  it('adds a save proficiency, skill, feature, item, and resource', () => {
    const out = applySheetEdits(blankCharacter('X'), [
      { op: 'set_save_proficient', ability: 'con', value: true },
      { op: 'set_skill', skill: 'stealth', prof: 'proficient' },
      { op: 'add_feature', name: 'Multiattack', source: 'Class', body: ['Attacks twice.'] },
      { op: 'add_item', name: 'Potion of Healing', qty: 2 },
      { op: 'add_resource', name: 'Rage', max: 3, color: 'pink', resetOn: 'long' },
    ]);
    expect(out.saves.con.proficient).toBe(true);
    expect(out.skills.stealth.prof).toBe('proficient');
    expect(out.features.some((f) => f.name === 'Multiattack')).toBe(true);
    expect(out.inventory.find((i) => i.name === 'Potion of Healing')?.qty).toBe(2);
    expect(out.resources.find((r) => r.name === 'Rage')?.current).toBe(3);
  });

  it('does not mutate the input character', () => {
    const base = blankCharacter('X');
    applySheetEdits(base, [{ op: 'set_ability', ability: 'str', value: 20 }]);
    expect(base.abilities.str).toBe(10);
  });

  describe('rename_* preserves every other field (the stat-loss fix)', () => {
    // The bug this closes: with no rename op, the AI renamed by remove + re-add, which dropped
    // every field it wasn't re-supplied — a "Backless Park Bench" renamed to "Park Bench" lost its
    // ability (→ -NaN to-hit), range and notes; an item lost its tags.
    function withContent() {
      const c = blankCharacter('X');
      c.attacks = [{ id: 'pb', name: 'Backless Park Bench', ability: 'str', proficient: true, range: 'Melee (reach 5 ft)', damage: '1d8', damageType: 'bludgeoning', strMelee: true, notes: 'the bench' }] as typeof c.attacks;
      c.features = [{ id: 'f1', name: 'Living Momentum', source: 'Ragnar', body: ['a stacking bonus'], unlockLevel: 1 }] as typeof c.features;
      c.inventory = [{ id: 'bench', name: 'Backless Park Bench', desc: 'a heavy bench', qty: 1, tags: ['weapon', 'flavor'] }] as typeof c.inventory;
      return c;
    }

    it('rename_attack changes only the name', () => {
      const out = applySheetEdits(withContent(), [{ op: 'rename_attack', name: 'Backless Park Bench', to: 'Park Bench' }]);
      const a = out.attacks.find((x) => x.name === 'Park Bench')!;
      expect(a).toBeTruthy();
      expect(a.ability).toBe('str');       // NOT dropped → no -NaN
      expect(a.range).toBe('Melee (reach 5 ft)');
      expect(a.damage).toBe('1d8');
      expect(a.notes).toBe('the bench');
      expect(out.attacks.some((x) => x.name === 'Backless Park Bench')).toBe(false);
    });

    it('rename_item keeps tags and description', () => {
      const out = applySheetEdits(withContent(), [{ op: 'rename_item', name: 'Backless Park Bench', to: 'Park Bench' }]);
      const i = out.inventory.find((x) => x.name === 'Park Bench')!;
      expect(i.tags).toEqual(['weapon', 'flavor']);
      expect(i.desc).toBe('a heavy bench');
    });

    it('rename_feature keeps source and body', () => {
      const out = applySheetEdits(withContent(), [{ op: 'rename_feature', name: 'Living Momentum', to: 'Momentum' }]);
      const f = out.features.find((x) => x.name === 'Momentum')!;
      expect(f.source).toBe('Ragnar');
      expect(f.body).toEqual(['a stacking bonus']);
    });

    it('a blank new name is a no-op rather than erasing the row', () => {
      const out = applySheetEdits(withContent(), [{ op: 'rename_attack', name: 'Backless Park Bench', to: '   ' }]);
      expect(out.attacks.find((x) => x.name === 'Backless Park Bench')).toBeTruthy();
    });

    it('renaming a missing element changes nothing', () => {
      const before = withContent();
      const out = applySheetEdits(before, [{ op: 'rename_item', name: 'Nonexistent', to: 'Whatever' }]);
      expect(out.inventory.map((i) => i.name)).toEqual(before.inventory.map((i) => i.name));
    });
  });
});

describe('editPath', () => {
  it('maps edits to audit paths', () => {
    const cases: [SheetEdit, string][] = [
      [{ op: 'set_ability', ability: 'str', value: 16 }, 'abilities.str'],
      [{ op: 'set_combat', field: 'ac', value: 15 }, 'combat.ac'],
      [{ op: 'add_attack', name: 'Great Axe', ability: 'str', damage: '1d12' }, 'attacks[great-axe]'],
      [{ op: 'rename_attack', name: 'Great Axe', to: 'Axe' }, 'attacks[great-axe]'],
      [{ op: 'rename_item', name: 'Park Bench', to: 'Bench' }, 'inventory[park-bench]'],
    ];
    for (const [edit, path] of cases) expect(editPath(edit)).toBe(path);
  });
});

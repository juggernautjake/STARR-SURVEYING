// __tests__/dnd/sheet-edits.test.ts — structured sheet edits (Phase I2).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { applySheetEdits, editPath, editOldValue, revertSheetEdit, SHEET_EDIT_TOOL, type SheetEdit } from '@/lib/dnd/sheet-edits';
import { blankCharacter } from '@/app/dnd/_sheet/data/blank';
import { EFFECT_OPERATIONS } from '@/app/dnd/_sheet/engine/effects';

describe('the AI edit_sheet tool schema stays in sync with the effect registry', () => {
  // Appendix A / C: the AI's tool schema is meant to be GENERATED from the effect vocabulary, not a
  // hand-written list that drifts. It had: it listed grant_sense (a TARGET) as an operation and omitted
  // condition_advantage (a real operation), so the AI couldn't emit a Dwarven-Resilience item. The
  // operation list is now built from EFFECT_OPERATIONS; this guards it against being re-hardcoded.
  const schemaStr = JSON.stringify(SHEET_EDIT_TOOL);
  it('the effects description lists exactly the engine operations', () => {
    expect(schemaStr).toContain(EFFECT_OPERATIONS.join('|'));
  });
  it('includes every operation individually (incl. condition_advantage, the one that was missing)', () => {
    for (const op of EFFECT_OPERATIONS) {
      expect(schemaStr, `operation "${op}" missing from the AI tool schema`).toContain(op);
    }
  });
});

describe('every edit op can be reverted (undo, user request)', () => {
  it('reverting define_tag drops the tag it created — was an unrevertable op', () => {
    const base = blankCharacter('X');
    const edit: SheetEdit = { op: 'define_tag', name: 'psionic', desc: 'A mind power' };
    const oldValue = editOldValue(base, edit); // null — a create
    const applied = applySheetEdits(base, [edit]);
    expect((applied.customTags ?? []).some((t) => t.name === 'psionic')).toBe(true);
    const reverted = revertSheetEdit(applied, edit, oldValue);
    expect((reverted.customTags ?? []).some((t) => t.name === 'psionic')).toBe(false);
  });

  it('reverting a set_meta that FILLED an empty field clears it again (not left stranded)', () => {
    const base = blankCharacter('X');
    // Alignment starts unset; the AI sets it, then the user undoes.
    const edit: SheetEdit = { op: 'set_meta', field: 'alignment', value: 'Lawful Good' };
    const oldValue = editOldValue(base, edit); // null — the field was unset
    const applied = applySheetEdits(base, [edit]);
    expect(applied.meta.alignment).toBe('Lawful Good');
    const reverted = revertSheetEdit(applied, edit, oldValue);
    expect(reverted.meta.alignment ?? '').toBe(''); // cleared, not left as "Lawful Good"
  });

  it('revertSheetEdit has a case for EVERY op the tool schema offers (no silent no-op undo)', () => {
    // A missing case makes an edit unrevertable — exactly the define_tag gap. Guard it against the next op.
    const ops = (SHEET_EDIT_TOOL.input_schema as { properties: { edits: { items: { properties: { op: { enum: string[] } } } } } })
      .properties.edits.items.properties.op.enum;
    const src = fs.readFileSync(path.join(process.cwd(), 'lib/dnd/sheet-edits.ts'), 'utf8');
    const body = src.slice(src.indexOf('export function revertSheetEdit'), src.indexOf('export interface AuditedEdit'));
    for (const op of ops) {
      expect(body.includes(`case '${op}'`), `revertSheetEdit has no case for "${op}" — it would undo to a no-op`).toBe(true);
    }
  });

  it('applySheetEdits has a case for EVERY op the tool schema offers (no silent no-op EDIT)', () => {
    // The apply-path twin of the revert guard, and the more important one: an op the AI is OFFERED (the
    // tool-schema enum) but that applySheetEdits doesn't handle reports success while changing NOTHING —
    // it breaks the "the AI can actually edit everything on the sheet" promise. The TS `never` guard in
    // applySheetEdits covers union↔handler drift; this covers tool-schema↔handler drift (a separate object).
    const ops = (SHEET_EDIT_TOOL.input_schema as { properties: { edits: { items: { properties: { op: { enum: string[] } } } } } })
      .properties.edits.items.properties.op.enum;
    const src = fs.readFileSync(path.join(process.cwd(), 'lib/dnd/sheet-edits.ts'), 'utf8');
    const body = src.slice(src.indexOf('export function applySheetEdits'), src.indexOf('export function validateSheetEdits'));
    for (const op of ops) {
      expect(body.includes(`case '${op}'`), `applySheetEdits has no case for "${op}" — the AI's edit would silently do nothing`).toBe(true);
    }
  });
});

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

  it('never mutates the input across nested-field AND array ops (guards the input deep-clone)', () => {
    // applySheetEdits deep-clones input (structuredClone), so it's non-mutating by construction — but that
    // is the WHOLE guarantee: if the clone ever regressed to a shallow `{ ...input }`, the nested-field ops
    // (set_meta → c.meta.*, set_combat → c.combat.*) would mutate the caller while the array ops stay safe.
    // The set_ability test above touches one field; this deep-equals the WHOLE input across a broad batch.
    const base = blankCharacter('Immutable');
    const before = structuredClone(base);
    applySheetEdits(base, [
      { op: 'set_name', value: 'New Name' },
      { op: 'set_meta', field: 'background', value: 'Soldier' },
      { op: 'set_level', value: 5 },
      { op: 'set_combat', field: 'ac', value: 18 },
      { op: 'set_ability', ability: 'str', value: 20 },
      { op: 'add_attack', name: 'Bow' },
      { op: 'add_feature', name: 'Second Wind' },
      { op: 'add_item', name: 'Rope' },
      { op: 'add_resource', name: 'Ki', max: 3 },
    ] as SheetEdit[]);
    expect(base).toEqual(before); // the entire input character, untouched
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

  describe('the AI can define + apply custom tags (Slice 32)', () => {
    function withItem() {
      const c = blankCharacter('X');
      c.inventory = [{ id: 'i1', name: 'Cursed Blade', desc: '', qty: 1, tags: [] }] as typeof c.inventory;
      return c;
    }

    it('define_tag adds a defined tag to the character', () => {
      const out = applySheetEdits(withItem(), [{ op: 'define_tag', name: 'cursed', desc: 'Cannot be removed without a Remove Curse.' }]);
      expect(out.customTags).toEqual([{ name: 'cursed', description: 'Cannot be removed without a Remove Curse.' }]);
    });

    it('refuses an undefined tag and a reserved name', () => {
      // The definition is required — an undefined tag recreates the "what does FLAVOR mean?" problem.
      const noDesc = applySheetEdits(withItem(), [{ op: 'define_tag', name: 'cursed', desc: '' }]);
      expect(noDesc.customTags ?? []).toEqual([]);
      // weapon/consumable/equipped are wiring, not labels.
      const reserved = applySheetEdits(withItem(), [{ op: 'define_tag', name: 'weapon', desc: 'looks dangerous' }]);
      expect(reserved.customTags ?? []).toEqual([]);
    });

    it('tag_item applies a tag to the named item', () => {
      const out = applySheetEdits(withItem(), [{ op: 'tag_item', name: 'Cursed Blade', tag: 'cursed' }]);
      expect(out.inventory.find((i) => i.name === 'Cursed Blade')?.tags).toContain('cursed');
    });

    it('tag_item never applies a reserved wiring tag, and never duplicates', () => {
      const out1 = applySheetEdits(withItem(), [{ op: 'tag_item', name: 'Cursed Blade', tag: 'weapon' }]);
      expect(out1.inventory[0].tags).not.toContain('weapon'); // weapon is derived from kind, not free-tagged
      const out2 = applySheetEdits(withItem(), [
        { op: 'tag_item', name: 'Cursed Blade', tag: 'flavor' },
        { op: 'tag_item', name: 'Cursed Blade', tag: 'flavor' },
      ]);
      expect(out2.inventory[0].tags.filter((t) => t === 'flavor')).toHaveLength(1);
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

describe('rename_spell / rename_resource complete the "rename anything" surface (Slice 23)', () => {
  function withSpellAndResource() {
    const c = blankCharacter('X');
    c.spells = [{ id: 's1', name: 'Guiding Bolt', level: 1, description: 'a bolt' }] as typeof c.spells;
    c.resources = [{ id: 'r1', name: 'Momentum', max: 4, current: 4, color: 'teal', resetOn: 'long' }] as typeof c.resources;
    return c;
  }

  it('rename_spell changes only the name and marks the spell customized', () => {
    const out = applySheetEdits(withSpellAndResource(), [{ op: 'rename_spell', name: 'Guiding Bolt', to: 'Spotlight' }]);
    const s = out.spells!.find((x) => x.name === 'Spotlight')!;
    expect(s).toBeTruthy();
    expect(s.description).toBe('a bolt'); // kept
    expect(s.customized).toBe(true);
    expect(out.spells!.some((x) => x.name === 'Guiding Bolt')).toBe(false);
  });

  it('rename_resource renames the pool, keeping its counts', () => {
    const out = applySheetEdits(withSpellAndResource(), [{ op: 'rename_resource', name: 'Momentum', to: 'Rage' }]);
    const r = out.resources.find((x) => x.name === 'Rage')!;
    expect(r.max).toBe(4);
    expect(r.current).toBe(4);
  });

  it('a blank target name is a no-op (never erases the row)', () => {
    const out = applySheetEdits(withSpellAndResource(), [{ op: 'rename_spell', name: 'Guiding Bolt', to: '  ' }]);
    expect(out.spells!.some((x) => x.name === 'Guiding Bolt')).toBe(true);
  });
});

describe('update_attack retunes an existing attack in place (Slice 23 — "change the damage die")', () => {
  function withSword() {
    const c = blankCharacter('X');
    c.attacks = [{ id: 'sw', name: 'Sword', ability: 'str', proficient: true, range: 'Melee (5 ft)', damage: '1d8', damageType: 'slashing', notes: 'the sword' }] as typeof c.attacks;
    return c;
  }
  it('changes only the named field, keeps the rest, marks ✎', () => {
    const out = applySheetEdits(withSword(), [{ op: 'update_attack', name: 'Sword', damage: '1d12' }]);
    const a = out.attacks[0];
    expect(a.damage).toBe('1d12');
    expect(a.range).toBe('Melee (5 ft)'); // kept
    expect(a.notes).toBe('the sword');    // kept
    expect(a.ability).toBe('str');        // kept — no -NaN
    expect(a.customized).toBe(true);
  });
  it('a no-op update on a missing attack changes nothing', () => {
    const before = withSword();
    const out = applySheetEdits(before, [{ op: 'update_attack', name: 'Nonexistent', damage: '2d6' }]);
    expect(out.attacks[0].damage).toBe('1d8');
  });
});

describe('editOldValue captures the prior value for the audit trail (Slice 26)', () => {
  it('reads the pre-edit value for scalar ops', () => {
    const c = blankCharacter('X');
    c.abilities = { ...c.abilities, str: 14 };
    c.combat = { ...c.combat, ac: 15 };
    expect(editOldValue(c, { op: 'set_ability', ability: 'str', value: 20 })).toBe(14);
    expect(editOldValue(c, { op: 'set_combat', field: 'ac', value: 18 })).toBe(15);
    expect(editOldValue(c, { op: 'set_name', value: 'Y' })).toBe('X');
  });

  it('returns the whole prior element for a rename/update, so Revert is exact', () => {
    const c = blankCharacter('X');
    c.attacks = [{ id: 'a', name: 'Sword', ability: 'str', proficient: true, range: 'melee', damage: '1d8', damageType: 'slashing' }] as typeof c.attacks;
    const old = editOldValue(c, { op: 'update_attack', name: 'Sword', damage: '1d12' }) as { name: string; damage: string } | null;
    expect(old?.name).toBe('Sword');
    expect(old?.damage).toBe('1d8'); // the prior die, to restore on revert
  });

  it('returns null for creates and unknown targets', () => {
    const c = blankCharacter('X');
    expect(editOldValue(c, { op: 'add_attack', name: 'New', ability: 'str', damage: '1d6' })).toBeNull();
    expect(editOldValue(c, { op: 'define_tag', name: 'cursed', desc: 'x' })).toBeNull();
  });
});

describe('revertSheetEdit undoes an edit exactly (Slice 26 — the round-trip property)', () => {
  function rich() {
    const c = blankCharacter('Hero');
    c.abilities = { ...c.abilities, str: 14 };
    c.combat = { ...c.combat, ac: 15 };
    c.attacks = [{ id: 'sw', name: 'Sword', ability: 'str', proficient: true, range: 'melee', damage: '1d8', damageType: 'slashing', notes: 'keen' }] as typeof c.attacks;
    c.inventory = [{ id: 'cl', name: 'Cloak', desc: 'grey', qty: 1, tags: ['flavor'] }] as typeof c.inventory;
    c.features = [{ id: 'f', name: 'Rage', source: 'Class', body: ['angry'], unlockLevel: 1 }] as typeof c.features;
    c.spells = [{ id: 'sp', name: 'Bless', level: 1, description: 'blessed' }] as typeof c.spells;
    c.resources = [{ id: 'r', name: 'Ki', max: 3, current: 3, color: 'teal', resetOn: 'short' }] as typeof c.resources;
    return c;
  }

  // apply → capture old_value → revert → the affected data equals the original.
  const cases: { label: string; edit: SheetEdit; probe: (c: ReturnType<typeof rich>) => unknown }[] = [
    { label: 'set_ability', edit: { op: 'set_ability', ability: 'str', value: 20 }, probe: (c) => c.abilities.str },
    { label: 'set_combat', edit: { op: 'set_combat', field: 'ac', value: 18 }, probe: (c) => c.combat.ac },
    { label: 'set_name', edit: { op: 'set_name', value: 'Villain' }, probe: (c) => c.meta.name },
    { label: 'update_attack', edit: { op: 'update_attack', name: 'Sword', damage: '1d12' }, probe: (c) => c.attacks[0]?.damage },
    { label: 'rename_attack', edit: { op: 'rename_attack', name: 'Sword', to: 'Blade' }, probe: (c) => c.attacks[0]?.name },
    { label: 'rename_item', edit: { op: 'rename_item', name: 'Cloak', to: 'Robe' }, probe: (c) => c.inventory[0]?.name },
    { label: 'rename_feature', edit: { op: 'rename_feature', name: 'Rage', to: 'Fury' }, probe: (c) => c.features[0]?.name },
    { label: 'rename_spell', edit: { op: 'rename_spell', name: 'Bless', to: 'Boon' }, probe: (c) => c.spells![0]?.name },
    { label: 'rename_resource', edit: { op: 'rename_resource', name: 'Ki', to: 'Focus' }, probe: (c) => c.resources[0]?.name },
  ];

  for (const { label, edit, probe } of cases) {
    it(`${label}: apply then revert restores the value`, () => {
      const before = rich();
      const original = probe(before);
      const old = editOldValue(before, edit);
      const applied = applySheetEdits(before, [edit]);
      expect(probe(applied)).not.toBe(original); // the edit actually changed it
      const reverted = revertSheetEdit(applied, edit, old);
      expect(probe(reverted)).toBe(original);    // ...and revert brought it back
    });
  }

  it('reverting an ADD removes the created element', () => {
    const before = rich();
    const edit: SheetEdit = { op: 'add_attack', name: 'Dagger', ability: 'dex', damage: '1d4' };
    const old = editOldValue(before, edit); // null — it's new
    const applied = applySheetEdits(before, [edit]);
    expect(applied.attacks.some((a) => a.name === 'Dagger')).toBe(true);
    const reverted = revertSheetEdit(applied, edit, old);
    expect(reverted.attacks.some((a) => a.name === 'Dagger')).toBe(false);
  });

  it('reverting a rename also restores every other field the element carried', () => {
    const before = rich();
    const edit: SheetEdit = { op: 'rename_attack', name: 'Sword', to: 'Blade' };
    const old = editOldValue(before, edit);
    const reverted = revertSheetEdit(applySheetEdits(before, [edit]), edit, old);
    const a = reverted.attacks[0];
    expect(a.name).toBe('Sword');
    expect(a.notes).toBe('keen'); // the whole prior element came back, not just the name
  });
});

describe('add_spell / remove_spell — the AI can build spells directly (not just grant via items)', () => {
  it('adds a full spell (level, school, resolution) to char.spells, upserting by name', () => {
    const out = applySheetEdits(blankCharacter('X'), [
      { op: 'add_spell', name: 'Frost Lance', level: 2, school: 'Evocation', castTime: '1 action', range: '60 feet', components: 'V, S', duration: 'Instantaneous', description: 'A spear of ice. On a hit, deal 3d8 cold damage and the target is Slowed.', attack: true, higher: '+1d8 per slot above 2nd.' },
    ]);
    const s = (out.spells ?? []).find((x) => x.name === 'Frost Lance');
    expect(s).toBeTruthy();
    expect(s!.level).toBe(2);
    expect(s!.school).toBe('Evocation');
    expect(s!.attack).toBe(true);
    expect(s!.prepared).toBe(true); // usable immediately by default
    // a second add_spell of the same name replaces (upsert), not duplicates
    const out2 = applySheetEdits(out, [{ op: 'add_spell', name: 'frost lance', level: 3, description: 'Bigger.' }]);
    expect((out2.spells ?? []).filter((x) => x.name.toLowerCase() === 'frost lance')).toHaveLength(1);
    expect((out2.spells ?? []).find((x) => x.name.toLowerCase() === 'frost lance')!.level).toBe(3);
  });

  it('clamps level to 0..9 and remove_spell drops it', () => {
    let out = applySheetEdits(blankCharacter('X'), [{ op: 'add_spell', name: 'Overcast', level: 99, description: 'x' }]);
    expect((out.spells ?? []).find((x) => x.name === 'Overcast')!.level).toBe(9);
    out = applySheetEdits(out, [{ op: 'remove_spell', name: 'overcast' }]);
    expect((out.spells ?? []).some((x) => x.name === 'Overcast')).toBe(false);
  });

  it('revert undoes an add_spell (drops it) and restores a removed spell', () => {
    const base = blankCharacter('X');
    const added = applySheetEdits(base, [{ op: 'add_spell', name: 'Ward', level: 1, description: 'Shield.' }]);
    const addEdit: SheetEdit = { op: 'add_spell', name: 'Ward', level: 1, description: 'Shield.' };
    const reverted = revertSheetEdit(added, addEdit, editOldValue(base, addEdit));
    expect((reverted.spells ?? []).some((x) => x.name === 'Ward')).toBe(false);
    // removing then reverting restores the exact spell
    const removeEdit: SheetEdit = { op: 'remove_spell', name: 'Ward' };
    const old = editOldValue(added, removeEdit);
    const afterRemove = applySheetEdits(added, [removeEdit]);
    const restored = revertSheetEdit(afterRemove, removeEdit, old);
    expect((restored.spells ?? []).find((x) => x.name === 'Ward')?.description).toBe('Shield.');
  });
});

describe('add_condition / remove_condition — the AI can apply conditions (incl. custom ones)', () => {
  it('adds a condition (dedup, case-insensitive) and removes it', () => {
    let out = applySheetEdits(blankCharacter('X'), [{ op: 'add_condition', name: 'Poisoned' }]);
    expect(out.combat.conditions).toContain('Poisoned');
    // dedup — adding again (any case) doesn't duplicate
    out = applySheetEdits(out, [{ op: 'add_condition', name: 'poisoned' }]);
    expect((out.combat.conditions ?? []).filter((c) => c.toLowerCase() === 'poisoned')).toHaveLength(1);
    // a custom/homebrew condition works too
    out = applySheetEdits(out, [{ op: 'add_condition', name: 'Star-Cursed' }]);
    expect(out.combat.conditions).toContain('Star-Cursed');
    out = applySheetEdits(out, [{ op: 'remove_condition', name: 'POISONED' }]);
    expect(out.combat.conditions).not.toContain('Poisoned');
    expect(out.combat.conditions).toContain('Star-Cursed');
  });

  it('revert restores the exact prior conditions', () => {
    const base = applySheetEdits(blankCharacter('X'), [{ op: 'add_condition', name: 'Prone' }]);
    const addEdit: SheetEdit = { op: 'add_condition', name: 'Frightened' };
    const old = editOldValue(base, addEdit);
    const added = applySheetEdits(base, [addEdit]);
    expect(added.combat.conditions).toContain('Frightened');
    const reverted = revertSheetEdit(added, addEdit, old);
    expect(reverted.combat.conditions).toEqual(['Prone']); // Frightened gone, Prone kept
  });
});

describe('add_currency / set_currency / remove_currency — the AI can manage money (Area C)', () => {
  it('adds a custom currency with a rate, matched later by name or abbrev', () => {
    const out = applySheetEdits(blankCharacter('X'), [
      { op: 'add_currency', name: 'Guild Mark', abbrev: 'gm', amount: 4, rate: 500 },
    ]);
    const gm = (out.currencies ?? []).find((c) => c.name === 'Guild Mark');
    expect(gm).toMatchObject({ name: 'Guild Mark', abbrev: 'gm', amount: 4, rate: 500 });
    // set_currency finds it by abbreviation and bumps the amount + rate
    const out2 = applySheetEdits(out, [{ op: 'set_currency', currency: 'gm', amount: 6, rate: 600 }]);
    const gm2 = (out2.currencies ?? []).find((c) => c.name === 'Guild Mark')!;
    expect(gm2.amount).toBe(6);
    expect(gm2.rate).toBe(600);
  });

  it('add_currency upserts by name (default amount 0, rate 1) and remove_currency drops it', () => {
    let out = applySheetEdits(blankCharacter('X'), [{ op: 'add_currency', name: 'Shards' }]);
    const s = (out.currencies ?? []).find((c) => c.name === 'Shards')!;
    expect(s.amount).toBe(0);
    expect(s.rate).toBe(1);
    out = applySheetEdits(out, [{ op: 'add_currency', name: 'shards', amount: 10 }]); // upsert, not dup
    expect((out.currencies ?? []).filter((c) => c.name.toLowerCase() === 'shards')).toHaveLength(1);
    out = applySheetEdits(out, [{ op: 'remove_currency', currency: 'Shards' }]);
    expect((out.currencies ?? []).some((c) => c.name === 'Shards')).toBe(false);
  });

  it('revert restores a removed currency and drops an added one', () => {
    const base = applySheetEdits(blankCharacter('X'), [{ op: 'add_currency', name: 'Ducats', amount: 7, rate: 50 }]);
    // remove → revert restores it exactly
    const removeEdit: SheetEdit = { op: 'remove_currency', currency: 'Ducats' };
    const old = editOldValue(base, removeEdit);
    const afterRemove = applySheetEdits(base, [removeEdit]);
    const restored = revertSheetEdit(afterRemove, removeEdit, old);
    expect((restored.currencies ?? []).find((c) => c.name === 'Ducats')).toMatchObject({ amount: 7, rate: 50 });
    // add → revert drops it
    const addEdit: SheetEdit = { op: 'add_currency', name: 'Florins', amount: 3 };
    const added = applySheetEdits(base, [addEdit]);
    const reverted = revertSheetEdit(added, addEdit, editOldValue(base, addEdit));
    expect((reverted.currencies ?? []).some((c) => c.name === 'Florins')).toBe(false);
  });
});

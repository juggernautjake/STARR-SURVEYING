// __tests__/dnd/ig-edit.test.ts — the pure incremental edit ops for an IG character (enter/leave a stance,
// apply/remove a condition), plus the route wiring (source-anchored). IG buildout B6.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { applyIgEdit, parseIgEdit, describeIgEdit, IG_EDIT_OPS } from '@/lib/dnd/systems/intuitive-games/edit';
import { blankIGCharacter } from '@/lib/dnd/systems/intuitive-games/model';

const base = () => {
  const ig = blankIGCharacter('Test IG');
  ig.combat.conditions = ['Prone'];
  ig.combat.stances = ['Defensive'];
  return ig;
};

describe('applyIgEdit — stances (one active at a time)', () => {
  it('set_active_stance replaces the current stance', () => {
    const out = applyIgEdit(base(), { op: 'set_active_stance', name: 'Offensive' });
    expect(out.combat.stances).toEqual(['Offensive']);
  });
  it('clear_stance empties the active stance', () => {
    const out = applyIgEdit(base(), { op: 'clear_stance' });
    expect(out.combat.stances).toEqual([]);
  });
  it('does not mutate the input character', () => {
    const ig = base();
    applyIgEdit(ig, { op: 'set_active_stance', name: 'Menacing' });
    expect(ig.combat.stances).toEqual(['Defensive']); // original unchanged
  });

  it('never mutates the input for the ARRAY-appending ops either (guards the shallow `combat` copy)', () => {
    // applyIgEdit shallow-copies combat (`{ ...ig.combat }`), so combat.conditions/etc. ALIAS the input's
    // arrays. The impl appends via spread (`[...arr, x]`), not push — but a future "optimize to push" would
    // silently mutate the caller's character. The stance test above only covers a whole-array replace;
    // this deep-equals the WHOLE input before/after across every array-touching + field-setting op.
    const check = (apply: (ig: ReturnType<typeof base>) => void) => {
      const ig = base();
      const before = structuredClone(ig);
      apply(ig);
      expect(ig).toEqual(before);
    };
    check((ig) => applyIgEdit(ig, { op: 'add_condition', name: 'Shaken' }));
    check((ig) => applyIgEdit(ig, { op: 'remove_condition', name: 'Prone' }));
    check((ig) => applyIgEdit(ig, { op: 'add_feat', name: 'Cleave' }));
    check((ig) => applyIgEdit(ig, { op: 'add_power', name: 'Elemental Blast' }));
    check((ig) => applyIgEdit(ig, { op: 'set_defensive_power', name: 'Sidestep' }));
  });
});

describe('applyIgEdit — conditions', () => {
  it('add_condition appends a new condition, case-insensitively de-duped', () => {
    const out = applyIgEdit(base(), { op: 'add_condition', name: 'Shaken' });
    expect(out.combat.conditions).toEqual(['Prone', 'Shaken']);
    // adding one already present (different case) is a no-op
    const same = applyIgEdit(out, { op: 'add_condition', name: 'shaken' });
    expect(same.combat.conditions).toEqual(['Prone', 'Shaken']);
  });
  it('remove_condition drops it case-insensitively', () => {
    const out = applyIgEdit(base(), { op: 'remove_condition', name: 'prone' });
    expect(out.combat.conditions).toEqual([]);
  });
  it('an empty name is a no-op, never corrupting the list', () => {
    const out = applyIgEdit(base(), { op: 'add_condition', name: '  ' });
    expect(out.combat.conditions).toEqual(['Prone']);
  });
});

describe('applyIgEdit — feats', () => {
  it('add_feat routes a Combat feat to feats.combat and a General feat to feats.general', () => {
    const ig = base();
    const combat = applyIgEdit(ig, { op: 'add_feat', name: 'Cleave' }); // Cleave is a Combat feat
    expect(combat.feats.combat).toContain('Cleave');
    expect(combat.feats.general).not.toContain('Cleave');
    const general = applyIgEdit(ig, { op: 'add_feat', name: 'Fleet' }); // Fleet is a General feat
    expect(general.feats.general).toContain('Fleet');
  });
  it('a custom/unknown feat defaults to the General list', () => {
    const out = applyIgEdit(base(), { op: 'add_feat', name: 'My Homebrew Feat' });
    expect(out.feats.general).toContain('My Homebrew Feat');
  });
  it('add_feat de-dupes across both lists (case-insensitive); remove_feat clears from either', () => {
    let ig = applyIgEdit(base(), { op: 'add_feat', name: 'Toughness' });
    ig = applyIgEdit(ig, { op: 'add_feat', name: 'toughness' }); // no dup
    expect([...ig.feats.general, ...ig.feats.combat].filter((f) => f.toLowerCase() === 'toughness')).toHaveLength(1);
    const removed = applyIgEdit(ig, { op: 'remove_feat', name: 'TOUGHNESS' });
    expect([...removed.feats.general, ...removed.feats.combat].some((f) => f.toLowerCase() === 'toughness')).toBe(false);
  });
  it('add_power appends + de-dupes (case-insensitive); remove_power clears it', () => {
    let ig = applyIgEdit(base(), { op: 'add_power', name: 'Mirror Image' });
    expect(ig.powers).toContain('Mirror Image');
    ig = applyIgEdit(ig, { op: 'add_power', name: 'mirror image' }); // no dup
    expect(ig.powers.filter((p) => p.toLowerCase() === 'mirror image')).toHaveLength(1);
    const removed = applyIgEdit(ig, { op: 'remove_power', name: 'MIRROR IMAGE' });
    expect(removed.powers.some((p) => p.toLowerCase() === 'mirror image')).toBe(false);
  });
});

describe('applyIgEdit — defensive power (single slot)', () => {
  it('set_defensive_power sets the slot, and replaces an existing one', () => {
    const set = applyIgEdit(base(), { op: 'set_defensive_power', name: 'Sidestep' });
    expect(set.combat.defensivePower).toBe('Sidestep');
    const replaced = applyIgEdit(set, { op: 'set_defensive_power', name: 'Counterattack' });
    expect(replaced.combat.defensivePower).toBe('Counterattack');
  });
  it('an empty name clears the slot', () => {
    const set = applyIgEdit(base(), { op: 'set_defensive_power', name: 'Redirect' });
    const cleared = applyIgEdit(set, { op: 'set_defensive_power', name: '' });
    expect(cleared.combat.defensivePower).toBe('');
  });
  it('parseIgEdit accepts an empty name for set_defensive_power (that is the clear)', () => {
    expect(parseIgEdit({ op: 'set_defensive_power' })).toHaveProperty('edit');
    expect(parseIgEdit({ op: 'set_defensive_power', name: 'Sidestep' })).toEqual({ edit: { op: 'set_defensive_power', name: 'Sidestep' } });
  });
});

describe('parseIgEdit', () => {
  it('accepts every valid op and rejects unknown ones', () => {
    for (const op of IG_EDIT_OPS) {
      // HP ops carry `amount`; the rest carry `name` (clear_stance carries neither).
      const payload = op === 'apply_damage' || op === 'heal'
        ? { op, amount: 5 }
        : { op, name: op === 'clear_stance' ? undefined : 'Shaken' };
      const r = parseIgEdit(payload);
      expect('edit' in r).toBe(true);
    }
    expect(parseIgEdit({ op: 'delete_everything', name: 'x' })).toHaveProperty('error');
  });
  it('requires a name for the name-bearing ops', () => {
    expect(parseIgEdit({ op: 'add_condition' })).toHaveProperty('error');
    expect(parseIgEdit({ op: 'clear_stance' })).toHaveProperty('edit'); // clear needs no name
  });
  it('applyIgEdit has a case for EVERY op parseIgEdit accepts (no silent no-op edit)', () => {
    // parseIgEdit accepts every IG_EDIT_OPS op; applyIgEdit must APPLY every one, or an accepted op falls
    // through to the default and changes nothing — the AI reports success while the IG sheet is unchanged,
    // breaking "editable for all stances/feats/conditions". The `never` guard in applyIgEdit covers the
    // IGEdit UNION↔handler; this covers IG_EDIT_OPS (the AI-facing op list) ↔ handler.
    const src = fs.readFileSync(path.join(process.cwd(), 'lib/dnd/systems/intuitive-games/edit.ts'), 'utf8');
    const body = src.slice(src.indexOf('export function applyIgEdit'), src.indexOf('export function parseIgEdit'));
    for (const op of IG_EDIT_OPS) {
      expect(body.includes(`case '${op}'`), `applyIgEdit has no case for "${op}" — the AI's IG edit would silently do nothing`).toBe(true);
    }
  });
});

describe('describeIgEdit', () => {
  it('reads out each op for the audit trail', () => {
    expect(describeIgEdit({ op: 'set_active_stance', name: 'Offensive' })).toMatch(/Entered the Offensive Stance/);
    expect(describeIgEdit({ op: 'remove_condition', name: 'Prone' })).toMatch(/Removed the Prone condition/);
  });
});

describe('ig-edit route wiring', () => {
  const SRC = fs.readFileSync(path.join(process.cwd(), 'app/api/dnd/characters/[id]/ig-edit/route.ts'), 'utf8');
  it('is write-gated and runs the pure edit on the IG sidecar', () => {
    expect(SRC).toContain('requireCharacterWrite'); // owner/player/DM only
    expect(SRC).toContain('applyIgEdit(ig, parsed.edit)');
    expect(SRC).toContain('isIGCharacter(ig)'); // rejects non-IG characters
    expect(SRC).toContain("update({ data: nextData })"); // persists the patched sidecar
  });
});

import { igCurrentHp, igMaxHp } from '@/lib/dnd/systems/intuitive-games/rules';

describe('applyIgEdit — HP damage + healing (SQ4)', () => {
  function hero() {
    const ig = blankIGCharacter('HP Test');
    ig.identity = { ...ig.identity, level: 5 };
    ig.abilities = { ...ig.abilities, CON: 12 }; // +1 mod
    ig.combat.hitPoints = { classBackgroundHp: 40, nonlethal: 0, lethal: 0 };
    return ig; // maxHp = 40 + 1*5 = 45
  }
  it('apply_damage raises lethal (currentHp drops), capped so currentHp floors at 0', () => {
    const ig = hero();
    expect(igMaxHp(ig)).toBe(45);
    const hurt = applyIgEdit(ig, { op: 'apply_damage', amount: 12 });
    expect(igCurrentHp(hurt)).toBe(33);
    // overkill caps at 0, never negative
    const downed = applyIgEdit(ig, { op: 'apply_damage', amount: 999 });
    expect(igCurrentHp(downed)).toBe(0);
    // input never mutated
    expect(igCurrentHp(ig)).toBe(45);
  });
  it('nonlethal damage goes to the nonlethal pool, not lethal', () => {
    const out = applyIgEdit(hero(), { op: 'apply_damage', amount: 6, nonlethal: true });
    expect(out.combat.hitPoints.nonlethal).toBe(6);
    expect(igCurrentHp(out)).toBe(45); // lethal HP unchanged
  });
  it('heal removes lethal damage first, then nonlethal, never below 0', () => {
    let ig = hero();
    ig = applyIgEdit(ig, { op: 'apply_damage', amount: 10 });          // lethal 10
    ig = applyIgEdit(ig, { op: 'apply_damage', amount: 4, nonlethal: true }); // nonlethal 4
    const healed = applyIgEdit(ig, { op: 'heal', amount: 12 });        // 10 lethal + 2 nonlethal
    expect(healed.combat.hitPoints.lethal).toBe(0);
    expect(healed.combat.hitPoints.nonlethal).toBe(2);
    expect(igCurrentHp(healed)).toBe(45);
  });
  it('parseIgEdit validates a positive amount + round-trips describe', () => {
    expect(IG_EDIT_OPS).toContain('apply_damage');
    expect(IG_EDIT_OPS).toContain('heal');
    expect(parseIgEdit({ op: 'apply_damage', amount: 0 })).toEqual({ error: expect.stringMatching(/positive "amount"/) });
    expect(parseIgEdit({ op: 'apply_damage', amount: 7, nonlethal: true })).toEqual({ edit: { op: 'apply_damage', amount: 7, nonlethal: true } });
    expect(describeIgEdit({ op: 'apply_damage', amount: 7, nonlethal: true })).toMatch(/7 nonlethal damage/);
    expect(describeIgEdit({ op: 'heal', amount: 5 })).toMatch(/Healed 5 HP/);
  });
});

describe('IG sheet exposes a manual HP damage/heal control (SQ4)', () => {
  const SHEET = fs.readFileSync(path.join(process.cwd(), 'app/dnd/_ui/IGSheet.tsx'), 'utf8');
  it('wires quick damage/heal buttons to the apply_damage/heal ig-edit ops', () => {
    expect(SHEET).toContain("postEdit({ op: 'apply_damage', amount: n })");
    expect(SHEET).toContain("postEdit({ op: 'heal', amount: n })");
    expect(SHEET).toContain('canDoEdit &&'); // only for a viewer who can write
  });
});

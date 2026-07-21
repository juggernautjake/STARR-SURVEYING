// __tests__/dnd/ig-edit-author-ops.test.ts — IG can finally EDIT and AUTHOR (IG-S1).
//
// IG could add catalogued content and remove it, but never CHANGE what it held or author anything
// new — and it had no way to add or edit a weapon at all, so a character's Strikes were fixed at
// build time. The 2024 and PF2 sheets both do all of this.
import { describe, it, expect } from 'vitest';
import { applyIgEdit, parseIgEdit, describeIgEdit, IG_EDIT_OPS, type IGEdit } from '@/lib/dnd/systems/intuitive-games/edit';
import { blankIGCharacter } from '@/lib/dnd/systems/intuitive-games/model';
import type { IGCharacter } from '@/lib/dnd/systems/intuitive-games/model';

const withPower = (): IGCharacter => applyIgEdit(blankIGCharacter('T'), { op: 'add_power', name: 'Elemental Strike' });
const withFeat = (): IGCharacter => applyIgEdit(blankIGCharacter('T'), { op: 'add_feat', name: 'Alertness' });

describe('the ops exist', () => {
  it('registers edit and weapon ops', () => {
    for (const op of ['update_power', 'update_feat', 'add_attack', 'update_attack', 'remove_attack']) {
      expect(IG_EDIT_OPS as readonly string[]).toContain(op);
    }
  });
});

describe('editing a power', () => {
  it('stores overridden rules text in a map beside the list', () => {
    // powers is a bare string[], so there is no per-element object to hang text on.
    const c = applyIgEdit(withPower(), { op: 'update_power', name: 'Elemental Strike', effect: 'My version.' });
    expect(c.customEffects?.['Elemental Strike']).toBe('My version.');
  });

  it('renames in place, keeping list position', () => {
    const start = applyIgEdit(withPower(), { op: 'add_power', name: 'Magic Trick' });
    const c = applyIgEdit(start, { op: 'update_power', name: 'Elemental Strike', to: 'Ember Lash' });
    expect(c.powers).toEqual(['Ember Lash', 'Magic Trick']);
  });

  it('carries the override across a rename', () => {
    const a = applyIgEdit(withPower(), { op: 'update_power', name: 'Elemental Strike', effect: 'x' });
    const b = applyIgEdit(a, { op: 'update_power', name: 'Elemental Strike', to: 'Ember Lash' });
    expect(b.customEffects?.['Ember Lash']).toBe('x');
    expect(b.customEffects?.['Elemental Strike']).toBeUndefined();
  });

  it('carries an offRules marker across a rename too', () => {
    // Editing a DM-granted power must not launder away the record of how it arrived.
    const granted: IGCharacter = { ...withPower(), offRules: { 'Elemental Strike': 'granted by the DM — off-list' } };
    const renamed = applyIgEdit(granted, { op: 'update_power', name: 'Elemental Strike', to: 'Ember Lash' });
    expect(renamed.offRules?.['Ember Lash']).toContain('granted by the DM');
  });

  it('an emptied override CLEARS rather than storing a blank', () => {
    // A blank would render the element as having no rules at all, instead of falling back to its
    // catalogue text.
    const a = applyIgEdit(withPower(), { op: 'update_power', name: 'Elemental Strike', effect: 'x' });
    const b = applyIgEdit(a, { op: 'update_power', name: 'Elemental Strike', effect: '' });
    expect(b.customEffects).toBeUndefined();
  });

  it('never CREATES from an update', () => {
    const before = blankIGCharacter('T');
    expect(applyIgEdit(before, { op: 'update_power', name: 'Ghost', effect: 'x' })).toEqual(before);
  });

  it('does not mutate the input', () => {
    const before = withPower();
    applyIgEdit(before, { op: 'update_power', name: 'Elemental Strike', effect: 'x' });
    expect(before.customEffects).toBeUndefined();
  });
});

describe('editing a feat keeps its category bucket', () => {
  it('renames within the bucket it was in', () => {
    // Remove + re-add would re-derive the bucket from the NEW name and could move a combat feat
    // into general.
    const c = applyIgEdit(withFeat(), { op: 'update_feat', name: 'Alertness', to: 'Watchfulness' });
    const all = [...c.feats.general, ...c.feats.combat];
    expect(all).toContain('Watchfulness');
    expect(all).not.toContain('Alertness');
  });
});

describe('weapons — IG had no way to add or edit one at all', () => {
  it('adds an attack with its fields', () => {
    const c = applyIgEdit(blankIGCharacter('T'), {
      op: 'add_attack', name: 'Cutlass', damage: '1d6', ability: 'DEX', properties: 'finesse', bonusToHit: 1,
    });
    expect(c.combat.attacks[0]).toMatchObject({ name: 'Cutlass', damage: '1d6', ability: 'DEX', bonusToHit: 1 });
  });

  it('defaults sensibly rather than to nothing', () => {
    const c = applyIgEdit(blankIGCharacter('T'), { op: 'add_attack', name: 'Fist' });
    expect(c.combat.attacks[0]).toMatchObject({ ability: 'STR', damage: '1d6', proficient: true });
  });

  it('updates in place and never creates', () => {
    const before = blankIGCharacter('T');
    expect(applyIgEdit(before, { op: 'update_attack', name: 'Ghost', damage: '1d12' })).toEqual(before);
    const withW = applyIgEdit(before, { op: 'add_attack', name: 'Axe', damage: '1d6' });
    expect(applyIgEdit(withW, { op: 'update_attack', name: 'Axe', damage: '1d12' }).combat.attacks[0].damage).toBe('1d12');
  });

  it('removes by name, case-insensitively', () => {
    const withW = applyIgEdit(blankIGCharacter('T'), { op: 'add_attack', name: 'Axe' });
    expect(applyIgEdit(withW, { op: 'remove_attack', name: 'AXE' }).combat.attacks).toHaveLength(0);
  });
});

describe('the parser validates', () => {
  it('requires a name on every new op', () => {
    for (const op of ['update_power', 'update_feat', 'add_attack', 'update_attack', 'remove_attack']) {
      expect('error' in parseIgEdit({ op }), `${op} should require a name`).toBe(true);
    }
  });

  it('forwards an EMPTY effect, because clearing is a real intent', () => {
    // Distinct from omitting the field, which means "leave the override alone".
    const r = parseIgEdit({ op: 'update_power', name: 'X', effect: '' });
    expect('edit' in r && 'effect' in (r.edit as object)).toBe(true);
    const omitted = parseIgEdit({ op: 'update_power', name: 'X' });
    expect('edit' in omitted && 'effect' in (omitted.edit as object)).toBe(false);
  });

  it('ignores an unrecognised ability rather than storing garbage', () => {
    const r = parseIgEdit({ op: 'add_attack', name: 'X', ability: 'LUCK' });
    expect('edit' in r && (r.edit as { ability?: string }).ability).toBeUndefined();
  });

  it('describes each op for the audit trail', () => {
    const cases: IGEdit[] = [
      { op: 'update_power', name: 'P' }, { op: 'update_feat', name: 'F' },
      { op: 'add_attack', name: 'W' }, { op: 'update_attack', name: 'W' }, { op: 'remove_attack', name: 'W' },
    ];
    for (const e of cases) expect(describeIgEdit(e)).not.toBe('No change.');
  });
});

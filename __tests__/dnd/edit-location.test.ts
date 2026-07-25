// __tests__/dnd/edit-location.test.ts — the "what changes, and where do I look?" mapping behind the
// sheet assistant's confirm-before-save proposals. A proposal the player can't verify is worse than no
// proposal, so both halves — the plain-English description and the sheet tab — are pinned here.
import { describe, it, expect } from 'vitest';
import {
  describeEdit, editLocation, editLocations, whereToView, proposalText, pf2EditLocation, igEditLocation,
} from '@/lib/dnd/edit-location';
import type { SheetEdit } from '@/lib/dnd/sheet-edits';

describe('editLocation — every edit names a real sheet tab', () => {
  const cases: [SheetEdit, string][] = [
    [{ op: 'set_name', value: 'Vex' }, 'Overview'],
    [{ op: 'set_level', value: 5 }, 'Overview'],
    [{ op: 'set_ability', ability: 'str', value: 18 }, 'Abilities'],
    [{ op: 'set_skill', skill: 'Stealth', prof: 'proficient' } as SheetEdit, 'Abilities'],
    [{ op: 'set_combat', field: 'ac', value: 17 }, 'Combat'],
    [{ op: 'add_condition', name: 'Poisoned' }, 'Combat'],
    [{ op: 'add_attack', name: 'Longsword', ability: 'str', damage: '1d8' }, 'Attacks'],
    [{ op: 'add_spell', name: 'Fireball', level: 3, description: 'boom' }, 'Spells'],
    [{ op: 'add_feat', feat: 'Alert' }, 'Features'],
    [{ op: 'add_feature', name: 'Rage', body: ['…'] }, 'Features'],
    [{ op: 'add_item', name: 'Rope' } as SheetEdit, 'Gear'],
    [{ op: 'add_currency', name: 'Guild Marks' }, 'Gear'],
  ];
  for (const [edit, tab] of cases) {
    it(`${edit.op} → ${tab}`, () => expect(editLocation(edit)).toBe(tab));
  }
});

describe('describeEdit — plain English, with the actual value', () => {
  it('states the target and the new value, not just the op name', () => {
    expect(describeEdit({ op: 'set_ability', ability: 'str', value: 18 })).toBe('set STR to 18');
    expect(describeEdit({ op: 'add_feat', feat: 'Alert' })).toBe('add the Alert feat');
    expect(describeEdit({ op: 'add_spell', name: 'Fireball', level: 3, description: 'b' })).toBe('add the spell Fireball');
    expect(describeEdit({ op: 'add_condition', name: 'Poisoned' })).toBe('apply the Poisoned condition');
  });
  it('a rename says what it becomes — the whole point of the op', () => {
    expect(describeEdit({ op: 'rename_item', name: 'Backless Park Bench', to: 'Park Bench' }))
      .toBe('rename Backless Park Bench to Park Bench');
  });
  it('equip_item reads the `value` flag (not a field that does not exist)', () => {
    expect(describeEdit({ op: 'equip_item', name: 'Shield' })).toBe('equip Shield');
    expect(describeEdit({ op: 'equip_item', name: 'Shield', value: false })).toBe('unequip Shield');
  });
});

describe('whereToView — the line the player acts on', () => {
  it('lists distinct tabs once, in sheet order', () => {
    const edits: SheetEdit[] = [
      { op: 'add_item', name: 'Rope' } as SheetEdit,
      { op: 'set_ability', ability: 'dex', value: 14 },
      { op: 'add_item', name: 'Torch' } as SheetEdit,
    ];
    expect(editLocations(edits)).toEqual(['Abilities', 'Gear']);
    expect(whereToView(editLocations(edits))).toBe('see the Abilities and Gear tabs');
  });
  it('singular for one place, and "panels" for the bespoke sheets', () => {
    expect(whereToView(['Attacks'])).toBe('see the Attacks tab');
    expect(whereToView(['Health'], { bespoke: true })).toBe('see the Health panel');
  });
  it('is empty when there is nowhere to point', () => {
    expect(whereToView([])).toBe('');
  });
});

describe('proposalText — what changes, then where to check it', () => {
  it('appends the where-to-check line', () => {
    expect(proposalText('add the Alert feat', 'see the Features tab'))
      .toBe('add the Alert feat.\n\nWhere to check it: see the Features tab.');
  });
  it('omits the line entirely when there is no location', () => {
    expect(proposalText('undo my last change', '')).toBe('undo my last change');
  });
});

describe('bespoke system locations', () => {
  it('maps PF2 HP and death-track ops to their own panels', () => {
    expect(pf2EditLocation('apply_damage')).toBe('Health');
    expect(pf2EditLocation('heal')).toBe('Health');
    expect(pf2EditLocation('set_dying')).toBe('Death track');
  });
  it('maps IG stance/condition ops to their own panels', () => {
    expect(igEditLocation('enter_stance')).toBe('Stances');
    expect(igEditLocation('add_condition')).toBe('Conditions');
    expect(igEditLocation('add_power')).toBe('Powers');
  });
});

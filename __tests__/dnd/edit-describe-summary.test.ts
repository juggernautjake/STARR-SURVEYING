// __tests__/dnd/edit-describe-summary.test.ts — the queue says WHAT changed, for the third row shape too.
//
// THE DEFECT: a bespoke-sheet audit row (`ig:add_power`, `pf2:add_feat`) carries no before/after pair —
// its change lives in a sidecar the 5e `Character` shape cannot express — so `describeEdit` fell through
// to `return path` and the DM's review queue printed the raw opcode:
//
//     ig:add_power                                                        ← what it showed
//     Gained the power Arcane Spell — off-rules: not a Beastmaster power   ← what the row already held
//
// The sentence was sitting in the row's `summary` column the whole time. Nothing read it.
//
// This is the SAME failure `lib/dnd/edit-describe.ts` was written to fix, on a row shape that did not exist
// when it was written — its header describes a queue that "showed a DM which field a player touched but
// never what they did to it". The bespoke-edit audit slice made these rows routine, so the hole went from
// theoretical to the common case on two of the four systems.
import { describe, it, expect } from 'vitest';
import { describeEdit } from '@/lib/dnd/edit-describe';

describe('a summary-only row reads as its sentence', () => {
  it('an IG power row, off-rules and all', () => {
    expect(describeEdit({
      field_path: 'ig:add_power',
      old_value: null,
      new_value: null,
      summary: 'Gained the power Arcane Spell — off-rules: not a Beastmaster power',
    })).toBe('Gained the power Arcane Spell — off-rules: not a Beastmaster power');
  });

  it('a PF2 feat row', () => {
    expect(describeEdit({
      field_path: 'pf2:add_feat', old_value: null, new_value: null, summary: 'Added the feat Power Attack',
    })).toBe('Added the feat Power Attack');
  });

  it('and never leaks the raw opcode when a sentence exists', () => {
    const out = describeEdit({ field_path: 'ig:set_ability', old_value: null, new_value: null, summary: 'Set STR to 16' });
    expect(out).not.toContain('ig:');
    expect(out).not.toContain('set_ability');
  });
});

describe('the summary is a FALLBACK, not a preference', () => {
  // A structured edit or a real before/after pair is a more precise answer than a generic sentence, so a
  // row carrying both must still show the diff. Getting this backwards would degrade every AI and manual
  // row on the sheet — a much larger regression than the bug being fixed.
  it('a structured AI edit still wins over a summary', () => {
    expect(describeEdit({
      field_path: 'meta.level', old_value: 3, new_value: { op: 'set_level', value: 4 }, summary: 'Levelled up',
    })).toBe('meta.level: 3 → 4');
  });

  it('a manual before/after pair still wins over a summary', () => {
    expect(describeEdit({
      field_path: 'spell.Fireball.damage', old_value: '8d6', new_value: '10d6', summary: 'Buffed Fireball',
    })).toBe('spell.Fireball.damage: 8d6 → 10d6');
  });

  it('the add/remove verbs still win', () => {
    expect(describeEdit({ field_path: 'item.Rope', old_value: null, new_value: 'Rope', summary: 'x' })).toBe('item.Rope: added');
    expect(describeEdit({ field_path: 'item.Rope', old_value: 'Rope', new_value: null, summary: 'x' })).toBe('item.Rope: removed');
  });
});

describe('nothing regresses when there is no summary', () => {
  it('a valueless row with no sentence is still the quiet bare path', () => {
    expect(describeEdit({ field_path: 'ig:add_power', old_value: null, new_value: null })).toBe('ig:add_power');
  });

  it('an empty or whitespace summary does not produce a blank line', () => {
    // The failure mode of a naive `summary ||` check: a row rendering as nothing at all, which reads as a
    // broken queue rather than a missing description.
    expect(describeEdit({ field_path: 'ig:add_power', old_value: null, new_value: null, summary: '' })).toBe('ig:add_power');
    expect(describeEdit({ field_path: 'ig:add_power', old_value: null, new_value: null, summary: '   ' })).toBe('ig:add_power');
    expect(describeEdit({ field_path: 'ig:add_power', old_value: null, new_value: null, summary: null })).toBe('ig:add_power');
  });

  it('a row with no path at all still says something', () => {
    expect(describeEdit({})).toBe('sheet');
  });
});

// __tests__/dnd/edit-describe.test.ts — the DM's review queue must say WHAT changed, not just where.
//
// Found while auditing the rules-platform doc's remaining item ("surface the SPECIFIC per-element diff,
// '8d6 → 10d6'"). That was filed as a UI enhancement blocked on nothing, but the formatter it needed
// already existed and had a hole in it: `describeEdit` lived inside `EditReviewPanel` and only understood
// AI-shaped rows, where `new_value` is a `SheetEdit` carrying an `op`.
//
// A MANUAL edit is a bare before/after pair — `logManualEdit` posts the raw scalars — so it has no `op`,
// fell through the first guard, and rendered as the field path alone:
//
//     spell.Fireball.damage                  ← what the panel showed
//     spell.Fireball.damage: 8d6 → 10d6      ← what the row actually held
//
// Both values were in the row. Nothing formatted them. The one surface whose purpose is reviewing changes
// told a DM which field a player touched and never what they did to it.
import { describe, it, expect } from 'vitest';
import { describeEdit, editedElementName } from '@/lib/dnd/edit-describe';

describe('manual edits — the case that showed no diff at all', () => {
  it('renders the before and after', () => {
    expect(describeEdit({ field_path: 'spell.Fireball.damage', old_value: '8d6', new_value: '10d6' }))
      .toBe('spell.Fireball.damage: 8d6 → 10d6');
  });

  it('handles numbers, which is most of a sheet', () => {
    expect(describeEdit({ field_path: 'ability.str', old_value: 14, new_value: 18 }))
      .toBe('ability.str: 14 → 18');
  });

  it('shows a transition from unset as a real change, not a blank', () => {
    // `diffFields` deliberately treats undefined → value as a change worth auditing, so the description
    // has to be able to say so rather than rendering half a line.
    expect(describeEdit({ field_path: 'attack.Club.notes', old_value: null, new_value: 'silvered' }))
      .toBe('attack.Club.notes: — → silvered');
  });

  it('never prints raw JSON at a human', () => {
    const out = describeEdit({ field_path: 'item.Rope.tags', old_value: ['a'], new_value: ['a', 'b'] });
    expect(out).toBe('item.Rope.tags: a → a, b');
    expect(out).not.toContain('[');
    expect(out).not.toContain('"');
  });

  it('stays quiet when nothing actually moved', () => {
    expect(describeEdit({ field_path: 'spell.Fireball.damage', old_value: '8d6', new_value: '8d6' }))
      .toBe('spell.Fireball.damage');
  });
});

describe('AI edits — the shape that already worked, unchanged', () => {
  it('describes a rename', () => {
    expect(describeEdit({ field_path: 'spells[fireball]', new_value: { op: 'rename_spell', to: 'Firestorm' } }))
      .toBe('spells[fireball]: renamed → “Firestorm”');
  });

  it('describes a set, with the prior value when there was one', () => {
    expect(describeEdit({ field_path: 'attacks[club]', old_value: '1d4', new_value: { op: 'set_attack_damage', value: '1d6' } }))
      .toBe('attacks[club]: 1d4 → 1d6');
  });

  it('falls back to the op for anything else', () => {
    expect(describeEdit({ field_path: 'inventory[rope]', new_value: { op: 'add_item' } }))
      .toBe('inventory[rope]: add_item');
  });

  it('names an element rather than dumping it, when old_value is a whole object', () => {
    // The AI path stores the entire prior element in `old_value`; printing it would be a wall of JSON.
    expect(describeEdit({
      field_path: 'spells[fireball]',
      old_value: { name: 'Fireball', level: 3, desc: 'a long description…' },
      new_value: { op: 'set_spell_level', value: 4 },
    })).toBe('spells[fireball]: Fireball → 4');
  });
});

describe('degrading safely on rows that predate or violate the shape', () => {
  it('survives a missing path', () => {
    expect(describeEdit({ old_value: 1, new_value: 2 })).toBe('sheet: 1 → 2');
  });

  it('survives an empty row', () => {
    expect(() => describeEdit({})).not.toThrow();
    expect(describeEdit({})).toBe('sheet');
  });

  it('treats a non-object new_value as manual, not as a broken SheetEdit', () => {
    expect(describeEdit({ field_path: 'combat.ac', old_value: 15, new_value: 17 })).toContain('15 → 17');
  });
});

describe('matching a row back to an element on the sheet', () => {
  // Needed by the next step (the diff on the inline ✎ hover). Both vocabularies are written today, so
  // anything matching rows to elements has to read both — which is exactly why this lives here and not
  // in whichever component needs it first.
  it('reads the manual vocabulary', () => {
    expect(editedElementName('spell.Fireball.damage')).toBe('Fireball');
  });

  it('reads the AI vocabulary', () => {
    expect(editedElementName('spells[fireball]')).toBe('fireball');
  });

  it('handles a name containing dots', () => {
    expect(editedElementName('item.Wand of Sparks v1.2.qty')).toBe('Wand of Sparks v1.2');
  });

  it('returns null for a scalar path that names no element', () => {
    expect(editedElementName('ability.str')).toBeNull();
    expect(editedElementName('')).toBeNull();
    expect(editedElementName(null)).toBeNull();
  });
});

describe('the panel uses the shared formatter', () => {
  it('does not keep a second local copy', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const src = readFileSync(join(process.cwd(), 'app/dnd/_sheet/components/EditReviewPanel.tsx'), 'utf8');
    expect(src).toContain("from '@/lib/dnd/edit-describe'");
    expect(src).not.toContain('function describeEdit');
  });
});

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

describe('parseIgEdit', () => {
  it('accepts every valid op and rejects unknown ones', () => {
    for (const op of IG_EDIT_OPS) {
      const r = parseIgEdit({ op, name: op === 'clear_stance' ? undefined : 'Shaken' });
      expect('edit' in r).toBe(true);
    }
    expect(parseIgEdit({ op: 'delete_everything', name: 'x' })).toHaveProperty('error');
  });
  it('requires a name for the name-bearing ops', () => {
    expect(parseIgEdit({ op: 'add_condition' })).toHaveProperty('error');
    expect(parseIgEdit({ op: 'clear_stance' })).toHaveProperty('edit'); // clear needs no name
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

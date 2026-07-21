// __tests__/dnd/ig-element-editor.test.ts — editing and authoring on the IG sheet (IG-S2).
//
// IG-S1 gave IG the ops; this is the surface that reaches them. Without it the ops would be the
// same "built but unwired" failure the orphan guard now exists to catch — which is exactly why the
// last assertions here check the sheet, not just the component.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { applyIgEdit } from '@/lib/dnd/systems/intuitive-games/edit';
import { blankIGCharacter } from '@/lib/dnd/systems/intuitive-games/model';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');
const editor = read('app/dnd/_ui/IGElementEditor.tsx');
const sheet = read('app/dnd/_ui/IGSheet.tsx');

describe('one component edits and authors, across all three kinds', () => {
  it('handles powers, feats and weapons', () => {
    expect(editor).toContain("kind: IGEditorKind");
    for (const k of ['power', 'feat', 'weapon']) expect(editor).toContain(`'${k}'`);
  });

  it('distinguishes authoring from editing by whether `initial` was supplied', () => {
    expect(editor).toContain('const creating = !initial');
  });

  it('authoring saves through the SAME add ops as a catalogued pick', () => {
    // Ground Rule 4 — custom content is the same shape as official content.
    for (const op of ['add_power', 'add_feat', 'add_attack']) expect(editor).toContain(op);
  });
});

describe('authoring a power emits TWO ops, because IG add ops carry only a name', () => {
  it('the editor emits add then update when there is rules text', () => {
    // IG powers are a bare string[], so the rules text has to land via the update op that writes
    // customEffects. Emitting both together means a half-finished element cannot be left behind.
    expect(editor).toContain('const ops: Record<string, unknown>[] = [{ op: addOp, name: trimmed }]');
    expect(editor).toContain('ops.push({ op: updateOp, name: trimmed, effect })');
  });

  it('and that sequence actually produces a power WITH its text', () => {
    // End-to-end through the pure ops, so the two-step is verified rather than assumed.
    let c = blankIGCharacter('T');
    c = applyIgEdit(c, { op: 'add_power', name: 'Ember Lash' });
    c = applyIgEdit(c, { op: 'update_power', name: 'Ember Lash', effect: 'Homebrew.' });
    expect(c.powers).toContain('Ember Lash');
    expect(c.customEffects?.['Ember Lash']).toBe('Homebrew.');
  });

  it('skips the second op when there is no text to attach', () => {
    expect(editor).toContain('if (effect.trim()) ops.push');
  });
});

describe('clearing an override restores the original text', () => {
  it('the editor always sends `effect` when editing, including empty', () => {
    // Omitting it would mean "leave alone"; sending empty means "clear". Different intents.
    expect(editor).toMatch(/onSave\(\[\{[\s\S]*?op: updateOp[\s\S]*?effect,\s*\}\]\)/);
  });

  it('tells the player what clearing does', () => {
    expect(editor).toContain('Clearing this restores the original rules text');
  });

  it('and the sheet falls back to the catalogue text when cleared', () => {
    expect(sheet).toContain('ig.customEffects?.[p]');
    expect(sheet).toContain(': effectOf(p)');
  });
});

describe('the sheet wires it up', () => {
  it('mounts the editor', () => {
    expect(sheet).toContain('<IGElementEditor');
  });

  it('offers per-power Edit and a New button for homebrew', () => {
    expect(sheet).toMatch(/setIgEditor\(\{ kind: 'power', initial:/);
    expect(sheet).toContain("setIgEditor({ kind: 'power' })");
  });

  it('renders ✎ alongside ⚑ rather than instead of it', () => {
    // Two axes: ✎ edited, ⚑ not legally available. An element can carry both.
    expect(sheet).toContain('ig.customEffects?.[p] && <span title="Hand-customized');
    expect(sheet).toContain('OffRulesMark');
  });

  it('applies a sequence in order and refreshes once', () => {
    expect(sheet).toContain('const postEdits = async (edits: Record<string, unknown>[])');
    expect(sheet).toContain('for (const edit of edits)');
  });

  it('stops the sequence when the gate refuses an op', () => {
    // Continuing would apply a partial edit the server already rejected part of.
    expect(sheet).toContain('if (!res.ok) break');
  });

  it('shows edit controls only to someone who can write', () => {
    expect(sheet).toMatch(/canDoEdit && \(\s*<button[\s\S]{0,240}setIgEditor/);
  });
});

describe('weapons are editable at all now', () => {
  it('the editor validates the damage die', () => {
    expect(editor).toContain(".test(damage.trim())");
    expect(editor).toContain('^\\d+$'); // a flat-damage weapon is still valid
  });

  it('emits add_attack when creating and update_attack when editing', () => {
    expect(editor).toContain("op: 'add_attack'");
    expect(editor).toContain("op: 'update_attack'");
  });
});

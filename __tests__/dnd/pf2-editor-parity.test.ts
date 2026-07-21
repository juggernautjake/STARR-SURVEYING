// __tests__/dnd/pf2-editor-parity.test.ts — S15: the PF2 editors held to the patterns IG-S1/IG-S2
// already settled, since "same behaviour in both systems" is the whole point of having settled them.
//
// The two gaps this file pins were both bugs IG had, found, and fixed — and PF2 still had, because
// the fixes were made on the IG sheet rather than in shared code. There is no shared code to make
// them in: the two sheets are deliberately separate (Ground Rule 1). So the guard has to be a test.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { applyPf2Edit, parsePf2Edit } from '@/lib/dnd/systems/pathfinder2e/edit';
import { blankPF2Character } from '@/lib/dnd/systems/pathfinder2e/model';

const sheet = readFileSync(join(process.cwd(), 'app/dnd/_ui/PF2Sheet.tsx'), 'utf8');

/** A caster holding one catalogued spell. */
function caster() {
  const c = blankPF2Character('Caster');
  c.spellcasting = { tradition: 'arcane', kind: 'prepared', attribute: 'INT', rank: 'trained', slots: [], spells: [] };
  return applyPf2Edit(c, { op: 'add_spell', name: 'Magic Missile', rank: 1 });
}

describe('an emptied override CLEARS rather than storing a blank (IG-S1 parity)', () => {
  it('setting effect text stores it and marks the spell customised', () => {
    const c = applyPf2Edit(caster(), { op: 'update_spell', name: 'Magic Missile', effect: 'Three darts, but they sing.' });
    const s = c.spellcasting.spells![0];
    expect(s.effect).toBe('Three darts, but they sing.');
    expect(s.customized).toBe(true);
  });

  it('emptying the effect DELETES the key, so the spell falls back to the catalog entry', () => {
    // Storing "" would render the spell as having NO rules text at all — silently destroying the
    // spell's rules — and would make a customisation impossible to undo.
    const edited = applyPf2Edit(caster(), { op: 'update_spell', name: 'Magic Missile', effect: 'custom text' });
    const cleared = applyPf2Edit(edited, { op: 'update_spell', name: 'Magic Missile', effect: '' });
    expect('effect' in cleared.spellcasting.spells![0]).toBe(false);
  });

  it('whitespace-only counts as emptied', () => {
    const edited = applyPf2Edit(caster(), { op: 'update_spell', name: 'Magic Missile', effect: 'custom' });
    const cleared = applyPf2Edit(edited, { op: 'update_spell', name: 'Magic Missile', effect: '   ' });
    expect('effect' in cleared.spellcasting.spells![0]).toBe(false);
  });

  it('an empty string survives the PARSER, so apply can tell "cleared" from "not supplied"', () => {
    // If the parser dropped "" as falsy, clearing would be unexpressible over the wire.
    const r = parsePf2Edit({ op: 'update_spell', name: 'Magic Missile', effect: '' });
    expect('edit' in r && (r.edit as { effect?: string }).effect).toBe('');
    const absent = parsePf2Edit({ op: 'update_spell', name: 'Magic Missile' });
    expect('edit' in absent && 'effect' in absent.edit).toBe(false);
  });

  it('a feat body is stored TEXT, not an override, so emptying it empties it', () => {
    // The asymmetry is in the shapes: add_feat copies the catalogue text INTO body, so there is
    // nothing behind it to fall back to. Pinned so the difference reads as decided, not forgotten.
    const c = applyPf2Edit(blankPF2Character('F'), { op: 'add_feat', name: 'Toughness', body: 'You are hardy.' });
    const cleared = applyPf2Edit(c, { op: 'update_feat', name: 'Toughness', body: '' });
    expect(cleared.feats[0].body).toBe('');
    expect(cleared.feats[0].customized).toBe(true);
  });
});

describe('an update never CREATES (IG-S1 parity)', () => {
  it('updating a spell the character does not hold changes nothing', () => {
    const c = caster();
    const after = applyPf2Edit(c, { op: 'update_spell', name: 'Meteor Swarm', rank: 10, effect: 'oops' });
    expect(after.spellcasting.spells).toHaveLength(1);
    expect(after.spellcasting.spells![0].name).toBe('Magic Missile');
  });

  it('updating a feat the character does not hold changes nothing', () => {
    const c = applyPf2Edit(blankPF2Character('F'), { op: 'add_feat', name: 'Toughness' });
    expect(applyPf2Edit(c, { op: 'update_feat', name: 'Legendary Everything' }).feats).toHaveLength(1);
  });
});

describe('markers survive a rename (IG-S1 parity)', () => {
  it('renaming an off-rules spell keeps the offRules mark', () => {
    // Otherwise editing a DM-granted element would launder away the record of how it arrived.
    const c = applyPf2Edit(caster(), { op: 'add_spell', name: 'Wish', rank: 9, offRules: 'granted by the DM — beyond your rank' });
    const renamed = applyPf2Edit(c, { op: 'update_spell', name: 'Wish', to: 'Wish, Refined' });
    const s = renamed.spellcasting.spells!.find((x) => x.name === 'Wish, Refined')!;
    expect(s.offRules).toContain('granted by the DM');
    expect(s.customized).toBe(true);
  });
});

describe("the gate's refusal reaches the player (IG-S2 parity)", () => {
  it('the sheet reads the response instead of discarding it', () => {
    // The bug: `await fetch(...)` with the result ignored, so a 400 and a 200 were
    // indistinguishable and a refused edit read as the app ignoring you.
    expect(sheet).toContain('if (res.ok)');
    expect(sheet).toContain('setRefusal');
    expect(sheet).toContain("body?.error || 'That edit was refused.'");
  });

  it('renders the refusal where the player will see it', () => {
    expect(sheet).toContain('role="alert"');
    expect(sheet).toMatch(/\{refusal &&/);
  });

  it('a network failure is reported rather than swallowed', () => {
    expect(sheet).toContain('Could not reach the server.');
  });
});

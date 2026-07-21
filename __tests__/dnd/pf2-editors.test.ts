// __tests__/dnd/pf2-editors.test.ts — editing what a PF2 character already holds (S15).
//
// Owner ask: full editors for spells/feats/armor/weapons on the PF2 sheet, with parity to the 2024
// sheet. This is the persistence half — update ops the editors save through.
//
// The decision that matters here: an update is a CUSTOMISATION, not a fresh acquisition, so it is
// never re-gated against the catalog. Re-gating would mean a character who was legitimately GRANTED
// an off-curve spell could never edit it afterwards, and would have the grant refused back at them.
import { describe, it, expect } from 'vitest';
import { applyPf2Edit, parsePf2Edit, describePf2Edit, PF2_EDIT_OPS, type PF2Edit } from '@/lib/dnd/systems/pathfinder2e/edit';
import { gatePf2Edit } from '@/lib/dnd/systems/pathfinder2e/rules-gate';
import { blankPF2Character } from '@/lib/dnd/systems/pathfinder2e/model';
import type { PF2Character } from '@/lib/dnd/systems/pathfinder2e/model';

const wizard = (): PF2Character => {
  const c = blankPF2Character('T');
  return {
    ...c,
    identity: { ...c.identity, className: 'Wizard', level: 4 },
    spellcasting: { ...c.spellcasting, tradition: 'arcane', kind: 'prepared' },
  };
};
const withSpell = () => applyPf2Edit(wizard(), { op: 'add_spell', name: 'Fireball', rank: 3 });
const withFeat = () => applyPf2Edit(wizard(), { op: 'add_feat', name: 'Toughness', level: 1, track: 'general' });

describe('the ops exist and are reachable', () => {
  it('update_spell and update_feat are registered', () => {
    expect(PF2_EDIT_OPS as readonly string[]).toContain('update_spell');
    expect(PF2_EDIT_OPS as readonly string[]).toContain('update_feat');
  });
});

describe('editing a spell', () => {
  it('changes the field asked for and leaves the rest alone', () => {
    const c = applyPf2Edit(withSpell(), { op: 'update_spell', name: 'Fireball', effect: 'My homebrew version.' });
    const s = c.spellcasting.spells![0];
    expect(s.effect).toBe('My homebrew version.');
    expect(s.rank).toBe(3);
    expect(s.name).toBe('Fireball');
  });

  it('can rename in place, keeping every other field', () => {
    // Remove + re-add would drop the rank and any marker — the exact bug the 5e rename_* ops exist
    // to avoid.
    const c = applyPf2Edit(withSpell(), { op: 'update_spell', name: 'Fireball', to: 'Frostball' });
    expect(c.spellcasting.spells![0]).toMatchObject({ name: 'Frostball', rank: 3 });
  });

  it('stamps `customized`, and does not take it from the caller', () => {
    // A hand-tuned element must not be able to present itself as pristine.
    const c = applyPf2Edit(withSpell(), { op: 'update_spell', name: 'Fireball', effect: 'x' });
    expect(c.spellcasting.spells![0].customized).toBe(true);
    const parsed = parsePf2Edit({ op: 'update_spell', name: 'Fireball', customized: false });
    expect('edit' in parsed && (parsed.edit as { customized?: boolean }).customized).toBeUndefined();
  });

  it('never CREATES from an update', () => {
    // An update naming something the character doesn't have is a no-op, not a silent add — or a
    // typo would conjure content past the gate.
    const before = wizard();
    expect(applyPf2Edit(before, { op: 'update_spell', name: 'Nonexistent', effect: 'x' })).toEqual(before);
  });

  it('preserves an existing offRules marker', () => {
    // Editing a DM-granted spell must not launder away the record of how it arrived.
    const granted = applyPf2Edit(wizard(), { op: 'add_spell', name: 'Wall of Stone', rank: 5, offRules: 'granted by the DM — rank 5' });
    const edited = applyPf2Edit(granted, { op: 'update_spell', name: 'Wall of Stone', effect: 'tweaked' });
    expect(edited.spellcasting.spells![0].offRules).toContain('granted by the DM');
    expect(edited.spellcasting.spells![0].customized).toBe(true);
  });
});

describe('editing a feat', () => {
  it('updates fields and stamps customized', () => {
    const c = applyPf2Edit(withFeat(), { op: 'update_feat', name: 'Toughness', body: 'Homebrewed.', level: 3 });
    const f = c.feats.find((x) => x.name === 'Toughness')!;
    expect(f.body).toBe('Homebrewed.');
    expect(f.level).toBe(3);
    expect(f.customized).toBe(true);
  });

  it('renames in place', () => {
    const c = applyPf2Edit(withFeat(), { op: 'update_feat', name: 'Toughness', to: 'Sturdiness' });
    expect(c.feats.map((f) => f.name)).toContain('Sturdiness');
    expect(c.feats.map((f) => f.name)).not.toContain('Toughness');
  });

  it('does not mutate the input', () => {
    const before = withFeat();
    applyPf2Edit(before, { op: 'update_feat', name: 'Toughness', body: 'x' });
    expect(before.feats[0].body).not.toBe('x');
  });
});

describe('the gate does not re-judge an edit', () => {
  const CATALOG = { feats: [], spells: [] };

  it('an update passes untouched even for a vanilla character', () => {
    // The load-bearing decision. Re-gating would refuse a legitimate grant back at the player.
    const updates: PF2Edit[] = [
      { op: 'update_spell', name: 'Wall of Stone', effect: 'x' },
      { op: 'update_feat', name: 'Big Feat', body: 'x' },
    ];
    for (const u of updates) {
      expect(gatePf2Edit(wizard(), u, { enforce: true }, CATALOG).edit).toEqual(u);
    }
  });
});

describe('the parser validates', () => {
  it('requires the current name', () => {
    expect('error' in parsePf2Edit({ op: 'update_spell' })).toBe(true);
    expect('error' in parsePf2Edit({ op: 'update_feat', name: '  ' })).toBe(true);
  });

  it('clamps rank and level rather than storing nonsense', () => {
    const s = parsePf2Edit({ op: 'update_spell', name: 'X', rank: 99 });
    const f = parsePf2Edit({ op: 'update_feat', name: 'X', level: 0 });
    expect('edit' in s && (s.edit as { rank?: number }).rank).toBe(10);
    expect('edit' in f && (f.edit as { level?: number }).level).toBe(1);
  });

  it('omits fields that were not supplied, so a partial edit stays partial', () => {
    const r = parsePf2Edit({ op: 'update_spell', name: 'X', effect: 'only this' });
    expect('edit' in r && r.edit).toEqual({ op: 'update_spell', name: 'X', effect: 'only this' });
  });

  it('describes itself for the audit trail', () => {
    expect(describePf2Edit({ op: 'update_spell', name: 'Fireball', to: 'Frostball' })).toContain('Frostball');
    expect(describePf2Edit({ op: 'update_feat', name: 'Toughness' })).toContain('Customised');
  });
});

// __tests__/dnd/pf2-rules-gate.test.ts — PF2 content ops and their gate (PF2 buildout S13).
//
// This completes Area MV across all three systems. The original audit found PF2 had "nothing to
// gate", which was true for two reasons now removed: no feat carried a level (S1/S2), and no edit
// op could add content at all (this slice). The door exists now, so it needs a lock.
import { describe, it, expect } from 'vitest';
import { applyPf2Edit, parsePf2Edit, describePf2Edit, PF2_EDIT_OPS, type PF2Edit } from '@/lib/dnd/systems/pathfinder2e/edit';
import { gatePf2Edit, pf2ContextFor } from '@/lib/dnd/systems/pathfinder2e/rules-gate';
import { blankPF2Character } from '@/lib/dnd/systems/pathfinder2e/model';
import type { PF2Character } from '@/lib/dnd/systems/pathfinder2e/model';
import type { PF2FeatFull, PF2SpellFull } from '@/lib/dnd/systems/pathfinder2e/defs';

function wizard(level = 4): PF2Character {
  const c = blankPF2Character('Testy');
  return {
    ...c,
    identity: { ...c.identity, className: 'Wizard', ancestry: 'Human', level },
    spellcasting: { ...c.spellcasting, tradition: 'arcane', kind: 'prepared' },
  };
}

const CATALOG = {
  feats: [
    { name: 'Toughness', level: 1, track: 'general', traits: [], effect: 'x', source: 'Player Core' },
    { name: 'Big Feat', level: 16, track: 'general', traits: [], effect: 'x', source: 'Player Core' },
    { name: 'Power Attack', level: 1, track: 'class', className: 'Fighter', traits: [], effect: 'x', source: 'Player Core' },
  ] as PF2FeatFull[],
  spells: [
    { name: 'Fireball', rank: 3, traditions: ['arcane', 'primal'], traits: [], cast: '2', effect: 'x', source: 'Player Core' },
    { name: 'Wall of Stone', rank: 5, traditions: ['arcane', 'primal'], traits: [], cast: '3', effect: 'x', source: 'Player Core' },
    { name: 'Heal', rank: 1, traditions: ['divine', 'primal'], traits: [], cast: '1-3', effect: 'x', source: 'Player Core' },
  ] as PF2SpellFull[],
};

const VANILLA = { enforce: true };
const CUSTOM = { enforce: false, unboundReason: 'custom-character' as const };
const DM = { enforce: false, unboundReason: 'dm-grant' as const };

const addFeat = (name: string): PF2Edit => ({ op: 'add_feat', name });
const addSpell = (name: string, rank: number): PF2Edit => ({ op: 'add_spell', name, rank });

describe('PF2 can finally ADD content', () => {
  it('registers the new ops', () => {
    for (const op of ['add_feat', 'remove_feat', 'add_spell', 'remove_spell']) {
      expect(PF2_EDIT_OPS as readonly string[]).toContain(op);
    }
  });

  it('a feat lands on the sheet', () => {
    const c = applyPf2Edit(wizard(), { op: 'add_feat', name: 'Toughness', level: 1, track: 'general' });
    expect(c.feats.map((f) => f.name)).toContain('Toughness');
  });

  it('a spell lands in spellcasting, which previously tracked slots but never spells', () => {
    const c = applyPf2Edit(wizard(), addSpell('Fireball', 3));
    expect(c.spellcasting.spells?.map((s) => s.name)).toEqual(['Fireball']);
  });

  it('re-adding upserts rather than duplicating', () => {
    const once = applyPf2Edit(wizard(), addSpell('Fireball', 3));
    const twice = applyPf2Edit(once, addSpell('Fireball', 3));
    expect(twice.spellcasting.spells).toHaveLength(1);
  });

  it('removing the last spell drops the array entirely', () => {
    // So a character who never had spells is stored exactly as before these ops existed.
    const c = applyPf2Edit(applyPf2Edit(wizard(), addSpell('Fireball', 3)), { op: 'remove_spell', name: 'Fireball' });
    expect('spells' in c.spellcasting).toBe(false);
  });

  it('does not mutate the input', () => {
    const before = wizard();
    applyPf2Edit(before, addFeat('Toughness'));
    expect(before.feats).toHaveLength(0);
  });
});

describe('the parser refuses to take offRules from the caller', () => {
  it('strips it from add_feat and add_spell payloads', () => {
    // Server-set only. Accepting it would let a caller declare its own content "not off-rules" —
    // a claim rather than a fact.
    const f = parsePf2Edit({ op: 'add_feat', name: 'X', offRules: 'totally fine' });
    const s = parsePf2Edit({ op: 'add_spell', name: 'Y', rank: 1, offRules: 'totally fine' });
    expect('edit' in f && (f.edit as { offRules?: string }).offRules).toBeFalsy();
    expect('edit' in s && (s.edit as { offRules?: string }).offRules).toBeFalsy();
  });

  it('requires a name, and a rank for spells', () => {
    expect('error' in parsePf2Edit({ op: 'add_feat' })).toBe(true);
    expect('error' in parsePf2Edit({ op: 'add_spell', name: 'Y' })).toBe(true);
  });

  it('clamps a wild rank instead of storing it', () => {
    const r = parsePf2Edit({ op: 'add_spell', name: 'Y', rank: 99 });
    expect('edit' in r && (r.edit as { rank: number }).rank).toBe(10);
  });

  it('ignores an unrecognised track rather than storing garbage', () => {
    const r = parsePf2Edit({ op: 'add_feat', name: 'X', track: 'nonsense' });
    expect('edit' in r && (r.edit as { track?: string }).track).toBeUndefined();
  });
});

describe('a vanilla PF2 character is held to its class and level', () => {
  it('refuses a feat above its level', () => {
    const r = gatePf2Edit(wizard(4), addFeat('Big Feat'), VANILLA, CATALOG);
    expect(r.edit).toBeNull();
    expect(r.refusal).toContain('level-16');
  });

  it('refuses another class’s feat', () => {
    expect(gatePf2Edit(wizard(4), addFeat('Power Attack'), VANILLA, CATALOG).edit).toBeNull();
  });

  it('refuses a spell above its rank ceiling', () => {
    const r = gatePf2Edit(wizard(4), addSpell('Wall of Stone', 5), VANILLA, CATALOG);
    expect(r.edit).toBeNull();
    expect(r.refusal).toContain('rank 5');
  });

  it('refuses a spell off its tradition', () => {
    // Heal is divine/primal; an arcane wizard cannot learn it. PF2's version of an off-list spell.
    expect(gatePf2Edit(wizard(10), addSpell('Heal', 1), VANILLA, CATALOG).edit).toBeNull();
  });

  it('allows what it CAN legitimately take', () => {
    expect(gatePf2Edit(wizard(6), addSpell('Fireball', 3), VANILLA, CATALOG).edit).toBeTruthy();
    expect(gatePf2Edit(wizard(4), addFeat('Toughness'), VANILLA, CATALOG).edit).toBeTruthy();
  });

  it('judges against the CATALOG, not the level the caller claims', () => {
    // The critical one, same as 5e: trusting the edit's own `level` would let a model declare a
    // level-16 feat to be level 1 and walk through.
    const lying: PF2Edit = { op: 'add_feat', name: 'Big Feat', level: 1 };
    expect(gatePf2Edit(wizard(4), lying, VANILLA, CATALOG).edit).toBeNull();
  });

  it('passes homebrew through rather than refusing what it cannot look up', () => {
    // Uncatalogued content makes no claim to be official, and refusing it would block authoring
    // something new rather than the exploit being closed.
    expect(gatePf2Edit(wizard(1), addFeat('Blorpwave Mastery'), VANILLA, CATALOG).edit).toBeTruthy();
  });
});

describe('custom and DM are unbound, and marked', () => {
  it('a custom character may take it, flagged', () => {
    const r = gatePf2Edit(wizard(4), addSpell('Wall of Stone', 5), CUSTOM, CATALOG);
    expect(r.edit).toBeTruthy();
    expect(r.offRules).toBeTruthy();
    expect(r.offRules).not.toContain('granted by the DM');
  });

  it('a DM grant is labelled as a grant', () => {
    const r = gatePf2Edit(wizard(4), addSpell('Wall of Stone', 5), DM, CATALOG);
    expect(r.offRules).toContain('granted by the DM');
  });

  it('the marker rides on the edit, so it reaches the sheet', () => {
    const r = gatePf2Edit(wizard(4), addSpell('Wall of Stone', 5), DM, CATALOG);
    const c = applyPf2Edit(wizard(4), r.edit!);
    expect(c.spellcasting.spells?.[0].offRules).toContain('granted by the DM');
  });

  it('a legal pick is never marked, even when unbound', () => {
    expect(gatePf2Edit(wizard(6), addSpell('Fireball', 3), DM, CATALOG).offRules).toBeUndefined();
  });
});

describe('play is not construction — in-play ops are never gated', () => {
  const playOps: PF2Edit[] = [
    { op: 'apply_damage', amount: 5 },
    { op: 'heal', amount: 3 },
    { op: 'set_condition', name: 'Frightened', value: 2 },
    { op: 'set_dying', value: 1 },
    { op: 'set_attribute', attribute: 'STR', value: 4 },
    { op: 'remove_feat', name: 'Toughness' },
  ];
  for (const op of playOps) {
    it(`${op.op} passes untouched`, () => {
      // Gating these would break the sheet mid-combat — a far worse failure than an off-list feat.
      expect(gatePf2Edit(wizard(), op, VANILLA, CATALOG).edit).toEqual(op);
    });
  }
});

describe('the context is read from the sheet, not the request', () => {
  it('carries class, ancestry, level, tradition and feats', () => {
    const c = applyPf2Edit(wizard(7), { op: 'add_feat', name: 'Toughness', level: 1, track: 'general' });
    const ctx = pf2ContextFor(c);
    expect(ctx).toMatchObject({ className: 'Wizard', ancestry: 'Human', level: 7, tradition: 'arcane' });
    expect(ctx.featNames).toContain('Toughness');
  });

  it('omits the tradition for a non-caster rather than reporting "none"', () => {
    const c = blankPF2Character('Fighty');
    expect(pf2ContextFor(c).tradition).toBeUndefined();
  });
});

describe('edits describe themselves for the audit trail', () => {
  it('names the feat and any off-rules reason', () => {
    expect(describePf2Edit({ op: 'add_feat', name: 'Toughness' })).toContain('Toughness');
    expect(describePf2Edit({ op: 'add_feat', name: 'X', offRules: 'granted by the DM — nope' })).toContain('off-rules');
  });

  it('distinguishes a cantrip from a ranked spell', () => {
    expect(describePf2Edit({ op: 'add_spell', name: 'Light', rank: 0 })).toContain('cantrip');
    expect(describePf2Edit({ op: 'add_spell', name: 'Fireball', rank: 3 })).toContain('rank 3');
  });
});

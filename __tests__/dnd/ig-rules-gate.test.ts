// __tests__/dnd/ig-rules-gate.test.ts — the IG edit paths obey the rules (IG S2).
//
// IG edits never reached the shared 5e gate: the AI route's IG branch returns before the mechanics
// path, and even if it didn't, the shared gate's lookups are 2024-only and would no-op. So an IG
// character could be handed another class's power just by asking.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { gateIgEdit, gateIgPicks, gateIgSpecialization, igContextFor, markIgOffRules } from '@/lib/dnd/systems/intuitive-games/rules-gate';
import { blankIGCharacter } from '@/lib/dnd/systems/intuitive-games/model';
import type { IGCharacter } from '@/lib/dnd/systems/intuitive-games/model';
import type { IGEdit } from '@/lib/dnd/systems/intuitive-games/edit';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

/** A level-1 Arcanist — a real class with a real power list. */
function arcanist(over: Partial<IGCharacter['identity']> = {}): IGCharacter {
  const ig = blankIGCharacter('Testy');
  return { ...ig, identity: { ...ig.identity, className: 'Wizard', subclass: 'Arcanist', level: 1, ...over } };
}

const addPower = (name: string): IGEdit => ({ op: 'add_power', name });
const VANILLA = { enforce: true };
const CUSTOM = { enforce: false, unboundReason: 'custom-character' as const };
const DM = { enforce: false, unboundReason: 'dm-grant' as const };

describe('a vanilla IG character is held to its class', () => {
  it('refuses another class’s power', () => {
    const r = gateIgEdit(arcanist(), addPower('Entangle'), VANILLA);
    expect(r.edit).toBeNull();
    expect(r.refusal).toContain('Entangle');
    expect(r.refusal).toContain('custom');
  });

  it('allows its own class’s power', () => {
    expect(gateIgEdit(arcanist(), addPower('Elemental Strike'), VANILLA).edit).toBeTruthy();
  });

  it('allows the inherited parent-class starting power', () => {
    expect(gateIgEdit(arcanist(), addPower('Elemental Blast'), VANILLA).edit).toBeTruthy();
  });
});

describe('custom and DM are unbound, and marked', () => {
  it('a custom character may take it, flagged', () => {
    const r = gateIgEdit(arcanist(), addPower('Entangle'), CUSTOM);
    expect(r.edit).toBeTruthy();
    expect(r.offRules).toBeTruthy();
    expect(r.offRules).not.toContain('granted by the DM');
  });

  it('a DM grant is labelled as a grant', () => {
    const r = gateIgEdit(arcanist(), addPower('Entangle'), DM);
    expect(r.edit).toBeTruthy();
    expect(r.offRules).toContain('granted by the DM');
  });

  it('a legal power is never marked, even when unbound', () => {
    expect(gateIgEdit(arcanist(), addPower('Elemental Strike'), DM).offRules).toBeUndefined();
  });
});

describe('play is not construction — combat ops are never gated', () => {
  // Gating these would break the sheet mid-combat, which is a far worse failure than an
  // off-list power.
  const playOps: IGEdit[] = [
    { op: 'apply_damage', amount: 5 },
    { op: 'heal', amount: 3 },
    { op: 'add_condition', name: 'Frightened' },
    { op: 'remove_condition', name: 'Frightened' },
    { op: 'clear_stance' },
    // Stances specifically: a level-1 trait may be taken as "a new stance", so holding one off
    // your class list is legal play, not a rules break.
    { op: 'set_active_stance', name: 'Offensive' },
  ];
  for (const op of playOps) {
    it(`${op.op} passes untouched`, () => {
      expect(gateIgEdit(arcanist(), op, VANILLA).edit).toEqual(op);
    });
  }
});

describe('specializations', () => {
  it('are refused below level 4 even when they belong to the class', () => {
    const r = gateIgSpecialization(arcanist({ level: 3 }), 'Synergist', VANILLA);
    expect(r.refusal).toContain('level 4');
  });

  it('are accepted at level 4', () => {
    expect(gateIgSpecialization(arcanist({ level: 4 }), 'Synergist', VANILLA).refusal).toBeUndefined();
  });
});

describe('the context is read from the sheet, not guessed', () => {
  it('carries class, subclass, level and known powers', () => {
    const ig = { ...arcanist({ level: 6, specialization: 'Synergist (dual elements)' }), powers: ['Magic Trick'] };
    const ctx = igContextFor(ig);
    expect(ctx).toMatchObject({ className: 'Wizard', subclass: 'Arcanist', level: 6 });
    expect(ctx.knownPowers).toContain('Magic Trick');
    expect(ctx.specializations).toContain('Synergist (dual elements)');
  });

  it('an empty specialization does not become a phantom entry', () => {
    expect(igContextFor(arcanist()).specializations).toEqual([]);
  });
});

describe('both IG routes call it — gating one would just move the hole', () => {
  it('the AI path gates before applying', () => {
    const src = read('app/api/dnd/characters/[id]/ai-edit/route.ts');
    expect(src).toContain('gateIgEdit(igData as IGCharacter');
    expect(src).toContain('applyIgEdit(igData as IGCharacter, igGate.edit)');
    expect(src).not.toMatch(/enforce:\s*body\./);
  });

  it('the manual path gates too', () => {
    // Gating only the AI would make "use the manual control instead" a way around the rules.
    const src = read('app/api/dnd/characters/[id]/ig-edit/route.ts');
    expect(src).toContain('gateIgEdit(ig, parsed.edit');
    expect(src).toContain('applyIgEdit(ig, gate.edit)');
  });

  it('both default an unlabelled character to vanilla', () => {
    for (const p of [
      'app/api/dnd/characters/[id]/ai-edit/route.ts',
      'app/api/dnd/characters/[id]/ig-edit/route.ts',
    ]) {
      expect(read(p), p).toContain(".kind ?? 'vanilla'");
    }
  });
});

describe('the build path is gated too (IG S4)', () => {
  const picks = (over: Record<string, unknown> = {}) => ({
    className: 'Wizard', subclass: 'Arcanist', level: 1, powers: ['Elemental Strike'], ...over,
  });

  it('refuses an off-class power at build time for a vanilla character', () => {
    const r = gateIgPicks(picks({ powers: ['Elemental Strike', 'Entangle'] }), VANILLA);
    expect(r.refused.map((x) => x.name)).toEqual(['Entangle']);
  });

  it('allows a legal build untouched', () => {
    expect(gateIgPicks(picks(), VANILLA).refused).toHaveLength(0);
  });

  it('does not treat the picks under review as already-known', () => {
    // Seeding knownPowers from picks.powers would make every build vacuously legal — the power
    // being checked would always already be "on the sheet".
    expect(gateIgPicks(picks({ powers: ['Entangle'] }), VANILLA).refused).toHaveLength(1);
  });

  it('marks rather than refuses for a custom character', () => {
    const r = gateIgPicks(picks({ powers: ['Entangle'] }), CUSTOM);
    expect(r.refused).toHaveLength(0);
    expect(r.offRules['Entangle']).toBeTruthy();
  });

  it('refuses a specialization taken below level 4', () => {
    const r = gateIgPicks(picks({ specialization: 'Synergist', level: 1 }), VANILLA);
    expect(r.refused.some((x) => x.name === 'Synergist')).toBe(true);
  });

  it('the build route calls it and reports what it refused', () => {
    const src = read('app/api/dnd/characters/[id]/ig-build/route.ts');
    expect(src).toContain('gateIgPicks(picks');
    expect(src).toContain('buildGate.refused');
    expect(src).toContain(".kind ?? 'vanilla'");
  });

  it('the submission gate remains a SEPARATE axis, not replaced by this', () => {
    // igIsVanilla is name-in-catalog only: a Druid power on an Arcanist reads as vanilla book
    // content and passes submission untouched. Both checks are needed; neither substitutes.
    const src = read('lib/dnd/systems/intuitive-games/rules-gate.ts');
    expect(src).toContain('igIsVanilla');
    expect(src).toContain('is this from the book');
  });
});

describe('the marker is stored on the sheet, not only in the reply (IG S3)', () => {
  it('records the reason against the power name', () => {
    const ig = markIgOffRules(arcanist(), 'Entangle', 'Entangle is not an Arcanist power.');
    expect(ig.offRules?.['Entangle']).toContain('Arcanist');
  });

  it('an empty reason CLEARS the entry rather than storing a blank', () => {
    // A level-up can make previously-off-rules content legal. A blank string would linger as a
    // truthy-but-meaningless flag and render an unexplained ⚑.
    const marked = markIgOffRules(arcanist(), 'Entangle', 'nope');
    expect(markIgOffRules(marked, 'Entangle', '').offRules).toBeUndefined();
    expect(markIgOffRules(marked, 'Entangle', undefined).offRules).toBeUndefined();
  });

  it('drops the field entirely when nothing is marked', () => {
    // So an ordinary character's stored data is byte-identical to before this feature existed.
    expect('offRules' in markIgOffRules(arcanist(), 'X', '')).toBe(false);
  });

  it('does not mutate the input', () => {
    const before = arcanist();
    markIgOffRules(before, 'Entangle', 'nope');
    expect(before.offRules).toBeUndefined();
  });

  it('keeps other entries when one is cleared', () => {
    let ig = markIgOffRules(arcanist(), 'Entangle', 'a');
    ig = markIgOffRules(ig, 'Bane', 'b');
    ig = markIgOffRules(ig, 'Entangle', '');
    expect(ig.offRules).toEqual({ Bane: 'b' });
  });

  it('is additive on the model — no migration for existing characters', () => {
    // blankIGCharacter does not set it, so every IG character already in the database stays valid.
    expect(blankIGCharacter('x').offRules).toBeUndefined();
  });

  it('all three routes persist it', () => {
    for (const p of [
      'app/api/dnd/characters/[id]/ai-edit/route.ts',
      'app/api/dnd/characters/[id]/ig-edit/route.ts',
      'app/api/dnd/characters/[id]/ig-build/route.ts',
    ]) {
      expect(read(p), p).toContain('markIgOffRules');
    }
  });

  it('the IG sheet renders it', () => {
    // The gated controls moved into the IG panel set (useIgPanels, T-6a); the Classic shell (IGSheet) is
    // now thin. Read both so the source anchor holds wherever the code lives.
    const src = read('app/dnd/_ui/IGSheet.tsx') + read('app/dnd/_ui/ig/useIgPanels.tsx');
    expect(src).toContain('OffRulesMark');
    expect(src).toContain('ig.offRules?.[p]');
  });
});

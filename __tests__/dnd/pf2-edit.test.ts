// __tests__/dnd/pf2-edit.test.ts — Area SQ4. The PF2 in-play edit vocabulary: apply damage / heal / temp HP /
// the dying-wounded death track. Pure + immutable, mirroring the IG edit path; the AI tool reuses the parser.
import { describe, it, expect } from 'vitest';
import { applyPf2Edit, parsePf2Edit, describePf2Edit, PF2_EDIT_OPS } from '@/lib/dnd/systems/pathfinder2e/edit';
import { PF2_EDIT_TOOL, parsePF2EditToolCall } from '@/lib/dnd/systems/pathfinder2e/ai';
import { pf2MaxHp } from '@/lib/dnd/systems/pathfinder2e/rules';
import type { PF2Character } from '@/lib/dnd/systems/pathfinder2e/model';
import { assertCharacterScopedOps } from '@/lib/dnd/ai-scope';

function fighter(): PF2Character {
  return {
    identity: { name: 'D', level: 5, ancestry: 'Dwarf', heritage: '', background: 'Warrior', className: 'Fighter', subclass: '', deity: '', size: 'Medium', alignment: '', bio: '', photoUrl: '' } as PF2Character['identity'],
    attributes: { STR: 4, DEX: 1, CON: 3, INT: 0, WIS: 2, CHA: 0 },
    perception: { rank: 'expert' },
    saves: { Fortitude: { rank: 'expert', itemBonus: 0 }, Reflex: { rank: 'trained', itemBonus: 0 }, Will: { rank: 'expert', itemBonus: 0 } },
    skills: [], combat: { ancestryHp: 10, classHpPerLevel: 10, currentHp: 0, tempHp: 0, dyingValue: 0, woundedValue: 0, speed: 20, armorRank: 'trained', dexCap: 0, acItemBonus: 0, attackRank: 'expert', classDcRank: 'expert', classDcAttribute: 'STR' } as PF2Character['combat'],
    attacks: [], spellcasting: { tradition: 'none', kind: 'none', attribute: 'INT', rank: 'untrained', slots: [] }, feats: [], languages: [],
  };
}

describe('PF2 HP edits (SQ4)', () => {
  it('apply_damage soaks temp HP first, then real HP, flooring at 0', () => {
    const c = fighter(); const max = pf2MaxHp(c); // 10 + (10+3)*4... via rules
    const withTemp = applyPf2Edit(c, { op: 'set_temp_hp', amount: 5 });
    const hurt = applyPf2Edit(withTemp, { op: 'apply_damage', amount: 8 }); // 5 temp + 3 real
    expect(hurt.combat.tempHp).toBe(0);
    expect(hurt.combat.currentHp).toBe(max - 3);
    // overkill floors at 0
    expect(applyPf2Edit(c, { op: 'apply_damage', amount: 9999 }).combat.currentHp).toBe(0);
    expect(c.combat.currentHp).toBe(0); // input not mutated (0 = full)
  });
  it('heal restores HP (capped at max) and clears Dying when brought above 0', () => {
    let c = fighter();
    c = applyPf2Edit(c, { op: 'apply_damage', amount: 9999 }); // to 0
    c = applyPf2Edit(c, { op: 'set_dying', value: 2 });
    const healed = applyPf2Edit(c, { op: 'heal', amount: 10 });
    expect(healed.combat.currentHp).toBe(10);
    expect(healed.combat.dyingValue).toBe(0); // regaining HP clears Dying
    expect(healed.combat.woundedValue).toBe(1); // PF2: losing Dying increases Wounded by 1
    // heal caps at max
    expect(applyPf2Edit(fighter(), { op: 'heal', amount: 9999 }).combat.currentHp).toBe(pf2MaxHp(fighter()));
  });

  // ⚠ OPEN FINDING (rules interpretation, owner to confirm) — damage to an ALREADY-downed character does not
  // auto-escalate Dying, though PF2 RAW increases a dying creature's Dying by 1 (2 on a crit) when it takes
  // damage. `apply_damage` fires the Dying-set only on the TRANSITION to 0 (`effCur > 0`). This pins the
  // CURRENT behavior so it's explicit + can't change silently; escalating a downed PC's death clock on every
  // hit is a heavier, crit-aware call best made in the UI with the DM (see the note in edit.ts).
  it('does NOT auto-increment Dying when an already-at-0 character takes more damage (current behavior, flagged)', () => {
    let c = fighter();
    c = applyPf2Edit(c, { op: 'apply_damage', amount: 9999 }); // to 0 HP (no Dying set yet — was at full, one drop)
    c = applyPf2Edit(c, { op: 'set_dying', value: 1 });        // now Dying 1, at 0 HP
    const hitAgain = applyPf2Edit(c, { op: 'apply_damage', amount: 5 }); // more damage while down
    expect(hitAgain.combat.currentHp).toBe(0);      // still 0
    expect(hitAgain.combat.dyingValue).toBe(1);     // Dying UNCHANGED (RAW would make this 2) — the flagged call
  });
});

describe('PF2 death track edits (SQ4)', () => {
  it('set_dying clamps 0–4; set_wounded sets the value', () => {
    expect(applyPf2Edit(fighter(), { op: 'set_dying', value: 9 }).combat.dyingValue).toBe(4);
    expect(applyPf2Edit(fighter(), { op: 'set_dying', value: 0 }).combat.dyingValue).toBe(0);
    expect(applyPf2Edit(fighter(), { op: 'set_wounded', value: 2 }).combat.woundedValue).toBe(2);
  });
});

describe('PF2 edit parsing + AI parity + scope (SQ4)', () => {
  it('parses amount/value ops and rejects unknown', () => {
    expect(parsePf2Edit({ op: 'apply_damage', amount: 0 })).toEqual({ error: expect.stringMatching(/positive "amount"/) });
    expect(parsePf2Edit({ op: 'apply_damage', amount: 6 })).toEqual({ edit: { op: 'apply_damage', amount: 6 } });
    expect(parsePf2Edit({ op: 'set_dying', value: 3 })).toEqual({ edit: { op: 'set_dying', value: 3 } });
    expect(parsePf2Edit({ op: 'nuke' })).toHaveProperty('error');
    expect(describePf2Edit({ op: 'set_dying', value: 3 })).toMatch(/Dying 3/);
  });
  it('the AI edit tool exposes the same ops + runs through the same parser', () => {
    expect((PF2_EDIT_TOOL.input_schema.properties.op as { enum: string[] }).enum).toEqual([...PF2_EDIT_OPS]);
    expect(parsePF2EditToolCall({ op: 'heal', amount: 4 })).toEqual({ edit: { op: 'heal', amount: 4 } });
  });
  it('every PF2 edit op is character-scoped (no out-of-sheet reach)', () => {
    expect(() => assertCharacterScopedOps([...PF2_EDIT_OPS])).not.toThrow();
  });
});

describe('PF2 wounded escalation on recovery (rules correctness)', () => {
  it('a second knockdown-and-recovery cycle raises Dying by the accumulated Wounded (PF2)', () => {
    let c = fighter();
    // 1st drop → Dying 1 (Wounded 0 + 1). Recover → Dying 0, Wounded 1.
    c = applyPf2Edit(c, { op: 'apply_damage', amount: 9999 });
    expect(c.combat.dyingValue).toBe(1);
    c = applyPf2Edit(c, { op: 'heal', amount: 5 });
    expect(c.combat.woundedValue).toBe(1);
    // 2nd drop while Wounded 1 → Dying = 1 + Wounded 1 = 2 (the escalation the rule creates).
    c = applyPf2Edit(c, { op: 'apply_damage', amount: 9999 });
    expect(c.combat.dyingValue).toBe(2);
  });
});

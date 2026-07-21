// __tests__/dnd/pf2-edit.test.ts — Area SQ4. The PF2 in-play edit vocabulary: apply damage / heal / temp HP /
// the dying-wounded death track. Pure + immutable, mirroring the IG edit path; the AI tool reuses the parser.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
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

  // Damage to an ALREADY-downed character now follows the downedDamageModel preference (default 'official' =
  // PF2 RAW: a dying creature's Dying value rises by 1, or by 2 on a crit, when it takes damage). 'off' is the
  // gentler house rule where a downed PC's Dying only advances on failed recovery saves.
  it('official (default): damage to an already-dying character increases Dying by 1 (2 on a crit)', () => {
    let c = fighter();
    c = applyPf2Edit(c, { op: 'apply_damage', amount: 9999 }); // to 0 HP (Dying set on the transition)
    c = applyPf2Edit(c, { op: 'set_dying', value: 1 });        // now Dying 1, at 0 HP
    const hitAgain = applyPf2Edit(c, { op: 'apply_damage', amount: 5 }); // more damage while down
    expect(hitAgain.combat.currentHp).toBe(0);      // still 0
    expect(hitAgain.combat.dyingValue).toBe(2);     // RAW: +1
    const crit = applyPf2Edit(c, { op: 'apply_damage', amount: 5, crit: true });
    expect(crit.combat.dyingValue).toBe(3);         // RAW: +2 on a crit
    // Dying is capped at 4 (dead).
    const lethal = applyPf2Edit({ ...c, combat: { ...c.combat, dyingValue: 4 } }, { op: 'apply_damage', amount: 5 });
    expect(lethal.combat.dyingValue).toBe(4);
  });

  it('off: damage to an already-dying character leaves Dying unchanged (house rule)', () => {
    let c = fighter();
    c = applyPf2Edit(c, { op: 'apply_damage', amount: 9999 });
    c = applyPf2Edit(c, { op: 'set_dying', value: 1 });
    const hitAgain = applyPf2Edit(c, { op: 'apply_damage', amount: 5 }, { downedDamageModel: 'off' });
    expect(hitAgain.combat.dyingValue).toBe(1);     // unchanged
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
  it('applyPf2Edit has a case for EVERY advertised op (no silent no-op edit — parity with the IG guard)', () => {
    // The tool enum equals PF2_EDIT_OPS (asserted above), so the AI can emit any of them. If a future op is
    // added to the list + schema but not to applyPf2Edit's switch, it falls through and changes nothing while
    // the AI reports success — a silent no-op. Source-anchor the applier so that drift fails here.
    const src = fs.readFileSync(path.join(process.cwd(), 'lib/dnd/systems/pathfinder2e/edit.ts'), 'utf8');
    const body = src.slice(src.indexOf('export function applyPf2Edit'), src.indexOf('export function parsePf2Edit'));
    for (const op of PF2_EDIT_OPS) {
      expect(body.includes(`case '${op}'`), `applyPf2Edit has no case for "${op}" — the AI's PF2 edit would silently do nothing`).toBe(true);
    }
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

describe('PF2 set_attribute (in-play stat edit, AI parity with IG set_ability)', () => {
  it('sets one attribute modifier, immutably, leaving the rest', () => {
    const c = fighter();
    const before = JSON.stringify(c);
    const out = applyPf2Edit(c, { op: 'set_attribute', attribute: 'STR', value: 6 });
    expect(out.attributes.STR).toBe(6);
    expect(out.attributes.DEX).toBe(c.attributes.DEX);
    expect(JSON.stringify(c)).toBe(before); // input unchanged
  });
  it('clamps to the legal PF2 modifier range (−5..12)', () => {
    const c = fighter();
    expect(applyPf2Edit(c, { op: 'set_attribute', attribute: 'CON', value: 99 }).attributes.CON).toBe(12);
    expect(applyPf2Edit(c, { op: 'set_attribute', attribute: 'CON', value: -20 }).attributes.CON).toBe(-5);
  });
  it('parses a case-insensitive attribute + numeric value; rejects bad ones', () => {
    expect(parsePf2Edit({ op: 'set_attribute', attribute: 'dex', value: '3' })).toEqual({ edit: { op: 'set_attribute', attribute: 'DEX', value: 3 } });
    expect('error' in parsePf2Edit({ op: 'set_attribute', attribute: 'LUK', value: 2 })).toBe(true);
    expect('error' in parsePf2Edit({ op: 'set_attribute', attribute: 'STR', value: 'x' })).toBe(true);
  });
  it('is in PF2_EDIT_OPS, describes itself with a signed modifier, and is on the AI tool', () => {
    expect(PF2_EDIT_OPS).toContain('set_attribute');
    expect(describePf2Edit({ op: 'set_attribute', attribute: 'WIS', value: 2 })).toBe('Set WIS to +2.');
    expect(JSON.stringify(PF2_EDIT_TOOL)).toContain('set_attribute');
  });
});

describe('PF2 sheet exposes an inline attribute editor (R4 manual UI)', () => {
  const SHEET = fs.readFileSync(path.join(process.cwd(), 'app/dnd/_ui/PF2Sheet.tsx'), 'utf8');
  const PAGE = fs.readFileSync(path.join(process.cwd(), 'app/dnd/characters/[id]/page.tsx'), 'utf8');
  it('wires an edit-gated inline input per attribute to the pf2-edit set_attribute op', () => {
    expect(SHEET).toContain("postEdit({ op: 'set_attribute', attribute: k, value: v })");
    expect(SHEET).toContain('/api/dnd/characters/${characterId}/pf2-edit');
    expect(SHEET).toContain('const canDoEdit = !!(canEdit && characterId)');
  });
  it('the page passes characterId + canEdit so the controls appear only for editors', () => {
    // Asserted per-prop rather than as one exact line: the element gained isDM and variantKind
    // when the content picker landed, and a whole-line match breaks on every future prop for no
    // behavioural reason.
    expect(PAGE).toMatch(/<PF2Sheet[\s\S]*?pf2=\{pf2Data\}/);
    expect(PAGE).toMatch(/<PF2Sheet[\s\S]*?characterId=\{character\.id\}/);
    expect(PAGE).toMatch(/<PF2Sheet[\s\S]*?canEdit=\{canWrite\}/);
  });
});

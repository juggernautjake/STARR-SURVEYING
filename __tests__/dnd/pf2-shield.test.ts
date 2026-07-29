// Pathfinder 2e shields (P5-2, audit finding C-2).
//
// `PF2_SHIELDS` was catalogued with hardness, HP and Break Threshold, and `pf2Shield()` was exported and
// NEVER CALLED — so the engine had no Raise a Shield (the most-used defensive action in the game), no
// Shield Block, no shield damage and no broken state.
//
// The two rules that are silently wrong if you take the obvious shortcut are pinned by name below.
import { describe, expect, it } from 'vitest';
import {
  resolveShield, shieldAcBonus, shieldBlock, describeShield, shieldOptions,
} from '@/lib/dnd/systems/pathfinder2e/shield';
import { pf2ArmorClass } from '@/lib/dnd/systems/pathfinder2e/rules';
import { applyPf2Edit, PF2_EDIT_OPS } from '@/lib/dnd/systems/pathfinder2e/edit';
import { blankPF2Character } from '@/lib/dnd/systems/pathfinder2e/model';
import { assertCharacterScopedOps } from '@/lib/dnd/ai-scope';

const steel = { name: 'Steel Shield' };

describe('resolving a shield against the catalogue', () => {
  it('fills the numbers in from the data file', () => {
    const s = resolveShield(steel)!;
    expect(s).toMatchObject({ acBonus: 2, hardness: 5, maxHp: 20, bt: 10 });
    expect(s.currentHp).toBe(20); // undamaged by default
  });

  it('a homebrew shield resolves from overrides without being in the catalogue', () => {
    const s = resolveShield({ name: 'Aegis of Nothing', acBonus: 3, hardness: 9, hp: 40, bt: 20 })!;
    expect(s).toMatchObject({ acBonus: 3, hardness: 9, maxHp: 40, bt: 20 });
    expect(s.def).toBeNull();
  });

  it('is broken AT the threshold, not just below it', () => {
    expect(resolveShield({ ...steel, currentHp: 11 })!.broken).toBe(false);
    expect(resolveShield({ ...steel, currentHp: 10 })!.broken).toBe(true);
  });

  it('and destroyed at 0', () => {
    expect(resolveShield({ ...steel, currentHp: 0 })!.destroyed).toBe(true);
  });

  it('returns null for no shield', () => {
    expect(resolveShield(null)).toBeNull();
    expect(resolveShield({ name: '  ' })).toBeNull();
  });
});

describe('the AC bonus applies ONLY while raised', () => {
  it('nothing when lowered', () => {
    // The tempting shortcut is to fold the shield into `acItemBonus`, which already exists — that hands
    // every shield user a permanent +2 they have not earned and shifts every DC they face.
    expect(shieldAcBonus(resolveShield(steel))).toBe(0);
  });

  it('the bonus when raised', () => {
    expect(shieldAcBonus(resolveShield({ ...steel, raised: true }))).toBe(2);
  });

  it('nothing when raised but BROKEN — which is what makes Shield Block a real decision', () => {
    expect(shieldAcBonus(resolveShield({ ...steel, raised: true, currentHp: 5 }))).toBe(0);
  });

  it('nothing when destroyed', () => {
    expect(shieldAcBonus(resolveShield({ ...steel, raised: true, currentHp: 0 }))).toBe(0);
  });
});

describe('pf2ArmorClass finally sees the shield', () => {
  const base = blankPF2Character('T');

  it('is unchanged for a character with no shield — which is every character stored before this', () => {
    const before = pf2ArmorClass(base);
    expect(pf2ArmorClass({ ...base, combat: { ...base.combat, shield: undefined } })).toBe(before);
  });

  it('adds nothing for a lowered shield', () => {
    const c = { ...base, combat: { ...base.combat, shield: steel } };
    expect(pf2ArmorClass(c)).toBe(pf2ArmorClass(base));
  });

  it('and +2 for a raised one', () => {
    const c = { ...base, combat: { ...base.combat, shield: { ...steel, raised: true } } };
    expect(pf2ArmorClass(c)).toBe(pf2ArmorClass(base) + 2);
  });

  it('the bonus is NOT stored in acItemBonus — it is a circumstance bonus', () => {
    // PF2's bonus types do not stack with themselves. Putting a circumstance bonus in the item slot would
    // let it stack with things it must not.
    const c = { ...base, combat: { ...base.combat, shield: { ...steel, raised: true } } };
    expect(c.combat.acItemBonus).toBe(base.combat.acItemBonus);
  });
});

describe('Shield Block', () => {
  const raised = resolveShield({ ...steel, raised: true })!;

  it('Hardness reduces the damage for BOTH — which is why blocking a big hit still hurts', () => {
    const r = shieldBlock(raised, 12)!;
    expect(r.damageAbsorbed).toBe(5);   // hardness
    expect(r.damageTaken).toBe(7);      // overflow reaches the character
    expect(r.shieldDamage).toBe(7);     // and the shield
    expect(r.shieldHpAfter).toBe(13);
  });

  it('absorbs a small hit entirely', () => {
    const r = shieldBlock(raised, 3)!;
    expect(r.damageTaken).toBe(0);
    expect(r.shieldHpAfter).toBe(20);
  });

  it('reports breaking when the overflow crosses the threshold', () => {
    const r = shieldBlock(resolveShield({ ...steel, raised: true, currentHp: 14 })!, 9)!;
    expect(r.shieldHpAfter).toBe(10);
    expect(r.brokeNow).toBe(true);
    expect(r.note).toMatch(/broken/);
  });

  it('and destruction at 0', () => {
    // Starts at 11 — ABOVE the Break Threshold of 10, so it is still a usable shield. A shield already at
    // 3 HP is broken and cannot block at all, which is what the first draft of this test got wrong.
    const r = shieldBlock(resolveShield({ ...steel, raised: true, currentHp: 11 })!, 30)!;
    expect(r.shieldHpAfter).toBe(0);
    expect(r.destroyedNow).toBe(true);
    expect(r.brokeNow, 'destroyed passes through broken on the way down').toBe(true);
  });

  it('refuses when the shield cannot block', () => {
    expect(shieldBlock(resolveShield(steel), 10)).toBeNull();                                    // lowered
    expect(shieldBlock(resolveShield({ ...steel, raised: true, currentHp: 5 }), 10)).toBeNull();  // broken
    expect(shieldBlock(null, 10)).toBeNull();
  });
});

describe('the edit ops', () => {
  const withShield = (over = {}) => {
    const c = blankPF2Character('T');
    return { ...c, combat: { ...c.combat, shield: { ...steel, ...over } } };
  };

  it('raises and lowers', () => {
    const up = applyPf2Edit(withShield(), { op: 'set_shield_raised', raised: true });
    expect(up.combat.shield?.raised).toBe(true);
    expect(applyPf2Edit(up, { op: 'set_shield_raised', raised: false }).combat.shield?.raised).toBe(false);
  });

  it('refuses to raise a shield that is not there, rather than inventing one', () => {
    const bare = blankPF2Character('T');
    expect(applyPf2Edit(bare, { op: 'set_shield_raised', raised: true }).combat.shield).toBeUndefined();
  });

  it('an EMPTY name puts the shield away — absent means "do not touch", empty means "there is none"', () => {
    const gone = applyPf2Edit(withShield(), { op: 'set_shield', name: '' });
    expect(gone.combat.shield).toBeUndefined();
  });

  it('a block damages the shield AND the character', () => {
    const c = { ...withShield({ raised: true }) };
    c.combat.currentHp = 30;
    const after = applyPf2Edit(c, { op: 'apply_shield_block', damage: 12 });
    expect(after.combat.shield?.currentHp).toBe(13);
    expect(after.combat.currentHp).toBe(23); // 30 − 7 overflow
  });

  it('a refused block changes NOTHING rather than falling through to a normal hit', () => {
    // Silently applying the damage anyway would turn a refused block into an ordinary hit the player
    // never chose to take.
    const c = withShield(); // lowered
    c.combat.currentHp = 30;
    expect(applyPf2Edit(c, { op: 'apply_shield_block', damage: 12 })).toEqual(c);
  });
});

describe('the op names stay within the AI boundary', () => {
  it('every PF2 op is character-scoped', () => {
    // `shield_block` was the original name and this guard REFUSED it — correctly, since op names must read
    // as sheet mutations (set/add/remove/update/apply). Renamed to `apply_shield_block` rather than
    // widening the rule, which is the fix that keeps the boundary meaningful.
    expect(() => assertCharacterScopedOps([...PF2_EDIT_OPS])).not.toThrow();
    expect(PF2_EDIT_OPS).toContain('apply_shield_block');
  });
});

describe('display', () => {
  it('says what state it is in', () => {
    expect(describeShield(resolveShield({ ...steel, raised: true }))).toMatch(/raised \(\+2 AC\)/);
    expect(describeShield(resolveShield({ ...steel, currentHp: 5 }))).toMatch(/broken/);
    expect(describeShield(null)).toBe('');
  });

  it('and the catalogue is offerable', () => {
    expect(shieldOptions().map((s) => s.name)).toContain('Tower Shield');
  });
});

// __tests__/dnd/ig-resolve.test.ts — the IG sheet's maths with stances and conditions folded in.
//
// S11. modifiers.ts modelled stances and conditions, rules.ts computed the base numbers, and the
// two never met: a Shaken character saw "-2 to rolls" as a NOTE while their attack bonus on the
// sheet stayed unchanged. These pin the folding.
import { describe, it, expect } from 'vitest';
import {
  igResolveAttackInPlay, igResolveSavesInPlay, igResolveDamageReduction,
  igResolveSkillsInPlay, igInPlayState, combineSwing, halfLevel,
} from '@/lib/dnd/systems/intuitive-games/resolve';
import { igAttackBonus, igAbilityMod } from '@/lib/dnd/systems/intuitive-games/rules';
import { blankIGCharacter } from '@/lib/dnd/systems/intuitive-games/model';

const make = (over: (c: ReturnType<typeof blankIGCharacter>) => void) => {
  const c = blankIGCharacter('Test');
  c.identity.level = 6;
  c.abilities.STR = 16;
  c.combat.attacks = [{ name: 'Sword', ability: 'STR', damage: '1d8', proficient: true } as never];
  over(c);
  return c;
};

describe('helpers', () => {
  it('cancels advantage against disadvantage rather than stacking', () => {
    expect(combineSwing(true, true)).toBe('none');
    expect(combineSwing(true, false)).toBe('advantage');
    expect(combineSwing(false, true)).toBe('disadvantage');
    expect(combineSwing(false, false)).toBe('none');
  });

  it('rounds half level down', () => {
    expect(halfLevel(6)).toBe(3);
    expect(halfLevel(5)).toBe(2);
    expect(halfLevel(0)).toBe(0);
  });
});

describe('conditions actually reduce the numbers', () => {
  it('applies the flat penalty to the attack bonus, not just a note', () => {
    const clean = make(() => {});
    const shaken = make((c) => { c.combat.conditions = ['Shaken']; });
    const base = igResolveAttackInPlay(clean, clean.combat.attacks[0]).toHit;
    const hit = igResolveAttackInPlay(shaken, shaken.combat.attacks[0]);
    expect(hit.toHit).toBe(base - 2);
    expect(hit.reasons.join(' ')).toContain('Shaken');
  });

  it('stacks two flat-penalty conditions', () => {
    const c = make((x) => { x.combat.conditions = ['Shaken', 'Sickened']; });
    const base = igResolveAttackInPlay(make(() => {}), c.combat.attacks[0]).toHit;
    expect(igResolveAttackInPlay(c, c.combat.attacks[0]).toHit).toBe(base - 4);
  });

  it('applies the same penalty to saves and skills', () => {
    const c = make((x) => { x.combat.conditions = ['Shaken']; });
    const clean = make(() => {});
    const s = igResolveSavesInPlay(c);
    const sClean = igResolveSavesInPlay(clean);
    for (let i = 0; i < s.length; i++) expect(s[i].total).toBe(sClean[i].total - 2);
    const sk = igResolveSkillsInPlay(c);
    const skClean = igResolveSkillsInPlay(clean);
    for (let i = 0; i < sk.length; i++) expect(sk[i].total).toBe(skClean[i].total - 2);
  });
});

describe('stances actually change the numbers', () => {
  it('Offensive at low level gives advantage on attacks and disadvantage on Reflex', () => {
    const c = make((x) => { x.identity.level = 3; x.combat.stances = ['Offensive']; });
    expect(igResolveAttackInPlay(c, c.combat.attacks[0]).swing).toBe('advantage');
    const reflex = igResolveSavesInPlay(c).find((s) => s.key === 'Reflex')!;
    expect(reflex.swing).toBe('disadvantage');
  });

  it('Defensive at low level is the mirror image', () => {
    const c = make((x) => { x.identity.level = 3; x.combat.stances = ['Defensive']; });
    expect(igResolveAttackInPlay(c, c.combat.attacks[0]).swing).toBe('disadvantage');
    expect(igResolveSavesInPlay(c).find((s) => s.key === 'Reflex')!.swing).toBe('advantage');
  });

  it('Advanced Offensive (level 5+) adds half level to DAMAGE instead', () => {
    // The advanced tier REPLACES the basic one, so the advantage is gone and damage rises.
    const c = make((x) => { x.identity.level = 6; x.combat.stances = ['Offensive']; });
    const r = igResolveAttackInPlay(c, c.combat.attacks[0]);
    expect(r.damage).toContain('+6'); // STR +3 and half of level 6 = +3
    expect(r.swing).toBe('none');
    expect(r.reasons.join(' ')).toContain('advanced');
  });

  it('Advanced Defensive grants DR equal to half level, on top of gear', () => {
    const c = make((x) => { x.identity.level = 6; x.combat.stances = ['Defensive']; x.combat.damageReduction = 2; });
    const dr = igResolveDamageReduction(c);
    expect(dr.dr).toBe(5); // 2 gear + 3 stance
    expect(dr.reasons.join(' ')).toContain('gear');
  });

  it('reports a CONDITIONAL stance clause instead of silently applying it', () => {
    // Swarming grants advantage "when flanking" — the sheet cannot know if you are, and
    // assuming it would inflate every attack.
    const c = make((x) => { x.identity.level = 3; x.combat.stances = ['Swarming']; });
    const r = igResolveAttackInPlay(c, c.combat.attacks[0]);
    expect(r.swing).toBe('none');
    expect(r.reasons.join(' ')).toMatch(/apply if it holds/);
  });

  it('leaves the numbers alone for a stance with no roll effect', () => {
    const c = make((x) => { x.combat.stances = ['Mobile']; });
    const plain = make(() => {});
    expect(igResolveAttackInPlay(c, c.combat.attacks[0]).toHit)
      .toBe(igResolveAttackInPlay(plain, plain.combat.attacks[0]).toHit);
  });
});

describe('stance and condition together', () => {
  it('cancels when a stance gives advantage and a condition takes it away', () => {
    const c = make((x) => { x.identity.level = 3; x.combat.stances = ['Offensive']; x.combat.conditions = ['Prone']; });
    // Prone imposes disadvantage on melee attack rolls; Offensive basic grants advantage.
    expect(igResolveAttackInPlay(c, c.combat.attacks[0]).swing).toBe('none');
  });

  it('igInPlayState gathers everything the sheet needs', () => {
    const c = make((x) => { x.identity.level = 6; x.combat.stances = ['Defensive']; x.combat.conditions = ['Shaken']; });
    const st = igInPlayState(c);
    expect(st.stance?.name).toBe('Defensive');
    expect(st.conditionPenalty).toBe(-2);
    expect(st.damageReduction.dr).toBe(3);
    expect(st.saves).toHaveLength(3);
    // A blank character has no skills yet, so assert the SHAPE rather than a count that only
    // holds for a filled-in sheet.
    expect(Array.isArray(st.skills)).toBe(true);
  });
});

describe('the base maths is untouched', () => {
  it('rules.ts still reports the unmodified bonus', () => {
    // resolve.ts answers "what is it right now"; rules.ts must keep answering "what is it".
    const c = make((x) => { x.combat.conditions = ['Shaken']; });
    const raw = igAttackBonus(c.combat.attacks[0], c.identity.level, igAbilityMod(c.abilities.STR));
    expect(igResolveAttackInPlay(c, c.combat.attacks[0]).toHit).toBe(raw - 2);
  });
});

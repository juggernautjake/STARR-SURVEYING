// __tests__/dnd/ig-resolve.test.ts — the IG sheet's DISPLAYED numbers, resolved (S11).
//
// The roll path already folded stances and conditions correctly; what the sheet SHOWED was the
// base value, so a Shaken character read "+7 Reflex" on the card and rolled +5. resolve.ts makes
// the card say what you are about to roll, DELEGATING to the canonical effect functions rather
// than re-deriving them — a third implementation of these rules is exactly what this avoids.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  igResolveAttackInPlay, igResolveSavesInPlay, igResolveDamageReduction,
  igResolveSkillsInPlay, igInPlayState, combineSwing, activeStanceOf,
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
const atk = (c: ReturnType<typeof blankIGCharacter>) => igResolveAttackInPlay(c, c.combat.attacks[0]);

describe('helpers', () => {
  it('cancels advantage against disadvantage rather than stacking', () => {
    expect(combineSwing(true, true)).toBe('none');
    expect(combineSwing(true, false)).toBe('advantage');
    expect(combineSwing(false, true)).toBe('disadvantage');
    expect(combineSwing(false, false)).toBe('none');
  });

  it('reads the active stance from the one-element slot IG stores it in', () => {
    expect(activeStanceOf(make((c) => { c.combat.stances = ['Offensive']; }))).toBe('Offensive');
    expect(activeStanceOf(make(() => {}))).toBeNull();
  });
});

describe('conditions reduce the DISPLAYED numbers', () => {
  it('applies the flat penalty to the shown attack bonus', () => {
    const base = atk(make(() => {})).toHit;
    const hit = atk(make((c) => { c.combat.conditions = ['Shaken']; }));
    expect(hit.toHit).toBe(base - 2);
    expect(hit.sources.join(' ')).toMatch(/shaken/i);
  });

  it('stacks two flat-penalty conditions', () => {
    const base = atk(make(() => {})).toHit;
    expect(atk(make((c) => { c.combat.conditions = ['Shaken', 'Sickened']; })).toHit).toBe(base - 4);
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

describe('stances change the DISPLAYED numbers', () => {
  it('Offensive at low level: advantage on attacks, disadvantage on Reflex', () => {
    const c = make((x) => { x.identity.level = 3; x.combat.stances = ['Offensive']; });
    expect(atk(c).swing).toBe('advantage');
    expect(igResolveSavesInPlay(c).find((s) => s.key === 'Reflex')!.swing).toBe('disadvantage');
  });

  it('Defensive at low level is the mirror image', () => {
    const c = make((x) => { x.identity.level = 3; x.combat.stances = ['Defensive']; });
    expect(atk(c).swing).toBe('disadvantage');
    expect(igResolveSavesInPlay(c).find((s) => s.key === 'Reflex')!.swing).toBe('advantage');
  });

  it('Advanced Offensive (level 5+) adds half level to DAMAGE instead of advantage', () => {
    // The advanced tier REPLACES the basic one.
    const c = make((x) => { x.identity.level = 6; x.combat.stances = ['Offensive']; });
    const r = atk(c);
    expect(r.damage).toContain('+6'); // STR +3, plus half of level 6 = +3
    expect(r.swing).toBe('none');
  });

  it('Advanced Defensive grants DR of half level, on top of gear', () => {
    const c = make((x) => { x.identity.level = 6; x.combat.stances = ['Defensive']; x.combat.damageReduction = 2; });
    const dr = igResolveDamageReduction(c);
    expect(dr.dr).toBe(5); // 2 gear + 3 stance
    expect(dr.sources.join(' ')).toMatch(/gear/);
    expect(dr.sources.join(' ')).toMatch(/Defensive/);
  });

  it('grants no stance DR below level 5', () => {
    const c = make((x) => { x.identity.level = 4; x.combat.stances = ['Defensive']; x.combat.damageReduction = 2; });
    expect(igResolveDamageReduction(c).dr).toBe(2);
  });

  it('reports a CONDITIONAL clause instead of silently applying it', () => {
    // Swarming grants advantage "when flanking" — the sheet cannot know whether you are, and
    // assuming it would inflate every attack you make.
    const c = make((x) => { x.identity.level = 3; x.combat.stances = ['Swarming']; });
    const r = atk(c);
    expect(r.swing).toBe('none');
    expect(r.conditional.length).toBeGreaterThan(0);
  });

  it('leaves the numbers alone for a stance with no roll effect', () => {
    const c = make((x) => { x.combat.stances = ['Mobile']; });
    expect(atk(c).toHit).toBe(atk(make(() => {})).toHit);
  });
});

describe('stance and condition together', () => {
  it('cancels when a stance gives advantage and a condition takes it away', () => {
    const c = make((x) => { x.identity.level = 3; x.combat.stances = ['Offensive']; x.combat.conditions = ['Prone']; });
    expect(atk(c).swing).toBe('none');
  });

  it('igInPlayState gathers what the sheet needs to display', () => {
    const c = make((x) => { x.identity.level = 6; x.combat.stances = ['Defensive']; x.combat.conditions = ['Shaken']; });
    const st = igInPlayState(c);
    expect(st.conditionPenalty).toBe(-2);
    expect(st.damageReduction.dr).toBe(3);
    expect(st.saves).toHaveLength(3);
    // A blank character has no skills yet — assert the shape, not a count that only holds
    // for a filled-in sheet.
    expect(Array.isArray(st.skills)).toBe(true);
  });
});

describe('no third implementation of the rules', () => {
  it('delegates to the canonical stance and condition effect functions', () => {
    // A first cut re-derived all of this from modifiers.ts, which would have been a THIRD
    // implementation alongside the roll path. Delegation means a fix lands in both at once.
    const src = fs.readFileSync(path.join(process.cwd(), 'lib/dnd/systems/intuitive-games/resolve.ts'), 'utf8');
    expect(src).toContain('igStanceRollEffect');
    expect(src).toContain('igConditionRollEffect');
    expect(src).toContain('igStanceDamageBonus');
  });

  it('leaves the base maths in rules.ts untouched', () => {
    const c = make((x) => { x.combat.conditions = ['Shaken']; });
    const raw = igAttackBonus(c.combat.attacks[0], c.identity.level, igAbilityMod(c.abilities.STR));
    expect(atk(c).toHit).toBe(raw - 2);
  });
});

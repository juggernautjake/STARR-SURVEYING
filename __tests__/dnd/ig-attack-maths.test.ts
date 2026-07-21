// __tests__/dnd/ig-attack-maths.test.ts — IG-S4: IG weapons reach the maths.
//
// The slice asked whether IG attacks resolve through the rules engine the way PF2 Strikes do via
// pf2ResolveStrike. The answer for the NUMBERS was already yes — so this file's job is to make that a
// CHECKED claim instead of a remembered one, and it does that by asserting the RESOLVED TOTAL a player
// would see and roll, not that a field renders. Every expected number below is worked out by hand in a
// comment, so a failure says which rule broke rather than just "expected 11, got 10".
//
// The PROPERTIES half was not wired and mostly cannot be — see attack.ts for the per-property reasons.
// What IS asserted here is that a property is now structured, matched, and reported as uncomputed rather
// than silently discarded, and that a typo'd property is flagged instead of swallowed.
import { describe, it, expect } from 'vitest';
import { blankIGCharacter, type IGCharacter, type IGAttack } from '@/lib/dnd/systems/intuitive-games/model';
import { igAttackBonus, igDamageBonus, igResolveAttack, igAbilityMod } from '@/lib/dnd/systems/intuitive-games/rules';
import { igResolveAttackInPlay } from '@/lib/dnd/systems/intuitive-games/resolve';
import {
  IG_ATTACK_PROPERTIES, IG_ATTACK_MATH_GAPS, igAttackProperty, igParseAttackProperties,
  igUncomputedPropertyNotes,
} from '@/lib/dnd/systems/intuitive-games/attack';
import { IG_WEAPON_PROPERTIES } from '@/lib/dnd/systems/intuitive-games/items';
import { resolveD20Roll, rollDiceExpr } from '@/lib/dnd/roll';

/** A level-6 STR-16 fighter with a well-equipped longsword — one character every case below varies. */
function fighter(over: (c: IGCharacter) => void = () => {}): IGCharacter {
  const c = blankIGCharacter('Resolved');
  c.identity.level = 6;
  c.abilities.STR = 16; // +3
  c.abilities.DEX = 14; // +2
  c.combat.attacks = [{
    id: 'atk-1', name: 'Longsword', weaponType: 'One-Handed Slashing', properties: '',
    proficient: true, weaponFocus: true, weaponSpecialization: true,
    ability: 'STR', bonusToHit: 1, bonusDamage: 2, damage: '1d8',
  }];
  over(c);
  return c;
}
const weapon = (c: IGCharacter): IGAttack => c.combat.attacks[0];

describe('the to-hit is a real number, and every term in it is load-bearing', () => {
  // STR +3, proficiency = LEVEL = 6 (IG has no proficiency table), Weapon Focus +1, bonusToHit +1 = 11.
  it('folds ability + proficiency(=level) + Weapon Focus + the misc bonus', () => {
    expect(igResolveAttack(fighter(), weapon(fighter())).toHit).toBe(11);
  });

  it('proficiency really is the character LEVEL, so levelling moves the number', () => {
    const at10 = fighter((c) => { c.identity.level = 10; });
    expect(igResolveAttack(at10, weapon(at10)).toHit).toBe(15); // 3 + 10 + 1 + 1
  });

  it('drops the whole proficiency term when the character is not proficient', () => {
    const untrained = fighter((c) => { c.combat.attacks[0].proficient = false; });
    expect(igResolveAttack(untrained, weapon(untrained)).toHit).toBe(5); // 3 + 0 + 1 + 1
  });

  it('reads the attack\'s own governing ability, not always STR', () => {
    const finesse = fighter((c) => { c.combat.attacks[0].ability = 'DEX'; });
    expect(igResolveAttack(finesse, weapon(finesse)).toHit).toBe(10); // DEX +2 + 6 + 1 + 1
  });
});

describe('the damage EXPRESSION is a real number too', () => {
  // STR +3 (melee only) + Weapon Specialization +2 + bonusDamage +2 = +7.
  it('folds the STR modifier on melee, Weapon Specialization and the misc bonus into the die', () => {
    expect(igResolveAttack(fighter(), weapon(fighter())).damage).toBe('1d8+7');
  });

  it('withholds the ability modifier from a non-STR attack, which is the published melee/ranged split', () => {
    const bow = fighter((c) => { c.combat.attacks[0].ability = 'DEX'; });
    expect(igResolveAttack(bow, weapon(bow)).damage).toBe('1d8+4'); // spec +2, misc +2, no DEX to damage
  });

  it('shows a bare die when nothing adds to it', () => {
    const plain = fighter((c) => {
      Object.assign(c.combat.attacks[0], { ability: 'DEX', weaponSpecialization: false, bonusDamage: 0 });
    });
    expect(igResolveAttack(plain, weapon(plain)).damage).toBe('1d8');
  });
});

describe('conditions and stances move the resolved number, once', () => {
  it('Shaken lowers the resolved to-hit by 2', () => {
    const c = fighter((x) => { x.combat.conditions = ['Shaken']; });
    expect(igResolveAttackInPlay(c, weapon(c)).toHit).toBe(9); // 11 − 2
  });

  it('Advanced Offensive adds half level to DAMAGE — 1d8+7 becomes 1d8+10 at level 6', () => {
    const c = fighter((x) => { x.combat.stances = ['Offensive']; });
    expect(igResolveAttackInPlay(c, weapon(c)).damage).toBe('1d8+10');
  });

  it('does NOT double-count: the in-play number is exactly the base plus the modifiers', () => {
    // This is the invariant that lets the sheet hand a BASE to-hit to a roller which then applies the
    // condition penalty itself. If the display ever switches to the in-play resolver, the roll path must
    // stop adding the penalty on top — this test is what would catch the day only one of those happens.
    const c = fighter((x) => { x.combat.conditions = ['Shaken']; });
    const base = igAttackBonus(weapon(c), c.identity.level, igAbilityMod(c.abilities.STR));
    expect(igResolveAttackInPlay(c, weapon(c)).toHit).toBe(base - 2);
    expect(igResolveAttack(c, weapon(c)).toHit).toBe(base); // the base resolver stays base
  });
});

describe('the resolved number reaches the roller', () => {
  // The point of the slice: not "a number is displayed" but "that number is what gets rolled". The sheet
  // feeds the resolved to-hit straight into resolveD20Roll and the resolved damage into rollDiceExpr, so
  // these compose the same two calls with a fixed die face and assert the TOTAL.
  it('a natural 15 with the resolved +11 totals 26 and succeeds against DC 20', () => {
    const c = fighter();
    const r = resolveD20Roll({ natural: 15, modifier: igResolveAttack(c, weapon(c)).toHit, dc: 20, system: 'intuitive-games' });
    expect(r.total).toBe(26);
    expect(r.success).toBe(true);
    expect(r.degree).toBe('success'); // 26 beats 20 but not by 10
  });

  it('beating the DC by 10 reads as a critical on IG\'s four-step ladder', () => {
    const c = fighter((x) => { x.identity.level = 10; }); // to-hit 15
    const r = resolveD20Roll({ natural: 15, modifier: igResolveAttack(c, weapon(c)).toHit, dc: 20, system: 'intuitive-games' });
    expect(r.total).toBe(30);
    expect(r.degree).toBe('critical-success');
  });

  it('the condition penalty is what turns a hit into a miss, in the total', () => {
    const shaken = fighter((x) => { x.combat.conditions = ['Shaken', 'Sickened'] });
    const mod = igResolveAttackInPlay(shaken, weapon(shaken)).toHit; // 11 − 4 = 7
    expect(mod).toBe(7);
    expect(resolveD20Roll({ natural: 12, modifier: mod, dc: 20, system: 'intuitive-games' }).success).toBe(false);
    expect(resolveD20Roll({ natural: 12, modifier: 11, dc: 20, system: 'intuitive-games' }).success).toBe(true);
  });

  it('the damage expression rolls its dice AND its folded bonus', () => {
    const c = fighter();
    const expr = igResolveAttack(c, weapon(c)).damage; // 1d8+7
    // rollDiceExpr takes its rng, so the die face is pinned rather than sampled.
    expect(rollDiceExpr(expr, () => 0).total).toBe(8);        // 1d8 → 1, +7
    expect(rollDiceExpr(expr, () => 0.999).total).toBe(15);   // 1d8 → 8, +7
  });

  it('the stance damage bonus survives the round trip into the roller', () => {
    const c = fighter((x) => { x.combat.stances = ['Offensive']; });
    expect(rollDiceExpr(igResolveAttackInPlay(c, weapon(c)).damage, () => 0).total).toBe(11); // 1 + 10
  });
});

describe('weapon properties are structured, not a free-text cell', () => {
  it('covers every published property, with no entry left unjudged', () => {
    expect(IG_ATTACK_PROPERTIES).toHaveLength(IG_WEAPON_PROPERTIES.length);
    for (const p of IG_ATTACK_PROPERTIES) {
      expect(p.why, `${p.name} must say why it is or is not computed`).toBeTruthy();
      expect(p.why, `${p.name} was added without being judged`).not.toMatch(/Not yet judged/);
    }
  });

  it('matches a property the way a human types it — any case, any spacing', () => {
    expect(igAttackProperty('reach')?.name).toBe('Reach');
    expect(igAttackProperty('  Powerful   Critical ')?.name).toBe('Powerful Critical');
    expect(igAttackProperty('Vorpal')).toBeNull();
  });

  it('splits on the separators the editor and the AI actually produce', () => {
    const p = igParseAttackProperties('Reach, Throwing; Expanded Critical');
    expect(p.recognized.map((x) => x.name)).toEqual(['Reach', 'Throwing', 'Expanded Critical']);
    expect(p.unrecognized).toEqual([]);
  });

  it('does NOT split on a slash, because IG writes damage types that way', () => {
    // "Piercing/Bludgeoning" is one phrase in the site's own wording; splitting it would manufacture
    // two unrecognized entries out of one.
    expect(igParseAttackProperties('Piercing/Bludgeoning').unrecognized).toEqual(['Piercing/Bludgeoning']);
  });

  it('reports an unrecognized property instead of dropping it OR refusing it', () => {
    // Homebrew is allowed its own properties (Ground Rule 4), so this is information, not an error.
    const p = igParseAttackProperties('Reach, Screaming');
    expect(p.recognized.map((x) => x.name)).toEqual(['Reach']);
    expect(p.unrecognized).toEqual(['Screaming']);
  });

  it('surfaces uncomputed properties on the resolved attack, in the "yours to judge" list', () => {
    const c = fighter((x) => { x.combat.attacks[0].properties = 'Reach, Powerful Critical, Screaming'; });
    const r = igResolveAttackInPlay(c, weapon(c));
    expect(r.properties.map((p) => p.name)).toEqual(['Reach', 'Powerful Critical']);
    expect(r.unknownProperties).toEqual(['Screaming']);
    expect(r.conditional.join(' ')).toMatch(/Reach/);
    expect(r.conditional.join(' ')).toMatch(/Powerful Critical/);
    // And the numbers are untouched by them — which is the honest state, not an oversight.
    expect(r.toHit).toBe(11);
    expect(r.damage).toBe('1d8+7');
  });

  it('an attack with no properties adds nothing to the conditional list', () => {
    const c = fighter();
    expect(igUncomputedPropertyNotes(weapon(c).properties)).toEqual([]);
    expect(igResolveAttackInPlay(c, weapon(c)).properties).toEqual([]);
  });
});

describe('the attack maths records its gaps rather than papering over them', () => {
  it('names the crit-rule conflict, which is what blocks two of the properties', () => {
    const all = IG_ATTACK_MATH_GAPS.join('\n');
    expect(all).toMatch(/crit/i);
    expect(all).toMatch(/fourStepDegree|beat-the-DC-by-10|±10/);
  });

  it('names the weapon-class taxonomy mismatch, which is a silent wrong-damage risk', () => {
    expect(IG_ATTACK_MATH_GAPS.join('\n')).toMatch(/Heavy Ranged/);
  });

  it('keeps the gaps in the repo, not in a chat log', () => {
    expect(IG_ATTACK_MATH_GAPS.length).toBeGreaterThan(4);
    for (const g of IG_ATTACK_MATH_GAPS) expect(g.length).toBeGreaterThan(40);
  });
});

describe('the damage bonus helper is not quietly ability-blind', () => {
  // igDamageBonus is the one place the melee/ranged split lives, and it decides it from `ability === STR`
  // rather than from the weapon class — which is exactly why the Heavy Ranged rule is a recorded gap.
  it('adds the modifier for a STR attack and withholds it otherwise', () => {
    const atk = weapon(fighter());
    expect(igDamageBonus(atk, 3)).toBe(7);
    expect(igDamageBonus({ ...atk, ability: 'DEX' }, 3)).toBe(4);
  });
});

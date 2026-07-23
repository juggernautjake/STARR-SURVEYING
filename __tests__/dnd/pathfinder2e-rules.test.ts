import { describe, it, expect } from 'vitest';
import {
  pf2Level,
  pf2Proficiency, pf2Degree, pf2SkillTotal, pf2SaveTotal, pf2PerceptionTotal,
  pf2MaxHp, pf2ArmorClass, pf2ClassDc, pf2SpellDc, pf2SpellAttack,
  pf2AttackBonus, pf2MultipleAttackPenalty, pf2LevelBasedDc, pf2Derived, pf2SpellSlots,
} from '@/lib/dnd/systems/pathfinder2e/rules';
import type { PF2Character, PF2Skill } from '@/lib/dnd/systems/pathfinder2e/model';

/** A level-5 Dwarf Fighter with full-plate, a +0 rune, and a longsword — hand-computed PF2 numbers. */
function fighter5(): PF2Character {
  return {
    identity: {
      name: 'Durgan', level: 5, ancestry: 'Dwarf', heritage: 'Rock Dwarf', background: 'Warrior',
      className: 'Fighter', subclass: '', deity: '', size: 'Medium', alignment: '', bio: '', photoUrl: '',
    },
    attributes: { STR: 4, DEX: 1, CON: 3, INT: 0, WIS: 2, CHA: 0 },
    perception: { rank: 'expert' },
    saves: {
      Fortitude: { rank: 'expert', itemBonus: 0 },
      Reflex: { rank: 'trained', itemBonus: 0 },
      Will: { rank: 'expert', itemBonus: 0 },
    },
    skills: [{ name: 'Athletics', attribute: 'STR', rank: 'trained', itemBonus: 0 }],
    combat: {
      ancestryHp: 10, classHpPerLevel: 10, currentHp: 0, tempHp: 0, dyingValue: 0, woundedValue: 0, heroPoints: 1,
      speed: 20, armorRank: 'trained', dexCap: 0, acItemBonus: 6, attackRank: 'expert',
      classDcRank: 'expert', classDcAttribute: 'STR',
    },
    attacks: [{ id: 'a1', name: 'Longsword', attribute: 'STR', rank: 'expert', weaponBonus: 0, damage: '1d8+4 slashing', traits: [] }],
    spellcasting: { tradition: 'none', kind: 'none', attribute: 'INT', rank: 'untrained', slots: [] },
    feats: [],
    languages: ['Common', 'Dwarven'],
  };
}

describe('pf2Level clamps to the 1–20 range (every PF2 number flows through it)', () => {
  it('clamps below 1, above 20, rounds, and defaults a non-number to 1', () => {
    expect(pf2Level(5)).toBe(5);
    expect(pf2Level(0)).toBe(1);
    expect(pf2Level(-3)).toBe(1);
    expect(pf2Level(25)).toBe(20);
    expect(pf2Level(7.6)).toBe(8);
    expect(pf2Level(Number.NaN)).toBe(1);
  });
});

describe('pf2 proficiency', () => {
  it('untrained is +0 and adds no level', () => {
    expect(pf2Proficiency('untrained', 5)).toBe(0);
  });
  it('trained adds rank bonus + level', () => {
    expect(pf2Proficiency('trained', 5)).toBe(2 + 5);
    expect(pf2Proficiency('expert', 5)).toBe(4 + 5);
    expect(pf2Proficiency('master', 12)).toBe(6 + 12);
    expect(pf2Proficiency('legendary', 20)).toBe(8 + 20);
  });
});

describe('pf2 degrees of success', () => {
  it('four degrees around the DC', () => {
    expect(pf2Degree(30, 20)).toBe('critical-success'); // beat by 10+
    expect(pf2Degree(20, 20)).toBe('success');          // meet
    expect(pf2Degree(19, 20)).toBe('failure');          // miss
    expect(pf2Degree(10, 20)).toBe('critical-failure'); // miss by 10+
  });
  it('a natural 20 steps up, a natural 1 steps down', () => {
    expect(pf2Degree(19, 20, 20)).toBe('success');       // failure → success
    expect(pf2Degree(20, 20, 1)).toBe('failure');        // success → failure
    expect(pf2Degree(30, 20, 20)).toBe('critical-success'); // caps at crit success
    expect(pf2Degree(10, 20, 1)).toBe('critical-failure');  // caps at crit failure
  });
});

describe('pf2 derived numbers (level-5 Fighter)', () => {
  const c = fighter5();
  it('max HP = ancestry + (class + CON) × level', () => {
    expect(pf2MaxHp(c)).toBe(10 + (10 + 3) * 5); // 75
  });
  it('AC = 10 + capped Dex + armor prof + item bonus', () => {
    // full plate caps Dex at 0: 10 + 0 + (2+5) + 6 = 23
    expect(pf2ArmorClass(c)).toBe(23);
  });
  it('perception = WIS + expert proficiency', () => {
    expect(pf2PerceptionTotal(c)).toBe(2 + (4 + 5)); // 11
  });
  it('saves add attribute + proficiency', () => {
    expect(pf2SaveTotal('Fortitude', c)).toBe(3 + (4 + 5)); // 12
    expect(pf2SaveTotal('Reflex', c)).toBe(1 + (2 + 5));    // 8
    expect(pf2SaveTotal('Will', c)).toBe(2 + (4 + 5));      // 11
  });
  it('a save folds a non-zero item bonus (cloak of resistance) — the fixture uses +0', () => {
    // Same unexercised-term gap as the weapon rune: every fixture save is itemBonus 0, so a regression
    // dropping `+ s.itemBonus` would silently lose every magic save bonus and still pass the test above.
    const warded = { ...c, saves: { ...c.saves, Reflex: { rank: 'trained' as const, itemBonus: 1 } } };
    expect(pf2SaveTotal('Reflex', warded)).toBe(1 + (2 + 5) + 1); // 9
  });
  it('class DC = 10 + key attr + proficiency', () => {
    expect(pf2ClassDc(c)).toBe(10 + 4 + (4 + 5)); // 23
  });
  it('a non-caster has no spell DC or attack', () => {
    expect(pf2SpellDc(c)).toBeNull();
    expect(pf2SpellAttack(c)).toBeNull();
  });
  it('Strike bonus = attribute + proficiency + weapon rune', () => {
    expect(pf2AttackBonus(c.attacks[0], c.identity.level, c.attributes)).toBe(4 + (4 + 5)); // 13
  });
  it('Strike bonus actually FOLDS a non-zero weapon potency rune (the fixture uses +0)', () => {
    // The test above names "weapon rune" but the fixture's rune is 0, so the term was never exercised —
    // a regression dropping `+ atk.weaponBonus` would break every PF2 magic weapon and pass that test.
    const runed = { ...c.attacks[0], weaponBonus: 2 };
    expect(pf2AttackBonus(runed, c.identity.level, c.attributes)).toBe(4 + (4 + 5) + 2); // 15
  });
  it('pf2Derived rolls up the header numbers', () => {
    const d = pf2Derived(c);
    expect(d.maxHp).toBe(75);
    expect(d.ac).toBe(23);
    expect(d.classDc).toBe(23);
    expect(d.saves.Fortitude).toBe(12);
  });
});

describe('pf2 spellcasting (level-5 Wizard-ish)', () => {
  it('spell DC and attack come from the tradition attribute + proficiency', () => {
    const c = fighter5();
    c.spellcasting = { tradition: 'arcane', kind: 'prepared', attribute: 'INT', rank: 'trained', slots: [5, 3, 3] };
    c.attributes.INT = 4;
    expect(pf2SpellDc(c)).toBe(10 + 4 + (2 + 5));   // 21
    expect(pf2SpellAttack(c)).toBe(4 + (2 + 5));     // 11
  });
});

describe('pf2 skill total + the armor-check-penalty conditional', () => {
  const attrs = fighter5().attributes; // STR 4, DEX 1, CON 3, INT 0, WIS 2, CHA 0
  const athletics: PF2Skill = { name: 'Athletics', attribute: 'STR', rank: 'trained', itemBonus: 0, armorPenalty: true };
  const arcana: PF2Skill = { name: 'Arcana', attribute: 'INT', rank: 'trained', itemBonus: 1 }; // no armorPenalty flag

  it('total = attribute + proficiency (rank bonus + level) + item bonus', () => {
    // level 5, trained (+2 rank) → proficiency 7. Athletics: STR 4 + 7 = 11. Arcana: INT 0 + 7 + item 1 = 8.
    expect(pf2SkillTotal(athletics, 5, attrs, 0)).toBe(4 + (2 + 5));
    expect(pf2SkillTotal(arcana, 5, attrs, 0)).toBe(0 + (2 + 5) + 1);
  });

  it('the armor-check penalty bites ONLY armorPenalty skills (Athletics), never others (Arcana)', () => {
    // A bulky-armor −2 reduces the STR/DEX physical skills (Athletics/Acrobatics/Stealth/Thievery) but NOT
    // knowledge/social skills — pf2SkillTotal gates the penalty on the skill's own `armorPenalty` flag.
    expect(pf2SkillTotal(athletics, 5, attrs, -2)).toBe(11 - 2); // 9 — the physical skill takes it
    expect(pf2SkillTotal(arcana, 5, attrs, -2)).toBe(8);         // unchanged — Arcana ignores the ACP
  });
});

describe('pf2 multiple attack penalty', () => {
  it('is 0 on the first Strike, then −5/−10 (or −4/−8 agile)', () => {
    expect(pf2MultipleAttackPenalty(0, false)).toBe(0);
    expect(pf2MultipleAttackPenalty(1, false)).toBe(-5);
    expect(pf2MultipleAttackPenalty(2, false)).toBe(-10);
    expect(pf2MultipleAttackPenalty(1, true)).toBe(-4);
    expect(pf2MultipleAttackPenalty(2, true)).toBe(-8);
    expect(pf2MultipleAttackPenalty(3, false)).toBe(-10); // caps
  });
});

describe('pf2 full-caster spell slots (Player Core progression)', () => {
  it('always has 5 cantrips', () => {
    for (const L of [1, 5, 10, 20]) expect(pf2SpellSlots(L)[0]).toBe(5);
  });
  it('level 1: two 1st-rank slots, nothing higher', () => {
    expect(pf2SpellSlots(1)).toEqual([5, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  });
  it('a new rank opens at level 2r−1 with 2 slots, rising to 3 at 2r', () => {
    expect(pf2SpellSlots(2)).toEqual([5, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0]);   // rank 1 → 3
    expect(pf2SpellSlots(3)).toEqual([5, 3, 2, 0, 0, 0, 0, 0, 0, 0, 0]);   // rank 2 opens
    expect(pf2SpellSlots(4)).toEqual([5, 3, 3, 0, 0, 0, 0, 0, 0, 0, 0]);   // rank 2 → 3
    expect(pf2SpellSlots(5)).toEqual([5, 3, 3, 2, 0, 0, 0, 0, 0, 0, 0]);   // rank 3 opens
  });
  it('level 19 gains the single 10th-rank slot; level 20 keeps it', () => {
    expect(pf2SpellSlots(19)).toEqual([5, 3, 3, 3, 3, 3, 3, 3, 3, 3, 1]);
    expect(pf2SpellSlots(20)).toEqual([5, 3, 3, 3, 3, 3, 3, 3, 3, 3, 1]);
  });
  it('the top accessible rank equals ceil(level/2)', () => {
    for (const L of [1, 2, 7, 12, 18, 20]) {
      const top = pf2SpellSlots(L).reduce((hi, n, r) => (n > 0 ? r : hi), 0);
      expect(top).toBe(Math.min(10, Math.ceil(L / 2)));
    }
  });
});

describe('pf2 level-based DC table', () => {
  it('matches the GM Core baseline DCs', () => {
    expect(pf2LevelBasedDc(0)).toBe(14);
    expect(pf2LevelBasedDc(1)).toBe(15);
    expect(pf2LevelBasedDc(5)).toBe(20);
    expect(pf2LevelBasedDc(20)).toBe(40);
  });
  it('matches GM Core at EVERY level 0–20, including the +2-jump levels', () => {
    // The progression is +1/level EXCEPT levels 3,6,9,12,15,18 which jump +2 — the irregular part the spot
    // checks above skip entirely. A typo in a jump (or an interior +1 level) would give a whole tier of
    // tasks the wrong DC. Pin the full GM Core table.
    const GM_CORE = [14, 15, 16, 18, 19, 20, 22, 23, 24, 26, 27, 28, 30, 31, 32, 34, 35, 36, 38, 39, 40];
    for (let level = 0; level <= 20; level++) {
      expect(pf2LevelBasedDc(level), `level ${level}`).toBe(GM_CORE[level]);
    }
  });
});

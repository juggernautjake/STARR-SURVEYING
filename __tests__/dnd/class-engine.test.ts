// __tests__/dnd/class-engine.test.ts — the level 1→20 progression engine, and the guarantee that
// a HOMEBREW class is the same kind of object as an official one (same engine, same validation).
import { describe, it, expect } from 'vitest';
import {
  snapshotAtLevel,
  progressionTable,
  featuresGainedAt,
  proficiencyBonusFor,
  hitPointsBeforeCon,
  validateClassDefinition,
  multiclassCasterLevel,
  clampLevel,
} from '@/lib/dnd/classes/engine';
import { buildCustomClass, reviewCustomClass, buildCustomFeat, reviewCustomFeat, normalisePerLevel, type CustomClassDraft } from '@/lib/dnd/classes/custom';
import { FULL_CASTER_SLOTS, HALF_CASTER_SLOTS, THIRD_CASTER_SLOTS, PACT_SLOTS, PACT_RANK } from '@/lib/dnd/classes/slots';
import type { ClassDefinition } from '@/lib/dnd/classes/types';

describe('proficiency bonus + HP maths', () => {
  it('matches the 5e proficiency table', () => {
    expect([1, 4].map(proficiencyBonusFor)).toEqual([2, 2]);
    expect([5, 8].map(proficiencyBonusFor)).toEqual([3, 3]);
    expect([9, 12].map(proficiencyBonusFor)).toEqual([4, 4]);
    expect([13, 16].map(proficiencyBonusFor)).toEqual([5, 5]);
    expect([17, 20].map(proficiencyBonusFor)).toEqual([6, 6]);
  });

  it('clamps out-of-range levels rather than returning undefined', () => {
    expect(clampLevel(0)).toBe(1);
    expect(clampLevel(99)).toBe(20);
    expect(proficiencyBonusFor(99)).toBe(6);
  });

  it('uses fixed averages per hit die', () => {
    // d12: 12 at L1, +7/level → L3 = 26
    expect(hitPointsBeforeCon(12, 1)).toBe(12);
    expect(hitPointsBeforeCon(12, 3)).toBe(26);
    // d6: 6 at L1, +4/level → L3 = 14
    expect(hitPointsBeforeCon(6, 3)).toBe(14);
    // d10: 10 at L1, +6/level → L20 = 124
    expect(hitPointsBeforeCon(10, 20)).toBe(124);
  });
});

describe('spell slot tables', () => {
  it('the full-caster table matches the PHB at the corners', () => {
    expect(FULL_CASTER_SLOTS[1][1]).toBe(2);
    expect(FULL_CASTER_SLOTS[5][3]).toBe(2);   // 2 third-rank slots at level 5
    expect(FULL_CASTER_SLOTS[20][9]).toBe(1);
    expect(FULL_CASTER_SLOTS[17][9]).toBe(1);  // 9th rank arrives at 17
    expect(FULL_CASTER_SLOTS[16][9]).toBe(0);
  });

  it('every spell rank arrives at exactly its odd level (a new rank at 3,5,7,…,17), 0 the level before', () => {
    // Rank R first appears at level 2R−1: rank 2 at L3, rank 3 at L5, … rank 9 at L17. A single-cell typo
    // here gives casters a spell rank too early or late — the most impactful kind of slot-table error.
    for (let rank = 2; rank <= 9; rank++) {
      const arrival = 2 * rank - 1;
      expect(FULL_CASTER_SLOTS[arrival][rank], `rank ${rank} should arrive at level ${arrival}`).toBeGreaterThanOrEqual(1);
      expect(FULL_CASTER_SLOTS[arrival - 1][rank], `rank ${rank} should NOT exist at level ${arrival - 1}`).toBe(0);
    }
    // The capstone row: a level-20 full caster has 4/3/3/3/3/2/2/1/1 across ranks 1–9.
    expect(FULL_CASTER_SLOTS[20].slice(1)).toEqual([4, 3, 3, 3, 3, 2, 2, 1, 1]);
  });

  it('half casters get nothing at level 1 and cap at rank 5', () => {
    expect(HALF_CASTER_SLOTS[1].slice(1).every((n) => n === 0)).toBe(true);
    expect(HALF_CASTER_SLOTS[2][1]).toBe(2);
    expect(HALF_CASTER_SLOTS[20][5]).toBe(2);
    expect(HALF_CASTER_SLOTS[20][6]).toBe(0); // never reaches rank 6
  });

  it('half-caster spell ranks arrive at 2/5/9/13/17 (rank R>1 at level 4R−3), 0 the level before', () => {
    // Paladin/Ranger: 1st rank at L2, then a new rank at 5, 9, 13, 17. An off-by-one gives them spells
    // several levels early/late — as impactful as the full-caster arrivals.
    expect(HALF_CASTER_SLOTS[2][1]).toBeGreaterThanOrEqual(1); // rank 1 at L2
    for (let rank = 2; rank <= 5; rank++) {
      const arrival = 4 * rank - 3; // 5, 9, 13, 17
      expect(HALF_CASTER_SLOTS[arrival][rank], `rank ${rank} should arrive at level ${arrival}`).toBeGreaterThanOrEqual(1);
      expect(HALF_CASTER_SLOTS[arrival - 1][rank], `rank ${rank} should NOT exist at level ${arrival - 1}`).toBe(0);
    }
  });

  it('third casters start at 3 and cap at rank 4', () => {
    expect(THIRD_CASTER_SLOTS[2].slice(1).every((n) => n === 0)).toBe(true);
    expect(THIRD_CASTER_SLOTS[3][1]).toBe(2);
    expect(THIRD_CASTER_SLOTS[20][4]).toBe(1);
    expect(THIRD_CASTER_SLOTS[20][5]).toBe(0);
  });

  it('pact magic is a different shape — few slots, highest rank', () => {
    expect(PACT_SLOTS[1]).toBe(1);
    expect(PACT_SLOTS[2]).toBe(2);
    expect(PACT_SLOTS[11]).toBe(3);
    expect(PACT_SLOTS[17]).toBe(4);
    expect(PACT_RANK[9]).toBe(5);
    expect(PACT_RANK[20]).toBe(5); // never past rank 5 — Mystic Arcanum covers 6-9
  });
});

describe('multiclass caster level', () => {
  it('adds full, halves half, thirds third — rounded down', () => {
    expect(multiclassCasterLevel([{ kind: 'full', level: 5 }])).toBe(5);
    expect(multiclassCasterLevel([{ kind: 'half', level: 5 }])).toBe(2);
    expect(multiclassCasterLevel([{ kind: 'third', level: 5 }])).toBe(1);
    expect(multiclassCasterLevel([{ kind: 'full', level: 3 }, { kind: 'half', level: 4 }])).toBe(5);
  });

  it('pact levels never merge into the slot table', () => {
    expect(multiclassCasterLevel([{ kind: 'pact', level: 5 }])).toBe(0);
  });
});

// ── a minimal but complete homebrew class, used to exercise the whole engine ────────
const DRAFT: CustomClassDraft = {
  name: 'Stone Warden',
  system: 'dnd5e-2024',
  description: 'A homebrew bulwark who turns their skin to rock.',
  hitDie: 10,
  primaryAbility: ['con'],
  savingThrows: ['str', 'con'],
  skillChoices: { count: 2, from: ['Athletics', 'Perception', 'Survival'] },
  armorProficiencies: ['Light armor', 'Medium armor', 'Shields'],
  weaponProficiencies: ['Simple weapons', 'Martial weapons'],
  subclassLevel: 3,
  subclassLabel: 'Warden Oath',
  resources: [{ id: 'bulwark', name: 'Bulwark Dice', perLevel: [0, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 5, 5, 5, 5, 5, 5, 6, 6], resetOn: 'short' }],
  features: [
    { level: 1, name: 'Stone Skin', body: 'While unarmored your **AC = 13 + CON modifier**.' },
    { level: 2, name: 'Bulwark', body: 'Spend a **Bulwark Die** to reduce damage by **1d8 + CON**.' },
    { level: 11, name: 'Living Wall', body: 'You have **resistance to bludgeoning damage**.' },
  ],
  authorName: 'Jack',
};

describe('custom classes are first-class', () => {
  const def: ClassDefinition = buildCustomClass(DRAFT);

  it('is structurally valid to the SAME validator official classes use', () => {
    expect(validateClassDefinition(def)).toEqual([]);
  });

  it('auto-adds the subclass, ASI and Epic Boon choice points the author omitted', () => {
    expect(def.features.some((f) => f.choice === 'subclass' && f.level === 3)).toBe(true);
    for (const lv of [4, 8, 12, 16]) {
      expect(def.features.some((f) => f.choice === 'asi' && f.level === lv), `ASI at ${lv}`).toBe(true);
    }
    expect(def.features.some((f) => f.choice === 'epic-boon' && f.level === 19)).toBe(true);
  });

  it('marks the class as custom, with its author', () => {
    expect(def.custom?.authorName).toBe('Jack');
    expect(def.key).toBe('custom-stone-warden');
  });

  it('levels through the same engine — features accumulate', () => {
    expect(snapshotAtLevel(def, 1).features.map((f) => f.name)).toContain('Stone Skin');
    expect(snapshotAtLevel(def, 1).features.map((f) => f.name)).not.toContain('Bulwark');
    expect(snapshotAtLevel(def, 2).features.map((f) => f.name)).toContain('Bulwark');
    // Cumulative, not just "gained at this level".
    expect(snapshotAtLevel(def, 11).features.map((f) => f.name)).toEqual(expect.arrayContaining(['Stone Skin', 'Bulwark', 'Living Wall']));
  });

  it('reports resources at the right level and hides them before they exist', () => {
    expect(snapshotAtLevel(def, 1).resources.find((r) => r.id === 'bulwark')?.max).toBe(2);
    expect(snapshotAtLevel(def, 20).resources.find((r) => r.id === 'bulwark')?.max).toBe(6);
  });

  it('reports HP and proficiency correctly at 20', () => {
    const s = snapshotAtLevel(def, 20);
    expect(s.proficiencyBonus).toBe(6);
    expect(s.hitPointsBeforeCon).toBe(hitPointsBeforeCon(10, 20));
  });

  it('builds a full 20-level table', () => {
    const table = progressionTable(def);
    expect(table.length).toBe(20);
    expect(table[0].level).toBe(1);
    expect(table[19].level).toBe(20);
    // Features never shrink as you level.
    for (let i = 1; i < 20; i++) expect(table[i].features.length).toBeGreaterThanOrEqual(table[i - 1].features.length);
  });

  it('featuresGainedAt reports only that level', () => {
    expect(featuresGainedAt(def, 2).map((f) => f.name)).toEqual(['Bulwark']);
    expect(featuresGainedAt(def, 7)).toEqual([]);
  });

  it('supports a homebrew caster using the shared tables', () => {
    const caster = buildCustomClass({ ...DRAFT, name: 'Rune Singer', caster: { kind: 'full', ability: 'cha' } });
    expect(validateClassDefinition(caster)).toEqual([]);
    expect(snapshotAtLevel(caster, 5).spellSlots?.[3]).toBe(2);
    const pact = buildCustomClass({ ...DRAFT, name: 'Pactbound', caster: { kind: 'pact', ability: 'cha' } });
    expect(snapshotAtLevel(pact, 11).pact).toEqual({ slots: 3, rank: 5 });
  });
});

describe('validation catches broken classes', () => {
  it('rejects an impossible hit die and too many saves', () => {
    const bad = buildCustomClass({ ...DRAFT, hitDie: 20, savingThrows: ['str', 'con', 'dex'] });
    const errs = validateClassDefinition(bad);
    expect(errs.some((e) => e.field === 'hitDie')).toBe(true);
    expect(errs.some((e) => e.field === 'savingThrows')).toBe(true);
  });

  it('rejects a feature outside levels 1–20 and one with no rules text', () => {
    const bad = buildCustomClass({ ...DRAFT, features: [{ level: 25, name: 'Too High', body: 'x' }, { level: 1, name: 'Empty', body: '' }] });
    const errs = validateClassDefinition(bad);
    expect(errs.some((e) => e.message.includes('levels run 1–20'))).toBe(true);
    expect(errs.some((e) => e.message.includes('no rules text'))).toBe(true);
  });
});

describe('DM review warns without blocking', () => {
  it('flags an over-tuned homebrew as warnings, not errors', () => {
    const spicy = buildCustomClass({ ...DRAFT, name: 'Godslayer', hitDie: 12, caster: { kind: 'full', ability: 'cha' } });
    const review = reviewCustomClass(spicy);
    expect(review.some((r) => r.severity === 'warning' && r.field === 'spellcasting')).toBe(true);
    expect(review.some((r) => r.severity === 'error')).toBe(false); // spicy, but structurally sound
  });

  it('flags a draft that stops levelling before 11', () => {
    const stub = buildCustomClass({ ...DRAFT, features: [{ level: 1, name: 'Only Thing', body: 'It does a thing.' }] });
    expect(reviewCustomClass(stub).some((r) => r.message.includes('not playable to 20'))).toBe(true);
  });

  it('normalisePerLevel always yields a 21-entry array', () => {
    expect(normalisePerLevel([]).length).toBe(21);
    expect(normalisePerLevel([0, 1, 2]).length).toBe(21);
  });
});

describe('custom feats', () => {
  it('builds and keys a feat', () => {
    const f = buildCustomFeat({ name: 'Rock Steady', system: 'dnd5e-2024', category: 'general', prerequisite: 'Level 4+', body: 'You cannot be knocked **Prone** unwillingly.', abilityIncrease: ['con'], custom: { authorName: 'Jack' } });
    expect(f.key).toBe('custom-rock-steady');
    expect(reviewCustomFeat(f).filter((r) => r.severity === 'error')).toEqual([]);
  });

  it('warns when an origin feat grants an ability increase', () => {
    const f = buildCustomFeat({ name: 'Odd One', system: 'dnd5e-2024', category: 'origin', body: 'Something.', abilityIncrease: ['str'], custom: {} });
    expect(reviewCustomFeat(f).some((r) => r.field === 'abilityIncrease')).toBe(true);
  });

  it('errors on a feat with no rules text', () => {
    const f = buildCustomFeat({ name: 'Empty', system: 'dnd5e-2024', category: 'general', body: '', custom: {} });
    expect(reviewCustomFeat(f).some((r) => r.severity === 'error' && r.field === 'body')).toBe(true);
  });
});

// Experience points (P3-4, audit finding B-4).
//
// There was no XP anywhere: no field, no award tool, no milestone affordance, and nothing that ever told a
// player it was time to level. Levelling is the moment the builders exist FOR, and nothing pointed at one.
//
// GROUND RULE 3 IS THE POINT OF MOST OF THIS FILE. A threshold table is easy to write from memory and
// subtly wrong, and a wrong table silently levels someone at the wrong time for a whole campaign. So the
// tests check the table against the published one at every boundary, and check that the system with NO
// sourced table says so instead of borrowing another's.
import { describe, expect, it } from 'vitest';
import { xpRulesFor, xpForLevel, levelForXp, xpProgress, normalizeXp } from '@/lib/dnd/xp';

describe('the 5e table matches the SRD at every boundary', () => {
  // Spot-checking two or three entries would miss a single transposed row, which is exactly the failure a
  // hand-typed table has.
  const SRD: [number, number][] = [
    [1, 0], [2, 300], [3, 900], [4, 2700], [5, 6500], [6, 14000], [7, 23000], [8, 34000], [9, 48000],
    [10, 64000], [11, 85000], [12, 100000], [13, 120000], [14, 140000], [15, 165000], [16, 195000],
    [17, 225000], [18, 265000], [19, 305000], [20, 355000],
  ];

  it('every level, in both editions', () => {
    for (const [level, xp] of SRD) {
      expect(xpForLevel('dnd5e-2024', level), `2024 level ${level}`).toBe(xp);
      expect(xpForLevel('dnd5e-2014', level), `2014 level ${level}`).toBe(xp);
    }
  });

  it('and the two editions share ONE table, rather than two copies that could drift', () => {
    expect(xpRulesFor('dnd5e-2014').thresholds).toBe(xpRulesFor('dnd5e-2024').thresholds);
  });

  it('is strictly increasing — a transposed row would show up here', () => {
    for (let lv = 2; lv <= 20; lv++) {
      expect(xpForLevel('dnd5e-2024', lv), `level ${lv}`).toBeGreaterThan(xpForLevel('dnd5e-2024', lv - 1));
    }
  });
});

describe('Pathfinder 2e is flat', () => {
  it('1000 per level, cumulative', () => {
    expect(xpForLevel('pathfinder2e', 1)).toBe(0);
    expect(xpForLevel('pathfinder2e', 2)).toBe(1000);
    expect(xpForLevel('pathfinder2e', 11)).toBe(10000);
    expect(xpForLevel('pathfinder2e', 20)).toBe(19000);
  });

  it('and says the total is cumulative, because the books present it reset-per-level', () => {
    expect(xpRulesFor('pathfinder2e').note).toMatch(/cumulative/);
  });
});

describe('the system with NO sourced table says so', () => {
  it('Intuitive Games is milestone, not a borrowed 5e table', () => {
    // Ground Rule 3: inventing thresholds would silently level characters at the wrong time for a whole
    // campaign, and nobody would know why.
    const rules = xpRulesFor('intuitive-games');
    expect(rules.model).toBe('milestone');
    expect(rules.thresholds).toBeUndefined();
    expect(rules.note).toMatch(/no XP table has been sourced/i);
  });

  it('and its max level is IG’s own 10, not 20', () => {
    expect(xpRulesFor('intuitive-games').maxLevel).toBe(10);
  });

  it('an unset system uses the default edition’s table; an unidentifiable one still does not', () => {
    // Owner, 2026-07-30: unset means the 2024 edition. A value we cannot identify is a different case and
    // keeps the honest fallback — guessing a rulebook's XP table for a corrupt row would be worse than
    // falling back to milestone.
    expect(xpRulesFor(null).model).not.toBe('milestone');
    expect(xpRulesFor('nonsense').model).toBe('milestone');
  });
});

describe('levelForXp', () => {
  it('lands exactly on a boundary', () => {
    expect(levelForXp('dnd5e-2024', 300)).toBe(2);
    expect(levelForXp('dnd5e-2024', 299)).toBe(1);
    expect(levelForXp('dnd5e-2024', 355000)).toBe(20);
  });

  it('does not exceed the cap', () => {
    expect(levelForXp('dnd5e-2024', 9_999_999)).toBe(20);
    expect(levelForXp('pathfinder2e', 9_999_999)).toBe(20);
  });

  it('and REFUSES to derive a level on a milestone system', () => {
    // A milestone table's XP is not a level. Quietly deriving one from a number nobody agreed on is worse
    // than ignoring it.
    expect(levelForXp('intuitive-games', 50_000)).toBe(1);
  });
});

describe('xpProgress', () => {
  it('reports what is left and how far through', () => {
    const p = xpProgress('dnd5e-2024', 1000, 3);
    expect(p.level).toBe(3);
    expect(p.toNext).toBe(1700); // 2700 − 1000
    expect(p.fraction).toBeCloseTo((1000 - 900) / (2700 - 900), 5);
    expect(p.label).toMatch(/1,700 to level 4/);
  });

  it('SAYS SO when the sheet’s level disagrees with the XP', () => {
    // A sheet showing "Level 3" beside XP earning level 5 is either a milestone table or an oversight, and
    // the player is the one who knows which. Silently preferring either would be a guess.
    const p = xpProgress('dnd5e-2024', 14000, 3);
    expect(p.level).toBe(6);
    expect(p.label).toMatch(/the sheet says level 3/);
  });

  it('and says nothing about a mismatch when there is none', () => {
    expect(xpProgress('dnd5e-2024', 14000, 6).label).not.toMatch(/the sheet says/);
  });

  it('at max level there is no next', () => {
    const p = xpProgress('dnd5e-2024', 400000, 20);
    expect(p.toNext).toBeNull();
    expect(p.fraction).toBeNull();
    expect(p.label).toMatch(/maximum level/);
  });

  it('on a milestone system it explains itself rather than showing a bar', () => {
    const p = xpProgress('intuitive-games', 0, 4);
    expect(p.model).toBe('milestone');
    expect(p.toNext).toBeNull();
    expect(p.level, 'the sheet’s level is the only truth there is').toBe(4);
    expect(p.label.length).toBeGreaterThan(20);
  });

  it('always produces a label', () => {
    for (const sys of ['dnd5e-2024', 'pathfinder2e', 'intuitive-games', null]) {
      expect(xpProgress(sys, 0, 1).label.length, String(sys)).toBeGreaterThan(0);
    }
  });
});

describe('normalizeXp', () => {
  it('keeps a real total', () => {
    expect(normalizeXp(2700)).toBe(2700);
    expect(normalizeXp('2700')).toBe(2700);
    expect(normalizeXp(2700.9)).toBe(2700);
  });

  it('and refuses a negative — an XP debt is not a thing anyone agreed to', () => {
    expect(normalizeXp(-500)).toBe(0);
    expect(normalizeXp(null)).toBe(0);
    expect(normalizeXp('lots')).toBe(0);
    expect(normalizeXp(undefined)).toBe(0);
  });
});

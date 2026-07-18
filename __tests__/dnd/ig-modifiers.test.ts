// __tests__/dnd/ig-modifiers.test.ts — the pure condition-mechanics model: the stacking flat d20 penalty
// (Shaken/Sickened) + a legible summary of disadvantage/other effects, drawn only from IG condition rules.
import { describe, it, expect } from 'vitest';
import {
  igConditionMechanic,
  igConditionSummary,
  igConditionPenaltyNote,
  igStanceMechanic,
  igStanceMechanicNote,
} from '@/lib/dnd/systems/intuitive-games/modifiers';

describe('igConditionMechanic', () => {
  it('gives Shaken/Sickened a stacking -2 flat penalty', () => {
    expect(igConditionMechanic('Shaken')?.flatD20).toBe(-2);
    expect(igConditionMechanic('sickened')?.flatD20).toBe(-2);
    expect(igConditionMechanic('Sickened')?.other).toMatch(/paralyzes you/i);
  });
  it('captures disadvantage + narrative effects from the IG text', () => {
    expect(igConditionMechanic('Blind')?.disadvantage).toMatch(/Reflex saves/i);
    expect(igConditionMechanic('Grappled')?.other).toMatch(/two hands/i);
  });
  it('returns null for an unrecognized (custom) condition — nothing invented', () => {
    expect(igConditionMechanic('Cursed')).toBeNull();
  });
});

describe('igConditionSummary', () => {
  it('stacks the flat penalty across Shaken + Sickened and names the sources', () => {
    const s = igConditionSummary(['Shaken', 'Sickened']);
    expect(s.flatD20).toBe(-4);
    expect(s.flatSources).toEqual(['Shaken', 'Sickened']);
    expect(s.other.some((o) => /Sickened/.test(o))).toBe(true);
  });
  it('collects disadvantage + other lines, ignoring conditions with no roll effect and custom ones', () => {
    const s = igConditionSummary(['Blind', 'Heatstroke', 'MadeUp']);
    expect(s.flatD20).toBe(0);
    expect(s.disadvantages.some((d) => /Blind/.test(d))).toBe(true);
    // Heatstroke has no roll modifier here; MadeUp is custom — neither adds a disadvantage line.
    expect(s.disadvantages.every((d) => !/Heatstroke|MadeUp/.test(d))).toBe(true);
  });
  it('is empty for no conditions', () => {
    const s = igConditionSummary([]);
    expect(s).toEqual({ flatD20: 0, flatSources: [], disadvantages: [], other: [] });
  });
});

describe('igConditionPenaltyNote', () => {
  it('reads out the stacked flat penalty legibly, or null when none', () => {
    expect(igConditionPenaltyNote(['Shaken', 'Sickened'])).toMatch(/^-4 to attacks, saves & skill checks \(Shaken, Sickened\)/);
    expect(igConditionPenaltyNote(['Blind'])).toBeNull(); // Blind is disadvantage, not a flat penalty
    expect(igConditionPenaltyNote([])).toBeNull();
  });
});

describe('igStanceMechanic — the active tier by level (a single benefit)', () => {
  it('Offensive: Basic gives advantage on attacks + disadvantage on Reflex; Advanced is the damage bonus', () => {
    const low = igStanceMechanic('Offensive', 4)!;
    expect(low.tier).toBe('basic');
    expect(low.advantage).toBe('attack rolls');
    expect(low.disadvantage).toBe('Reflex saves');
    expect(low.bonus).toBeUndefined();
    const high = igStanceMechanic('offensive stance', 5)!;
    expect(high.tier).toBe('advanced');
    expect(high.bonus).toMatch(/half your level to damage/);
    expect(high.advantage).toBeUndefined(); // advanced replaces basic
  });

  it('Defensive Advanced grants DR; Menacing tiers differ; positional stances carry a note', () => {
    expect(igStanceMechanic('Defensive', 6)!.damageReduction).toBe('half your level');
    expect(igStanceMechanic('Menacing', 1)!.advantage).toBe('trained combat skills');
    expect(igStanceMechanic('Menacing', 5)!.advantage).toBe('all combat skills');
    expect(igStanceMechanic('Shifting', 1)!.note).toMatch(/can’t be flanked/);
  });

  it('null for an unknown stance; a legible note for a real one', () => {
    expect(igStanceMechanic('Berserker', 3)).toBeNull();
    expect(igStanceMechanicNote('Defensive', 6)).toMatch(/Defensive Stance \(advanced\): DR half your level/);
    expect(igStanceMechanicNote('Offensive', 1)).toMatch(/advantage on attack rolls; disadvantage on Reflex saves/);
  });
});

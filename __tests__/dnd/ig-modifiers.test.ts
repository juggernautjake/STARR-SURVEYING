// __tests__/dnd/ig-modifiers.test.ts — the pure condition-mechanics model: the stacking flat d20 penalty
// (Shaken/Sickened) + a legible summary of disadvantage/other effects, drawn only from IG condition rules.
import { describe, it, expect } from 'vitest';
import {
  igConditionMechanic,
  igConditionSummary,
  igConditionPenaltyNote,
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

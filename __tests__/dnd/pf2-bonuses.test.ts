// __tests__/dnd/pf2-bonuses.test.ts — PF2 bonus stacking and rune resolution (S13b).
//
// The rule these guard: PF2 bonuses and penalties have TYPES, and same-type effects do not stack —
// only the highest bonus and worst penalty of each type apply, and different types then add.
// Untyped penalties are the exception and always stack.
//
// 5e has nothing like this, so the instinctive implementation (sum everything) produces numbers
// that look reasonable and are wrong. A +1 item bonus plus a +2 item bonus is +2, not +3.
import { describe, it, expect } from 'vitest';
import { pf2StackModifiers, pf2ResolveRunes, type PF2Modifier } from '@/lib/dnd/systems/pathfinder2e/bonuses';

const m = (type: PF2Modifier['type'], value: number, source = 'x'): PF2Modifier => ({ type, value, source });

describe('same-type bonuses do not stack', () => {
  it('takes the highest item bonus, not the sum', () => {
    const r = pf2StackModifiers([m('item', 1, 'potency'), m('item', 2, 'better potency')]);
    expect(r.total).toBe(2);
  });

  it('same for status and circumstance', () => {
    expect(pf2StackModifiers([m('status', 1), m('status', 3)]).total).toBe(3);
    expect(pf2StackModifiers([m('circumstance', 2), m('circumstance', 1)]).total).toBe(2);
  });

  it('but DIFFERENT types add', () => {
    // +1 item, +1 status, +2 circumstance = +4.
    const r = pf2StackModifiers([m('item', 1), m('status', 1), m('circumstance', 2)]);
    expect(r.total).toBe(4);
  });
});

describe('penalties follow the same rule, worst-wins', () => {
  it('takes the worst status penalty rather than summing', () => {
    // Frightened 2 and Sickened 1 are both status penalties: −2, not −3.
    const r = pf2StackModifiers([m('status', -2, 'Frightened 2'), m('status', -1, 'Sickened 1')]);
    expect(r.total).toBe(-2);
  });

  it('a bonus and a penalty of the SAME type both apply', () => {
    // +2 item and −1 item net to +1. They do not cancel to "whichever is larger".
    expect(pf2StackModifiers([m('item', 2), m('item', -1)]).total).toBe(1);
  });

  it('untyped penalties always stack', () => {
    // The documented exception — this is why 'untyped' is a real case and not a default.
    expect(pf2StackModifiers([m('untyped', -1), m('untyped', -2), m('untyped', -1)]).total).toBe(-4);
  });
});

describe('the breakdown names only what counted', () => {
  it('lists the applied modifier and marks the suppressed one', () => {
    // A suppressed +1 must NOT appear as applied, or a player adding up the listed sources gets a
    // different total than the sheet shows.
    const r = pf2StackModifiers([m('item', 1, 'lesser'), m('item', 2, 'greater')]);
    expect(r.applied.map((x) => x.source)).toEqual(['greater']);
    expect(r.suppressed.map((x) => x.source)).toEqual(['lesser']);
  });

  it('the applied list always sums to the total', () => {
    // The invariant that makes the breakdown trustworthy.
    const mods = [m('item', 2), m('item', 1), m('status', -1), m('status', -3), m('untyped', -1), m('circumstance', 2)];
    const r = pf2StackModifiers(mods);
    expect(r.applied.reduce((n, x) => n + x.value, 0)).toBe(r.total);
  });

  it('ignores zero-value modifiers entirely', () => {
    const r = pf2StackModifiers([m('item', 0), m('status', 0)]);
    expect(r.total).toBe(0);
    expect(r.applied).toEqual([]);
  });

  it('an empty list is zero, not NaN', () => {
    expect(pf2StackModifiers([]).total).toBe(0);
  });
});

describe('rune resolution', () => {
  it('reads a potency rune as an item bonus', () => {
    expect(pf2ResolveRunes(['+1 weapon potency']).itemBonus).toBe(1);
    expect(pf2ResolveRunes(['+3 armor potency']).itemBonus).toBe(3);
  });

  it('never sums two potency runes', () => {
    // A weapon carries ONE potency rune. Summing would give +4 rather than +3.
    expect(pf2ResolveRunes(['+1 weapon potency', '+3 weapon potency']).itemBonus).toBe(3);
  });

  it('reads the striking line and keeps the strongest', () => {
    expect(pf2ResolveRunes(['striking']).striking).toBe('striking');
    expect(pf2ResolveRunes(['greater striking']).striking).toBe('greater');
    expect(pf2ResolveRunes(['striking', 'major striking']).striking).toBe('major');
  });

  it('reads resilient as a save bonus', () => {
    expect(pf2ResolveRunes(['greater resilient']).saveBonus).toBe(2);
  });

  it('resolves catalogued property runes with their effect', () => {
    const r = pf2ResolveRunes(['flaming']);
    expect(r.properties).toContain('Flaming');
    expect(r.notes.join(' ').toLowerCase()).toContain('fire');
  });

  it('records an unknown rune as visible but claims no mechanics', () => {
    // Ground Rule 3: contribute nothing rather than a made-up bonus, but do not silently swallow
    // it either — the player should see that the sheet does not know what it does.
    const r = pf2ResolveRunes(['Blorpwave Rune']);
    expect(r.properties).toContain('Blorpwave Rune');
    expect(r.itemBonus).toBe(0);
    expect(r.notes.join(' ')).toContain('no mechanics applied');
  });

  it('an empty rune list contributes nothing', () => {
    const r = pf2ResolveRunes([]);
    expect(r).toMatchObject({ itemBonus: 0, striking: 'none', saveBonus: 0 });
  });

  it('handles a realistic full loadout', () => {
    const r = pf2ResolveRunes(['+2 weapon potency', 'greater striking', 'flaming']);
    expect(r.itemBonus).toBe(2);
    expect(r.striking).toBe('greater');
    expect(r.properties).toContain('Flaming');
  });
});

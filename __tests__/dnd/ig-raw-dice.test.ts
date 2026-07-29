// __tests__/dnd/ig-raw-dice.test.ts — a raw d4 is a d4 (owner report, 2026-07-28).
//
// OWNER: *"I am rolling a 1d4 and getting a 5. Maybe there is a good reason for the IG system that this
// happens."*
//
// There was a reason, and it was a REAL RULE APPLIED IN THE WRONG PLACE. Intuitive Games' Offensive stance,
// at its Advanced tier, grants "+half your level to damage rolls" — `igStanceDamageBonus`, floor(level / 2).
// That is correct for a weapon's damage. But the DICE PAD's generic "roll NdX" button routed through
// `rollDamage`, so a bare d4 pressed on the pad also collected it: at level 8, a natural 1 displayed as 5,
// with nothing on screen to say why.
//
// Two separate defects, and they need separate fixes:
//   1. A dice-pad roll is not a damage roll. It now goes through `rollRaw` — no stance bonus.
//   2. When a bonus IS legitimately folded in, it must be NAMED. `buildDamageActiveRoll` now carries
//      `boosts`/`penalties`, which every roller already renders, so "Offensive stance (+4 damage)" appears
//      beside the total instead of the player reverse-engineering it.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildDamageActiveRoll } from '@/app/dnd/_sheet/components/rollers/rollFeedBuild';
import { igStanceDamageBonus } from '@/lib/dnd/stances/intuitive-games';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const panels = read('app/dnd/_ui/ig/useIgPanels.tsx');

describe('the stance rule itself is real and unchanged', () => {
  it('Offensive advanced adds half your level to DAMAGE', () => {
    // Not a bug — this is the system's rule, and the fix must not remove it from weapon damage.
    const b = igStanceDamageBonus('Offensive', 8);
    expect(b?.bonus).toBe(4);
    expect(b?.source).toMatch(/Offensive/);
  });

  it('and scales by floor(level / 2) once the tier is unlocked', () => {
    // The bonus is the ADVANCED tier's, so it does not exist at low levels — `igStanceMechanic` returns a
    // different tier there and the helper correctly yields null. My first version of this test assumed the
    // rule applied from level 1 and expected 0; the code was right and the test was wrong.
    expect(igStanceDamageBonus('Offensive', 1)).toBeNull();
    expect(igStanceDamageBonus('Offensive', 8)?.bonus).toBe(4);
    expect(igStanceDamageBonus('Offensive', 10)?.bonus).toBe(5);
  });

  it('while another stance adds nothing', () => {
    expect(igStanceDamageBonus('Defensive', 8)).toBeNull();
    expect(igStanceDamageBonus(null, 8)).toBeNull();
  });
});

describe('a dice-pad roll does NOT collect it', () => {
  it('the pad routes through rollRaw, not rollDamage', () => {
    // THE bug. `rollDice` is the dice pad's callback; pointing it at `rollDamage` made every arbitrary die
    // inherit a weapon-damage rule.
    expect(panels).toMatch(/rollDice: \(sides, n\) => rollRaw\(/);
    expect(panels, 'the pad must not route through the damage path').not.toMatch(/rollDice: \(sides, n\) => rollDamage\(/);
  });

  it('and rollRaw applies no stance bonus at all', () => {
    const fn = panels.slice(panels.indexOf('const rollRaw ='), panels.indexOf('// Incremental edit'));
    expect(fn).toContain('rollDiceExpr(expr)');
    expect(fn, 'a raw roll must not consult the stance').not.toContain('igStanceDamageBonus');
  });

  it('while weapon damage still DOES', () => {
    // The rule is correct where it belongs; only the pad was wrong.
    const fn = panels.slice(panels.indexOf('const rollDamage ='), panels.indexOf('const rollRaw ='));
    expect(fn).toContain('igStanceDamageBonus(');
  });

  it('and the raw roll is labelled so the log distinguishes the two', () => {
    expect(panels).toMatch(/\(raw\)/);
  });
});

describe('when a bonus IS folded in, it is NAMED', () => {
  it('damage rolls can now carry boosts and penalties', () => {
    const roll = buildDamageActiveRoll({
      token: 1, label: 'Axe damage', total: 9, breakdown: 'd8[5] + 4',
      boosts: ['Offensive stance (+4 damage)'],
    });
    expect(roll.entry.boosts).toEqual(['Offensive stance (+4 damage)']);
  });

  it('and omits the keys entirely when there is nothing to say', () => {
    // An empty array would render an empty "sources" section on three different rollers.
    const roll = buildDamageActiveRoll({ token: 1, label: 'd6', total: 4, breakdown: 'd6[4]' });
    expect(roll.entry.boosts).toBeUndefined();
    expect(roll.entry.penalties).toBeUndefined();
  });

  it('the IG damage roll passes the stance as a named boost', () => {
    // This is what puts "Offensive stance (+4 damage)" on screen instead of an unexplained +4.
    expect(panels).toMatch(/boosts: dmg \? \[`\$\{dmg\.source\} \(\+\$\{dmg\.bonus\} damage\)`\] : undefined/);
  });

  it('and the total is still the authoritative one', () => {
    // The roller EXPLAINS the total; it never recomputes it. Adding named sources must not change the sum.
    const roll = buildDamageActiveRoll({
      token: 1, label: 'x', total: 9, breakdown: 'd8[5] + 4', boosts: ['Offensive stance (+4 damage)'],
    });
    expect(roll.entry.total).toBe(9);
    expect(roll.landing).toBe(9);
  });
});

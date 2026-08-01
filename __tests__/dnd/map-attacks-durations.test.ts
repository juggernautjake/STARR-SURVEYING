// __tests__/dnd/map-attacks-durations.test.ts — weapon reach and area durations (M5-3 / M5-4 remainders).
//
// Both halves guard the same class of failure: a confidently wrong shape or a confidently wrong number,
// drawn on a map a DM will aim on. Neither throws.
import { describe, it, expect } from 'vitest';
import { attacksFrom, parseReachFt, reachCells } from '@/lib/dnd/maps/attacks';
import { describeDuration, isExpired, readDuration, roundsLeft } from '@/lib/dnd/maps/durations';
import type { MapGrid } from '@/lib/dnd/maps/grid';

const grid: MapGrid = {
  kind: 'square', size: 5, unitFt: 5, offsetX: 0, offsetY: 0, opacity: 0.3, colour: '#fff', snap: true,
} as MapGrid;

describe('parsing a weapon reach from the sheet', () => {
  it('reads a plain distance', () => {
    expect(parseReachFt('5 ft', '5e-2024')).toBe(5);
    expect(parseReachFt('10 feet', '5e-2024')).toBe(10);
    expect(parseReachFt('Reach 10 ft.', '5e-2024')).toBe(10);
  });

  it('takes the NORMAL range from a normal/long pair', () => {
    // 600 is long range, which in 5e imposes disadvantage rather than describing where the weapon
    // reaches. Drawing it would tell a player they can shoot cleanly across the map.
    expect(parseReachFt('150/600 ft', '5e-2024')).toBe(150);
    expect(parseReachFt('80/320', '5e-2024')).toBe(80);
  });

  it('gives a bare "Melee" the system default, and only where the system HAS one', () => {
    // A rule rather than a guess: 5 feet is the melee reach in both 5e and PF2, and a range field that
    // says only "Melee" is stating that default. A system without one gets null instead of an invented
    // number — the rule-invention this directory keeps refusing.
    expect(parseReachFt('Melee', '5e-2024')).toBe(5);
    expect(parseReachFt('Touch', 'pathfinder2e')).toBe(5);
    expect(parseReachFt('Melee', 'intuitive-games')).toBeNull();
    expect(parseReachFt('Melee', null)).toBeNull();
  });

  it('refuses what it cannot read rather than guessing', () => {
    // A shape drawn from a range nobody can parse is worse than no shape.
    expect(parseReachFt('Self', '5e-2024')).toBeNull();
    expect(parseReachFt('', '5e-2024')).toBeNull();
    expect(parseReachFt(null, '5e-2024')).toBeNull();
    expect(parseReachFt('0 ft', '5e-2024')).toBeNull();
  });
});

describe('the picker', () => {
  it('deduplicates by REACH, not by weapon', () => {
    // Three attacks at 5 ft need one 5 ft template: the map cares about the shape, not which weapon
    // asked for it. Same rule the spell areas follow.
    const got = attacksFrom(
      [{ name: 'Dagger', range: '5 ft' }, { name: 'Shortsword', range: '5 ft' }, { name: 'Glaive', range: '10 ft' }],
      '5e-2024',
    );
    expect(got.map((a) => a.reachFt)).toEqual([5, 10]);
    expect(got[0].name).toBe('Dagger');
  });

  it('drops attacks whose range says nothing usable', () => {
    expect(attacksFrom([{ name: 'Spell attack', range: 'Self' }], '5e-2024')).toEqual([]);
    expect(attacksFrom(undefined, '5e-2024')).toEqual([]);
  });
});

describe('reach is measured the way MOVEMENT is measured', () => {
  // The decision that matters. "Within 10 feet" on a square grid is not a circle — it is whatever the
  // system's own distance rule says. A Euclidean circle would disagree with the movement overlay drawn a
  // moment earlier on the same token: two overlays, one map, two answers to "how far is that".
  it('a free diagonal makes 10ft reach a 5x5 SQUARE minus the token', () => {
    const { squares } = reachCells(12.5, 12.5, 10, grid, 'free');
    expect(squares).toHaveLength(24); // 5×5 − 1
  });

  it('5ft reach is the eight adjacent squares', () => {
    const { squares } = reachCells(12.5, 12.5, 5, grid, 'free');
    expect(squares).toHaveLength(8);
  });

  it('alternating diagonals make it SMALLER than a square — the octagon', () => {
    // PF2's second diagonal costs 10ft, so the far corners of a 5×5 fall outside a 10ft reach.
    const free = reachCells(12.5, 12.5, 10, grid, 'free').squares.length;
    const alt = reachCells(12.5, 12.5, 10, grid, 'alternating').squares.length;
    expect(alt).toBeLessThan(free);
  });

  it('orthogonal-only makes it a diamond', () => {
    const { squares } = reachCells(12.5, 12.5, 10, grid, 'orthogonal');
    // The four corners of the inner ring are out; the shape is a plus/diamond.
    expect(squares.length).toBeLessThan(reachCells(12.5, 12.5, 10, grid, 'free').squares.length);
  });

  it('never includes the token\'s own square', () => {
    const { squares } = reachCells(12.5, 12.5, 15, grid, 'free');
    expect(squares.some((c) => c.col === 2 && c.row === 2)).toBe(false);
  });

  it('returns nothing for a zero or negative reach', () => {
    expect(reachCells(12.5, 12.5, 0, grid, 'free').squares).toEqual([]);
    expect(reachCells(12.5, 12.5, -5, grid, 'free').squares).toEqual([]);
  });
});

describe('an area that runs out', () => {
  const d = { startRound: 3, rounds: 4 };

  it('counts against the encounter round rather than ticking', () => {
    // Nothing decrements. A DM who rewinds the round — they do, "wait, we forgot Ana's turn" — would
    // leave every area stale under a countdown, an area created while nobody had the map open would
    // never tick, and two browsers would tick it twice.
    expect(roundsLeft(d, 3)).toBe(4);
    expect(roundsLeft(d, 5)).toBe(2);
    expect(roundsLeft(d, 7)).toBe(0);
    expect(roundsLeft(d, 99)).toBe(0);
  });

  it('a REWOUND round shows the full duration again rather than a negative one', () => {
    expect(roundsLeft(d, 1)).toBe(4);
  });

  it('shows its full duration when no fight is running', () => {
    // A spell placed during exploration has not started counting down, and an area that vanished the
    // moment initiative ended would take the DM's prepared battlefield with it.
    expect(roundsLeft(d, null)).toBe(4);
    expect(isExpired(d, null)).toBe(false);
  });

  it('is null for an area with no duration at all', () => {
    expect(roundsLeft(null, 5)).toBeNull();
    expect(isExpired(null, 5)).toBe(false);
    expect(describeDuration(null, 5)).toBeNull();
  });

  it('needs BOTH a start and a length, or it is not a duration', () => {
    // A duration with no start cannot be counted from, and assuming round 1 would expire a fresh area
    // instantly in a round-9 fight.
    expect(readDuration({ durationRounds: 3 })).toBeNull();
    expect(readDuration({ startRound: 2 })).toBeNull();
    expect(readDuration({ durationRounds: 0, startRound: 2 })).toBeNull();
    expect(readDuration({ durationRounds: 3, startRound: 2 })).toEqual({ rounds: 3, startRound: 2 });
  });

  it('says what it is doing, in words a DM reads at a glance', () => {
    expect(describeDuration(d, 5)).toBe('2 rounds left');
    expect(describeDuration(d, 6)).toBe('1 round left');
    expect(describeDuration(d, 7)).toBe('ended');
  });
});

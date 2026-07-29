// __tests__/dnd/roll-stats.test.ts — reading the roll log back (P3-3).
//
// P3-1 made every sheet roll reach `dnd_roll_log`; this reads it. No migration, no new capture — the table
// already had every column needed, which is what "falls out of P3-1 for almost nothing" meant.
//
// TWO THINGS HERE ARE EASY TO GET WRONG AND BOTH LOOK FINE WHEN THEY ARE:
//  1. "Average d20" is NOT the mean of `result`. `result` is the total after modifiers, so averaging it
//     rises when a character levels and says nothing about luck.
//  2. The breakdown has two shapes. `d20[14]` for a straight roll, `d20[7,18]→18` for advantage — and a
//     regex handling only the first silently drops every advantage roll from the sample while still
//     rendering a confident number. I shipped exactly that in the first draft of the module.
import { describe, it, expect } from 'vitest';
import { naturalD20, isD20Roll, actorStats, luckiestSession, tableStats, type RollRow } from '@/lib/dnd/roll-stats';

const roll = (over: Partial<RollRow> = {}): RollRow => ({
  actor_name: 'Vex', result: 18, breakdown: 'd20[14] + 4', crit: false, fumble: false,
  session_id: 's1', created_at: '2026-07-01T00:00:00Z', ...over,
});

describe('reading the natural face', () => {
  it('from a straight roll', () => {
    expect(naturalD20('d20[14] + 7')).toBe(14);
    expect(naturalD20('1d20[1]')).toBe(1);
    expect(naturalD20('d20[20] − 2')).toBe(20);
  });

  it('from an ADVANTAGE roll, taking the kept die', () => {
    // THE bug from the first draft. `\bd20\[(\d+)\]` requires `]` straight after the digits, so this — the
    // shape every advantage and disadvantage roll takes — matched nothing and was dropped from the sample.
    expect(naturalD20('d20[7,18]→18 + 3')).toBe(18);
    expect(naturalD20('d20[19,2]→2 + 1')).toBe(2);
  });

  it('and declines when it cannot tell which die was kept', () => {
    // A pair with no `→kept` is ambiguous; picking one would invent a roll that may not have happened.
    expect(naturalD20('d20[7,18]')).toBeNull();
  });

  it('returns null for anything that is not a d20', () => {
    expect(naturalD20('d8[5] + 3')).toBeNull();
    expect(naturalD20('recorded (rolled in person)')).toBeNull();
    expect(naturalD20('')).toBeNull();
    expect(naturalD20(null)).toBeNull();
  });

  it('and discards an impossible face rather than trusting it', () => {
    expect(naturalD20('d20[47]')).toBeNull();
    expect(naturalD20('d20[0]')).toBeNull();
  });
});

describe('average d20 is never the average of totals', () => {
  it('averages the FACES, not the results', () => {
    const rows = [
      roll({ breakdown: 'd20[10] + 5', result: 15 }),
      roll({ breakdown: 'd20[20] + 5', result: 25 }),
    ];
    // Faces are 10 and 20 → 15. Totals are 15 and 25 → 20. If this ever reads 20, the module is averaging
    // the wrong column and the statistic is meaningless.
    expect(tableStats(rows).averageD20).toBe(15);
  });

  it('is NULL when no face could be read, rather than a guess', () => {
    // A luck number quietly derived from totals is worse than no luck number, because it looks right.
    const rows = [roll({ breakdown: 'recorded (rolled in person)', result: 17 })];
    expect(tableStats(rows).averageD20).toBeNull();
    expect(actorStats(rows)[0].averageD20).toBeNull();
  });

  it('and the table average weights by roll count, not by player', () => {
    // A mean of per-player means would let someone with three rolls sway the table as much as someone with
    // three hundred.
    const rows = [
      ...Array.from({ length: 9 }, () => roll({ actor_name: 'Grog', breakdown: 'd20[10]' })),
      roll({ actor_name: 'Pike', breakdown: 'd20[20]' }),
    ];
    expect(tableStats(rows).averageD20).toBe(11); // (9×10 + 20) / 10
  });
});

describe('nat-20s come from the authoritative flag, but only on d20 rolls', () => {
  it('counts a crit', () => {
    const rows = [roll({ crit: true, breakdown: 'd20[20] + 4' })];
    expect(actorStats(rows)[0].nat20s).toBe(1);
  });

  it('and NOT the damage roll that follows it', () => {
    // A critical hit's damage roll also carries `crit`. Counting it would report two nat-20s for one lucky
    // attack — the kind of inflation nobody would question.
    const rows = [
      roll({ crit: true, breakdown: 'd20[20] + 4' }),
      roll({ crit: true, breakdown: '2d8[7,6] + 4', formula: '2d8+4' }),
    ];
    const [vex] = actorStats(rows);
    expect(vex.nat20s).toBe(1);
    expect(vex.rolls).toBe(2);
    expect(vex.d20Rolls).toBe(1);
  });

  it('and fumbles the same way', () => {
    const rows = [roll({ fumble: true, breakdown: 'd20[1] + 4' }), roll({ fumble: true, breakdown: 'd6[1]' })];
    expect(actorStats(rows)[0].nat1s).toBe(1);
  });
});

describe('per-actor grouping', () => {
  it('splits by name and orders by roll count, then alphabetically', () => {
    const rows = [
      roll({ actor_name: 'Vex' }), roll({ actor_name: 'Vex' }),
      roll({ actor_name: 'Grog' }),
      roll({ actor_name: 'Pike' }),
    ];
    // Stable order, so a stats panel does not reshuffle between loads.
    expect(actorStats(rows).map((a) => a.actor)).toEqual(['Vex', 'Grog', 'Pike']);
  });

  it('and an unattributed roll is grouped rather than dropped', () => {
    const rows = [roll({ actor_name: null }), roll({ actor_name: '   ' })];
    const stats = actorStats(rows);
    expect(stats).toHaveLength(1);
    expect(stats[0].actor).toBe('Unknown');
    expect(stats[0].rolls).toBe(2);
  });
});

describe('the luckiest session', () => {
  const many = (n: number, over: Partial<RollRow>) => Array.from({ length: n }, () => roll(over));

  it('is the one with the best nat-20 minus nat-1 swing', () => {
    const rows = [
      ...many(5, { session_id: 'quiet' }),
      ...many(5, { session_id: 'lucky', crit: true, breakdown: 'd20[20]' }),
    ];
    expect(luckiestSession(rows)?.sessionId).toBe('lucky');
  });

  it('and fumbles count against it', () => {
    const rows = [
      ...many(5, { session_id: 'a', crit: true, breakdown: 'd20[20]' }),
      ...many(3, { session_id: 'b', crit: true, breakdown: 'd20[20]' }),
      ...many(5, { session_id: 'a', fumble: true, breakdown: 'd20[1]' }),
      ...many(3, { session_id: 'b' }),
    ];
    // a: 5 crits − 5 fumbles = 0. b: 3 crits − 0 = 3.
    expect(luckiestSession(rows)?.sessionId).toBe('b');
  });

  it('ignores a session with too few rolls to mean anything', () => {
    // Without a floor, one lucky roll on a night nobody played would beat a whole evening of them.
    const rows = [
      ...many(2, { session_id: 'fluke', crit: true, breakdown: 'd20[20]' }),
      ...many(6, { session_id: 'real', crit: true, breakdown: 'd20[20]' }),
    ];
    expect(luckiestSession(rows)?.sessionId).toBe('real');
  });

  it('and returns null when nothing qualifies', () => {
    expect(luckiestSession([])).toBeNull();
    expect(luckiestSession(many(3, { session_id: 's1' }))).toBeNull();
    // Rolls with no session belong to no session and cannot win one.
    expect(luckiestSession(many(20, { session_id: null }))).toBeNull();
  });
});

describe('the whole shape survives junk', () => {
  it('empty input', () => {
    const s = tableStats([]);
    expect(s).toMatchObject({ totalRolls: 0, d20Rolls: 0, nat20s: 0, nat1s: 0, averageD20: null, luckiest: null });
    expect(s.actors).toEqual([]);
  });

  it('and rows missing every optional field', () => {
    expect(() => tableStats([{}, { actor_name: null, breakdown: null }])).not.toThrow();
    expect(tableStats([{}]).totalRolls).toBe(1);
  });

  it('isD20Roll reads the formula too, since a breakdown may be absent', () => {
    expect(isD20Roll({ formula: '1d20+5' })).toBe(true);
    expect(isD20Roll({ breakdown: 'd20[3]' })).toBe(true);
    expect(isD20Roll({ breakdown: '2d6+1' })).toBe(false);
    expect(isD20Roll({})).toBe(false);
  });
});

describe('the d20 detector', () => {
  it('matches an explicit count, which `\bd20\b` would miss', () => {
    // There is no word boundary between `1` and `d`, so `\bd20\b` fails on `1d20` — the form a DM-typed
    // roll arrives in. `dieShape.ts` documents the same trap; this is the second time it has bitten.
    expect(isD20Roll({ formula: '1d20+5' })).toBe(true);
    expect(isD20Roll({ breakdown: '1d20[12] + 2' })).toBe(true);
  });

  it('but still excludes a d200', () => {
    expect(isD20Roll({ formula: '1d200' })).toBe(false);
  });
});

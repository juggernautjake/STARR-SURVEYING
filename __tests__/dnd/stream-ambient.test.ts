// __tests__/dnd/stream-ambient.test.ts — deterministic ambient chatter.
// Owner 2026-07-19: everyone watching a stream must see the SAME chat. These lock in
// the property that makes that true — the feed is a pure function of shared state.
import { describe, it, expect } from 'vitest';
import { mulberry32, hashStr, seedFor, ambientBeat, ambientBetween, beatAt, BEAT_MS } from '@/lib/dnd/stream-ambient';

const base = {
  streamKey: 'char-abc',
  perSec: 4,
  crowdSize: 20,
  poolSize: 300,
  emojiCount: 30,
  spamTokenCount: 6,
  maxBurst: 12,
};

describe('mulberry32', () => {
  it('is deterministic for a seed', () => {
    const a = mulberry32(12345); const b = mulberry32(12345);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
  it('differs across seeds', () => {
    expect(mulberry32(1)()).not.toBe(mulberry32(2)());
  });
  it('stays in [0,1)', () => {
    const r = mulberry32(99);
    for (let i = 0; i < 500; i++) { const v = r(); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(1); }
  });
});

describe('hashStr / seedFor', () => {
  it('is stable and order-sensitive', () => {
    expect(hashStr('abc')).toBe(hashStr('abc'));
    expect(hashStr('abc')).not.toBe(hashStr('acb'));
  });
  it('separates beats and streams', () => {
    expect(seedFor('a', 1)).not.toBe(seedFor('a', 2));
    expect(seedFor('a', 1)).not.toBe(seedFor('b', 1));
  });
});

describe('ambientBeat — the same chat for everyone', () => {
  it('two independent clients derive identical lines for a beat', () => {
    for (let beat = 0; beat < 200; beat++) {
      expect(ambientBeat({ ...base, beat })).toEqual(ambientBeat({ ...base, beat }));
    }
  });

  it('different streams do not share a feed', () => {
    const mine = Array.from({ length: 60 }, (_, b) => ambientBeat({ ...base, beat: b }));
    const theirs = Array.from({ length: 60 }, (_, b) => ambientBeat({ ...base, streamKey: 'other', beat: b }));
    expect(mine).not.toEqual(theirs);
  });

  it('stays silent when nobody is watching or the pool is empty', () => {
    expect(ambientBeat({ ...base, beat: 1, crowdSize: 0 })).toEqual([]);
    expect(ambientBeat({ ...base, beat: 1, poolSize: 0 })).toEqual([]);
    expect(ambientBeat({ ...base, beat: 1, perSec: 0 })).toEqual([]);
  });

  it('keeps every index inside its array bounds', () => {
    for (let beat = 0; beat < 400; beat++) {
      for (const l of ambientBeat({ ...base, beat })) {
        expect(l.userIndex).toBeGreaterThanOrEqual(0);
        expect(l.userIndex).toBeLessThan(base.crowdSize);
        expect(l.bodyIndex).toBeLessThan(base.poolSize);
        expect(l.spamToken).toBeLessThan(base.spamTokenCount);
        expect(l.leadEmoji).toBeLessThan(base.emojiCount);
        for (const t of l.trailing) expect(t).toBeLessThan(base.emojiCount);
      }
    }
  });

  it('never exceeds maxBurst', () => {
    for (let beat = 0; beat < 400; beat++) {
      expect(ambientBeat({ ...base, beat, maxBurst: 3 }).length).toBeLessThanOrEqual(3);
    }
  });

  it('a faster stream produces more lines than a slower one', () => {
    const count = (perSec: number) =>
      Array.from({ length: 600 }, (_, b) => ambientBeat({ ...base, perSec, beat: b }).length).reduce((a, c) => a + c, 0);
    expect(count(8)).toBeGreaterThan(count(1));
  });

  it('roughly tracks the requested rate', () => {
    const beats = 4000;
    const total = Array.from({ length: beats }, (_, b) => ambientBeat({ ...base, perSec: 2, beat: b }).length).reduce((a, c) => a + c, 0);
    const perSec = total / ((beats * BEAT_MS) / 1000);
    expect(perSec).toBeGreaterThan(1); // same order of magnitude as the 2/s asked for
    expect(perSec).toBeLessThan(6);
  });
});

describe('beatAt', () => {
  it('maps a wall-clock instant onto a shared slot', () => {
    expect(beatAt(0)).toBe(0);
    expect(beatAt(BEAT_MS - 1)).toBe(0);
    expect(beatAt(BEAT_MS)).toBe(1);
    // Clients a few ms apart land on the same beat — which is what keeps them in step.
    expect(beatAt(10_000)).toBe(beatAt(10_000 + 5));
  });
});

describe('ambientBetween', () => {
  it('replays a range in order and matches per-beat generation', () => {
    const got = ambientBetween(base, 10, 20);
    const want = [];
    for (let b = 10; b < 20; b++) for (const l of ambientBeat({ ...base, beat: b })) want.push({ ...l, beat: b });
    expect(got).toEqual(want);
    expect(got.map((l) => l.beat)).toEqual([...got.map((l) => l.beat)].sort((a, b) => a - b));
  });

  it('caps a long catch-up so a backgrounded tab cannot flood the feed', () => {
    const flood = ambientBetween(base, 0, 100_000, 40);
    expect(flood.every((l) => l.beat >= 100_000 - 40)).toBe(true);
  });

  it('a late joiner sees exactly what everyone else saw for those beats', () => {
    const early = ambientBetween(base, 500, 540);
    const late = ambientBetween(base, 500, 540); // joined later, same schedule
    expect(late).toEqual(early);
  });
});

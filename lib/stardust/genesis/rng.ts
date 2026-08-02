// lib/stardust/genesis/rng.ts — the only source of randomness in Genesis.
// Spec: docs/planning/in-progress/STARDUST_GENESIS_SEQUENCE_2026-07-21.md (Ground rule 1)
//
// Ground rule 1 is "PLAN is pure and deterministic — no Math.random(), no Date.now(). Same seed,
// same universe, forever." That only holds if every draw goes through here, so this module is the
// single chokepoint. mulberry32, the same generator the map studio already uses for its own seeded
// art (`mulberry` in map-studio.html), so a body generated here and re-rendered there agree.

export interface Rng {
  /** Uniform in [0, 1). */
  next(): number;
  /** Uniform in [min, max). */
  range(min: number, max: number): number;
  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number;
  /** Uniform pick. Throws on an empty list rather than returning undefined. */
  pick<T>(items: readonly T[]): T;
  /** Weighted pick. Weights need not sum to 1. */
  weighted<T>(entries: readonly (readonly [T, number])[]): T;
  /** True with probability p. */
  chance(p: number): boolean;
  /**
   * A derived, independent stream. Naming a sub-stream keeps one part of generation from shifting
   * every later draw when it changes — add a moon type and the other systems stay identical.
   */
  fork(label: string): Rng;
}

function hashString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export function makeRng(seed: number | string): Rng {
  let a = (typeof seed === 'string' ? hashString(seed) : seed >>> 0) || 1;
  const next = (): number => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const rng: Rng = {
    next,
    range: (min, max) => min + next() * (max - min),
    int: (min, max) => Math.floor(min + next() * (max - min + 1)),
    pick: (items) => {
      if (!items.length) throw new Error('rng.pick: empty list');
      return items[Math.floor(next() * items.length)];
    },
    weighted: (entries) => {
      if (!entries.length) throw new Error('rng.weighted: empty list');
      let total = 0;
      for (const [, w] of entries) total += Math.max(0, w);
      if (total <= 0) return entries[0][0];
      let roll = next() * total;
      for (const [value, w] of entries) {
        roll -= Math.max(0, w);
        if (roll < 0) return value;
      }
      return entries[entries.length - 1][0];
    },
    chance: (p) => next() < p,
    // Mix the label into the CURRENT state, not the original seed, so two forks with the same label
    // taken at different points still diverge.
    fork: (label) => makeRng((hashString(label) ^ Math.imul(a, 0x9e3779b1)) >>> 0),
  };
  return rng;
}

/**
 * Deterministic id. The studio's own `uid()` is Math.random-based, which would break Ground rule 1,
 * so Genesis ids are derived from the stream instead. Same shape (short, url-safe) as `uid()`.
 */
export function makeIdFactory(rng: Rng): (prefix?: string) => string {
  let n = 0;
  return (prefix = 'g') => {
    n += 1;
    const body = Math.floor(rng.next() * 0xffffffff).toString(36).padStart(6, '0').slice(0, 6);
    return `${prefix}${n.toString(36)}${body}`;
  };
}

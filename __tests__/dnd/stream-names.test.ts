// __tests__/dnd/stream-names.test.ts — procedural chat username generator (J1).
import { describe, it, expect } from 'vitest';
import { makeUsername, makeUsernames } from '@/lib/dnd/stream-names';

describe('makeUsername', () => {
  it('is deterministic for a given seed', () => {
    expect(makeUsername(42)).toEqual(makeUsername(42));
  });
  it('produces a name, a hex color, and a badges array', () => {
    const u = makeUsername(7);
    expect(u.name.length).toBeGreaterThan(2);
    expect(u.color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(Array.isArray(u.badges)).toBe(true);
  });
});

describe('makeUsernames', () => {
  it('generates hundreds of DISTINCT names', () => {
    const users = makeUsernames(300);
    expect(users).toHaveLength(300);
    expect(new Set(users.map((u) => u.name)).size).toBe(300);
  });
  it('varies across styles (plain, underscore, xX, leetspeak, "The")', () => {
    const names = makeUsernames(50).map((u) => u.name);
    expect(names.some((n) => /^xX/.test(n))).toBe(true);
    expect(names.some((n) => /The/.test(n))).toBe(true);
    expect(names.some((n) => /_/.test(n))).toBe(true);
  });
  it('assigns badges to at least some users', () => {
    const users = makeUsernames(100);
    expect(users.some((u) => u.badges.length > 0)).toBe(true);
  });
});

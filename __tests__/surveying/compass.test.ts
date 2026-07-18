// __tests__/surveying/compass.test.ts — the Work Mode compass display formatter.
import { describe, it, expect } from 'vitest';
import { compassReading, cardinalPoint, normalizeHeading, CARDINAL_POINTS } from '@/lib/surveying/compass';

describe('normalizeHeading', () => {
  it('wraps into [0, 360)', () => {
    expect(normalizeHeading(0)).toBe(0);
    expect(normalizeHeading(360)).toBe(0);
    expect(normalizeHeading(361)).toBe(1);
    expect(normalizeHeading(-1)).toBe(359);
    expect(normalizeHeading(Number.NaN)).toBeNull();
  });
});

describe('cardinalPoint', () => {
  it('names the 16 points', () => {
    expect(cardinalPoint(0)).toBe('N');
    expect(cardinalPoint(45)).toBe('NE');
    expect(cardinalPoint(90)).toBe('E');
    expect(cardinalPoint(180)).toBe('S');
    expect(cardinalPoint(270)).toBe('W');
    expect(cardinalPoint(22.5)).toBe('NNE');
  });
  it('wraps 350° back to N (nearest point)', () => {
    expect(cardinalPoint(350)).toBe('N');
  });
  it('covers exactly 16 distinct points', () => {
    expect(new Set(CARDINAL_POINTS).size).toBe(16);
  });
  it('is null for a non-finite heading', () => {
    expect(cardinalPoint(Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe('compassReading', () => {
  it('gives azimuth, bearing, and cardinal together', () => {
    const r = compassReading(45.5)!;
    expect(r.azimuth).toBe(45.5);
    expect(r.azimuthText).toMatch(/^45°30'00"$/);
    expect(r.bearingText).toBe("N 45°30'00\" E");
    expect(r.cardinal).toBe('NE');
  });

  it('normalizes an out-of-range heading first', () => {
    const r = compassReading(-90)!; // → 270
    expect(r.azimuth).toBe(270);
    expect(r.cardinal).toBe('W');
    expect(r.bearingText).toBe("N 90°00'00\" W");
  });

  it('returns null for a non-finite heading (UI shows —)', () => {
    expect(compassReading(Number.NaN)).toBeNull();
  });
});

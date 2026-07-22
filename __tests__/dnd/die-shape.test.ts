// __tests__/dnd/die-shape.test.ts — the digital die's shape follows the die rolled (D-4).
import { describe, it, expect } from 'vitest';
import { dieSides, ngonClip, ngonPoints } from '@/app/dnd/_sheet/components/rollers/dieShape';

describe('dieSides — how many sides the shape should have', () => {
  it('a d20 roll (isD20) is always a 20-sided shape', () => {
    expect(dieSides({ isD20: true, min: 1, max: 20 })).toBe(20);
    expect(dieSides({ isD20: true, min: 1, max: 20, entry: { breakdown: 'd20[14] + 3' } })).toBe(20);
  });

  it('reads the die from the damage breakdown notation', () => {
    expect(dieSides({ isD20: false, entry: { breakdown: '1d8[5] + 3' } })).toBe(8);
    expect(dieSides({ isD20: false, entry: { breakdown: '2d6[3,4]' } })).toBe(6);
    expect(dieSides({ isD20: false, entry: { breakdown: '1d12[11]' } })).toBe(12);
    expect(dieSides({ isD20: false, entry: { breakdown: '1d100[42]' } })).toBe(10); // percentile reads as d10
  });

  it('falls back to a single-die min/max, and is null for an ambiguous pool', () => {
    expect(dieSides({ isD20: false, min: 1, max: 6 })).toBe(6);
    expect(dieSides({ isD20: false, min: 1, max: 8 })).toBe(8);
    // mixed pool / non-standard total → no clean shape
    expect(dieSides({ isD20: false, min: 2, max: 13 })).toBeNull();
    expect(dieSides({ isD20: false })).toBeNull();
  });
});

describe('ngonClip — the clip-path polygon', () => {
  it('emits exactly N vertices for N sides', () => {
    for (const n of [4, 6, 8, 10, 12, 20]) {
      const clip = ngonClip(n);
      expect(clip.startsWith('polygon(')).toBe(true);
      // N vertices → N-1 commas separating them.
      expect((clip.match(/,/g) || []).length + 1).toBe(n);
    }
  });

  it('clamps to 3…20 sides so a stray value never breaks the path', () => {
    expect((ngonClip(2).match(/,/g) || []).length + 1).toBe(3);   // floored to a triangle
    expect((ngonClip(40).match(/,/g) || []).length + 1).toBe(20); // capped at 20
  });
});

describe('ngonPoints — SVG polygon points (crisp stroked die edge)', () => {
  it('emits N space-separated "x,y" vertices, inset inside the 0…100 viewBox', () => {
    for (const n of [4, 6, 8, 20]) {
      const pts = ngonPoints(n).split(' ');
      expect(pts.length).toBe(n);
      for (const p of pts) {
        const [x, y] = p.split(',').map(Number);
        // inset from the edge so the stroke isn't clipped
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(100);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThanOrEqual(100);
      }
    }
  });
});

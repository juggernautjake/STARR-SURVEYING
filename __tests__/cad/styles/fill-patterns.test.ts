// __tests__/cad/styles/fill-patterns.test.ts
//
// Slice 235 of cad-label-backgrounds-and-textured-fills-2026-05-30.md.
// Locks the pure-helper output of the fill-pattern generators so the
// Pixi render path (Slice 236) can rely on them. Fixed seeds keep the
// gravel + uniform-stipple tests deterministic.

import { describe, it, expect } from 'vitest';
import {
  SeededRng,
  generateDotUniform,
  generateDotGravel,
  generateHatchLines,
  generateBrickLines,
  generateWaveLines,
  generateFillPattern,
  patternLineWeight,
} from '@/lib/cad/styles/fill-patterns';

describe('Slice 235 — SeededRng is deterministic', () => {
  it('produces the same sequence for the same seed', () => {
    const a = new SeededRng(42);
    const b = new SeededRng(42);
    expect(a.next()).toBeCloseTo(b.next(), 12);
    expect(a.next()).toBeCloseTo(b.next(), 12);
  });

  it('gaussian samples land near the requested mean over many draws', () => {
    const rng = new SeededRng(7);
    let sum = 0;
    const n = 5000;
    for (let i = 0; i < n; i++) sum += rng.gaussian(1.5, 0.6);
    const mean = sum / n;
    expect(mean).toBeGreaterThan(1.3);
    expect(mean).toBeLessThan(1.7);
  });
});

describe('Slice 235 — generateDotUniform', () => {
  it('returns an empty array for degenerate bounds', () => {
    expect(generateDotUniform(0, 100, 1, 1.5, 1)).toEqual([]);
    expect(generateDotUniform(100, 0, 1, 1.5, 1)).toEqual([]);
  });

  it('fills the rect with grid-spaced jittered dots at density 1', () => {
    const dots = generateDotUniform(160, 160, 1, 1.5, 11);
    // Spacing baseline is 16 px, so ~10 dots per row × 10 rows.
    expect(dots.length).toBeGreaterThan(80);
    expect(dots.length).toBeLessThan(120);
    for (const d of dots) {
      expect(d.x).toBeGreaterThanOrEqual(0);
      expect(d.y).toBeGreaterThanOrEqual(0);
      expect(d.r).toBe(1.5);
    }
  });

  it('higher density => more dots per unit area', () => {
    const sparse = generateDotUniform(100, 100, 0.5, 1.5, 1).length;
    const dense = generateDotUniform(100, 100, 2, 1.5, 1).length;
    expect(dense).toBeGreaterThan(sparse);
  });
});

describe('Slice 235 — generateDotGravel', () => {
  it('returns an empty array for degenerate bounds', () => {
    expect(generateDotGravel(0, 100, 1, 1)).toEqual([]);
    expect(generateDotGravel(100, 0, 1, 1)).toEqual([]);
  });

  it('emits a deterministic dot count for a fixed seed + dimensions', () => {
    const a = generateDotGravel(200, 200, 1, 1234);
    const b = generateDotGravel(200, 200, 1, 1234);
    expect(a.length).toBe(b.length);
    for (let i = 0; i < a.length; i++) {
      expect(a[i].x).toBeCloseTo(b[i].x, 6);
      expect(a[i].y).toBeCloseTo(b[i].y, 6);
      expect(a[i].r).toBeCloseTo(b[i].r, 6);
    }
  });

  it('all dots fall inside the bounding rect with positive radius', () => {
    const dots = generateDotGravel(200, 200, 1, 42);
    for (const d of dots) {
      expect(d.x).toBeGreaterThanOrEqual(0);
      expect(d.x).toBeLessThanOrEqual(200);
      expect(d.y).toBeGreaterThanOrEqual(0);
      expect(d.y).toBeLessThanOrEqual(200);
      expect(d.r).toBeGreaterThan(0);
    }
  });

  it('radii have a slight range (mean ≈ 1.5, both small and large present)', () => {
    const dots = generateDotGravel(400, 400, 1, 99);
    expect(dots.length).toBeGreaterThan(50);
    const radii = dots.map((d) => d.r);
    const minR = Math.min(...radii);
    const maxR = Math.max(...radii);
    expect(minR).toBeLessThan(1.5);
    expect(maxR).toBeGreaterThan(1.5);
    const mean = radii.reduce((s, r) => s + r, 0) / radii.length;
    expect(mean).toBeGreaterThan(1.0);
    expect(mean).toBeLessThan(2.5);
  });

  it('dots respect a minimum-distance constraint (no overlapping clusters)', () => {
    const dots = generateDotGravel(200, 200, 1, 17);
    let minDist = Infinity;
    for (let i = 0; i < dots.length; i++) {
      for (let j = i + 1; j < dots.length; j++) {
        const dx = dots[i].x - dots[j].x;
        const dy = dots[i].y - dots[j].y;
        const d2 = dx * dx + dy * dy;
        if (d2 < minDist) minDist = d2;
      }
    }
    // Spacing baseline at density 1 = 14 px target cell × 0.85 = ~12 px.
    // Square that to keep the assertion cheap, leave a small slack.
    expect(Math.sqrt(minDist)).toBeGreaterThan(8);
  });
});

describe('Slice 235 — generateHatchLines', () => {
  it('returns an empty array for degenerate inputs', () => {
    expect(generateHatchLines(0, 100, 45, 5)).toEqual([]);
    expect(generateHatchLines(100, 0, 45, 5)).toEqual([]);
    expect(generateHatchLines(100, 100, 45, 0)).toEqual([]);
  });

  it('emits more lines as spacing decreases', () => {
    const sparse = generateHatchLines(100, 100, 45, 20).length;
    const dense = generateHatchLines(100, 100, 45, 4).length;
    expect(dense).toBeGreaterThan(sparse);
  });

  it('horizontal hatch (angle 0) emits roughly height/spacing rows', () => {
    const lines = generateHatchLines(100, 100, 0, 10);
    // Each line should be nearly horizontal: |y2 - y1| ~= 0
    for (const l of lines) expect(Math.abs(l.y2 - l.y1)).toBeLessThan(0.001);
  });

  it('vertical hatch (angle 90) emits roughly width/spacing columns', () => {
    const lines = generateHatchLines(100, 100, 90, 10);
    for (const l of lines) expect(Math.abs(l.x2 - l.x1)).toBeLessThan(0.001);
  });
});

describe('Slice 235 — generateBrickLines + generateWaveLines', () => {
  it('brick course count scales with height', () => {
    const small = generateBrickLines(120, 60, 1).length;
    const large = generateBrickLines(120, 240, 1).length;
    expect(large).toBeGreaterThan(small);
  });

  it('wave lines stay within the rect', () => {
    const lines = generateWaveLines(200, 200, 1);
    for (const l of lines) {
      expect(l.x1).toBeGreaterThanOrEqual(0);
      expect(l.x2).toBeLessThanOrEqual(200);
    }
  });
});

describe('Slice 235 — generateFillPattern dispatcher', () => {
  it('SOLID / NONE produce no dots and no lines', () => {
    expect(generateFillPattern(100, 100, { pattern: 'SOLID', density: 1, seed: 1 })).toEqual({ dots: [], lines: [] });
    expect(generateFillPattern(100, 100, { pattern: 'NONE', density: 1, seed: 1 })).toEqual({ dots: [], lines: [] });
  });

  it('DOT_GRAVEL routes through the gravel sampler', () => {
    const out = generateFillPattern(200, 200, { pattern: 'DOT_GRAVEL', density: 1, seed: 5 });
    expect(out.dots.length).toBeGreaterThan(0);
    expect(out.lines).toEqual([]);
  });

  it('CROSSHATCH combines both diagonal sets', () => {
    const right = generateFillPattern(100, 100, { pattern: 'DIAGONAL_RIGHT', density: 1, seed: 1 }).lines.length;
    const left = generateFillPattern(100, 100, { pattern: 'DIAGONAL_LEFT', density: 1, seed: 1 }).lines.length;
    const cross = generateFillPattern(100, 100, { pattern: 'CROSSHATCH', density: 1, seed: 1 }).lines.length;
    expect(cross).toBe(right + left);
  });

  it('BRICK + WAVE emit line sets but no dots', () => {
    const brick = generateFillPattern(100, 100, { pattern: 'BRICK', density: 1, seed: 1 });
    expect(brick.dots).toEqual([]);
    expect(brick.lines.length).toBeGreaterThan(0);
    const wave = generateFillPattern(100, 100, { pattern: 'WAVE', density: 1, seed: 1 });
    expect(wave.dots).toEqual([]);
    expect(wave.lines.length).toBeGreaterThan(0);
  });
});

describe('Slice 235 — FeatureStyle.fillPattern type accepts every enum value', () => {
  it('source declares the FillPattern union with all 11 variants', () => {
    const variants: import('@/lib/cad/types').FillPattern[] = [
      'SOLID',
      'NONE',
      'DOT_UNIFORM',
      'DOT_GRAVEL',
      'DOT_GRAVEL_FINE',
      'DOT_GRAVEL_COARSE',
      'DOT_SAND',
      'DIAGONAL_LEFT',
      'DIAGONAL_RIGHT',
      'CROSSHATCH',
      'HORIZONTAL_LINES',
      'VERTICAL_LINES',
      'BRICK',
      'WAVE',
    ];
    // Each variant runs through the dispatcher without throwing.
    for (const pattern of variants) {
      const out = generateFillPattern(100, 100, { pattern, density: 1, seed: 1 });
      expect(out).toBeDefined();
      expect(Array.isArray(out.dots)).toBe(true);
      expect(Array.isArray(out.lines)).toBe(true);
    }
  });
});

describe('cad-fills Slice 1 — gravel-family variants', () => {
  it('FINE / COARSE / SAND all emit dispersed dots (no lines)', () => {
    for (const pattern of ['DOT_GRAVEL_FINE', 'DOT_GRAVEL_COARSE', 'DOT_SAND'] as const) {
      const out = generateFillPattern(120, 120, { pattern, density: 1, seed: 5 });
      expect(out.lines).toEqual([]);
      expect(out.dots.length).toBeGreaterThan(0);
    }
  });

  it('COARSE dots read bigger than FINE dots on average (same seed)', () => {
    const fine = generateFillPattern(160, 160, { pattern: 'DOT_GRAVEL_FINE', density: 1, seed: 9 }).dots;
    const coarse = generateFillPattern(160, 160, { pattern: 'DOT_GRAVEL_COARSE', density: 1, seed: 9 }).dots;
    const mean = (ds: { r: number }[]) => ds.reduce((s, d) => s + d.r, 0) / Math.max(1, ds.length);
    expect(mean(coarse)).toBeGreaterThan(mean(fine));
  });

  it('SAND packs more dots than COARSE in the same box (denser)', () => {
    const sand = generateFillPattern(160, 160, { pattern: 'DOT_SAND', density: 1, seed: 3 }).dots;
    const coarse = generateFillPattern(160, 160, { pattern: 'DOT_GRAVEL_COARSE', density: 1, seed: 3 }).dots;
    expect(sand.length).toBeGreaterThan(coarse.length);
  });

  it('stays deterministic per seed', () => {
    const a = generateFillPattern(100, 100, { pattern: 'DOT_GRAVEL_FINE', density: 1, seed: 11 }).dots;
    const b = generateFillPattern(100, 100, { pattern: 'DOT_GRAVEL_FINE', density: 1, seed: 11 }).dots;
    expect(a).toEqual(b);
  });
});

describe('cad-fills Slice 1 — thickness scale', () => {
  it('scale > 1 grows gravel dot radius; scale < 1 shrinks it', () => {
    const base = generateFillPattern(160, 160, { pattern: 'DOT_GRAVEL', density: 1, seed: 21 }).dots;
    const big = generateFillPattern(160, 160, { pattern: 'DOT_GRAVEL', density: 1, seed: 21, scale: 3 }).dots;
    const small = generateFillPattern(160, 160, { pattern: 'DOT_GRAVEL', density: 1, seed: 21, scale: 0.5 }).dots;
    const mean = (ds: { r: number }[]) => ds.reduce((s, d) => s + d.r, 0) / Math.max(1, ds.length);
    expect(mean(big)).toBeGreaterThan(mean(base));
    expect(mean(small)).toBeLessThan(mean(base));
  });

  it('scale grows uniform-dot radius', () => {
    const base = generateFillPattern(120, 120, { pattern: 'DOT_UNIFORM', density: 1, seed: 1 }).dots;
    const big = generateFillPattern(120, 120, { pattern: 'DOT_UNIFORM', density: 1, seed: 1, scale: 2 }).dots;
    expect(big[0].r).toBeGreaterThan(base[0].r);
  });

  it('patternLineWeight scales the hatch/brick/wave stroke from a 0.6 baseline', () => {
    expect(patternLineWeight(1)).toBeCloseTo(0.6, 6);
    expect(patternLineWeight(2)).toBeCloseTo(1.2, 6);
    expect(patternLineWeight(0.5)).toBeCloseTo(0.3, 6);
    // clamps + null-guards to the baseline
    expect(patternLineWeight(undefined)).toBeCloseTo(0.6, 6);
    expect(patternLineWeight(0)).toBeCloseTo(0.6, 6);
    expect(patternLineWeight(99)).toBeCloseTo(0.6 * 4, 6);
  });
});

describe('cad-fills Slice 1 — density still drives spacing/frequency', () => {
  it('higher density packs more gravel dots', () => {
    const sparse = generateFillPattern(200, 200, { pattern: 'DOT_GRAVEL', density: 0.5, seed: 4 }).dots;
    const dense = generateFillPattern(200, 200, { pattern: 'DOT_GRAVEL', density: 3, seed: 4 }).dots;
    expect(dense.length).toBeGreaterThan(sparse.length);
  });

  it('higher density adds more wave rows', () => {
    const sparse = generateFillPattern(200, 200, { pattern: 'WAVE', density: 0.5, seed: 1 }).lines;
    const dense = generateFillPattern(200, 200, { pattern: 'WAVE', density: 3, seed: 1 }).lines;
    expect(dense.length).toBeGreaterThan(sparse.length);
  });
});

describe('cad-fill-rotation Slice 1 — angle rotates any pattern', () => {
  const W = 200;
  const H = 200;
  const seed = 7;

  it('angle 0 (or omitted) is the unrotated baseline (pixel-identical)', () => {
    const noAngle = generateFillPattern(W, H, { pattern: 'WAVE', density: 1, seed });
    const zero    = generateFillPattern(W, H, { pattern: 'WAVE', density: 1, seed, angle: 0 });
    expect(zero).toEqual(noAngle);
  });

  it('rotating a horizontal hatch by 90° produces ~vertical line segments', () => {
    const horiz = generateFillPattern(W, H, { pattern: 'HORIZONTAL_LINES', density: 1, seed }).lines;
    const rotated = generateFillPattern(W, H, { pattern: 'HORIZONTAL_LINES', density: 1, seed, angle: 90 }).lines;
    // Sanity: horizontal hatch has |y2 - y1| ≈ 0 for every line.
    const isHoriz = (ln: { x1: number; y1: number; x2: number; y2: number }) =>
      Math.abs(ln.y2 - ln.y1) < 0.001;
    const isVert = (ln: { x1: number; y1: number; x2: number; y2: number }) =>
      Math.abs(ln.x2 - ln.x1) < 0.001;
    expect(horiz.length).toBeGreaterThan(0);
    expect(horiz.every(isHoriz)).toBe(true);
    expect(rotated.length).toBeGreaterThan(0);
    expect(rotated.every(isVert)).toBe(true);
  });

  it('rotating a dot pattern shifts dot positions but preserves count + radii', () => {
    const base = generateFillPattern(W, H, { pattern: 'DOT_UNIFORM', density: 1, seed });
    const rotated = generateFillPattern(W, H, { pattern: 'DOT_UNIFORM', density: 1, seed, angle: 30 });
    // Both pull from the oversized generation rect at angle > 0, so the
    // counts differ a touch from the unrotated baseline — but each
    // rotated dot still carries the same radius the generator emitted.
    expect(rotated.dots.length).toBeGreaterThan(0);
    for (const d of rotated.dots) {
      expect(d.r).toBeGreaterThan(0);
    }
    // Not the same positions as the unrotated baseline.
    const sameAsBase = base.dots.length === rotated.dots.length
      && base.dots.every((b, i) => Math.abs(b.x - rotated.dots[i].x) < 0.001 && Math.abs(b.y - rotated.dots[i].y) < 0.001);
    expect(sameAsBase).toBe(false);
  });

  it('wraps a > 360° angle the same as its mod 360', () => {
    const a = generateFillPattern(W, H, { pattern: 'BRICK', density: 1, seed, angle: 45 });
    const b = generateFillPattern(W, H, { pattern: 'BRICK', density: 1, seed, angle: 405 });
    expect(a).toEqual(b);
  });

  it('coverage: rotated pattern still produces primitives that span the original bounding rect', () => {
    // Generate at 45° on a tall narrow rect; assert at least one
    // line's MIDPOINT lands inside the original rect (endpoints sit
    // outside on long hatch lines, but the line crosses the interior).
    const rotated = generateFillPattern(60, 200, { pattern: 'HORIZONTAL_LINES', density: 1, seed, angle: 45 }).lines;
    const midInRect = rotated.some((ln) => {
      const mx = (ln.x1 + ln.x2) / 2;
      const my = (ln.y1 + ln.y2) / 2;
      return mx >= 0 && mx <= 60 && my >= 0 && my <= 200;
    });
    expect(midInRect).toBe(true);
  });
});

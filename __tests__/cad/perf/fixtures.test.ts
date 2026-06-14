// __tests__/cad/perf/fixtures.test.ts
//
// cad-desktop-tauri-and-perf Slice N1d — synthetic fixtures.
// Locks the deterministic generator that the perf harness uses
// for medium (50k) and large (200k) profiling runs.

import { describe, it, expect } from 'vitest';
import {
  DEFAULT_SYNTHETIC_LAYER_ID,
  DEFAULT_SYNTHETIC_SEED,
  FIXTURE_SIZES,
  generateNamedFixture,
  generateSyntheticFeatures,
} from '@/lib/cad/perf/fixtures';

describe('FIXTURE_SIZES', () => {
  it('exposes the small / medium / large sizes called out in the plan', () => {
    expect(FIXTURE_SIZES.small).toBe(1_000);
    expect(FIXTURE_SIZES.medium).toBe(50_000);
    expect(FIXTURE_SIZES.large).toBe(200_000);
  });
});

describe('generateSyntheticFeatures — invariants', () => {
  it('returns an array of exactly `count` features', () => {
    expect(generateSyntheticFeatures(0)).toEqual([]);
    expect(generateSyntheticFeatures(10).length).toBe(10);
    expect(generateSyntheticFeatures(1234).length).toBe(1234);
  });

  it('returns empty for non-positive or non-finite counts', () => {
    expect(generateSyntheticFeatures(-1)).toEqual([]);
    expect(generateSyntheticFeatures(NaN)).toEqual([]);
    expect(generateSyntheticFeatures(0)).toEqual([]);
  });

  it('assigns every feature to the default layer when none is supplied', () => {
    const features = generateSyntheticFeatures(50);
    expect(features.every((f) => f.layerId === DEFAULT_SYNTHETIC_LAYER_ID)).toBe(true);
  });

  it('respects a custom layerId + idPrefix', () => {
    const features = generateSyntheticFeatures(20, { layerId: 'LX', idPrefix: 'bench' });
    expect(features.every((f) => f.layerId === 'LX')).toBe(true);
    expect(features.every((f) => f.id.startsWith('bench-'))).toBe(true);
  });

  it('produces a mix of POINT / LINE / POLYLINE geometry', () => {
    const features = generateSyntheticFeatures(500);
    const types = new Set(features.map((f) => f.type));
    expect(types.has('POINT')).toBe(true);
    expect(types.has('LINE')).toBe(true);
    expect(types.has('POLYLINE')).toBe(true);
  });

  it('emits LINE features with both endpoints set', () => {
    const features = generateSyntheticFeatures(200);
    const line = features.find((f) => f.type === 'LINE');
    expect(line).toBeDefined();
    expect(line!.geometry.start).toBeDefined();
    expect(line!.geometry.end).toBeDefined();
  });

  it('emits POLYLINE features with 3–6 vertices', () => {
    const features = generateSyntheticFeatures(2000);
    const polys = features.filter((f) => f.type === 'POLYLINE');
    expect(polys.length).toBeGreaterThan(0);
    for (const p of polys) {
      const v = p.geometry.vertices ?? [];
      expect(v.length).toBeGreaterThanOrEqual(3);
      expect(v.length).toBeLessThanOrEqual(6);
    }
  });
});

describe('generateSyntheticFeatures — determinism', () => {
  it('same seed + same count => byte-equal Feature[]', () => {
    const a = generateSyntheticFeatures(500, { seed: 42 });
    const b = generateSyntheticFeatures(500, { seed: 42 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('different seeds produce different feature arrays', () => {
    const a = generateSyntheticFeatures(500, { seed: 1 });
    const b = generateSyntheticFeatures(500, { seed: 2 });
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });

  it('default seed is the documented constant', () => {
    expect(DEFAULT_SYNTHETIC_SEED).toBe(0xc0ffee);
    const a = generateSyntheticFeatures(100);
    const b = generateSyntheticFeatures(100, { seed: DEFAULT_SYNTHETIC_SEED });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe('generateNamedFixture', () => {
  it('builds the small fixture at the documented size', () => {
    const f = generateNamedFixture('small');
    expect(f.length).toBe(FIXTURE_SIZES.small);
  });

  it('threads options through to the generator', () => {
    const f = generateNamedFixture('small', { idPrefix: 'tiny' });
    expect(f[0].id.startsWith('tiny-')).toBe(true);
  });
});

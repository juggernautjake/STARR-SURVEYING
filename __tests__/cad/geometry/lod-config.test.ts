// __tests__/cad/geometry/lod-config.test.ts
//
// cad-desktop-tauri-and-perf Slice P5 — LOD thresholds now read from
// optional `doc.settings.lod`. The historical default constants are
// preserved so untweaked surveys behave identically; passing a
// `LodConfig` overrides per-knob.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  DEFAULT_LOD_LABEL_THRESHOLD,
  DEFAULT_LOD_PIXEL_THRESHOLD,
  DEFAULT_LOD_SIMPLIFY_MULTIPLIER,
  lodSimplificationThreshold,
  shouldRenderLabels,
  shouldUseLOD,
} from '@/lib/cad/geometry/lod';

describe('default LOD constants — historical values preserved', () => {
  it('pixel threshold is 0.5 world-units-per-pixel', () => {
    expect(DEFAULT_LOD_PIXEL_THRESHOLD).toBe(0.5);
  });

  it('label threshold is higher than the pixel threshold (labels disappear first)', () => {
    expect(DEFAULT_LOD_LABEL_THRESHOLD).toBe(2.0);
    expect(DEFAULT_LOD_LABEL_THRESHOLD).toBeGreaterThan(DEFAULT_LOD_PIXEL_THRESHOLD);
  });

  it('simplify multiplier produces a half-pixel epsilon by default', () => {
    expect(DEFAULT_LOD_SIMPLIFY_MULTIPLIER).toBe(0.5);
  });
});

describe('shouldUseLOD — config-aware threshold', () => {
  it('default behaviour unchanged: scale 0.4 → false, 0.6 → true', () => {
    expect(shouldUseLOD(0.4)).toBe(false);
    expect(shouldUseLOD(0.6)).toBe(true);
  });

  it('a custom pixel threshold widens the no-LOD band', () => {
    expect(shouldUseLOD(0.8, { pixelThreshold: 1.0 })).toBe(false);
    expect(shouldUseLOD(1.2, { pixelThreshold: 1.0 })).toBe(true);
  });

  it('non-finite scale → false regardless of config', () => {
    expect(shouldUseLOD(NaN, { pixelThreshold: 1.0 })).toBe(false);
    expect(shouldUseLOD(-1, { pixelThreshold: 1.0 })).toBe(false);
  });

  it('invalid pixelThreshold falls back to the default 0.5', () => {
    expect(shouldUseLOD(0.6, { pixelThreshold: -1 })).toBe(true);
    expect(shouldUseLOD(0.4, { pixelThreshold: NaN })).toBe(false);
  });
});

describe('shouldRenderLabels — lazy label render gate', () => {
  it('returns true while world-per-pixel ≤ label threshold (default 2.0)', () => {
    expect(shouldRenderLabels(0.5)).toBe(true);
    expect(shouldRenderLabels(2.0)).toBe(true);
  });

  it('returns false once world-per-pixel exceeds the label threshold', () => {
    expect(shouldRenderLabels(2.5)).toBe(false);
  });

  it('a custom label threshold drives the boundary independently of pixelThreshold', () => {
    expect(shouldRenderLabels(0.9, { labelThreshold: 1.0 })).toBe(true);
    expect(shouldRenderLabels(1.1, { labelThreshold: 1.0 })).toBe(false);
  });

  it('non-finite scale returns false (renderer pre-mount path)', () => {
    expect(shouldRenderLabels(NaN)).toBe(false);
    expect(shouldRenderLabels(0)).toBe(false);
  });
});

describe('lodSimplificationThreshold — multiplier configurable', () => {
  it('default multiplier is 0.5 (preserves the half-pixel epsilon)', () => {
    expect(lodSimplificationThreshold(2.0)).toBeCloseTo(1.0);
  });

  it('a custom multiplier scales the epsilon proportionally', () => {
    expect(lodSimplificationThreshold(2.0, { simplifyMultiplier: 1.0 })).toBeCloseTo(2.0);
    expect(lodSimplificationThreshold(2.0, { simplifyMultiplier: 0.25 })).toBeCloseTo(0.5);
  });

  it('a multiplier of 0 returns 0 (disables simplification entirely)', () => {
    expect(lodSimplificationThreshold(5.0, { simplifyMultiplier: 0 })).toBe(0);
  });

  it('non-finite or negative scale returns 0', () => {
    expect(lodSimplificationThreshold(NaN)).toBe(0);
    expect(lodSimplificationThreshold(-1)).toBe(0);
  });
});

describe('DrawingSettings.lod — type extension lands', () => {
  const SRC = fs.readFileSync(
    path.join(__dirname, '..', '..', '..', 'lib', 'cad', 'types.ts'),
    'utf8',
  );

  it('lod field is declared optional with the three numeric knobs', () => {
    expect(SRC).toMatch(/lod\?: \{\s*\n\s*pixelThreshold\?: number;\s*\n\s*labelThreshold\?: number;\s*\n\s*simplifyMultiplier\?: number;/);
  });
});

describe('CanvasViewport — Slice P5 wiring', () => {
  const SRC = fs.readFileSync(
    path.join(__dirname, '..', '..', '..', 'app', 'admin', 'cad', 'components', 'CanvasViewport.tsx'),
    'utf8',
  );

  it('imports shouldRenderLabels from the LOD module', () => {
    expect(SRC).toMatch(/shouldRenderLabels,/);
  });

  it('renderFeatures threads doc.settings.lod into shouldUseLOD + lodSimplificationThreshold', () => {
    expect(SRC).toMatch(/const lodConfig = doc\.settings\.lod;/);
    expect(SRC).toMatch(/shouldUseLOD\(worldPerPixel, lodConfig\)/);
    expect(SRC).toMatch(/lodSimplificationThreshold\(worldPerPixel, lodConfig\)/);
  });

  it('renderLabels bails when shouldRenderLabels is false + tears down the cached Pixi Texts', () => {
    expect(SRC).toMatch(/shouldRenderLabels\(lblWorldPerPixel, docSettings\.lod\)/);
    expect(SRC).toMatch(/for \(const \[, txt\] of pixi\.labelTexts\) \{[\s\S]*?txt\.destroy\(\);[\s\S]*?\}\s*\n\s*pixi\.labelTexts\.clear\(\)/);
  });
});

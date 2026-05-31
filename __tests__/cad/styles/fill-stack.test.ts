// __tests__/cad/styles/fill-stack.test.ts
//
// cad-fill-stacking Slice 6 (sub-slice 6a) — pure helpers for the
// multi-layer infill stack. Locks the migration (legacy single-
// pattern style ⇒ 1-element stack), the resolver (preserves an
// explicit stack), and the mutation helpers (append / remove /
// update — used by the sub-slice 6c UI).

import { describe, it, expect } from 'vitest';
import type { FeatureStyle, FillLayer } from '@/lib/cad/types';
import {
  normalizeFillLayer,
  legacyStyleToFillLayer,
  resolveFillStack,
  resolveVisibleFillLayers,
  appendFillLayer,
  removeFillLayerAt,
  updateFillLayerAt,
} from '@/lib/cad/styles/fill-stack';

const baseStyle = (): FeatureStyle => ({
  color: '#ffffff',
  opacity: 1,
  weight: 1,
  lineStyle: 'SOLID',
  cap: 'ROUND',
  join: 'ROUND',
  visible: true,
  showLabel: false,
  layerId: null,
  groupId: null,
  zOrder: 0,
  lineTypeId: null,
  symbolId: null,
  symbolSize: null,
  symbolRotation: 0,
  labelVisible: null,
  labelFormat: null,
  labelOffset: { x: 0, y: 0 },
  isOverride: false,
} as unknown as FeatureStyle);

describe('normalizeFillLayer — defaults', () => {
  it('fills every required field with a sane default when given undefined', () => {
    const l = normalizeFillLayer(undefined);
    expect(l).toEqual({
      pattern: 'NONE',
      color: null,
      density: 1,
      scale: 1,
      rotation: 0,
      opacity: 1,
      visible: true,
      brickWidth: undefined,
      brickHeight: undefined,
      waveAmplitude: undefined,
      wavePeriod: undefined,
      dashLen: undefined,
      gapLen: undefined,
    });
  });

  it('clamps opacity into [0, 1]', () => {
    expect(normalizeFillLayer({ opacity: -2 }).opacity).toBe(0);
    expect(normalizeFillLayer({ opacity: 5 }).opacity).toBe(1);
  });

  it('coerces non-finite numerics to their defaults', () => {
    const l = normalizeFillLayer({ density: NaN, scale: Infinity, rotation: -Infinity });
    expect(l.density).toBe(1);
    expect(l.scale).toBe(1);
    expect(l.rotation).toBe(0);
  });

  it('preserves visible === false (eye-toggle off)', () => {
    expect(normalizeFillLayer({ visible: false }).visible).toBe(false);
  });
});

describe('legacyStyleToFillLayer — single-pattern projection', () => {
  it('returns null when there is neither a pattern nor a solid fillColor', () => {
    const s = { ...baseStyle(), fillPattern: 'NONE' } as FeatureStyle;
    expect(legacyStyleToFillLayer(s)).toBeNull();
  });

  it('projects a textured pattern into a single FillLayer', () => {
    const s = {
      ...baseStyle(),
      fillPattern: 'BRICK',
      patternColor: '#ff0000',
      patternDensity: 1.5,
      patternScale: 0.5,
      patternRotation: 30,
      fillOpacity: 0.6,
      brickWidth: 40,
      brickHeight: 10,
    } as FeatureStyle;
    expect(legacyStyleToFillLayer(s)).toMatchObject({
      pattern: 'BRICK',
      color: '#ff0000',
      density: 1.5,
      scale: 0.5,
      rotation: 30,
      opacity: 0.6,
      visible: true,
      brickWidth: 40,
      brickHeight: 10,
    });
  });

  it('projects a pure solid fill (fillColor set, no pattern) as SOLID', () => {
    const s = { ...baseStyle(), fillColor: '#00aaff', fillOpacity: 0.25 } as FeatureStyle;
    const layer = legacyStyleToFillLayer(s);
    expect(layer).toMatchObject({ pattern: 'SOLID', color: '#00aaff', opacity: 0.25 });
  });

  it('preserves dashLen/gapLen on a dashed pattern', () => {
    const s = {
      ...baseStyle(),
      fillPattern: 'DASHED_LINES',
      patternDashLen: 12,
      patternGapLen: 3,
    } as FeatureStyle;
    expect(legacyStyleToFillLayer(s)).toMatchObject({
      pattern: 'DASHED_LINES',
      dashLen: 12,
      gapLen: 3,
    });
  });
});

describe('resolveFillStack — back-compat', () => {
  it('returns [] when there is no fill at all (no pattern, no fillColor)', () => {
    expect(resolveFillStack(baseStyle())).toEqual([]);
  });

  it('returns a 1-element stack derived from legacy fields when fillStack is absent', () => {
    const s = { ...baseStyle(), fillPattern: 'DOT_GRAVEL', patternColor: '#000' } as FeatureStyle;
    const stack = resolveFillStack(s);
    expect(stack.length).toBe(1);
    expect(stack[0]).toMatchObject({ pattern: 'DOT_GRAVEL', color: '#000' });
  });

  it('returns the explicit fillStack when it is present (legacy fields ignored)', () => {
    const stack: FillLayer[] = [
      normalizeFillLayer({ pattern: 'BRICK', color: '#aa0000' }),
      normalizeFillLayer({ pattern: 'DOT_UNIFORM', color: '#00aa00', opacity: 0.5 }),
    ];
    const s = {
      ...baseStyle(),
      fillPattern: 'WAVE',
      fillStack: stack,
    } as FeatureStyle;
    const out = resolveFillStack(s);
    expect(out.length).toBe(2);
    expect(out[0].pattern).toBe('BRICK');
    expect(out[1].pattern).toBe('DOT_UNIFORM');
  });

  it('returns a fresh array (mutating the result does not affect the input style)', () => {
    const stack: FillLayer[] = [normalizeFillLayer({ pattern: 'BRICK' })];
    const s = { ...baseStyle(), fillStack: stack } as FeatureStyle;
    const out = resolveFillStack(s);
    out.push(normalizeFillLayer({ pattern: 'WAVE' }));
    expect(s.fillStack!.length).toBe(1);
  });
});

describe('resolveVisibleFillLayers — filters NONE + hidden', () => {
  it('drops layers with visible === false', () => {
    const stack: FillLayer[] = [
      normalizeFillLayer({ pattern: 'BRICK', visible: true }),
      normalizeFillLayer({ pattern: 'WAVE', visible: false }),
    ];
    const s = { ...baseStyle(), fillStack: stack } as FeatureStyle;
    const visible = resolveVisibleFillLayers(s);
    expect(visible.length).toBe(1);
    expect(visible[0].pattern).toBe('BRICK');
  });

  it('drops NONE-pattern placeholder layers', () => {
    const stack: FillLayer[] = [
      normalizeFillLayer({ pattern: 'NONE' }),
      normalizeFillLayer({ pattern: 'LINES' }),
    ];
    const s = { ...baseStyle(), fillStack: stack } as FeatureStyle;
    expect(resolveVisibleFillLayers(s).map((l) => l.pattern)).toEqual(['LINES']);
  });
});

describe('mutation helpers — append / remove / update', () => {
  it('appendFillLayer adds a NONE-placeholder layer to an empty stack', () => {
    const s = baseStyle();
    const next = appendFillLayer(s);
    expect(next.length).toBe(1);
    expect(next[0]).toMatchObject({ pattern: 'NONE', color: '#000000', visible: true });
  });

  it('appendFillLayer respects a partial override', () => {
    const s = baseStyle();
    const next = appendFillLayer(s, { pattern: 'BRICK', color: '#ff0' });
    expect(next[0]).toMatchObject({ pattern: 'BRICK', color: '#ff0' });
  });

  it('removeFillLayerAt drops the indexed layer and ignores out-of-range', () => {
    const stack: FillLayer[] = [
      normalizeFillLayer({ pattern: 'BRICK' }),
      normalizeFillLayer({ pattern: 'WAVE' }),
      normalizeFillLayer({ pattern: 'DOT_UNIFORM' }),
    ];
    const s = { ...baseStyle(), fillStack: stack } as FeatureStyle;
    expect(removeFillLayerAt(s, 1).map((l) => l.pattern)).toEqual(['BRICK', 'DOT_UNIFORM']);
    expect(removeFillLayerAt(s, 99).map((l) => l.pattern)).toEqual(['BRICK', 'WAVE', 'DOT_UNIFORM']);
  });

  it('updateFillLayerAt patches only the indexed layer', () => {
    const stack: FillLayer[] = [
      normalizeFillLayer({ pattern: 'BRICK', color: '#000' }),
      normalizeFillLayer({ pattern: 'WAVE', color: '#000' }),
    ];
    const s = { ...baseStyle(), fillStack: stack } as FeatureStyle;
    const next = updateFillLayerAt(s, 1, { color: '#f00', opacity: 0.3 });
    expect(next[0].color).toBe('#000');
    expect(next[1].color).toBe('#f00');
    expect(next[1].opacity).toBe(0.3);
  });
});

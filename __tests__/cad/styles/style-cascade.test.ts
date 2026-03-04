// __tests__/cad/styles/style-cascade.test.ts — Unit tests for Phase 3 style cascade
import { describe, it, expect } from 'vitest';
import {
  resolveStyle,
  resolveLineColor,
  resolveOpacity,
  canFeatureBeRendered,
  canFeatureBeEdited,
} from '@/lib/cad/styles/style-cascade';
import { DEFAULT_GLOBAL_STYLE_CONFIG } from '@/lib/cad/styles/types';
import type { Feature, Layer } from '@/lib/cad/types';
import type { CodeStyleMapping } from '@/lib/cad/styles/types';

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeLayer(overrides: Partial<Layer> = {}): Layer {
  return {
    id: 'TEST_LAYER', name: 'Test Layer',
    visible: true, locked: false, frozen: false,
    color: '#888888', lineWeight: 0.30, lineTypeId: 'DASHED',
    opacity: 1, groupId: null, sortOrder: 0,
    isDefault: false, isProtected: false, autoAssignCodes: [],
    ...overrides,
  };
}

function makeFeature(styleOverrides: Partial<Feature['style']> = {}): Feature {
  return {
    id: 'f1', type: 'POINT',
    geometry: { type: 'POINT', point: { x: 0, y: 0 } },
    layerId: 'TEST_LAYER',
    properties: {},
    style: {
      color: null, lineWeight: null, opacity: 1,
      lineTypeId: null, symbolId: null, symbolSize: null,
      symbolRotation: 0, labelVisible: null, labelFormat: null,
      labelOffset: { x: 0, y: 0 }, isOverride: false,
      ...styleOverrides,
    },
  };
}

function makeCodeMapping(overrides: Partial<CodeStyleMapping> = {}): CodeStyleMapping {
  return {
    codeAlpha: 'BC02', codeNumeric: '309',
    description: 'Test code', category: 'BOUNDARY_CONTROL',
    symbolId: 'MON_IR_050_FOUND', symbolSize: 2.5, symbolColor: '#000000',
    lineTypeId: 'CENTER', lineWeight: 0.25, lineColor: '#AABBCC',
    labelFormat: '{code}-{name}', labelVisible: true,
    layerId: 'BOUNDARY-MON', isUserModified: false,
    ...overrides,
  };
}

// ── resolveStyle ─────────────────────────────────────────────────────────────

describe('resolveStyle', () => {
  it('uses feature override when set (isOverride=true)', () => {
    const feature = makeFeature({ color: '#FF0000', lineWeight: 1.5, isOverride: true });
    const result = resolveStyle(feature, makeCodeMapping(), makeLayer(), DEFAULT_GLOBAL_STYLE_CONFIG);
    expect(result.color).toBe('#FF0000');
    expect(result.lineWeight).toBe(1.5);
  });

  it('falls back to code mapping color when feature has no override', () => {
    const feature = makeFeature({ color: null });
    const result = resolveStyle(feature, makeCodeMapping({ lineColor: '#AABBCC' }), makeLayer(), DEFAULT_GLOBAL_STYLE_CONFIG);
    expect(result.color).toBe('#AABBCC');
  });

  it('falls back to layer color when no feature override or code mapping color', () => {
    const feature = makeFeature({ color: null });
    const result = resolveStyle(feature, makeCodeMapping({ lineColor: null as unknown as string }), makeLayer({ color: '#112233' }), DEFAULT_GLOBAL_STYLE_CONFIG);
    expect(result.color).toBe('#112233');
  });

  it('falls back to #000000 when all color sources are null', () => {
    const feature = makeFeature({ color: null });
    const codeMap = makeCodeMapping({ lineColor: null as unknown as string });
    const layer = makeLayer({ color: null as unknown as string });
    const result = resolveStyle(feature, codeMap, layer, DEFAULT_GLOBAL_STYLE_CONFIG);
    expect(result.color).toBe('#000000');
  });

  it('uses SOLID lineType as final fallback', () => {
    const feature = makeFeature({ lineTypeId: null });
    const result = resolveStyle(feature, makeCodeMapping({ lineTypeId: null as unknown as string }), makeLayer({ lineTypeId: null as unknown as string }), DEFAULT_GLOBAL_STYLE_CONFIG);
    expect(result.lineTypeId).toBe('SOLID');
  });

  it('cascade priority for lineTypeId: feature > code > layer > SOLID', () => {
    const layer = makeLayer({ lineTypeId: 'DASHED' });
    const code = makeCodeMapping({ lineTypeId: 'CENTER' });

    // Layer should win when feature and code have null
    const f1 = makeFeature({ lineTypeId: null });
    expect(resolveStyle(f1, makeCodeMapping({ lineTypeId: null as unknown as string }), layer, DEFAULT_GLOBAL_STYLE_CONFIG).lineTypeId).toBe('DASHED');

    // Code should win when feature has null
    const f2 = makeFeature({ lineTypeId: null });
    expect(resolveStyle(f2, code, layer, DEFAULT_GLOBAL_STYLE_CONFIG).lineTypeId).toBe('CENTER');

    // Feature should win always
    const f3 = makeFeature({ lineTypeId: 'PHANTOM' });
    expect(resolveStyle(f3, code, layer, DEFAULT_GLOBAL_STYLE_CONFIG).lineTypeId).toBe('PHANTOM');
  });

  it('symbolId falls back to GENERIC_CROSS', () => {
    const result = resolveStyle(makeFeature({ symbolId: null }), makeCodeMapping({ symbolId: null as unknown as string }), makeLayer(), DEFAULT_GLOBAL_STYLE_CONFIG);
    expect(result.symbolId).toBe('GENERIC_CROSS');
  });

  it('uses code mapping symbolSize when feature has no override', () => {
    const result = resolveStyle(makeFeature({ symbolSize: null }), makeCodeMapping({ symbolSize: 3.5 }), makeLayer(), DEFAULT_GLOBAL_STYLE_CONFIG);
    expect(result.symbolSize).toBe(3.5);
  });

  it('opacity defaults to 1 when feature has no explicit value', () => {
    const result = resolveStyle(makeFeature({ opacity: 1 }), makeCodeMapping(), makeLayer(), DEFAULT_GLOBAL_STYLE_CONFIG);
    expect(result.opacity).toBe(1);
  });

  it('opacity of 0 is preserved (not treated as falsy)', () => {
    const result = resolveStyle(makeFeature({ opacity: 0 }), makeCodeMapping(), makeLayer(), DEFAULT_GLOBAL_STYLE_CONFIG);
    expect(result.opacity).toBe(0);
  });

  it('symbolRotation defaults to 0 when not set', () => {
    const result = resolveStyle(makeFeature({ symbolRotation: 0 }), makeCodeMapping(), makeLayer(), DEFAULT_GLOBAL_STYLE_CONFIG);
    expect(result.symbolRotation).toBe(0);
  });

  it('labelVisible inherits from global defaults when null in feature and code', () => {
    const config = { ...DEFAULT_GLOBAL_STYLE_CONFIG, showPointLabels: false };
    const result = resolveStyle(makeFeature({ labelVisible: null }), makeCodeMapping({ labelVisible: null as unknown as boolean }), makeLayer(), config);
    expect(result.labelVisible).toBe(false);
  });

  it('labelFormat falls back to {code}', () => {
    const result = resolveStyle(makeFeature({ labelFormat: null }), makeCodeMapping({ labelFormat: null as unknown as string }), makeLayer(), DEFAULT_GLOBAL_STYLE_CONFIG);
    expect(result.labelFormat).toBe('{code}');
  });

  it('handles null codeMapping gracefully', () => {
    const result = resolveStyle(makeFeature(), null, makeLayer(), DEFAULT_GLOBAL_STYLE_CONFIG);
    expect(result.color).toBeDefined();
    expect(result.lineTypeId).toBeDefined();
  });

  it('returns defensive defaults for null feature or layer', () => {
    // @ts-expect-error testing null guard
    const result = resolveStyle(null, null, null, DEFAULT_GLOBAL_STYLE_CONFIG);
    expect(result.color).toBe('#000000');
    expect(result.lineTypeId).toBe('SOLID');
  });
});

// ── resolveLineColor ──────────────────────────────────────────────────────────

describe('resolveLineColor', () => {
  it('returns feature color when set', () => {
    expect(resolveLineColor(makeFeature({ color: '#FF0000' }), null, makeLayer())).toBe('#FF0000');
  });

  it('returns code color when feature color is null', () => {
    expect(resolveLineColor(makeFeature({ color: null }), makeCodeMapping({ lineColor: '#00FF00' }), makeLayer())).toBe('#00FF00');
  });

  it('returns layer color when both feature and code are null', () => {
    expect(resolveLineColor(makeFeature({ color: null }), null, makeLayer({ color: '#0000FF' }))).toBe('#0000FF');
  });

  it('returns #000000 as last resort', () => {
    expect(resolveLineColor(makeFeature({ color: null }), null, makeLayer({ color: null as unknown as string }))).toBe('#000000');
  });
});

// ── resolveOpacity ────────────────────────────────────────────────────────────

describe('resolveOpacity', () => {
  it('returns the feature opacity when it is a valid number', () => {
    expect(resolveOpacity(makeFeature({ opacity: 0.5 }))).toBe(0.5);
  });

  it('returns 1 when feature opacity is 1', () => {
    expect(resolveOpacity(makeFeature({ opacity: 1 }))).toBe(1);
  });

  it('preserves opacity of 0', () => {
    expect(resolveOpacity(makeFeature({ opacity: 0 }))).toBe(0);
  });

  it('clamps opacity to 0-1 range', () => {
    expect(resolveOpacity(makeFeature({ opacity: 2 }))).toBe(1);
    expect(resolveOpacity(makeFeature({ opacity: -0.5 }))).toBe(0);
  });

  it('returns 1 for NaN/Infinity opacity', () => {
    expect(resolveOpacity(makeFeature({ opacity: NaN }))).toBe(1);
    expect(resolveOpacity(makeFeature({ opacity: Infinity }))).toBe(1);
  });
});

// ── canFeatureBeRendered ──────────────────────────────────────────────────────

describe('canFeatureBeRendered', () => {
  it('returns true for a normal visible, unlocked, unfrozen layer', () => {
    expect(canFeatureBeRendered(makeLayer())).toBe(true);
  });

  it('returns false when layer is not visible', () => {
    expect(canFeatureBeRendered(makeLayer({ visible: false }))).toBe(false);
  });

  it('returns false when layer is frozen (even if visible=true)', () => {
    expect(canFeatureBeRendered(makeLayer({ visible: true, frozen: true }))).toBe(false);
  });

  it('returns true when layer is locked but visible and not frozen', () => {
    // Locked layers are still rendered; you just cannot edit them
    expect(canFeatureBeRendered(makeLayer({ locked: true }))).toBe(true);
  });
});

// ── canFeatureBeEdited ────────────────────────────────────────────────────────

describe('canFeatureBeEdited', () => {
  it('returns true for a normal visible, unlocked, unfrozen layer', () => {
    expect(canFeatureBeEdited(makeLayer())).toBe(true);
  });

  it('returns false when layer is not visible', () => {
    expect(canFeatureBeEdited(makeLayer({ visible: false }))).toBe(false);
  });

  it('returns false when layer is locked', () => {
    expect(canFeatureBeEdited(makeLayer({ locked: true }))).toBe(false);
  });

  it('returns false when layer is frozen', () => {
    expect(canFeatureBeEdited(makeLayer({ frozen: true }))).toBe(false);
  });

  it('returns false when layer is both locked and frozen', () => {
    expect(canFeatureBeEdited(makeLayer({ locked: true, frozen: true }))).toBe(false);
  });
});

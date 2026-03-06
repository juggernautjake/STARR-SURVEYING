// __tests__/cad/labels/generate-labels.test.ts — Unit tests for label generation
import { describe, it, expect } from 'vitest';
import {
  generateLabelsForFeature,
  regenerateLayerLabels,
} from '@/lib/cad/labels';
import {
  DEFAULT_LAYER_DISPLAY_PREFERENCES,
  DEFAULT_TEXT_LABEL_STYLE,
  DEFAULT_DISPLAY_PREFERENCES,
  DEFAULT_FEATURE_STYLE,
} from '@/lib/cad/constants';
import type { Feature, Layer, LayerDisplayPreferences } from '@/lib/cad/types';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeLayer(overrides: Partial<Layer> = {}): Layer {
  return {
    id: 'layer-1',
    name: 'Layer 1',
    visible: true,
    locked: false,
    frozen: false,
    color: '#000000',
    lineWeight: 0.25,
    lineTypeId: 'SOLID',
    opacity: 1,
    groupId: null,
    sortOrder: 0,
    isDefault: false,
    isProtected: false,
    autoAssignCodes: [],
    ...overrides,
  };
}

function makeLineFeature(overrides: Partial<Feature> = {}): Feature {
  return {
    id: 'f1',
    type: 'LINE',
    geometry: {
      type: 'LINE',
      start: { x: 0, y: 0 },
      end: { x: 100, y: 0 },
    },
    layerId: 'layer-1',
    style: { ...DEFAULT_FEATURE_STYLE },
    properties: {},
    ...overrides,
  };
}

function makePointFeature(overrides: Partial<Feature> = {}): Feature {
  return {
    id: 'f2',
    type: 'POINT',
    geometry: { type: 'POINT', point: { x: 50, y: 50 } },
    layerId: 'layer-1',
    style: { ...DEFAULT_FEATURE_STYLE },
    properties: { name: 'PT1', description: 'Test Point', elevation: 100 },
    ...overrides,
  };
}

// ── generateLabelsForFeature ──────────────────────────────────────────────────

describe('generateLabelsForFeature', () => {
  it('returns empty array when all label toggles are off (default)', () => {
    const layer = makeLayer({ displayPreferences: { ...DEFAULT_LAYER_DISPLAY_PREFERENCES } });
    const feature = makeLineFeature();
    const labels = generateLabelsForFeature(feature, layer, DEFAULT_DISPLAY_PREFERENCES);
    expect(labels).toHaveLength(0);
  });

  it('generates bearing label on line when showBearings is true', () => {
    const layer = makeLayer({
      displayPreferences: { ...DEFAULT_LAYER_DISPLAY_PREFERENCES, showBearings: true },
    });
    const feature = makeLineFeature();
    const labels = generateLabelsForFeature(feature, layer, DEFAULT_DISPLAY_PREFERENCES);
    expect(labels.length).toBeGreaterThan(0);
    expect(labels.some((l) => l.kind === 'BEARING')).toBe(true);
  });

  it('generates distance label on line when showDistances is true', () => {
    const layer = makeLayer({
      displayPreferences: { ...DEFAULT_LAYER_DISPLAY_PREFERENCES, showDistances: true },
    });
    const feature = makeLineFeature();
    const labels = generateLabelsForFeature(feature, layer, DEFAULT_DISPLAY_PREFERENCES);
    expect(labels.some((l) => l.kind === 'DISTANCE')).toBe(true);
  });

  it('generates point name label when showPointNames is true', () => {
    const layer = makeLayer({
      displayPreferences: { ...DEFAULT_LAYER_DISPLAY_PREFERENCES, showPointNames: true },
    });
    const feature = makePointFeature();
    const labels = generateLabelsForFeature(feature, layer, DEFAULT_DISPLAY_PREFERENCES);
    expect(labels.some((l) => l.kind === 'POINT_NAME')).toBe(true);
    expect(labels.find((l) => l.kind === 'POINT_NAME')?.text).toBe('PT1');
  });

  it('generates point elevation label when showPointElevations is true', () => {
    const layer = makeLayer({
      displayPreferences: { ...DEFAULT_LAYER_DISPLAY_PREFERENCES, showPointElevations: true },
    });
    const feature = makePointFeature();
    const labels = generateLabelsForFeature(feature, layer, DEFAULT_DISPLAY_PREFERENCES);
    expect(labels.some((l) => l.kind === 'POINT_ELEVATION')).toBe(true);
  });

  // ── Robustness: partial/missing displayPreferences ─────────────────────────

  it('does not crash when layer displayPreferences is undefined', () => {
    const layer = makeLayer({ displayPreferences: undefined });
    const feature = makeLineFeature();
    expect(() => generateLabelsForFeature(feature, layer, DEFAULT_DISPLAY_PREFERENCES)).not.toThrow();
  });

  it('does not crash when layer displayPreferences is missing pointLabelOffset', () => {
    // Simulate partially-saved preferences (e.g., from older data without pointLabelOffset)
    const partialPrefs = { showBearings: true } as LayerDisplayPreferences;
    const layer = makeLayer({ displayPreferences: partialPrefs });
    const feature = makePointFeature();
    // This used to crash: "Cannot read properties of undefined (reading 'x')"
    expect(() => generateLabelsForFeature(feature, layer, DEFAULT_DISPLAY_PREFERENCES)).not.toThrow();
  });

  it('preserves user-positioned labels during regeneration', () => {
    const layer = makeLayer({
      displayPreferences: { ...DEFAULT_LAYER_DISPLAY_PREFERENCES, showBearings: true },
    });
    const feature = makeLineFeature({
      textLabels: [{
        id: 'lbl-1',
        featureId: 'f1',
        kind: 'BEARING',
        text: 'N 90°00\'00" E',
        offset: { x: 10, y: 20 },   // custom user offset
        rotation: 0,
        style: { ...DEFAULT_TEXT_LABEL_STYLE },
        visible: true,
        scale: 1,
        userPositioned: true,
      }],
    });
    const labels = generateLabelsForFeature(feature, layer, DEFAULT_DISPLAY_PREFERENCES);
    const bearingLabel = labels.find((l) => l.kind === 'BEARING');
    expect(bearingLabel).toBeDefined();
    // User's offset should be preserved
    expect(bearingLabel?.offset.x).toBe(10);
    expect(bearingLabel?.offset.y).toBe(20);
    expect(bearingLabel?.userPositioned).toBe(true);
  });
});

// ── regenerateLayerLabels ─────────────────────────────────────────────────────

describe('regenerateLayerLabels', () => {
  it('returns a map of featureId → labels for features on the layer', () => {
    const layer = makeLayer({
      displayPreferences: { ...DEFAULT_LAYER_DISPLAY_PREFERENCES, showBearings: true },
    });
    const features: Feature[] = [
      makeLineFeature({ id: 'f1' }),
      makeLineFeature({ id: 'f2', layerId: 'other-layer' }), // different layer
    ];
    const result = regenerateLayerLabels(features, layer, DEFAULT_DISPLAY_PREFERENCES);
    expect(result.has('f1')).toBe(true);
    expect(result.has('f2')).toBe(false);    // different layer → not included
  });

  it('generates bearing + distance labels for lines when both flags set', () => {
    const layer = makeLayer({
      displayPreferences: { ...DEFAULT_LAYER_DISPLAY_PREFERENCES, showBearings: true, showDistances: true },
    });
    const features: Feature[] = [makeLineFeature({ id: 'f1' })];
    const result = regenerateLayerLabels(features, layer, DEFAULT_DISPLAY_PREFERENCES);
    const labels = result.get('f1') ?? [];
    expect(labels.some((l) => l.kind === 'BEARING')).toBe(true);
    expect(labels.some((l) => l.kind === 'DISTANCE')).toBe(true);
  });
});

// __tests__/cad/validate.test.ts — Unit tests for .starr file validation and migration
import { describe, it, expect } from 'vitest';
import { validateAndMigrateDocument } from '@/lib/cad/validate';
import { PHASE3_DEFAULT_LAYERS } from '@/lib/cad/styles/default-layers';

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeMinimalRaw(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'test-doc-id',
    name: 'Test Drawing',
    created: '2026-01-01T00:00:00.000Z',
    modified: '2026-01-01T00:00:00.000Z',
    author: 'Tester',
    features: {},
    layers: { 'layer-1': { id: 'layer-1', name: 'Layer 1', visible: true, locked: false } },
    layerOrder: ['layer-1'],
    settings: {},
    ...overrides,
  };
}

// ── assertShape failures ──────────────────────────────────────────────────────

describe('validateAndMigrateDocument — structural errors', () => {
  it('throws for null input', () => {
    expect(() => validateAndMigrateDocument(null)).toThrow();
  });

  it('throws for non-object input', () => {
    expect(() => validateAndMigrateDocument('not an object')).toThrow();
    expect(() => validateAndMigrateDocument(42)).toThrow();
  });

  it('throws for array input', () => {
    expect(() => validateAndMigrateDocument([])).toThrow();
  });

  it('throws when id is missing', () => {
    expect(() => validateAndMigrateDocument({ features: {}, layers: {}, layerOrder: [] })).toThrow(/id/i);
  });

  it('throws when features is not an object', () => {
    expect(() => validateAndMigrateDocument({ id: 'x', features: [], layers: {}, layerOrder: [] })).toThrow(/features/i);
  });

  it('throws when layers is not an object', () => {
    expect(() => validateAndMigrateDocument({ id: 'x', features: {}, layers: [], layerOrder: [] })).toThrow(/layers/i);
  });

  it('throws when layerOrder is not an array', () => {
    expect(() => validateAndMigrateDocument({ id: 'x', features: {}, layers: {}, layerOrder: 'bad' })).toThrow(/layerOrder/i);
  });
});

// ── Successful migration ──────────────────────────────────────────────────────

describe('validateAndMigrateDocument — happy path', () => {
  it('returns a valid DrawingDocument from minimal input', () => {
    const result = validateAndMigrateDocument(makeMinimalRaw());
    expect(result.id).toBe('test-doc-id');
    expect(result.name).toBe('Test Drawing');
    expect(result.features).toEqual({});
  });

  it('back-fills missing settings with defaults', () => {
    const result = validateAndMigrateDocument(makeMinimalRaw({ settings: {} }));
    expect(result.settings).toBeDefined();
    expect(result.settings.units).toBe('FEET');
    expect(typeof result.settings.gridVisible).toBe('boolean');
  });

  it('back-fills globalStyleConfig with defaults', () => {
    const result = validateAndMigrateDocument(makeMinimalRaw());
    expect(result.globalStyleConfig).toBeDefined();
    expect(result.globalStyleConfig.codeDisplayMode).toBeDefined();
    expect(result.globalStyleConfig.backgroundColor).toBeDefined();
  });

  it('initialises empty customSymbols and customLineTypes arrays', () => {
    const result = validateAndMigrateDocument(makeMinimalRaw());
    expect(Array.isArray(result.customSymbols)).toBe(true);
    expect(Array.isArray(result.customLineTypes)).toBe(true);
  });

  it('preserves existing customSymbols', () => {
    const raw = makeMinimalRaw({ customSymbols: [{ id: 'CUSTOM_1' }] });
    const result = validateAndMigrateDocument(raw);
    expect(result.customSymbols).toHaveLength(1);
    expect(result.customSymbols[0].id).toBe('CUSTOM_1');
  });
});

// ── Layer order filtering ─────────────────────────────────────────────────────

describe('validateAndMigrateDocument — layer order filtering', () => {
  it('removes layerOrder entries that reference non-existent layers', () => {
    const raw = makeMinimalRaw({
      layerOrder: ['layer-1', 'MISSING_LAYER'],
    });
    const result = validateAndMigrateDocument(raw);
    expect(result.layerOrder).not.toContain('MISSING_LAYER');
  });

  it('creates a default layer when all provided layers are invalid', () => {
    const raw = makeMinimalRaw({
      layers: {},
      layerOrder: [],
    });
    const result = validateAndMigrateDocument(raw);
    expect(result.layerOrder.length).toBeGreaterThan(0);
  });
});

// ── Feature migration ─────────────────────────────────────────────────────────

describe('validateAndMigrateDocument — feature migration', () => {
  it('reassigns features on non-existent layers to first valid layer', () => {
    const raw = makeMinimalRaw({
      features: {
        'f1': { id: 'f1', type: 'POINT', layerId: 'GONE_LAYER', geometry: { type: 'POINT', point: { x: 0, y: 0 } }, style: {}, properties: {} },
      },
    });
    const result = validateAndMigrateDocument(raw);
    // f1 should be reassigned to layer-1 (first layer in order)
    expect(result.features['f1'].layerId).toBe('layer-1');
  });

  it('removes malformed features (non-objects)', () => {
    const raw = makeMinimalRaw({
      features: {
        'f1': 'not_a_feature',
        'f2': { id: 'f2', type: 'POINT', layerId: 'layer-1', geometry: { type: 'POINT' }, style: {}, properties: {} },
      },
    });
    const result = validateAndMigrateDocument(raw);
    expect(result.features['f1']).toBeUndefined();
    expect(result.features['f2']).toBeDefined();
  });

  it('back-fills Phase 3 style fields for pre-Phase-3 features', () => {
    const raw = makeMinimalRaw({
      features: {
        'f1': {
          id: 'f1', type: 'POINT',
          layerId: 'layer-1',
          geometry: { type: 'POINT', point: { x: 0, y: 0 } },
          // Old-style style (no Phase 3 fields)
          style: { color: '#FF0000', lineWeight: 1, opacity: 1 },
          properties: {},
        },
      },
    });
    const result = validateAndMigrateDocument(raw);
    const style = result.features['f1'].style as unknown as Record<string, unknown>;
    expect(style.lineTypeId).toBe(null);
    expect(style.symbolId).toBe(null);
    expect(style.symbolSize).toBe(null);
    expect(style.symbolRotation).toBe(0);
    expect(style.labelVisible).toBe(null);
    expect(style.labelFormat).toBe(null);
    expect(style.isOverride).toBe(false);
  });

  it('adds empty properties object when missing', () => {
    const raw = makeMinimalRaw({
      features: {
        'f1': { id: 'f1', type: 'POINT', layerId: 'layer-1', geometry: { type: 'POINT' }, style: {} },
      },
    });
    const result = validateAndMigrateDocument(raw);
    expect(result.features['f1'].properties).toBeDefined();
  });
});

// ── Layer migration ───────────────────────────────────────────────────────────

describe('validateAndMigrateDocument — layer migration', () => {
  it('back-fills frozen field for pre-Phase-3 layers', () => {
    const raw = makeMinimalRaw({
      layers: { 'layer-1': { id: 'layer-1', name: 'Layer 1', visible: true, locked: false } },
    });
    const result = validateAndMigrateDocument(raw);
    expect((result.layers['layer-1'] as unknown as Record<string, unknown>).frozen).toBe(false);
  });

  it('back-fills lineTypeId for pre-Phase-3 layers', () => {
    const raw = makeMinimalRaw();
    const result = validateAndMigrateDocument(raw);
    expect((result.layers['layer-1'] as unknown as Record<string, unknown>).lineTypeId).toBe('SOLID');
  });

  it('does NOT inject default layers — loads exactly the saved layer set', () => {
    // A survey must reopen with only the layers it was saved with.
    // Injecting the standard layers resurrected ones the user removed.
    const raw = makeMinimalRaw();
    const result = validateAndMigrateDocument(raw);
    expect(Object.keys(result.layers)).toEqual(['layer-1']);
    expect(result.layerOrder).toEqual(['layer-1']);
    // None of the standard layers should have been added.
    const injected = PHASE3_DEFAULT_LAYERS.filter((l) => result.layers[l.id]);
    expect(injected).toHaveLength(0);
  });
});

// ── Layer groups ──────────────────────────────────────────────────────────────

describe('validateAndMigrateDocument — layer groups', () => {
  it('creates default layer groups when absent', () => {
    const raw = makeMinimalRaw();
    const result = validateAndMigrateDocument(raw);
    expect(Object.keys(result.layerGroups).length).toBeGreaterThanOrEqual(6);
  });

  it('preserves existing layer groups', () => {
    const raw = makeMinimalRaw({
      layerGroups: { 'grp-custom': { id: 'grp-custom', name: 'Custom Group', collapsed: false, sortOrder: 99 } },
      layerGroupOrder: ['grp-custom'],
    });
    const result = validateAndMigrateDocument(raw);
    expect(result.layerGroups['grp-custom']).toBeDefined();
  });
});

// ── globalStyleConfig overlay ─────────────────────────────────────────────────

describe('validateAndMigrateDocument — globalStyleConfig', () => {
  it('preserves partial globalStyleConfig overriding only set keys', () => {
    const raw = makeMinimalRaw({ globalStyleConfig: { backgroundColor: '#111111' } });
    const result = validateAndMigrateDocument(raw);
    expect(result.globalStyleConfig.backgroundColor).toBe('#111111');
    // Other keys should have defaults
    expect(result.globalStyleConfig.codeDisplayMode).toBeDefined();
  });
});

// ── Full save → load round-trip (lossless) ─────────────────────────────────────

describe('validateAndMigrateDocument — full round-trip', () => {
  it('preserves features (point/line/image), labels, layers, groups, and images', () => {
    const raw = makeMinimalRaw({
      layers: {
        'SURVEY-POINTS': { id: 'SURVEY-POINTS', name: 'Survey Points', visible: true, locked: false, frozen: false, color: '#000', lineWeight: 0.5, lineTypeId: 'SOLID', opacity: 1, groupId: null, sortOrder: 0, isProtected: false, autoAssignCodes: [] },
      },
      layerOrder: ['SURVEY-POINTS'],
      features: {
        p1: {
          id: 'p1', type: 'POINT', layerId: 'SURVEY-POINTS',
          geometry: { type: 'POINT', point: { x: 5000, y: 5001 } },
          style: { color: null, lineWeight: null, opacity: 1, lineTypeId: null, symbolId: null, symbolSize: null, symbolRotation: 0, labelVisible: null, labelFormat: null, labelOffset: { x: 0, y: 0 }, isOverride: false },
          properties: { pointName: '20fnd', code: '315' },
          textLabels: [{ id: 'lbl1', text: '20fnd', x: 5000, y: 5001, visible: true }],
        },
        l1: {
          id: 'l1', type: 'LINE', layerId: 'SURVEY-POINTS',
          geometry: { type: 'LINE', start: { x: 0, y: 0 }, end: { x: 10, y: 10 } },
          style: { color: '#f00', lineWeight: 0.5, opacity: 1, lineTypeId: 'SOLID', symbolId: null, symbolSize: null, symbolRotation: 0, labelVisible: null, labelFormat: null, labelOffset: { x: 0, y: 0 }, isOverride: false },
          properties: {},
        },
        img1: {
          id: 'img1', type: 'IMAGE', layerId: 'SURVEY-POINTS',
          geometry: { type: 'IMAGE', image: { imageId: 'proj-1', position: { x: 100, y: 200 }, width: 300, height: 150, rotation: 0.5, mirrorX: false, mirrorY: true } },
          style: { color: null, lineWeight: null, opacity: 0.6, lineTypeId: null, symbolId: null, symbolSize: null, symbolRotation: 0, labelVisible: null, labelFormat: null, labelOffset: { x: 0, y: 0 }, isOverride: false },
          properties: { imageName: 'aerial.png' },
        },
      },
      featureGroups: { g1: { id: 'g1', name: 'Curb A', layerId: 'SURVEY-POINTS', featureIds: ['l1'] } },
      projectImages: { 'proj-1': { id: 'proj-1', name: 'aerial.png', dataUrl: 'data:image/png;base64,AAAA', originalWidth: 600, originalHeight: 300, addedAt: '2026-01-01T00:00:00.000Z' } },
    });

    const result = validateAndMigrateDocument(raw);

    // Layers: exactly what was saved, nothing injected.
    expect(Object.keys(result.layers)).toEqual(['SURVEY-POINTS']);
    // Features all survive with geometry + properties + labels intact.
    expect(Object.keys(result.features).sort()).toEqual(['img1', 'l1', 'p1']);
    expect((result.features.p1.geometry as { point: { x: number } }).point.x).toBe(5000);
    expect(result.features.p1.properties.pointName).toBe('20fnd');
    expect(result.features.p1.textLabels?.[0].text).toBe('20fnd');
    expect((result.features.l1.geometry as { end: { y: number } }).end.y).toBe(10);
    // Image geometry + opacity preserved.
    const imgGeom = result.features.img1.geometry as { image: { width: number; rotation: number; mirrorY: boolean } };
    expect(imgGeom.image.width).toBe(300);
    expect(imgGeom.image.rotation).toBe(0.5);
    expect(imgGeom.image.mirrorY).toBe(true);
    expect(result.features.img1.style.opacity).toBe(0.6);
    // Project image bitmap library preserved.
    expect(result.projectImages['proj-1'].dataUrl).toBe('data:image/png;base64,AAAA');
    expect(result.projectImages['proj-1'].originalWidth).toBe(600);
    // Feature groups preserved.
    expect(result.featureGroups.g1.featureIds).toEqual(['l1']);
  });
});

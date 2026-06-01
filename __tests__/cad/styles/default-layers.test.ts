// __tests__/cad/styles/default-layers.test.ts — minimal default layers
//
// cad-hub-greeting-and-field-data-trv-route Slice 3 — slimmed
// from 23 default layers across 6 groups down to 4 default
// layers across 2 groups (Survey Info + Drawing) per user ask.
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_LAYER_GROUPS,
  PHASE3_DEFAULT_LAYERS,
  getDefaultLayersRecord,
  getDefaultLayerOrder,
} from '@/lib/cad/styles/default-layers';

describe('default-layers (slimmed)', () => {
  // ── Layer groups ──────────────────────────────────────────
  it('has exactly 2 default layer groups (Survey Info + Drawing)', () => {
    expect(DEFAULT_LAYER_GROUPS).toHaveLength(2);
    expect(DEFAULT_LAYER_GROUPS.map((g) => g.id)).toEqual(['grp-survey-info', 'grp-drawing']);
  });

  it('every group has required fields + sortOrder uniqueness', () => {
    const orders = new Set<number>();
    for (const group of DEFAULT_LAYER_GROUPS) {
      expect(group.id).toBeTruthy();
      expect(group.name).toBeTruthy();
      expect(typeof group.collapsed).toBe('boolean');
      expect(typeof group.sortOrder).toBe('number');
      expect(orders.has(group.sortOrder)).toBe(false);
      orders.add(group.sortOrder);
    }
  });

  // ── Default layers ────────────────────────────────────────
  it('has exactly 4 default layers', () => {
    expect(PHASE3_DEFAULT_LAYERS).toHaveLength(4);
    expect(PHASE3_DEFAULT_LAYERS.map((l) => l.id).sort()).toEqual(
      ['ANNOTATION', 'DEFAULT', 'SURVEY-INFO', 'TITLE-BLOCK'],
    );
  });

  it('the starter drawing layer (id DEFAULT) displays as "Layer 1"', () => {
    // cad-survey-info-hide Slice 1 — renamed from "Default" so a
    // fresh drawing's empty starter layer reads naturally.
    const starter = PHASE3_DEFAULT_LAYERS.find((l) => l.id === 'DEFAULT');
    expect(starter?.name).toBe('Layer 1');
  });

  it('every layer has required fields + valid shape', () => {
    for (const layer of PHASE3_DEFAULT_LAYERS) {
      expect(layer.id).toBeTruthy();
      expect(layer.name).toBeTruthy();
      expect(typeof layer.visible).toBe('boolean');
      expect(typeof layer.locked).toBe('boolean');
      expect(typeof layer.frozen).toBe('boolean');
      expect(layer.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(layer.lineWeight).toBeGreaterThan(0);
      expect(layer.lineTypeId).toBeTruthy();
      expect(layer.opacity).toBeGreaterThan(0);
      expect(layer.isDefault).toBe(true);
      expect(layer.visible).toBe(true);
      expect(layer.locked).toBe(false);
      expect(layer.frozen).toBe(false);
    }
  });

  it('SURVEY-INFO is protected (so the paper furniture can\'t be accidentally deleted)', () => {
    const surveyInfo = PHASE3_DEFAULT_LAYERS.find((l) => l.id === 'SURVEY-INFO');
    expect(surveyInfo?.isProtected).toBe(true);
  });

  it('every groupId references a valid group', () => {
    const groupIds = new Set(DEFAULT_LAYER_GROUPS.map((g) => g.id));
    for (const layer of PHASE3_DEFAULT_LAYERS) {
      if (layer.groupId !== null) {
        expect(groupIds.has(layer.groupId)).toBe(true);
      }
    }
  });

  it('lineTypeIds reference valid built-in types', () => {
    const validLineTypes = new Set(['SOLID', 'DASHED', 'DASHED_HEAVY', 'DOTTED', 'DASH_DOT', 'DASH_DOT_DOT', 'CENTER', 'PHANTOM']);
    for (const layer of PHASE3_DEFAULT_LAYERS) {
      expect(validLineTypes.has(layer.lineTypeId)).toBe(true);
    }
  });

  it('getDefaultLayersRecord returns exactly 4 entries keyed by id', () => {
    const record = getDefaultLayersRecord();
    expect(Object.keys(record)).toHaveLength(4);
    for (const layer of PHASE3_DEFAULT_LAYERS) {
      expect(record[layer.id]?.id).toBe(layer.id);
    }
  });

  it('getDefaultLayerOrder returns 4 ids in source order', () => {
    expect(getDefaultLayerOrder()).toEqual(['SURVEY-INFO', 'TITLE-BLOCK', 'ANNOTATION', 'DEFAULT']);
  });
});

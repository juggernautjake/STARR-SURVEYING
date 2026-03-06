// __tests__/cad/styles/default-layers.test.ts — Unit tests for default layer definitions
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_LAYER_GROUPS,
  PHASE3_DEFAULT_LAYERS,
  getDefaultLayersRecord,
  getDefaultLayerOrder,
} from '@/lib/cad/styles/default-layers';

describe('default-layers', () => {
  // ── Layer groups ────────────────────────────────────────────────────────

  it('has exactly 6 default layer groups', () => {
    expect(DEFAULT_LAYER_GROUPS).toHaveLength(6);
  });

  it('every group has required fields', () => {
    for (const group of DEFAULT_LAYER_GROUPS) {
      expect(group.id,           `${group.id}.id`).toBeTruthy();
      expect(group.name,         `${group.id}.name`).toBeTruthy();
      expect(typeof group.collapsed, `${group.id}.collapsed`).toBe('boolean');
      expect(typeof group.sortOrder, `${group.id}.sortOrder`).toBe('number');
    }
  });

  it('group IDs are unique', () => {
    const ids = DEFAULT_LAYER_GROUPS.map(g => g.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('sortOrder values are unique within groups', () => {
    const orders = DEFAULT_LAYER_GROUPS.map(g => g.sortOrder);
    expect(new Set(orders).size).toBe(orders.length);
  });

  // ── Default layers ──────────────────────────────────────────────────────

  it('has exactly 23 default layers', () => {
    expect(PHASE3_DEFAULT_LAYERS).toHaveLength(23);
  });

  it('every layer has required fields', () => {
    for (const layer of PHASE3_DEFAULT_LAYERS) {
      expect(layer.id,           `${layer.id}.id`).toBeTruthy();
      expect(layer.name,         `${layer.id}.name`).toBeTruthy();
      expect(typeof layer.visible,     `${layer.id}.visible`).toBe('boolean');
      expect(typeof layer.locked,      `${layer.id}.locked`).toBe('boolean');
      expect(typeof layer.frozen,      `${layer.id}.frozen`).toBe('boolean');
      expect(layer.color,        `${layer.id}.color`).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(layer.lineWeight,   `${layer.id}.lineWeight`).toBeGreaterThan(0);
      expect(layer.lineTypeId,   `${layer.id}.lineTypeId`).toBeTruthy();
      expect(typeof layer.opacity,     `${layer.id}.opacity`).toBe('number');
      expect(layer.opacity,      `${layer.id}.opacity`).toBeGreaterThan(0);
      expect(typeof layer.sortOrder,   `${layer.id}.sortOrder`).toBe('number');
      expect(typeof layer.isDefault,   `${layer.id}.isDefault`).toBe('boolean');
      expect(typeof layer.isProtected, `${layer.id}.isProtected`).toBe('boolean');
      expect(Array.isArray(layer.autoAssignCodes), `${layer.id}.autoAssignCodes`).toBe(true);
    }
  });

  it('all default layers have isDefault=true', () => {
    for (const layer of PHASE3_DEFAULT_LAYERS) {
      expect(layer.isDefault, `${layer.id}.isDefault`).toBe(true);
    }
  });

  it('all default layers start visible, unlocked, and not frozen', () => {
    for (const layer of PHASE3_DEFAULT_LAYERS) {
      expect(layer.visible, `${layer.id} visible`).toBe(true);
      expect(layer.locked,  `${layer.id} locked`).toBe(false);
      expect(layer.frozen,  `${layer.id} frozen`).toBe(false);
    }
  });

  it('layer IDs are unique', () => {
    const ids = PHASE3_DEFAULT_LAYERS.map(l => l.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('all groupIds reference a valid group', () => {
    const groupIds = new Set(DEFAULT_LAYER_GROUPS.map(g => g.id));
    for (const layer of PHASE3_DEFAULT_LAYERS) {
      if (layer.groupId !== null) {
        expect(groupIds.has(layer.groupId), `${layer.id}.groupId=${layer.groupId}`).toBe(true);
      }
    }
  });

  it('no two layers in the same group share the same sortOrder', () => {
    const groupOrders = new Map<string, Set<number>>();
    for (const layer of PHASE3_DEFAULT_LAYERS) {
      const gid = layer.groupId ?? '__top';
      if (!groupOrders.has(gid)) groupOrders.set(gid, new Set());
      const set = groupOrders.get(gid)!;
      expect(set.has(layer.sortOrder), `duplicate sortOrder ${layer.sortOrder} in group ${gid}`).toBe(false);
      set.add(layer.sortOrder);
    }
  });

  it('lineTypeIds reference valid built-in types', () => {
    const validLineTypes = new Set(['SOLID', 'DASHED', 'DASHED_HEAVY', 'DOTTED', 'DASH_DOT', 'DASH_DOT_DOT', 'CENTER', 'PHANTOM']);
    for (const layer of PHASE3_DEFAULT_LAYERS) {
      expect(validLineTypes.has(layer.lineTypeId), `${layer.id}.lineTypeId=${layer.lineTypeId}`).toBe(true);
    }
  });

  // Required layers by name
  it('includes a BOUNDARY layer', () => {
    expect(PHASE3_DEFAULT_LAYERS.some(l => l.id === 'BOUNDARY')).toBe(true);
  });

  it('includes a CONTROL (Survey Control) layer', () => {
    expect(PHASE3_DEFAULT_LAYERS.some(l => l.id === 'CONTROL')).toBe(true);
  });

  it('includes a FENCE layer', () => {
    expect(PHASE3_DEFAULT_LAYERS.some(l => l.id === 'FENCE')).toBe(true);
  });

  it('includes a MISC layer (fallback for unrecognised codes)', () => {
    expect(PHASE3_DEFAULT_LAYERS.some(l => l.id === 'MISC')).toBe(true);
  });

  // ── getDefaultLayersRecord ──────────────────────────────────────────────

  it('getDefaultLayersRecord returns a record keyed by layer ID', () => {
    const record = getDefaultLayersRecord();
    for (const layer of PHASE3_DEFAULT_LAYERS) {
      expect(record[layer.id], `record[${layer.id}]`).toBeDefined();
      expect(record[layer.id].id).toBe(layer.id);
    }
  });

  it('getDefaultLayersRecord returns exactly 23 entries', () => {
    expect(Object.keys(getDefaultLayersRecord())).toHaveLength(23);
  });

  // ── getDefaultLayerOrder ────────────────────────────────────────────────

  it('getDefaultLayerOrder returns an array of 23 IDs', () => {
    const order = getDefaultLayerOrder();
    expect(order).toHaveLength(23);
  });

  it('getDefaultLayerOrder contains every layer ID', () => {
    const order = new Set(getDefaultLayerOrder());
    for (const layer of PHASE3_DEFAULT_LAYERS) {
      expect(order.has(layer.id), `${layer.id} in layerOrder`).toBe(true);
    }
  });
});

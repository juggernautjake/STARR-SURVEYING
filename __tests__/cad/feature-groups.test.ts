// __tests__/cad/feature-groups.test.ts
// Tests for the FeatureGroup type and drawing-store group operations.

import { describe, it, expect, beforeEach } from 'vitest';
import { useDrawingStore } from '@/lib/cad/store/drawing-store';
import { generateId } from '@/lib/cad/types';
import type { Feature, Layer } from '@/lib/cad/types';

// ── Helper factories ────────────────────────────────────────────────────────

function makeLayer(id: string, name: string): Layer {
  return {
    id,
    name,
    visible: true,
    locked: false,
    frozen: false,
    color: '#000000',
    lineWeight: 0.75,
    lineTypeId: 'SOLID',
    opacity: 1,
    groupId: null,
    sortOrder: 0,
    isDefault: false,
    isProtected: false,
    autoAssignCodes: [],
  };
}

function makeFeature(id: string, layerId: string): Feature {
  return {
    id,
    type: 'LINE',
    geometry: {
      type: 'LINE',
      start: { x: 0, y: 0 },
      end: { x: 10, y: 10 },
    },
    layerId,
    style: {
      color: '#000000',
      lineWeight: 1,
      opacity: 1,
      lineTypeId: null,
      symbolId: null,
      symbolSize: null,
      symbolRotation: 0,
      labelVisible: null,
      labelFormat: null,
      labelOffset: { x: 0, y: 0 },
      isOverride: false,
    },
    properties: {},
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('FeatureGroup — drawing store', () => {
  beforeEach(() => {
    // Reset store to a clean state before each test
    useDrawingStore.getState().newDocument();
    const layerId = generateId();
    useDrawingStore.getState().addLayer(makeLayer(layerId, 'Test Layer'));
    useDrawingStore.getState().setActiveLayer(layerId);
  });

  it('creates a default featureGroups record on a new document', () => {
    const { document: doc } = useDrawingStore.getState();
    expect(doc.featureGroups).toBeDefined();
    expect(typeof doc.featureGroups).toBe('object');
    expect(Object.keys(doc.featureGroups)).toHaveLength(0);
  });

  it('groupFeatures returns null when fewer than 2 IDs provided', () => {
    const layerId = useDrawingStore.getState().activeLayerId;
    const f1 = makeFeature(generateId(), layerId);
    useDrawingStore.getState().addFeature(f1);

    const result = useDrawingStore.getState().groupFeatures([f1.id]);
    expect(result).toBeNull();
  });

  it('groupFeatures returns null when features span different layers', () => {
    const store = useDrawingStore.getState();
    const layerId1 = store.activeLayerId;
    const layerId2 = generateId();
    store.addLayer(makeLayer(layerId2, 'Other Layer'));

    const f1 = makeFeature(generateId(), layerId1);
    const f2 = makeFeature(generateId(), layerId2);
    store.addFeature(f1);
    store.addFeature(f2);

    const result = store.groupFeatures([f1.id, f2.id]);
    expect(result).toBeNull();
  });

  it('groupFeatures groups features on the same layer', () => {
    const store = useDrawingStore.getState();
    const layerId = store.activeLayerId;
    const f1 = makeFeature(generateId(), layerId);
    const f2 = makeFeature(generateId(), layerId);
    store.addFeature(f1);
    store.addFeature(f2);

    const group = store.groupFeatures([f1.id, f2.id], 'My Group');
    expect(group).not.toBeNull();
    expect(group!.name).toBe('My Group');
    expect(group!.layerId).toBe(layerId);
    expect(group!.featureIds).toContain(f1.id);
    expect(group!.featureIds).toContain(f2.id);
  });

  it('groupFeatures sets featureGroupId on each member', () => {
    const store = useDrawingStore.getState();
    const layerId = store.activeLayerId;
    const f1 = makeFeature(generateId(), layerId);
    const f2 = makeFeature(generateId(), layerId);
    store.addFeature(f1);
    store.addFeature(f2);

    const group = store.groupFeatures([f1.id, f2.id])!;
    const updatedF1 = store.getFeature(f1.id);
    const updatedF2 = store.getFeature(f2.id);
    expect(updatedF1?.featureGroupId).toBe(group.id);
    expect(updatedF2?.featureGroupId).toBe(group.id);
  });

  it('groupFeatures returns null when any feature is already in a group', () => {
    const store = useDrawingStore.getState();
    const layerId = store.activeLayerId;
    const f1 = makeFeature(generateId(), layerId);
    const f2 = makeFeature(generateId(), layerId);
    const f3 = makeFeature(generateId(), layerId);
    store.addFeature(f1);
    store.addFeature(f2);
    store.addFeature(f3);

    // f1 and f2 are in a group
    store.groupFeatures([f1.id, f2.id], 'Existing Group');

    // Trying to group f1 (already grouped) with f3 should fail
    const result = store.groupFeatures([f1.id, f3.id], 'New Group');
    expect(result).toBeNull();

    // The original group should still exist and f3 should not be in any group
    const { document: doc } = useDrawingStore.getState();
    expect(doc.features[f3.id]?.featureGroupId).toBeFalsy();
    const groups = Object.values(doc.featureGroups);
    expect(groups).toHaveLength(1);
    expect(groups[0].name).toBe('Existing Group');
  });

  it('groupFeatures returns null when ALL features are already grouped', () => {
    const store = useDrawingStore.getState();
    const layerId = store.activeLayerId;
    const f1 = makeFeature(generateId(), layerId);
    const f2 = makeFeature(generateId(), layerId);
    const f3 = makeFeature(generateId(), layerId);
    const f4 = makeFeature(generateId(), layerId);
    store.addFeature(f1);
    store.addFeature(f2);
    store.addFeature(f3);
    store.addFeature(f4);

    store.groupFeatures([f1.id, f2.id], 'Group A');
    store.groupFeatures([f3.id, f4.id], 'Group B');

    // Attempting to cross-group members from A and B should fail
    const result = store.groupFeatures([f1.id, f3.id], 'Cross Group');
    expect(result).toBeNull();

    // Original groups unchanged
    const { document: doc } = useDrawingStore.getState();
    expect(Object.values(doc.featureGroups)).toHaveLength(2);
  });

  it('ungroupFeatures removes groupId from members and deletes the group', () => {
    const store = useDrawingStore.getState();
    const layerId = store.activeLayerId;
    const f1 = makeFeature(generateId(), layerId);
    const f2 = makeFeature(generateId(), layerId);
    store.addFeature(f1);
    store.addFeature(f2);

    const group = store.groupFeatures([f1.id, f2.id])!;
    store.ungroupFeatures(group.id);

    const { document: doc } = useDrawingStore.getState();
    expect(doc.featureGroups[group.id]).toBeUndefined();
    expect(doc.features[f1.id]?.featureGroupId).toBeFalsy();
    expect(doc.features[f2.id]?.featureGroupId).toBeFalsy();
  });

  it('removeFeatureFromGroup removes one feature and leaves the rest grouped', () => {
    const store = useDrawingStore.getState();
    const layerId = store.activeLayerId;
    const f1 = makeFeature(generateId(), layerId);
    const f2 = makeFeature(generateId(), layerId);
    const f3 = makeFeature(generateId(), layerId);
    store.addFeature(f1);
    store.addFeature(f2);
    store.addFeature(f3);

    const group = store.groupFeatures([f1.id, f2.id, f3.id])!;
    store.removeFeatureFromGroup(f1.id);

    const { document: doc } = useDrawingStore.getState();
    expect(doc.features[f1.id]?.featureGroupId).toBeFalsy();
    expect(doc.features[f2.id]?.featureGroupId).toBe(group.id);
    expect(doc.features[f3.id]?.featureGroupId).toBe(group.id);
    expect(doc.featureGroups[group.id]?.featureIds).not.toContain(f1.id);
    expect(doc.featureGroups[group.id]?.featureIds).toHaveLength(2);
  });

  it('removeFeatureFromGroup dissolves the group when only 1 member would remain', () => {
    const store = useDrawingStore.getState();
    const layerId = store.activeLayerId;
    const f1 = makeFeature(generateId(), layerId);
    const f2 = makeFeature(generateId(), layerId);
    store.addFeature(f1);
    store.addFeature(f2);

    const group = store.groupFeatures([f1.id, f2.id])!;
    store.removeFeatureFromGroup(f1.id);

    const { document: doc } = useDrawingStore.getState();
    // Group dissolved: both features ungrouped
    expect(doc.featureGroups[group.id]).toBeUndefined();
    expect(doc.features[f1.id]?.featureGroupId).toBeFalsy();
    expect(doc.features[f2.id]?.featureGroupId).toBeFalsy();
  });

  it('removeFeatureFromGroup is a no-op for a feature not in any group', () => {
    const store = useDrawingStore.getState();
    const layerId = store.activeLayerId;
    const f1 = makeFeature(generateId(), layerId);
    store.addFeature(f1);

    // Should not throw
    expect(() => store.removeFeatureFromGroup(f1.id)).not.toThrow();
    const { document: doc } = useDrawingStore.getState();
    expect(doc.features[f1.id]?.featureGroupId).toBeFalsy();
  });

  it('after ungrouping, features can be regrouped freely', () => {
    const store = useDrawingStore.getState();
    const layerId = store.activeLayerId;
    const f1 = makeFeature(generateId(), layerId);
    const f2 = makeFeature(generateId(), layerId);
    store.addFeature(f1);
    store.addFeature(f2);

    const g1 = store.groupFeatures([f1.id, f2.id])!;
    store.ungroupFeatures(g1.id);

    // Now regroup — should succeed
    const g2 = store.groupFeatures([f1.id, f2.id], 'Regrouped');
    expect(g2).not.toBeNull();
    expect(g2!.name).toBe('Regrouped');
  });

  it('renameFeatureGroup changes the group name', () => {
    const store = useDrawingStore.getState();
    const layerId = store.activeLayerId;
    const f1 = makeFeature(generateId(), layerId);
    const f2 = makeFeature(generateId(), layerId);
    store.addFeature(f1);
    store.addFeature(f2);

    const group = store.groupFeatures([f1.id, f2.id], 'Old Name')!;
    store.renameFeatureGroup(group.id, 'New Name');

    const updated = store.getFeatureGroup(group.id);
    expect(updated?.name).toBe('New Name');
  });

  it('getLayerGroups returns only groups for the specified layer', () => {
    const store = useDrawingStore.getState();
    const layerId1 = store.activeLayerId;
    const layerId2 = generateId();
    store.addLayer(makeLayer(layerId2, 'Layer 2'));

    const f1 = makeFeature(generateId(), layerId1);
    const f2 = makeFeature(generateId(), layerId1);
    const f3 = makeFeature(generateId(), layerId2);
    const f4 = makeFeature(generateId(), layerId2);
    store.addFeature(f1);
    store.addFeature(f2);
    store.addFeature(f3);
    store.addFeature(f4);

    store.groupFeatures([f1.id, f2.id], 'Layer1 Group');
    store.groupFeatures([f3.id, f4.id], 'Layer2 Group');

    const layer1Groups = store.getLayerGroups(layerId1);
    const layer2Groups = store.getLayerGroups(layerId2);

    expect(layer1Groups).toHaveLength(1);
    expect(layer1Groups[0].name).toBe('Layer1 Group');
    expect(layer2Groups).toHaveLength(1);
    expect(layer2Groups[0].name).toBe('Layer2 Group');
  });

  it('auto-generates group name when none provided', () => {
    const store = useDrawingStore.getState();
    const layerId = store.activeLayerId;
    const f1 = makeFeature(generateId(), layerId);
    const f2 = makeFeature(generateId(), layerId);
    store.addFeature(f1);
    store.addFeature(f2);

    const group = store.groupFeatures([f1.id, f2.id])!;
    expect(group.name).toBeTruthy();
    expect(typeof group.name).toBe('string');
  });

  it('loadDocument normalizes stale featureGroupId references', () => {
    const store = useDrawingStore.getState();
    const layerId = store.activeLayerId;
    const f1 = makeFeature(generateId(), layerId);
    const f2 = makeFeature(generateId(), layerId);

    // Manually craft a document with a stale featureGroupId (group doesn't exist)
    const staleDoc = {
      ...store.document,
      features: {
        [f1.id]: { ...f1, featureGroupId: 'nonexistent-group' },
        [f2.id]: { ...f2, featureGroupId: null },
      },
      featureGroups: {},
    };

    store.loadDocument(staleDoc as never);

    const { document: doc } = useDrawingStore.getState();
    expect(doc.features[f1.id]?.featureGroupId).toBeFalsy();
    expect(doc.features[f2.id]?.featureGroupId).toBeFalsy();
  });
});


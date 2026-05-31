// __tests__/cad/feature-groups-nested.test.ts
//
// cad-layer-grouping-and-context-menus Slice 2 — pure helpers for
// the nested-FeatureGroup hierarchy + the moveFeatureGroup store
// action's cycle-prevention contract.

import { describe, it, expect, beforeEach } from 'vitest';
import type { FeatureGroup } from '@/lib/cad/types';
import {
  parentOf,
  ancestorChain,
  isDescendantOf,
  allDescendants,
  wouldCreateCycle,
  childrenOf,
  computeDestinationParentGroup,
  type FeatureGroupMap,
} from '@/lib/cad/feature-groups';
import { useDrawingStore } from '@/lib/cad/store/drawing-store';

const g = (id: string, parentGroupId: string | null = null): FeatureGroup => ({
  id,
  name: id,
  layerId: 'L',
  featureIds: [],
  parentGroupId,
});

// Two-level hierarchy:
//   root           (no parent)
//     ↳ child1
//        ↳ grand1
//     ↳ child2
//   sibling        (no parent)
const baseMap = (): FeatureGroupMap => ({
  root: g('root', null),
  child1: g('child1', 'root'),
  child2: g('child2', 'root'),
  grand1: g('grand1', 'child1'),
  sibling: g('sibling', null),
});

describe('parentOf', () => {
  it('returns null for a root-level group', () => {
    expect(parentOf(g('a', null))).toBeNull();
  });

  it('returns null when the parentGroupId field is missing entirely (back-compat)', () => {
    const noParent = { id: 'a', name: 'a', layerId: 'L', featureIds: [] } as FeatureGroup;
    expect(parentOf(noParent)).toBeNull();
  });

  it('returns the parent id when present', () => {
    expect(parentOf(g('a', 'root'))).toBe('root');
  });

  it('returns null for undefined input', () => {
    expect(parentOf(undefined)).toBeNull();
  });
});

describe('ancestorChain', () => {
  it('returns [] for a root group', () => {
    expect(ancestorChain(baseMap(), 'root')).toEqual([]);
  });

  it('returns the direct parent for a one-level-deep group', () => {
    expect(ancestorChain(baseMap(), 'child1')).toEqual(['root']);
  });

  it('returns the root-most-first chain for a two-level-deep group', () => {
    expect(ancestorChain(baseMap(), 'grand1')).toEqual(['root', 'child1']);
  });

  it('cycle-safe: stops cleanly when the chain loops back', () => {
    const map: FeatureGroupMap = {
      a: g('a', 'b'),
      b: g('b', 'a'),
    };
    expect(() => ancestorChain(map, 'a')).not.toThrow();
    expect(ancestorChain(map, 'a')).toEqual(['b']);
  });
});

describe('isDescendantOf', () => {
  it('true for a direct child', () => {
    expect(isDescendantOf(baseMap(), 'child1', 'root')).toBe(true);
  });

  it('true for a grandchild', () => {
    expect(isDescendantOf(baseMap(), 'grand1', 'root')).toBe(true);
  });

  it('false for a sibling / unrelated', () => {
    expect(isDescendantOf(baseMap(), 'sibling', 'root')).toBe(false);
    expect(isDescendantOf(baseMap(), 'child2', 'child1')).toBe(false);
  });

  it('false for self (a group is not its own descendant)', () => {
    expect(isDescendantOf(baseMap(), 'root', 'root')).toBe(false);
  });
});

describe('allDescendants', () => {
  it('returns every descendant of root (excluding root itself)', () => {
    expect(allDescendants(baseMap(), 'root').sort()).toEqual(['child1', 'child2', 'grand1']);
  });

  it('returns just the grandchild for child1', () => {
    expect(allDescendants(baseMap(), 'child1')).toEqual(['grand1']);
  });

  it('returns [] for a leaf', () => {
    expect(allDescendants(baseMap(), 'grand1')).toEqual([]);
  });
});

describe('wouldCreateCycle — the move-validation contract', () => {
  it('allows moving any group to layer-root (newParentId === null)', () => {
    expect(wouldCreateCycle(baseMap(), 'child1', null)).toBe(false);
    expect(wouldCreateCycle(baseMap(), 'grand1', null)).toBe(false);
  });

  it('allows moving a group under an unrelated group', () => {
    expect(wouldCreateCycle(baseMap(), 'sibling', 'root')).toBe(false);
    expect(wouldCreateCycle(baseMap(), 'sibling', 'child2')).toBe(false);
  });

  it('rejects moving a group under itself (self-parent)', () => {
    expect(wouldCreateCycle(baseMap(), 'root', 'root')).toBe(true);
  });

  it('rejects moving a group under one of its descendants', () => {
    expect(wouldCreateCycle(baseMap(), 'root', 'child1')).toBe(true);
    expect(wouldCreateCycle(baseMap(), 'root', 'grand1')).toBe(true);
    expect(wouldCreateCycle(baseMap(), 'child1', 'grand1')).toBe(true);
  });

  it('allows moving a group under a sibling (no cycle)', () => {
    expect(wouldCreateCycle(baseMap(), 'child1', 'child2')).toBe(false);
  });
});

describe('childrenOf', () => {
  it('returns layer-root groups for parentId === null', () => {
    expect(childrenOf(baseMap(), null).map((x) => x.id).sort()).toEqual(['root', 'sibling']);
  });

  it('returns direct children of root (NOT grandchildren)', () => {
    expect(childrenOf(baseMap(), 'root').map((x) => x.id).sort()).toEqual(['child1', 'child2']);
  });

  it('returns [] for a leaf parent', () => {
    expect(childrenOf(baseMap(), 'grand1')).toEqual([]);
  });
});

// ── drawing-store moveFeatureGroup action ──────────────────────────────────
//
// Locks the store-level contract on the new moveFeatureGroup action:
// reparents safely, rejects cycles (returns false + no-op), and
// allows moving back to layer-root via newParentId === null.

// cad-layer-grouping Slice 4 — destination-parent inference for the
// "Group Selected" multi-select right-click action.
describe('computeDestinationParentGroup', () => {
  it('returns null for an empty selection', () => {
    expect(computeDestinationParentGroup([])).toBeNull();
  });

  it('returns null when every selected feature is ungrouped (layer-root destination)', () => {
    expect(computeDestinationParentGroup([
      { featureGroupId: null },
      { featureGroupId: null },
    ])).toBeNull();
  });

  it('returns null when featureGroupId is missing entirely (treated as ungrouped)', () => {
    expect(computeDestinationParentGroup([{}, {}, {}])).toBeNull();
  });

  it('returns the shared group id when ALL features share the same parent group', () => {
    expect(computeDestinationParentGroup([
      { featureGroupId: 'parent-1' },
      { featureGroupId: 'parent-1' },
      { featureGroupId: 'parent-1' },
    ])).toBe('parent-1');
  });

  it('returns null when the selection mixes grouped + ungrouped features', () => {
    expect(computeDestinationParentGroup([
      { featureGroupId: 'parent-1' },
      { featureGroupId: null },
    ])).toBeNull();
  });

  it('returns null when the selection spans multiple distinct groups', () => {
    expect(computeDestinationParentGroup([
      { featureGroupId: 'a' },
      { featureGroupId: 'b' },
    ])).toBeNull();
  });
});

describe('drawingStore.moveFeatureGroup — cycle prevention', () => {
  beforeEach(() => {
    // Seed three groups in a chain root → child → grand on a single
    // layer. We splice them straight onto the store's existing doc.
    const seedLayer = { id: 'L', name: 'L', visible: true, locked: false, frozen: false, color: '#000', lineWeight: 0.75, lineTypeId: 'SOLID', opacity: 1, groupId: null, sortOrder: 0, isDefault: false, isProtected: false, autoAssignCodes: [] };
    useDrawingStore.setState((s) => ({
      document: {
        ...s.document,
        layers: { L: seedLayer as never },
        layerOrder: ['L'],
        featureGroups: {
          root: g('root', null),
          child: g('child', 'root'),
          grand: g('grand', 'child'),
          sibling: g('sibling', null),
        },
      },
      isDirty: false,
    }));
  });

  it('returns true and sets parentGroupId on a safe reparent', () => {
    const store = useDrawingStore.getState();
    expect(store.moveFeatureGroup('sibling', 'root')).toBe(true);
    expect(useDrawingStore.getState().document.featureGroups.sibling.parentGroupId).toBe('root');
  });

  it('allows moving back to layer-root via newParentId === null', () => {
    const store = useDrawingStore.getState();
    expect(store.moveFeatureGroup('grand', null)).toBe(true);
    expect(useDrawingStore.getState().document.featureGroups.grand.parentGroupId).toBeNull();
  });

  it('returns false and does NOT mutate on a self-parent attempt', () => {
    const store = useDrawingStore.getState();
    expect(store.moveFeatureGroup('root', 'root')).toBe(false);
    expect(useDrawingStore.getState().document.featureGroups.root.parentGroupId).toBeNull();
  });

  it('returns false and does NOT mutate when moving a group under one of its descendants', () => {
    const store = useDrawingStore.getState();
    expect(store.moveFeatureGroup('root', 'grand')).toBe(false);
    expect(useDrawingStore.getState().document.featureGroups.root.parentGroupId).toBeNull();
    expect(useDrawingStore.getState().document.featureGroups.grand.parentGroupId).toBe('child');
  });

  it('returns false when the source group does not exist', () => {
    const store = useDrawingStore.getState();
    expect(store.moveFeatureGroup('nope', 'root')).toBe(false);
  });

  it('returns false when the target parent does not exist', () => {
    const store = useDrawingStore.getState();
    expect(store.moveFeatureGroup('sibling', 'ghost-id')).toBe(false);
  });
});

// cad-layer-grouping Slice 4 — groupFeatures(ids, name, parentGroupId)
// accepts an optional parent so the multi-select right-click can nest
// a new sub-group under an existing FeatureGroup.
describe('drawingStore.groupFeatures(parentGroupId) — nested create', () => {
  it('the resulting group carries parentGroupId === null when omitted (back-compat)', () => {
    const layerId = useDrawingStore.getState().activeLayerId;
    const f1 = `f-${Math.random().toString(16).slice(2)}`;
    const f2 = `f-${Math.random().toString(16).slice(2)}`;
    useDrawingStore.getState().addFeature({ id: f1, type: 'POINT', geometry: { type: 'POINT', point: { x: 0, y: 0 } }, properties: {}, style: {} as never, layerId } as never);
    useDrawingStore.getState().addFeature({ id: f2, type: 'POINT', geometry: { type: 'POINT', point: { x: 1, y: 1 } }, properties: {}, style: {} as never, layerId } as never);
    const group = useDrawingStore.getState().groupFeatures([f1, f2]);
    expect(group).not.toBeNull();
    expect(group!.parentGroupId ?? null).toBeNull();
  });

  it('creates a sub-group whose parentGroupId points at an existing group on the same layer', () => {
    const layerId = useDrawingStore.getState().activeLayerId;
    // Seed a parent group directly on the doc so we don't need to
    // round-trip through groupFeatures twice.
    useDrawingStore.setState((s) => ({
      document: {
        ...s.document,
        featureGroups: {
          ...s.document.featureGroups,
          parent1: { id: 'parent1', name: 'parent1', layerId, featureIds: [], parentGroupId: null },
        },
      },
    }));
    const f1 = `f-${Math.random().toString(16).slice(2)}`;
    const f2 = `f-${Math.random().toString(16).slice(2)}`;
    useDrawingStore.getState().addFeature({ id: f1, type: 'POINT', geometry: { type: 'POINT', point: { x: 0, y: 0 } }, properties: {}, style: {} as never, layerId } as never);
    useDrawingStore.getState().addFeature({ id: f2, type: 'POINT', geometry: { type: 'POINT', point: { x: 1, y: 1 } }, properties: {}, style: {} as never, layerId } as never);
    const sub = useDrawingStore.getState().groupFeatures([f1, f2], 'Sub', 'parent1');
    expect(sub).not.toBeNull();
    expect(sub!.parentGroupId).toBe('parent1');
  });

  it('returns null when the supplied parentGroupId references a non-existent group', () => {
    const layerId = useDrawingStore.getState().activeLayerId;
    const f1 = `f-${Math.random().toString(16).slice(2)}`;
    const f2 = `f-${Math.random().toString(16).slice(2)}`;
    useDrawingStore.getState().addFeature({ id: f1, type: 'POINT', geometry: { type: 'POINT', point: { x: 0, y: 0 } }, properties: {}, style: {} as never, layerId } as never);
    useDrawingStore.getState().addFeature({ id: f2, type: 'POINT', geometry: { type: 'POINT', point: { x: 1, y: 1 } }, properties: {}, style: {} as never, layerId } as never);
    expect(useDrawingStore.getState().groupFeatures([f1, f2], undefined, 'ghost')).toBeNull();
  });
});

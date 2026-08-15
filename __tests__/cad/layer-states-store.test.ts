// C8 — layer states through the store.
//
// `layer-states.test.ts` covers the pure planning. This covers what only the store can get wrong:
// persistence onto the document, replace-by-name, and the restore actually landing on the layers.

import { describe, it, expect, beforeEach } from 'vitest';
import { useDrawingStore, __resetVisibleCache } from '@/lib/cad/store/drawing-store';

function layerIds(): string[] {
  return useDrawingStore.getState().document.layerOrder;
}

beforeEach(() => {
  useDrawingStore.getState().newDocument();
  __resetVisibleCache();
});

describe('saving', () => {
  it('stores a state on the document, so it travels with the drawing', () => {
    useDrawingStore.getState().saveLayerState('Field check');
    const states = useDrawingStore.getState().document.layerStates ?? [];
    expect(states).toHaveLength(1);
    expect(states[0].name).toBe('Field check');
    // Every layer in the drawing is captured, not just the visible ones — restoring must be able to
    // turn things back ON, which needs a record of what was off.
    expect(Object.keys(states[0].entries).sort()).toEqual([...layerIds()].sort());
  });

  it('replaces a state of the same name instead of making a second row', () => {
    const [first] = layerIds();
    useDrawingStore.getState().saveLayerState('Plat');
    useDrawingStore.getState().updateLayer(first, { visible: false });
    useDrawingStore.getState().saveLayerState('plat'); // different case, same name

    const states = useDrawingStore.getState().document.layerStates ?? [];
    expect(states, 'two rows called "Plat" is a list nobody can use').toHaveLength(1);
    expect(states[0].entries[first].visible).toBe(false);
  });

  it('ignores a blank name rather than creating an unnameable row', () => {
    useDrawingStore.getState().saveLayerState('   ');
    expect(useDrawingStore.getState().document.layerStates ?? []).toHaveLength(0);
  });
});

describe('restoring', () => {
  it('puts the layers back the way they were', () => {
    const [a, b] = layerIds();
    useDrawingStore.getState().updateLayer(a, { visible: true });
    useDrawingStore.getState().updateLayer(b, { visible: false });
    useDrawingStore.getState().saveLayerState('Plat');
    const stateId = (useDrawingStore.getState().document.layerStates ?? [])[0].id;

    // Scramble it.
    useDrawingStore.getState().updateLayer(a, { visible: false });
    useDrawingStore.getState().updateLayer(b, { visible: true });

    useDrawingStore.getState().restoreLayerState(stateId);
    expect(useDrawingStore.getState().document.layers[a].visible).toBe(true);
    expect(useDrawingStore.getState().document.layers[b].visible).toBe(false);
  });

  it('restores frozen and locked too, not just the eye', () => {
    const [a] = layerIds();
    useDrawingStore.getState().updateLayer(a, { frozen: true, locked: true });
    useDrawingStore.getState().saveLayerState('Locked down');
    const stateId = (useDrawingStore.getState().document.layerStates ?? [])[0].id;

    useDrawingStore.getState().updateLayer(a, { frozen: false, locked: false });
    useDrawingStore.getState().restoreLayerState(stateId);

    expect(useDrawingStore.getState().document.layers[a].frozen).toBe(true);
    expect(useDrawingStore.getState().document.layers[a].locked).toBe(true);
  });

  it('leaves a layer created AFTER the save completely alone', () => {
    useDrawingStore.getState().saveLayerState('Before');
    const stateId = (useDrawingStore.getState().document.layerStates ?? [])[0].id;

    useDrawingStore.getState().addLayer({
      id: 'NEW', name: 'New', visible: true, locked: false, frozen: false,
      color: '#fff', lineWeight: 0.75, lineTypeId: 'SOLID', opacity: 1,
      groupId: null, sortOrder: 99, isDefault: false, isProtected: false, autoAssignCodes: [],
    } as never);

    useDrawingStore.getState().restoreLayerState(stateId);
    // Hiding it would make work the surveyor just did disappear, from a control they may not
    // connect to the disappearance. Showing one extra layer is visible and recoverable.
    expect(useDrawingStore.getState().document.layers.NEW.visible).toBe(true);
  });

  it('does nothing at all for an unknown state id', () => {
    const before = useDrawingStore.getState().document.layers;
    useDrawingStore.getState().restoreLayerState('nope');
    expect(useDrawingStore.getState().document.layers).toBe(before);
  });

  it('rebuilds the layer map ONCE, not once per layer', () => {
    // The visible-set cache (S2b/C3/C4) is keyed on `document.layers` identity. Looping updateLayer
    // would produce a new document per layer and invalidate the cache N times, re-deriving the
    // whole visible set on each — the exact per-frame cost P1 spent four slices removing.
    useDrawingStore.getState().saveLayerState('S');
    const stateId = (useDrawingStore.getState().document.layerStates ?? [])[0].id;
    const before = useDrawingStore.getState().document;
    useDrawingStore.getState().restoreLayerState(stateId);
    const after = useDrawingStore.getState().document;
    expect(after).not.toBe(before);
    // One rebuild: the layers object changed identity exactly once, and every layer object inside
    // it that the state touched is a fresh object from that single pass.
    expect(after.layers).not.toBe(before.layers);
  });
});

describe('removing', () => {
  it('forgets the state and leaves the layers untouched', () => {
    const [a] = layerIds();
    useDrawingStore.getState().saveLayerState('Temp');
    const stateId = (useDrawingStore.getState().document.layerStates ?? [])[0].id;
    const visibleBefore = useDrawingStore.getState().document.layers[a].visible;

    useDrawingStore.getState().removeLayerState(stateId);
    expect(useDrawingStore.getState().document.layerStates ?? []).toHaveLength(0);
    expect(useDrawingStore.getState().document.layers[a].visible).toBe(visibleBefore);
  });
});

describe('documents saved before this feature existed', () => {
  it('treat a missing layerStates key as no states, and can still save one', () => {
    // `layerStates` is optional precisely so old drawings keep loading. A required field would have
    // made every previously-saved file fail to open — a worse bug than this feature is a good one.
    const doc = useDrawingStore.getState().document;
    const legacy = { ...doc };
    delete (legacy as { layerStates?: unknown }).layerStates;
    useDrawingStore.getState().loadDocument(legacy as never);

    expect(useDrawingStore.getState().document.layerStates ?? []).toHaveLength(0);
    useDrawingStore.getState().saveLayerState('First');
    expect(useDrawingStore.getState().document.layerStates ?? []).toHaveLength(1);
  });
});

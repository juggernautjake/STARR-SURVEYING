// __tests__/cad/operations/offset-propagator.test.ts
//
// Slice 6 of cad-offset-tool-2026-05-29.md. Locks the source-mutation
// propagator: editing a source feature regenerates every linked
// offset, the re-entry guard prevents the propagator's own writes
// from triggering another pass, and deleting a source surfaces a
// stale-link without re-publishing the offset.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Feature } from '@/lib/cad/types';
import { useDrawingStore } from '@/lib/cad/store/drawing-store';
import { stampOffsetMetadata } from '@/lib/cad/operations/offset-metadata';
import {
  _isPropagating,
  _resetOffsetPropagatorForTests,
  findStaleOffsets,
  mountOffsetPropagator,
  propagateOffsetsFromSource,
  unmountOffsetPropagator,
} from '@/lib/cad/operations/offset-propagator';

function freshDocument() {
  useDrawingStore.setState((state) => ({
    document: {
      ...state.document,
      features: {},
      layers: { 'layer-0': { id: 'layer-0', name: 'Default', color: '#fff', visible: true, locked: false } as never },
      layerOrder: ['layer-0'],
    },
  }));
}

function makeLineSource(id: string, end = { x: 10, y: 0 }): Feature {
  return {
    id,
    type: 'LINE',
    geometry: { type: 'LINE', start: { x: 0, y: 0 }, end },
    layerId: 'layer-0',
    style: { color: '#fff', lineWeight: 1, opacity: 1 } as Feature['style'],
    properties: {},
  };
}

function makeOffset(id: string, sourceId: string, distance = 5): Feature {
  const base: Feature = {
    id,
    type: 'LINE',
    geometry: { type: 'LINE', start: { x: 0, y: distance }, end: { x: 10, y: distance } },
    layerId: 'layer-0',
    style: { color: '#fff', lineWeight: 1, opacity: 1 } as Feature['style'],
    properties: {},
  };
  return stampOffsetMetadata(base, {
    sourceId,
    distance,
    unit: 'FT',
    side: 'LEFT',
    cornerHandling: 'MITER',
  });
}

beforeEach(() => {
  freshDocument();
  _resetOffsetPropagatorForTests();
});

afterEach(() => {
  unmountOffsetPropagator();
});

describe('propagateOffsetsFromSource — direct call', () => {
  it('regenerates the offset against the source geometry', () => {
    const source = makeLineSource('src-1');
    const offset = makeOffset('off-1', 'src-1', 5);
    useDrawingStore.getState().addFeatures([source, offset]);
    // Move the source's end point up by 4 — the offset should still
    // lie 5 ft to the LEFT of the source's new direction.
    useDrawingStore.getState().updateFeatureGeometry('src-1', {
      type: 'LINE',
      start: { x: 0, y: 0 },
      end:   { x: 10, y: 0 },
    });
    propagateOffsetsFromSource('src-1');
    const after = useDrawingStore.getState().getFeature('off-1')!;
    expect(after.geometry.start!.y).toBeCloseTo(5, 6);
    expect(after.geometry.end!.y).toBeCloseTo(5, 6);
  });

  it('preserves the offset metadata across the propagation', () => {
    useDrawingStore.getState().addFeatures([
      makeLineSource('src-1'),
      makeOffset('off-1', 'src-1', 7.5),
    ]);
    propagateOffsetsFromSource('src-1');
    const after = useDrawingStore.getState().getFeature('off-1')!;
    expect(after.properties.offsetSourceId).toBe('src-1');
    expect(after.properties.offsetDistance).toBe(7.5);
    expect(after.properties.offsetUnit).toBe('FT');
  });

  it('regenerates every offset that points at the same source', () => {
    useDrawingStore.getState().addFeatures([
      makeLineSource('src-1'),
      makeOffset('off-1', 'src-1', 3),
      makeOffset('off-2', 'src-1', 6),
      makeOffset('off-3', 'src-2', 4), // pointing at a different source
    ]);
    propagateOffsetsFromSource('src-1');
    const o1 = useDrawingStore.getState().getFeature('off-1')!;
    const o2 = useDrawingStore.getState().getFeature('off-2')!;
    expect(o1.geometry.start!.y).toBeCloseTo(3, 6);
    expect(o2.geometry.start!.y).toBeCloseTo(6, 6);
  });

  it('does not touch offsets pointing at a different source', () => {
    useDrawingStore.getState().addFeatures([
      makeLineSource('src-1'),
      makeLineSource('src-2'),
      makeOffset('off-other', 'src-2', 4),
    ]);
    const before = useDrawingStore.getState().getFeature('off-other')!;
    propagateOffsetsFromSource('src-1');
    const after = useDrawingStore.getState().getFeature('off-other')!;
    expect(after.geometry).toEqual(before.geometry);
  });

  it('does nothing when the source feature has been deleted', () => {
    useDrawingStore.getState().addFeatures([makeOffset('off-1', 'ghost', 5)]);
    const before = useDrawingStore.getState().getFeature('off-1')!;
    propagateOffsetsFromSource('ghost');
    const after = useDrawingStore.getState().getFeature('off-1')!;
    expect(after.geometry).toEqual(before.geometry);
  });
});

describe('mountOffsetPropagator — store subscription', () => {
  it('regenerates offsets when the source geometry is mutated', () => {
    useDrawingStore.getState().addFeatures([
      makeLineSource('src-1'),
      makeOffset('off-1', 'src-1', 5),
    ]);
    mountOffsetPropagator();
    useDrawingStore.getState().updateFeatureGeometry('src-1', {
      type: 'LINE',
      start: { x: 0, y: 100 },
      end:   { x: 10, y: 100 },
    });
    const after = useDrawingStore.getState().getFeature('off-1')!;
    expect(after.geometry.start!.y).toBeCloseTo(105, 6);
    expect(after.geometry.end!.y).toBeCloseTo(105, 6);
  });

  it('is idempotent — calling mount twice returns the same unsubscribe handle', () => {
    const u1 = mountOffsetPropagator();
    const u2 = mountOffsetPropagator();
    expect(u1).toBe(u2);
  });

  it('does not propagate when no offsets exist (no-op iteration)', () => {
    useDrawingStore.getState().addFeatures([makeLineSource('src-1')]);
    mountOffsetPropagator();
    useDrawingStore.getState().updateFeatureGeometry('src-1', {
      type: 'LINE',
      start: { x: 5, y: 5 },
      end:   { x: 15, y: 5 },
    });
    // Just asserting the propagator didn't throw / loop forever.
    expect(_isPropagating()).toBe(false);
  });
});

describe('re-entry guard', () => {
  it('clears the flag after a normal propagation', () => {
    useDrawingStore.getState().addFeatures([
      makeLineSource('src-1'),
      makeOffset('off-1', 'src-1'),
    ]);
    propagateOffsetsFromSource('src-1');
    expect(_isPropagating()).toBe(false);
  });

  it('skips when called while already propagating', () => {
    let nestedCallExecuted = false;
    useDrawingStore.getState().addFeatures([
      makeLineSource('src-1'),
      makeOffset('off-1', 'src-1'),
    ]);
    mountOffsetPropagator();
    const originalUpdate = useDrawingStore.getState().updateFeatureGeometry;
    useDrawingStore.setState({
      updateFeatureGeometry: (id, geom) => {
        // Simulate a propagation pass triggering nested calls.
        if (_isPropagating()) nestedCallExecuted = true;
        originalUpdate(id, geom);
      },
    });
    useDrawingStore.getState().updateFeatureGeometry('src-1', {
      type: 'LINE',
      start: { x: 0, y: 0 },
      end:   { x: 20, y: 0 },
    });
    expect(nestedCallExecuted).toBe(true);
    expect(_isPropagating()).toBe(false);
    // Reset the store mutator so other tests aren't affected.
    useDrawingStore.setState({ updateFeatureGeometry: originalUpdate });
  });
});

describe('findStaleOffsets — source deletion path', () => {
  it('returns the ids of offsets whose source no longer exists', () => {
    useDrawingStore.getState().addFeatures([
      makeLineSource('src-1'),
      makeOffset('off-live', 'src-1'),
      makeOffset('off-stale', 'src-ghost'),
    ]);
    const stale = findStaleOffsets();
    expect(stale).toEqual(['off-stale']);
  });

  it('returns an empty array when every source is still present', () => {
    useDrawingStore.getState().addFeatures([
      makeLineSource('src-1'),
      makeOffset('off-1', 'src-1'),
    ]);
    expect(findStaleOffsets()).toEqual([]);
  });

  it('flags an offset as stale immediately after its source is deleted', () => {
    useDrawingStore.getState().addFeatures([
      makeLineSource('src-1'),
      makeOffset('off-1', 'src-1'),
    ]);
    expect(findStaleOffsets()).toEqual([]);
    useDrawingStore.getState().removeFeature('src-1');
    expect(findStaleOffsets()).toEqual(['off-1']);
  });
});

describe('propagation chain — multiple sources in one pass', () => {
  it('each source change triggers exactly its own offsets', () => {
    useDrawingStore.getState().addFeatures([
      makeLineSource('src-a'),
      makeLineSource('src-b'),
      makeOffset('off-a', 'src-a', 5),
      makeOffset('off-b', 'src-b', 7),
    ]);
    mountOffsetPropagator();
    useDrawingStore.getState().updateFeatureGeometry('src-a', {
      type: 'LINE',
      start: { x: 0, y: 0 },
      end:   { x: 20, y: 0 },
    });
    const offA = useDrawingStore.getState().getFeature('off-a')!;
    const offB = useDrawingStore.getState().getFeature('off-b')!;
    // off-a follows src-a's new x-extent
    expect(offA.geometry.end!.x).toBeCloseTo(20, 6);
    expect(offA.geometry.start!.y).toBeCloseTo(5, 6);
    // off-b stays parked at its original src-b parallel (src-b unchanged)
    expect(offB.geometry.start!.y).toBeCloseTo(7, 6);
    expect(offB.geometry.end!.x).toBeCloseTo(10, 6);
  });
});

describe('source deletion during propagation', () => {
  it('deleting the source while the propagator is mounted leaves the offset geometry alone', () => {
    useDrawingStore.getState().addFeatures([
      makeLineSource('src-1'),
      makeOffset('off-1', 'src-1', 5),
    ]);
    mountOffsetPropagator();
    const before = useDrawingStore.getState().getFeature('off-1')!.geometry;
    useDrawingStore.getState().removeFeature('src-1');
    const after = useDrawingStore.getState().getFeature('off-1')!.geometry;
    // Slice 4's PropertyPanel handles the stale display; the
    // propagator just refuses to republish (no source = no recompute).
    expect(after).toEqual(before);
    expect(findStaleOffsets()).toEqual(['off-1']);
  });
});

describe('chained source mutations', () => {
  it('a second source mutation re-propagates from the new geometry', () => {
    useDrawingStore.getState().addFeatures([
      makeLineSource('src-1'),
      makeOffset('off-1', 'src-1', 5),
    ]);
    mountOffsetPropagator();
    useDrawingStore.getState().updateFeatureGeometry('src-1', {
      type: 'LINE',
      start: { x: 0, y: 10 },
      end:   { x: 10, y: 10 },
    });
    expect(useDrawingStore.getState().getFeature('off-1')!.geometry.start!.y).toBeCloseTo(15, 6);
    useDrawingStore.getState().updateFeatureGeometry('src-1', {
      type: 'LINE',
      start: { x: 0, y: 20 },
      end:   { x: 10, y: 20 },
    });
    expect(useDrawingStore.getState().getFeature('off-1')!.geometry.start!.y).toBeCloseTo(25, 6);
  });
});

describe('unmountOffsetPropagator', () => {
  it('stops the propagator — source changes no longer auto-regenerate offsets', () => {
    useDrawingStore.getState().addFeatures([
      makeLineSource('src-1'),
      makeOffset('off-1', 'src-1', 5),
    ]);
    mountOffsetPropagator();
    unmountOffsetPropagator();
    const before = useDrawingStore.getState().getFeature('off-1')!.geometry;
    useDrawingStore.getState().updateFeatureGeometry('src-1', {
      type: 'LINE',
      start: { x: 0, y: 50 },
      end:   { x: 10, y: 50 },
    });
    const after = useDrawingStore.getState().getFeature('off-1')!.geometry;
    expect(after).toEqual(before);
  });
});

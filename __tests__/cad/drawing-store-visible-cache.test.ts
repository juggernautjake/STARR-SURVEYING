// CAD_AUDIT Slice S2b — the visible-feature cache must never go stale.
//
// S2 measured the CAD freeze instead of theorising about it: 200,000 features, static scene, no
// input, and `renderAll` cost 269 ms per frame — twelve frames a second doing nothing. The cause was
// `getVisibleFeatures()` re-deriving the whole set from scratch, five times per frame, from inside
// `renderAll`. S2b memoises that derivation against `document.features` / `document.layers` object
// identity.
//
// THIS FILE EXISTS BECAUSE THE FIX'S FAILURE MODE IS WORSE THAN THE BUG. A stale cache means the
// canvas silently stops updating — a deleted feature keeps drawing, a hidden layer stays on screen —
// and unlike a freeze it looks like everything worked. So every axis the predicate reads gets its
// own invalidation test: add, delete, hide a feature, hide a layer, freeze a layer.
//
// The speed itself is deliberately NOT asserted here. A timing assertion in a unit suite is flaky on
// a loaded CI box, and the real number came from the browser overlay on the same 200k fixture, which
// is recorded in the plan doc.

import { describe, it, expect, beforeEach } from 'vitest';
import { useDrawingStore, __resetVisibleCache } from '@/lib/cad/store/drawing-store';

let seq = 0;

/** Returns the id, because the store's `addFeature` takes a fully-formed Feature and returns void. */
function addPoint(layerId: string): string {
  const id = `vc-${++seq}`;
  useDrawingStore.getState().addFeature({
    id,
    type: 'POINT',
    layerId,
    geometry: { type: 'POINT', point: { x: 0, y: 0 } },
    properties: {},
    style: {} as never,
  } as never);
  return id;
}

/** A REAL layer from the default document. Using a made-up id would make every feature invisible
 *  (the predicate drops a feature whose layer is missing), and the whole suite would pass by
 *  accident on empty arrays. */
function anyLayerId(): string {
  return useDrawingStore.getState().document.layerOrder[0];
}

beforeEach(() => {
  useDrawingStore.getState().newDocument();
  __resetVisibleCache();
});

describe('the cache returns the same answer the uncached predicate would', () => {
  it('is stable across repeated calls with no change', () => {
    const layer = anyLayerId();
    addPoint(layer);
    addPoint(layer);
    const first = useDrawingStore.getState().getVisibleFeatures();
    const second = useDrawingStore.getState().getVisibleFeatures();
    expect(second).toHaveLength(first.length);
    // Identity, not just equality — that is what proves the second call did no work.
    expect(second).toBe(first);
  });
});

describe('it invalidates on every axis the predicate reads', () => {
  it('adding a feature', () => {
    const layer = anyLayerId();
    addPoint(layer);
    const before = useDrawingStore.getState().getVisibleFeatures().length;
    addPoint(layer);
    expect(useDrawingStore.getState().getVisibleFeatures().length).toBe(before + 1);
  });

  it('deleting a feature', () => {
    const layer = anyLayerId();
    const id = addPoint(layer);
    useDrawingStore.getState().getVisibleFeatures(); // warm the cache
    useDrawingStore.getState().removeFeature(id);
    const ids = useDrawingStore.getState().getVisibleFeatures().map((f) => f.id);
    // The nastiest stale-cache symptom: a deleted feature that keeps drawing forever.
    expect(ids).not.toContain(id);
  });

  it('hiding a feature', () => {
    const layer = anyLayerId();
    const id = addPoint(layer);
    useDrawingStore.getState().getVisibleFeatures();
    useDrawingStore.getState().updateFeature(id, { hidden: true } as never);
    expect(useDrawingStore.getState().getVisibleFeatures().map((f) => f.id)).not.toContain(id);
  });

  it('hiding the layer a feature is on', () => {
    const layer = anyLayerId();
    const id = addPoint(layer);
    useDrawingStore.getState().getVisibleFeatures();
    useDrawingStore.getState().updateLayer(layer, { visible: false } as never);
    expect(useDrawingStore.getState().getVisibleFeatures().map((f) => f.id)).not.toContain(id);
  });

  it('freezing the layer a feature is on', () => {
    // Frozen is a separate flag from visible (cad-domain-audit Slice E) and lives on `layers`, so it
    // is a distinct invalidation axis even though it shares a cache key with visibility.
    const layer = anyLayerId();
    const id = addPoint(layer);
    useDrawingStore.getState().getVisibleFeatures();
    useDrawingStore.getState().updateLayer(layer, { frozen: true } as never);
    expect(useDrawingStore.getState().getVisibleFeatures().map((f) => f.id)).not.toContain(id);
  });
});

describe('the type buckets agree with a plain filter, and invalidate too', () => {
  it('an image-free drawing gets an empty IMAGE bucket rather than a full scan', () => {
    const layer = anyLayerId();
    addPoint(layer);
    expect(useDrawingStore.getState().getVisibleFeaturesByGeometryType('IMAGE')).toEqual([]);
  });

  it('the geometry bucket matches filtering the visible list by hand', () => {
    const layer = anyLayerId();
    addPoint(layer);
    addPoint(layer);
    const byHand = useDrawingStore.getState().getVisibleFeatures()
      .filter((f) => f.geometry?.type === 'POINT').map((f) => f.id);
    const byBucket = useDrawingStore.getState()
      .getVisibleFeaturesByGeometryType('POINT').map((f) => f.id);
    expect(byBucket).toEqual(byHand);
  });

  it('the bucket updates when a feature is added', () => {
    const layer = anyLayerId();
    addPoint(layer);
    const before = useDrawingStore.getState().getVisibleFeaturesByGeometryType('POINT').length;
    addPoint(layer);
    expect(useDrawingStore.getState().getVisibleFeaturesByGeometryType('POINT').length)
      .toBe(before + 1);
  });

  it('an unknown type is an empty array, not undefined', () => {
    // Callers `.filter()` and `.length` the result directly; returning undefined would turn a
    // missing bucket into a crash in the render loop.
    expect(useDrawingStore.getState().getVisibleFeaturesByType('NOT_A_TYPE')).toEqual([]);
  });
});

describe('the selectable set is cached on the same key without being confused with the visible set',
  () => {
    it('returns its own list', () => {
      const layer = anyLayerId();
      addPoint(layer);
      const visible = useDrawingStore.getState().getVisibleFeatures();
      const selectable = useDrawingStore.getState().getSelectableFeatures();
      // Same membership here, but they must not be the SAME array — a locked layer renders while
      // being unselectable, and sharing one array would erase that distinction the moment one is
      // locked.
      expect(selectable).not.toBe(visible);
    });

    it('a locked layer stays visible but stops being selectable', () => {
      const layer = anyLayerId();
      const id = addPoint(layer);
      useDrawingStore.getState().getSelectableFeatures();
      useDrawingStore.getState().updateLayer(layer, { locked: true } as never);
      expect(useDrawingStore.getState().getVisibleFeatures().map((f) => f.id)).toContain(id);
      expect(useDrawingStore.getState().getSelectableFeatures().map((f) => f.id)).not.toContain(id);
    });
  });

describe('the render loop actually uses the buckets', () => {
  // The defect this repo produces most often is a correct module nothing calls. The 62.9 ms saving
  // is only real if the render pass stopped doing the full scan.
  const raw = require('node:fs').readFileSync(
    require('node:path').join(process.cwd(), 'app/admin/cad/components/CanvasViewport.tsx'), 'utf8');

  // Comments are stripped before the negative assertions, and the reason is not hypothetical: the
  // first version of this test failed against the comment that explains the fix, because that
  // comment quotes the old code verbatim. A source check that cannot tell code from prose would
  // equally have PASSED on a file where the fix was only described and never applied.
  const code = raw.split('\n').filter((l: string) => !l.trim().startsWith('//')).join('\n');

  it('renderImageFeatures no longer filters the whole visible set', () => {
    expect(code).toContain("getVisibleFeaturesByGeometryType('IMAGE')");
    expect(code).not.toMatch(/getVisibleFeatures\(\)\s*\.filter\(\s*\(f\) => f\.geometry\.type === 'IMAGE'/);
  });

  it('renderTextFeatures no longer filters the whole visible set', () => {
    expect(code).toContain("getVisibleFeaturesByType('TEXT')");
    expect(code).not.toContain("getVisibleFeatures().filter(f => f.type === 'TEXT')");
  });
});

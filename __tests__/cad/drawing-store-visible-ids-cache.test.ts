// C3 (2026-08-15) — the visible-ID Set is cached, and carries a worse danger than the list.
//
// `renderFeatures` was building `new Set(visibleFeatures.map(f => f.id))` on every frame. C2
// measured it at 16.2ms p50 on a 200,000-feature drawing — 78% of the entire render pass — because
// it allocated a 200k string array plus a 200k hash set per frame regardless of what the camera
// did. C3 moved it into the store's existing visible-set cache, keyed on the same
// `document.features` / `document.layers` references.
//
// ── WHY THIS FILE, WHEN drawing-store-visible-cache.test.ts ALREADY EXISTS ──────────────────────
//
// That file's header says the fix's failure mode is worse than the bug: a stale cache means the
// canvas silently stops updating. For the ID set it is worse still, because of what the consumer
// does with it:
//
//     if (!visibleIds.has(id)) { g.parent?.removeChild(g); g.destroy(); }
//
// A stale ID set does not merely draw something it should not — it DESTROYS the Graphics object of
// a feature that is still visible. The feature disappears from the canvas while remaining in the
// document, saved and selectable and invisible. That is the exact symptom S13d was written to make
// loud, arriving by a different route.
//
// So every axis the predicate reads gets its own invalidation test, and the set is checked for
// AGREEMENT with the list rather than merely for freshness — two derivations that must agree are
// two derivations that can disagree.

import { describe, it, expect, beforeEach } from 'vitest';
import { useDrawingStore, __resetVisibleCache } from '@/lib/cad/store/drawing-store';

let seq = 0;

function addPoint(layerId: string): string {
  const id = `vic-${++seq}`;
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

/** A REAL layer from the default document — a made-up id makes every feature invisible, and the
 *  whole suite would then pass by accident on empty sets. */
function anyLayerId(): string {
  return useDrawingStore.getState().document.layerOrder[0];
}

beforeEach(() => {
  useDrawingStore.getState().newDocument();
  __resetVisibleCache();
});

describe('the ID set agrees with the list it came from', () => {
  it('holds exactly the visible features’ ids', () => {
    const layer = anyLayerId();
    addPoint(layer);
    addPoint(layer);
    const list = useDrawingStore.getState().getVisibleFeatures();
    const ids = useDrawingStore.getState().getVisibleFeatureIds();
    expect(ids.size).toBe(list.length);
    for (const f of list) expect(ids.has(f.id)).toBe(true);
  });

  it('returns the SAME Set instance while nothing changes', () => {
    addPoint(anyLayerId());
    const a = useDrawingStore.getState().getVisibleFeatureIds();
    const b = useDrawingStore.getState().getVisibleFeatureIds();
    // Identity, not deep equality. A fresh-but-equal Set on each call is the 16.2ms bug back, and
    // an `toEqual` assertion would pass happily through it.
    expect(a).toBe(b);
  });
});

describe('it invalidates on every axis the predicate reads', () => {
  it('adding a feature', () => {
    const before = useDrawingStore.getState().getVisibleFeatureIds();
    const id = addPoint(anyLayerId());
    const after = useDrawingStore.getState().getVisibleFeatureIds();
    expect(after).not.toBe(before);
    expect(after.has(id)).toBe(true);
  });

  it('deleting a feature', () => {
    const id = addPoint(anyLayerId());
    expect(useDrawingStore.getState().getVisibleFeatureIds().has(id)).toBe(true);
    useDrawingStore.getState().removeFeature(id);
    expect(useDrawingStore.getState().getVisibleFeatureIds().has(id)).toBe(false);
  });

  it('hiding a feature', () => {
    const id = addPoint(anyLayerId());
    useDrawingStore.getState().updateFeature(id, { hidden: true } as never);
    expect(useDrawingStore.getState().getVisibleFeatureIds().has(id)).toBe(false);
  });

  it('hiding the layer the feature is on', () => {
    const layer = anyLayerId();
    const id = addPoint(layer);
    useDrawingStore.getState().updateLayer(layer, { visible: false } as never);
    expect(useDrawingStore.getState().getVisibleFeatureIds().has(id)).toBe(false);
  });

  it('freezing the layer the feature is on', () => {
    const layer = anyLayerId();
    const id = addPoint(layer);
    useDrawingStore.getState().updateLayer(layer, { frozen: true } as never);
    expect(useDrawingStore.getState().getVisibleFeatureIds().has(id)).toBe(false);
  });

  it('and comes BACK when the feature is unhidden', () => {
    // The round trip is the half that matters. An invalidation firing on the way out but not on
    // the way back leaves a feature permanently undrawable — its Graphics destroyed once and never
    // recreated — and only this direction catches it.
    const id = addPoint(anyLayerId());
    useDrawingStore.getState().updateFeature(id, { hidden: true } as never);
    expect(useDrawingStore.getState().getVisibleFeatureIds().has(id)).toBe(false);
    useDrawingStore.getState().updateFeature(id, { hidden: false } as never);
    const list = useDrawingStore.getState().getVisibleFeatures();
    const ids = useDrawingStore.getState().getVisibleFeatureIds();
    expect(ids.has(id)).toBe(true);
    expect(ids.size).toBe(list.length);
  });
});

describe('the render path uses the store rather than rebuilding it', () => {
  it('renderFeatures no longer maps the whole visible list into a Set every frame', async () => {
    const src = await import('node:fs').then((fs) =>
      fs.readFileSync('app/admin/cad/components/CanvasViewport.tsx', 'utf8'));

    // Scoped to `renderFeatures`, and the scoping is the point.
    //
    // The first version of this test matched `new Set(visibleFeatures.map` across the whole file
    // and failed — on `renderImageFeatures`, which uses the SAME variable name for a completely
    // different thing: the IMAGE bucket from `getVisibleFeaturesByGeometryType`, a handful of
    // features, not the 200k document. Same shape, different scale, and only the scale was ever
    // the defect. A file-wide regex was the instrument being wrong, not a second bug.
    // Brace-MATCHED, not "up to the next `function`". Slicing to the next declaration swept in
    // renderImageFeatures 600 lines later and failed on its (legitimate) bucket-sized Set — the
    // same over-broad-scope mistake as the file-wide regex, one step smaller. `renderFeatures()`
    // takes no parameters, so the first `{` after the name IS the body.
    const start = src.indexOf('function renderFeatures()');
    expect(start, 'renderFeatures should still exist').toBeGreaterThan(-1);
    let depth = 0;
    let i = src.indexOf('{', start);
    const from = i;
    for (; i < src.length; i++) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') { depth--; if (depth === 0) break; }
    }
    // Comments stripped, and this one bit on the first run. The C3 comment in `renderFeatures`
    // quotes the removed line verbatim to explain what it replaced — so the check matched its own
    // documentation and reported the bug as still present. `hub-greeting-fits-a-phone.test.ts`
    // states the rule outright: in a codebase that documents its reasoning this heavily, any check
    // that reads source must strip comments first. Third instrument correction in this one test.
    const body = src.slice(from, i + 1).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

    expect(body, 'the 16.2ms line is back').not.toMatch(/new Set\(visibleFeatures\.map/);
    expect(body).toMatch(/getVisibleFeatureIds\(\)/);
  });
});

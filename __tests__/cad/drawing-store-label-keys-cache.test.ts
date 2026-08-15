// C4 (2026-08-15) — the label-key Set, cached on the same document references.
//
// `renderLabels` built `keepLabelIds` by walking every layer-visible feature, every frame. It uses
// the UN-culled set deliberately — culling it would destroy and recreate every label on each pan —
// which is correct, and is exactly why it cost O(document) per frame: 200,000 iterations plus a Set
// of every label key before drawing the handful actually on screen. C3's shape, one level down.
//
// ── THE FAILURE MODE, WHICH IS QUIETER THAN C3's ────────────────────────────────────────────────
//
// The consumer does:
//
//     if (!keepLabelIds.has(key)) { txt.destroy(); }
//
// So a stale or disagreeing set destroys a label that should have survived. Unlike C3 — where a
// whole feature vanishes — this reads as labels FLICKERING during a pan: they disappear and come
// back as the render loop recreates them. That is easy to blame on rendering or on Pixi, and hard
// to trace back to a cache. Hence the agreement test at the bottom: a label key must exist if and
// only if its feature is in the visible set.

import { describe, it, expect, beforeEach } from 'vitest';
import { useDrawingStore, __resetVisibleCache } from '@/lib/cad/store/drawing-store';

let seq = 0;

function anyLayerId(): string {
  return useDrawingStore.getState().document.layerOrder[0];
}

function addPoint(layerId: string, withLabels: boolean): string {
  const id = `lk-${++seq}`;
  useDrawingStore.getState().addFeature({
    id,
    type: 'POINT',
    layerId,
    geometry: { type: 'POINT', point: { x: 0, y: 0 } },
    properties: {},
    style: {} as never,
    ...(withLabels
      ? { textLabels: [{ id: 'lbl1', kind: 'POINT_NAME' }, { id: 'lbl2', kind: 'POINT_CODE' }] }
      : {}),
  } as never);
  return id;
}

beforeEach(() => {
  useDrawingStore.getState().newDocument();
  __resetVisibleCache();
});

describe('the label-key Set', () => {
  it('keys every label of every visible feature as featureId:labelId', () => {
    const id = addPoint(anyLayerId(), true);
    const keys = useDrawingStore.getState().getVisibleLabelKeys();
    expect(keys.has(`${id}:lbl1`)).toBe(true);
    expect(keys.has(`${id}:lbl2`)).toBe(true);
  });

  it('returns the SAME Set instance while nothing changes', () => {
    addPoint(anyLayerId(), true);
    const a = useDrawingStore.getState().getVisibleLabelKeys();
    const b = useDrawingStore.getState().getVisibleLabelKeys();
    // Identity. A fresh-but-equal Set per call is the per-frame walk back, and `toEqual` would
    // sail straight through it.
    expect(a).toBe(b);
  });

  it('does not key a feature that has no labels', () => {
    const bare = addPoint(anyLayerId(), false);
    for (const k of useDrawingStore.getState().getVisibleLabelKeys()) {
      expect(k.startsWith(`${bare}:`)).toBe(false);
    }
  });
});

describe('it invalidates with the visible set it derives from', () => {
  it('drops the keys when the feature is hidden, and restores them when it is not', () => {
    const id = addPoint(anyLayerId(), true);
    useDrawingStore.getState().updateFeature(id, { hidden: true } as never);
    expect(useDrawingStore.getState().getVisibleLabelKeys().has(`${id}:lbl1`)).toBe(false);
    // The return trip: an invalidation that only fires one way leaves the label permanently
    // destroyed, which is the flicker turning into a disappearance.
    useDrawingStore.getState().updateFeature(id, { hidden: false } as never);
    expect(useDrawingStore.getState().getVisibleLabelKeys().has(`${id}:lbl1`)).toBe(true);
  });

  it('drops the keys when the layer is hidden', () => {
    const layer = anyLayerId();
    const id = addPoint(layer, true);
    useDrawingStore.getState().updateLayer(layer, { visible: false } as never);
    expect(useDrawingStore.getState().getVisibleLabelKeys().has(`${id}:lbl1`)).toBe(false);
  });

  it('drops the keys when the feature is removed', () => {
    const id = addPoint(anyLayerId(), true);
    useDrawingStore.getState().removeFeature(id);
    expect(useDrawingStore.getState().getVisibleLabelKeys().has(`${id}:lbl1`)).toBe(false);
  });

  it('a label key exists if and only if its feature is visible', () => {
    const layer = anyLayerId();
    const shown = addPoint(layer, true);
    const hidden = addPoint(layer, true);
    useDrawingStore.getState().updateFeature(hidden, { hidden: true } as never);

    const visibleIds = useDrawingStore.getState().getVisibleFeatureIds();
    const keys = useDrawingStore.getState().getVisibleLabelKeys();
    for (const key of keys) {
      expect(visibleIds.has(key.split(':')[0])).toBe(true);
    }
    expect(keys.has(`${shown}:lbl1`)).toBe(true);
    expect(keys.has(`${hidden}:lbl1`)).toBe(false);
  });
});

describe('the render path uses the store rather than rebuilding it', () => {
  it('renderLabels no longer walks the drawing every frame', async () => {
    const src = await import('node:fs').then((fs) =>
      fs.readFileSync('app/admin/cad/components/CanvasViewport.tsx', 'utf8'));
    const start = src.indexOf('function renderLabels()');
    expect(start, 'renderLabels should still exist').toBeGreaterThan(-1);
    let depth = 0;
    let i = src.indexOf('{', start);
    const from = i;
    for (; i < src.length; i++) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') { depth--; if (depth === 0) break; }
    }
    // Comments stripped. The C4 note in that function quotes what it replaced, and an unstripped
    // check matches its own documentation — the trap that cost C3's guard three revisions.
    const body = src.slice(from, i + 1).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

    expect(body).toMatch(/getVisibleLabelKeys\(\)/);
    expect(body, 'the per-frame label walk is back').not.toMatch(/for \(const f of layerVisibleFeatures\)/);
  });
});

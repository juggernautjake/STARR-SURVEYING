// CAD_AUDIT Slice S13e — deleting a layer must not dump its geometry on the title-block layer.
//
// `removeLayer` migrates a deleted layer's features onto a surviving layer rather than orphaning
// them — checked before changing anything, and that part was already right. The fallback, however,
// was `layerOrder[0]`, and `layerOrder[0]` is **SURVEY-INFO**: the layer holding the title block,
// seal, scale bar, north arrow, notes and certification, which S13 established may not receive drawn
// geometry.
//
// So deleting the layer you were working on moved your boundary onto the title-block layer — where
// toggling that layer's eye to hide the sheet furniture would take the survey with it.
//
// Same family as S8c/S13 and just as quiet: the features stay visible immediately afterwards, so
// nothing looks wrong until someone hides the furniture.

import { describe, it, expect, beforeEach } from 'vitest';
import { useDrawingStore } from '@/lib/cad/store/drawing-store';
import { isReservedDrawLayer } from '@/lib/cad/styles/default-layers';

const feature = (id: string, layerId: string) => ({
  id,
  type: 'LINE',
  geometry: { type: 'LINE', start: { x: 0, y: 0 }, end: { x: 1, y: 1 } },
  layerId,
  style: {},
  properties: {},
}) as never;

const drawableLayers = () =>
  useDrawingStore.getState().document.layerOrder.filter((id) => !isReservedDrawLayer(id));

beforeEach(() => { useDrawingStore.getState().newDocument(); });

describe('deleting the active layer', () => {
  it('does NOT move its geometry onto the reserved sheet-info layer', () => {
    // The bug. layerOrder[0] is SURVEY-INFO, so the old fallback sent the boundary there.
    const st = useDrawingStore.getState();
    const [drawable] = drawableLayers();
    st.setActiveLayer(drawable);
    st.addFeature(feature('boundary', drawable));

    useDrawingStore.getState().removeLayer(drawable);

    const moved = useDrawingStore.getState().getFeature('boundary');
    expect(moved).toBeDefined();
    expect(isReservedDrawLayer(moved!.layerId)).toBe(false);
  });

  it('keeps the geometry visible after the move', () => {
    // Migrating to a layer that does not exist would be worse than the bug being fixed.
    const st = useDrawingStore.getState();
    const [drawable] = drawableLayers();
    st.setActiveLayer(drawable);
    st.addFeature(feature('keepme', drawable));

    useDrawingStore.getState().removeLayer(drawable);

    const doc = useDrawingStore.getState().document;
    const f = doc.features['keepme'];
    expect(doc.layers[f.layerId]).toBeDefined();
    expect(useDrawingStore.getState().getVisibleFeatures().map((x) => x.id)).toContain('keepme');
  });
});

describe('what it must not break', () => {
  it('still migrates rather than deleting, when other layers survive', () => {
    const st = useDrawingStore.getState();
    const [drawable] = drawableLayers();
    st.addFeature(feature('survivor', drawable));
    useDrawingStore.getState().removeLayer(drawable);
    expect(useDrawingStore.getState().getFeature('survivor')).toBeDefined();
  });

  it('still removes the features when the LAST layer goes', () => {
    // Documented behaviour: with nowhere to move them, they are removed too. Preserved deliberately
    // — this slice narrows the destination, it does not change the empty-project rule.
    const st = useDrawingStore.getState();
    const [drawable] = drawableLayers();
    st.addFeature(feature('doomed', drawable));
    for (const id of [...useDrawingStore.getState().document.layerOrder]) {
      useDrawingStore.getState().removeLayer(id);
    }
    const after = useDrawingStore.getState();
    expect(after.document.layerOrder).toHaveLength(0);
    expect(after.getFeature('doomed')).toBeUndefined();
  });

  it('leaves features on OTHER layers alone', () => {
    const st = useDrawingStore.getState();
    const drawables = drawableLayers();
    const [a, b] = [drawables[0], drawables[1] ?? drawables[0]];
    st.addFeature(feature('onA', a));
    if (b !== a) st.addFeature(feature('onB', b));
    useDrawingStore.getState().removeLayer(a);
    if (b !== a) {
      expect(useDrawingStore.getState().getFeature('onB')!.layerId).toBe(b);
    }
  });
});

describe('when no drawable layer survives', () => {
  it('creates one rather than using the reserved layer as a dumping ground', () => {
    // The ordinary case on a default document, which ships exactly ONE drawing layer beside
    // SURVEY-INFO — so without this, deleting the layer you were working on would always land the
    // survey on the title-block layer. Losing the geometry is not an option either, so a third
    // choice is required.
    const st = useDrawingStore.getState();
    const [only] = drawableLayers();
    expect(drawableLayers()).toHaveLength(1); // premise of this test, asserted not assumed
    st.setActiveLayer(only);
    st.addFeature(feature('rescued', only));

    useDrawingStore.getState().removeLayer(only);

    const after = useDrawingStore.getState();
    const f = after.getFeature('rescued');
    expect(f).toBeDefined();
    expect(isReservedDrawLayer(f!.layerId)).toBe(false);
    // And it is a real, renderable layer — not a dangling id.
    expect(after.document.layers[f!.layerId]).toBeDefined();
    expect(after.getVisibleFeatures().map((x) => x.id)).toContain('rescued');
  });

  it('says why the replacement layer exists', () => {
    // A layer appearing from nowhere is confusing unless it explains itself.
    const st = useDrawingStore.getState();
    const [only] = drawableLayers();
    st.setActiveLayer(only);
    st.addFeature(feature('r2', only));
    useDrawingStore.getState().removeLayer(only);
    const after = useDrawingStore.getState();
    const f = after.getFeature('r2')!;
    expect(after.document.layers[f.layerId].description).toMatch(/deleted layer/i);
  });
});

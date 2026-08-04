// CAD_AUDIT Slice S13 — geometry must never be created where it cannot be seen.
//
// Found by driving the tool palette. On a freshly opened `/admin/cad`, drawing a line produced a
// correct live readout — `Len: 324.937 ft · Bearing: S 74°30'07" E` — committed a feature, and
// rendered nothing. Select All then reported "3 SELECTED — Editing 3 lines together" over an empty
// canvas. The features existed, were stored, were selectable, and were never drawn.
//
// `createFeature` stamps `layerId: activeLayerId`; the store's initial `activeLayerId` is `''`; and
// `getVisibleFeatures` drops any feature whose layer is missing (`if (!layer) return false`) — the
// same predicate behind S8c.
//
// ── THE FIRST FIX WAS WRONG, AND THAT IS THE INSTRUCTIVE PART ───────────────────────────────────
// It seeded `activeLayerId` to `layerOrder[0]`, mirroring what `newDocument()` does. `layerOrder[0]`
// is **SURVEY-INFO** — the layer carrying the title block, seal, graphic scale, north arrow, notes
// and certification, which exists so that furniture can be toggled as a unit. Seeding it would have
// quietly made the reserved layer the default target for every drawn line.
//
// So the rule is not "always have an active layer". It is **never create geometry the surveyor
// cannot see, and never choose the layer for them**: a new drawing has no active layer, and the draw
// handler refuses with a message naming the next action instead of silently orphaning the feature.

import { describe, it, expect, beforeEach } from 'vitest';
import { useDrawingStore } from '@/lib/cad/store';
import { isReservedDrawLayer, RESERVED_DRAW_LAYER_IDS, getDefaultLayerOrder } from '@/lib/cad/styles/default-layers';

describe('the reserved sheet-information layer', () => {
  it('names SURVEY-INFO as reserved', () => {
    expect(isReservedDrawLayer('SURVEY-INFO')).toBe(true);
  });

  it('does not treat ordinary drawing layers as reserved', () => {
    expect(isReservedDrawLayer('DEFAULT')).toBe(false);
    expect(isReservedDrawLayer('BOUNDARY')).toBe(false);
    expect(isReservedDrawLayer('')).toBe(false);
    expect(isReservedDrawLayer(null)).toBe(false);
  });

  it('is the layer a naive fix would have picked', () => {
    // The whole reason this test exists: layerOrder[0] IS the reserved layer, so "just default to
    // the first layer" silently makes the title-block layer the drawing target.
    expect(isReservedDrawLayer(getDefaultLayerOrder()[0])).toBe(true);
  });

  it('leaves at least one non-reserved layer available to draw on', () => {
    // If every default layer were reserved, the refusal message would be a dead end.
    const drawable = getDefaultLayerOrder().filter((id) => !isReservedDrawLayer(id));
    expect(drawable.length).toBeGreaterThan(0);
  });

  it('keeps the reserved list explicit rather than inferred from isProtected', () => {
    // isProtected means "cannot be DELETED"; reserved means "cannot be DRAWN ON". Conflating them
    // would silently change either set the moment the other list moves.
    expect([...RESERVED_DRAW_LAYER_IDS]).toEqual(['SURVEY-INFO']);
  });
});

describe('a new drawing does not choose a layer for the surveyor', () => {
  it('starts with no active layer', () => {
    // Read as imported, with no newDocument()/loadDocument() call — the state the editor mounts in.
    expect(useDrawingStore.getState().activeLayerId).toBe('');
  });
});

describe('the invariant that actually matters: a drawn feature is renderable', () => {
  beforeEach(() => { useDrawingStore.getState().newDocument(); });

  it('a feature stamped with a real layer survives getVisibleFeatures', () => {
    const st = useDrawingStore.getState();
    const drawable = st.document.layerOrder.find((id) => !isReservedDrawLayer(id))!;
    st.setActiveLayer(drawable);
    st.addFeature({
      id: 'line-1',
      type: 'LINE',
      geometry: { type: 'LINE', start: { x: 0, y: 0 }, end: { x: 100, y: 50 } },
      layerId: useDrawingStore.getState().activeLayerId,
      style: {},
      properties: {},
    } as never);
    expect(useDrawingStore.getState().getVisibleFeatures().map((f) => f.id)).toContain('line-1');
  });

  it('proves the drop is real: a feature on a non-existent layer is NOT renderable', () => {
    // Without this half, the test above would still pass if getVisibleFeatures stopped filtering —
    // which would "fix" the symptom by rendering genuinely orphaned geometry.
    const st = useDrawingStore.getState();
    st.addFeature({
      id: 'orphan-1',
      type: 'LINE',
      geometry: { type: 'LINE', start: { x: 0, y: 0 }, end: { x: 10, y: 10 } },
      layerId: '',
      style: {},
      properties: {},
    } as never);
    expect(useDrawingStore.getState().getVisibleFeatures().map((f) => f.id)).not.toContain('orphan-1');
    // …and it really is in the document, which is exactly why the canvas looked empty while Select
    // All found three lines.
    expect(useDrawingStore.getState().getFeature('orphan-1')).toBeDefined();
  });
});

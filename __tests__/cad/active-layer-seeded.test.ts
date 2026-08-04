// CAD_AUDIT Slice S13 — the first line a surveyor draws must appear on screen.
//
// Found by driving the tool palette. On a freshly opened `/admin/cad`, drawing a line produced the
// live length/bearing readout, committed a feature — and rendered nothing. Select All then reported
// "3 SELECTED — Editing 3 lines together" over an empty canvas.
//
// The cause is one line. `createFeature` stamps `layerId: activeLayerId`, and the store's INITIAL
// state hardcoded `activeLayerId: ''`, so every feature landed on a layer that does not exist, and
// `getVisibleFeatures` drops exactly those (`if (!layer) return false`).
//
// What makes this worth a regression test rather than a one-line fix: **the bug was already known
// and already fixed — in the wrong places.** `newDocument()` carries a comment from
// `cad-domain-audit` Slice D saying that leaving the active layer empty orphans the first geometry
// the surveyor places. That fix went into `newDocument` and `loadDocument`, and not into the
// initial state — which is the path that runs when you just open the editor, i.e. the most common
// entry point in the program. A fix applied to the derived paths and not the default one is the
// shape this test exists to catch.

import { describe, it, expect, beforeEach } from 'vitest';
import { useDrawingStore } from '@/lib/cad/store';

describe('a drawing always has somewhere to put geometry', () => {
  it('seeds an active layer on the store default, before any document action runs', () => {
    // Deliberately reads the store as imported, with no newDocument()/loadDocument() call — that is
    // precisely the state the editor mounts in.
    const st = useDrawingStore.getState();
    expect(st.activeLayerId).not.toBe('');
    expect(st.document.layers[st.activeLayerId]).toBeDefined();
  });

  it('keeps the active layer real after newDocument()', () => {
    useDrawingStore.getState().newDocument();
    const st = useDrawingStore.getState();
    expect(st.document.layers[st.activeLayerId]).toBeDefined();
  });
});

describe('the invariant that actually matters: a drawn feature is renderable', () => {
  beforeEach(() => { useDrawingStore.getState().newDocument(); });

  it('a feature stamped with the active layer survives getVisibleFeatures', () => {
    // This is the end-to-end statement of the bug: the draw path stamps `layerId: activeLayerId`,
    // and the render path drops any feature whose layer is missing. Asserting the two agree is
    // stronger than asserting either one in isolation, and it is what was false before.
    const st = useDrawingStore.getState();
    st.addFeature({
      id: 'line-1',
      type: 'LINE',
      geometry: { type: 'LINE', start: { x: 0, y: 0 }, end: { x: 100, y: 50 } },
      layerId: st.activeLayerId,
      style: {},
      properties: {},
    } as never);
    const visible = useDrawingStore.getState().getVisibleFeatures();
    expect(visible.map((f) => f.id)).toContain('line-1');
  });

  it('proves the drop is real: a feature on a non-existent layer is NOT renderable', () => {
    // The other half. Without this, the test above would still pass if `getVisibleFeatures` stopped
    // filtering at all — which would "fix" the symptom by rendering genuinely orphaned geometry.
    const st = useDrawingStore.getState();
    st.addFeature({
      id: 'orphan-1',
      type: 'LINE',
      geometry: { type: 'LINE', start: { x: 0, y: 0 }, end: { x: 10, y: 10 } },
      layerId: '',
      style: {},
      properties: {},
    } as never);
    const visible = useDrawingStore.getState().getVisibleFeatures();
    expect(visible.map((f) => f.id)).not.toContain('orphan-1');
    // …and it really is in the document, which is why the canvas looked empty while Select All
    // found three lines.
    expect(useDrawingStore.getState().getFeature('orphan-1')).toBeDefined();
  });
});

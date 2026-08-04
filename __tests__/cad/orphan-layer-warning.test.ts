// CAD_AUDIT Slice S13d — adding a feature to a layer that does not exist is now loud.
//
// This exact defect cost two separate slices in one session, at two unrelated call sites:
//
//   * S8c — the research import created features on RESEARCH_BOUNDARY before that layer existed.
//     The dialog said "3 feature(s) will be added", they were added, the canvas stayed empty.
//   * S13 — a new drawing had activeLayerId: '', so everything a surveyor drew landed on
//     layerId: ''. Length and bearing were computed correctly and shown live; Select All found three
//     lines; nothing was ever drawn.
//
// Same shape, invisible for the same reason: `getVisibleFeatures` drops a feature whose layer is
// missing, SILENTLY. That is correct for the renderer and a terrible diagnostic for everyone else —
// the feature exists, is selectable, is saved, and cannot be seen, and the only symptom is an empty
// canvas, which reads as "the tool did nothing".

import { describe, it, expect, beforeEach } from 'vitest';
import {
  useDrawingStore, __orphanWarnings, __resetOrphanWarnings,
} from '@/lib/cad/store/drawing-store';
import { isReservedDrawLayer } from '@/lib/cad/styles/default-layers';

const feature = (id: string, layerId: string) => ({
  id,
  type: 'LINE',
  geometry: { type: 'LINE', start: { x: 0, y: 0 }, end: { x: 1, y: 1 } },
  layerId,
  style: {},
  properties: {},
}) as never;

beforeEach(() => {
  useDrawingStore.getState().newDocument();
  __resetOrphanWarnings();
});

describe('it fires on the two shapes that actually happened', () => {
  it('warns for the empty layerId — the S13 case', () => {
    useDrawingStore.getState().addFeature(feature('a', ''));
    const w = __orphanWarnings().join('\n');
    expect(w).toContain('(empty string)');
    expect(w).toMatch(/NEVER RENDERED/);
  });

  it('warns for a named layer that has not been created — the S8c case', () => {
    useDrawingStore.getState().addFeatures([feature('b', 'RESEARCH_BOUNDARY')]);
    expect(__orphanWarnings().join('\n')).toContain('RESEARCH_BOUNDARY');
  });

  it('names the origin so the offending call site is obvious', () => {
    useDrawingStore.getState().addFeature(feature('c', 'NOPE'));
    expect(__orphanWarnings()[0]).toContain('addFeature');
    __resetOrphanWarnings();
    useDrawingStore.getState().addFeatures([feature('d', 'NOPE')]);
    expect(__orphanWarnings()[0]).toContain('addFeatures');
  });

  it('says what to do about it', () => {
    // A warning that names a problem without a next step gets muted rather than fixed.
    useDrawingStore.getState().addFeature(feature('e', 'NOPE'));
    expect(__orphanWarnings()[0]).toMatch(/Create the layer first|valid active layer/);
  });
});

describe('it does not cry wolf', () => {
  it('stays silent for a feature on a real layer', () => {
    const st = useDrawingStore.getState();
    const drawable = st.document.layerOrder.find((id) => !isReservedDrawLayer(id))!;
    st.addFeature(feature('ok', drawable));
    expect(__orphanWarnings()).toEqual([]);
  });

  it('stays silent for an empty batch', () => {
    useDrawingStore.getState().addFeatures([]);
    expect(__orphanWarnings()).toEqual([]);
  });

  it('reports each missing layer once, however many features reference it', () => {
    // Twenty features on one absent layer is one mistake, not twenty. A warning that scrolls the
    // console is a warning people turn off.
    useDrawingStore.getState().addFeatures([
      feature('x', 'GHOST'), feature('y', 'GHOST'), feature('z', 'GHOST'),
    ]);
    expect(__orphanWarnings()).toHaveLength(1);
    expect((__orphanWarnings()[0].match(/GHOST/g) ?? []).length).toBe(1);
  });
});

describe('it warns without blocking', () => {
  it('still stores the feature', () => {
    // A store that REFUSED would turn a rendering bug into lost work, and a legitimate flow may add
    // the layer a moment later. Warn, do not block.
    useDrawingStore.getState().addFeature(feature('kept', 'GHOST'));
    expect(useDrawingStore.getState().getFeature('kept')).toBeDefined();
  });

  it('and the feature becomes visible once the layer arrives', () => {
    // The whole point: the warning describes a recoverable state, not a corrupted one.
    const st = useDrawingStore.getState();
    st.addFeature(feature('late', 'LATE_LAYER'));
    expect(st.getVisibleFeatures().map((f) => f.id)).not.toContain('late');
    st.addLayer({
      id: 'LATE_LAYER', name: 'Late', visible: true, locked: false, frozen: false,
      color: '#000', lineWeight: 0.5, lineTypeId: 'SOLID', opacity: 1, groupId: null,
      sortOrder: 99, isDefault: false, isProtected: false, autoAssignCodes: [],
    });
    expect(useDrawingStore.getState().getVisibleFeatures().map((f) => f.id)).toContain('late');
  });
});

// ── S13g: the sixth and last way in — MOVING a feature to a layer that does not exist ────────────
//
// `updateFeature` accepted any `layerId` unchecked, and the Properties panel's "Move all to layer"
// writes exactly that field. A stale id in a dropdown, or any programmatic move, made the geometry
// vanish with no error and no way to tell it apart from a delete.

describe('moving a feature to a layer that does not exist', () => {
  it('warns, naming updateFeature as the origin', () => {
    const st = useDrawingStore.getState();
    const drawable = st.document.layerOrder.find((id) => !isReservedDrawLayer(id))!;
    st.addFeature(feature('mover', drawable));
    __resetOrphanWarnings();

    useDrawingStore.getState().updateFeature('mover', { layerId: 'NO_SUCH_LAYER' } as never);

    const w = __orphanWarnings().join('\n');
    expect(w).toContain('NO_SUCH_LAYER');
    expect(w).toContain('updateFeature');
  });

  it('stays silent when moving to a real layer', () => {
    const st = useDrawingStore.getState();
    const layers = st.document.layerOrder.filter((id) => !isReservedDrawLayer(id));
    st.addFeature(feature('ok-move', layers[0]));
    __resetOrphanWarnings();
    useDrawingStore.getState().updateFeature('ok-move', { layerId: layers[0] } as never);
    expect(__orphanWarnings()).toEqual([]);
  });

  it('does not check updates that leave the layer alone', () => {
    // The overwhelming majority of updates change style or geometry. A check that costs something on
    // every mutation is a check someone eventually removes.
    const st = useDrawingStore.getState();
    const drawable = st.document.layerOrder.find((id) => !isReservedDrawLayer(id))!;
    st.addFeature(feature('styled', drawable));
    __resetOrphanWarnings();
    useDrawingStore.getState().updateFeature('styled', { style: { color: '#ff0000' } } as never);
    expect(__orphanWarnings()).toEqual([]);
  });

  it('still performs the move, so the state stays recoverable', () => {
    // Same rule as every other site in this family: warn, do not block. Refusing would strand the
    // feature on its old layer while the UI reported a move.
    const st = useDrawingStore.getState();
    const drawable = st.document.layerOrder.find((id) => !isReservedDrawLayer(id))!;
    st.addFeature(feature('moved', drawable));
    useDrawingStore.getState().updateFeature('moved', { layerId: 'GHOST_LAYER' } as never);
    expect(useDrawingStore.getState().getFeature('moved')!.layerId).toBe('GHOST_LAYER');
  });
});

// ── The collector itself must not leak ───────────────────────────────────────────────────────────
//
// This array started unbounded — a memory leak introduced by the very slice that made orphaned
// features loud, in the same session as S15's leak ratchet. That ratchet could never have caught it:
// it counts addEventListener against removeEventListener and createObjectURL against
// revokeObjectURL, and an array that only ever grows matches no pair.

describe('the warning collector is bounded', () => {
  it('does not grow without limit under a repeated orphan condition', () => {
    // The realistic shape: a loop that keeps re-adding a feature whose layer never arrives.
    for (let i = 0; i < 300; i++) {
      useDrawingStore.getState().addFeature(feature(`leak-${i}`, 'STILL_MISSING'));
    }
    expect(__orphanWarnings().length).toBeLessThanOrEqual(50);
  });

  it('keeps the MOST RECENT warnings, not the first', () => {
    // When this fires in a loop, the latest occurrence is the one being debugged; the first fifty
    // of an ongoing loop all say the same thing.
    for (let i = 0; i < 60; i++) {
      useDrawingStore.getState().addFeature(feature(`seq-${i}`, `LAYER_${i}`));
    }
    const all = __orphanWarnings().join('\n');
    expect(all).toContain('LAYER_59');
    expect(all).not.toContain('LAYER_0.');
  });
});

// ── S13m: the reserved layer is caught at the STORE, not only at fourteen UI filters ─────────────
//
// This guard checked only `!document.layers[id]`, and SURVEY-INFO exists — so geometry written onto
// the reserved sheet-info layer passed silently. The fourteen UI filters found across S13h-S13l were
// the entire defence, and a fifteenth surface would have bypassed all of them.
//
// Fourteen sites, five rounds, three false claims that the last one had been found. A rule enforced
// only at the edges holds until someone adds an edge.

describe('geometry written to the reserved layer is flagged', () => {
  const RESERVED = 'SURVEY-INFO';

  it('warns on addFeature, even though the layer EXISTS', () => {
    // The distinction that made this invisible: it is not a missing layer, it is a real one that
    // geometry may not live on.
    expect(useDrawingStore.getState().document.layers[RESERVED]).toBeDefined();
    useDrawingStore.getState().addFeature(feature('on-reserved', RESERVED));
    const w = __orphanWarnings().join('\n');
    expect(w).toContain(RESERVED);
    expect(w).toMatch(/reserved layer/i);
  });

  it('warns on a MOVE onto it', () => {
    const st = useDrawingStore.getState();
    const drawable = st.document.layerOrder.find((id) => !isReservedDrawLayer(id))!;
    st.addFeature(feature('moving', drawable));
    __resetOrphanWarnings();
    useDrawingStore.getState().updateFeature('moving', { layerId: RESERVED } as never);
    expect(__orphanWarnings().join('\n')).toMatch(/reserved layer/i);
  });

  it('explains the consequence, not just the rule', () => {
    // "You can't do that" without "because it vanishes when the furniture is hidden" is a rule
    // people route around.
    useDrawingStore.getState().addFeature(feature('why', RESERVED));
    expect(__orphanWarnings()[0]).toMatch(/sheet furniture is hidden|toggled as a unit/i);
  });

  it('stays silent for a normal drawing layer', () => {
    const st = useDrawingStore.getState();
    const drawable = st.document.layerOrder.find((id) => !isReservedDrawLayer(id))!;
    st.addFeature(feature('fine', drawable));
    expect(__orphanWarnings()).toEqual([]);
  });

  it('still stores the feature — warn, do not block', () => {
    // Same rule as every other site in this family. Refusing would lose work over a placement
    // problem the surveyor can fix in one move.
    useDrawingStore.getState().addFeature(feature('kept-reserved', RESERVED));
    expect(useDrawingStore.getState().getFeature('kept-reserved')).toBeDefined();
  });
});

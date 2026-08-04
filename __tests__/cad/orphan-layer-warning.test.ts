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

// CAD_AUDIT Slice S13f — opening a saved drawing lands you on a layer you can draw on.
//
// Fifth hiding place for one bug class. `loadDocument` set `activeLayerId: doc.layerOrder[0]`, and
// `layerOrder[0]` is SURVEY-INFO on every document shaped like the default one — so opening a saved
// drawing made the reserved title-block layer active, and the first thing a surveyor did was get
// refused by S13's draw guard, on a drawing they had just opened, with no indication of why.
//
// The second half is the one that loses work quietly: a saved file can carry features whose layer is
// not in the file (an older format, a hand-edited .starr, a partial recovery snapshot). They load,
// save again, and are never drawn — presenting as "some of my drawing is missing" with nothing to
// point at. The insertion-time warning from S13d cannot see it, because loading is not an insertion.

import { describe, it, expect, beforeEach } from 'vitest';
import {
  useDrawingStore, __orphanWarnings, __resetOrphanWarnings,
} from '@/lib/cad/store/drawing-store';
import { isReservedDrawLayer } from '@/lib/cad/styles/default-layers';

const layer = (id: string, name = id) => ({
  id, name, visible: true, locked: false, frozen: false,
  color: '#000000', lineWeight: 0.5, lineTypeId: 'SOLID', opacity: 1,
  groupId: null, sortOrder: 0, isDefault: false, isProtected: false, autoAssignCodes: [],
});

const feature = (id: string, layerId: string) => ({
  id, type: 'LINE',
  geometry: { type: 'LINE', start: { x: 0, y: 0 }, end: { x: 1, y: 1 } },
  layerId, style: {}, properties: {},
});

const docWith = (layerIds: string[], features: Record<string, unknown> = {}) => ({
  id: 'doc', name: 'Saved', created: '', modified: '', author: '',
  features,
  layers: Object.fromEntries(layerIds.map((id) => [id, layer(id)])),
  layerOrder: layerIds,
  featureGroups: {}, layerGroups: {}, layerGroupOrder: [],
  customSymbols: [], customLineTypes: [], codeStyleOverrides: {},
  globalStyleConfig: {}, projectImages: {}, settings: {},
}) as never;

beforeEach(() => { __resetOrphanWarnings(); });

describe('the active layer after opening a file', () => {
  it('is a layer the surveyor can actually draw on', () => {
    // The bug: SURVEY-INFO is layerOrder[0], so this used to activate the reserved layer and the
    // very next draw attempt was refused.
    useDrawingStore.getState().loadDocument(docWith(['SURVEY-INFO', 'DEFAULT']));
    const active = useDrawingStore.getState().activeLayerId;
    expect(active).toBe('DEFAULT');
    expect(isReservedDrawLayer(active)).toBe(false);
  });

  it('picks the first drawable layer even when several follow the reserved one', () => {
    useDrawingStore.getState().loadDocument(docWith(['SURVEY-INFO', 'BOUNDARY', 'TOPO']));
    expect(useDrawingStore.getState().activeLayerId).toBe('BOUNDARY');
  });

  it('falls back to the reserved layer only when there is nothing else', () => {
    // Not ideal, but the guard refuses the draw and explains why — better than an empty id, which
    // produces a less specific message.
    useDrawingStore.getState().loadDocument(docWith(['SURVEY-INFO']));
    expect(useDrawingStore.getState().activeLayerId).toBe('SURVEY-INFO');
  });

  it('leaves the active layer empty for a document with no layers at all', () => {
    useDrawingStore.getState().loadDocument(docWith([]));
    expect(useDrawingStore.getState().activeLayerId).toBe('');
  });
});

describe('a saved file carrying features whose layer is missing', () => {
  it('warns on load, naming the layer', () => {
    useDrawingStore.getState().loadDocument(
      docWith(['SURVEY-INFO', 'DEFAULT'], { f1: feature('f1', 'DELETED_LAYER') }),
    );
    const w = __orphanWarnings().join('\n');
    expect(w).toContain('DELETED_LAYER');
    expect(w).toContain('loadDocument');
    expect(w).toMatch(/NEVER RENDERED/);
  });

  it('still loads the document rather than refusing it', () => {
    // Refusing to open a drawing because part of it is unrenderable would turn a display problem
    // into lost access to everything else in the file.
    useDrawingStore.getState().loadDocument(
      docWith(['DEFAULT'], { good: feature('good', 'DEFAULT'), bad: feature('bad', 'GONE') }),
    );
    const st = useDrawingStore.getState();
    expect(st.getFeature('good')).toBeDefined();
    expect(st.getFeature('bad')).toBeDefined();
    // …and it is honest about which one can be seen.
    expect(st.getVisibleFeatures().map((f) => f.id)).toEqual(['good']);
  });

  it('stays silent for a clean file', () => {
    // A warning that fires on healthy documents is one people stop reading.
    useDrawingStore.getState().loadDocument(
      docWith(['DEFAULT'], { ok: feature('ok', 'DEFAULT') }),
    );
    expect(__orphanWarnings()).toEqual([]);
  });
});

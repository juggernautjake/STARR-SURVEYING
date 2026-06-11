// __tests__/cad/feature-fields-canonical-name.test.ts
//
// cad-domain-audit Slice N — `pointName` is the canonical key going
// forward. The pure `canonicalizePointName` helper backfills it from
// the legacy aliases (`pointNo` / `pointNumber` / `name`) when
// missing, and the drawing-store `loadDocument` action calls it on
// every POINT feature so saved documents normalise on open. The
// read order in `pointNumberOf` is unchanged for back-compat
// (`pointNo > pointNumber > pointName > name`) — pre-canonical
// writers (e.g. renumber) keep working until they migrate.

import { describe, it, expect } from 'vitest';
import {
  canonicalizePointName,
  CANONICAL_POINT_NAME_KEY,
  pointNumberOf,
} from '@/lib/cad/feature-fields';
import { useDrawingStore } from '@/lib/cad/store/drawing-store';
import type { DrawingDocument, Feature, Layer } from '@/lib/cad/types';

describe('CANONICAL_POINT_NAME_KEY', () => {
  it('is the literal "pointName"', () => {
    expect(CANONICAL_POINT_NAME_KEY).toBe('pointName');
  });
});

describe('canonicalizePointName — backfill the canonical key', () => {
  it('returns the input unchanged when pointName is already populated', () => {
    const props = { pointName: '101', pointNo: '999' };
    expect(canonicalizePointName(props)).toBe(props);
  });

  it('copies pointNo → pointName when pointName is missing', () => {
    const out = canonicalizePointName({ pointNo: '101' });
    expect(out).toEqual({ pointNo: '101', pointName: '101' });
  });

  it('copies pointNumber → pointName when pointName + pointNo are missing', () => {
    const out = canonicalizePointName({ pointNumber: '102' });
    expect(out).toEqual({ pointNumber: '102', pointName: '102' });
  });

  it('falls back to `name` when every other alias is missing', () => {
    const out = canonicalizePointName({ name: 'IRF' });
    expect(out).toEqual({ name: 'IRF', pointName: 'IRF' });
  });

  it('legacy priority: pointNo wins over pointNumber when both exist', () => {
    const out = canonicalizePointName({ pointNo: '101', pointNumber: '999' });
    expect(out?.pointName).toBe('101');
  });

  it('returns the input unchanged when no alias is set', () => {
    const props = { description: 'IRF' };
    expect(canonicalizePointName(props)).toBe(props);
  });

  it('whitespace-only legacy value is treated as missing', () => {
    expect(canonicalizePointName({ pointNo: '   ' })).toEqual({ pointNo: '   ' });
  });

  it('null / undefined properties pass through harmlessly', () => {
    expect(canonicalizePointName(undefined)).toBeUndefined();
    expect(canonicalizePointName(null)).toBeUndefined();
  });
});

describe('drawingStore.loadDocument — canonicalises POINT features on open', () => {
  function layer(id: string): Layer {
    return {
      id, name: id, visible: true, locked: false, frozen: false, color: '#000',
      lineWeight: 0.75, lineTypeId: 'SOLID', opacity: 1, groupId: null,
      sortOrder: 0, isDefault: false, isProtected: false, autoAssignCodes: [],
    };
  }
  function pt(id: string, props: Record<string, string | number | boolean>): Feature {
    return {
      id, type: 'POINT', geometry: { type: 'POINT', point: { x: 0, y: 0 } },
      layerId: 'L', style: {} as Feature['style'], properties: props,
    } as Feature;
  }

  function loadDoc(features: Feature[]) {
    const fmap: Record<string, Feature> = {};
    for (const f of features) fmap[f.id] = f;
    const doc = {
      id: 'd', name: 'd', created: '', modified: '', author: '',
      features: fmap, layers: { L: layer('L') }, layerOrder: ['L'],
      featureGroups: {}, layerGroups: {}, layerGroupOrder: [],
      customSymbols: [], customLineTypes: [], codeStyleOverrides: {},
      globalStyleConfig: {}, projectImages: {},
      settings: { displayPreferences: { originNorthing: 0, originEasting: 0 } },
    } as unknown as DrawingDocument;
    useDrawingStore.getState().loadDocument(doc);
  }

  it('points stored under a legacy key get `pointName` populated on load', () => {
    loadDoc([pt('p1', { pointNo: '101' }), pt('p2', { name: 'IRF' })]);
    const live = useDrawingStore.getState().document.features;
    expect(live.p1.properties.pointName).toBe('101');
    expect(live.p2.properties.pointName).toBe('IRF');
  });

  it('points that already carry `pointName` are untouched', () => {
    loadDoc([pt('p1', { pointName: '101', pointNo: '999' })]);
    const live = useDrawingStore.getState().document.features;
    // The original property object survives (legacy keys preserved).
    expect(live.p1.properties.pointName).toBe('101');
    expect(live.p1.properties.pointNo).toBe('999');
    // Reads still resolve through the historical priority chain so
    // pre-canonical writers (e.g. the renumber operation) keep their
    // authoritative position.
    expect(pointNumberOf(live.p1)).toBe('999');
  });

  it('non-POINT features are left alone (no spurious property rewrites)', () => {
    const lineFeat: Feature = {
      id: 'l1', type: 'LINE',
      geometry: { type: 'LINE', start: { x: 0, y: 0 }, end: { x: 1, y: 1 } },
      layerId: 'L', style: {} as Feature['style'],
      properties: { pointNo: 'ignored' },
    } as Feature;
    loadDoc([lineFeat]);
    const live = useDrawingStore.getState().document.features;
    expect(live.l1.properties.pointName).toBeUndefined();
  });
});

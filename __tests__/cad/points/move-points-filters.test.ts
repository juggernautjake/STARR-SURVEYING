// __tests__/cad/points/move-points-filters.test.ts
//
// cad-ux-cleanup-pass Slice 3 — pure helpers for the "Move points
// into this layer" search + source filter. The dialog used to do a
// single substring match (so commas killed multi-name searches) and
// always pulled from every layer (so duplicate-layer copies snuck in
// alongside their canonical originals). The new helpers split the
// query on commas (OR semantics) and gate the source pool on
// `MASTER_ONLY` vs `ALL_LAYERS`.

import { describe, it, expect } from 'vitest';
import {
  filterMovePointRows,
  isMasterPointRow,
  matchesQueryTokens,
  tokenizeSearch,
} from '@/lib/cad/points/move-points-filters';
import type { DrawingDocument, Feature, Layer } from '@/lib/cad/types';
import type { PointRow } from '@/lib/cad/points/point-rows';

function row(over: Partial<PointRow>): PointRow {
  return {
    id: 'pt',
    name: '',
    code: '',
    description: '',
    northing: 0,
    easting: 0,
    elevation: null,
    layerId: 'L',
    editable: true,
    ...over,
  };
}

function layer(id: string, over: Partial<Layer> = {}): Layer {
  return {
    id, name: id, visible: true, locked: false, frozen: false,
    color: '#000', lineWeight: 0.25, lineTypeId: 'SOLID', opacity: 1,
    groupId: null, sortOrder: 0, isDefault: false, isProtected: false,
    autoAssignCodes: [],
    ...over,
  };
}

function feature(id: string, over: Partial<Feature> = {}): Feature {
  return {
    id,
    type: 'POINT',
    geometry: { type: 'POINT', point: { x: 0, y: 0 } },
    layerId: 'L',
    style: {
      color: null, lineWeight: null, opacity: 1, lineTypeId: null,
      symbolId: null, symbolSize: null, symbolRotation: 0,
      labelVisible: null, labelFormat: null, labelOffset: { x: 0, y: 0 },
      isOverride: false,
    },
    properties: {},
    ...over,
  };
}

describe('tokenizeSearch', () => {
  it('splits on commas, trims whitespace, lowercases', () => {
    expect(tokenizeSearch('22fnd, IRF , 308')).toEqual(['22fnd', 'irf', '308']);
  });

  it('drops empty tokens (trailing comma, double comma, all whitespace)', () => {
    expect(tokenizeSearch('22fnd,,  ,IRF,')).toEqual(['22fnd', 'irf']);
  });

  it('empty / all-whitespace query → empty token list', () => {
    expect(tokenizeSearch('')).toEqual([]);
    expect(tokenizeSearch('   ')).toEqual([]);
    expect(tokenizeSearch(', , ,')).toEqual([]);
  });

  it('a single token is returned without commas', () => {
    expect(tokenizeSearch('IRF')).toEqual(['irf']);
  });
});

describe('matchesQueryTokens', () => {
  it('empty token list matches every row', () => {
    expect(matchesQueryTokens(row({ name: '8' }), 'NAME', [])).toBe(true);
  });

  it('NAME field: matches when any token is a substring of the row name', () => {
    expect(matchesQueryTokens(row({ name: '22fnd' }), 'NAME', ['nope', '22f'])).toBe(true);
    expect(matchesQueryTokens(row({ name: 'IRF' }), 'NAME', ['nope', 'else'])).toBe(false);
  });

  it('CODE field: substring match against row.code, ignores name', () => {
    expect(matchesQueryTokens(row({ code: 'BC03', name: 'NeverMatched' }), 'CODE', ['bc'])).toBe(true);
    expect(matchesQueryTokens(row({ code: 'XX' }), 'CODE', ['bc'])).toBe(false);
  });

  it('CODE field: also matches the description, not just the code', () => {
    // A token that only appears in the description still matches under CODE.
    expect(matchesQueryTokens(row({ code: 'IRF', description: 'found, fence corner' }), 'CODE', ['fence'])).toBe(true);
    // Still false when the token is in neither code nor description.
    expect(matchesQueryTokens(row({ code: 'IRF', description: 'found, fence corner' }), 'CODE', ['curb'])).toBe(false);
    // NAME stays name-only — a description-only token must NOT match.
    expect(matchesQueryTokens(row({ name: 'P1', description: 'fence corner' }), 'NAME', ['fence'])).toBe(false);
  });
});

describe('isMasterPointRow', () => {
  function doc(layers: Layer[], features: Feature[]): DrawingDocument {
    return {
      layers: Object.fromEntries(layers.map((l) => [l.id, l])),
      features: Object.fromEntries(features.map((f) => [f.id, f])),
    } as unknown as DrawingDocument;
  }

  it('canonical layer + no mirror flag → master', () => {
    const d = doc([layer('L')], [feature('p1', { layerId: 'L' })]);
    expect(isMasterPointRow(row({ id: 'p1', layerId: 'L' }), d)).toBe(true);
  });

  it('layer carries duplicateOf → NOT master', () => {
    const d = doc([layer('L'), layer('Ldup', { duplicateOf: 'L' })], [feature('p1', { layerId: 'Ldup' })]);
    expect(isMasterPointRow(row({ id: 'p1', layerId: 'Ldup' }), d)).toBe(false);
  });

  it('feature carries trvPointMirror → NOT master even if layer is canonical', () => {
    const d = doc(
      [layer('L')],
      [feature('p1', { layerId: 'L', properties: { trvPointMirror: true } })],
    );
    expect(isMasterPointRow(row({ id: 'p1', layerId: 'L' }), d)).toBe(false);
  });
});

describe('filterMovePointRows', () => {
  const layers: Layer[] = [layer('L'), layer('Ldup', { duplicateOf: 'L' })];
  const features: Feature[] = [
    feature('p1', { layerId: 'L', properties: { pointName: '22fnd' } }),
    feature('p2', { layerId: 'L', properties: { pointName: 'IRF' } }),
    feature('p3', { layerId: 'Ldup', properties: { pointName: '22fnd' } }),
    feature('p4', { layerId: 'L', properties: { pointName: 'CTRL', trvPointMirror: true } }),
  ];
  const doc = {
    layers: Object.fromEntries(layers.map((l) => [l.id, l])),
    features: Object.fromEntries(features.map((f) => [f.id, f])),
  } as unknown as DrawingDocument;

  const rows: PointRow[] = [
    row({ id: 'p1', name: '22fnd', layerId: 'L' }),
    row({ id: 'p2', name: 'IRF',   layerId: 'L' }),
    row({ id: 'p3', name: '22fnd', layerId: 'Ldup' }),
    row({ id: 'p4', name: 'CTRL',  layerId: 'L' }),
  ];

  it('MASTER_ONLY excludes duplicate-layer + mirror rows', () => {
    const out = filterMovePointRows(rows, doc, { query: '', field: 'NAME', sourceMode: 'MASTER_ONLY' });
    expect(out.map((r) => r.id)).toEqual(['p1', 'p2']);
  });

  it('ALL_LAYERS keeps every row', () => {
    const out = filterMovePointRows(rows, doc, { query: '', field: 'NAME', sourceMode: 'ALL_LAYERS' });
    expect(out.map((r) => r.id)).toEqual(['p1', 'p2', 'p3', 'p4']);
  });

  it('comma multi-search ORs the tokens, still respects MASTER_ONLY', () => {
    const out = filterMovePointRows(rows, doc, {
      query: '22fnd, IRF',
      field: 'NAME',
      sourceMode: 'MASTER_ONLY',
    });
    expect(out.map((r) => r.id)).toEqual(['p1', 'p2']);
  });

  it('preserves the row order from the input list', () => {
    const out = filterMovePointRows(rows, doc, { query: 'IRF, 22', field: 'NAME', sourceMode: 'ALL_LAYERS' });
    expect(out.map((r) => r.id)).toEqual(['p1', 'p2', 'p3']);
  });
});

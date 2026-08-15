// C36 — measurement and the LIST command become AI-callable.
//
// ── WHAT WAS MISSING ────────────────────────────────────────────────────────────────────────────
//
// "AI fully integrated with all tools and measurements" was the ask. The registry could already
// inverse between two points, and that was the whole of it: the AI could not answer "how big is
// this parcel" or "how long is that fence" about geometry already on the drawing. It could only
// compute from numbers it was handed.
//
// These are READ-ONLY, a category the registry has not had. Nothing here writes, pushes undo, or
// needs a sandbox — worth stating rather than leaving implied, because a measurement tool that
// quietly modified something would be the least expected failure in the whole registry.

import { describe, it, expect, beforeEach } from 'vitest';

import {
  toolRegistry,
  measureFeature,
  measureTotalArea,
  describeFeature,
} from '@/lib/cad/ai/tool-registry';
import { aiCapabilities } from '@/lib/cad/ai/capabilities';
import { useDrawingStore, useUndoStore } from '@/lib/cad/store';
import { stampDerivation } from '@/lib/cad/derivation';
import { DEFAULT_FEATURE_STYLE } from '@/lib/cad/constants';
import type { Feature, FeatureGeometry } from '@/lib/cad/types';

const mk = (id: string, geometry: FeatureGeometry, type: Feature['type'], props = {}): Feature => ({
  id, type, geometry, layerId: 'L1',
  style: { ...DEFAULT_FEATURE_STYLE },
  properties: props,
});

/** 100 × 50 rectangle = 5,000 sq ft, perimeter 300. */
const RECT = mk('rect', {
  type: 'POLYGON',
  vertices: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }, { x: 0, y: 50 }],
}, 'POLYGON');

/** Same four corners as an OPEN polyline — three sides, 250 ft, no area. */
const OPEN = mk('open', {
  type: 'POLYLINE',
  vertices: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }, { x: 0, y: 50 }],
}, 'POLYLINE');

const LINE = mk('line', {
  type: 'LINE', start: { x: 0, y: 0 }, end: { x: 30, y: 40 },
}, 'LINE');

beforeEach(() => {
  useDrawingStore.setState((s) => ({
    document: {
      ...s.document,
      features: { rect: RECT, open: OPEN, line: LINE },
      layers: {
        L1: {
          id: 'L1', name: 'BOUNDARY', visible: true, locked: false, frozen: false,
          color: '#000', lineWeight: 0.75, lineTypeId: 'SOLID', opacity: 1,
          groupId: null, sortOrder: 0, isDefault: false, isProtected: false, autoAssignCodes: [],
        },
      },
      layerOrder: ['L1'],
    },
    activeLayerId: 'L1',
  }));
  useUndoStore.setState({ undoStack: [], redoStack: [] } as never);
});

const ok = <T,>(r: { ok: boolean; result?: T; reason?: string }): T => {
  expect(r.ok, r.reason).toBe(true);
  return r.result as T;
};

describe('measureFeature', () => {
  it('measures a closed shape', () => {
    const m = ok(measureFeature.execute({ id: 'rect' }));
    expect(m.areaSquareFeet).toBeCloseTo(5000, 6);
    expect(m.areaAcres).toBeCloseTo(5000 / 43560, 9);
    expect(m.lengthFeet).toBeCloseTo(300, 6);
    expect(m.layer).toBe('BOUNDARY');
  });

  it('reports NULL area for an open shape, not zero', () => {
    // Zero is a legitimate measurement. "This has no area" is a different statement, and a model
    // handed 0 will happily add it into a total.
    const m = ok(measureFeature.execute({ id: 'open' }));
    expect(m.areaSquareFeet).toBeNull();
    expect(m.areaAcres).toBeNull();
  });

  it('closes a POLYGON’s perimeter but not a POLYLINE’s run', () => {
    // The same four vertices: 300 closed, 250 open. Measuring both the same way is the difference
    // between a perimeter and a perimeter minus one side, which on a five-sided tract is a number
    // that still looks entirely plausible.
    expect(ok(measureFeature.execute({ id: 'rect' })).lengthFeet).toBeCloseTo(300, 6);
    expect(ok(measureFeature.execute({ id: 'open' })).lengthFeet).toBeCloseTo(250, 6);
  });

  it('measures a line', () => {
    expect(ok(measureFeature.execute({ id: 'line' })).lengthFeet).toBeCloseTo(50, 9);
  });

  it('measures a parametric circle as a circle', () => {
    // Circumference, not the perimeter of an approximating polygon — the C34 point, seen from the
    // measuring end.
    useDrawingStore.setState((s) => ({
      document: {
        ...s.document,
        features: {
          ...s.document.features,
          circ: mk('circ', { type: 'POLYGON', circle: { center: { x: 0, y: 0 }, radius: 10 } }, 'POLYGON'),
        },
      },
    }));
    const m = ok(measureFeature.execute({ id: 'circ' }));
    expect(m.lengthFeet).toBeCloseTo(2 * Math.PI * 10, 6);
    expect(m.areaSquareFeet).toBeCloseTo(Math.PI * 100, 4);
  });

  it('refuses a feature that does not exist', () => {
    expect(measureFeature.execute({ id: 'ghost' }).ok).toBe(false);
  });
});

describe('measureTotalArea', () => {
  it('adds up the closed ones', () => {
    const t = ok(measureTotalArea.execute({ ids: ['rect'] }));
    expect(t.squareFeet).toBeCloseTo(5000, 6);
    expect(t.acres).toBeCloseTo(5000 / 43560, 9);
    expect(t.counted).toBe(1);
  });

  it('REPORTS open features as skipped rather than counting them as zero', () => {
    // A total that silently absorbs three open polylines is a number the surveyor cannot reconcile
    // against the drawing — and it is wrong in the safe-looking direction: smaller, and still
    // plausible.
    const t = ok(measureTotalArea.execute({ ids: ['rect', 'open', 'line'] }));
    expect(t.counted).toBe(1);
    expect(t.skipped.sort()).toEqual(['line', 'open']);
    expect(t.squareFeet).toBeCloseTo(5000, 6);
  });

  it('refuses when any id is missing', () => {
    // Same all-or-nothing reasoning as C35: a total quietly missing one parcel is worse than no
    // total.
    expect(measureTotalArea.execute({ ids: ['rect', 'ghost'] }).ok).toBe(false);
  });

  it('refuses an empty list', () => {
    expect(measureTotalArea.execute({ ids: [] }).ok).toBe(false);
  });
});

describe('describeFeature — the LIST equivalent', () => {
  it('reports identity, layer and measurement together', () => {
    const d = ok(describeFeature.execute({ id: 'rect' })) as Record<string, unknown>;
    expect(d.type).toBe('POLYGON');
    expect(d.layer).toBe('BOUNDARY');
    expect((d.measurement as { areaSquareFeet: number }).areaSquareFeet).toBeCloseTo(5000, 6);
  });

  it('surfaces the C30 derivation', () => {
    // A calculated point that cannot say what it was derived from is indistinguishable from one
    // somebody typed — and that distinction is exactly what a surveyor asks the AI about when
    // checking a plat.
    useDrawingStore.setState((s) => ({
      document: {
        ...s.document,
        features: {
          ...s.document.features,
          calc: mk('calc', { type: 'POINT', point: { x: 1, y: 2 } }, 'POINT',
            stampDerivation({}, {
              method: 'CALC_POINT', inputs: { bearingDeg: 45 }, at: '2026-08-15T00:00:00.000Z',
            })),
        },
      },
    }));
    const d = ok(describeFeature.execute({ id: 'calc' })) as Record<string, unknown>;
    expect((d.derivation as { method: string }).method).toBe('CALC_POINT');
  });

  it('reports null derivation for hand-drawn geometry', () => {
    const d = ok(describeFeature.execute({ id: 'rect' })) as Record<string, unknown>;
    expect(d.derivation).toBeNull();
  });

  it('refuses a feature that does not exist', () => {
    expect(describeFeature.execute({ id: 'ghost' }).ok).toBe(false);
  });
});

describe('read-only really means read-only', () => {
  const calls: Array<[string, () => unknown]> = [
    ['measureFeature', () => measureFeature.execute({ id: 'rect' })],
    ['measureTotalArea', () => measureTotalArea.execute({ ids: ['rect'] })],
    ['describeFeature', () => describeFeature.execute({ id: 'rect' })],
  ];

  it.each(calls)('%s changes no feature', (_n, call) => {
    const before = JSON.stringify(useDrawingStore.getState().document.features);
    call();
    expect(JSON.stringify(useDrawingStore.getState().document.features)).toBe(before);
  });

  it.each(calls)('%s pushes no undo entry', (_n, call) => {
    // A measurement that showed up in the undo stack would make the surveyor press undo to get
    // back past it — the least expected failure available in this registry.
    call();
    expect(useUndoStore.getState().undoStack).toHaveLength(0);
  });
});

describe('they reach both AI paths', () => {
  it('are registered and derived into the capability list', () => {
    for (const n of ['measureFeature', 'measureTotalArea', 'describeFeature']) {
      expect(Object.keys(toolRegistry)).toContain(n);
      expect(aiCapabilities().map((c) => c.name)).toContain(n);
    }
  });

  it('say they are read-only in their descriptions', () => {
    // The model has to know it can call these freely. A measurement tool it treats as a mutation
    // is one it will ask permission for, which turns a question into a proposal.
    for (const n of ['measureFeature', 'measureTotalArea', 'describeFeature']) {
      const c = aiCapabilities().find((x) => x.name === n)!;
      expect(c.description, n).toMatch(/read-only/i);
    }
  });
});

// C35 — the MODIFY family becomes AI-callable.
//
// ── WHAT WAS MISSING ────────────────────────────────────────────────────────────────────────────
//
// Every AI tool up to here CREATED something. The AI could draw a fence and could not move it. So
// "do this to these" — the whole point of C32/C33's scope work — had nothing on the other side of
// the sentence: the scope named features and the vocabulary could only add more.
//
// ── THE TWO DECISIONS THAT RUN THROUGH ALL OF THEM ──────────────────────────────────────────────
//
// **They take ids.** The store's existing operations act on the live selection, which is the wrong
// coupling for a tool: the AI would act on whatever the surveyor happened to have highlighted at
// execution time rather than on the scope the request named — the exact drift C32 spent a slice
// removing, reintroduced one layer down.
//
// **One undo entry per call.** An AI request that moves forty features must reverse in one press
// (C37). A per-feature entry leaves the surveyor pressing undo forty times and wondering when to
// stop.

import { describe, it, expect, beforeEach } from 'vitest';

import {
  toolRegistry,
  moveFeatures,
  rotateFeatures,
  scaleFeatures,
  mirrorFeatures,
  deleteFeatures,
} from '@/lib/cad/ai/tool-registry';
import { aiCapabilities } from '@/lib/cad/ai/capabilities';
import { useDrawingStore, useUndoStore } from '@/lib/cad/store';
import { DEFAULT_FEATURE_STYLE } from '@/lib/cad/constants';
import type { Feature } from '@/lib/cad/types';

const pt = (id: string, x: number, y: number, layerId = 'L1'): Feature => ({
  id, type: 'POINT',
  geometry: { type: 'POINT', point: { x, y } },
  layerId,
  style: { ...DEFAULT_FEATURE_STYLE },
  properties: {},
});

const mkLayer = (id: string, locked = false) => ({
  id, name: id, visible: true, locked, frozen: false,
  color: '#000', lineWeight: 0.75, lineTypeId: 'SOLID', opacity: 1,
  groupId: null, sortOrder: 0, isDefault: false, isProtected: false, autoAssignCodes: [],
});

beforeEach(() => {
  useDrawingStore.setState((s) => ({
    document: {
      ...s.document,
      features: {
        a: pt('a', 0, 0),
        b: pt('b', 10, 0),
        locked: pt('locked', 5, 5, 'LK'),
      },
      layers: { L1: mkLayer('L1'), LK: mkLayer('LK', true) },
      layerOrder: ['L1', 'LK'],
    },
    activeLayerId: 'L1',
  }));
  useUndoStore.setState({ undoStack: [], redoStack: [] } as never);
});

const at = (id: string) => useDrawingStore.getState().document.features[id]?.geometry.point;

describe('moveFeatures', () => {
  it('translates every named feature', () => {
    const r = moveFeatures.execute({ ids: ['a', 'b'], dx: 3, dy: -2 });
    expect(r.ok).toBe(true);
    expect(at('a')).toEqual({ x: 3, y: -2 });
    expect(at('b')).toEqual({ x: 13, y: -2 });
  });

  it('leaves features it was not given alone', () => {
    moveFeatures.execute({ ids: ['a'], dx: 5, dy: 0 });
    expect(at('b')).toEqual({ x: 10, y: 0 });
  });

  it('refuses non-finite deltas rather than writing NaN', () => {
    expect(moveFeatures.execute({ ids: ['a'], dx: Number.NaN, dy: 0 }).ok).toBe(false);
    expect(at('a')).toEqual({ x: 0, y: 0 });
  });
});

describe('rotateFeatures', () => {
  it('rotates about an explicit pivot', () => {
    // 90° CCW about the origin takes (10, 0) to (0, 10).
    rotateFeatures.execute({ ids: ['b'], angleDeg: 90, about: { x: 0, y: 0 } });
    expect(at('b')!.x).toBeCloseTo(0, 9);
    expect(at('b')!.y).toBeCloseTo(10, 9);
  });

  it('defaults to the centroid of the set', () => {
    // a(0,0) and b(10,0) have centroid (5,0); a half turn swaps them.
    rotateFeatures.execute({ ids: ['a', 'b'], angleDeg: 180 });
    expect(at('a')!.x).toBeCloseTo(10, 9);
    expect(at('b')!.x).toBeCloseTo(0, 9);
  });

  it('is counter-clockwise for a positive angle', () => {
    // Stated because CCW-positive and CW-positive are both conventions in use, and the wrong one
    // mirrors the result about the pivot axis while every distance stays correct.
    rotateFeatures.execute({ ids: ['b'], angleDeg: 90, about: { x: 0, y: 0 } });
    expect(at('b')!.y).toBeGreaterThan(0);
  });
});

describe('scaleFeatures', () => {
  it('scales about an explicit pivot', () => {
    scaleFeatures.execute({ ids: ['b'], factor: 2, about: { x: 0, y: 0 } });
    expect(at('b')).toEqual({ x: 20, y: 0 });
  });

  it('refuses zero and negative factors', () => {
    // Zero collapses the geometry to a point; a negative mirrors it while claiming to scale.
    // Neither is what "scale by" was asked to mean, and both are recoverable only by undo.
    expect(scaleFeatures.execute({ ids: ['b'], factor: 0 }).ok).toBe(false);
    expect(scaleFeatures.execute({ ids: ['b'], factor: -1 }).ok).toBe(false);
    expect(at('b')).toEqual({ x: 10, y: 0 });
  });
});

describe('mirrorFeatures', () => {
  it('reflects across the given line', () => {
    // Mirror about the x-axis: (10, 0) is on it and stays; a point off it flips.
    useDrawingStore.setState((s) => ({
      document: { ...s.document, features: { ...s.document.features, c: pt('c', 4, 7) } },
    }));
    mirrorFeatures.execute({ ids: ['c'], axisStart: { x: 0, y: 0 }, axisEnd: { x: 1, y: 0 } });
    expect(at('c')!.x).toBeCloseTo(4, 9);
    expect(at('c')!.y).toBeCloseTo(-7, 9);
  });

  it('refuses two identical points', () => {
    // They define no line. Mirroring across them divides by zero and scatters the geometry to NaN
    // — placed nowhere, and far harder to notice than a refusal.
    const r = mirrorFeatures.execute({ ids: ['a'], axisStart: { x: 1, y: 1 }, axisEnd: { x: 1, y: 1 } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/not a line/);
  });
});

describe('deleteFeatures', () => {
  it('removes them', () => {
    expect(deleteFeatures.execute({ ids: ['a', 'b'] }).ok).toBe(true);
    expect(useDrawingStore.getState().document.features.a).toBeUndefined();
    expect(useDrawingStore.getState().document.features.b).toBeUndefined();
  });
});

describe('all-or-nothing, on purpose', () => {
  const calls: Array<[string, (ids: string[]) => { ok: boolean }]> = [
    ['moveFeatures', (ids) => moveFeatures.execute({ ids, dx: 1, dy: 1 })],
    ['rotateFeatures', (ids) => rotateFeatures.execute({ ids, angleDeg: 10 })],
    ['scaleFeatures', (ids) => scaleFeatures.execute({ ids, factor: 2 })],
    ['mirrorFeatures', (ids) => mirrorFeatures.execute({ ids, axisStart: { x: 0, y: 0 }, axisEnd: { x: 1, y: 0 } })],
    ['deleteFeatures', (ids) => deleteFeatures.execute({ ids })],
  ];

  it.each(calls)('%s refuses when ANY id is missing, and changes nothing', (_name, call) => {
    // A partial modify is the worst outcome available. Moving 38 of 40 leaves a state nobody asked
    // for, and the two that stayed behind are invisible against 38 that moved.
    expect(call(['a', 'ghost']).ok).toBe(false);
    expect(at('a')).toEqual({ x: 0, y: 0 });
    expect(useDrawingStore.getState().document.features.a).toBeDefined();
  });

  it.each(calls)('%s refuses a feature on a locked layer', (_name, call) => {
    const r = call(['locked']);
    expect(r.ok).toBe(false);
    expect(at('locked')).toEqual({ x: 5, y: 5 });
  });

  it.each(calls)('%s refuses an empty id list', (_name, call) => {
    expect(call([]).ok).toBe(false);
  });
});

describe('one undo entry per call', () => {
  it('a forty-feature move reverses in one press', () => {
    // C37's requirement, established here rather than retrofitted. A per-feature entry leaves the
    // surveyor pressing undo forty times and wondering when to stop.
    const many = Object.fromEntries(
      Array.from({ length: 40 }, (_, i) => [`m${i}`, pt(`m${i}`, i, 0)]),
    );
    useDrawingStore.setState((s) => ({
      document: { ...s.document, features: many },
    }));
    useUndoStore.setState({ undoStack: [], redoStack: [] } as never);
    moveFeatures.execute({ ids: Object.keys(many), dx: 1, dy: 0 });
    expect(useUndoStore.getState().undoStack).toHaveLength(1);
  });

  it.each(['rotateFeatures', 'scaleFeatures', 'mirrorFeatures', 'deleteFeatures'])(
    '%s also pushes exactly one',
    (name) => {
      useUndoStore.setState({ undoStack: [], redoStack: [] } as never);
      const run: Record<string, () => unknown> = {
        rotateFeatures: () => rotateFeatures.execute({ ids: ['a', 'b'], angleDeg: 10 }),
        scaleFeatures: () => scaleFeatures.execute({ ids: ['a', 'b'], factor: 2 }),
        mirrorFeatures: () => mirrorFeatures.execute({ ids: ['a', 'b'], axisStart: { x: 0, y: 0 }, axisEnd: { x: 1, y: 0 } }),
        deleteFeatures: () => deleteFeatures.execute({ ids: ['a', 'b'] }),
      };
      run[name]();
      expect(useUndoStore.getState().undoStack).toHaveLength(1);
    },
  );
});

describe('they reach both AI paths', () => {
  it('are registered', () => {
    for (const n of ['moveFeatures', 'rotateFeatures', 'scaleFeatures', 'mirrorFeatures', 'deleteFeatures']) {
      expect(Object.keys(toolRegistry)).toContain(n);
    }
  });

  it('and therefore appear in the derived capability list', () => {
    // C31 again: no prompt edit, no second registration.
    const names = aiCapabilities().map((c) => c.name);
    expect(names).toContain('moveFeatures');
    expect(names).toContain('deleteFeatures');
  });

  it('take ids, not "the selection"', () => {
    // The coupling that matters. A tool reading the live selection would act on whatever was
    // highlighted at execution time rather than on the scope the request named.
    for (const c of aiCapabilities()) {
      if (!c.name.endsWith('Features')) continue;
      expect(c.args, c.name).toContain('ids');
      expect(c.required, c.name).toContain('ids');
    }
  });
});

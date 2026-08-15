// C26 — isolate as a mode you can leave.
//
// ── WHAT ISOLATE WAS ────────────────────────────────────────────────────────────────────────────
//
// Two entry points, both a one-way destructive write:
//
//   LayerPanel "Isolate Layer"   `for (const id of layerOrder) updateLayer(id, { visible: id === target })`
//   Shift+click the eye icon      the same loop, inline
//   layer.isolateBySelection      the same, keeping the layers holding the selection
//
// None of them remembered anything. The only way out was "Show All Layers", which turns **every**
// layer on — so a surveyor who had deliberately switched three layers off, isolated the boundary to
// work on it, and then came back, silently got those three layers back too. Un-isolating did not
// restore what they had; it restored something else, with no error and no way to tell.
//
// And nothing said isolate was on. C25's blank-canvas notice already named the symptom: "an isolate
// left on from yesterday looks identical to a drawing that failed to load."
//
// ── THE TWO TRAPS ───────────────────────────────────────────────────────────────────────────────
//
// Both are invisible until a surveyor loses work to them, which is why this is a model file rather
// than three lines in a menu handler:
//
//   * re-isolating while already isolated must NOT re-snapshot, or exit restores an intermediate
//     state the surveyor never chose to keep, and their real layer state is gone for good;
//   * a layer created DURING isolate is not in the snapshot, and must be left alone rather than
//     hidden on exit.

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  planIsolate,
  planExitIsolate,
  layersAddedDuringIsolate,
  describeIsolate,
  isIsolateCurrent,
  type IsolateSession,
} from '@/lib/cad/isolate';
import { useDrawingStore } from '@/lib/cad/store';
import type { Layer } from '@/lib/cad/types';

const layer = (id: string, visible = true, name = id): Layer => ({
  id, name,
  visible, locked: false, frozen: false,
  color: '#000000', lineWeight: 0.75, lineTypeId: 'SOLID', opacity: 1,
  groupId: null, sortOrder: 0, isDefault: false, isProtected: false, autoAssignCodes: [],
});

const NOW = '2026-08-15T00:00:00.000Z';

/** A, B visible; C already switched off by the surveyor before any isolate. */
const baseLayers = (): Record<string, Layer> => ({
  A: layer('A', true), B: layer('B', true), C: layer('C', false),
});

describe('entering', () => {
  it('hides everything but the kept layers', () => {
    const plan = planIsolate(baseLayers(), ['A'], 'LAYER', null, NOW);
    expect(plan.updates).toEqual({ B: false });
    expect(plan.session.kept).toEqual(['A']);
  });

  it('snapshots what it is about to overwrite, including the already-off layer', () => {
    // C being `false` in the snapshot is the entire fix: the old exit ("Show All Layers") turned C
    // on, which the surveyor never asked for.
    const plan = planIsolate(baseLayers(), ['A'], 'LAYER', null, NOW);
    expect(plan.session.previous).toEqual({ A: true, B: true, C: false });
  });

  it('turns a kept layer back ON if it was off', () => {
    // Isolating a hidden layer and seeing nothing would be the same "did that do anything" failure
    // C16 spent a slice removing.
    expect(planIsolate(baseLayers(), ['C'], 'LAYER', null, NOW).updates)
      .toEqual({ A: false, B: false, C: true });
  });

  it('writes nothing when the state already matches', () => {
    const layers = { A: layer('A', true), B: layer('B', false) };
    expect(planIsolate(layers, ['A'], 'LAYER', null, NOW).updates).toEqual({});
  });
});

describe('re-isolating keeps the ORIGINAL snapshot', () => {
  it('so exit means "before any of this started"', () => {
    // THE trap. A naive implementation captures current visibility every time, so isolate A →
    // isolate B → exit restores the A-isolate, and the surveyor's real layer state is gone,
    // overwritten by an intermediate one they never chose to keep.
    const first = planIsolate(baseLayers(), ['A'], 'LAYER', null, NOW);

    // Now the document looks like the A-isolate.
    const isolated = { A: layer('A', true), B: layer('B', false), C: layer('C', false) };
    const second = planIsolate(isolated, ['B'], 'LAYER', first.session, '2026-08-15T01:00:00.000Z');

    expect(second.session.previous).toEqual({ A: true, B: true, C: false });
    expect(second.session.kept).toEqual(['B']);
    // And the session keeps its original start time — it is one isolate the surveyor is still in,
    // not a new one.
    expect(second.session.startedAt).toBe(NOW);
  });
});

describe('exiting restores exactly', () => {
  it('puts back every layer, including the ones that were off', () => {
    const plan = planIsolate(baseLayers(), ['A'], 'LAYER', null, NOW);
    const isolated = { A: layer('A', true), B: layer('B', false), C: layer('C', false) };
    expect(planExitIsolate(plan.session, isolated)).toEqual({ B: true });
    // C stays off, which "Show All Layers" would not have done.
    expect(planExitIsolate(plan.session, isolated).C).toBeUndefined();
  });

  it('leaves a layer created during isolate alone', () => {
    // Asymmetry of harm, the same reasoning C8 used for layer states: a layer that stays visible
    // when it arguably should not is a nuisance the surveyor can see and fix, while one that
    // vanishes on exit looks like the isolate ate their new work.
    const plan = planIsolate(baseLayers(), ['A'], 'LAYER', null, NOW);
    const withNew = {
      A: layer('A', true), B: layer('B', false), C: layer('C', false), D: layer('D', true),
    };
    expect(planExitIsolate(plan.session, withNew)).toEqual({ B: true });
    expect(layersAddedDuringIsolate(plan.session, withNew)).toEqual(['D']);
  });

  it('ignores a layer deleted during isolate', () => {
    const plan = planIsolate(baseLayers(), ['A'], 'LAYER', null, NOW);
    expect(() => planExitIsolate(plan.session, { A: layer('A', true) })).not.toThrow();
  });
});

describe('a stale session', () => {
  const session = (): IsolateSession =>
    planIsolate(baseLayers(), ['A'], 'LAYER', null, NOW).session;

  it('is current while the isolate holds', () => {
    expect(isIsolateCurrent(session(), {
      A: layer('A', true), B: layer('B', false), C: layer('C', false),
    })).toBe(true);
  });

  it('goes stale once the surveyor leaves the long way round', () => {
    // They can press "Show All Layers", or just click B's eye back on. After that the badge would
    // be lying, and its Exit button would HIDE a layer they had just chosen to show.
    expect(isIsolateCurrent(session(), {
      A: layer('A', true), B: layer('B', true), C: layer('C', true),
    })).toBe(false);
  });

  it('is not made stale by a layer created since', () => {
    expect(isIsolateCurrent(session(), {
      A: layer('A', true), B: layer('B', false), C: layer('C', false), D: layer('D', true),
    })).toBe(true);
  });
});

describe('what the badge says', () => {
  it('names the layer when exactly one is isolated', () => {
    // "Isolated" alone does not tell the surveyor what they are looking at.
    const s = planIsolate({ A: layer('A', true, 'Boundary') }, ['A'], 'LAYER', null, NOW).session;
    expect(describeIsolate(s, { A: layer('A', true, 'Boundary') })).toBe('Isolated: Boundary');
  });

  it('counts them when there are several', () => {
    const layers = baseLayers();
    const s = planIsolate(layers, ['A', 'B'], 'LAYER', null, NOW).session;
    expect(describeIsolate(s, layers)).toBe('Isolated · 2 layers');
  });

  it('says so when it came from a selection', () => {
    const layers = baseLayers();
    const s = planIsolate(layers, ['A'], 'SELECTION', null, NOW).session;
    expect(describeIsolate(s, layers)).toMatch(/by selection/);
  });

  it('survives a layer that has since been deleted', () => {
    const s = planIsolate(baseLayers(), ['A'], 'LAYER', null, NOW).session;
    expect(() => describeIsolate(s, {})).not.toThrow();
  });
});

describe('the store', () => {
  beforeEach(() => {
    useDrawingStore.setState((s) => ({
      document: { ...s.document, layers: baseLayers(), layerOrder: ['A', 'B', 'C'], isolate: null },
    }));
  });

  it('enters and exits, restoring the original', () => {
    useDrawingStore.getState().enterIsolate(['A'], 'LAYER');
    let doc = useDrawingStore.getState().document;
    expect(doc.isolate).not.toBeNull();
    expect(doc.layers.B.visible).toBe(false);

    useDrawingStore.getState().exitIsolate();
    doc = useDrawingStore.getState().document;
    expect(doc.isolate).toBeNull();
    expect(doc.layers.A.visible).toBe(true);
    expect(doc.layers.B.visible).toBe(true);
    // The whole point: C was off before, and it is off after.
    expect(doc.layers.C.visible).toBe(false);
  });

  it('survives a re-isolate', () => {
    useDrawingStore.getState().enterIsolate(['A'], 'LAYER');
    useDrawingStore.getState().enterIsolate(['B'], 'LAYER');
    useDrawingStore.getState().exitIsolate();
    const { layers } = useDrawingStore.getState().document;
    expect([layers.A.visible, layers.B.visible, layers.C.visible]).toEqual([true, true, false]);
  });

  it('exit is a no-op when not isolated', () => {
    const before = useDrawingStore.getState().document;
    useDrawingStore.getState().exitIsolate();
    expect(useDrawingStore.getState().document).toBe(before);
  });

  it('marks the drawing dirty, so the session is saved with it', () => {
    // `isolate` lives on the DOCUMENT because layer visibility does: an isolate survives a reload
    // whether or not we record it, and a snapshot that did not would leave the surveyor isolated
    // with no way back — this slice's own bug, made worse by looking fixed until they close the tab.
    useDrawingStore.setState({ isDirty: false });
    useDrawingStore.getState().enterIsolate(['A'], 'LAYER');
    expect(useDrawingStore.getState().isDirty).toBe(true);
  });

  it('writes visibility and the session in ONE set', () => {
    // A two-step version can be interrupted between them and leave a snapshot describing a state
    // the document is no longer in — worse than no snapshot, because exit would then "restore"
    // something that never existed.
    const src = readFileSync(join(process.cwd(), 'lib/cad/store/drawing-store.ts'), 'utf8');
    const fn = src.slice(src.indexOf('enterIsolate: (keep, origin)'));
    const body = fn.slice(0, fn.indexOf('exitIsolate:'));
    expect((body.match(/set\(\(state\)/g) ?? []).length).toBe(1);
  });
});

describe('every entry point goes through the mode', () => {
  const read = (p: string) =>
    readFileSync(join(process.cwd(), p), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');

  it('the layer context menu', () => {
    const panel = read('app/admin/cad/components/LayerPanel.tsx');
    expect(panel).toMatch(/enterIsolate\(\[contextMenu\.layerId\], 'LAYER'\)/);
  });

  it('Shift+click on the eye icon', () => {
    // Both gestures, because the gesture you used must not change whether you can get back.
    const panel = read('app/admin/cad/components/LayerPanel.tsx');
    expect(panel).toMatch(/enterIsolate\(\[layer\.id\], 'LAYER'\)/);
    // And neither still runs the old snapshot-less loop.
    expect(panel).not.toMatch(/updateLayer\(id, \{ visible: id === /);
  });

  it('isolate-by-selection', () => {
    const hk = read('app/admin/cad/hooks/useHotkeys.ts');
    expect(hk).toMatch(/enterIsolate\(\[\.\.\.keepLayers\], 'SELECTION'\)/);
  });
});

describe('the mode is visible while it is on', () => {
  const badge = readFileSync(
    join(process.cwd(), 'app/admin/cad/components/IsolateBadge.tsx'), 'utf8',
  ).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

  it('renders nothing when not isolated', () => {
    expect(badge).toMatch(/if \(!isolate\) return null/);
  });

  it('renders nothing once the session is stale', () => {
    expect(badge).toMatch(/if \(!isIsolateCurrent\(isolate, layers\)\) return null/);
  });

  it('offers one control to leave, wired to the restoring exit', () => {
    expect(badge).toMatch(/onClick=\{exitIsolate\}/);
  });

  it('is mounted on the canvas', () => {
    const vp = readFileSync(join(process.cwd(), 'app/admin/cad/components/CanvasViewport.tsx'), 'utf8');
    expect(vp).toMatch(/<IsolateBadge \/>/);
  });
});

describe('backward compatibility', () => {
  it('isolate is optional on the document', () => {
    // The C8 lesson again: a required field would make every drawing saved before C26 fail to load.
    const types = readFileSync(join(process.cwd(), 'lib/cad/types.ts'), 'utf8');
    expect(types).toMatch(/isolate\?:/);
  });
});

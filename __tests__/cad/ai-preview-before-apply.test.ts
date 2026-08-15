// __tests__/cad/ai-preview-before-apply.test.ts
//
// C38 — preview before apply, across the AI's whole writing reach.
//
// Two failures are pinned here, both of which were live.
//
// 1. `executeProposal` was a switch over five hand-listed tool names with no `default`. TypeScript
//    read it as exhaustive; the runtime disagreed, because `blockToProposal` casts any non-solver
//    registry tool into that union. Nine of the fourteen writing tools reached it, matched no case,
//    and fell out returning `undefined` — which the card reads as "no error" and reports as
//    applied. Accept said it worked and nothing happened.
//
// 2. The ghost preview handled a point, a line and a polyline. Everything C34–C36 added showed a
//    JSON blob and an Apply button, `deleteFeatures` included.

import { describe, it, expect, beforeEach } from 'vitest';
import {
  buildPreviewShapes,
  featureToPreviewShape,
  sampleCircle,
  sampleArc,
} from '@/lib/cad/ai/preview';
import { executeProposal, type AIProposal } from '@/lib/cad/ai/proposals';
import {
  toolRegistry,
  isProposalTool,
  isReadOnlyTool,
  READ_ONLY_TOOL_NAMES,
  SOLVER_TOOL_NAMES,
  addPoint,
} from '@/lib/cad/ai/tool-registry';
import { useDrawingStore } from '@/lib/cad/store/drawing-store';
import { useUndoStore } from '@/lib/cad/store';
import { generateId } from '@/lib/cad/types';
import type { Feature, Layer, Point2D } from '@/lib/cad/types';

function makeLayer(id: string, name: string, color = '#00ff00'): Layer {
  return {
    id,
    name,
    visible: true,
    locked: false,
    frozen: false,
    color,
    lineWeight: 0.5,
    lineTypeId: 'SOLID',
    opacity: 1,
    groupId: null,
    sortOrder: 0,
    isDefault: false,
    isProtected: false,
    autoAssignCodes: [],
  };
}

let layerId = '';

function resetStores(): void {
  useDrawingStore.getState().newDocument();
  useUndoStore.getState().clear();
  layerId = generateId();
  useDrawingStore.getState().addLayer(makeLayer(layerId, 'TEST_LAYER'));
  useDrawingStore.getState().setActiveLayer(layerId);
}

const doc = () => useDrawingStore.getState().document;
const shapes = (toolName: string, args: unknown) =>
  buildPreviewShapes(toolName, args, doc(), layerId);

function point(x: number, y: number): Feature {
  const r = addPoint.execute({ x, y });
  if (!r.ok) throw new Error(`addPoint failed: ${r.reason}`);
  return r.result;
}

function proposal(toolName: string, args: unknown): AIProposal {
  return {
    id: generateId(),
    createdAt: 0,
    toolName: toolName as AIProposal['toolName'],
    args: args as AIProposal['args'],
    description: 'test proposal',
    confidence: 0.8,
    provenance: {
      aiOrigin: `COPILOT_${toolName}`,
      aiConfidence: 0.8,
      aiPromptHash: 'test',
      aiSourcePoints: [],
      aiBatchId: 'batch-test',
    },
  };
}

beforeEach(() => {
  resetStores();
});

describe('C38 — which tools may be proposed', () => {
  it('treats every writing tool in the registry as proposable', () => {
    const writing = Object.keys(toolRegistry).filter((n) => !isReadOnlyTool(n));
    // Derived by subtraction on purpose: a tool added tomorrow is reviewable by default. The old
    // direction named the five writers explicitly, so C34–C36's nine new ones fell OUT of the type.
    expect(writing).toHaveLength(14);
    for (const n of writing) expect(isProposalTool(n)).toBe(true);
  });

  it('keeps solvers AND measurements out of the queue', () => {
    for (const n of READ_ONLY_TOOL_NAMES) expect(isProposalTool(n)).toBe(false);
    // The measurement three are the ones the old solver-only gate missed: not solvers, not writers,
    // so they became cards offering to "apply" a measurement.
    for (const n of ['measureFeature', 'measureTotalArea', 'describeFeature']) {
      expect(isReadOnlyTool(n)).toBe(true);
      expect((SOLVER_TOOL_NAMES as readonly string[]).includes(n)).toBe(false);
    }
  });

  it('accounts for every registry tool exactly once', () => {
    const all = Object.keys(toolRegistry);
    const readOnly = all.filter(isReadOnlyTool);
    const writing = all.filter(isProposalTool);
    expect(readOnly.length + writing.length).toBe(all.length);
    expect(all).toHaveLength(25);
  });
});

describe('C38 — accepting a proposal actually applies it', () => {
  it('draws a rectangle, which used to return undefined and report success', () => {
    const before = Object.keys(doc().features).length;
    const result = executeProposal(
      proposal('drawRectangle', { corner: { x: 0, y: 0 }, opposite: { x: 100, y: 50 } }),
      false,
    );
    // The old switch fell through here. `undefined` is not `{ ok: false }`, so the card's
    // `if (result && !result.ok)` check passed it as a success and logged "✓ Applied".
    expect(result).toBeDefined();
    expect(result.ok).toBe(true);
    expect(Object.keys(doc().features)).toHaveLength(before + 1);
  });

  it('applies every writing tool it is handed', () => {
    const a = point(0, 0);
    const b = point(100, 0);
    const cases: Array<[string, unknown]> = [
      ['addPoint', { x: 10, y: 10 }],
      ['drawLineBetween', { from: { x: 0, y: 0 }, to: { x: 10, y: 10 } }],
      ['drawPolylineThrough', { points: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }] }],
      ['drawRectangle', { corner: { x: 0, y: 0 }, opposite: { x: 20, y: 10 } }],
      ['drawCircle', { center: { x: 0, y: 0 }, radius: 25 }],
      ['drawArc', { start: { x: 0, y: 0 }, through: { x: 5, y: 5 }, end: { x: 10, y: 0 } }],
      ['drawText', { at: { x: 1, y: 1 }, text: 'NOTE' }],
      ['moveFeatures', { ids: [a.id], dx: 1, dy: 1 }],
      ['rotateFeatures', { ids: [a.id, b.id], angleDeg: 15 }],
      ['scaleFeatures', { ids: [a.id, b.id], factor: 2 }],
      ['mirrorFeatures', { ids: [a.id], axisStart: { x: 0, y: 0 }, axisEnd: { x: 0, y: 10 } }],
      ['deleteFeatures', { ids: [b.id] }],
    ];
    for (const [name, args] of cases) {
      const r = executeProposal(proposal(name, args), false);
      expect(r, `${name} returned nothing`).toBeDefined();
      expect(r.ok, `${name} refused: ${r.ok ? '' : r.reason}`).toBe(true);
    }
  });

  it('refuses out loud rather than silently doing nothing for a read-only tool', () => {
    const r = executeProposal(proposal('measureTotalArea', { ids: [] }), false);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.reason).toContain('measureTotalArea');
  });

  it('labels the applied proposal as one AI undo', () => {
    executeProposal(
      proposal('drawRectangle', { corner: { x: 0, y: 0 }, opposite: { x: 10, y: 10 } }),
      false,
    );
    const top = useUndoStore.getState().undoStack.slice(-1)[0];
    expect(top.aiBatchId).toBeTruthy();
  });
});

describe('C38 — the ghost shows what will happen', () => {
  it('outlines a rectangle as its four corners', () => {
    const s = shapes('drawRectangle', { corner: { x: 0, y: 0 }, opposite: { x: 100, y: 50 } });
    expect(s).toHaveLength(1);
    expect(s[0].kind).toBe('POLYGON');
    expect(s[0].vertices).toEqual([
      { x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }, { x: 0, y: 50 },
    ]);
  });

  it('samples a circle onto its own radius', () => {
    const s = shapes('drawCircle', { center: { x: 10, y: 20 }, radius: 30 });
    expect(s[0].kind).toBe('POLYGON');
    for (const v of s[0].vertices!) {
      expect(Math.hypot(v.x - 10, v.y - 20)).toBeCloseTo(30, 6);
    }
  });

  it('previews the MINOR arc, the one the tool will actually draw', () => {
    const args = { start: { x: -10, y: 0 }, through: { x: 0, y: 10 }, end: { x: 10, y: 0 } };
    const s = shapes('drawArc', args);
    expect(s[0].kind).toBe('POLYLINE');
    const verts = s[0].vertices!;
    expect(verts[0].x).toBeCloseTo(-10, 6);
    expect(verts[verts.length - 1].x).toBeCloseTo(10, 6);
    // Every sampled point is on the upper half, through the given middle point. A ghost of the
    // major arc would swing 300 feet the other way and still look like "an arc" on the card.
    for (const v of verts) expect(v.y).toBeGreaterThanOrEqual(-1e-9);
  });

  it('says nothing for an arc through collinear points, which the tool refuses', () => {
    const s = shapes('drawArc', {
      start: { x: 0, y: 0 }, through: { x: 5, y: 0 }, end: { x: 10, y: 0 },
    });
    // Ghosting a straight line here would preview geometry Apply will never produce.
    expect(s).toEqual([]);
  });

  it('paints nothing for layer-only proposals', () => {
    expect(shapes('createLayer', { name: 'NEW' })).toEqual([]);
    expect(shapes('applyLayerStyle', { layerId, style: {} })).toEqual([]);
  });

  it('colours the ghost like the layer the geometry will land on', () => {
    const other = generateId();
    useDrawingStore.getState().addLayer(makeLayer(other, 'OTHER', '#ff00ff'));
    const s = shapes('addPoint', { x: 0, y: 0, layerId: other });
    expect(s[0].color).toBe('#ff00ff');
  });
});

describe('C38 — a modify preview shows the RESULT', () => {
  it('ghosts moved features where they will END UP', () => {
    const a = point(0, 0);
    const b = point(100, 0);
    const s = shapes('moveFeatures', { ids: [a.id, b.id], dx: 10, dy: 5 });
    expect(s).toHaveLength(2);
    // Not the current positions — highlighting where the features already are answers a question
    // the surveyor did not ask.
    expect(s.map((x) => x.point)).toEqual([{ x: 10, y: 5 }, { x: 110, y: 5 }]);
    // And nothing has actually moved yet: this is a preview.
    expect(doc().features[a.id].geometry.point).toEqual({ x: 0, y: 0 });
  });

  it('rotates about the same centroid the tool will use', () => {
    const a = point(0, 0);
    const b = point(100, 0);
    const s = shapes('rotateFeatures', { ids: [a.id, b.id], angleDeg: 180 });
    // Centroid is (50, 0); a 180° turn swaps the two points.
    expect(s[0].point!.x).toBeCloseTo(100, 6);
    expect(s[1].point!.x).toBeCloseTo(0, 6);
  });

  it('scales about the same centroid the tool will use', () => {
    const a = point(0, 0);
    const b = point(100, 0);
    const s = shapes('scaleFeatures', { ids: [a.id, b.id], factor: 2 });
    expect(s[0].point!.x).toBeCloseTo(-50, 6);
    expect(s[1].point!.x).toBeCloseTo(150, 6);
  });

  it('mirrors across the given axis', () => {
    const a = point(10, 0);
    const s = shapes('mirrorFeatures', {
      ids: [a.id], axisStart: { x: 0, y: 0 }, axisEnd: { x: 0, y: 100 },
    });
    expect(s[0].point!.x).toBeCloseTo(-10, 6);
  });

  it('shows a delete as the outlines that will GO', () => {
    const a = point(0, 0);
    const b = point(50, 50);
    const s = shapes('deleteFeatures', { ids: [a.id, b.id] });
    // The most destructive proposal in the registry was the only one with no preview at all.
    expect(s).toHaveLength(2);
    expect(s.map((x) => x.point)).toEqual([{ x: 0, y: 0 }, { x: 50, y: 50 }]);
  });

  it('skips ids that are no longer on the drawing instead of throwing', () => {
    const a = point(0, 0);
    const s = shapes('moveFeatures', { ids: [a.id, 'gone-id'], dx: 1, dy: 0 });
    expect(s).toHaveLength(1);
  });

  it('refuses to ghost a degenerate transform the tool would refuse', () => {
    const a = point(0, 0);
    expect(shapes('scaleFeatures', { ids: [a.id], factor: 0 })).toEqual([]);
    expect(shapes('mirrorFeatures', {
      ids: [a.id], axisStart: { x: 0, y: 0 }, axisEnd: { x: 0, y: 0 },
    })).toEqual([]);
  });
});

describe('C38 — outlining existing geometry', () => {
  it('traces a circular polygon as a ring, not an empty vertex list', () => {
    const f: Feature = {
      id: 'c1',
      type: 'POLYGON',
      geometry: { type: 'POLYGON', vertices: [], circle: { center: { x: 0, y: 0 }, radius: 10 } },
      layerId,
      style: {} as Feature['style'],
      properties: {},
    };
    const s = featureToPreviewShape(f);
    expect(s?.kind).toBe('POLYGON');
    expect(s!.vertices!.length).toBeGreaterThan(8);
  });

  it('traces an arc along its stored sweep direction', () => {
    const cw = sampleArc({ x: 0, y: 0 }, 10, 0, Math.PI / 2, false);
    const ccw = sampleArc({ x: 0, y: 0 }, 10, 0, Math.PI / 2, true);
    // Same endpoints, opposite ways round. Reading the flag rather than inferring from which angle
    // is larger is the difference between a quarter turn and three quarters of one.
    const midCw = cw[Math.floor(cw.length / 2)];
    const midCcw = ccw[Math.floor(ccw.length / 2)];
    expect(midCcw.y).toBeGreaterThan(0);
    expect(midCw.y).toBeLessThan(0);
  });

  it('samples a circle onto the circle', () => {
    const ring: Point2D[] = sampleCircle({ x: 3, y: 4 }, 5, 8);
    expect(ring).toHaveLength(8);
    for (const v of ring) expect(Math.hypot(v.x - 3, v.y - 4)).toBeCloseTo(5, 9);
  });
});

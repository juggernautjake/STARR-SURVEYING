// __tests__/admin/cad-w11-freehand.test.ts
//
// Slice W11 — CAD free-hand pen tool. Pure helpers + source-
// locks for the new DRAW_FREEHAND tool, the toolbar entry, and
// the CanvasViewport pointer wiring.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { chaikinIteration, chaikinSmooth, decimateByMinSpacing } from '@/lib/cad/geometry/freehand';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe('decimateByMinSpacing (pure)', () => {
  it('preserves the first + last points', () => {
    const out = decimateByMinSpacing(
      [{ x: 0, y: 0 }, { x: 0.1, y: 0 }, { x: 0.2, y: 0 }, { x: 5, y: 0 }],
      1,
    );
    expect(out[0]).toEqual({ x: 0, y: 0 });
    expect(out[out.length - 1]).toEqual({ x: 5, y: 0 });
  });

  it('drops points closer than minSpacing to the last accepted vertex', () => {
    const out = decimateByMinSpacing(
      [{ x: 0, y: 0 }, { x: 0.4, y: 0 }, { x: 1.2, y: 0 }, { x: 1.3, y: 0 }, { x: 2.5, y: 0 }],
      1,
    );
    expect(out.map((p) => p.x)).toEqual([0, 1.2, 2.5]);
  });

  it('returns a copy unchanged when minSpacing is zero / negative / NaN', () => {
    const pts = [{ x: 0, y: 0 }, { x: 0.1, y: 0 }, { x: 5, y: 0 }];
    expect(decimateByMinSpacing(pts, 0)).toEqual(pts);
    expect(decimateByMinSpacing(pts, -1)).toEqual(pts);
    expect(decimateByMinSpacing(pts, Number.NaN)).toEqual(pts);
  });

  it('handles empty / single-point inputs', () => {
    expect(decimateByMinSpacing([], 1)).toEqual([]);
    expect(decimateByMinSpacing([{ x: 1, y: 2 }], 1)).toEqual([{ x: 1, y: 2 }]);
  });
});

describe('chaikinIteration (pure)', () => {
  it('keeps the first + last input vertices', () => {
    const out = chaikinIteration([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }]);
    expect(out[0]).toEqual({ x: 0, y: 0 });
    expect(out[out.length - 1]).toEqual({ x: 10, y: 10 });
  });

  it('returns the input untouched for chains shorter than 3 points', () => {
    expect(chaikinIteration([])).toEqual([]);
    expect(chaikinIteration([{ x: 1, y: 2 }])).toEqual([{ x: 1, y: 2 }]);
    expect(chaikinIteration([{ x: 1, y: 2 }, { x: 3, y: 4 }])).toEqual([{ x: 1, y: 2 }, { x: 3, y: 4 }]);
  });

  it("emits 1/4 and 3/4 corner-cut points for each interior segment", () => {
    // Two segments → 1 head + 2 (per segment 1) + 2 (per segment 2) + 1 tail = 6
    const out = chaikinIteration([{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }]);
    expect(out).toHaveLength(6);
    // Check the first segment's 1/4 + 3/4 cuts.
    expect(out[1]).toEqual({ x: 1, y: 0 });
    expect(out[2]).toEqual({ x: 3, y: 0 });
  });
});

describe('chaikinSmooth (pure)', () => {
  it('clamps iteration count to [0, 6]', () => {
    const square = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
    const zero = chaikinSmooth(square, 0);
    expect(zero).toEqual(square);
    const neg = chaikinSmooth(square, -3);
    expect(neg).toEqual(square);
  });

  it('two iterations produces a smoother (longer) chain', () => {
    const triangle = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 10 }];
    const smoothed = chaikinSmooth(triangle, 2);
    expect(smoothed.length).toBeGreaterThan(triangle.length);
    expect(smoothed[0]).toEqual({ x: 0, y: 0 });
    expect(smoothed[smoothed.length - 1]).toEqual({ x: 5, y: 10 });
  });

  it('returns an empty array for an empty input', () => {
    expect(chaikinSmooth([], 2)).toEqual([]);
  });
});

describe('ToolType + ToolState registration (W11)', () => {
  it("'DRAW_FREEHAND' is in the ToolType union", () => {
    const SRC = read('lib/cad/types.ts');
    expect(SRC).toMatch(/\| 'DRAW_FREEHAND'/);
  });

  it('ToolState declares freehandSmooth + freehandMinSpacingFt', () => {
    const SRC = read('lib/cad/types.ts');
    expect(SRC).toMatch(/freehandSmooth: boolean/);
    expect(SRC).toMatch(/freehandMinSpacingFt: number/);
  });

  it('tool-store defaults the freehand fields (smooth=false, spacing=0.5 ft)', () => {
    const SRC = read('lib/cad/store/tool-store.ts');
    expect(SRC).toMatch(/freehandSmooth: false/);
    expect(SRC).toMatch(/freehandMinSpacingFt: 0\.5/);
  });

  it('tool-store exports setFreehandSmooth + setFreehandMinSpacingFt setters', () => {
    const SRC = read('lib/cad/store/tool-store.ts');
    expect(SRC).toMatch(/setFreehandSmooth: \(v: boolean\) => void/);
    expect(SRC).toMatch(/setFreehandMinSpacingFt: \(v: number\) => void/);
  });
});

describe('ToolBar entry (W11)', () => {
  const SRC = read('app/admin/cad/components/ToolBar.tsx');

  it('imports PenTool + Sparkles icons', () => {
    expect(SRC).toMatch(/PenTool,\s*\n\s*Sparkles,/);
  });

  it("registers the DRAW_FREEHAND ToolGroupDef", () => {
    expect(SRC).toMatch(/mainTool: 'DRAW_FREEHAND'/);
  });

  it('wires the four variants (Solid / Dashed / Dotted / Smoothed)', () => {
    expect(SRC).toMatch(/Freehand — Solid/);
    expect(SRC).toMatch(/Freehand — Dashed/);
    expect(SRC).toMatch(/Freehand — Dotted/);
    expect(SRC).toMatch(/Freehand — Smoothed/);
  });

  it("Smoothed variant flips toolStore.setFreehandSmooth(true)", () => {
    expect(SRC).toMatch(/toolStore\.setFreehandSmooth\(true\)/);
  });
});

describe('CanvasViewport pointer wiring (W11)', () => {
  const SRC = read('app/admin/cad/components/CanvasViewport.tsx');

  it('imports the chaikinSmooth + decimateByMinSpacing helpers', () => {
    expect(SRC).toMatch(/import \{ chaikinSmooth, decimateByMinSpacing \} from '@\/lib\/cad\/geometry\/freehand'/);
  });

  it('declares a freehandActiveRef ref', () => {
    expect(SRC).toMatch(/freehandActiveRef = useRef<boolean>\(false\)/);
  });

  it('handleMouseDown has a DRAW_FREEHAND case that arms the drag + seeds the first point', () => {
    expect(SRC).toMatch(/case 'DRAW_FREEHAND':/);
    expect(SRC).toMatch(/freehandActiveRef\.current = true/);
  });

  it('handleMouseMove accumulates points respecting freehandMinSpacingFt', () => {
    expect(SRC).toMatch(/if \(freehandActiveRef\.current\)/);
    expect(SRC).toMatch(/ts\.freehandMinSpacingFt > 0/);
  });

  it('handleMouseUp commits a POLYLINE feature carrying the current drawStyle', () => {
    expect(SRC).toMatch(/createFeature\('POLYLINE', finalPts\)/);
    expect(SRC).toMatch(/ts\.freehandSmooth \? chaikinSmooth\(decimated, 2\) : decimated/);
  });

  it('the live preview renders the captured stroke in the current drawStyle', () => {
    expect(SRC).toMatch(/activeTool === 'DRAW_FREEHAND' && drawingPoints\.length >= 1/);
    expect(SRC).toMatch(/Slice W11 — DRAW_FREEHAND live preview/);
  });
});

// __tests__/admin/cad-w10-area-measure.test.ts
//
// Slice W10 — CAD area-measuring tool revamp. Pure helpers +
// source-locks for the sticky HUD, the snap-to-foot wiring,
// and the bigger vertex hit targets.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  snapToFootGrid,
  summarizeAreaMeasurement,
} from '@/lib/cad/geometry/area-measurement';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe('summarizeAreaMeasurement (pure)', () => {
  it('returns zero values for an empty chain', () => {
    const s = summarizeAreaMeasurement([]);
    expect(s).toEqual({
      vertexCount: 0,
      perimeterFt: 0,
      closingLegFt: 0,
      closedPerimeterFt: 0,
      area: null,
    });
  });

  it("reports a single vertex (no perimeter, no area)", () => {
    const s = summarizeAreaMeasurement([{ x: 10, y: 10 }]);
    expect(s.vertexCount).toBe(1);
    expect(s.perimeterFt).toBe(0);
    expect(s.closingLegFt).toBe(0);
    expect(s.area).toBeNull();
  });

  it('computes perimeter for an open 2-vertex chain (no area yet)', () => {
    const s = summarizeAreaMeasurement([{ x: 0, y: 0 }, { x: 3, y: 4 }]);
    expect(s.vertexCount).toBe(2);
    expect(s.perimeterFt).toBeCloseTo(5);       // 3-4-5
    expect(s.closingLegFt).toBe(0);
    expect(s.closedPerimeterFt).toBeCloseTo(5);
    expect(s.area).toBeNull();
  });

  it('computes 10×10 square: perimeter 40 ft + area 100 sq ft', () => {
    const square = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    const s = summarizeAreaMeasurement(square);
    expect(s.vertexCount).toBe(4);
    expect(s.perimeterFt).toBeCloseTo(30);             // open 3 legs
    expect(s.closingLegFt).toBeCloseTo(10);            // close-back leg
    expect(s.closedPerimeterFt).toBeCloseTo(40);       // full perimeter
    expect(s.area).not.toBeNull();
    expect(s.area!.squareFeet).toBeCloseTo(100);
    expect(s.area!.acres).toBeCloseTo(100 / 43560);
  });
});

describe('snapToFootGrid (pure)', () => {
  it('rounds to the nearest foot by default', () => {
    expect(snapToFootGrid({ x: 12.3, y: 7.6 })).toEqual({ x: 12, y: 8 });
  });

  it('uses a custom grid step when provided', () => {
    expect(snapToFootGrid({ x: 12.3, y: 17.6 }, 5)).toEqual({ x: 10, y: 20 });
  });

  it('returns the point unchanged when step is zero / negative / NaN', () => {
    const p = { x: 1.7, y: 2.9 };
    expect(snapToFootGrid(p, 0)).toBe(p);
    expect(snapToFootGrid(p, -3)).toBe(p);
    expect(snapToFootGrid(p, Number.NaN)).toBe(p);
  });
});

describe('AreaMeasureHUD source contract (W10)', () => {
  const SRC = read('app/admin/cad/components/AreaMeasureHUD.tsx');

  it('renders only when activeTool === MEASURE_AREA', () => {
    expect(SRC).toMatch(/if \(activeTool !== 'MEASURE_AREA'\) return null/);
  });

  it('exposes the three live readout testids (perimeter / sq ft / acres)', () => {
    expect(SRC).toMatch(/data-testid="area-measure-hud-perimeter"/);
    expect(SRC).toMatch(/data-testid="area-measure-hud-area-sqft"/);
    expect(SRC).toMatch(/data-testid="area-measure-hud-acres"/);
  });

  it('renders the three action buttons (undo / clear / close)', () => {
    expect(SRC).toMatch(/data-testid="area-measure-hud-undo"/);
    expect(SRC).toMatch(/data-testid="area-measure-hud-clear"/);
    expect(SRC).toMatch(/data-testid="area-measure-hud-close"/);
  });

  it("renders a 'Snap to nearest foot' toggle that fires cad:setAreaSnap", () => {
    expect(SRC).toMatch(/data-testid="area-measure-hud-snap-toggle"/);
    expect(SRC).toMatch(/new CustomEvent\('cad:setAreaSnap'/);
  });

  it('Backspace pops the last vertex while mid-measurement', () => {
    expect(SRC).toMatch(/e\.key !== 'Backspace'/);
    expect(SRC).toMatch(/popDrawingPoint\(\)/);
  });

  it('Close button writes the final readout to cad:commandOutput before clearing', () => {
    expect(SRC).toMatch(/new CustomEvent\('cad:commandOutput'/);
    expect(SRC).toMatch(/clearDrawingPoints\(\)/);
  });
});

describe('CanvasViewport snap wiring + vertex hit targets (W10)', () => {
  const SRC = read('app/admin/cad/components/CanvasViewport.tsx');

  it('declares an areaSnapStepRef ref (default 0 = disabled)', () => {
    expect(SRC).toMatch(/areaSnapStepRef\s*=\s*useRef<number>\(0\)/);
  });

  it("listens for cad:setAreaSnap and toggles the snap step", () => {
    expect(SRC).toMatch(/window\.addEventListener\('cad:setAreaSnap'/);
    expect(SRC).toMatch(/areaSnapStepRef\.current = detail\.enabled \? \(detail\.stepFt \?\? 1\) : 0/);
  });

  it('MEASURE_AREA click handler snaps when areaSnapStepRef > 0', () => {
    expect(SRC).toMatch(/const snapStep = areaSnapStepRef\.current;/);
    expect(SRC).toMatch(/Math\.round\(worldPt\.x \/ snapStep\) \* snapStep/);
    expect(SRC).toMatch(/Math\.round\(worldPt\.y \/ snapStep\) \* snapStep/);
  });

  it('vertex markers grow from 4 px to 7 px (bigger hit targets)', () => {
    expect(SRC).toMatch(/g\.drawCircle\(sp\.sx, sp\.sy, 7\)/);
    expect(SRC).toMatch(/g\.drawCircle\(cs\.sx, cs\.sy, 7\)/);
  });

  it('first vertex gets an extra emphasis ring once the polygon can close', () => {
    expect(SRC).toMatch(/First-vertex emphasis ring/);
    expect(SRC).toMatch(/drawingPoints\.length >= 3/);
  });
});

describe('CADLayout wires the HUD (W10)', () => {
  const SRC = read('app/admin/cad/CADLayout.tsx');

  it('imports AreaMeasureHUD', () => {
    expect(SRC).toMatch(/import AreaMeasureHUD from '\.\/components\/AreaMeasureHUD'/);
  });

  it('renders AreaMeasureHUD in the overlay tree', () => {
    expect(SRC).toMatch(/<AreaMeasureHUD\s*\/>/);
  });
});
